/**
 * Clip voices: the sound of each verdict clip, from the same data its image
 * uses. Sand is one material heard five ways: a plate ringing in the mode that
 * shapes it (chladni), wind and saltation (dunes), strikes landing at the
 * exact moments and places the craters open (crater), a blade scraping
 * through (furrow), the bed pouring away (drain). Relief is a bowed plate,
 * dust is rained on, haze barely touches the room, scan traces a surface.
 * Every voice is hard-cut with its shot and sends only to the short room.
 * Levels: each clip is calibrated to the same loudness, then scaled by how
 * loud and intense Jev heard the word (a dB curve).
 */
import type { Appraisal } from '../jev/appraisal.ts';
import type { Shot } from '../show/director.ts';
import { D2, dbToGain, type AudioEngine } from './audio.ts';
import type { Drone } from './drone.ts';
import { plateModes, sandEvents } from '../show/sand.ts';
import { mulberry32 } from '../core/rng.ts';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const PLATE = [1, 2.76, 5.4, 8.93, 13.34, 18.64];
/** Per-clip trims (dB) so each lands near the same loudness at full level (measured with scripts/listen.ts). */
const CAL: Record<Shot['clip'], number> = { relief: 14, dust: -6, haze: 10, scan: 8, iris: 6, chladni: 6, dunes: 4, crater: 0, furrow: 4, drain: 6 };

type V = { a: AudioEngine; drone: Drone; A: Appraisal; shot: Shot; start: number; end: number; out: AudioNode; rand: () => number };

/** Schedules one shot's voice. Returns pitches worth remembering (drone residue). */
export function playShot(a: AudioEngine, drone: Drone, A: Appraisal, shot: Shot, t0: number): number[] {
  const c = a.ctx;
  const start = t0 + shot.start;
  const end = start + shot.dur;
  // how loud the word is, as Jev heard it: −20 dB for an indifferent word, 0 for a scream
  const x = A.s.loudness * 0.5 + A.s.intensity * 0.5;
  const level = dbToGain(lerp(-20, 0, x ** 1.3) + CAL[shot.clip]);
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
    case 'dust': return dust(v);
    case 'haze': return haze(v);
    case 'scan': return scan(v);
    case 'iris': return iris(v);
    case 'chladni': return chladni(v);
    case 'dunes': return dunes(v);
    case 'crater': return crater(v);
    case 'furrow': return furrow(v);
    case 'drain': return drain(v);
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

// ------------------------------------------------------------------ dust: rained on
function dust(v: V): number[] {
  const { A } = v;
  const mo = A.c.motion.p, m = A.c.material.p;
  // density follows what is visible (events per second over the shot)
  const rate = (u: number) =>
    mo.spreading * 1500 + (mo.falling + mo.breaking) * lerp(1500, 4000, u) + mo.rising * 2500 + mo.drifting * 900 + mo.circling * 1800 +
    mo.trembling * 8000 + mo.still * 200 + mo.contracting * 6000 * u + 400;
  // three bands; matter shifts them (sand/ice bright, fire/smoke dark)
  const tilt = lerp(1, 0.45, Math.min(1, m.fire + m.smoke)) * lerp(1, 1.4, Math.min(1, m.sand + m.ice + m.glass));
  const bands = [1500, 4000, 8000].map((f) => f * tilt);
  const src = rendered(v, (L, R, sr) => {
    let t = 0;
    const dur = v.shot.dur;
    while (t < dur) {
      const u = t / dur;
      t += -Math.log(1 - v.rand()) / rate(u);
      const i0 = Math.floor(t * sr);
      const len = Math.floor(sr * (0.001 + 0.003 * v.rand()));
      const f = bands[Math.floor(v.rand() * 3)];
      const amp = (0.08 + 0.4 * Math.pow(v.rand(), 3)) * 0.5;
      // drifting dust pans with its flow
      const pan = Math.sin(u * 6 + v.rand()) * 0.8;
      for (let k = 0; k < len && i0 + k < L.length; k++) {
        const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / len); // Hann window
        const x = Math.sin((2 * Math.PI * f * k) / sr + v.rand() * 6.28) * w * amp;
        L[i0 + k] += x * (1 - pan);
        R[i0 + k] += x * (1 + pan);
      }
    }
  });
  const g = v.a.ctx.createGain();
  g.gain.value = 3;
  src.connect(g).connect(v.out);
  return [];
}

// ------------------------------------------------------------------ haze: barely touched
function haze(v: V): number[] {
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

// ------------------------------------------------------------------ scan: the machine reading the surface
function scan(v: V): number[] {
  const { a, A } = v;
  const c = a.ctx;
  const sweeps = A.s.arousal > 0.55 ? 2 : 1;
  const sweepDur = (v.shot.dur / sweeps) / lerp(1, 0.6, A.lazy);
  const base = D2 * 16 * Math.pow(2, lerp(-0.5, 0.5, A.s.pitch));
  // one thin tone whose pitch traces the profile the laser crosses (the tape stands for the surface)
  const o = c.createOscillator();
  o.type = 'sine';
  const steps = Math.floor(v.shot.dur / 0.05);
  for (let i = 0; i <= steps; i++) {
    const t = v.start + i * 0.05;
    const h = A.tape[(i * 3) % A.tape.length];
    o.frequency.setValueAtTime(base * Math.pow(2, (h - 0.5) * 1.2), t);
  }
  const g = c.createGain();
  g.gain.value = 0.08;
  o.connect(g).connect(v.out);
  o.start(v.start);
  o.stop(v.end + 0.02);
  // a click as each sweep begins
  const clicks = rendered(v, (L, R, sr) => {
    for (let k = 0; k < sweeps; k++) {
      const s0 = Math.floor(k * sweepDur * sr);
      for (let i = 0; i < 24 && s0 + i < L.length; i++) { const x = (i < 12 ? 0.6 : -0.6) * (1 - i / 24); L[s0 + i] += x; R[s0 + i] += x; }
    }
  });
  clicks.connect(v.out);
  return [D2 * 8];
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
  // the sand hissing as it migrates (strongest just after each change of mode)
  const hiss = rendered(v, (L, R, sr) => {
    for (let i = 0; i < L.length; i++) {
      const u = (i / sr) % seg / seg;
      const x = (v.rand() * 2 - 1) * 0.02 * Math.exp(-u * 3);
      L[i] += x; R[i] += x * 0.9;
    }
  });
  const hp = c.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 4000;
  hiss.connect(hp).connect(v.out);
  return modes.map(freqOf).slice(0, 1);
}

/** Poisson grains of band-limited noise (sand hitting sand): rate(u) per second, amplitude amp(u). */
function sandRain(v: V, rate: (u: number) => number, amp: (u: number) => number, band: [number, number]): AudioBufferSourceNode {
  return rendered(v, (L, R, sr) => {
    const dur = v.shot.dur;
    let t = 0;
    while (t < dur) {
      const u = t / dur;
      t += -Math.log(1 - v.rand()) / Math.max(1, rate(u));
      const i0 = Math.floor(t * sr);
      const len = Math.floor(sr * (0.0006 + 0.0015 * v.rand()));
      const f = lerp(band[0], band[1], v.rand());
      const a = amp(u) * (0.2 + 0.8 * Math.pow(v.rand(), 2));
      const pan = v.rand() * 1.4 - 0.7;
      for (let k = 0; k < len && i0 + k < L.length; k++) {
        const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / len);
        const x = Math.sin((2 * Math.PI * f * k) / sr) * w * a;
        L[i0 + k] += x * (1 - pan);
        R[i0 + k] += x * (1 + pan);
      }
    }
  });
}

// ------------------------------------------------------------------ dunes: wind over a bed, grains in saltation
function dunes(v: V): number[] {
  const { a, A } = v;
  const c = a.ctx;
  const ev = sandEvents(A, 'dunes', v.shot.seed, v.shot.dur);
  const w = ev.wind.strength;
  // the wind: noise through a slowly wandering band, in gusts
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.9;
  const g = c.createGain();
  const steps = Math.ceil(v.shot.dur / 0.25);
  for (let i = 0; i <= steps; i++) {
    const t = v.start + i * 0.25;
    const gust = 0.5 + 0.5 * Math.sin(i * 0.9 + v.rand() * 0.8);
    bp.frequency.linearRampToValueAtTime(lerp(280, 1400, w) * (0.8 + 0.4 * gust), t);
    g.gain.linearRampToValueAtTime(lerp(0.08, 0.3, w) * (0.5 + 0.5 * gust), t);
  }
  noiseSrc(v).connect(bp).connect(g).connect(v.out);
  // the grains leaping (saltation): a fine high hiss, denser with the wind
  sandRain(v, () => lerp(300, 4000, w), () => lerp(0.04, 0.1, w), [4500, 9000]).connect(v.out);
  v.drone.open(v.start, v.end, lerp(0.2, 0.6, A.lazy));
  return [D2 * 2];
}

// ------------------------------------------------------------------ crater: blows felt in the body, where and when the image opens them
function crater(v: V): number[] {
  const { A } = v;
  const ev = sandEvents(A, 'crater', v.shot.seed, v.shot.dur);
  const src = rendered(v, (L, R, sr) => {
    for (const m of ev.impacts) {
      const s0 = Math.floor(m.t * sr);
      const big = Math.min(1.4, m.r / 0.1);
      const pan = Math.max(-0.6, Math.min(0.6, (m.x - ev.focus[0]) * 3));
      // the blow: a sub body dropping from ~95 Hz to its rest, with a twin a few Hz away — the air beats
      // (vibration) as it rings out over 1.5–2.5 s; saturation lets a laptop speaker feel it
      const f1 = lerp(62, 50, big), beat = 1.5 + v.rand() * 2.5, tau = 0.7 + 0.6 * big;
      const n = Math.floor(sr * (tau * 3.2));
      let p1 = 0, p2 = 0, lp = 0;
      for (let i = 0; i < n && s0 + i < L.length; i++) {
        const t = i / sr;
        const drop = 1 + 0.55 * Math.exp(-t / 0.06);
        p1 += (2 * Math.PI * f1 * drop) / sr;
        p2 += (2 * Math.PI * (f1 + beat) * drop) / sr;
        const env = (1 - Math.exp(-t / 0.004)) * Math.exp(-t / tau);
        let body = (Math.sin(p1) + 0.8 * Math.sin(p2)) * 0.55 * env;
        body = Math.tanh(body * 1.8) * 0.75;
        // the contact: a muffled, low thud (never a crack)
        lp += 0.06 * ((Math.random() * 2 - 1) - lp);
        const thud = lp * Math.exp(-t / 0.03) * 2.2;
        const x = (body + thud) * lerp(0.6, 1, big / 1.4);
        L[s0 + i] += x * (1 - pan * 0.4);
        R[s0 + i] += x * (1 + pan * 0.4);
      }
      // the ejecta falling back: a soft patter of sand over ~1 s
      for (let k = 0; k < 400 * big + 150; k++) {
        const t = 0.08 + Math.pow(v.rand(), 1.6) * 1.2;
        const i0 = s0 + Math.floor(t * sr);
        const len = Math.floor(sr * (0.0008 + 0.0015 * v.rand()));
        const f = 1800 + 4000 * v.rand();
        const amp = 0.025 * Math.exp(-t * 2) * (0.3 + v.rand());
        const pp = pan + (v.rand() - 0.5) * 1.2;
        for (let j = 0; j < len && i0 + j < L.length; j++) {
          const x = Math.sin((2 * Math.PI * f * j) / sr) * (0.5 - 0.5 * Math.cos((2 * Math.PI * j) / len)) * amp;
          L[i0 + j] += x * (1 - pp * 0.5);
          R[i0 + j] += x * (1 + pp * 0.5);
        }
      }
    }
  });
  src.connect(v.out);
  // the room flinches at the first blow
  v.drone.duck(v.start + ev.impacts[0].t);
  return [D2 * 2 * Math.pow(2, (A.s.pitch - 0.5) * 0.5)];
}

// ------------------------------------------------------------------ furrow: something drawn through water-heavy sand, stones knocking
function furrow(v: V): number[] {
  const { a, A } = v;
  const c = a.ctx;
  const blades = sandEvents(A, 'furrow', v.shot.seed, v.shot.dur).blades;
  // the drag: dark noise through a slow, wide band, swelling with each pass (smoothstep: slow, fast, slow),
  // with a gentle bubbling in its amplitude — a hand pulled through water, never a swoosh
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.5;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass'; bp.Q.value = 0.9;
  const g = c.createGain();
  g.gain.setValueAtTime(0, v.start);
  const bub = c.createOscillator();
  bub.frequency.value = 7 + v.rand() * 5;
  const bubG = c.createGain();
  bubG.gain.value = 0;
  bub.connect(bubG).connect(g.gain);
  bub.start(v.start); bub.stop(v.end + 0.05);
  for (const b of blades) {
    const t0 = v.start + b.t0, t1 = v.start + b.t1;
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      const speed = 6 * u * (1 - u) / 1.5;
      const t = t0 + (t1 - t0) * u;
      bp.frequency.linearRampToValueAtTime(lerp(220, 520, speed), t);
      g.gain.linearRampToValueAtTime(0.9 * speed + 0.03, t);
      bubG.gain.linearRampToValueAtTime(0.15 * speed, t);
    }
    g.gain.setTargetAtTime(0, t1, 0.25);
    bubG.gain.setTargetAtTime(0, t1, 0.25);
  }
  noiseSrc(v).connect(lp).connect(bp).connect(g).connect(v.out);
  // stones knocking and rolling where the blade passes: short two-mode clacks, in little clusters
  const stones = rendered(v, (L, R, sr) => {
    for (const b of blades) {
      for (let t = b.t0; t < b.t1 + 0.4; t += 0.04 + v.rand() * 0.22) {
        const cluster = 1 + Math.floor(v.rand() * 3);
        for (let k = 0; k < cluster; k++) {
          const s0 = Math.floor((t + k * (0.012 + v.rand() * 0.02)) * sr);
          const f1 = 1400 + v.rand() * 1600, f2 = f1 * (2.3 + v.rand() * 0.4);
          const amp = 0.05 * (0.4 + v.rand()), pan = v.rand() * 1.2 - 0.6;
          for (let i = 0; i < sr * 0.05 && s0 + i < L.length; i++) {
            const u = i / sr;
            const x = (Math.sin(2 * Math.PI * f1 * u) + 0.5 * Math.sin(2 * Math.PI * f2 * u)) * Math.exp(-u / 0.008) * amp;
            L[s0 + i] += x * (1 - pan); R[s0 + i] += x * (1 + pan);
          }
        }
      }
    }
  });
  stones.connect(v.out);
  return [D2 * 2];
}

// ------------------------------------------------------------------ drain: the bed pouring away
function drain(v: V): number[] {
  const { a, A } = v;
  const c = a.ctx;
  // the pour: a steady fine trickle, and slumps as the funnel's walls give way
  const slumps: number[] = [];
  for (let t = 0.6 + v.rand(); t < v.shot.dur; t += 0.5 + v.rand() * 1.2) slumps.push(t / v.shot.dur);
  sandRain(v, (u) => 1400 + slumps.reduce((s, x) => s + (u > x && u < x + 0.08 ? 5000 : 0), 0), () => 0.06, [1800, 6000]).connect(v.out);
  // the hollow under it: a low resonance, very quiet, sinking a semitone over the shot
  const o = c.createOscillator();
  const f = D2 * 2 * Math.pow(2, (A.s.pitch - 0.5) * 0.4);
  o.frequency.setValueAtTime(f, v.start);
  o.frequency.linearRampToValueAtTime(f * Math.pow(2, -1 / 12), v.end);
  const g = c.createGain();
  g.gain.setValueAtTime(0, v.start);
  g.gain.linearRampToValueAtTime(0.05, v.start + 1);
  o.connect(g).connect(v.out);
  o.start(v.start);
  o.stop(v.end + 0.02);
  return [f];
}

// ------------------------------------------------------------------ iris: the eye opening around its light
function iris(v: V): number[] {
  const { a, A } = v;
  const c = a.ctx;
  // the light: a held chord (root, fifth, ninth) swelling as the ink rays bloom, its filter opening with them
  const f0 = D2 * 4 * Math.pow(2, (A.s.pitch - 0.5) * 0.6);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = 1.5;
  lp.frequency.setValueAtTime(300, v.start);
  lp.frequency.exponentialRampToValueAtTime(lerp(1200, 5000, A.s.energy), v.start + Math.min(v.shot.dur, 0.8 * v.shot.dur + 0.2));
  const g = c.createGain();
  g.gain.setValueAtTime(0, v.start);
  g.gain.linearRampToValueAtTime(0.12, v.start + v.shot.dur * 0.6);
  lp.connect(g).connect(v.out);
  for (const r of [1, 1.5, 2.25, 3]) for (const det of [-5, 4]) {
    const o = c.createOscillator();
    o.type = r === 1 ? 'triangle' : 'sine';
    o.frequency.value = f0 * r;
    o.detune.value = det;
    o.connect(lp);
    o.start(v.start); o.stop(v.end + 0.05);
  }
  // the pupil contracting at the start of a charged word: one soft sub pulse
  if (A.s.arousal > 0.5) {
    const o = c.createOscillator();
    o.frequency.setValueAtTime(70, v.start);
    o.frequency.exponentialRampToValueAtTime(52, v.start + 0.4);
    const pg = c.createGain();
    pg.gain.setValueAtTime(0.5 * A.s.arousal, v.start);
    pg.gain.setTargetAtTime(0, v.start + 0.05, 0.3);
    o.connect(pg).connect(v.out);
    o.start(v.start); o.stop(v.start + 1.6);
  }
  // glitter: sparse, soft high glints (as slow as the twinkle)
  sandRain(v, () => 6, () => 0.05, [5000, 9000]).connect(v.out);
  return [f0, f0 * 1.5];
}
