/**
 * The performance's sound as samples (no audio context: it also runs in the prepare worker). Two parts, from the
 * score (show/grid.ts):
 *   renderGrid  — from the start to just past the cut into the steps: each result a test tone at its value, 25 ms
 *                 (a choice two, a yes/no a click; a doubtful one noise), each cell going out a dry click where it
 *                 was; the cut a hard transient
 *   renderSteps — from the steps' start to the end: a sequencer — two arpeggios of the marked answers, of different
 *                 lengths, drifting in and out of phase (sine through a wavefolder and a filter), bent by the word's
 *                 mood (see renderSteps); each step re-patches it (fold, octave, gate, density: the space on screen sets them);
 *                 noise ticks and sub hits on euclidean patterns; a full-frame step a burst of white noise and a high
 *                 sine; the last step, the result's pitch alone
 * Pitches on the house's D, in a mode from the mood.
 */
import type { Appraisal } from '../jev/appraisal.ts';
import type { Grid, Viz } from '../show/grid.ts';
import { COLS } from '../show/grid.ts';
import { mulberry32 } from '../core/rng.ts';

const D3 = 146.832;

/** A value (0..1) as a note of the word's mode over two octaves, `oct` octaves above D3: lydian for a positive word,
 *  phrygian for a negative one, minor pentatonic for a neutral one. */
export function tuning(A: Appraisal): (v: number, oct: number) => number {
  const m = A.mood;
  const S = m.pos >= m.neg && m.pos >= m.neu ? [0, 2, 4, 6, 7, 9, 11] : m.neg >= m.neu ? [0, 1, 3, 5, 7, 8, 10] : [0, 3, 5, 7, 10];
  return (v, oct) => {
    const j = Math.min(2 * S.length - 1, Math.floor(v * 2 * S.length));
    return D3 * 2 ** (oct + (S[j % S.length] + 12 * Math.floor(j / S.length)) / 12);
  };
}

/** A stereo tape from `from` to `to` (s, performance time), and the marks written onto it. */
function tape(from: number, to: number, sr: number, rand: () => number) {
  const len = Math.ceil((to - from) * sr);
  const L = new Float32Array(len), R = new Float32Array(len);
  const at = (t: number) => Math.floor((t - from) * sr);
  const put = (i: number, x: number, pan: number) => { if (i >= 0 && i < len) { L[i] += x * (1 - pan); R[i] += x * (1 + pan); } };
  return {
    L, R, at, put,
    /** A test tone: a sine, rectangular with 1 ms edges. */
    tone(t: number, f: number, dur: number, amp: number, pan = 0) {
      const s0 = at(t), n = Math.floor(dur * sr), e = sr * 0.001;
      for (let i = 0; i < n; i++) put(s0 + i, Math.sin((2 * Math.PI * f * i) / sr) * amp * Math.min(1, i / e, (n - i) / e), pan);
    },
    /** Noise, high-passed (a first difference), decaying with tau. */
    noise(t: number, dur: number, amp: number, pan = 0, tau = dur / 3) {
      const s0 = at(t), n = Math.floor(dur * sr);
      let prev = 0;
      for (let i = 0; i < n; i++) { const w = rand() * 2 - 1; put(s0 + i, (w - prev) * amp * Math.exp(-i / sr / tau), pan); prev = w; }
    },
    click(t: number, amp: number, pan = 0) { const s = at(t); put(s, amp, pan); put(s + 1, -amp * 0.6, pan); },
    /** A sub hit: a sine at f, decaying. */
    sub(t: number, f: number, amp: number, tau: number) {
      const s0 = at(t), n = Math.floor(tau * 5 * sr);
      for (let i = 0; i < n; i++) put(s0 + i, Math.sin((2 * Math.PI * f * i) / sr) * amp * Math.exp(-i / sr / tau) * Math.min(1, i / 48), 0);
    },
  };
}

export type Samples = { L: Float32Array<ArrayBuffer>; R: Float32Array<ArrayBuffer> };

export function renderGrid(A: Appraisal, g: Grid, sr: number): Samples {
  const T = tape(0, g.seq + 0.5, sr, mulberry32(A.seed ^ 0x51ed));
  const col = (k: number) => ((k % COLS) / (COLS - 1)) * 1.4 - 0.7; // a cell's column as a pan
  g.cells.forEach((x, k) => {
    const t = x.arrive, pan = col(k), f = 400 * 2 ** (4 * x.value);
    if (x.conf < 0.45) T.noise(t, 0.012, 0.05, pan, 0.004);
    else if (x.kind === 0) T.tone(t, f, 0.025, 0.05, pan);
    else if (x.kind === 1) { T.tone(t, f, 0.018, 0.045, pan); T.tone(t + 0.03, 400 * 2 ** (4 * ([...x.probs].sort((p, q) => q - p)[1] ?? 0)), 0.018, 0.03, pan); }
    else T.click(t, 0.25, pan);
    if (x.key < 0) T.click(x.vanish, 0.22, pan);
  });
  // the cut into the steps: one hard transient
  T.noise(g.seq, 0.04, 0.25, 0, 0.012);
  T.sub(g.seq, 42, 0.5, 0.08);
  return { L: T.L, R: T.R };
}

/** How each space patches the sequencer: fold (timbre), octave, gate (s), density (share of 16ths that sound). */
const PATCH: Partial<Record<Viz, { fold: number; oct: number; gate: number; dens: number }>> = {
  cloud: { fold: 0.8, oct: 1, gate: 0.07, dens: 1 },
  network: { fold: 2.8, oct: 2, gate: 0.05, dens: 0.8 },
  terrain: { fold: 1.2, oct: 0, gate: 0.12, dens: 0.6 },
  map: { fold: 0.5, oct: 1, gate: 0.16, dens: 0.4 },
  globe: { fold: 1.8, oct: 1, gate: 0.09, dens: 0.9 },
  lattice: { fold: 3.4, oct: 2, gate: 0.03, dens: 1 },
  ridges: { fold: 1.0, oct: 0, gate: 0.2, dens: 0.5 },
  planes: { fold: 2.2, oct: 1, gate: 0.06, dens: 0.75 },
};

/** k onsets spread evenly over n steps (Bjorklund's rhythm). */
const euclid = (k: number, n: number) => Array.from({ length: n }, (_, i) => Math.floor(((i + 1) * k) / n) - Math.floor((i * k) / n) === 1);

/** The steps, as samples starting at g.seq. The mood bends the whole sequencer, continuously:
 *  negative — lower, folded harder and driven, the second voice detuned against the first (it beats), the filter
 *             kept dark, harsher ticks, more sub, a low rumble pumping with it;
 *  neutral  — clinical: test-tone pitches (half-octaves of 1 kHz) instead of the mode, pure sines, sparser, no sub;
 *  positive — the mode (lydian), higher, lightly folded, the filter opening across the sequence. */
export function renderSteps(A: Appraisal, g: Grid, sr: number): Samples {
  const rand = mulberry32(A.seed ^ 0x2545f491);
  const T = tape(g.seq, g.end + 0.05, sr, rand);
  const { pos, neu, neg } = A.mood;
  const mode = tuning(A);
  const lift = Math.round(0.6 * pos - 1.2 * neg); // octaves
  const note = (v: number, oct: number) => {
    const f = mode(v, oct + lift);
    // neutral: the same place on a test-tone scale (1 kHz and its half-octaves)
    return neu > 0.5 ? 1000 * 2 ** (Math.round(Math.log2(f / 1000) * 2) / 2) : f;
  };
  const foldBy = 1 + 1.6 * neg - 0.7 * neu, drive = 1 + 4 * neg, detune = 2 ** ((0.3 * neg) / 12);
  const sixteenth = g.beat / 4;
  const vals = g.keys.map((k) => g.cells[k].value);
  const seqA = vals, seqB = [...vals].reverse().concat(g.result); // lengths K and K + 1: they drift
  const ticks = euclid(3 + Math.round(6 * A.s.arousal), 16), subs = euclid(3 + Math.round(2 * A.s.intensity + 3 * neg), 8);
  let cut = 1800 - 1100 * neg; // the filter opens across the sequence — unless the word is dark
  const open = 1 + 0.12 * (1 - neg);
  const lp = [0, 0];
  const voice = (t: number, f: number, gate: number, fold: number, pan: number, amp: number, which: 0 | 1) => {
    const s0 = T.at(t), n = Math.floor(gate * 1.6 * sr), w = (2 * Math.PI * f) / sr;
    let y0 = lp[which];
    for (let i = 0; i < n; i++) {
      const x = i / sr;
      const env = Math.min(1, x / 0.002) * Math.exp(-x / (gate * 0.5));
      const y = Math.tanh(drive * Math.sin(fold * (1 + env) * Math.sin(w * i))) / Math.tanh(drive); // folder, then drive
      y0 += (1 - Math.exp((-2 * Math.PI * cut * (0.3 + env)) / sr)) * (y - y0);
      T.put(s0 + i, y0 * env * amp, pan);
    }
    lp[which] = y0;
  };
  // a negative word: a low rumble under the steps, pumped by the sub pattern
  if (neg > 0.3) {
    const s0 = T.at(g.seq), n = T.at(g.end) - s0, fc = 1 - Math.exp((-2 * Math.PI * 140) / sr);
    let y = 0;
    for (let i = 0; i < n; i++) {
      const t = g.seq + i / sr, k = Math.floor((t - g.seq) / (sixteenth * 2));
      const since = (t - g.seq) - k * sixteenth * 2;
      y += fc * ((rand() * 2 - 1) - y);
      const duck = subs[k % 8] ? Math.min(1, since / 0.12) : 1;
      T.put(s0 + i, y * 0.5 * neg * duck, 0);
    }
  }
  let n16 = 0;
  for (const st of g.steps) {
    const p = PATCH[st.viz];
    if (st.full) { T.noise(st.t, 0.06 + 0.1 * neg, 0.3, 0, 0.03 + 0.05 * neg); T.tone(st.t, 9000 + 3000 * g.result, 0.04, 0.03); }
    if (st.viz === 'number') { T.tone(st.t, note(g.result, 1), st.dur, 0.08); continue; }
    const count = Math.round(st.dur / sixteenth);
    for (let i = 0; i < count; i++, n16++) {
      const t = st.t + i * sixteenth;
      if (ticks[n16 % 16]) T.noise(t, 0.008 + 0.01 * neg, 0.1 + 0.1 * neg, (n16 % 2) * 0.8 - 0.4, 0.002 + 0.004 * neg);
      if (neu < 0.5 && n16 % 2 === 0 && subs[(n16 / 2) % 8]) T.sub(t, 38 + 8 * A.s.weight, 0.35 + 0.2 * neg, 0.07 + 0.08 * neg);
      if (!p || rand() > p.dens * (1 - 0.4 * neu)) continue;
      voice(t, note(seqA[n16 % seqA.length], p.oct), p.gate, p.fold * foldBy, -0.5, 0.07, 0);
      voice(t + (n16 % 3 === 2 ? sixteenth / 2 : 0), note(seqB[n16 % seqB.length], p.oct + 1) * detune, p.gate * 0.7, p.fold * 0.7 * foldBy, 0.5, 0.045, 1);
    }
    cut = Math.min(9000, cut * open);
  }
  return { L: T.L, R: T.R };
}
