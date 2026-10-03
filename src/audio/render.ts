/**
 * The performance's sound as samples (no audio context: it also runs in the prepare worker). Two parts, from the
 * score (show/grid.ts):
 *   renderGrid  — from the start to just past the cut into the steps: each result a short pluck at its value (a
 *                 choice two, a yes/no a tick; a doubtful one breath), the cells going out in batches, a dry tick
 *                 each; the cut a hard transient
 *   renderSteps — from the steps' start to the end: a sequencer building one crescendo (see renderSteps), bent by
 *                 the word's mood; the last step the pitch of where the word stands, alone, briefly
 * Pitches on the house's D, in a mode from the mood.
 */
import type { Appraisal } from '../jev/appraisal.ts';
import type { Grid, Viz } from '../show/grid.ts';
import { COLS, euclid, patterns } from '../show/grid.ts';
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

/** A resonant state-variable filter (topology-preserving: stable at any cutoff, swept per sample). */
class SVF {
  lp = 0;
  bp = 0;
  private a = 0;
  private b = 0;
  private sr: number;
  constructor(sr: number) { this.sr = sr; }
  run(x: number, f: number, q: number) {
    const g = Math.tan((Math.PI * Math.min(f, this.sr * 0.45)) / this.sr), k = 1 / q;
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x - this.b, v1 = a1 * this.a + a2 * v3, v2 = this.b + a2 * this.a + a3 * v3;
    this.a = 2 * v1 - this.a;
    this.b = 2 * v2 - this.b;
    this.bp = v1 * k; // (normalised: unity at the centre)
    return (this.lp = v2);
  }
}

/** How a plucked voice sounds: FM (modulator `ratio` × f, `index`), then a wavefold, then the low-pass gate —
 *  `bright` how far the filter opens on the strike, `q` its resonance. */
export type Patch = { ratio: number; index: number; fold: number; bright: number; q: number };

/** A stereo tape from `from` to `to` (s, performance time), and the marks written onto it — each mark also sent to
 *  the room (sL, sR) by the current `send`. */
function tape(from: number, to: number, sr: number, rand: () => number) {
  const len = Math.ceil((to - from) * sr);
  const L = new Float32Array(len), R = new Float32Array(len), sL = new Float32Array(len), sR = new Float32Array(len);
  const at = (t: number) => Math.floor((t - from) * sr);
  let wet = 0;
  const put = (i: number, x: number, pan: number) => {
    if (i < 0 || i >= len) return;
    L[i] += x * (1 - pan); R[i] += x * (1 + pan);
    if (wet) { sL[i] += x * wet * (1 - pan); sR[i] += x * wet * (1 + pan); }
  };
  return {
    L, R, sL, sR, at, put,
    /** How much of what follows goes to the room. */
    send(w: number) { wet = w; },
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
    /** A metallic tick: noise rung through a resonant band-pass at f, gone in a few ms. */
    tick(t: number, f: number, amp: number, pan = 0, tau = 0.003, q = 8) {
      const s0 = at(t), n = Math.floor(tau * 7 * sr), bp = new SVF(sr);
      for (let i = 0; i < n; i++) { bp.run(rand() * 2 - 1, f, q); put(s0 + i, bp.bp * amp * Math.exp(-i / sr / tau) * Math.min(1, i / 8), pan); }
    },
    /** A kick: a sine falling onto f, its pitch and level decaying, softly saturated. */
    kick(t: number, f: number, amp: number, tau: number) {
      const s0 = at(t), n = Math.floor(tau * 6 * sr);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const x = i / sr;
        ph += (2 * Math.PI * f * (1 + 2.5 * Math.exp(-x / 0.012))) / sr;
        put(s0 + i, (Math.tanh(1.8 * Math.sin(ph)) / Math.tanh(1.8)) * amp * Math.exp(-x / tau) * Math.min(1, i / 24), 0);
      }
    },
    /** A plucked complex oscillator through a low-pass gate (as on a Buchla: one vactrol-like envelope opens the
     *  filter and the amp together, so a note darkens as it dies), a few cents apart left and right. */
    pluck(t: number, f: number, decay: number, amp: number, pan: number, p: Patch) {
      const s0 = at(t), n = Math.floor(decay * 5 * sr), fl = new SVF(sr), fr = new SVF(sr);
      const wl = (2 * Math.PI * f * 0.9983) / sr, wr = (2 * Math.PI * f * 1.0017) / sr, wm = (2 * Math.PI * f * p.ratio) / sr;
      for (let i = 0; i < n; i++) {
        const x = i / sr;
        const env = Math.min(1, x / 0.0015) * (0.6 * Math.exp(-x / (decay * 0.2)) + 0.4 * Math.exp(-x / decay));
        const m = Math.sin(wm * i) * p.index * env, cut = f * (0.8 + p.bright * 14 * env * env);
        const l = fl.run(Math.sin(p.fold * Math.sin(wl * i + m)), cut, p.q), r = fr.run(Math.sin(p.fold * Math.sin(wr * i + m)), cut, p.q);
        const a = env * amp;
        // (written straight: the two sides differ)
        const k = s0 + i;
        if (k < 0 || k >= len) continue;
        L[k] += l * a * (1 - pan); R[k] += r * a * (1 + pan);
        if (wet) { sL[k] += l * a * wet * (1 - pan); sR[k] += r * a * wet * (1 + pan); }
      }
    },
  };
}

/** A tape echo on (L, R) from sample `start`: ping-pong at `d` samples, the delay wavering a little (wow), each
 *  repeat darker and thinner (low- and high-pass in the loop) and softly saturated; `fb(i)` the feedback. */
function echo(L: Float32Array, R: Float32Array, start: number, d: number, fb: (i: number) => number, sr: number) {
  const kl = 1 - Math.exp((-2 * Math.PI * 2600) / sr), kh = 1 - Math.exp((-2 * Math.PI * 160) / sr);
  let ll = 0, lr = 0, hl = 0, hr = 0;
  const read = (X: Float32Array, p: number) => { const j = Math.floor(p), u = p - j; return j < 1 ? 0 : X[j] * (1 - u) + X[j + 1] * u; };
  for (let i = Math.max(start, d + 2); i < L.length; i++) {
    const p = i - d * (1 + 0.0025 * Math.sin((2 * Math.PI * 0.45 * i) / sr) + 0.0007 * Math.sin((2 * Math.PI * 5.3 * i) / sr));
    ll += kl * (read(R, p) - ll); lr += kl * (read(L, p) - lr);
    hl += kh * (ll - hl); hr += kh * (lr - hr);
    const f = fb(i);
    L[i] += Math.tanh(1.4 * (ll - hl)) / 1.4 * f;
    R[i] += Math.tanh(1.4 * (lr - hr)) / 1.4 * f;
  }
}

export type Samples = { L: Float32Array<ArrayBuffer>; R: Float32Array<ArrayBuffer>; sL: Float32Array<ArrayBuffer>; sR: Float32Array<ArrayBuffer> };

export function renderGrid(A: Appraisal, g: Grid, sr: number): Samples {
  const T = tape(0, g.seq + 0.5, sr, mulberry32(A.seed ^ 0x51ed));
  const col = (k: number) => ((k % COLS) / (COLS - 1)) * 1.4 - 0.7; // a cell's column as a pan
  const note = tuning(A);
  const glass: Patch = { ratio: 3.01, index: 0.6, fold: 1.1, bright: 0.6, q: 2.2 };
  // each result lands: a short pluck at its value in the word's mode (a choice: its first two options), a yes/no a
  // tick, a doubtful one breath
  T.send(0.35);
  g.cells.forEach((x, k) => {
    const t = x.arrive, pan = col(k);
    if (x.conf < 0.45) T.tick(t, 900 + 1400 * x.value, 0.06, pan, 0.012, 1.2);
    else if (x.kind === 0) T.pluck(t, note(x.value, 1), 0.07, 0.05, pan, glass);
    else if (x.kind === 1) { T.pluck(t, note(x.value, 1), 0.05, 0.04, pan, glass); T.pluck(t + 0.035, note([...x.probs].sort((p, q) => q - p)[1] ?? 0, 1), 0.04, 0.03, pan, glass); }
    else T.tick(t, 5200, 0.22, pan, 0.0015, 10);
  });
  // each batch going out: one dry tick, panned where its cells are
  T.send(0.1);
  const batch = new Map<number, number[]>();
  g.cells.forEach((x, k) => { if (x.key < 0 && Number.isFinite(x.vanish)) batch.set(x.vanish, [...(batch.get(x.vanish) ?? []), col(k)]); });
  for (const [t, p] of batch) T.tick(t, 2400, 0.35, p.reduce((a, b) => a + b, 0) / p.length, 0.002, 4);
  // the cut into the steps: one hard transient
  T.send(0);
  T.noise(g.seq, 0.04, 0.25, 0, 0.012);
  T.kick(g.seq, 42, 0.5, 0.08);
  return { L: T.L, R: T.R, sL: T.sL, sR: T.sR };
}

/** How each space colours the sequencer (the patterns and the register stay; only the timbre moves with the bar). */
const PATCH: Record<Viz, Patch> = {
  tiles: { ratio: 1, index: 0.8, fold: 1.0, bright: 0.5, q: 1.6 },
  cloud: { ratio: 1, index: 0.5, fold: 0.9, bright: 0.5, q: 1.4 },
  network: { ratio: 2, index: 1.6, fold: 1.6, bright: 0.7, q: 2.5 },
  ridges: { ratio: 3.5, index: 1.1, fold: 1.2, bright: 0.6, q: 3.5 },
  table: { ratio: 1.5, index: 2.4, fold: 2.2, bright: 0.8, q: 1.8 },
  terrain: { ratio: 0.5, index: 1.2, fold: 1.0, bright: 0.45, q: 4 },
  axis: { ratio: 2, index: 0.8, fold: 1.4, bright: 0.6, q: 2.2 },
  stand: { ratio: 1, index: 0, fold: 0.5, bright: 0.3, q: 0.7 },
};


/** The steps, as samples starting at g.seq: one crescendo over the bars. Each marked answer is a note — which degree
 *  of the word's mode by which answer it is, moved up or down by how far it stands from the reference words (not by
 *  its value: those crowd near 1). Two voices play them on fixed euclidean patterns, the second one note longer (K
 *  and K + 1: they drift in and out of phase): plucked complex oscillators through a low-pass gate, the space on
 *  screen choosing the patch, opening a little more each bar. Bar one the first voice, bar two both, then a tape echo
 *  (dotted eighth, ping-pong) whose feedback grows; when the words earn three bars or more, the one before the last
 *  stripped back to one voice, long notes, no pulse; the last in full. Ticks rung through resonant filters, kicks.
 *  Jev's doubt about what matters puts the notes out of tune by as much. The mood:
 *  negative — by subtraction: no tune — a fixed grid of metallic ticks, a test-tone blip per answer, short kicks,
 *             the echo short-lived;
 *  neutral  — clinical: test-tone pitches (half-octaves of 1 kHz), pure tones, no kick;
 *  positive — lydian, higher, softer and longer, a pad of the answers under it all, more of it in the room. */
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
  // Jev's doubt about what matters: the notes drift out of tune by as much (up to ±0.4 semitone)
  const doubt = g.keys.reduce((a, k) => a + Math.min(1, Math.max(0, (0.75 - g.cells[k].conf) / 0.6)), 0) / Math.max(1, g.keys.length);
  const drift = () => 2 ** (((rand() - 0.5) * 0.8 * doubt) / 12);
  const sixteenth = g.beat / 4;
  const { a: patA, b: patB } = patterns(A);
  const subs = euclid(3 + Math.round(2 * A.s.intensity), 8);
  const tonal = neg <= 0.6;

  // ---- the voices, onto a tape of their own for the echo
  const V = tape(g.seq, g.end + 0.05, sr, rand);
  let n16 = 0, open = 0.75;
  const spaceSteps = g.steps.filter((st) => st.viz !== 'stand');
  for (const st of spaceSteps) {
    const base = PATCH[st.viz], tame = 1 - 0.6 * neu - 0.4 * pos;
    const p: Patch = { ...base, fold: base.fold * tame, index: base.index * tame, bright: Math.min(1, base.bright * open) };
    const count = Math.round(st.dur / sixteenth);
    for (let i = 0; i < count; i++, n16++) {
      const t = st.t + i * sixteenth, bar = st.bar;
      // (the stripped bar: one voice, long notes, no pulse — then the last bar returns in full)
      const stripped = st.strip, gate = (stripped ? 0.45 : 0.12 + 0.05 * bar) * (1 + 0.8 * pos);
      if (tonal) {
        if (patA[n16 % 16]) V.pluck(t, deg(seqA[n16 % seqA.length], 0) * drift(), gate * 0.5, 0.11, -0.45, p);
        if (bar >= 1 && !stripped && patB[n16 % 16]) V.pluck(t, deg(seqB[n16 % seqB.length], 1) * drift(), gate * 0.4, 0.07, 0.45, { ...p, ratio: p.ratio * 2 });
      } else if (patA[n16 % 16]) {
        // (negative: a test-tone blip per answer instead of a tune)
        V.tone(t, 1000 * 2 ** (seqA[n16 % seqA.length] / 4), 0.012, 0.05, (n16 % 2) * 1.2 - 0.6);
      }
    }
    open *= 1.12;
  }
  // the tape echo (dotted eighth), its feedback growing over the bars from the third (a negative word's dies sooner)
  {
    const start = V.at(g.seq + 32 * sixteenth), span = 32 * sixteenth * sr, top = 0.55 - 0.25 * neg;
    echo(V.L, V.R, start, Math.floor(3 * sixteenth * sr), (i) => Math.min(top, 0.25 + ((i - start) / span) * 0.3), sr);
  }
  const room = 0.25 + 0.35 * pos - 0.15 * neg;
  for (let i = 0; i < T.L.length; i++) {
    T.L[i] += V.L[i]; T.R[i] += V.R[i];
    T.sL[i] += V.L[i] * room; T.sR[i] += V.R[i] * room;
  }

  // ---- the pulse: ticks and kicks on fixed patterns; the negative grid of ticks
  const ticks = euclid(3 + Math.round(6 * A.s.arousal), 16), grid = euclid(9 + Math.round(4 * A.s.arousal), 16, 1);
  n16 = 0;
  T.send(0.08);
  for (const st of spaceSteps) {
    const count = Math.round(st.dur / sixteenth);
    for (let i = 0; i < count; i++, n16++) {
      const t = st.t + i * sixteenth;
      if (st.strip) continue; // (the stripped bar: no pulse)
      if (ticks[n16 % 16]) T.tick(t, 7200 + 1800 * ((n16 * 5) % 3), 0.16 * (1 - 0.6 * pos), (n16 % 2) * 0.8 - 0.4, 0.0018, 5);
      if (neu < 0.5 && n16 % 2 === 0 && subs[(n16 / 2) % 8]) T.kick(t, 48, 0.17 * (1 - 0.5 * pos), 0.04 + 0.04 * (1 - neg));
      if (!tonal && grid[n16 % 16]) T.tick(t, 3600 + 900 * (n16 % 4), 0.3, (n16 % 4) * 0.4 - 0.6, 0.0012, 12);
    }
    if (st.full) { T.noise(st.t, 0.04, 0.25, 0, 0.02); T.tick(st.t, 4000 + 2000 * g.cells[g.stand].value, 0.12, 0, 0.01, 30); }
  }
  // a positive word: a pad of the answers that matter, breathing with the bars, mostly in the room
  if (pos > 0.4) {
    const fs = notes.slice(0, 4).map((j) => (2 * Math.PI * deg(j, -1)) / sr), s0 = T.at(g.seq), n = T.at(g.steps[g.steps.length - 1].t) - s0, bar = 16 * sixteenth * sr;
    T.send(1.5);
    for (let i = 0; i < n; i++) {
      let l = 0, r = 0;
      for (const w of fs) { l += Math.sin(w * 0.998 * i) + 0.25 * Math.sin(w * 2.003 * i); r += Math.sin(w * 1.002 * i) + 0.25 * Math.sin(w * 1.997 * i); }
      const a = 0.005 * pos * (0.6 + 0.4 * Math.sin((Math.PI * i) / bar)) * Math.min(1, i / (sr * 0.3));
      T.put(s0 + i, l * a, -0.5); T.put(s0 + i, r * a, 0.5);
    }
  }
  // where it stands: the pitch of that answer, alone — a second at most, never high (folded below ~500 Hz)
  const last = g.steps[g.steps.length - 1];
  let f = deg(notes[g.keys.indexOf(g.stand)] ?? notes[0], 0);
  while (f > 520) f /= 2;
  T.send(0.6);
  T.pluck(last.t, f, Math.min(1, last.dur) * 0.45, 0.16, 0, PATCH.stand);
  return { L: T.L, R: T.R, sL: T.sL, sR: T.sR };
}
