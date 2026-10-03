/**
 * The grid: the verdict, image and sound from this one score.
 *   fill    — every measurement is a cell of a flat grid (9 × 5); each result arrives in its cell: its name, its
 *             value, a small live figure of it (a score a sine, a choice its bars, a yes/no a field of dots)
 *   mark    — the cells that matter take the word's own colours (Jev's colour answer), one by one
 *   select  — every other cell goes out, staccato; the marked ones stay where they were
 *   steps   — cut: the marked cells as one block on the stage at the centre (7 × 3 cells), then a 4/4 at the word's
 *             tempo: a 3D space of the data per bar, chosen by the data (show/space.ts), the camera cutting on each
 *             beat, a few beats bursting to the full frame; the last bar in halves; then a bar held on where the word
 *             stands: the answer that sets it most apart, placed among the reference words (show/notes.ts)
 *   black   — on the last step's end
 * "What matters": how rare an answer is among the piece's reference words (lexicon.json, never visitors' words) — the
 * share of them at least as far out — if the machine is sure enough of it. Times are seconds from the verdict's start.
 */
import type { Appraisal } from '../jev/appraisal.ts';
import { CHOICE_IDS, NOUL_IDS, OPTIONS, plain, SCORE_IDS } from '../jev/appraisal.ts';
import { mulberry32 } from '../core/rng.ts';
import lexicon from '../jev/lexicon.json';

type Ref = { s: Record<string, number>; n: Record<string, number>; c: Record<string, Record<string, number>> };
const LEX = lexicon as Record<string, Ref>;

export const COLS = 9, ROWS = 5;
const DIMS = [...SCORE_IDS.map((id) => [id, 0] as const), ...CHOICE_IDS.map((id) => [id, 1] as const), ...NOUL_IDS.map((id) => [id, 2] as const)];
/** The label atlas (gpu.ts): every measurement's name, then every choice's options. */
export const LABELS = [...DIMS.map(([id]) => id), ...CHOICE_IDS.flatMap((id) => OPTIONS[id])];
const OPT0 = Object.fromEntries(CHOICE_IDS.map((id) => [id, DIMS.length + CHOICE_IDS.slice(0, CHOICE_IDS.indexOf(id)).reduce((a, x) => a + OPTIONS[x].length, 0)]));

/** The 3D spaces of the data a step can show (show/space.ts). */
export const SPACES = ['cloud', 'network', 'terrain', 'axis', 'table', 'ridges'] as const;
/** What a step shows: the marked cells merged (tiles, grid.wgsl), where the word stands (stand, show/notes.ts), or a
 *  space. */
export const VIZ = ['tiles', 'stand', ...SPACES] as const;
export type Viz = (typeof VIZ)[number];

export type Cell = {
  id: string; kind: 0 | 1 | 2; value: number; conf: number;
  /** How far from the reference words, in their spread (|σ|); how rare among them (bits: 1 = half as far out, 5 = 1 in 32). */
  z: number; rare: number;
  /** Its label (index into LABELS); a choice's top option and its option probabilities. */
  label: number; opt: number; probs: number[];
  /** The same measurement for each reference word (lexicon.json, in the order of Grid.refs). */
  lex: number[];
  arrive: number; vanish: number; key: number; markAt: number;
};
/** A step: what it shows, whether it fills the frame, and its camera (a seed: every step is a new angle). */
type Step = { t: number; dur: number; viz: Viz; full: boolean; cam: number; bar: number; strip: boolean };
type RGB = [number, number, number];
export type Grid = {
  cells: Cell[]; keys: number[];
  /** Every cell, by how much it matters (keys are the first). */
  rank: number[];
  /** The reference words the words are measured against (never visitors' words), how many there are in all, and
   *  whether the typed words are themselves one of them (left out of their own norm). */
  refs: string[]; total: number; member: boolean;
  /** The reference words by nearness on all the answers, nearest first (their own family left out). */
  near: number[];
  /** Jev reads them as nonsense: nothing is marked, no steps. */
  nonsense: boolean;
  /** Each marked cell's colour (linear RGB): the word's own colours, as Jev sees them, most likely first. */
  colours: RGB[];
  mark: number; select: number; seq: number; end: number;
  bpm: number; beat: number; steps: Step[];
  /** The cell the performance ends on: where the word stands. */
  stand: number;
  /** The beats (from the steps' start) that strobe. */
  flashes: number[];
  /** When each sequencer voice sounds a note (the ring's playheads). */
  onsets: { t: number; v: 0 | 1 }[];
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const GRIDS = new WeakMap<Appraisal, Grid>(); // one score per appraisal (image and sound both ask)

export function grid(A: Appraisal): Grid {
  const hit = GRIDS.get(A);
  if (hit) return hit;
  const rand = mulberry32(A.seed ^ 0x9e3779b9);
  const text = new TextDecoder().decode(A.bytes).trim().toLowerCase();
  const words = Object.keys(LEX).filter((w) => w !== text);
  const aro = A.s.arousal;

  const cells: Cell[] = DIMS.map(([id, kind], k) => {
    const value = kind === 0 ? A.s[id] : kind === 1 ? A.c[id].p[A.c[id].top] ?? 0 : A.n[id];
    const lex = words.map((w) => (kind === 0 ? LEX[w].s[id] ?? 0.5 : kind === 1 ? LEX[w].c[id]?.[A.c[id].top] ?? 0 : LEX[w].n[id] ?? 0));
    const m = lex.reduce((a, b) => a + b, 0) / lex.length;
    const sd = Math.sqrt(lex.reduce((a, b) => a + (b - m) ** 2, 0) / lex.length) + 0.05;
    // how rare: the share of reference words at least as far out on the same side (ties count), as surprise (bits) —
    // the same measure for a score and a choice (a choice's confidence would otherwise always look extreme)
    const up = value >= m, beyond = lex.filter((v) => (up ? v >= value - 1e-6 : v <= value + 1e-6)).length;
    const rare = -Math.log2((beyond + 1) / (lex.length + 1));
    return {
      id, kind, value, conf: A.k[id] ?? 1, z: Math.abs(value - m) / sd, rare, label: k,
      opt: kind === 1 ? OPT0[id] + OPTIONS[id].indexOf(A.c[id].top) : -1,
      probs: kind === 1 ? OPTIONS[id].map((o) => A.c[id].p[o] ?? 0) : [], lex,
      arrive: 0, vanish: Infinity, key: -1, markAt: Infinity,
    };
  });

  // fill: the grid draws itself, then the results come in, faster and faster (a charged word, faster still)
  const fill = lerp(3.8, 2.8, aro); // (long enough for the results' tones to play as a phrase)
  const order = cells.map((_, k) => k).sort(() => rand() - 0.5);
  order.forEach((k, i) => (cells[k].arrive = 0.35 + (fill - 0.35) * Math.pow(i / cells.length, 0.75) + rand() * 0.04));

  // what matters: rare among the reference words, and sure enough
  const rel = cells.map((c) => c.rare * (c.conf >= 0.45 ? c.conf : 0));
  const nKeys = 4 + Math.round(3 * clamp01(A.s.intensity * 0.6 + aro * 0.4));
  const rank = cells.map((_, k) => k).sort((a, b) => rel[b] - rel[a]);
  // (a category slot — who, act, kind… — never leads: it goes after the answers a person would say)
  const keys = rank.slice(0, nKeys).sort((a, b) => Number(CATEGORY.has(cells[a].id)) - Number(CATEGORY.has(cells[b].id)));
  const mark = fill + 0.3;
  keys.forEach((k, r) => { cells[k].key = r; cells[k].markAt = mark + (r * 0.5) / keys.length; });
  const select = mark + 0.65;
  const out = cells.map((_, k) => k).filter((k) => cells[k].key < 0).sort(() => rand() - 0.5);
  out.forEach((k, i) => (cells[k].vanish = select + 0.9 * Math.pow(i / out.length, 0.85)));
  const colours = keyColours(A, keys.length);

  // how unusual the words are, overall: the mean rarity of what matters (bits); how far beyond every reference word
  // they go on one answer; their nearest reference words on all the answers (each answer's gap in its own spread) —
  // leaving out their own family (a reference entry sharing one of their words: "love" is not "near" "i love you")
  const unusual = keys.reduce((a, k) => a + cells[k].rare, 0) / keys.length;
  const beyondAll = Math.max(...keys.map((k) => cells[k].rare)) >= Math.log2(words.length + 1) - 0.6;
  const spread = cells.map((c) => Math.max(0.05, Math.max(...c.lex) - Math.min(...c.lex)));
  const gapTo = (j: number) => cells.reduce((a, c, k) => a + ((c.value - (c.lex[j] ?? 0)) / spread[k]) ** 2, 0) / cells.length;
  const own = content(text);
  const near = words.map((_, j) => j).filter((j) => !content(words[j]).some((x) => own.some((y) => x.includes(y) || y.includes(x)))).sort((a, b) => gapTo(a) - gapTo(b));
  const nonsense = (A.c.act.p.nonsense ?? 0) > 0.5 || (A.c.kind.p.nonsense ?? 0) > 0.5;

  // the steps: 4/4 at the words' tempo, after the marked cells have held. The marked cells merged (a bar, to be read),
  // then as many bars of 3D space as the words earn — one for ordinary words, up to four for unusual ones — opening on
  // what is most striking about them (ridges: beyond every reference word on an answer; network: a close neighbour;
  // cloud: lost in the crowd; terrain: a place; else the whole table), the rest in an order of their own; the bar before the last
  // stripped back (the music thins to one voice) when there are three or more; the last bar in halves, ending on the
  // answer they end on, flat (axis). Downbeats burst to the full frame by chance, more for an intense word. Nonsense
  // gets no steps: the grid fills, nothing is marked, and the ending says so.
  const bpm = Math.round(lerp(92, 150, clamp01(aro * 0.5 + A.s.energy * 0.3 + A.s.tension * 0.2)) - 14 * A.lazy);
  const beat = 60 / bpm;
  const seq = nonsense ? select + 0.6 : select + 0.9 + 2;
  const nBars = nonsense ? 0 : unusual < UNUSUAL[0] ? 1 : unusual < UNUSUAL[1] ? 2 : unusual < UNUSUAL[2] ? 3 : 4;
  const first: Viz = beyondAll ? 'ridges' : gapTo(near[0]) < 0.05 ? 'network' : unusual < UNUSUAL[0] ? 'cloud' : (A.c.kind.p.place ?? 0) > 0.4 ? 'terrain' : 'table';
  const rest = (['cloud', 'network', 'ridges', 'table', 'terrain'] as Viz[]).filter((v) => v !== first).sort(() => rand() - 0.5);
  const spaces = [first, ...rest].slice(0, nBars);
  const steps: Step[] = [];
  let t = seq, bar = 0;
  const push = (viz: Viz, dur: number, full: boolean, strip: boolean) => { steps.push({ t, dur, viz, full, cam: rand(), bar, strip }); t += dur; };
  if (!nonsense) {
    for (let i = 0; i < 4; i++) push('tiles', beat, false, false);
    spaces.forEach((viz, i) => {
      bar++;
      const last = i === spaces.length - 1, strip = spaces.length >= 3 && i === spaces.length - 2;
      const full = !strip && rand() < 0.3 + 0.4 * A.s.intensity;
      if (last) for (let h = 0; h < 8; h++) push(h < 4 ? viz : 'axis', beat / 2, full && h === 0, false);
      else for (let b = 0; b < 4; b++) push(viz, beat, full && b === 0, strip);
    });
  }
  // then where the words stand: the slow ending, built name by name (show/notes.ts), long enough to be read
  bar++;
  push('stand', nonsense ? 4 : Math.max(12, 16 * beat), false, false);
  // where they stand: the marked answer that sets them most apart — one a person would say (not a category slot like
  // who, act or kind), and not a mere echo of the words themselves ("love" does not end on LOVE)
  const said = (k: number) => (cells[k].kind === 1 ? LABELS[cells[k].opt] : plain(cells[k].id, cells[k].value)).toLowerCase();
  const echo = (k: number) => own.some((y) => said(k).includes(y)) || content(said(k)).some((x) => text.includes(x));
  const stand = keys.find((k) => !CATEGORY.has(cells[k].id) && !echo(k)) ?? keys.find((k) => !CATEGORY.has(cells[k].id)) ?? keys[0];
  if (nonsense) for (const c of cells) { c.markAt = Infinity; c.vanish = Math.min(c.vanish, select + 0.5 * rand()); }
  const g: Grid = {
    cells, keys, rank, refs: words, total: Object.keys(LEX).length, member: words.length < Object.keys(LEX).length,
    near, nonsense, colours, mark, select, seq, end: t, bpm, beat, steps, stand,
    flashes: strobes(A, Math.round((t - seq) / beat)), onsets: onsets(A, steps, beat),
  };
  GRIDS.set(A, g);
  return g;
}

/** Named colours of the `colour` question, linear RGB. */
const COLOURS: Record<string, RGB> = {
  black: [0.02, 0.02, 0.02], white: [0.9, 0.88, 0.85], grey: [0.35, 0.35, 0.36], red: [0.9, 0.03, 0.02], orange: [1, 0.3, 0.04],
  yellow: [1, 0.72, 0.12], green: [0.12, 0.6, 0.18], blue: [0.05, 0.25, 0.95], violet: [0.35, 0.1, 0.8], pink: [1, 0.35, 0.5],
  brown: [0.45, 0.2, 0.07],
};

const NEUTRAL = new Set(['white', 'grey', 'black']);
/** The colour of a matter, for a word Jev sees as white, grey or black (linear RGB). */
const MATTER: Record<string, RGB> = {
  fire: [1, 0.3, 0.04], water: [0.05, 0.35, 0.9], ice: [0.55, 0.8, 1], metal: [0.45, 0.55, 0.72], wood: [0.55, 0.28, 0.1],
  flesh: [1, 0.4, 0.45], stone: [0.62, 0.56, 0.46], sand: [0.85, 0.65, 0.3], light: [1, 0.85, 0.4], smoke: [0.6, 0.6, 0.66],
  cloth: [0.75, 0.55, 0.62], glass: [0.6, 0.9, 0.85],
};
/** A colourless word: white and grey. */
const COLOURLESS: RGB = [0.85, 0.85, 0.85];

/** The words' colour: Jev's colour answer, blended toward its second colour when that one is strong (love and war do
 *  not share one red); a word seen as white, grey or black takes its second colour, else its matter's; a word with
 *  neither (void, silence) stays colourless — white and grey. */
function wordColour(A: Appraisal): RGB {
  const ranked = Object.entries(A.c.colour.p).sort((a, b) => b[1] - a[1]);
  const [top, p1] = ranked[0];
  const second = ranked.find(([k, p], i) => i > 0 && !NEUTRAL.has(k) && p >= 0.15);
  if (!NEUTRAL.has(top)) {
    const c = COLOURS[top];
    if (!second) return c;
    const w = (0.8 * second[1]) / (p1 + second[1]);
    return c.map((x, i) => x + (COLOURS[second[0]][i] - x) * w) as RGB;
  }
  if (second) return COLOURS[second[0]];
  return MATTER[A.c.material.top] ?? COLOURLESS;
}

function keyColours(A: Appraisal, n: number): RGB[] {
  // one hue, deeper for each answer that stands out less
  const c = wordColour(A);
  return Array.from({ length: n }, (_, i) => c.map((x) => x * (1 - (0.55 * i) / Math.max(1, n - 1))) as RGB);
}

/** k onsets spread evenly over n steps (Bjorklund's rhythm), rotated by r. */
export const euclid = (k: number, n: number, r = 0) => Array.from({ length: n }, (_, i) => { const j = (i + r) % n; return Math.floor(((j + 1) * k) / n) - Math.floor((j * k) / n) === 1; });

/** The sequencer's two voices' patterns over a bar of 16ths (audio/render.ts plays them; the ring shows them). */
export const patterns = (A: Appraisal) => ({ a: euclid(7 + Math.round(4 * A.s.arousal), 16), b: euclid(5 + Math.round(3 * A.s.arousal), 16, 3) });

/** When each voice sounds a note during the steps (the ring lights a cell on each): voice 0 from the first bar, voice 1
 *  from the second but not in the stripped bar, nor for a negative word (no tune). */
function onsets(A: Appraisal, steps: Step[], beat: number): { t: number; v: 0 | 1 }[] {
  const pat = patterns(A), sixteenth = beat / 4, out: { t: number; v: 0 | 1 }[] = [];
  let n16 = 0;
  for (const st of steps) {
    if (st.viz === 'stand') continue;
    for (let i = 0; i < Math.round(st.dur / sixteenth); i++, n16++) {
      const t = st.t + i * sixteenth;
      if (pat.a[n16 % 16]) out.push({ t, v: 0 });
      if (A.mood.neg <= 0.6 && st.bar >= 1 && !st.strip && pat.b[n16 % 16]) out.push({ t, v: 1 });
    }
  }
  return out;
}

/** Where "how unusual" (mean rarity of what matters, bits) earns a second, third and fourth bar of steps — set at the
 *  quartiles over the recorded test words. */
const UNUSUAL = [5.3, 6.0, 6.75];

const STOP = new Set(['the', 'and', 'you', 'was', 'are', 'for', 'not', 'but', 'with', 'this', 'that', 'have', 'has', 'will', 'all', 'his', 'her', 'she', 'him', 'they', 'them', 'our', 'your', 'its', 'who', 'what', 'were', 'been', 'from', 'can', 'just', 'never', 'again', 'too', 'very', 'don\'t', 'i\'m', 'it\'s']);
/** A text's content words (three letters or more, not the little words), for finding its family among the references. */
const content = (t: string) => t.toLowerCase().split(/[^\p{L}']+/u).filter((w) => w.length >= 3 && !STOP.has(w));

/** Answers that are category slots, not something a person would say of a word: never where it ends. */
const CATEGORY = new Set(['who', 'act', 'kind', 'time', 'daytime', 'sense', 'rhythm', 'domain']);

/** The beats that strobe — safely: only a word more than half negative, never two beats running (at most 2 flashes a
 *  second at the fastest tempo: photosensitive safety asks for fewer than 3), as often as it is negative and aroused. */
function strobes(A: Appraisal, beats: number): number[] {
  const p = Math.max(0, A.mood.neg - 0.5) * 2 * (0.3 + 0.7 * A.s.arousal);
  const out: number[] = [];
  let prev = false;
  for (let k = 1; k < beats; k++) {
    prev = !prev && (((k + 1) * 2654435761) >>> 0) / 4294967296 < p;
    if (prev) out.push(k);
  }
  return out;
}

/** A measurement as it is written in the captions: its name, and a choice's answer ("texture: cracked"). */
export function name(g: Grid, k: number): string {
  const c = g.cells[k];
  return c.kind === 1 ? `${c.id}: ${LABELS[c.opt]}` : c.id;
}

/** The cells of the grid's ring, round the stage (the small multiples, in this order). */
export const RING = [0, 1, 2, 3, 4, 5, 6, 7, 8, 17, 26, 35, 44, 43, 42, 41, 40, 39, 38, 37, 36, 27, 18, 9];

/** Where the grid stands on a w × h (device px) screen: its top-left corner and its cell size, a margin all round. */
export function layout(w: number, h: number) {
  const m = 0.05 * Math.min(w, h);
  const cs = Math.floor(Math.min((w - 2 * m) / COLS, (h - 2 * m) / ROWS));
  return { x: Math.floor((w - COLS * cs) / 2), y: Math.floor((h - ROWS * cs) / 2), cs };
}

/** The stage at the centre (7 × 3 cells, landscape), px: where the steps play. */
export function stage(w: number, h: number): [number, number, number, number] {
  const L = layout(w, h);
  return [L.x + L.cs, L.y + L.cs, 7 * L.cs, 3 * L.cs];
}

/** The marked cells merged: a tile each on the stage (unit rect: x, y, w, h), in rows fitted to its 7 : 3 shape. */
function tiles(z: number[]): Float32Array {
  const K = z.length, nr = Math.max(1, Math.round(Math.sqrt(K / (7 / 3)))), nc = Math.ceil(K / nr);
  const out = new Float32Array(32);
  for (let row = 0; row < nr; row++) {
    // (in each row, a tile as wide as how far its answer stands out)
    const ids = Array.from({ length: Math.min(nc, K - row * nc) }, (_, c) => row * nc + c);
    const sum = ids.reduce((a, i) => a + Math.min(5, z[i]) + 0.5, 0);
    let x = 0;
    for (const i of ids) { const w = (Math.min(5, z[i]) + 0.5) / sum; out.set([x, row / nr, w, 1 / nr], i * 4); x += w; }
  }
  return out;
}

const CELL = 12, KEY_MAX = 8, KEY = 12, BYTE_MAX = 256, BINS = 128;
/** The score as the shader's buffer (grid.wgsl): a header (cells, keys, steps' start, reference words), then per cell
 *  (value, conf, kind, arrive, vanish, key, label, opt, 0, markAt, |z|, z: how far it stands from the reference words,
 *  in their spread), then per key (cell, value, colour, its tile on the stage, 0 ×3), then the words' bytes (their
 *  count, then each), then per cell the reference words' values as a histogram of BINS bins over 0…1 (how many
 *  reference words gave each value: the strip every cell draws). The step on screen is a uniform (main.ts). */
export function pack(A: Appraisal, g: Grid): Float32Array {
  const n = g.cells.length;
  const k0 = 16 + n * CELL, b0 = k0 + KEY_MAX * KEY, h0 = b0 + 1 + BYTE_MAX;
  const out = new Float32Array(h0 + n * BINS);
  out.set([n, g.keys.length, g.seq, g.refs.length], 0);
  g.cells.forEach((c, k) => {
    const mean = c.lex.reduce((a, b) => a + b, 0) / c.lex.length;
    const sd = Math.sqrt(c.lex.reduce((a, b) => a + (b - mean) ** 2, 0) / c.lex.length) + 0.05;
    out.set([c.value, c.conf, c.kind, c.arrive, Math.min(c.vanish, 1e4), c.key, c.label, c.opt, 0, Math.min(c.markAt, 1e4), c.z, Math.max(-4.9, Math.min(4.9, (c.value - mean) / sd))], 16 + k * CELL);
    for (const v of c.lex) out[h0 + k * BINS + Math.min(BINS - 1, Math.floor(Math.max(0, v) * BINS))] += 1;
  });
  const T = tiles(g.keys.map((k) => g.cells[k].z));
  g.keys.slice(0, KEY_MAX).forEach((k, i) => out.set([k, g.cells[k].value, ...g.colours[i], ...T.subarray(i * 4, i * 4 + 4)], k0 + i * KEY));
  const bytes = A.bytes.slice(0, BYTE_MAX);
  out[b0] = bytes.length;
  out.set(bytes, b0 + 1);
  return out;
}
