/**
 * The score: schedules one performance's sound from the same plan the image
 * plays, on the same clock (t0 = performance start, audio time).
 *
 * - Appraisal: every cut is sonified from the same data it shows — bits as
 *   clicks, digits as rectangular test tones, the spectrum as a sine cluster,
 *   one pure tone that closes with the line — rendered sample-exact into one
 *   dry buffer, so sound and image cut together. The first cut replays how the
 *   word was typed.
 * - Voices: robot voices read the digits on screen (voice.ts, in a worker).
 * - Verdict: one voice per clip (clips.ts), hard-cut with the image, over one to
 *   three beds drawn from the judgement, with every camera cut heard (beds.ts).
 * - Release: the hall blooms once at the cut to black; the drone ducks.
 */
import type { Appraisal } from '../jev/appraisal.ts';
import type { Cut, Plan } from '../show/director.ts';
import { D2, dbToGain, type AudioEngine } from './audio.ts';
import type { Drone } from './drone.ts';
import { playShot } from './clips.ts';
import { playBeds } from './beds.ts';
import type { VoiceSpec } from './voice.ts';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** How loud and intense Jev heard the word (0..1): every layer scales by it. A positive word is never
 *  played timid: it has a floor. */
export const loud = (A: Appraisal) => Math.max(A.s.loudness * 0.5 + A.s.intensity * 0.5, A.mood.pos * 0.5);
const VOICE_SR = 16000;

let worker: Worker | null = null;
let nextId = 1;

export function playPerformance(a: AudioEngine, drone: Drone, A: Appraisal, plan: Plan, t0: number) {
  const buf = renderAppraisal(a.ctx, A, plan.cuts);
  const src = a.ctx.createBufferSource();
  src.buffer = buf;
  const g = a.ctx.createGain();
  // precise, not big: the appraisal follows the word's loudness but stays under the verdict
  g.gain.value = 0.35 * dbToGain(lerp(-6, 0, loud(A)));
  src.connect(g).connect(a.perfDry);
  src.start(t0);

  voices(a, A, plan.cuts, t0);
  const residue: number[] = [];
  for (const shot of plan.shots) residue.push(...playShot(a, drone, A, shot, t0));
  playBeds(a, A, plan, t0);
  a.cutAt(t0 + plan.blackAt, t0 + plan.end);
  drone.duck(t0 + plan.blackAt);
  drone.remember({
    rough: Math.min(1, A.s.arousal * 0.6 + A.s.tension * 0.4),
    bright: A.s.light,
    residue: residue.slice(-2),
  }, t0 + plan.blackAt);
}

// ------------------------------------------------------------------ appraisal
function renderAppraisal(ctx: BaseAudioContext, A: Appraisal, cuts: Cut[]): AudioBuffer {
  const sr = ctx.sampleRate;
  const end = cuts.length ? cuts[cuts.length - 1].start + cuts[cuts.length - 1].dur + 0.1 : 0.5;
  const buf = ctx.createBuffer(2, Math.ceil(end * sr), sr);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const tape = A.tape;
  const tv = (i: number) => tape[((i % tape.length) + tape.length) % tape.length];
  const byteOf = (i: number) => Math.round(Math.min(1, Math.max(0, tv(i))) * 255);
  const aro = A.s.arousal;

  const add = (i: number, l: number, r: number) => { if (i >= 0 && i < L.length) { L[i] += l; R[i] += r; } };
  /** A rectangular-gated test tone starting at a zero crossing: a signal, not a plink. */
  const burst = (t: number, f: number, dur: number, amp: number, pan: number) => {
    const n = Math.floor(dur * sr), s0 = Math.floor(t * sr);
    for (let k = 0; k < n; k++) {
      const v = Math.sin((2 * Math.PI * f * k) / sr) * amp;
      add(s0 + k, v * (1 - pan), v * (1 + pan));
    }
  };

  // the gesture: the first cut replays how the word was typed, as clicks, 4× faster
  let tc = 0;
  for (const dt of A.typing.intervals) {
    tc += dt / 4000;
    if (tc > (cuts[0]?.dur ?? 0.2)) break;
    add(Math.floor(tc * sr), 0.55, 0.55);
  }

  for (const c of cuts) {
    const s0 = Math.floor(c.start * sr), n = Math.floor(c.dur * sr);
    switch (c.mode) {
      case 'barcode': {
        // the bars you see, as clicks: one per set bit, at the scroll rate
        const w = 1 + Math.floor(c.variant * 3);
        const rate = (300 + 2200 * aro) / w;
        for (let b = 0; b < c.dur * rate; b++) {
          if (!((byteOf(Math.floor(b / 8)) >> (b % 8)) & 1)) continue;
          const i = s0 + Math.floor((b / rate) * sr);
          const amp = 0.55 * (b % 2 ? 1 : -1);
          add(i, amp * (b % 3 ? 1 : 0.4), amp * (b % 3 ? 0.4 : 1));
        }
        break;
      }
      case 'numbers': {
        const rows = Math.max(6, Math.floor(c.dur * (18 + 40 * aro)));
        for (let r = 0; r < rows; r++) {
          const digit = Math.floor(tv(r * 7 + Math.floor(c.variant * 97)) * 10) % 10;
          burst(c.start + (r / rows) * c.dur, 1200 + digit * 480, 0.008, 0.12, ((r * 0.37) % 1) * 1.6 - 0.8);
        }
        break;
      }
      case 'spectrum': {
        const k0 = Math.floor(c.variant * 50);
        for (let j = 0; j < 20; j++) {
          const v = tv(k0 + j);
          const f = 110 * Math.pow(2, v * 5.9); // ≤ 6.5 kHz: never a piercing sustained sine
          for (let k = 0; k < n; k++) {
            const x = Math.sin((2 * Math.PI * f * k) / sr) * 0.03 * v * Math.min(1, k / (n * 0.6));
            add(s0 + k, x * (j % 2 ? 0.6 : 1), x * (j % 2 ? 1 : 0.6));
          }
        }
        break;
      }
      case 'bits': {
        const rate = 1600;
        for (let k = 0; k < n; k++) {
          const b = Math.floor((k / sr) * rate);
          const x = (byteOf(Math.floor(b / 8)) >> (b % 8)) & 1 ? ((k >> 2) & 1 ? 0.08 : -0.08) : 0;
          add(s0 + k, x, x * 0.7);
        }
        break;
      }
      case 'scatter': {
        const pts = Math.min(tape.length, 40);
        for (let j = 0; j < pts; j++) burst(c.start + (j / pts) * c.dur * 0.85, 300 + tv(j) * 3600, 0.006, 0.1, tv(j + 1) * 2 - 1);
        break;
      }
      case 'line': {
        // the one sub pulse (rectangular, 55 Hz, 40 ms) as the line appears; a pure D6 that closes with it; a click where it becomes a point
        for (let k = 0; k < sr * 0.04; k++) { const v = Math.sin((2 * Math.PI * 55 * k) / sr) * 0.12; add(s0 + k, v, v); }
        const f = D2 * 16;
        for (let k = 0; k < n; k++) {
          const u = k / n;
          const x = Math.sin((2 * Math.PI * f * k) / sr) * 0.14 * Math.max(0, 1 - Math.max(0, (u - 0.25) / 0.7));
          add(s0 + k, x, x);
        }
        add(s0 + n - 1, 0.7, 0.7);
        break;
      }
    }
  }
  // a hard ceiling only: transients stay hard
  for (const ch of [L, R]) for (let i = 0; i < ch.length; i++) ch[i] = Math.max(-0.98, Math.min(0.98, ch[i]));
  return buf;
}

// ------------------------------------------------------------------ voices
/** The appraisal chorus: reads the bytes and the tape as the cuts show them, doubling to a wall. */
function voices(a: AudioEngine, A: Appraisal, cuts: Cut[], t0: number) {
  if (!cuts.length) return;
  const count = Math.round(lerp(4, 16, A.s.density * 0.5 + A.s.arousal * 0.5));
  render(a, t0, 0.22 * dbToGain(lerp(-6, 0, loud(A))), spec(A, count, cuts.map((c) => ({ start: c.start, dur: c.dur, mode: c.mode })), cuts[cuts.length - 1].start + cuts[cuts.length - 1].dur, 0.8));
}

function spec(A: Appraisal, count: number, cuts: VoiceSpec['cuts'], end: number, spread: number): VoiceSpec {
  const m = A.c.material.p;
  // the first voice reads the word's own bytes; the others read the tape the screen shows
  const bytesDigits = [...A.bytes].flatMap((b) => String(b).split('').map(Number));
  const digits: number[][] = [bytesDigits.length ? bytesDigits : [0]];
  for (let v = 1; v < count; v++) {
    const seq: number[] = [];
    for (let k = 0; k < 12; k++) {
      const x = Math.floor(A.tape[(v * 13 + k) % A.tape.length] * 10000);
      seq.push(...String(x).padStart(4, '0').split('').map(Number));
    }
    digits.push(seq);
  }
  const h = A.s.age < 0.33 ? 4 : A.s.age < 0.66 ? 3 : 2;
  return {
    sr: VOICE_SR, digits, cuts, end,
    f0: D2 * h,
    formantScale: lerp(0.85, 1.25, 1 - A.s.age),
    rate: lerp(2.5, 7, A.s.arousal),
    crush: Math.min(1, 0.3 + A.s.tension * 0.7),
    lead: A.s.dominance,
    whisper: Math.min(1, m.smoke + m.void * 0.7),
    tin: Math.min(1, m.metal + m.glass * 0.6),
    drive: m.fire,
    spread,
    seed: A.seed,
  };
}

/** Render a chorus in the worker and play it from `at`, sample-locked (joining in step if the worker was late). */
function render(a: AudioEngine, at: number, gain: number, sp: VoiceSpec) {
  worker ??= new Worker(new URL('./voice.worker.ts', import.meta.url), { type: 'module' });
  const id = nextId++;
  const onMessage = (e: MessageEvent<{ id: number; pcm: Float32Array }>) => {
    if (e.data.id !== id) return;
    worker!.removeEventListener('message', onMessage);
    const pcm = e.data.pcm;
    const frames = pcm.length / 2;
    const buf = a.ctx.createBuffer(2, frames, VOICE_SR);
    const l = buf.getChannelData(0), r = buf.getChannelData(1);
    for (let i = 0; i < frames; i++) { l[i] = pcm[i * 2]; r[i] = pcm[i * 2 + 1]; }
    const src = a.ctx.createBufferSource();
    src.buffer = buf;
    const g = a.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(a.perfDry);
    const late = Math.max(0, a.now - at);
    src.start(at + late, late);
  };
  worker.addEventListener('message', onMessage);
  worker.postMessage({ id, spec: sp });
}
