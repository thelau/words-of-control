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
 * "What matters": how far an answer stands from the piece's reference words (lexicon.json, never visitors' words),
 * if the machine is sure enough of it. Times are seconds from the verdict's start.
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
export const SPACES = ['cloud', 'network', 'terrain', 'map', 'axis', 'table', 'ridges'] as const;
/** What a step shows: the marked cells merged (tiles, grid.wgsl), where the word stands (stand, show/notes.ts), or a
 *  space. */
export const VIZ = ['tiles', 'stand', ...SPACES] as const;
export type Viz = (typeof VIZ)[number];

export type Cell = {
  id: string; kind: 0 | 1 | 2; value: number; conf: number; z: number;
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
    return {
      id, kind, value, conf: A.k[id] ?? 1, z: Math.abs(value - m) / sd, label: k,
      opt: kind === 1 ? OPT0[id] + OPTIONS[id].indexOf(A.c[id].top) : -1,
      probs: kind === 1 ? OPTIONS[id].map((o) => A.c[id].p[o] ?? 0) : [], lex,
      arrive: 0, vanish: Infinity, key: -1, markAt: Infinity,
    };
  });

  // fill: the grid draws itself, then the results come in, faster and faster (a charged word, faster still)
  const fill = lerp(2.6, 1.7, aro);
  const order = cells.map((_, k) => k).sort(() => rand() - 0.5);
  order.forEach((k, i) => (cells[k].arrive = 0.35 + (fill - 0.35) * Math.pow(i / cells.length, 0.75) + rand() * 0.04));

  // what matters: far from the reference words, and sure enough
  const rel = cells.map((c) => c.z * (c.conf >= 0.45 ? c.conf : 0));
  const nKeys = 4 + Math.round(3 * clamp01(A.s.intensity * 0.6 + aro * 0.4));
  const rank = cells.map((_, k) => k).sort((a, b) => rel[b] - rel[a]);
  const keys = rank.slice(0, nKeys);
  const mark = fill + 0.3;
  keys.forEach((k, r) => { cells[k].key = r; cells[k].markAt = mark + (r * 0.5) / keys.length; });
  const select = mark + 0.65;
  const out = cells.map((_, k) => k).filter((k) => cells[k].key < 0).sort(() => rand() - 0.5);
  out.forEach((k, i) => (cells[k].vanish = select + 0.9 * Math.pow(i / out.length, 0.85)));
  const colours = keyColours(A, keys.length);

  // the steps: 4/4 at the word's tempo, cut in after the marked cells have held a moment. A space holds a whole bar
  // (the camera cuts on each beat), chosen by what the data says: where the word sits (cloud), its neighbours
  // (network), how far it stands out (ridges, for a word far from all the others) or the whole table, then the
  // ground it stands on (terrain where the words crowd round it, a contour map where it stands alone), and in the
  // last bar, in halves, the answer it ends on (axis): the steps lead into where it stands. The downbeats of bars two and four burst to the full frame
  // (and of bar three, for an intense word).
  const bpm = Math.round(lerp(92, 150, clamp01(aro * 0.5 + A.s.energy * 0.3 + A.s.tension * 0.2)) - 14 * A.lazy);
  const beat = 60 / bpm;
  const seq = select + 0.9 + 1.1;
  const zMean = keys.reduce((a, k) => a + cells[k].z, 0) / keys.length;
  const [ka, kb] = [cells[keys[0]], cells[keys[1] ?? keys[0]]];
  const crowd = words.filter((_, j) => Math.hypot(ka.lex[j] - ka.value, kb.lex[j] - kb.value) < 0.15).length;
  const plan: Viz[] = ['cloud', 'network', zMean > 2.5 ? 'ridges' : 'table', crowd >= 4 ? 'terrain' : 'map'];
  const steps: Step[] = [];
  let t = seq;
  for (let b = 0; b < 16; b++) {
    for (const half of b >= 12 ? [0, 1] : [0]) {
      const dur = b >= 12 ? beat / 2 : beat;
      const viz: Viz = b === 0 ? 'tiles' : b >= 14 ? 'axis' : plan[Math.floor(b / 4)];
      const full = half === 0 && (b === 4 || b === 12 || (b === 8 && A.s.intensity > 0.6));
      steps.push({ t, dur, viz, full, cam: rand() });
      t += dur;
    }
  }
  // then a bar held on where the word stands (long enough to read)
  steps.push({ t, dur: Math.max(3.2, 4 * beat), viz: 'stand', full: false, cam: 0 });
  t += steps[steps.length - 1].dur;
  // where it stands: the marked answer that sets it most apart — among those a person would say (not a category slot
  // like who, act or kind)
  const stand = keys.find((k) => !CATEGORY.has(cells[k].id)) ?? keys[0];
  const g: Grid = { cells, keys, rank, refs: words, colours, mark, select, seq, end: t, bpm, beat, steps, stand, flashes: strobes(A, 16) };
  GRIDS.set(A, g);
  return g;
}

/** The word's colours (probability ≥ 8%, at most four; a neutral one becomes pearl, steel or ink), then deeper
 *  shades of them for the rest (saturated, never pastel). */
/** Named colours of the `colour` question, linear RGB. */
const COLOURS: Record<string, RGB> = {
  black: [0.02, 0.02, 0.02], white: [0.9, 0.88, 0.85], grey: [0.35, 0.35, 0.36], red: [0.9, 0.03, 0.02], orange: [1, 0.3, 0.04],
  yellow: [1, 0.72, 0.12], green: [0.12, 0.6, 0.18], blue: [0.05, 0.25, 0.95], violet: [0.35, 0.1, 0.8], pink: [1, 0.35, 0.5],
  brown: [0.45, 0.2, 0.07],
};

/** The house's accent (orange-red, linear RGB). */
const ACCENT: RGB = [1, 0.1, 0.025];

function keyColours(A: Appraisal, n: number): RGB[] {
  const TONE: Record<string, RGB> = { white: [0.95, 0.9, 1], grey: [0.55, 0.62, 0.72], black: [0.12, 0.14, 0.4] };
  const ranked = Object.entries(A.c.colour.p).sort((a, b) => b[1] - a[1]);
  const base = ranked.filter(([, p], i) => i === 0 || p >= 0.08).slice(0, 4).map(([k]) => TONE[k] ?? COLOURS[k]);
  // (a word Jev sees as white, grey or black would vanish among the white points: it takes the house's accent)
  if (TONE[ranked[0][0]]) base[0] = ACCENT;
  return Array.from({ length: n }, (_, i) => {
    const c = base[i % base.length], round = Math.floor(i / base.length);
    return round === 0 ? c : c.map((x) => x * (round % 2 ? 0.62 : 0.4)) as RGB;
  });
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

/** The marked cells merged: a tile each on the stage (unit rect: x, y, w, h), in rows fitted to its 7 : 3 shape, the
 *  last row shared out. */
function tiles(K: number): Float32Array {
  const nr = Math.max(1, Math.round(Math.sqrt(K / (7 / 3)))), nc = Math.ceil(K / nr);
  const out = new Float32Array(32);
  for (let i = 0; i < K; i++) {
    const row = Math.floor(i / nc), inRow = row === nr - 1 ? K - row * nc : nc;
    out.set([(i % nc) / inRow, row / nr, 1 / inRow, 1 / nr], i * 4);
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
    out.set([c.value, c.conf, c.kind, c.arrive, Math.min(c.vanish, 1e4), c.key, c.label, c.opt, 0, Math.min(c.markAt, 1e4), c.z, (c.value - mean) / sd], 16 + k * CELL);
    for (const v of c.lex) out[h0 + k * BINS + Math.min(BINS - 1, Math.floor(Math.max(0, v) * BINS))] += 1;
  });
  const T = tiles(g.keys.length);
  g.keys.slice(0, KEY_MAX).forEach((k, i) => out.set([k, g.cells[k].value, ...g.colours[i], ...T.subarray(i * 4, i * 4 + 4)], k0 + i * KEY));
  const bytes = A.bytes.slice(0, BYTE_MAX);
  out[b0] = bytes.length;
  out.set(bytes, b0 + 1);
  return out;
}
