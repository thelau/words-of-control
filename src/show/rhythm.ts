/**
 * The rhythm Jev hears in the word, as time: where the image holds still (field.wgsl reads a held clock and
 * a hold flag, set per frame by main.ts). The sound never drops out with it (Laurent: no interruptions); it
 * shares the beat (beatPeriod, skipped) and the strike (strikeShot).
 *   strike — the verdict's first shot lands with one shockwave (0–0.55 s), then the image holds
 *   stuttering — on the beats that skip (the same rule as the image's pulse), time holds for 60% of a beat
 * Times are seconds into the shot.
 */
import type { Appraisal } from '../jev/appraisal.ts';
import type { Plan } from './director.ts';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** One beat (s): tempo from arousal. */
export const beatPeriod = (A: Appraisal) => 60 / lerp(56, 128, A.s.arousal);

/** Whether beat k of a shot skips (a stutter): the same rule as field.wgsl beat(). */
export const skipped = (k: number, variant: number) => ((k * 0.618 + variant * 7.3) % 1) > 0.55;

/** The shot that carries a strike: the verdict's first real shot. */
export const strikeShot = (plan: Plan) => plan.shots.findIndex((s) => !s.aborted);

/** The windows (shot time, s) in which shot i holds still. */
export function holds(A: Appraisal, plan: Plan, i: number): [number, number][] {
  const sh = plan.shots[i];
  const rp = A.c.rhythm.p;
  const out: [number, number][] = [];
  if (rp.strike > 0.3 && i === strikeShot(plan)) out.push([0.55, 0.55 + 0.9 * rp.strike]);
  if (rp.stuttering > 0.3) {
    const P = beatPeriod(A), variant = (sh.seed % 1000) / 1000;
    for (let k = 1; k * P < sh.dur; k++) if (skipped(k, variant)) out.push([k * P, k * P + 0.6 * P]);
  }
  return out;
}

/** The shot's clock with the holds taken out (it stands still inside a window). */
export function heldTime(lt: number, hs: [number, number][]): number {
  let t = lt;
  for (const [a, b] of hs) t -= lt > b ? b - a : lt > a ? lt - a : 0;
  return t;
}

export const isHeld = (lt: number, hs: [number, number][]) => hs.some(([a, b]) => lt > a && lt < b);
