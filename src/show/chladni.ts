/**
 * Chladni: the plate's modes over a shot — pairs (m, n) taken from the word's
 * own bytes, changing a few times, so the sand figure dissolves and reforms.
 * Shared by the image (sand.wgsl) and the sound (clips.ts) — the same modes.
 */
import type { Appraisal } from '../jev/appraisal.ts';

export function plateModes(A: Appraisal, seed: number): [number, number][] {
  const b = A.bytes.length ? [...A.bytes] : [seed & 255];
  const count = A.s.arousal > 0.6 ? 3 : A.lazy > 0.6 ? 1 : 2;
  const modes: [number, number][] = [];
  for (let k = 0; k < count; k++) {
    const x = b[(k * 2 + (seed & 7)) % b.length], y = b[(k * 2 + 1 + (seed & 7)) % b.length];
    let m = 2 + (x % 6), n = 2 + (y % 6);
    if (m === n) n = n === 7 ? 3 : n + 1; // degenerate modes make no figure
    modes.push([m, n]);
  }
  return modes;
}

/** The mode sounding at fraction u of the shot. */
export function plateMode(A: Appraisal, seed: number, u: number): [number, number] {
  const modes = plateModes(A, seed);
  return modes[Math.min(modes.length - 1, Math.floor(Math.max(0, u) * modes.length))];
}
