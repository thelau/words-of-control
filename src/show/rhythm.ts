/**
 * The rhythm Jev hears in the word, shared by image (field.wgsl) and sound (clips.ts): the beat's tempo,
 * which beats a stutter skips, and which shot carries the strike. Nothing ever stops: no frozen image, no
 * drop in the sound (Laurent) — a strike is a shockwave and a blow, a stutter is a beat that does not come.
 */
import type { Appraisal } from '../jev/appraisal.ts';
import type { Plan } from './director.ts';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** One beat (s): tempo from arousal (field.wgsl beatP()). */
export const beatPeriod = (A: Appraisal) => 60 / lerp(56, 128, A.s.arousal);

/** Whether beat k of the verdict skips (a stutter): the same rule as field.wgsl rhythmLight() and the species'
 *  lastBeat(). Beats count on the verdict clock, so a cut never restarts them. */
export const skipped = (k: number) => ((k * 0.618) % 1) > 0.55;

/** The shot that carries a strike: the verdict's first real shot. */
export const strikeShot = (plan: Plan) => plan.shots.findIndex((s) => !s.aborted);
