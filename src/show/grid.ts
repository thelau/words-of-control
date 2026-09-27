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
import { CHOICE_IDS, NOUL_IDS, OPTIONS, SCORE_IDS } from '../jev/appraisal.ts';
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
type Step = { t: number; dur: number; viz: Viz; full: boolean; cam: number };
type RGB = [number, number, number];
export type Grid = {
  cells: Cell[]; keys: number[];
  /** Every cell, by how much it matters (keys are the first). */
  rank: number[];
  /** The reference words the word is measured against (never visitors' words). */
  refs: string[];
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

  // the steps: 4/4 at the word's tempo, after the marked cells have held. Five bars: the marked cells merged (a bar,
  // to be read); where the words sit (cloud); their neighbours (network); a bar stripped back (the music thins to one
  // voice) on how far they stand out (ridges, for words far from all the others) or the whole table; and a last bar in
  // halves: the ground they stand on (terrain), then the answer they end on, flat (axis) — the steps lead into where
  // they stand. The downbeats of bars two and five burst to the full frame (and of bar four, for an intense word).
  const bpm = Math.round(lerp(92, 150, clamp01(aro * 0.5 + A.s.energy * 0.3 + A.s.tension * 0.2)) - 14 * A.lazy);
  const beat = 60 / bpm;
  const seq = select + 0.9 + 2;
  const zMean = keys.reduce((a, k) => a + cells[k].z, 0) / keys.length;
  const bars: Viz[] = ['tiles', 'cloud', 'network', zMean > 2.5 ? 'ridges' : 'table'];
  const steps: Step[] = [];
  let t = seq;
  for (let b = 0; b < 20; b++) {
    for (const half of b >= 16 ? [0, 1] : [0]) {
      const dur = b >= 16 ? beat / 2 : beat;
      const viz: Viz = b < 16 ? bars[Math.floor(b / 4)] : b < 18 ? 'terrain' : 'axis';
      const full = half === 0 && (b === 4 || b === 16 || (b === 12 && A.s.intensity > 0.6));
      steps.push({ t, dur, viz, full, cam: rand() });
      t += dur;
    }
  }
  // then where the words stand: the slow ending, built name by name (show/notes.ts), long enough to be read
  steps.push({ t, dur: Math.max(10, 16 * beat), viz: 'stand', full: false, cam: 0 });
  t += steps[steps.length - 1].dur;
  // where it stands: the marked answer that sets it most apart — among those a person would say (not a category slot
  // like who, act or kind)
  const stand = keys.find((k) => !CATEGORY.has(cells[k].id)) ?? keys[0];
  const g: Grid = { cells, keys, rank, refs: words, colours, mark, select, seq, end: t, bpm, beat, steps, stand, flashes: strobes(A, 20), onsets: onsets(A, steps, beat) };
  GRIDS.set(A, g);
  return g;
}

/** Named colours of the `colour` question, linear RGB. */
const COLOURS: Record<string, RGB> = {
  black: [0.02, 0.02, 0.02], white: [0.9, 0.88, 0.85], grey: [0.35, 0.35, 0.36], red: [0.9, 0.03, 0.02], orange: [1, 0.3, 0.04],
  yellow: [1, 0.72, 0.12], green: [0.12, 0.6, 0.18], blue: [0.05, 0.25, 0.95], violet: [0.35, 0.1, 0.8], pink: [1, 0.35, 0.5],
  brown: [0.45, 0.2, 0.07],
};

/** The house's accent (orange-red, linear RGB). */
const ACCENT: RGB = [1, 0.1, 0.025];
const NEUTRAL = new Set(['white', 'grey', 'black']);

function keyColours(A: Appraisal, n: number): RGB[] {
  // one hue: the word's own colour (Jev's colour answer, most likely first), deeper for each answer that stands out
  // less; a word seen as white, grey or black takes the house's accent (it would vanish among the white points)
  const top = Object.entries(A.c.colour.p).sort((a, b) => b[1] - a[1])[0][0];
  const c = NEUTRAL.has(top) ? ACCENT : COLOURS[top];
  return Array.from({ length: n }, (_, i) => c.map((x) => x * (1 - (0.55 * i) / Math.max(1, n - 1))) as RGB);
}

/** k onsets spread evenly over n steps (Bjorklund's rhythm), rotated by r. */
export const euclid = (k: number, n: number, r = 0) => Array.from({ length: n }, (_, i) => { const j = (i + r) % n; return Math.floor(((j + 1) * k) / n) - Math.floor((j * k) / n) === 1; });

/** The sequencer's two voices' patterns over a bar of 16ths (audio/render.ts plays them; the ring shows them). */
export const patterns = (A: Appraisal) => ({ a: euclid(7 + Math.round(4 * A.s.arousal), 16), b: euclid(5 + Math.round(3 * A.s.arousal), 16, 3) });

/** When each voice sounds a note during the steps (the ring lights a cell on each): voice 0 from the first bar, voice 1
 *  from the second but not in the stripped fourth, nor for a negative word (no tune). */
function onsets(A: Appraisal, steps: Step[], beat: number): { t: number; v: 0 | 1 }[] {
  const pat = patterns(A), sixteenth = beat / 4, out: { t: number; v: 0 | 1 }[] = [];
  let n16 = 0;
  for (const st of steps) {
    if (st.viz === 'stand') continue;
    for (let i = 0; i < Math.round(st.dur / sixteenth); i++, n16++) {
      const t = st.t + i * sixteenth, bar = Math.floor(n16 / 16);
      if (pat.a[n16 % 16]) out.push({ t, v: 0 });
      if (A.mood.neg <= 0.6 && bar >= 1 && bar !== 3 && pat.b[n16 % 16]) out.push({ t, v: 1 });
    }
  }
  return out;
}

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
