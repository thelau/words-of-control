/**
 * The crack pattern of one fracture shot, computed once on the CPU: 5–9
 * uneven radial cracks (or, for a blade / metal word, one straight cleave),
 * each with a few sharp kinks, a fork, and bridges to its neighbour. Rays are
 * sorted by angle. The shader only measures distances to this table.
 * Layout: 9 vec4 per ray —
 *   0: angle, reach factor, fork radius (× reach), fork angle
 *   1–2: kinks (at, offset) × 4
 *   3–8: bridges j = 1..6 (radius factor, kept 0/1, neighbour radius factor, shard tilt seed)
 */
import { mulberry32 } from '../core/rng.ts';
import type { Appraisal } from '../jev/appraisal.ts';

export const MAX_RAYS = 22;
export const RAY_VEC4 = 9;

export function fractureRays(A: Appraisal, seed: number): { data: Float32Array; count: number } {
  const rand = mulberry32(seed ^ 0x2f6b1e4d);
  const sh = A.c.shape.p, m = A.c.material.p;
  // a blade or metal splits along one line; brittle matter shatters
  const cleave = sh.point + m.metal * 0.8 + (A.c.motion.top === 'breaking' ? 0 : 0.2) > 0.75;
  const count = cleave ? 2 : Math.floor(5 + 4 * A.s.intensity);
  const jag = 0.5 + sh.jagged + sh.splintered;
  const data = new Float32Array(MAX_RAYS * RAY_VEC4 * 4);
  const angles: number[] = [];
  if (cleave) {
    const a = rand() * Math.PI;
    angles.push(a - Math.PI, a + (rand() - 0.5) * 0.08);
  } else {
    for (let k = 0; k < count; k++) angles.push(((k + (rand() - 0.5) * 1.6) / count) * Math.PI * 2 - Math.PI);
    angles.sort((x, y) => x - y);
  }
  angles.forEach((ang, k) => {
    const o = k * RAY_VEC4 * 4;
    data[o] = ang;
    data[o + 1] = cleave ? 1 : 0.55 + 0.45 * rand();
    data[o + 2] = cleave ? 9 : 0.12 + 0.48 * rand();
    data[o + 3] = (rand() - 0.5) * 0.9;
    const kinks = cleave ? 1 : Math.min(4, 2 + Math.floor(rand() * 3 * jag));
    for (let i = 0; i < 4; i++) {
      const at = i < kinks ? ((i + 0.3 + rand() * 0.7) / kinks) * 1.6 : 99;
      data[o + 4 + i * 2] = at;
      data[o + 5 + i * 2] = i < kinks ? ((rand() - 0.5) * (cleave ? 0.05 : 0.16)) / (1 + at * 2) : 0;
    }
    for (let j = 0; j < 6; j++) {
      const b = o + 12 + j * 4;
      data[b] = 0.85 + 0.3 * rand();
      data[b + 1] = cleave || rand() < 0.62 ? 0 : 1;
      data[b + 2] = 0.85 + 0.3 * rand();
      data[b + 3] = rand();
    }
  });
  return { data, count };
}
