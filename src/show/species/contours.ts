/** Contours — a verdict species (placeholder: to be built; see types.ts). */
import type { SpeciesDef } from './types.ts';

export const contours: SpeciesDef = {
  suits: () => 0,
  handOff: 'landscape',
  ops: () => ({ warp: [1, 1, 1, 1], flow: [1, 1, 1, 1] }),
  maxZoom: 2.5,
  groups: 1,
  state: 4096,
  bloom: 0.03,
  halation: 0.01,
  cal: 4,
};
