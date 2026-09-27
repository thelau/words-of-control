/**
 * The matrix (after Ryoji Ikeda): the verdict as a score of pure data — white on black, 1-pixel, digits only, no
 * words but identifiers. Six sections, cut on frames:
 *   0 scan    — every number of the reading as one bit stream: a full-screen barcode, racing
 *   1 matrix  — every value of the reading and of the 61 reference words (≈ 2 700 numbers) in columns, scrolling;
 *               the word's own values burn white, the reference words grey
 *   2 zoom    — out of the matrix, the view falls into one number (the answer that sets the word apart) until a
 *               single digit fills the screen
 *   3 signal  — 43 bands, one per answer: a sure answer is a clean sine, an answer the machine will not call is
 *               noise; a playhead sweeps them and each band sounds as it passes (sine or noise)
 *   4 field   — the 61 words as points in space (valence, arousal, dominance), rotating; the word a hard white point
 *   5 end     — every band collapses into one line, one sine; black
 * Cut after the film's own rhythm (score()). The reading's numbers go to the GPU as one buffer (pack()); the same
 * numbers make the sound (clips.ts matrix()).
 * Compared against the piece's own reference lexicon (src/jev/lexicon.json, scripts/lexicon.ts) — never what
 * visitors typed.
 */
import type { Appraisal } from '../jev/appraisal.ts';
import { CHOICE_IDS, NOUL_IDS, SCORE_IDS } from '../jev/appraisal.ts';
import lexicon from '../jev/lexicon.json';

type Ref = { s: Record<string, number>; n: Record<string, number>; c: Record<string, Record<string, number>> };
const LEX = lexicon as Record<string, Ref>;

/** One answer: its value, how sure Jev is, how far it stands from the reference words (|z|), and theirs. */
export type Dim = { id: string; value: number; conf: number; z: number; lex: number[] };
export type Reading = {
  dims: Dim[];
  /** The reference words (the lexicon less the typed word) and their valence, arousal, dominance. */
  ref: { w: string; v: [number, number, number] }[];
  /** This word's point, and the answer that sets it most apart. */
  me: [number, number, number];
  focus: number;
};

export const SECTIONS = ['scan', 'matrix', 'zoom', 'signal', 'field', 'end'] as const;
/** The lexicon's slot count per answer in the GPU buffer. */
export const REF_MAX = 64;

const READ = new WeakMap<Appraisal, Reading>(); // one reading per appraisal (the sound asks once per shot)

export function reading(A: Appraisal): Reading {
  const hit = READ.get(A);
  if (hit) return hit;
  const text = new TextDecoder().decode(A.bytes).trim().toLowerCase();
  const words = Object.keys(LEX).filter((w) => w !== text);
  const dim = (id: string, value: number, lex: number[]): Dim => {
    const m = lex.reduce((a, b) => a + b, 0) / lex.length;
    const sd = Math.sqrt(lex.reduce((a, b) => a + (b - m) ** 2, 0) / lex.length) + 0.05;
    return { id, value, conf: A.k[id] ?? 1, z: Math.abs(value - m) / sd, lex };
  };
  const dims: Dim[] = [
    ...SCORE_IDS.map((id) => dim(id, A.s[id], words.map((w) => LEX[w].s[id] ?? 0.5))),
    ...CHOICE_IDS.map((id) => { const top = A.c[id].top; return dim(id, A.c[id].p[top] ?? 0, words.map((w) => LEX[w].c[id]?.[top] ?? 0)); }),
    ...NOUL_IDS.map((id) => dim(id, A.n[id], words.map((w) => LEX[w].n[id] ?? 0))),
  ];
  const vad = (s: Record<string, number>): [number, number, number] => [s.valence ?? 0.5, s.arousal ?? 0.5, s.dominance ?? 0.5];
  const focus = dims.reduce((b, d, k) => (d.z > dims[b].z ? k : b), 0);
  const r = { dims, ref: words.map((w) => ({ w, v: vad(LEX[w].s) })), me: vad(A.s), focus };
  READ.set(A, r);
  return r;
}

/** The reading as the shader's buffer: a header [dims, refs, focus, 0], then per answer (value, conf, z, 0), then
 *  the reference words' points (x, y, z, 0), then per answer REF_MAX reference values. */
export function pack(r: Reading): Float32Array {
  const n = r.dims.length, m = Math.min(r.ref.length, REF_MAX);
  const out = new Float32Array(4 + n * 4 + (m + 1) * 4 + n * REF_MAX);
  out.set([n, m, r.focus, 0], 0);
  r.dims.forEach((d, k) => out.set([d.value, d.conf, d.z, 0], 4 + k * 4));
  const p0 = 4 + n * 4;
  out.set([...r.me, 1], p0);
  r.ref.slice(0, m).forEach((x, k) => out.set([...x.v, 0], p0 + (k + 1) * 4));
  const l0 = p0 + (m + 1) * 4;
  r.dims.forEach((d, k) => d.lex.slice(0, REF_MAX).forEach((v, j) => (out[l0 + k * REF_MAX + j] = v)));
  return out;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export type Cue = { section: number; start: number; dur: number; inv: boolean; span: { start: number; dur: number } };

/** The score, after the film's rhythm (measured: ~10 cuts a second, flicker of one- and two-frame flashes, holds on
 *  a ~3 s pulse, a quarter of the time black). Each section is one or two cycles; each cycle opens with an ATTACK —
 *  the section flickering in a code written by the word's own bits (a 1: two frames on, a 0: one; then one off;
 *  some frames inverted, white slabs, for an intense word) — then HOLDS, then may fall to black. The section's
 *  clock runs on through its flicker (its span). Times from the verdict's start (s). */
export function score(A: Appraisal): Cue[] {
  const pace = Math.min(1, Math.max(0, A.s.arousal * 0.7 + A.s.intensity * 0.3 - A.lazy * 0.4));
  const C = lerp(3.1, 2.4, pace);
  const frame = 1 / 30;
  const bits: number[] = [];
  for (const b of A.bytes) for (let k = 7; k >= 0; k--) bits.push((b >> k) & 1);
  if (!bits.length) bits.push(1, 0, 1, 1);
  let bi = 0;
  const invP = 0.1 + A.s.intensity * 0.3 + A.s.tension * 0.15;
  const attackShare = lerp(0.15, 0.45, Math.min(1, A.s.intensity * 0.5 + A.s.tension * 0.3 + A.s.arousal * 0.3));
  const tailShare = Math.min(0.35, 0.08 + A.lazy * 0.2 + A.n.loss * 0.1 + (A.c.emotion.p.sadness ?? 0) * 0.1);
  // cycles per section: scan, matrix ×2, zoom, signal ×2, field, end
  const CYCLES = [1, 2, 1, 2, 1, 1];
  const out: Cue[] = [];
  let t = 0, cyc = 0;
  CYCLES.forEach((n, section) => {
    const last = section === CYCLES.length - 1;
    const span = { start: t, dur: n * C - (last ? 0 : C * tailShare) };
    for (let c = 0; c < n; c++, cyc++) {
      const cs = t;
      const attack = last ? 0 : C * attackShare * (0.6 + 0.8 * ((A.bytes[cyc % A.bytes.length] ?? 128) / 255));
      // the attack: flashes in the word's code
      for (let x = 0; x < attack - frame;) {
        const on = (bits[bi++ % bits.length] ? 2 : 1) * frame;
        out.push({ section, start: cs + x, dur: on, inv: ((bi * 0.618) % 1) < invP, span });
        x += on + frame;
      }
      // the hold, then (not after the last cycle of a section) a black tail
      const tail = c === n - 1 && !last ? C * tailShare : 0;
      out.push({ section, start: cs + attack, dur: C - attack - tail, inv: false, span });
      t = cs + C;
    }
  });
  return out;
}
