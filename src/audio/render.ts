/**
 * The performance's sound as samples (no audio context: it also runs in the prepare worker). Two parts, from the
 * score (show/grid.ts):
 *   renderGrid  — from the start to just past the cut into the steps: each result a test tone at its value, 25 ms
 *                 (a choice two, a yes/no a click; a doubtful one noise), each cell going out a dry click where it
 *                 was; the cut a hard transient
 *   renderSteps — from the steps' start to the end: a sequencer building one crescendo (see renderSteps), bent by
 *                 the word's mood; the last step the pitch of where the word stands, alone, briefly
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

/** How each space colours the sequencer (the patterns stay; only the timbre and the register move with the bar). */
const PATCH: Partial<Record<Viz, { fold: number; oct: number }>> = {
  cloud: { fold: 0.8, oct: 0 }, network: { fold: 1.8, oct: 1 }, ridges: { fold: 1.2, oct: 0 }, table: { fold: 2.4, oct: 1 },
  terrain: { fold: 1.0, oct: -1 }, map: { fold: 0.6, oct: 0 }, globe: { fold: 1.6, oct: 1 },
};

/** k onsets spread evenly over n steps (Bjorklund's rhythm), rotated by r. */
const euclid = (k: number, n: number, r = 0) => Array.from({ length: n }, (_, i) => { const j = (i + r) % n; return Math.floor(((j + 1) * k) / n) - Math.floor((j * k) / n) === 1; });

/** The steps, as samples starting at g.seq: one crescendo over the four bars. Each marked answer is a note — which
 *  degree of the word's mode by which answer it is, moved up or down by how far it stands from the reference words
 *  (not by its value: those crowd near 1). Two voices play them on fixed euclidean patterns, the second one note
 *  longer (K and K + 1: they drift in and out of phase); bar one the first voice, bar two both, then a dotted-eighth
 *  delay whose feedback grows, the notes lengthening and the filter opening. The space on screen colours the timbre.
 *  The mood:
 *  negative — by subtraction: no tune — a fixed grid of clicks, a test-tone blip per answer, short sub pulses, and
 *             digital silence on the strobe frames;
 *  neutral  — clinical: test-tone pitches (half-octaves of 1 kHz), pure sines, no sub;
 *  positive — lydian, higher, softer and longer, a quiet chord of the answers under it all. */
export function renderSteps(A: Appraisal, g: Grid, sr: number): Samples {
  const rand = mulberry32(A.seed ^ 0x2545f491);
  const T = tape(g.seq, g.end + 0.05, sr, rand);
  const { pos, neu, neg } = A.mood;
  const m = A.mood;
  const S = m.pos >= m.neg && m.pos >= m.neu ? [0, 2, 4, 6, 7, 9, 11] : m.neg >= m.neu ? [0, 1, 3, 5, 7, 8, 10] : [0, 3, 5, 7, 10];
  const lift = Math.round(0.6 * pos - 0.6 * neg);
  /** Degree j of the mode, `oct` octaves above D3 (neutral: moved onto the test-tone scale). */
  const deg = (j: number, oct: number) => {
    const f = D3 * 2 ** (oct + lift + (S[((j % S.length) + S.length) % S.length] + 12 * Math.floor(j / S.length)) / 12);
    return neu > 0.5 ? 1000 * 2 ** (Math.round(Math.log2(f / 1000) * 2) / 2) : f;
  };
  // each marked answer's degree: by which it is (spread over the mode), moved by how far it stands out (±3 degrees)
  const notes = g.keys.map((k, i) => {
    const c = g.cells[k], mean = c.lex.reduce((a, b) => a + b, 0) / c.lex.length;
    const sd = Math.sqrt(c.lex.reduce((a, b) => a + (b - mean) ** 2, 0) / c.lex.length) + 0.05;
    return (2 * i) % S.length + Math.round(Math.max(-3, Math.min(3, (c.value - mean) / sd)));
  });
  const seqA = notes, seqB = [...notes].reverse().concat(notes[0]); // lengths K and K + 1: they drift
  const sixteenth = g.beat / 4;
  const patA = euclid(7 + Math.round(4 * A.s.arousal), 16), patB = euclid(5 + Math.round(3 * A.s.arousal), 16, 3);
  const subs = euclid(3 + Math.round(2 * A.s.intensity), 8);
  const tonal = neg <= 0.6;

  // ---- the voices (a wavefolded sine through a one-pole filter), onto a tape of their own for the delay
  const V = tape(g.seq, g.end + 0.05, sr, rand);
  const lp = [0, 0];
  let cut = 1400;
  const voice = (t: number, f: number, gate: number, fold: number, pan: number, amp: number, which: 0 | 1) => {
    const s0 = V.at(t), n = Math.floor(gate * 1.6 * sr), w = (2 * Math.PI * f) / sr;
    let y0 = lp[which];
    for (let i = 0; i < n; i++) {
      const x = i / sr;
      const env = Math.min(1, x / 0.003) * Math.exp(-x / (gate * 0.5));
      y0 += (1 - Math.exp((-2 * Math.PI * cut * (0.3 + env)) / sr)) * (Math.sin(fold * (1 + env) * Math.sin(w * i)) - y0);
      V.put(s0 + i, y0 * env * amp, pan);
    }
    lp[which] = y0;
  };
  let n16 = 0;
  const spaceSteps = g.steps.filter((st) => st.viz !== 'stand');
  for (const st of spaceSteps) {
    const p = PATCH[st.viz] ?? { fold: 1, oct: 0 };
    const count = Math.round(st.dur / sixteenth);
    for (let i = 0; i < count; i++, n16++) {
      const t = st.t + i * sixteenth, bar = Math.floor(n16 / 16), fold = p.fold * (1 - 0.6 * neu - 0.4 * pos);
      const gate = (0.07 + 0.05 * bar) * (1 + 0.8 * pos);
      if (tonal) {
        if (patA[n16 % 16]) voice(t, deg(seqA[n16 % seqA.length], p.oct), gate, fold, -0.45, 0.07, 0);
        if (bar >= 1 && patB[n16 % 16]) voice(t, deg(seqB[n16 % seqB.length], p.oct + 1), gate * 0.8, fold * 0.8, 0.45, 0.045, 1);
      } else if (patA[n16 % 16]) {
        // (negative: a test-tone blip per answer instead of a tune)
        V.tone(t, 1000 * 2 ** (seqA[n16 % seqA.length] / 4), 0.012, 0.05, (n16 % 2) * 1.2 - 0.6);
      }
    }
    cut = Math.min(8000, cut * 1.1);
  }
  // the delay (dotted eighth), its feedback growing over the bars (from the third)
  {
    const d = Math.floor(3 * sixteenth * sr), start = V.at(g.seq + 32 * sixteenth);
    for (let i = Math.max(d, start); i < V.L.length; i++) {
      const fb = Math.min(0.55, 0.25 + ((i - start) / (32 * sixteenth * sr)) * 0.3);
      V.L[i] += V.R[i - d] * fb; V.R[i] += V.L[i - d] * fb; // (ping-pong)
    }
  }
  T.L.set(V.L.map((x, i) => x + T.L[i]));
  T.R.set(V.R.map((x, i) => x + T.R[i]));

  // ---- the pulse: noise ticks and sub pulses on fixed patterns; the negative grid of clicks
  const ticks = euclid(3 + Math.round(6 * A.s.arousal), 16), grid = euclid(9 + Math.round(4 * A.s.arousal), 16, 1);
  n16 = 0;
  for (const st of spaceSteps) {
    const count = Math.round(st.dur / sixteenth);
    for (let i = 0; i < count; i++, n16++) {
      const t = st.t + i * sixteenth;
      if (ticks[n16 % 16]) T.noise(t, 0.008, 0.09 * (1 - 0.6 * pos), (n16 % 2) * 0.8 - 0.4, 0.002);
      if (neu < 0.5 && n16 % 2 === 0 && subs[(n16 / 2) % 8]) T.sub(t, 48, 0.3 * (1 - 0.5 * pos), 0.04 + 0.04 * (1 - neg));
      if (!tonal && grid[n16 % 16]) T.click(t, 0.22, (n16 % 4) * 0.4 - 0.6);
    }
    if (st.full) { T.noise(st.t, 0.04, 0.25, 0, 0.02); T.tone(st.t, 4000 + 2000 * g.cells[g.stand].value, 0.03, 0.025); }
  }
  // a positive word: a quiet chord of the answers that matter, breathing with the bars
  if (pos > 0.4) {
    const fs = notes.slice(0, 4).map((j) => (2 * Math.PI * deg(j, -1)) / sr), s0 = T.at(g.seq), n = T.at(g.steps[g.steps.length - 1].t) - s0, bar = 16 * sixteenth * sr;
    for (let i = 0; i < n; i++) {
      let x = 0;
      for (const w of fs) x += Math.sin(w * i);
      T.put(s0 + i, x * 0.006 * pos * (0.6 + 0.4 * Math.sin((Math.PI * i) / bar)) * Math.min(1, i / (sr * 0.3)), 0);
    }
  }
  // where it stands: the pitch of that answer, alone — a second at most, never high (folded below ~500 Hz)
  const last = g.steps[g.steps.length - 1];
  let f = deg(notes[g.keys.indexOf(g.stand)] ?? notes[0], 0);
  while (f > 520) f /= 2;
  T.tone(last.t, f, Math.min(1, last.dur), 0.08);
  // digital silence on the strobe frames (a negative word)
  for (const b of g.flashes) { const s0 = T.at(g.seq + b * g.beat); T.L.fill(0, s0, s0 + Math.floor(sr / 30)); T.R.fill(0, s0, s0 + Math.floor(sr / 30)); }
  return { L: T.L, R: T.R };
}
