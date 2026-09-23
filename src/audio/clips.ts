/**
 * Clip voices: the sound of each verdict clip, from the same data its image
 * uses. The data formations are heard the way the appraisal is (sine tones,
 * clicks, pulses — Ikeda's palette), streaming at the rate the points stream;
 * relief is a bowed plate, chladni is the plate ringing
 * in the mode that shapes its sand, the drift (the void) barely touches the room. Every voice
 * is hard-cut with its shot and sends only to the short room.
 * Levels: each clip is calibrated to the same loudness, then scaled by how
 * loud and intense Jev heard the word (a dB curve).
 */
import type { Appraisal } from '../jev/appraisal.ts';
import type { Shot } from '../show/director.ts';
import { D2, dbToGain, type AudioEngine } from './audio.ts';
import type { Drone } from './drone.ts';
import { plateModes } from '../show/chladni.ts';
import { DATA_CLIPS } from '../show/director.ts';
import { loud } from './score.ts';
import { mulberry32 } from '../core/rng.ts';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const PLATE = [1, 2.76, 5.4, 8.93, 13.34, 18.64];
/** Per-clip trims (dB) so each lands near the same loudness at full level (measured with scripts/listen.ts). */
const CAL: Record<Shot['clip'], number> = { relief: 14, chladni: 6, landscape: 4, city: 4, lattice: 2, cloud: 4, tube: 6, drift: 10, lone: 8 };

type V = { a: AudioEngine; drone: Drone; A: Appraisal; shot: Shot; start: number; end: number; out: AudioNode; rand: () => number };

/** Schedules one shot's voice. Returns pitches worth remembering (drone residue). */
export function playShot(a: AudioEngine, drone: Drone, A: Appraisal, shot: Shot, t0: number): number[] {
  const c = a.ctx;
  const start = t0 + shot.start;
  const end = start + shot.dur;
  // how loud the word is, as Jev heard it: −20 dB for an indifferent word, 0 for a scream
  const level = dbToGain(lerp(-7, 0, loud(A)) + CAL[shot.clip]); // a narrow range: intensity is density and sub, not volume
  const gate = c.createGain();
  gate.gain.setValueAtTime(0, start - 0.001);
  gate.gain.linearRampToValueAtTime(level, start + 0.004);
  gate.gain.setValueAtTime(level, end - 0.005);
  gate.gain.linearRampToValueAtTime(0, end);
  gate.connect(a.perfDry);
  const send = c.createGain();
  send.gain.value = shot.aborted ? 0.05 : 0.2;
  gate.connect(send).connect(a.perfSend);
  const v: V = { a, drone, A, shot, start, end, out: gate, rand: mulberry32(shot.seed) };
  switch (shot.clip) {
    case 'relief': return relief(v);
    case 'drift': return drift(v);
    case 'lone': return lone(v);
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

function noiseSrc(v: V): AudioBufferSourceNode {
  const n = v.a.ctx.createBufferSource();
  n.buffer = v.a.noise;
  n.loop = true;
  n.loopStart = v.rand() * 2;
  n.start(v.start, n.loopStart);
  n.stop(v.end + 0.05);
  return n;
}

/** A stereo buffer the length of the shot, filled by `fill(L, R, sr)`. */
function rendered(v: V, fill: (L: Float32Array, R: Float32Array, sr: number) => void): AudioBufferSourceNode {
  const c = v.a.ctx;
  const b = c.createBuffer(2, Math.ceil(v.shot.dur * c.sampleRate), c.sampleRate);
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
  tone.stop(v.end + 0.02);
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
  const JUST = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2];
  const tune = (f: number) => {
    if (A.mood.pos > A.mood.neg && A.mood.pos > A.mood.neu) {
      const oct = Math.floor(Math.log2(f / D2));
      const r = f / (D2 * 2 ** oct);
      return D2 * 2 ** oct * JUST.reduce((best, x) => (Math.abs(x - r) < Math.abs(best - r) ? x : best), 1);
    }
    if (A.mood.neu > A.mood.neg) return 1000 * 2 ** (Math.round(Math.log2(f / 1000) * 2) / 2); // half-octaves of 1 kHz
    return f;
  };
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
  env.gain.setValueAtTime(1 - 0.4 * rp.swelling, v.start);
  env.gain.linearRampToValueAtTime(1 + 0.4 * rp.swelling - 0.6 * rp.dwindling, v.end);
  src.connect(env).connect(v.out);
  pulse(v).connect(v.out);
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
  if (form <= 1) {
    const c = v.a.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0, v.start);
    g.gain.linearRampToValueAtTime(0.12, v.start + 0.8);
    g.connect(v.out);
    const fs = 38 + A.s.weight * 10;
    for (const f of [fs, fs + 0.9]) { const o = c.createOscillator(); o.frequency.value = f; o.connect(g); o.start(v.start); o.stop(v.end + 0.05); }
  }
  return [f0];
}

// ------------------------------------------------------------------ lone: a name — one pure tone, held, alone
function lone(v: V): number[] {
  const { a, A } = v;
  const c = a.ctx;
  // its pitch is the name's own bytes (their sum, folded into two octaves above D3): each name has its note
  const sum = [...A.bytes].reduce((x, y) => x + y, 0);
  const f = D2 * 2 * Math.pow(2, (sum % 24) / 12);
  const o = c.createOscillator();
  o.frequency.value = f;
  const g = c.createGain();
  g.gain.setValueAtTime(0, v.start);
  g.gain.linearRampToValueAtTime(0.14, v.start + 1.5);
  g.gain.setValueAtTime(0.14, v.end - 2);
  g.gain.linearRampToValueAtTime(0, v.end);
  o.connect(g).connect(v.out);
  o.start(v.start); o.stop(v.end + 0.05);
  return [f];
}

/** The rhythm Jev hears in the word — the same beats the image throbs to (field.wgsl beat()): a low tick on
 *  each beat (steady), a slow swell (pulsing), clicks on the beats that are not skipped (stuttering), one
 *  deep blow at the start (strike). Tempo from arousal; weighted by the rhythm distribution. */
function pulse(v: V): AudioBufferSourceNode {
  const { A } = v;
  const rp = A.c.rhythm.p;
  const P = 60 / lerp(56, 128, A.s.arousal);
  const variant = (v.shot.seed % 1000) / 1000;
  return rendered(v, (L, R, sr) => {
    const n = L.length;
    // steady and stuttering: a tick on each beat (a stutter skips some, by the same rule as the image)
    for (let k = 0; k * P < v.shot.dur; k++) {
      const skipped = ((k * 0.618 + variant * 7.3) % 1) > 0.55;
      const amp = rp.steady * 0.5 + (skipped ? 0 : rp.stuttering * 0.6);
      if (amp < 0.02) continue;
      const s0 = Math.floor(k * P * sr);
      for (let i = 0; i < sr * 0.12 && s0 + i < n; i++) {
        const u = i / sr;
        // a low tick with its 5th partial, so small speakers hear it too
        const x = (Math.sin(2 * Math.PI * 58 * u) + 0.4 * Math.sin(2 * Math.PI * 290 * u)) * Math.exp(-u / 0.03) * amp * 0.5;
        L[s0 + i] += x; R[s0 + i] += x;
      }
      if (rp.stuttering > 0.2 && !skipped) {
        const x = 0.3 * rp.stuttering;
        if (s0 < n) { L[s0] += x; R[s0] -= x; }
      }
    }
    // pulsing: a slow swell of a low tone, in phase with the image's wave
    if (rp.pulsing > 0.05) {
      let ph = 0;
      const f = D2 * 1.5;
      for (let i = 0; i < n; i++) {
        const u = i / sr;
        ph += (2 * Math.PI * f) / sr;
        const x = Math.sin(ph) * (0.5 - 0.5 * Math.cos((u / P) * Math.PI)) * 0.12 * rp.pulsing;
        L[i] += x; R[i] += x;
      }
    }
    // strike: one blow, a falling sine with its partials, ringing out
    if (rp.strike > 0.15) {
      let ph = 0;
      for (let i = 0; i < sr * 1.6 && i < n; i++) {
        const u = i / sr;
        ph += (2 * Math.PI * (46 + 50 * Math.exp(-u / 0.03))) / sr;
        const x = (Math.sin(ph) + 0.35 * Math.sin(ph * 4)) * Math.exp(-u / 0.45) * (1 - Math.exp(-u / 0.002)) * 0.7 * rp.strike;
        L[i] += x; R[i] += x;
      }
    }
  });
}
