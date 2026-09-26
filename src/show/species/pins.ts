/** Pins — a verdict species: the reading as a pin-art terrain, dark rods on hills catching a raking light
 *  (src/render/shaders/pins.wgsl has the design). */
import type { SpeciesDef } from './types.ts';

export const pins: SpeciesDef = {
  // matter and weight: stone, metal, sand; dense, ordered, large, the city; cracked and grainy ground
  suits: (A) => {
    const m = A.c.material.p, tx = A.c.texture.p, sh = A.c.shape.p, d = A.c.domain.p;
    return m.stone * 1.2 + m.metal + m.sand * 0.8 + A.s.density + A.s.weight * 0.8 + A.s.order * 0.5 + A.s.scale * 0.5
      + (d.city ?? 0) * 0.8 + tx.cracked * 0.6 + tx.grainy * 0.5 + sh.jagged * 0.4 + sh.flat * 0.4 + sh.branching * 0.3;
  },
  handOff: 'landscape',
  // the light (side raking, contre-jour, grazing, clinical) and the camera move (push in, track, crane down, locked)
  ops: (A) => {
    const md = A.mood, m = A.c.material.p, mo = A.c.motion.p;
    return {
      warp: [0.7 + md.neu * 0.3 + A.s.hardness * 0.4, md.pos * 0.8 + m.glass * 0.6 + m.water * 0.5 + 0.25,
        md.neg * 0.9 + A.s.tension * 0.6 + 0.25, md.neu * 0.6 + A.s.order * 0.4 + 0.05],
      flow: [0.4 + A.s.intensity * 0.6, mo.drifting + mo.spreading * 0.5 + 0.35, mo.falling + A.s.weight * 0.4 + 0.2,
        mo.still + md.neu * 0.5 + 0.2],
    };
  },
  maxZoom: 2,
  groups: 512, // one per tile of 16 × 8 pins (256 × 256)
  state: 520 + 256 * 256,
  bloom: 0.02,
  halation: 0,
  cal: 4,
};
