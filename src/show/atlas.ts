/**
 * The atlas (after Ikeda's data-verse): the verdict is the word as a scientific specimen — its reading laid out as
 * precise, annotated plates, and set against a reference lexicon of the piece's own words (src/jev/lexicon.json,
 * never what visitors typed). Four plates, cut hard between them:
 *   grid   — every answer an instrument in a 7×7 grid (a scale with the lexicon behind it, or a distribution); the
 *            answers that most set this word apart, in red; the specimen's own bytes in the last cells
 *   focus  — the most distinctive answer, large: where this word stands among all the others, named
 *   crowd  — every answer as a row of the lexicon's ticks, this word's tick in red
 *   map    — the lexicon as a field (valence × arousal), this word in red, lines to its three nearest words
 * This module is the model: content, layout (normalised 0..1) and reveal times, shared by the painter
 * (render/atlasPaint.ts), the image (atlas.wgsl) and the sound (clips.ts atlas()).
 */
import type { Appraisal } from '../jev/appraisal.ts';
import { CHOICE_IDS, NOUL_IDS, SCORE_IDS } from '../jev/appraisal.ts';
import lexicon from '../jev/lexicon.json';

type Ref = { s: Record<string, number>; n: Record<string, number>; c: Record<string, Record<string, number>> };
const LEX = lexicon as Record<string, Ref>;

export type Rect = { x0: number; y0: number; x1: number; y1: number };
/** One element of a plate, revealed at `t` (s from the plate's start) over `dur`; `red`: drawn in red. */
export type Item = Rect & { t: number; dur: number; red: boolean; value: number };

export type Dim = {
  id: string; kind: 'score' | 'choice' | 'other';
  /** This word's value (a choice: the probability of its top option), and the lexicon's on the same axis. */
  value: number; lex: number[];
  /** A choice's option probabilities, its top option. */
  dist?: [string, number][]; top?: string;
  /** How far this word stands from the lexicon on this axis (|z|), and its rank among the lexicon (0..1). */
  z: number; rank: number;
};

export type Plate = { kind: 'grid' | 'focus' | 'crowd' | 'map'; dur: number; items: Item[] };
/** `ref`: the reference words compared against (the lexicon, less the typed word itself). */
export type AtlasModel = { ref: { w: string; s: Record<string, number> }[]; dims: Dim[]; red: string[]; focus: Dim; nearest: [string, number][]; plates: Plate[] };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function dimsOf(A: Appraisal, LEX_WORDS: string[]): Dim[] {
  const out: Dim[] = [];
  const stat = (id: string, kind: Dim['kind'], value: number, lex: number[], extra: Partial<Dim> = {}): Dim => {
    const m = lex.reduce((a, b) => a + b, 0) / lex.length;
    const sd = Math.sqrt(lex.reduce((a, b) => a + (b - m) ** 2, 0) / lex.length) + 0.05;
    return { id, kind, value, lex, z: Math.abs(value - m) / sd, rank: lex.filter((x) => x < value).length / lex.length, ...extra };
  };
  for (const id of SCORE_IDS) out.push(stat(id, 'score', A.s[id], LEX_WORDS.map((w) => LEX[w].s[id] ?? 0.5)));
  for (const id of CHOICE_IDS) {
    const top = A.c[id].top;
    const dist = Object.entries(A.c[id].p).sort((a, b) => b[1] - a[1]);
    out.push(stat(id, 'choice', A.c[id].p[top] ?? 0, LEX_WORDS.map((w) => LEX[w].c[id]?.[top] ?? 0), { dist, top }));
  }
  for (const id of NOUL_IDS) out.push(stat(id, 'other', A.n[id], LEX_WORDS.map((w) => LEX[w].n[id] ?? 0)));
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
    grid.push({ x0: cx, y0: cy, x1: cx + cw * 0.92, y1: cy + ch * 0.86, t: 0.3 + k * step, dur: 0.14, red: !!d && red.includes(d.id), value: d ? d.value : 0 });
  }
  const gridDur = Math.min(0.3 + cols * rows * step + 1.6 * slow, 5);

  // focus: the scale, wiped in
  const focusItems: Item[] = [{ x0: 0.08, y0: 0.44, x1: 0.92, y1: 0.7, t: 0.25, dur: 1.2 * slow, red: true, value: focus.value }];
  // crowd: one row per answer, top to bottom
  const rowH = (1 - 0.14 - 0.05) / dims.length;
  const crowd: Item[] = dims.map((d, k) => ({ x0: 0.06, y0: 0.14 + k * rowH, x1: 0.94, y1: 0.14 + (k + 0.85) * rowH, t: 0.2 + k * 0.035 * slow, dur: 0.18, red: red.includes(d.id), value: d.value }));
  // map: the words appear by their distance from this one (a ripple out from it)
  const [mx, my] = mapPos(A.s);
  const mapItems: Item[] = LEX_WORDS.map((w) => {
    const [x, y] = mapPos(LEX[w].s);
    const [px, py] = onMap(x, y);
    const r = Math.hypot(x - mx, y - my);
    // (a dot and its name to the right: the rect the reveal wipes)
    return { x0: px - 0.006, y0: py - 0.012, x1: px + 0.11, y1: py + 0.012, t: 0.3 + r * 1.6 * slow, dur: 0.1, red: false, value: r };
  });

  return {
    ref: LEX_WORDS.map((w) => ({ w, s: LEX[w].s })), dims, red, focus, nearest,
    plates: [
      { kind: 'grid', dur: gridDur, items: grid },
      { kind: 'focus', dur: 3.4 * slow, items: focusItems },
      { kind: 'crowd', dur: (0.2 + dims.length * 0.035 * slow + 1.8), items: crowd },
      { kind: 'map', dur: 4.2 * slow, items: mapItems },
    ],
  };
}
