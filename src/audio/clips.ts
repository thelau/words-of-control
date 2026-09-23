/**
 * Clip voices: the sound of each verdict clip, from the same appraisal the
 * clip draws. One shared material — a resonant plate — excited differently:
 * relief is bowed, fracture is struck and crazed, grains are rained on, haze
 * barely touched. Every voice is hard-cut with its shot (5 ms) and sends to
 * the reverb, so the cut to black leaves only the room ringing.
 */
import type { Appraisal } from '../jev/appraisal.ts';
import type { Shot } from '../show/director.ts';
import { D2, type AudioEngine } from './audio.ts';
import { mulberry32 } from '../core/rng.ts';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const PLATE = [1, 2.76, 5.4, 8.93, 13.34, 18.64];

/** Schedules one shot's voice. Returns pitches worth remembering (drone residue). */
export function playShot(a: AudioEngine, A: Appraisal, shot: Shot, t0: number): number[] {
  const c = a.ctx;
  const start = t0 + shot.start;
  const end = start + shot.dur;
  const gate = c.createGain();
  gate.gain.setValueAtTime(0, start - 0.001);
  gate.gain.linearRampToValueAtTime(1, start + 0.004);
  gate.gain.setValueAtTime(1, end - 0.005);
  gate.gain.linearRampToValueAtTime(0, end);
  gate.connect(a.perfDry);
  const send = c.createGain();
  send.gain.value = shot.aborted ? 0.15 : 0.45;
  gate.connect(send).connect(a.perfSend);
  const v = { a, A, shot, start, end, out: gate, rand: mulberry32(shot.seed) };
  switch (shot.clip) {
    case 'relief': return relief(v);
    case 'fracture': return fracture(v);
    case 'grains': return grains(v);
    case 'haze': return haze(v);
  }
}

type V = { a: AudioEngine; A: Appraisal; shot: Shot; start: number; end: number; out: AudioNode; rand: () => number };

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

/** A buffer of sparse impulses whose density follows `rate(u)` (events/s). */
function crackle(v: V, rate: (u: number) => number, stereo = true): AudioBufferSourceNode {
  const c = v.a.ctx;
  const sr = c.sampleRate;
  const len = Math.ceil(v.shot.dur * sr);
  const b = c.createBuffer(2, len, sr);
  const L = b.getChannelData(0), R = b.getChannelData(1);
  let t = 0;
  while (t < v.shot.dur) {
    const r = Math.max(0.5, rate(t / v.shot.dur));
    t += -Math.log(1 - v.rand()) / r;
    const i = Math.floor(t * sr);
    if (i >= len) break;
    const amp = (0.2 + 0.8 * Math.pow(v.rand(), 3)) * (v.rand() < 0.5 ? 1 : -1);
    const pan = stereo ? v.rand() : 0.5;
    L[i] += amp * (1 - pan);
    R[i] += amp * pan;
  }
  const s = c.createBufferSource();
  s.buffer = b;
  s.start(v.start);
  return s;
}

// ------------------------------------------------------------------ relief: the plate, bowed
function relief(v: V): number[] {
  const { a, A } = v;
  const c = a.ctx;
  const f0 = D2 * Math.pow(2, lerp(1, -1, A.s.weight * 0.6 + A.s.scale * 0.4));
  const bow = c.createBiquadFilter();
  bow.type = 'lowpass';
  bow.Q.value = 0.7;
  // the light sweeping the surface = the bow moving up the plate
  bow.frequency.setValueAtTime(250, v.start);
  bow.frequency.exponentialRampToValueAtTime(lerp(900, 3500, A.s.light), v.end);
  noiseSrc(v).connect(bow);
  const body = c.createGain();
  body.gain.setValueAtTime(0, v.start);
  body.gain.linearRampToValueAtTime(lerp(0.9, 1.6, A.s.intensity), v.start + Math.min(1.4, v.shot.dur * 0.4));
  body.connect(v.out);
  const soft = A.c.material.p.cloth + A.c.material.p.flesh;
  modes(v, bow, PLATE.map((r) => f0 * r), lerp(120, 35, soft), [1, 0.6, 0.4, 0.25, 0.15, 0.1], body);
  if (A.c.texture.p.cracked > 0.25) {
    const cr = crackle(v, (u) => 4 + 30 * u * A.c.texture.p.cracked);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const g = c.createGain();
    g.gain.value = 0.25;
    cr.connect(hp).connect(g).connect(v.out);
  }
  return [f0 * 2, f0 * 2.76];
}

// ------------------------------------------------------------------ fracture: struck, then crazing
function fracture(v: V): number[] {
  const { a, A } = v;
  const c = a.ctx;
  const m = A.c.material.p;
  const bright = lerp(420, 1500, Math.min(1, m.glass + m.ice)) * (m.metal > 0.5 ? 0.6 : 1);
  const ratios = [1, 2.32, 4.25, 6.63, 9.38, 12.6];
  // the strike: a thud, a crack, and the plate ringing
  const thud = c.createOscillator();
  thud.frequency.setValueAtTime(130, v.start);
  thud.frequency.exponentialRampToValueAtTime(42, v.start + 0.25);
  const tg = c.createGain();
  tg.gain.setValueAtTime(lerp(0.3, 0.8, A.s.intensity), v.start);
  tg.gain.exponentialRampToValueAtTime(0.001, v.start + 0.4);
  thud.connect(tg).connect(v.out);
  thud.start(v.start);
  thud.stop(v.start + 0.45);
  const hit = c.createBufferSource();
  hit.buffer = a.noise;
  const hg = c.createGain();
  hg.gain.setValueAtTime(0.7, v.start);
  hg.gain.exponentialRampToValueAtTime(0.001, v.start + 0.05);
  hit.connect(hg);
  hit.start(v.start, v.rand());
  hit.stop(v.start + 0.06);
  const ring = c.createGain();
  ring.gain.value = 0.9;
  ring.connect(v.out);
  modes(v, hg, ratios.map((r) => bright * r * (0.98 + v.rand() * 0.04)), 420, [1, 0.7, 0.5, 0.35, 0.25, 0.15], ring);
  hg.connect(v.out);
  // the crazing: shards ticking as the front spreads (dense early, thinning)
  const speed = lerp(0.35, 2.4, A.s.arousal);
  const cr = crackle(v, (u) => lerp(40, 220, A.s.tension) * Math.exp(-u * 3 / speed) + 6);
  const shard = c.createGain();
  shard.gain.value = 0.55;
  modes(v, cr, ratios.slice(1).map((r) => bright * 1.9 * r), 90, [0.8, 0.6, 0.4, 0.3, 0.2], shard);
  shard.connect(v.out);
  // plates grinding apart
  if (A.c.motion.p.breaking > 0.2) {
    const gr = c.createBiquadFilter();
    gr.type = 'bandpass';
    gr.frequency.value = 380;
    gr.Q.value = 2;
    const gg = c.createGain();
    gg.gain.setValueAtTime(0, v.start + 0.3);
    gg.gain.linearRampToValueAtTime(0.4 * A.c.motion.p.breaking, v.end);
    noiseSrc(v).connect(gr).connect(gg).connect(v.out);
  }
  return [bright, bright * 2.32];
}

// ------------------------------------------------------------------ grains: rained on
function grains(v: V): number[] {
  const { a, A } = v;
  const c = a.ctx;
  const mo = A.c.motion.p, m = A.c.material.p;
  const aro = A.s.arousal;
  const rate = (u: number) =>
    mo.spreading * 2600 * Math.exp(-u * 4) + mo.breaking * 1800 * Math.exp(-u * 3) + mo.falling * lerp(300, 900, u) +
    mo.rising * 500 * (0.5 + u) + mo.drifting * 90 + mo.circling * 400 + mo.trembling * 2200 + mo.still * 30 + mo.contracting * 900 * u + 40 * aro;
  const cr = crackle(v, rate);
  // matter decides the grain's voice
  const f = lerp(2500, 7000, Math.min(1, m.sand + m.ice + m.glass)) * lerp(1, 0.4, Math.min(1, m.fire + m.smoke));
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = f;
  bp.Q.value = lerp(0.8, 4, m.ice + m.glass);
  const g = c.createGain();
  g.gain.value = lerp(0.5, 1.1, A.s.intensity);
  cr.connect(bp).connect(g).connect(v.out);
  if (mo.circling > 0.3) {
    const p = c.createStereoPanner();
    const l = c.createOscillator();
    l.frequency.value = 0.4 + aro;
    l.connect(p.pan);
    l.start(v.start);
    l.stop(v.end);
    g.disconnect();
    g.connect(p).connect(v.out);
  }
  // fire and smoke carry a body under the grains
  if (m.fire + m.smoke > 0.3) {
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = m.fire > m.smoke ? 420 : 180;
    const bg = c.createGain();
    bg.gain.value = 0.5 * (m.fire + m.smoke);
    noiseSrc(v).connect(lp).connect(bg).connect(v.out);
  }
  return [];
}

// ------------------------------------------------------------------ haze: barely touched
function haze(v: V): number[] {
  const { a, A } = v;
  const c = a.ctx;
  const val = A.s.valence;
  const third = val > 0.6 ? 5 / 4 : val < 0.4 ? 6 / 5 : 4 / 3;
  const conf = A.c.emotion.confidence;
  const notes = [2, 3, 4 * third, conf > 0.65 ? 8 : 16 / 3].map((r) => D2 * r);
  const slow = lerp(1, 2.8, A.lazy);
  const body = c.createGain();
  body.gain.setValueAtTime(0, v.start);
  body.gain.linearRampToValueAtTime(0.9, v.start + Math.min(v.shot.dur * 0.5, 1.2 * slow));
  body.connect(v.out);
  const wow = c.createOscillator();
  wow.frequency.value = 0.22 / slow;
  const wd = c.createGain();
  wd.gain.value = 5;
  wow.connect(wd);
  wow.start(v.start);
  wow.stop(v.end + 0.1);
  notes.forEach((f, i) => {
    const o = c.createOscillator();
    o.type = i === 0 ? 'triangle' : 'sine';
    o.frequency.value = f;
    wd.connect(o.detune);
    const g = c.createGain();
    g.gain.value = [0.22, 0.16, 0.11, 0.06][i];
    o.connect(g).connect(body);
    o.start(v.start + i * 0.12 * slow);
    o.stop(v.end + 0.05);
  });
  // air
  const air = c.createBiquadFilter();
  air.type = 'bandpass';
  air.frequency.value = A.c.material.p.water > 0.4 ? 900 : 2400;
  air.Q.value = 0.8;
  const ag = c.createGain();
  ag.gain.value = 0.08 + 0.12 * (A.c.material.p.water + A.c.material.p.smoke);
  noiseSrc(v).connect(air).connect(ag).connect(v.out);
  // motes catching the light: rare soft pings
  const pings = Math.floor(v.shot.dur / (0.8 * slow));
  for (let k = 0; k < pings; k++) {
    const t = v.start + v.rand() * v.shot.dur;
    const o = c.createOscillator();
    o.frequency.value = D2 * [24, 27, 32, 36, 40][Math.floor(v.rand() * 5)];
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.025, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.6);
    o.connect(g).connect(v.out);
    o.start(t);
    o.stop(t + 0.65);
  }
  return [notes[1], notes[2]];
}
