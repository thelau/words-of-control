/**
 * What is on screen at time t of a performance (t = seconds since its start,
 * on the audio clock). Pure: the image asks this every frame; the sound was
 * scheduled from the same plan, so they cannot drift apart.
 */
import { CUT_MODES, STILL, layerOf, type ClipId, type Ops, type Plan } from './director.ts';
import type { Layer } from '../render/gpu.ts';

export type Moment = {
  layer: Layer;
  /** The verdict clip on screen (null outside shots). */
  clip: ClipId | null;
  /** Identifies the segment (a new key = a hard cut). */
  key: string;
  lt: number;
  dur: number;
  mode: number;
  variant: number;
  aborted: boolean;
  /** The shot's own seed (0 outside shots). */
  seed: number;
  zoom: number;
  offX: number;
  offY: number;
  /** The camera angle's seed (see director.ts Angle). */
  angle: number;
  /** The data shot's operators (see director.ts Ops). */
  ops: Ops;
  /** Played in the opposite mood (a misreading). */
  flip: boolean;
  flash: number;
  invert: boolean;
  done: boolean;
};

const BLACK = (key: string, done = false): Moment =>
  ({ layer: 'black', clip: null, key, lt: 0, dur: 1, mode: 0, variant: 0, aborted: false, seed: 0, zoom: 1, offX: 0, offY: 0, angle: 0, ops: STILL, flip: false, flash: 0, invert: false, done });

export function momentAt(plan: Plan, t: number, arousal: number): Moment {
  if (t >= plan.end) return BLACK('end', true);
  if (t >= plan.blackAt || t < 0) return BLACK('tail');
  for (let i = 0; i < plan.cuts.length; i++) {
    const c = plan.cuts[i];
    if (t >= c.start && t < c.start + c.dur) {
      const lt = t - c.start;
      return {
        layer: 'appraisal', clip: null, key: `cut${i}`, lt, dur: c.dur, mode: CUT_MODES.indexOf(c.mode), variant: c.variant,
        aborted: false, seed: 0, zoom: 1, offX: 0, offY: 0, angle: 0, ops: STILL, flip: false, flash: 0, invert: arousal > 0.6 && c.variant > 0.86 && c.mode !== 'line' && c.mode !== 'word', done: false,
      };
    }
  }
  for (let i = 0; i < plan.shots.length; i++) {
    const s = plan.shots[i];
    if (t >= s.start && t < s.start + s.dur) {
      const lt = t - s.start;
      // the first real shot of a charged word lands with a white beat, and so does every shot that asks for one
      const beat = s.flash || i === plan.shots.findIndex((x) => !x.aborted);
      const strike = beat ? Math.max(arousal, s.flash ? 0.8 : 0) * 0.9 * Math.exp(-lt / 0.05) : 0;
      let a = s.angles[0];
      for (const x of s.angles) if (x.at <= lt) a = x;
      return {
        layer: layerOf(s.clip), clip: s.clip, key: `shot${i}`, lt, dur: s.dur, mode: 0, variant: (s.seed % 1000) / 1000,
        aborted: s.aborted, seed: s.seed, zoom: a.zoom, offX: a.offX, offY: a.offY, angle: a.seed, ops: s.ops, flip: !!s.flip,
        flash: strike, invert: false, done: false,
      };
    }
  }
  return BLACK('gap');
}
