/**
 * Clip voices: the sound of each verdict clip, from the same data its image
 * uses. The data formations are heard the way the appraisal is (sine tones,
 * clicks, pulses — Ikeda's palette), streaming at the rate the points stream;
 * relief is a bowed plate, chladni is the plate ringing in the mode that shapes its sand, ink is each
 * drop heard blooming under water, the drift (the void) barely touches the room. Every voice
 * cuts in with its shot, rings on under the next (TAIL), and sends only to the short room.
 * Levels: each clip is calibrated to the same loudness, then scaled by how
 * loud and intense Jev heard the word (a dB curve).
 */
import type { Appraisal } from '../jev/appraisal.ts';
import type { Plan, Shot } from '../show/director.ts';
import { beatPeriod, skipped, strikeShot } from '../show/rhythm.ts';
import { D2, dbToGain, type AudioEngine } from './audio.ts';
import type { Drone } from './drone.ts';
import { plateModes } from '../show/chladni.ts';
import { DATA_CLIPS } from '../show/director.ts';
import { loud } from './score.ts';
import { mulberry32 } from '../core/rng.ts';
import { atlasModel } from '../show/atlas.ts';
import { PLUGINS, isPlugin } from '../show/species/index.ts';
import { VOICES } from './species/index.ts';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const PLATE = [1, 2.76, 5.4, 8.93, 13.34, 18.64];
/** Per-clip trims (dB) so each lands near the same loudness at full level (measured with scripts/listen.ts). */
const CAL: Record<Shot['clip'], number> = { relief: 14, chladni: 6, landscape: 4, city: 4, lattice: 2, cloud: 4, tube: 6, drift: 10, hall: 5, curtain: 6, ink: 4, solids: 4, atlas: 2,
  threads: PLUGINS.threads.cal };

/** One shot's voice: `strike` — it carries the verdict's strike; `pos` — a positive word (its beats sit high, no sub);
 *  `tail` — how long it rings on after its cut (s); `off` — when the shot begins on the verdict clock (s). */
type V = { a: AudioEngine; drone: Drone; A: Appraisal; shot: Shot; start: number; end: number; tail: number; off: number; out: AudioNode; rand: () => number; strike: boolean; pos: boolean };

/** The sound never drops out: the picture cuts, but each voice rings on under the next shot (and across the
 *  black between shots) as it fades — a false start's only briefly. */
const TAIL = 0.8;

/** The mood tunes the pitches: positive settles on the just major of D, neutral on exact test frequencies
 *  (half-octaves of 1 kHz), negative stays free (the raw value). */
const JUST = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2];
function tuner(A: Appraisal, pos: boolean): (f: number) => number {
  return (f) => {
    if (pos) { const oct = Math.floor(Math.log2(f / D2)); const r = f / (D2 * 2 ** oct); return D2 * 2 ** oct * JUST.reduce((b, x) => (Math.abs(x - r) < Math.abs(b - r) ? x : b), 1); }
    if (A.mood.neu > A.mood.neg) return 1000 * 2 ** (Math.round(Math.log2(f / 1000) * 2) / 2);
    return f;
  };
}

/** What a plug-in species' voice (src/audio/species/<name>.ts) is given: its span (all its shots: one continuous
 *  voice), the word, the house's tools — and it answers to the same parameters and clock as its image. */
export type VoiceKit = {
  a: AudioEngine; A: Appraisal; plan: Plan;
  /** Audio time of its first shot's start and its last shot's end, and that length (s). */
  start: number; end: number; dur: number;
  /** When it begins on the verdict clock (s): beat k falls at k · beat − off. */
  off: number;
  /** Where to connect (level-calibrated, cut in with the image, ringing on after). */
  out: AudioNode;
  rand: () => number;
  /** A positive word (beats high, no sub); it carries the verdict's strike. */
  pos: boolean; strike: boolean;
  /** The word's base pitch, and the mood's tuning. */
  f0: number; tune: (f: number) => number;
  /** One beat (s), and whether beat k is skipped (a stutter). */
  beat: number; skipped: (k: number) => boolean;
  /** A stereo buffer of the span (+ its tail), filled sample by sample, started at `start`. */
  rendered: (fill: (L: Float32Array, R: Float32Array, sr: number) => void) => AudioBufferSourceNode;
  /** Looping noise over the span. */
  noise: () => AudioBufferSourceNode;
  /** Bandpass resonances of `input` at freqs into `out`. */
  modes: (input: AudioNode, freqs: number[], q: number, gains: number[], out: AudioNode) => void;
  /** The shared beat (tick, stutter, tide): connect it to out. */
  pulse: () => AudioBufferSourceNode;
  /** The strike's deep blow (call it when strike). */
  blow: () => void;
  /** A breathing floor of two sines into out. */
  sines: (freqs: [number, number], out: AudioNode) => void;
};

function kit(v: V, plan: Plan): VoiceKit {
  return {
    a: v.a, A: v.A, plan, start: v.start, end: v.end, dur: v.shot.dur, off: v.off, out: v.out, rand: v.rand, pos: v.pos, strike: v.strike,
    f0: D2 * 4 * Math.pow(2, (v.A.s.pitch - 0.5) * 0.6), tune: tuner(v.A, v.pos), beat: beatPeriod(v.A), skipped,
    rendered: (fill) => rendered(v, fill), noise: () => noiseSrc(v), modes: (i, f, q, g, o) => modes(v, i, f, q, g, o),
    pulse: () => pulse(v), blow: () => blow(v), sines: (f, o) => sines(v, f, o),
  };
}

/** Schedules one shot's voice. Returns pitches worth remembering (drone residue). */
export function playShot(a: AudioEngine, drone: Drone, A: Appraisal, plan: Plan, index: number, t0: number): number[] {
  let shot = plan.shots[index];
  // ink and solids are one continuous scene across their shots, so one continuous voice: the first shot plays
  // the whole span (the picture cuts, the sound carries across — for ink each cut heard as the water changing course)
  if (shot.clip === 'ink' || shot.clip === 'solids' || isPlugin(shot.clip)) {
    const inks = plan.shots.filter((x) => x.clip === shot.clip);
    if (inks[0] !== shot) return [];
    const last = inks[inks.length - 1];
    shot = { ...shot, dur: last.start + last.dur - shot.start };
  }
  const c = a.ctx;
  const start = t0 + shot.start;
  const end = start + shot.dur;
  // how loud the word is, as Jev heard it: −20 dB for an indifferent word, 0 for a scream
  const level = dbToGain(lerp(-7, 0, loud(A)) + CAL[shot.clip]); // a narrow range: intensity is density and sub, not volume
  const tail = shot.aborted ? 0.25 : TAIL;
  const off = shot.start - plan.shots[0].start;
  const gate = c.createGain();
  gate.gain.setValueAtTime(0, start - 0.001);
  gate.gain.linearRampToValueAtTime(level, start + 0.004);
  gate.gain.setValueAtTime(level, end);
  gate.gain.linearRampToValueAtTime(0, end + tail);
  // the sound of the word itself (Jev hears its letters): a round word ("bouba", mother) is heard round —
  // dark, soft; a spiky one ("kiki", fire) sharp — bright, a little saturated; a noisy one (war, rain) with
  // hiss in it, a pure one (bell, om) clean
  const ph = A.s.phonetics, tn = A.s.tone;
  const tilt = c.createBiquadFilter();
  tilt.type = 'lowpass';
  tilt.frequency.value = lerp(1800, 16000, Math.pow(ph, 1.4));
  tilt.Q.value = 0.5;
  const edge = c.createBiquadFilter();
  edge.type = 'highshelf';
  edge.frequency.value = 3000;
  edge.gain.value = lerp(-4, 5, ph);
  const shaper = c.createWaveShaper();
  const k = lerp(0, 3, Math.max(0, ph - 0.5) * 2);
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) { const x = i / 511.5 - 1; curve[i] = k > 0 ? Math.tanh(x * (1 + k)) / Math.tanh(1 + k) : x; }
  shaper.curve = curve;
  // (the word's sound changes the timbre, not the loudness: the brighter and harder, the lower the gain)
  const makeup = c.createGain();
  makeup.gain.value = dbToGain(-lerp(0, 7, Math.max(0, ph - 0.4) / 0.6));
  gate.connect(shaper).connect(tilt).connect(edge).connect(makeup).connect(a.perfDry);
  if (tn > 0.55) {
    const hiss = noiseSrc({ a, start, end, tail, rand: mulberry32(shot.seed ^ 0x415) } as V);
    const hp = c.createBiquadFilter();
    hp.type = 'bandpass'; hp.frequency.value = lerp(2000, 6000, ph); hp.Q.value = 0.7;
    const hg = c.createGain();
    hg.gain.value = 0.03 * (tn - 0.55) / 0.45 * level;
    hiss.connect(hp).connect(hg).connect(a.perfDry);
  }
  // the strike's shot lands with one deep blow (the sound never drops out: the holds are the image's only)
  const strike = index === strikeShot(plan) && A.c.rhythm.p.strike > 0.3;
  const send = c.createGain();
  send.gain.value = shot.aborted ? 0.05 : 0.2;
  gate.connect(send).connect(a.perfSend);
  const pos = A.mood.pos > A.mood.neg && A.mood.pos > A.mood.neu;
  const v: V = { a, drone, A, shot, start, end, tail, off, out: gate, rand: mulberry32(shot.seed), strike, pos };
  // (strike: the ink's voice is scheduled from its first shot, which is the strike's shot)
  switch (shot.clip) {
    case 'atlas': return atlas(v);
    case 'ink': return ink(v, plan);
    case 'solids': return solids(v);
    case 'threads': return VOICES[shot.clip](kit(v, plan));
    case 'relief': return relief(v);
    case 'drift': return drift(v);
    case 'chladni': return chladni(v);
    default: return data(v);
  }
}

function modes(v: V, input: AudioNode, freqs: number[], q: number, gains: number[], out: AudioNode) {
  freqs.forEach((f, i) => {
    if (f > 16000) return;
    const bp = v.a.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = q * (1 + i * 0.3);
    const g = v.a.ctx.createGain();
    g.gain.value = gains[i] ?? gains[gains.length - 1];
    input.connect(bp).connect(g).connect(out);
  });
}

/** A floor of two sines a fraction of a hertz apart: it breathes. The second is softer, so their beating
 *  never cancels to silence (equal sines null once a beat: a dropout). */
function sines(v: V, freqs: [number, number], out: AudioNode) {
  const c = v.a.ctx;
  freqs.forEach((f, i) => {
    const o = c.createOscillator();
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.value = i ? 0.4 : 1;
    o.connect(g).connect(out);
    o.start(v.start); o.stop(v.end + v.tail);
  });
}

function noiseSrc(v: V): AudioBufferSourceNode {
  const n = v.a.ctx.createBufferSource();
  n.buffer = v.a.noise;
  n.loop = true;
  n.loopStart = v.rand() * 2;
  n.start(v.start, n.loopStart);
  n.stop(v.end + v.tail);
  return n;
}

/** A stereo buffer the length of the shot and its tail, filled by `fill(L, R, sr)`. */
function rendered(v: V, fill: (L: Float32Array, R: Float32Array, sr: number) => void): AudioBufferSourceNode {
  const c = v.a.ctx;
  const b = c.createBuffer(2, Math.ceil((v.shot.dur + v.tail) * c.sampleRate), c.sampleRate);
  fill(b.getChannelData(0), b.getChannelData(1), c.sampleRate);
  const s = c.createBufferSource();
  s.buffer = b;
  s.start(v.start);
  return s;
}

// ------------------------------------------------------------------ relief: the plate, bowed
function relief(v: V): number[] {
  const { a, A } = v;
  const c = a.ctx;
  const f0 = D2 * 2 * Math.pow(2, lerp(0.8, -0.2, A.s.weight * 0.6 + A.s.scale * 0.4)); // ≥ D3: the modes sing
  const slow = lerp(1, 0.3, A.lazy);
  // the raking light is the bow: a slow band sweeping up the plate
  const bow = c.createBiquadFilter();
  bow.type = 'bandpass';
  bow.Q.value = 1.2;
  bow.frequency.setValueAtTime(f0 * 0.9, v.start);
  bow.frequency.exponentialRampToValueAtTime(f0 * 0.9 + 3600 * slow, v.end);
  noiseSrc(v).connect(bow);
  const body = c.createGain();
  body.gain.setValueAtTime(0, v.start);
  body.gain.linearRampToValueAtTime(4, v.start + Math.min(1.4, v.shot.dur * 0.4));
  body.connect(v.out);
  const soft = A.c.material.p.cloth + A.c.material.p.flesh;
  modes(v, bow, PLATE.map((r) => f0 * r), lerp(900, 400, soft), [1, 0.7, 0.5, 0.35, 0.25, 0.15], body);
  return [f0 * 2, f0 * 3];
}

// ------------------------------------------------------------------ drift: the void, barely touched
function drift(v: V): number[] {
  const { a, A } = v;
  const c = a.ctx;
  const m = A.c.material.p;
  const slow = lerp(1, 2.8, A.lazy);
  // the room exhales: the drone opens under the light
  v.drone.open(v.start, v.end, lerp(0.3, 1, 1 - A.lazy * 0.5));
  // water: noise through a slowly sweeping feedback comb (the caustics' drift)
  if (m.water > 0.25) {
    const d = c.createDelay(0.05);
    const base = 1 / (D2 * 4);
    d.delayTime.setValueAtTime(base, v.start);
    d.delayTime.linearRampToValueAtTime(base * 1.03, v.end);
    const fb = c.createGain();
    fb.gain.value = 0.7;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 3000;
    const g = c.createGain();
    g.gain.value = 0.05 * m.water;
    noiseSrc(v).connect(lp).connect(d);
    d.connect(fb).connect(d);
    d.connect(g).connect(v.out);
  }
  // motes catching the light: 3 ms glints, high and sparse (never a melody)
  const glints = rendered(v, (L, R, sr) => {
    const count = Math.floor(v.shot.dur * lerp(3, 1.2, A.lazy) / slow * 3);
    for (let k = 0; k < count; k++) {
      const s0 = Math.floor(v.rand() * (L.length - sr * 0.004));
      const f = 6000 + 3000 * v.rand();
      const pan = v.rand() * 1.6 - 0.8;
      for (let i = 0; i < sr * 0.003; i++) {
        const x = Math.sin((2 * Math.PI * f * i) / sr) * 0.03;
        L[s0 + i] += x * (1 - pan);
        R[s0 + i] += x * (1 + pan);
      }
    }
  });
  glints.connect(v.out);
  return [D2 * 2, D2 * 3];
}

// ------------------------------------------------------------------ chladni: the plate itself, in the mode that shapes the sand
function chladni(v: V): number[] {
  const { a, A } = v;
  const c = a.ctx;
  const modes = plateModes(A, v.shot.seed);
  const seg = v.shot.dur / modes.length;
  // a square plate's mode frequency ∝ m² + n²: one bowed resonance per mode, switching with the figure
  const freqOf = ([m, n]: [number, number]) => D2 * 2 * (m * m + n * n) / 8;
  const bowIn = noiseSrc(v);
  const out = c.createGain();
  out.gain.value = 5;
  out.connect(v.out);
  const bands = [1, 2.01, 3.03].map((r, i) => {
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 600 / (1 + i);
    const g = c.createGain();
    g.gain.value = [1, 0.4, 0.2][i];
    bowIn.connect(bp).connect(g).connect(out);
    return { bp, r };
  });
  const tone = c.createOscillator();
  const tg = c.createGain();
  tg.gain.value = 0.03;
  tone.connect(tg).connect(v.out);
  modes.forEach((md: [number, number], k: number) => {
    const t = v.start + k * seg;
    const f = freqOf(md);
    for (const b of bands) b.bp.frequency.setValueAtTime(f * b.r, t);
    tone.frequency.setValueAtTime(f, t);
  });
  tone.start(v.start);
  tone.stop(v.end + v.tail);
  // the sand migrating: grains knocking like tiny stones (resonant clicks, 700–2600 Hz), densest just
  // after each change of mode, then settling — never a hiss
  const grains = rendered(v, (L, R, sr) => {
    const res = [700, 1150, 1800, 2600].map((f) => f * (0.9 + v.rand() * 0.2));
    let t = 0;
    while (t < v.shot.dur) {
      const u = (t % seg) / seg;
      t += -Math.log(1 - v.rand()) / (80 + 520 * Math.exp(-u * seg / 0.6));
      const s0 = Math.floor(t * sr), f = res[Math.floor(v.rand() * 4)], pan = v.rand() * 1.4 - 0.7;
      const amp = 0.03 * (0.3 + v.rand());
      for (let i = 0; i < sr * 0.02 && s0 + i < L.length; i++) {
        const x = Math.sin((2 * Math.PI * f * i) / sr) * Math.exp(-i / (sr * 0.004)) * amp;
        L[s0 + i] += x * (1 - pan); R[s0 + i] += x * (1 + pan);
      }
    }
  });
  grains.connect(v.out);
  return modes.map(freqOf).slice(0, 1);
}


// ------------------------------------------------------------------ data: the formations, heard as the appraisal is heard
function data(v: V): number[] {
  const { A } = v;
  const form = (DATA_CLIPS as readonly string[]).indexOf(v.shot.clip);
  const tape = A.tape;
  const tv = (i: number) => tape[((i % tape.length) + tape.length) % tape.length];
  const rate = lerp(2, 14, A.s.arousal) * lerp(1, 0.35, A.lazy); // values per second, as the image scrolls
  const f0 = D2 * 4 * Math.pow(2, (A.s.pitch - 0.5) * 0.6);
  // the mood tunes the data: positive settles on the just major of D, neutral on exact test frequencies
  // (half-octaves of 1 kHz), negative stays free (the raw value)
  const tune = tuner(A, v.pos);
  const src = rendered(v, (L, R, sr) => {
    const n = L.length;
    if (form === 4) {
      // tube: one continuous tone following the tape around the curve, with its fifth
      let ph = 0, ph2 = 0;
      for (let i = 0; i < n; i++) {
        const u = i / n;
        const k = u * tape.length;
        const val = tv(Math.floor(k)) * (1 - (k % 1)) + tv(Math.floor(k) + 1) * (k % 1);
        const f = tune(f0 * Math.pow(2, (val - 0.5) * 0.5));
        ph += (2 * Math.PI * f) / sr; ph2 += (2 * Math.PI * f * 1.5) / sr;
        // the tone holds 1.5 s, then breaks into grains (never a steady whistle)
        const held = i / sr < 1.5 ? 1 : Math.exp(-(i / sr - 1.5) * 3) + ((i >> 9) % 3 === 0 ? 0.6 : 0);
        const x = (Math.sin(ph) * 0.12 + Math.sin(ph2) * 0.04) * Math.min(1, i / (sr * 0.3)) * held;
        L[i] += x; R[i] += x * 0.9;
      }
      return;
    }
    // the others: a sequence of short events, one per value streaming past
    const step = 1 / (rate * (form === 2 ? 4 : form === 1 ? 1.5 : 1));
    let k = 0;
    for (let t = 0; t < v.shot.dur; t += step, k++) {
      const val = tv(k);
      const s0 = Math.floor(t * sr);
      const pan = Math.sin(k * 0.7) * 0.7;
      if (form === 0) {
        // landscape: a soft sine tone per value, pitch = height, long and overlapping
        const f = tune(f0 * Math.pow(2, val * 2));
        const len = Math.floor(sr * step * 2.5);
        for (let i = 0; i < len && s0 + i < n; i++) {
          const w = Math.sin((Math.PI * i) / len);
          const x = Math.sin((2 * Math.PI * f * i) / sr) * w * 0.05 * (0.3 + val);
          L[s0 + i] += x * (1 - pan); R[s0 + i] += x * (1 + pan);
        }
      } else if (form === 1) {
        // city: a click per bar, its weight the bar's height; the tall ones ring
        const len = Math.floor(sr * (0.004 + val * 0.06));
        const f = 400 + val * 2400;
        for (let i = 0; i < len && s0 + i < n; i++) {
          const x = Math.sin((2 * Math.PI * f * i) / sr) * Math.exp(-i / (sr * 0.004 + val * sr * 0.02)) * 0.3 * val;
          L[s0 + i] += x * (1 - pan); R[s0 + i] += x * (1 + pan);
        }
      } else if (form === 7) {
        // curtain: a fine rain of soft high grains (the falling light), each a short sine, thick with the word's density
        for (let g = 0; g < 6; g++) {
          const f = tune(2000 + val * 3000 + g * 170);
          const g0 = s0 + Math.floor(v.rand() * sr * step);
          const len = Math.floor(sr * 0.03);
          const pan = v.rand() * 1.6 - 0.8;
          for (let i = 0; i < len && g0 + i < n; i++) {
            const x = Math.sin((2 * Math.PI * f * i) / sr) * Math.exp(-i / (sr * 0.008)) * 0.02 * (0.4 + val);
            L[g0 + i] += x * (1 - pan); R[g0 + i] += x * (1 + pan);
          }
        }
      } else if (form === 6) {
        // hall: walking past the columns — each a resonant pillar, a low soft ping as tall as its value (the tall
        // ring lower and longer), passing left and right
        const f = tune(f0 * 0.5 * Math.pow(2, (1 - val) * 1.5));
        const len = Math.floor(sr * (0.3 + val * 1.2));
        const side = k % 2 ? 0.7 : -0.7;
        for (let i = 0; i < len && s0 + i < n; i++) {
          const u = i / sr;
          const x = (Math.sin(2 * Math.PI * f * u) + 0.3 * Math.sin(2 * Math.PI * f * 2.01 * u)) * Math.exp(-u / (0.1 + val * 0.4)) * (1 - Math.exp(-u / 0.004)) * 0.07;
          L[s0 + i] += x * (1 - side); R[s0 + i] += x * (1 + side);
        }
      } else if (form === 2) {
        // lattice: the bits as gated rectangular pulses (a 1 sounds, a 0 is silence)
        const byte = Math.round(Math.min(1, Math.max(0, val)) * 255);
        const len = Math.floor(sr * step * 0.9);
        for (let b = 0; b < 8; b++) {
          if (!((byte >> b) & 1)) continue;
          const b0 = s0 + Math.floor((b / 8) * len);
          for (let i = 0; i < len / 10 && b0 + i < n; i++) { const x = (i >> 3) & 1 ? 0.06 : -0.06; L[b0 + i] += x; R[b0 + i] += x * 0.8; }
        }
      } else {
        // cloud: each point a short FM tone, carrier and modulator from consecutive values
        const fc = 3000 + val * 9000, fm = 200 + tv(k + 1) * 1200, idx = 1 + tv(k + 2) * 3;
        const len = Math.floor(sr * 0.08);
        for (let i = 0; i < len && s0 + i < n; i++) {
          const tt = i / sr;
          const x = Math.sin(2 * Math.PI * fc * tt + idx * Math.sin(2 * Math.PI * fm * tt)) * Math.exp(-tt / 0.03) * 0.08;
          L[s0 + i] += x * (1 - pan); R[s0 + i] += x * (1 + pan);
        }
      }
    }
  });
  // a swelling word grows across the shot, a dwindling one fades
  const env = v.a.ctx.createGain();
  const rp = A.c.rhythm.p;
  env.gain.setValueAtTime(1 - 0.6 * rp.swelling, v.start);
  env.gain.linearRampToValueAtTime(1 + 0.6 * rp.swelling - 0.85 * rp.dwindling, v.end);
  src.connect(env).connect(v.out);
  pulse(v).connect(v.out);
  if (v.strike) blow(v);
  // the points heard as points: a fine grain of 6–15 kHz blips and single-sample clicks, panned wide
  const dust = rendered(v, (L, R, sr) => {
    const rate = lerp(300, 3000, A.s.density * 0.5 + A.s.arousal * 0.5);
    for (let t = 0; t < v.shot.dur; t += -Math.log(1 - v.rand()) / rate) {
      const s0 = Math.floor(t * sr), pan = v.rand() * 2 - 1;
      if (v.rand() < 0.5) { if (s0 < L.length) { L[s0] += 0.05 * (1 - pan); R[s0] += 0.05 * (1 + pan); } continue; }
      const f = 6000 + v.rand() * 9000, len = Math.floor(sr * (0.002 + v.rand() * 0.002));
      for (let i = 0; i < len && s0 + i < L.length; i++) {
        const x = Math.sin((2 * Math.PI * f * i) / sr) * Math.sin((Math.PI * i) / len) * 0.02;
        L[s0 + i] += x * (1 - pan); R[s0 + i] += x * (1 + pan);
      }
    }
  });
  dust.connect(v.out);
  // under the landscape and the city: a floor of sub (two sines beating slowly)
  if (form <= 1 && !v.pos) {
    const c = v.a.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0, v.start);
    g.gain.linearRampToValueAtTime(0.12, v.start + 0.8);
    g.connect(v.out);
    const fs = 38 + A.s.weight * 10;
    sines(v, [fs, fs + 0.9], g);
  }
  return [f0];
}

// ------------------------------------------------------------------ atlas: the plates heard as they are drawn
/** Every element of an atlas plate (show/atlas.ts, the same reveal times as the image) is heard as it appears —
 *  Ikeda's palette: test tones, clicks, a sub — and nothing else. The grid: a short rectangular test tone per
 *  cell, its pitch the answer's value (half-octaves of 1 kHz), a red cell with a deep thump; the focus: a pure tone
 *  gliding up with the wipe to the answer's own pitch, and a thump as it lands; the crowd: each row a rain of
 *  clicks (the reference words, placed in time by their value), this word's own louder and pitched; the map: a soft
 *  ping per word, lower the nearer it is to this one. */
function atlas(v: V): number[] {
  const m = atlasModel(v.A);
  const plate = m.plates[v.shot.seed] ?? m.plates[0];
  const pitch = (x: number) => 1000 * 2 ** (Math.round((x - 0.5) * 6) / 2);
  const src = rendered(v, (L, R, sr) => {
    const n = L.length;
    const tone = (t: number, f: number, dur: number, amp: number, pan = 0) => {
      const s0 = Math.floor(t * sr);
      for (let i = 0; i < dur * sr && s0 + i < n; i++) { const x = Math.sin((2 * Math.PI * f * i) / sr) * amp; L[s0 + i] += x * (1 - pan); R[s0 + i] += x * (1 + pan); }
    };
    const thump = (t: number, amp: number) => {
      const s0 = Math.floor(t * sr);
      let ph = 0;
      for (let i = 0; i < sr * 0.6 && s0 + i < n; i++) { const u = i / sr; ph += (2 * Math.PI * (44 + 60 * Math.exp(-u / 0.02))) / sr; const x = Math.sin(ph) * Math.exp(-u / 0.25) * amp; L[s0 + i] += x; R[s0 + i] += x; }
    };
    const click = (t: number, amp: number, pan: number) => { const s0 = Math.floor(t * sr); if (s0 < n) { L[s0] += amp * (1 - pan); R[s0] += amp * (1 + pan); } };
    if (plate.kind === 'grid') plate.items.forEach((it, k) => {
      const pan = (k % 7) / 3 - 1;
      tone(it.t, pitch(it.value), 0.025, 0.08, pan * 0.7);
      if (it.red) thump(it.t, 0.5);
    });
    if (plate.kind === 'focus') {
      const it = plate.items[0];
      let ph = 0;
      const f1 = pitch(it.value), s0 = Math.floor(it.t * sr), len = Math.floor((it.dur + 1.2) * sr);
      for (let i = 0; i < len && s0 + i < n; i++) {
        const u = i / sr, g = Math.min(1, u / it.dur);
        ph += (2 * Math.PI * (200 * (f1 / 200) ** g)) / sr;
        const x = Math.sin(ph) * 0.07 * Math.min(1, u / 0.02) * (u > it.dur ? Math.exp(-(u - it.dur) / 0.6) : 1);
        L[s0 + i] += x; R[s0 + i] += x;
      }
      thump(it.t + it.dur, 0.7);
    }
    if (plate.kind === 'crowd') plate.items.forEach((it, k) => {
      const d = m.dims[k];
      d.lex.forEach((x) => click(it.t + x * it.dur, 0.12, x * 1.4 - 0.7));
      tone(it.t + d.value * it.dur, pitch(d.value), 0.02, it.red ? 0.14 : 0.06, d.value * 1.4 - 0.7);
    });
    if (plate.kind === 'map') plate.items.forEach((it) => tone(it.t, 3000 + it.value * 5000, 0.012, 0.03, (it.x0 - 0.5) * 1.4));
  });
  src.connect(v.out);
  return [];
}

// ------------------------------------------------------------------ ink: each drop heard as it blooms
/** The same sources and beats as ink.wgsl (sources(), srcPos(), lastBeat(), swell()): on each beat of the verdict
 *  clock one source fires — a soft tone blooms (its pitch the source's value, tuned by the mood, gliding the way
 *  the word moves) with the push of water behind it (noise through a slow resonant sweep: dragging through
 *  water, never a whoosh), panned where the drop falls. Under it the water itself, low and moving. */
function ink(v: V, plan: Plan): number[] {
  const { a, A } = v;
  const c = a.ctx;
  const tape = A.tape;
  const tv = (i: number) => tape[((i % tape.length) + tape.length) % tape.length];
  const n = Math.min(12, Math.max(3, A.bytes.length));
  const P = beatPeriod(A);
  const off = v.off, span = Math.max(0.1, plan.blackAt - plan.shots[0].start);
  const rp = A.c.rhythm.p, mo = A.c.motion.p;
  const f0 = D2 * 4 * Math.pow(2, (A.s.pitch - 0.5) * 0.6) * (A.mood.neg > 0.5 ? 0.5 : 1);
  const tune = tuner(A, v.pos);
  const glide = (mo.rising - mo.falling) * 3; // semitones over a second
  const quick = mo.breaking + mo.trembling * 0.5;
  // the drop rings as its matter: metal long and inharmonic, glass and ice bright, stone short and dull,
  // cloth and flesh muted (the ring's ratio, level and length)
  const m = A.c.material.p;
  const ring = { ratio: m.metal > m.glass + m.ice ? 2.76 : 4.2, amp: Math.min(0.8, m.metal * 1.2 + (m.glass + m.ice) * 0.9), len: lerp(0.3, 1.6, m.metal) };
  const dull = Math.min(1, m.stone + m.cloth + m.flesh + m.wood * 0.5);
  // ice and glass freeze over the verdict (ink.wgsl frozen()): the water under the drops goes still
  const freeze = Math.min(1, m.ice + m.glass + A.c.texture.p.crystalline * 0.7);
  const drops = rendered(v, (L, R, sr) => {
    const len = L.length;
    for (let b = Math.ceil(off / P); b * P < off + v.shot.dur; b++) {
      if (rp.stuttering > 0.35 && skipped(b)) continue;
      const k = b % n;
      const vu = (b * P) / span;
      const amp = Math.max(0.05, 1 + 0.6 * rp.swelling * (2 * vu - 1) - 0.85 * rp.dwindling * vu);
      const ang = (k / n) * Math.PI * 2 + tv(k + 1) * 2;
      const pan = Math.cos(ang) * 0.3 * (0.35 + 0.65 * tv(k)) * 2.4;
      const f = tune(f0 * Math.pow(2, tv(k) * 2 - 0.5));
      const s0 = Math.floor((b * P - off) * sr);
      const dur = Math.floor(sr * (quick > 0.5 ? 0.8 : 2.2));
      // the swash: noise through a state-variable bandpass sweeping from low to the tone's region
      let lo = 0, bp = 0, ph = 0;
      for (let i = 0; i < dur && s0 + i < len; i++) {
        const u = i / sr;
        const fs = Math.min(0.9, 2 * Math.sin((Math.PI * (180 + 700 * (1 - Math.exp(-u / 0.35)))) / sr));
        const x = v.rand() * 2 - 1;
        lo += fs * bp; bp += fs * (x - lo - bp * 0.35);
        const swash = bp * 0.05 * (1 - Math.exp(-u / 0.06)) * Math.exp(-u / lerp(0.45, 0.15, quick));
        ph += (2 * Math.PI * f * Math.pow(2, (glide * Math.min(u, 1)) / 12)) / sr;
        const body = Math.exp(-u / (lerp(0.9, 0.25, quick) * lerp(1, 0.35, dull)));
        const tone = (Math.sin(ph) + ring.amp * Math.sin(ph * ring.ratio) * Math.exp(-u / ring.len)) * 0.09 * (1 - Math.exp(-u / 0.05)) * body;
        const y = (tone + swash) * amp;
        L[s0 + i] += y * (1 - pan * 0.5); R[s0 + i] += y * (1 + pan * 0.5);
      }
    }
  });
  drops.connect(v.out);
  // the water: dark noise, a slow resonance moving through it like the fluid turning
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = lerp(300, 700, A.s.arousal);
  const sw = c.createBiquadFilter();
  sw.type = 'bandpass'; sw.Q.value = 3;
  // the water follows each shot's current (director.ts inkOps, ink.wgsl): a slow drift, a shear rising steadily,
  // one great turn (a slow circling sweep), two cells (swaying between two places) — the cut changes its course
  const ph0 = v.rand() * 6;
  const curve = new Float32Array(Math.max(64, Math.ceil(v.shot.dur * 20))).map((_, i, arr) => {
    const t = v.shot.start + (i / (arr.length - 1)) * v.shot.dur;
    const sh = plan.shots.find((x) => x.clip === 'ink' && t >= x.start && t < x.start + x.dur + 0.4) ?? v.shot;
    const lt = t - sh.start;
    const course = [0.5 + 0.5 * Math.sin(t * 0.37 + ph0), Math.min(1, (lt / sh.dur) * 1.1), 0.5 + 0.5 * Math.sin(lt * 1.3 + ph0), 0.5 + 0.5 * Math.sign(Math.sin(lt * 0.9)) * 0.7];
    return 200 + 300 * course[sh.ops.flow];
  });
  // (smoothed: a change of course glides, it never jumps)
  for (let i = 1; i < curve.length; i++) curve[i] = curve[i - 1] + (curve[i] - curve[i - 1]) * 0.12;
  sw.frequency.setValueCurveAtTime(curve, v.start, v.shot.dur);
  const wg = c.createGain();
  const wl = lerp(0.35, 0.8, A.s.arousal);
  const vu = (x: number) => (off + x) / span;
  wg.gain.setValueAtTime(wl * (1 - freeze * Math.min(1, Math.max(0, (vu(0) - 0.25) / 0.6))), v.start);
  wg.gain.linearRampToValueAtTime(wl * (1 - freeze * Math.min(1, Math.max(0, (vu(v.shot.dur) - 0.25) / 0.6))), v.end);
  noiseSrc(v).connect(lp).connect(sw).connect(wg).connect(v.out);
  pulse(v).connect(v.out);
  if (v.strike) blow(v);
  if (!v.pos) {
    const g = c.createGain();
    g.gain.setValueAtTime(0, v.start);
    g.gain.linearRampToValueAtTime(0.1, v.start + 0.8);
    g.connect(v.out);
    const fs = 36 + A.s.weight * 10;
    sines(v, [fs, fs + 0.7], g);
  }
  return [tune(f0)];
}

// ------------------------------------------------------------------ solids: each letter's spheres struck on the beat, heard as their matter
/** How each matter rings when struck (by MATERIALS name of frame.ts, and the porcelain): partial ratios, their lengths (s), their levels,
 *  and how much noise is in the knock. */
const STRIKE: Record<string, { r: number[]; d: number[]; g: number[]; knock: number }> = {
  metal: { r: [1, 2.76, 5.4, 8.93], d: [2.4, 1.5, 0.8, 0.5], g: [1, 0.6, 0.4, 0.25], knock: 0.1 },
  glass: { r: [1, 2.32, 4.25, 6.63], d: [1.2, 0.8, 0.5, 0.3], g: [1, 0.5, 0.35, 0.2], knock: 0.05 },
  ice: { r: [1.5, 3.5, 6.4], d: [0.6, 0.4, 0.2], g: [1, 0.5, 0.3], knock: 0.3 },
  stone: { r: [1, 1.83, 2.9], d: [0.12, 0.08, 0.05], g: [1, 0.5, 0.3], knock: 0.8 },
  sand: { r: [1, 1.9], d: [0.06, 0.04], g: [0.6, 0.3], knock: 1 },
  wood: { r: [1, 2.57, 4.2], d: [0.25, 0.15, 0.08], g: [1, 0.45, 0.2], knock: 0.4 },
  cloth: { r: [0.5, 0.75], d: [0.08, 0.05], g: [1, 0.4], knock: 0.5 },
  flesh: { r: [0.5, 0.8], d: [0.1, 0.06], g: [1, 0.4], knock: 0.4 },
  water: { r: [1], d: [0.15], g: [1], knock: 0.1 },
  fire: { r: [0.75], d: [0.3], g: [0.6], knock: 1 },
  smoke: { r: [1], d: [0.4], g: [0.15], knock: 0.8 },
  light: { r: [1, 2, 3], d: [1.5, 1, 0.6], g: [1, 0.35, 0.15], knock: 0 },
  void: { r: [0.25], d: [0.4], g: [0.8], knock: 0 },
  // the white porcelain spheres (solids.wgsl's house contrast): a bright ceramic tick
  porcelain: { r: [1, 2.9, 5.2], d: [0.5, 0.3, 0.15], g: [1, 0.4, 0.2], knock: 0.15 },
};

/** The same spheres as solids.wgsl (one per 1-bit of the word's bytes; radiusOf(), matterOf(), lastBeat()): on
 *  each beat of the verdict clock one letter is struck — all its spheres ring together, a chord, each as its matter,
 *  pitched by its size (a large sphere low), tuned by the mood, panned by its bit. Under them, the cluster's hum: a
 *  low bowed resonance of the main matter. */
function solids(v: V): number[] {
  const { a, A } = v;
  const c = a.ctx;
  const tape = A.tape;
  const tv = (i: number) => tape[((i % tape.length) + tape.length) % tape.length];
  const hv = (s: number, salt: number) => (((tv(s + salt) * 7.31 + (s % 8) * 0.618 + salt * 0.137) % 1) + 1) % 1;
  const letters = Math.min(12, Math.max(1, A.bytes.length));
  const bit = (s: number) => ((A.bytes[Math.floor(s / 8)] ?? 0) >> (s % 8)) & 1;
  const P = beatPeriod(A);
  const rp = A.c.rhythm.p;
  const mats = Object.entries(A.c.material.p).sort((x, y) => y[1] - x[1]);
  const share = mats[1][1] / Math.max(1e-6, mats[0][1] + mats[1][1]);
  const matterOf = (s: number) => (hv(s, 5) < 0.16 && (A.c.material.p.void ?? 0) < 0.5 ? 'porcelain' : hv(s, 9) < share ? mats[1][0] : mats[0][0]);
  const point = Object.entries(A.c.shape.p).sort((x, y) => y[1] - x[1])[0][0] === 'point';
  const first = [...Array(96).keys()].find((s) => s < letters * 8 && bit(s)) ?? 0;
  const radius = (s: number) => (point ? (s === first ? 0.3 : 0.022) : (0.035 + 0.075 * Math.pow(hv(s, 3), 1.6)) * lerp(0.85, 1.2, A.s.scale));
  const f0 = D2 * 4 * Math.pow(2, (A.s.pitch - 0.5) * 0.6);
  const tune = tuner(A, v.pos);
  const span = Math.max(0.1, v.shot.dur);
  const struck = rendered(v, (L, R, sr) => {
    for (let b = Math.ceil(v.off / P); b * P < v.off + v.shot.dur; b++) {
      if (rp.stuttering > 0.35 && skipped(b)) continue;
      const letter = b % letters;
      const spheres = [...Array(8).keys()].map((j) => letter * 8 + j).filter(bit);
      if (!spheres.length) continue;
      const vu = (b * P - v.off) / span;
      const amp = Math.max(0.1, 1 + 0.2 * rp.swelling * (2 * vu - 1) - 0.35 * rp.dwindling * vu) * 0.1 / Math.sqrt(spheres.length);
      const s0 = Math.floor((b * P - v.off) * sr);
      for (const s of spheres) {
        const st = STRIKE[matterOf(s)] ?? STRIKE.stone;
        const f = tune(f0 * Math.pow(2, -(radius(s) - 0.07) * 20));
        const pan = ((s % 8) / 7 - 0.5) * 1.2;
        const len = Math.floor(sr * Math.max(...st.d) * 4);
        let lp = 0;
        for (let i = 0; i < len && s0 + i < L.length; i++) {
          const u = i / sr;
          let x = 0;
          for (let j = 0; j < st.r.length; j++) x += Math.sin(2 * Math.PI * f * st.r[j] * u) * st.g[j] * Math.exp(-u / st.d[j]);
          // the knock: a short burst of dark noise (stone, sand, fire's crackle)
          lp += (v.rand() * 2 - 1 - lp) * 0.25;
          x += lp * st.knock * Math.exp(-u / 0.012) * 2;
          x *= amp * (1 - Math.exp(-u / 0.001));
          L[s0 + i] += x * (1 - pan); R[s0 + i] += x * (1 + pan);
        }
      }
    }
  });
  struck.connect(v.out);
  // the hum: the main matter's lowest partials, bowed by slow noise
  const top = STRIKE[mats[0][0]] ?? STRIKE.stone;
  const bow = noiseSrc(v);
  const hum = c.createGain();
  hum.gain.setValueAtTime(0, v.start);
  hum.gain.linearRampToValueAtTime(lerp(1.5, 3, A.s.weight), v.start + 1.5);
  hum.connect(v.out);
  modes(v, bow, top.r.slice(0, 2).map((r) => tune(f0 / 2) * r), 300, [0.5, 0.25], hum);
  pulse(v).connect(v.out);
  if (v.strike) blow(v);
  if (!v.pos) {
    const g = c.createGain();
    g.gain.setValueAtTime(0, v.start);
    g.gain.linearRampToValueAtTime(0.08, v.start + 0.8);
    g.connect(v.out);
    sines(v, [38 + A.s.weight * 10, 38.6 + A.s.weight * 10], g);
  }
  return [tune(f0 / 2)];
}

/** The rhythm Jev hears in the word — the same beats the image keeps (field.wgsl rhythmLight(), and the
 *  holds of show/rhythm.ts): a precise tick on every beat (steady) — on the beats that are not skipped (a
 *  stutter); a slow tide of a low tone (pulsing). (The strike's blow is blow().)
 *  A positive word's beats sit high (no sub: it would sound like grief). Weighted by the rhythm distribution. */
function pulse(v: V): AudioBufferSourceNode {
  const { A } = v;
  const rp = A.c.rhythm.p;
  const P = beatPeriod(A);
  const [f1, f2] = v.pos ? [D2 * 8, D2 * 16] : [58, 290];
  return rendered(v, (L, R, sr) => {
    const n = L.length;
    // the beats of the verdict clock (never restarted by a cut)
    for (let k = Math.ceil(v.off / P); k * P < v.off + v.shot.dur; k++) {
      const amp = rp.steady * 0.55 + (skipped(k) ? 0 : rp.stuttering * 0.6);
      if (amp < 0.02) continue;
      const s0 = Math.floor((k * P - v.off) * sr);
      for (let i = 0; i < sr * 0.1 && s0 + i < n; i++) {
        const u = i / sr;
        // a tick with a partial small speakers carry
        const x = (Math.sin(2 * Math.PI * f1 * u) + 0.4 * Math.sin(2 * Math.PI * f2 * u)) * Math.exp(-u / (v.pos ? 0.015 : 0.03)) * amp * 0.5;
        L[s0 + i] += x; R[s0 + i] += x;
      }
    }
    // pulsing: a tide — a tone rising and ebbing over two beats, in phase with the image's tide
    if (rp.pulsing > 0.05) {
      let ph = 0;
      const f = v.pos ? D2 * 6 : D2 * 1.5;
      for (let i = 0; i < n; i++) {
        const u = v.off + i / sr;
        ph += (2 * Math.PI * f) / sr;
        // (it swells and ebbs, never to nothing: a tide, not a pumping dropout)
        const x = Math.sin(ph) * (0.35 + 0.65 * (0.5 - 0.5 * Math.cos((u / P) * Math.PI))) * 0.2 * rp.pulsing;
        L[i] += x; R[i] += x;
      }
    }
  });
}

/** The strike: one deep blow as the shockwave leaves, ringing out into the reverb. */
function blow(v: V) {
  const { a, A } = v;
  const c = a.ctx;
  const src = rendered(v, (L, R, sr) => {
    let ph = 0;
    for (let i = 0; i < sr * 2.4 && i < L.length; i++) {
      const u = i / sr;
      ph += (2 * Math.PI * (46 + 50 * Math.exp(-u / 0.03))) / sr;
      const x = (Math.sin(ph) + 0.4 * Math.sin(ph * 4) + 0.15 * Math.sin(ph * 6)) * Math.exp(-u / 0.7) * (1 - Math.exp(-u / 0.002)) * 0.8 * A.c.rhythm.p.strike;
      L[i] += x; R[i] += x;
    }
  });
  const g = c.createGain();
  g.gain.value = dbToGain(lerp(-6, 0, loud(A)));
  src.connect(g).connect(a.bus);
  const wet = c.createGain();
  wet.gain.value = 0.5;
  g.connect(wet).connect(a.send);
}
