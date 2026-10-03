/**
 * Plays a performance's sound (audio/render.ts) on the image's clock (t0 = its start, audio time): the grid part at
 * once, the steps when the prepare worker hands them over (well before they begin); the tones of what matters held
 * (two, soft) on oscillators from their mark, cut dead on the first step. At the cut to black the hall blooms once (audio.ts).
 */
import type { Appraisal } from '../jev/appraisal.ts';
import type { Grid } from '../show/grid.ts';
import { dbToGain, type AudioEngine } from './audio.ts';
import type { Drone } from './drone.ts';
import { renderGrid, tuning, type Samples } from './render.ts';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Returns where the steps go once rendered. */
export function playPerformance(a: AudioEngine, drone: Drone, A: Appraisal, g: Grid, t0: number): (steps: Samples) => void {
  const c = a.ctx;
  const note = tuning(A);
  const play = (x: Samples, at: number) => {
    const b = c.createBuffer(2, x.L.length, c.sampleRate);
    b.copyToChannel(x.L, 0);
    b.copyToChannel(x.R, 1);
    const src = c.createBufferSource();
    src.buffer = b;
    src.connect(out);
    src.start(at);
  };

  // how loud: as Jev heard the word (a positive one never timid)
  const loud = Math.max(A.s.loudness * 0.5 + A.s.intensity * 0.5, A.mood.pos * 0.5);
  const out = c.createGain();
  // (the mood changes the sound's density: a dark word's rolls and bursts add up, a neutral word is sparse)
  out.gain.value = dbToGain(lerp(0, 8, loud) + 2.5 * A.mood.neg + 7 * A.mood.neu);
  out.connect(a.perfDry);
  const send = c.createGain();
  send.gain.value = 0.12;
  out.connect(send).connect(a.perfSend);
  play(renderGrid(A, g, c.sampleRate), t0);

  // what matters, held: the first two marked answers as soft tones from their mark (into the hall more than dry), cut
  // dead on the first step. (Every marked one held, a tone or a semitone apart and loud, beat into a buzz.)
  const residue: number[] = [];
  for (const k of g.keys) {
    if (residue.length === 2 || !Number.isFinite(g.cells[k].markAt)) continue; // (nonsense: nothing is marked, nothing held)
    const x = g.cells[k], f = note(x.value, 0);
    if (residue.some((r) => Math.abs(Math.log2(f / r)) < 2.5 / 12)) continue;
    const o = c.createOscillator(), gg = c.createGain(), wet = c.createGain();
    o.frequency.value = f;
    gg.gain.setValueAtTime(0, t0 + x.markAt);
    gg.gain.linearRampToValueAtTime(0.006, t0 + x.markAt + 0.25);
    gg.gain.setValueAtTime(0.006, t0 + g.seq - 0.003);
    gg.gain.linearRampToValueAtTime(0, t0 + g.seq);
    wet.gain.value = 3;
    o.connect(gg).connect(out);
    gg.connect(wet).connect(a.perfSend);
    o.start(t0 + x.markAt);
    o.stop(t0 + g.seq + 0.01);
    residue.push(f);
  }

  a.cutAt(t0 + g.end, t0 + g.end + TAIL);
  // (the room comes back under the verdict: the drone returns as where the words stand is shown)
  drone.hush(t0 + g.seq, t0 + g.steps[g.steps.length - 1].t);
  drone.remember({ rough: Math.min(1, A.s.arousal * 0.6 + A.s.tension * 0.4), bright: A.s.light, residue: residue.slice(0, 2) }, t0 + g.end);
  return (steps) => play(steps, t0 + g.seq);
}

/** After the cut to black: the hall rings, then the room returns (s). */
export const TAIL = 1.6;
