/**
 * What is on screen at time t of a performance (t = seconds since its start,
 * on the audio clock). Pure: the image asks this every frame; the sound was
 * scheduled from the same plan, so they cannot drift apart.
 */
import { CUT_MODES, type Plan } from './director.ts';
import type { Layer } from '../render/gpu.ts';

export type Moment = {
  layer: Layer;
  /** Identifies the segment (a new key = a hard cut). */
  key: string;
  lt: number;
  dur: number;
  mode: number;
  variant: number;
  aborted: boolean;
  /** The shot's own seed (0 outside shots). */
  seed: number;
  flash: number;
  invert: boolean;
  done: boolean;
};

const BLACK = (key: string, done = false): Moment =>
  ({ layer: 'black', key, lt: 0, dur: 1, mode: 0, variant: 0, aborted: false, seed: 0, flash: 0, invert: false, done });

export function momentAt(plan: Plan, t: number, arousal: number): Moment {
  if (t >= plan.end) return BLACK('end', true);
  if (t >= plan.blackAt || t < 0) return BLACK('tail');
  for (let i = 0; i < plan.cuts.length; i++) {
    const c = plan.cuts[i];
    if (t >= c.start && t < c.start + c.dur) {
      const lt = t - c.start;
      return {
        layer: 'appraisal', key: `cut${i}`, lt, dur: c.dur, mode: CUT_MODES.indexOf(c.mode), variant: c.variant,
        aborted: false, seed: 0, flash: 0, invert: arousal > 0.6 && c.variant > 0.86 && c.mode !== 'line', done: false,
      };
    }
  }
  for (let i = 0; i < plan.shots.length; i++) {
    const s = plan.shots[i];
    if (t >= s.start && t < s.start + s.dur) {
      const lt = t - s.start;
      // the first real shot of a charged word lands with a white beat
      const strike = i === plan.shots.findIndex((x) => !x.aborted) ? arousal * 0.9 * Math.exp(-lt / 0.05) : 0;
      return {
        layer: s.clip, key: `shot${i}`, lt, dur: s.dur, mode: 0, variant: (s.seed % 1000) / 1000,
        aborted: s.aborted, seed: s.seed, flash: strike, invert: false, done: false,
      };
    }
  }
  return BLACK('gap');
}
