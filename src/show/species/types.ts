/**
 * A verdict species (docs/SPECIES.md): what a whole performance is made of, seen at a glance. Points and
 * solids are built into the director; the species here are plug-ins, each in its own files:
 *   src/show/species/<name>.ts   — this definition (how it suits a word, its hand-off, its construction)
 *   src/render/shaders/<name>.wgsl — its image: setup() (compute) and fs() (the frame, its blur in alpha)
 *   src/audio/species/<name>.ts  — its voice
 */
import type { Appraisal } from '../../jev/appraisal.ts';

export type SpeciesDef = {
  /** How much it suits the reading (the built-in species score about 0–5; director.ts suits()). */
  suits: (A: Appraisal) => number;
  /** The data clip whose reading the appraisal ends on, so the verdict opens on it (director.ts READING_OF). */
  handOff: 'landscape' | 'city' | 'lattice' | 'cloud';
  /** Its construction per shot, drawn with chance and never repeated soon: weights for F.warpOp (its light, say)
   *  and F.flowOp (its movement, say), from the reading. */
  ops: (A: Appraisal) => { warp: number[]; flow: number[] };
  /** The closest a camera angle may go (F.zoom). */
  maxZoom: number;
  /** setup()'s workgroups (of 128 threads) per frame, and its state buffer's size in vec4. */
  groups: number;
  state: number;
  /** The grade: bloom and halation (main.ts GRADE). */
  bloom: number;
  halation: number;
  /** The voice's level trim (dB), as clips.ts CAL. */
  cal: number;
};
