/**
 * The crack pattern of one fracture shot, computed once on the CPU: for each
 * radial crack its angle, reach, fork, a few sharp kinks, and the straight
 * bridges to its neighbour. The shader only measures distances to this table.
 * Layout: 9 vec4 per ray —
 *   0: angle, reach factor, fork radius (× reach), fork angle
 *   1–2: kinks (at, offset) × 4
 *   3–8: bridges j = 1..6 (radius factor, kept 0/1, neighbour radius factor, 0)
 */
import { mulberry32 } from '../core/rng.ts';
import type { Appraisal } from '../jev/appraisal.ts';

export const MAX_RAYS = 22;
export const RAY_VEC4 = 9;

export function fractureRays(A: Appraisal, seed: number): { data: Float32Array; count: number } {
  const rand = mulberry32(seed ^ 0x2f6b1e4d);
  const count = Math.floor(9 + (22 - 9) * A.s.intensity);
  const jag = 0.5 + A.c.shape.p.jagged + A.c.shape.p.splintered;
  const data = new Float32Array(MAX_RAYS * RAY_VEC4 * 4);
  for (let k = 0; k < count; k++) {
    const o = k * RAY_VEC4 * 4;
    data[o] = ((k + rand() * 0.8) / count) * Math.PI * 2 - Math.PI;
    data[o + 1] = 0.55 + 0.45 * rand();
    data[o + 2] = 0.12 + 0.48 * rand();
    data[o + 3] = (rand() - 0.5) * 0.9;
    const kinks = Math.min(4, 2 + Math.floor(rand() * 3 * jag));
    for (let i = 0; i < 4; i++) {
      const at = i < kinks ? ((i + 0.3 + rand() * 0.7) / kinks) * 1.6 : 99;
      data[o + 4 + i * 2] = at;
      data[o + 5 + i * 2] = i < kinks ? ((rand() - 0.5) * 0.16) / (1 + at * 2) : 0;
    }
    for (let j = 0; j < 6; j++) {
      const b = o + 12 + j * 4;
      data[b] = 0.85 + 0.3 * rand();
      data[b + 1] = rand() < 0.45 ? 0 : 1;
      data[b + 2] = 0.85 + 0.3 * rand();
    }
  }
  return { data, count };
}
