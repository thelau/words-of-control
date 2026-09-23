/**
 * Clip voices: the sound of each verdict clip, from the same data its image
 * uses. One material — a resonant plate — excited differently: relief is
 * bowed (the raking light is the bow), fracture is struck and each crack
 * sings a dispersive chirp as it opens, grains are rained on (windowed noise
 * grains), haze barely touches it (the drone exhales; motes glint), scan reads
 * it (one pure tone tracing the surface the laser crosses), plate is the
 * plate itself ringing in the Chladni mode that shapes its sand. Every
 * voice is hard-cut with its shot and sends only to the short room.
 * Levels: each clip is calibrated to the same loudness, then scaled by how
 * loud and intense Jev heard the word (a dB curve).
 */
import type { Appraisal } from '../jev/appraisal.ts';
import type { Shot } from '../show/director.ts';
import { D2, dbToGain, type AudioEngine } from './audio.ts';
import type { Drone } from './drone.ts';
import { fractureRays } from '../render/fractureRays.ts';
import { plateModes } from '../show/plateModes.ts';
import { mulberry32 } from '../core/rng.ts';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const PLATE = [1, 2.76, 5.4, 8.93, 13.34, 18.64];
/** Per-clip trims (dB) so each lands near the same loudness at full level (measured with scripts/listen.ts). */
const CAL: Record<Shot['clip'], number> = { relief: 0, fracture: 0, grains: -10, haze: 0, scan: -4, plate: -2 };

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
    case 'fracture': return fracture(v);
    case 'grains': return grains(v);
    case 'haze': return haze(v);
    case 'scan': return scan(v);
    case 'plate': return plate(v);
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
  bow.frequency.setValueAtTime(400, v.start);
  bow.frequency.exponentialRampToValueAtTime(400 + 3600 * slow, v.end);
  noiseSrc(v).connect(bow);
  const body = c.createGain();
  body.gain.setValueAtTime(0, v.start);
  body.gain.linearRampToValueAtTime(4, v.start + Math.min(1.4, v.shot.dur * 0.4));
  body.connect(v.out);
  const soft = A.c.material.p.cloth + A.c.material.p.flesh;
  modes(v, bow, PLATE.map((r) => f0 * r), lerp(900, 400, soft), [1, 0.7, 0.5, 0.35, 0.25, 0.15], body);
  return [f0 * 2, f0 * 3];
}

// ------------------------------------------------------------------ fracture: struck, then every crack sings
function fracture(v: V): number[] {
  const { a, A } = v;
  const c = a.ctx;
  const m = A.c.material.p;
  const glass = Math.min(1, m.glass + m.ice);
  const transpose = Math.pow(2, (v.rand() - 0.5) * 0.5); // ±3 semitones, off-lattice: repeats never clone
  // the strike: a 1 ms click, a short thud, and six inharmonic modes ringing
  const click = rendered(v, (L, R) => { for (let i = 0; i < 48; i++) { const x = (Math.random() * 2 - 1) * (1 - i / 48) * 0.9; L[i] = x; R[i] = x; } });
  const ring = c.createGain();
  ring.gain.value = 1.2;
  ring.connect(v.out);
  const base = lerp(600, 1100, glass) * transpose;
  modes(v, click, [1, 1.93, 2.87, 4.12, 5.66, 8.3].map((r) => Math.min(5200, base * r)), lerp(25, 80, glass) * (m.metal > 0.5 ? 0.4 : 1),
    [1, 0.8, 0.6, 0.45, 0.3, 0.2], ring);
  click.connect(v.out);
  const thud = c.createOscillator();
  thud.frequency.setValueAtTime(180, v.start);
  thud.frequency.exponentialRampToValueAtTime(98, v.start + 0.08);
  const tg = c.createGain();
  tg.gain.setValueAtTime(lerp(0.3, 0.7, A.s.intensity), v.start);
  tg.gain.exponentialRampToValueAtTime(0.001, v.start + 0.2);
  thud.connect(tg).connect(v.out);
  thud.start(v.start);
  thud.stop(v.start + 0.25);

  // every crack the image draws (same table) sings a dispersive chirp as it opens: frozen-lake "pew"
  const { data, count } = fractureRays(A, v.shot.seed);
  const speed = lerp(0.6, 4, A.s.arousal * 0.7 + A.s.tension * 0.3) * (count === 2 ? 2.5 : 1);
  const chirps = rendered(v, (L, R, sr) => {
    for (let k = 0; k < count; k++) {
      const o = k * 9 * 4;
      const ang = data[o], len = data[o + 1];
      const at = (0.02 + (1 - len) * 0.4) / speed;
      const dur = 0.02 + 0.04 * len * (count === 2 ? 3 : 1);
      const pan = Math.cos(ang) * 0.8;
      const s0 = Math.floor(at * sr), n = Math.floor(dur * sr);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const u = i / n;
        const f = (7000 * transpose) * Math.pow(900 / 7000, u); // falling, dispersive
        ph += (2 * Math.PI * f) / sr;
        const x = Math.sin(ph) * (1 - u) * 0.12;
        if (s0 + i < L.length) { L[s0 + i] += x * (1 - pan); R[s0 + i] += x * (1 + pan); }
      }
    }
  });
  chirps.connect(v.out);
  // plates grinding apart
  if (A.c.motion.p.breaking > 0.2) {
    const gr = c.createBiquadFilter();
    gr.type = 'bandpass';
    gr.frequency.value = 900;
    gr.Q.value = 3;
    const gg = c.createGain();
    gg.gain.setValueAtTime(0, v.start + 0.3);
    gg.gain.linearRampToValueAtTime(0.25 * A.c.motion.p.breaking, v.end);
    noiseSrc(v).connect(gr).connect(gg).connect(v.out);
  }
  return [base, base * 2];
}

// ------------------------------------------------------------------ grains: rained on
function grains(v: V): number[] {
  const { A } = v;
  const mo = A.c.motion.p, m = A.c.material.p;
  const sparks = Math.min(1, mo.spreading + mo.breaking);
  // density follows what is visible (events per second over the shot)
  const rate = (u: number) =>
    sparks * lerp(9000, 1500, u) + mo.falling * lerp(1500, 4000, u) + mo.rising * 2500 + mo.drifting * 900 + mo.circling * 1800 +
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
      const f = bands[Math.floor(v.rand() * 3)] * (sparks > 0.5 ? Math.pow(0.5, u) : 1); // a burst sweeps down an octave
      const amp = (0.08 + 0.4 * Math.pow(v.rand(), 3)) * 0.5;
      // bursts widen from mono to full; drifting dust pans with its flow
      const pan = sparks > 0.5 ? (v.rand() * 2 - 1) * u : Math.sin(u * 6 + v.rand()) * 0.8;
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

// ------------------------------------------------------------------ plate: the plate itself, in the mode that shapes the sand
function plate(v: V): number[] {
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
  modes.forEach((md, k) => {
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
