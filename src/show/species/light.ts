/** Light — the word as pure light: an aperture of coloured light on black, the light passing through the word's
 *  matter (caustics, refraction, shafts, embers, raking light). Design notes: src/render/shaders/light.wgsl. */
import type { SpeciesDef } from './types.ts';

export const light: SpeciesDef = {
  // the luminous, the calm, the sacred and the vast, the abstract, a time of day, the idle, the void, the quiet
  suits: (A) => {
    const m = A.c.material.p, em = A.c.emotion.p, d = A.c.domain.p, k = A.c.kind.p;
    const day = 1 - (A.c.daytime?.p.none ?? 1);
    return m.light * 1.6 + m.void * 0.6 + m.glass * 0.3 + m.water * 0.3 + (em.calm ?? 0) * 0.6 + (em.awe ?? 0) * 0.9
      + (d.cosmos ?? 0) * 0.7 + day * 0.5 + A.s.light * 0.4 + A.lazy * 0.4 + (1 - A.s.loudness) * 0.3 + (k['abstract idea'] ?? 0) * 0.3;
  },
  handOff: 'cloud', // the scatter reading: its dots become the points of light
  ops: (A) => {
    const md = A.mood, m = A.c.material.p, mo = A.c.motion.p, rh = A.c.rhythm.p;
    return {
      // its light: frontal, cast on a dark floor, leaking out as shafts, only its edges (dark-field)
      warp: [0.6 + md.pos * 0.6 + m.light, 0.3 + m.water + A.c.texture.p.liquid * 0.5 + mo.falling * 0.4,
        0.2 + m.smoke + m.void * 0.3 + (A.c.emotion.p.awe ?? 0) * 0.5 + (A.c.domain.p.cosmos ?? 0) * 0.4, 0.1 + md.neu * 0.8 + md.neg * 0.8 + A.s.order * 0.3],
      // its movement: held, sliding across, turning, breathing
      flow: [0.4 + mo.still * 1.5 + A.lazy * 0.5, 0.2 + mo.drifting + md.neu * 0.4, 0.15 + mo.circling + md.pos * 0.3, 0.15 + rh.pulsing + rh.swelling * 0.5],
    };
  },
  maxZoom: 3,
  groups: 1,
  state: 64,
  bloom: 0.015,
  halation: 0.02,
  cal: 6,
};
