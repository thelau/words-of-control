/**
 * The score: schedules one performance's sound from the same plan the image
 * plays, on the same clock (t0 = performance start, audio time).
 *
 * - Appraisal: every cut is sonified from the same data it shows (bits →
 *   clicks, digits → blips, spectrum → sine clusters…), rendered sample-exact
 *   into one buffer so sound and image cut together.
 * - Chorus: robot voices "reading" the tape — sawtooth glottis through vowel
 *   formants, staccato syllables, stepwise pitch. Jev's reading sets their
 *   character (age, dominance, arousal, matter: metal rings, smoke whispers).
 * - Verdict: one voice per clip (clips.ts), hard-cut with the image.
 * - Release: the dry path is cut with the image; only the reverb rings on.
 */
import type { Appraisal } from '../jev/appraisal.ts';
import type { Cut, Plan } from '../show/director.ts';
import { D2, type AudioEngine } from './audio.ts';
import type { Drone } from './drone.ts';
import { playShot } from './clips.ts';
import { mulberry32 } from '../core/rng.ts';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function playPerformance(a: AudioEngine, drone: Drone, A: Appraisal, plan: Plan, t0: number) {
  const buf = renderAppraisal(a.ctx, A, plan.cuts);
  const src = a.ctx.createBufferSource();
  src.buffer = buf;
  const g = a.ctx.createGain();
  g.gain.value = 0.9;
  const s = a.ctx.createGain();
  s.gain.value = 0.18;
  src.connect(g).connect(a.perfDry);
  g.connect(s).connect(a.perfSend);
  src.start(t0);

  const verdictAt = plan.shots[0]?.start ?? plan.blackAt;
  chorus(a, A, t0 + 0.08, t0 + verdictAt);
  const residue: number[] = [];
  for (const shot of plan.shots) residue.push(...playShot(a, A, shot, t0));
  a.cutAt(t0 + plan.blackAt, t0 + plan.end);
  drone.remember({
    rough: Math.min(1, A.s.arousal * 0.6 + A.s.tension * 0.4),
    bright: A.s.light,
    residue: residue.slice(-2),
  }, t0 + plan.blackAt);
}

// ------------------------------------------------------------------ appraisal
function renderAppraisal(ctx: BaseAudioContext, A: Appraisal, cuts: Cut[]): AudioBuffer {
  const sr = ctx.sampleRate;
  const end = cuts.length ? cuts[cuts.length - 1].start + cuts[cuts.length - 1].dur + 0.3 : 0.5;
  const buf = ctx.createBuffer(2, Math.ceil(end * sr), sr);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const tape = A.tape;
  const tv = (i: number) => tape[((i % tape.length) + tape.length) % tape.length];
  const byteOf = (i: number) => Math.round(Math.min(1, Math.max(0, tv(i))) * 255);
  const aro = A.s.arousal;

  const add = (i: number, l: number, r: number) => { if (i >= 0 && i < L.length) { L[i] += l; R[i] += r; } };
  const blip = (t: number, f: number, dur: number, amp: number, pan: number) => {
    const n = Math.floor(dur * sr), s0 = Math.floor(t * sr);
    for (let k = 0; k < n; k++) {
      const e = Math.min(1, k / 48) * Math.exp(-k / (n * 0.35));
      const v = Math.sin((2 * Math.PI * f * k) / sr) * e * amp;
      add(s0 + k, v * (1 - pan), v * (1 + pan));
    }
  };

  for (const c of cuts) {
    const s0 = Math.floor(c.start * sr), n = Math.floor(c.dur * sr);
    // a low hit marks the cut (felt more than heard)
    if (c.variant < 0.45 || c.mode === 'line') {
      for (let k = 0; k < sr * 0.09; k++) {
        const f = 62 - 18 * (k / (sr * 0.09));
        const v = Math.sin((2 * Math.PI * f * k) / sr) * Math.exp(-k / (sr * 0.025)) * 0.32;
        add(s0 + k, v, v);
      }
    }
    switch (c.mode) {
      case 'barcode': {
        // the bars you see, as clicks: one per set bit, at the scroll rate
        const w = 1 + Math.floor(c.variant * 3);
        const rate = (300 + 2200 * aro) / w; // bars per second (CSS px basis)
        for (let b = 0; b < c.dur * rate; b++) {
          const bit = (byteOf(Math.floor(b / 8)) >> (b % 8)) & 1;
          if (!bit) continue;
          const i = s0 + Math.floor((b / rate) * sr);
          const amp = 0.5 * (b % 2 ? 1 : -1);
          add(i, amp * (b % 3 ? 1 : 0.4), amp * (b % 3 ? 0.4 : 1));
        }
        break;
      }
      case 'numbers': {
        const rows = Math.max(6, Math.floor(c.dur * (18 + 40 * aro)));
        for (let r = 0; r < rows; r++) {
          const v = tv(r * 7 + Math.floor(c.variant * 97));
          const digit = Math.floor(v * 10) % 10;
          blip(c.start + (r / rows) * c.dur, 1200 + digit * 480, 0.011, 0.1, ((r * 0.37) % 1) * 1.6 - 0.8);
        }
        break;
      }
      case 'spectrum': {
        const k0 = Math.floor(c.variant * 50);
        for (let j = 0; j < 20; j++) {
          const v = tv(k0 + j);
          const f = 110 * Math.pow(2, v * 6.5);
          for (let k = 0; k < n; k++) {
            const reveal = Math.min(1, k / (n * 0.6));
            const e = reveal * Math.min(1, (n - k) / 240) * 0.035 * v;
            const x = Math.sin((2 * Math.PI * f * k) / sr) * e;
            add(s0 + k, x * (j % 2 ? 0.6 : 1), x * (j % 2 ? 1 : 0.6));
          }
        }
        break;
      }
      case 'bits': {
        const rate = 1600;
        for (let k = 0; k < n; k++) {
          const b = Math.floor((k / sr) * rate);
          const bit = (byteOf(Math.floor(b / 8)) >> (b % 8)) & 1;
          const x = bit ? ((k >> 2) & 1 ? 0.07 : -0.07) : 0;
          add(s0 + k, x, x * 0.7);
        }
        break;
      }
      case 'scatter': {
        const pts = Math.min(tape.length, 40);
        for (let j = 0; j < pts; j++) blip(c.start + (j / pts) * c.dur * 0.85, 300 + tv(j) * 3600, 0.03, 0.08, tv(j + 1) * 2 - 1);
        break;
      }
      case 'line': {
        // one pure tone (D6) that closes with the line; a click where it becomes a point
        const f = D2 * 16;
        for (let k = 0; k < n; k++) {
          const u = k / n;
          const e = Math.min(1, k / 200) * (1 - Math.max(0, (u - 0.25) / 0.7)) * 0.16;
          const x = Math.sin((2 * Math.PI * f * k) / sr) * Math.max(0, e);
          add(s0 + k, x, x);
        }
        add(s0 + n - 1, 0.7, 0.7);
        break;
      }
    }
  }
  // gentle saturation keeps the transients hard but the sum bounded
  for (const ch of [L, R]) for (let i = 0; i < ch.length; i++) ch[i] = Math.tanh(ch[i] * 1.2) * 0.9;
  return buf;
}

// ------------------------------------------------------------------ chorus
const VOWELS: [number, number, number][] = [
  [800, 1150, 2900], [400, 1600, 2700], [270, 2300, 3000], [450, 800, 2830],
  [325, 700, 2530], [660, 1700, 2400], [500, 1500, 2500],
];
const JUST = [1, 3 / 2, 2, 5 / 2, 3, 4, 9 / 2, 5];

function chorus(a: AudioEngine, A: Appraisal, from: number, to: number) {
  const c = a.ctx;
  const rand = mulberry32(A.seed ^ 0xc0ffee);
  const voices = Math.round(lerp(4, 11, A.s.density * 0.5 + A.s.arousal * 0.5));
  const syl = lerp(5, 14, A.s.arousal);
  const base = D2 * Math.pow(2, lerp(-0.2, 1.6, A.s.pitch * 0.6 + (1 - A.s.age) * 0.2 + (1 - A.s.dominance) * 0.2));
  const shift = lerp(0.85, 1.3, 1 - A.s.age);
  const m = A.c.material.p;
  const whisper = Math.min(1, m.smoke + m.void * 0.7 + (1 - A.s.loudness) * 0.3);
  const metal = Math.min(1, m.metal + m.glass * 0.6);
  const heat = Math.min(1, m.fire + A.s.arousal * A.s.tension);
  const tape = A.tape;

  const out = c.createGain();
  out.gain.value = lerp(0.05, 0.11, A.s.loudness) / Math.sqrt(voices / 4);
  let tail: AudioNode = out;
  if (heat > 0.4) {
    const ws = c.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) { const x = (i / 511.5 - 1) * (1 + heat * 6); curve[i] = Math.tanh(x); }
    ws.curve = curve;
    out.connect(ws);
    tail = ws;
  }
  if (metal > 0.35) {
    const ring = c.createGain();
    ring.gain.value = 0;
    const mod = c.createOscillator();
    mod.frequency.value = lerp(300, 900, A.s.pitch);
    mod.connect(ring.gain);
    mod.start(from);
    mod.stop(to + 0.1);
    tail.connect(ring);
    const mix = c.createGain();
    mix.gain.value = 1;
    ring.connect(mix);
    tail = mix;
  }
  tail.connect(a.perfDry);
  const snd = c.createGain();
  snd.gain.value = 0.25;
  tail.connect(snd).connect(a.perfSend);

  for (let v = 0; v < voices; v++) {
    const pan = c.createStereoPanner();
    pan.pan.value = (v / Math.max(1, voices - 1)) * 1.6 - 0.8;
    const env = c.createGain();
    env.gain.value = 0;
    env.connect(pan).connect(out);
    const formants = [0, 1, 2].map((k) => {
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = [7, 11, 14][k];
      const g = c.createGain();
      g.gain.value = [1, 0.55, 0.3][k];
      f.connect(g).connect(env);
      return f;
    });
    // glottis: a sawtooth, or breath for whispering matter
    let src: AudioScheduledSourceNode;
    let osc: OscillatorNode | null = null;
    if (rand() < whisper) {
      const n = c.createBufferSource();
      n.buffer = a.noise;
      n.loop = true;
      src = n;
    } else {
      osc = c.createOscillator();
      osc.type = 'sawtooth';
      src = osc;
    }
    for (const f of formants) src.connect(f);
    const start = from + rand() * 0.25;
    src.start(start);
    src.stop(to + 0.05);

    const step = 1 / syl;
    let t = start;
    let j = 0;
    let ratio = JUST[Math.floor(rand() * JUST.length)];
    while (t < to - 0.02) {
      const val = tape[(v * 13 + j) % tape.length];
      if (j % 4 === 0) ratio = JUST[Math.floor(val * JUST.length) % JUST.length]; // robotic stepwise intonation
      if (osc) osc.frequency.setValueAtTime(base * ratio * (v % 3 === 2 ? 0.5 : 1), t);
      const vw = VOWELS[Math.floor(val * VOWELS.length) % VOWELS.length];
      formants.forEach((f, k) => f.frequency.setValueAtTime(vw[k] * shift, t));
      const on = step * lerp(0.55, 0.8, rand());
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(1, t + 0.008);
      env.gain.setValueAtTime(1, Math.min(t + on, to));
      env.gain.linearRampToValueAtTime(0, Math.min(t + on + 0.012, to + 0.02));
      t += step * (0.85 + rand() * 0.3);
      j++;
    }
  }
}
