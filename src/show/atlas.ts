/**
 * The atlas (after Ikeda's data-verse): the verdict is the word as a scientific specimen — its reading laid out as
 * precise, annotated plates, and set against a reference lexicon of the piece's own words (src/jev/lexicon.json,
 * never what visitors typed). Seven plates, cut hard between them:
 *   grid   — every answer an instrument in a 7×7 grid (a scale with the lexicon behind it, or a distribution); the
 *            answers that most set this word apart, in red; the specimen's own bytes in the last cells
 *   focus  — the most distinctive answer, large: where this word stands among all the others, named
 *   crowd  — every answer as a row of the lexicon's ticks, this word's tick in red
 *   certainty — what the machine is sure of, and what it will not make a call on (its near-ties, what it almost
 *            said), the doubtful drawn out of focus
 *   map    — the lexicon as a field (valence × arousal), this word in red, lines to its three nearest words
 *   hand   — how the word was typed: its keystrokes as a seismograph, replayed at the visitor's own pace
 *   sigil  — the word's mark: every answer a ray of one circular barcode, its bytes at the centre (it closes)
 * This module is the model: content, layout (normalised 0..1) and reveal times, shared by the painter
 * (render/atlasPaint.ts), the image (atlas.wgsl) and the sound (clips.ts atlas()).
 */
import type { Appraisal } from '../jev/appraisal.ts';
import { CHOICE_IDS, NOUL_IDS, SCORE_IDS } from '../jev/appraisal.ts';
import lexicon from '../jev/lexicon.json';

type Ref = { s: Record<string, number>; n: Record<string, number>; c: Record<string, Record<string, number>> };
const LEX = lexicon as Record<string, Ref>;

export type Rect = { x0: number; y0: number; x1: number; y1: number };
/** One element of a plate, revealed at `t` (s from the plate's start) over `dur`; `red`: drawn in red; `doubt`
 *  (0..1): how unsure the machine is of it (drawn out of focus, wavering). */
export type Item = Rect & { t: number; dur: number; red: boolean; value: number; doubt: number };

export type Dim = {
  id: string; kind: 'score' | 'choice' | 'other';
  /** This word's value (a choice: the probability of its top option), and the lexicon's on the same axis. */
  value: number; lex: number[];
  /** A choice's option probabilities, its top option. */
  dist?: [string, number][]; top?: string;
  /** How far this word stands from the lexicon on this axis (|z|), and its rank among the lexicon (0..1). */
  z: number; rank: number;
  /** How sure Jev is (0..1), and what it almost said: the runner-up option or level, and its probability. */
  conf: number; second?: [string, number];
};

export type Plate = { kind: 'grid' | 'certainty' | 'focus' | 'crowd' | 'map' | 'hand' | 'sigil'; dur: number; items: Item[] };
/** `ref`: the reference words compared against (the lexicon, less the typed word itself). */
export type AtlasModel = {
  ref: { w: string; s: Record<string, number> }[]; dims: Dim[]; red: string[]; focus: Dim; nearest: [string, number][];
  /** The answers Jev is surest of, and those it will not call (least sure first). */
  sure: Dim[]; nocall: Dim[];
  plates: Plate[];
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** The keystrokes the hand plate shows at most. */
const MAX_KEYS = 64;
/** How unsure the machine is of an answer (0: sure … 1: no call at all). */
export const doubtOf = (d: Dim) => clamp01((0.75 - d.conf) / 0.6);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function dimsOf(A: Appraisal, LEX_WORDS: string[]): Dim[] {
  const out: Dim[] = [];
  const stat = (id: string, kind: Dim['kind'], value: number, lex: number[], extra: Partial<Dim> & { conf: number }): Dim => {
    const m = lex.reduce((a, b) => a + b, 0) / lex.length;
    const sd = Math.sqrt(lex.reduce((a, b) => a + (b - m) ** 2, 0) / lex.length) + 0.05;
    return { id, kind, value, lex, z: Math.abs(value - m) / sd, rank: lex.filter((x) => x < value).length / lex.length, ...extra };
  };
  for (const id of SCORE_IDS) {
    // what it almost said: the runner-up level (as a value 0..1)
    const lv = A.sd[id].map((p, i) => [i, p] as [number, number]).sort((a, b) => b[1] - a[1]);
    const second: [string, number] | undefined = lv[1] ? [(lv[1][0] / Math.max(1, lv.length - 1)).toFixed(2), lv[1][1]] : undefined;
    out.push(stat(id, 'score', A.s[id], LEX_WORDS.map((w) => LEX[w].s[id] ?? 0.5), { conf: A.k[id], second }));
  }
  for (const id of CHOICE_IDS) {
    const top = A.c[id].top;
    const dist = Object.entries(A.c[id].p).sort((a, b) => b[1] - a[1]);
    out.push(stat(id, 'choice', A.c[id].p[top] ?? 0, LEX_WORDS.map((w) => LEX[w].c[id]?.[top] ?? 0), { dist, top, conf: A.k[id], second: dist.find(([o]) => o !== top) }));
  }
  for (const id of NOUL_IDS) out.push(stat(id, 'other', A.n[id], LEX_WORDS.map((w) => LEX[w].n[id] ?? 0), { conf: A.k[id] }));
  return out;
}

/** The three nearest reference words, over every axis (scores, the others, each choice's distribution). */
function nearestOf(A: Appraisal, LEX_WORDS: string[]): [string, number][] {
  const vec = (s: Record<string, number>, n: Record<string, number>, c: Record<string, Record<string, number>>) => [
    ...SCORE_IDS.map((k) => s[k] ?? 0.5), ...NOUL_IDS.map((k) => n[k] ?? 0),
    ...CHOICE_IDS.flatMap((k) => Object.keys(A.c[k].p).map((o) => (c[k]?.[o] ?? 0) * 0.6)),
  ];
  const me = vec(A.s, A.n, Object.fromEntries(CHOICE_IDS.map((k) => [k, A.c[k].p])));
  const d = LEX_WORDS.map((w) => [w, Math.sqrt(vec(LEX[w].s, LEX[w].n, LEX[w].c).reduce((a, x, i) => a + (x - me[i]) ** 2, 0) / me.length)] as [string, number]);
  return d.sort((a, b) => a[1] - b[1]).slice(0, 3);
}

/** The map's frame on the plate (normalised), and a point of it (valence, arousal) → the plate. */
export const MAP = { x0: 0.1, x1: 0.86, y0: 0.16, y1: 0.9 };
export const onMap = (x: number, y: number): [number, number] => [MAP.x0 + x * (MAP.x1 - MAP.x0), MAP.y0 + (1 - y) * (MAP.y1 - MAP.y0)];

/** Where a reference word or this one sits on the map: valence × arousal. */
export const mapPos = (s: Record<string, number>): [number, number] => [s.valence ?? 0.5, s.arousal ?? 0.5];

export function atlasModel(A: Appraisal): AtlasModel {
  // (the typed word, if it is a reference word, is not compared with itself)
  const text = new TextDecoder().decode(A.bytes).trim().toLowerCase();
  const LEX_WORDS = Object.keys(LEX).filter((w) => w !== text);
  const dims = dimsOf(A, LEX_WORDS);
  const ranked = [...dims].sort((a, b) => b.z - a.z);
  const red = ranked.slice(0, 3).map((d) => d.id);
  const focus = ranked[0];
  const nearest = nearestOf(A, LEX_WORDS);
  // the tempo: a charged word is read fast, an idle one slowly
  const pace = clamp01(A.s.arousal * 0.7 + A.s.intensity * 0.3 - A.lazy * 0.5);
  const slow = lerp(1.25, 0.8, pace);

  // grid: 7 × 7 cells, answers in battery order, then the specimen's own cells
  const M = 0.06, top = 0.12, cols = 7, rows = 7;
  const cw = (1 - 2 * M) / cols, ch = (1 - top - M) / rows;
  // (the grid is built in at most ~5 s, even for the calmest word)
  const step = Math.min(lerp(0.075, 0.04, pace) * slow, 0.055);
  const grid: Item[] = [];
  for (let k = 0; k < cols * rows; k++) {
    const cx = M + (k % cols) * cw, cy = top + Math.floor(k / cols) * ch;
    const d = dims[k];
    grid.push({ x0: cx, y0: cy, x1: cx + cw * 0.92, y1: cy + ch * 0.86, t: 0.3 + k * step, dur: 0.14, red: !!d && red.includes(d.id), value: d ? d.value : 0, doubt: d ? doubtOf(d) : 0 });
  }
  const gridDur = Math.min(0.3 + cols * rows * step + 1.6 * slow, 5);

  // focus: the scale, wiped in
  const focusItems: Item[] = [{ x0: 0.08, y0: 0.44, x1: 0.92, y1: 0.7, t: 0.25, dur: 1.2 * slow, red: true, value: focus.value, doubt: 0 }];
  // crowd: one row per answer, top to bottom
  const rowH = (1 - 0.14 - 0.05) / dims.length;
  const crowd: Item[] = dims.map((d, k) => ({ x0: 0.06, y0: 0.14 + k * rowH, x1: 0.94, y1: 0.14 + (k + 0.85) * rowH, t: 0.2 + k * 0.035 * slow, dur: 0.18, red: red.includes(d.id), value: d.value, doubt: 0 }));
  // map: the words appear by their distance from this one (a ripple out from it)
  const [mx, my] = mapPos(A.s);
  const mapItems: Item[] = LEX_WORDS.map((w) => {
    const [x, y] = mapPos(LEX[w].s);
    const [px, py] = onMap(x, y);
    const r = Math.hypot(x - mx, y - my);
    // (a dot and its name to the right: the rect the reveal wipes)
    return { x0: px - 0.006, y0: py - 0.012, x1: px + 0.11, y1: py + 0.012, t: 0.3 + r * 1.6 * slow, dur: 0.1, red: false, value: r, doubt: 0 };
  });

  // certainty: the seven surest answers on the left, the seven it will not call on the right, row by row
  const bySure = [...dims].sort((a, b) => b.conf - a.conf);
  const sure = bySure.slice(0, 7), nocall = bySure.slice(-7).reverse();
  const certainty: Item[] = [
    ...sure.map((d, k) => ({ x0: 0.06, y0: 0.24 + k * 0.095, x1: 0.47, y1: 0.24 + k * 0.095 + 0.07, t: 0.3 + k * 0.12 * slow, dur: 0.2, red: false, value: d.conf, doubt: 0 })),
    ...nocall.map((d, k) => ({ x0: 0.53, y0: 0.24 + k * 0.095, x1: 0.94, y1: 0.24 + k * 0.095 + 0.07, t: 0.5 + k * 0.16 * slow, dur: 0.35, red: false, value: d.conf, doubt: doubtOf(d) })),
  ];
  // hand: the keystrokes, replayed at the visitor's own pace (compressed if it took longer than 2.6 s)
  const iv = A.typing.intervals.slice(0, MAX_KEYS);
  const typed = iv.reduce((a, b) => a + b, 0) / 1000;
  const squeeze = typed > 2.6 ? 2.6 / typed : 1;
  let at = 0.4;
  const hand: Item[] = iv.map((ms, k) => {
    at += (ms / 1000) * squeeze;
    const x = 0.08 + (0.84 * (k + 1)) / (iv.length + 1);
    return { x0: x - 0.008, y0: 0.3, x1: x + 0.008, y1: 0.75, t: at, dur: 0.05, red: ms === Math.max(...iv), value: Math.min(1, ms / 1200), doubt: 0 };
  });
  // sigil: every answer a ray, drawn around the circle
  const sigil: Item[] = dims.map((d, k) => {
    const a = (k / dims.length) * Math.PI * 2 - Math.PI / 2, r = 0.36;
    const cx = 0.5 + Math.cos(a) * r * 0.62 * 0.5, cy = 0.5 + Math.sin(a) * r * 0.5;
    return { x0: Math.min(0.5, cx) - 0.02, y0: Math.min(0.5, cy) - 0.02, x1: Math.max(0.5, cx) + 0.02, y1: Math.max(0.5, cy) + 0.02, t: 0.2 + k * 0.04, dur: 0.12, red: red.includes(d.id), value: d.value, doubt: doubtOf(d) };
  });

  return {
    ref: LEX_WORDS.map((w) => ({ w, s: LEX[w].s })), dims, red, focus, nearest, sure, nocall,
    plates: [
      { kind: 'grid', dur: gridDur, items: grid },
      { kind: 'certainty', dur: 4.2 * slow, items: certainty },
      { kind: 'focus', dur: 3.1 * slow, items: focusItems },
      { kind: 'crowd', dur: (0.2 + dims.length * 0.03 * slow + 1.4), items: crowd },
      { kind: 'map', dur: 3.8 * slow, items: mapItems },
      { kind: 'hand', dur: at + 1.4, items: hand },
      { kind: 'sigil', dur: 0.2 + dims.length * 0.04 + 2.6, items: sigil },
    ],
  };
}
