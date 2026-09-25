/** Contours — the reading as land drawn only by lines of light (contours.wgsl; its voice audio/species/contours.ts).
 *  It opens on the appraisal's spectrum, flat-on, and tilts it into a landscape whose ridges are its rows. */
import type { Appraisal } from '../../jev/appraisal.ts';
import type { SpeciesDef } from './types.ts';

// (keep in step with contours.wgsl: NX cells across × NRMAX rows, twice (corners, land), after G0 header cells)
const NX = 320, NRMAX = 400, G0 = 8;

export const contours: SpeciesDef = {
  // places, nature, distance, time, calm, scale: the land and the long view
  suits: (A) => {
    const d = A.c.domain.p, tm = A.c.time.p, em = A.c.emotion.p, sh = A.c.shape.p, mo = A.c.motion.p, m = A.c.material.p;
    return 0.75 * ((A.c.kind.p.place ?? 0) * 1.5 + d.nature * 1.1 + A.s.distance * 0.7 + A.s.scale * 0.6 + A.s.duration * 0.4
      + (tm.timeless + tm.past) * 0.35 + em.calm * 0.5 + em.awe * 0.4 + sh.flat * 0.5 + sh.flowing * 0.3 + mo.drifting * 0.4
      + m.stone * 0.4 + m.sand * 0.6 + m.water * 0.3 + A.lazy * 0.3 + A.c.who.p.they * 0.3);
  },
  handOff: 'landscape',
  // warp: the line style — dotted rows, contours (the survey), pins (a dark relief), ridgelines with index contours;
  // flow: the camera — a low flight in, standing and panning, a crane up, a lateral track
  ops: (A: Appraisal) => {
    const md = A.mood, m = A.c.material.p, mo = A.c.motion.p, sh = A.c.shape.p;
    return {
      warp: [0.7 + md.pos * 1.0 + m.sand * 0.4 + m.water * 0.3, 0.3 + md.neu * 1.4 + A.s.order * 0.6,
        0.25 + md.neg * 0.9 + m.stone * 0.6 + m.metal * 0.5 + A.s.hardness * 0.4, 0.4 + A.s.order * 0.4 + A.s.tension * 0.5 + sh.jagged * 0.3],
      flow: [0.6 + A.s.arousal * 0.6 + mo.drifting * 0.8 + mo.spreading * 0.3, 0.35 + mo.still + A.lazy * 0.6,
        0.3 + mo.rising * 0.8 + A.s.scale * 0.4, 0.4 + sh.flowing * 0.6 + mo.circling * 0.4],
    };
  },
  maxZoom: 2.5,
  groups: (NX * NRMAX) / 128,
  state: G0 + 2 * NX * NRMAX,
  bloom: 0.05,
  halation: 0.015,
  cal: 3,
};
