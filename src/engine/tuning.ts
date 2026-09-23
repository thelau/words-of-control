/**
 * Tuning schema: every constant the harness can move lives here.
 *
 * Numeric entries become f32 fields of the GPU uniform block automatically
 * (see uniforms.ts), so a new constant is one line here plus its use in WGSL.
 * A saved preset is just a snapshot of these values: it sets the voicing of
 * the instrument, never the reaction itself (that always comes from Jev).
 */
import { EMOTIONS, type Emotion } from './emotions';

export type NumSpec = { key: string; group: string; def: number; min: number; max: number; step?: number; gpu?: boolean };
export type ColorSpec = { key: string; group: string; def: string; color: true };
export type Spec = NumSpec | ColorSpec;

const n = (group: string, key: string, def: number, min: number, max: number, gpu = true): NumSpec => ({
  key, group, def, min, max, gpu,
});
const col = (group: string, key: string, def: string): ColorSpec => ({ key, group, def, color: true });

/** Per-emotion "look" values, blended on the CPU by the emotion weights. */
const LOOK: Record<Emotion, { color: string; color2: string; persist: number; streak: number; size: number; lum: number; retW: number; retZ: number; sparkle: number; litMul?: number }> = {
  calm:    { color: '#F2E6CF', color2: '#FFF6E6', persist: 0.965, streak: 0.030, size: 1.0, lum: 0.22, retW: 1.4, retZ: 1.0, sparkle: 0, litMul: 0.5 },
  tender:  { color: '#F5B9A0', color2: '#FFE2D2', persist: 0.93,  streak: 0.012, size: 1.7, lum: 0.16, retW: 1.2, retZ: 1.0, sparkle: 0, litMul: 0.12 },
  joy:     { color: '#FFC23D', color2: '#FFF3C4', persist: 0.90,  streak: 0.016, size: 1.1, lum: 0.55, retW: 2.0, retZ: 0.9, sparkle: 0.8, litMul: 0.8 },
  awe:     { color: '#D9DEE8', color2: '#FFFFFF', persist: 0.90,  streak: 0.004, size: 0.75, lum: 0.45, retW: 0.9, retZ: 1.1, sparkle: 0.1, litMul: 0.6 },
  sadness: { color: '#7F95AD', color2: '#A9BCD1', persist: 0.955, streak: 0.030, size: 1.0, lum: 0.3, retW: 0.9, retZ: 1.4, sparkle: 0, litMul: 0.25 },
  fear:    { color: '#C9E6C4', color2: '#F2FFF0', persist: 0.80,  streak: 0.006, size: 0.8, lum: 0.25, retW: 2.8, retZ: 0.85, sparkle: 0.2, litMul: 0.06 },
  anxiety: { color: '#C8903A', color2: '#E6B46A', persist: 0.86,  streak: 0.010, size: 0.9, lum: 0.45, retW: 2.0, retZ: 0.6, sparkle: 0.5, litMul: 0.4 },
  anger:   { color: '#FF4B1F', color2: '#E8300F', persist: 0.86,  streak: 0.022, size: 1.0, lum: 1.2, retW: 2.2, retZ: 1.0, sparkle: 0.9, litMul: 1 },
  playful: { color: '#F7A8C4', color2: '#FFFFFF', persist: 0.92,  streak: 0.014, size: 1.2, lum: 0.14, retW: 2.6, retZ: 0.45, sparkle: 0.3, litMul: 0.2 },
};

/** Per-emotion matter fields + central light, blended by weights on the CPU. */
type MatterLook = { shock: number; shockSpeed: number; swirl: number; ring: number; ringK: number; collapse: number; sink: number; noise: number; light: number; lightR: number; star: number; flash: number };
const MATTER: Record<Emotion, MatterLook> = {
  calm:    { shock: 0,    shockSpeed: 0.5, swirl: 0.35, ring: 0.25, ringK: 10, collapse: 0,    sink: 0,     noise: 0.08, light: 0.9, lightR: 0.8,  star: 0, flash: 0 },
  tender:  { shock: 0,    shockSpeed: 0.5, swirl: 0.2,  ring: 0,    ringK: 10, collapse: 0.25, sink: 0,     noise: 0.05, light: 0.8, lightR: 0.35, star: 0,  flash: 0 },
  joy:     { shock: 0.35, shockSpeed: 0.6, swirl: 0.1,  ring: 0.1,  ringK: 12, collapse: 0,    sink: -0.15, noise: 0.2,  light: 1.6, lightR: 0.7,  star: 0.35,  flash: 1 },
  awe:     { shock: 0.15, shockSpeed: 0.35, swirl: 0.04, ring: 0.5, ringK: 7,  collapse: 0,    sink: 0,     noise: 0.05, light: 1.2, lightR: 1.3,  star: 0,  flash: 0 },
  sadness: { shock: 0,    shockSpeed: 0.5, swirl: 0,    ring: 0,  ringK: 12, collapse: 0,    sink: 0.35,  noise: 0.03, light: 0.35, lightR: 0.9,  star: 0,  flash: 0 },
  fear:    { shock: 0,    shockSpeed: 0.5, swirl: 0,    ring: 0,    ringK: 10, collapse: 0.6,  sink: 0,     noise: 0.6,  light: 0.6, lightR: 0.25, star: 0,  flash: 0 },
  anxiety: { shock: 0,    shockSpeed: 0.5, swirl: 0.05, ring: 0.4,  ringK: 18, collapse: 0,    sink: 0,     noise: 0.7,  light: 0.7, lightR: 0.5,  star: 0,  flash: 0 },
  anger:   { shock: 1.0,  shockSpeed: 0.9, swirl: 0,    ring: 0,    ringK: 14, collapse: 0,    sink: 0,     noise: 0.4,  light: 2.0, lightR: 0.55, star: 1.0,  flash: 3 },
  playful: { shock: 0.15, shockSpeed: 0.5, swirl: -0.3, ring: 0.1,  ringK: 9,  collapse: 0,    sink: 0,     noise: 0.5,  light: 1.0, lightR: 0.6,  star: 0,  flash: 0 },
};

export const SCHEMA: Spec[] = [
  // Rest field
  n('rest', 'restFrac', 0.0008, 0, 0.01),
  n('rest', 'restLum', 1.0, 0, 3),
  n('rest', 'drift', 0.012, 0, 0.08),
  n('rest', 'driftSpeed', 0.07, 0, 0.5),
  n('rest', 'homeW', 5, 0.5, 20),
  // Typing charge (§6.5)
  n('charge', 'kickCount', 60, 0, 2000, false),
  n('charge', 'kickAmt', 0.35, 0, 2),
  n('charge', 'kickGlow', 0.35, 0, 2),
  n('charge', 'tensionAmt', 0.05, 0, 0.3),
  n('charge', 'liftPerKey', 0.01, 0, 0.05, false),
  n('charge', 'tremorAmt', 0.03, 0, 2, false),
  // Image
  n('image', 'exposure', 1.0, 0.2, 4),
  n('image', 'gain', 0.3, 0.01, 2),
  n('image', 'bloom', 0.25, 0, 2),
  n('image', 'bloomRadius', 1.0, 0.3, 3, false),
  n('image', 'halation', 0.6, 0, 1),
  n('image', 'grain', 0.045, 0, 0.2),
  n('image', 'vignette', 0.35, 0, 1),
  n('image', 'dofMax', 9, 0, 30),
  n('image', 'massSpread', 22, 0, 20),
  n('image', 'streakConserve', 0.3, 0, 1),
  n('image', 'taper', 0.35, 0.05, 1),
  n('image', 'sizeBase', 1.15, 0.5, 4),
  n('image', 'streakScale', 1.0, 0, 4),
  n('image', 'monochrome', 0, 0, 1),
  // Matter (lit granular field)
  n('matter', 'matterGain', 0.9, 0, 6),
  n('matter', 'albedo', 0.22, 0, 1),
  n('matter', 'matterScale', 0.6, 0.25, 1, false),
  n('matter', 'heightK', 14, 0, 60),
  n('matter', 'lightH', 0.07, 0.01, 1),
  n('matter', 'ambient', 0.01, 0, 0.5),
  n('matter', 'mDrag', 2.2, 0, 8),
  n('matter', 'glint', 3, 0, 10),
  n('matter', 'glintFrac', 0.04, 0, 0.5),
  n('matter', 'restLight', 0.0, 0, 0.5, false),
  n('matter', 'typeLight', 0.06, 0, 2, false),
  n('matter', 'starAmt', 1, 0, 4, false),
  // Mapping of modifiers (§6.8)
  n('mapping', 'litMin', 6000, 0, 200000, false),
  n('mapping', 'litMax', 40000, 0, 200000, false),
  n('mapping', 'phaseSpread', 0.9, 0, 3),
  n('mapping', 'lowConfNoise', 0.35, 0, 2),
  n('mapping', 'weightBias', 0.18, 0, 1),
  n('mapping', 'tempHue', 0.35, 0, 1.5, false),
  n('mapping', 'returnTime', 3.0, 1, 5, false),
  n('mapping', 'lazyBelow', 0.3, 0, 1, false),
  n('mapping', 'lazyDur', 8, 3, 15, false),

  // Anger (canonical)
  n('anger', 'anger_ign', 0.3, 0.1, 0.8),
  n('anger', 'anger_flash', 9, 0, 30),
  n('anger', 'anger_ringR', 0.62, 0.2, 1.2),
  n('anger', 'anger_ringFrac', 0.3, 0, 1),
  n('anger', 'anger_ringDrag', 4.5, 0.5, 12),
  n('anger', 'anger_jag', 0.16, 0, 0.6),
  n('anger', 'anger_streakFrac', 0.045, 0, 1),
  n('anger', 'anger_streakSpeed', 5.5, 1, 15),
  n('anger', 'anger_shatter', 1.7, 0.5, 5),
  n('anger', 'anger_shardCycle', 0.04, 0, 1),
  n('anger', 'anger_emberFrac', 0.006, 0, 0.1),
  n('anger', 'anger_streakLum', 6, 0, 10),
  n('anger', 'anger_dustLum', 0.12, 0, 3),
  n('anger', 'anger_emberLum', 5, 0, 15),
  n('anger', 'anger_emberSize', 6, 1, 14),

  // Calm
  n('calm', 'calm_rIn', 0.08, 0, 0.6),
  n('calm', 'calm_rOut', 0.62, 0.1, 1.4),
  n('calm', 'calm_spin', 0.38, 0, 2),
  n('calm', 'calm_k', 2.2, 0.2, 10),

  // Tender
  n('tender', 'tender_r', 0.14, 0.02, 0.5),
  n('tender', 'tender_spin', 0.6, 0, 3),

  // Joy
  n('joy', 'joy_R', 0.5, 0.1, 1.2),
  n('joy', 'joy_lift', 0.12, 0, 1),
  n('joy', 'joy_twinkle', 0.7, 0, 1),

  // Awe
  n('awe', 'awe_R', 1.35, 0.4, 2.5),
  n('awe', 'awe_w', 0.9, 0.2, 4),

  // Sadness
  n('sadness', 'sad_R', 0.38, 0.1, 1),
  n('sadness', 'sad_tearFrac', 0.35, 0, 1),
  n('sadness', 'sad_fall', 0.12, 0, 1.5),

  // Fear
  n('fear', 'fear_r', 0.045, 0.005, 0.3),
  n('fear', 'fear_tremor', 3.5, 0, 12),

  // Anxiety
  n('anxiety', 'anx_R', 0.36, 0.1, 1),
  n('anxiety', 'anx_wobble', 0.14, 0, 0.5),
  n('anxiety', 'anx_jitter', 1.4, 0, 6),

  // Playful
  n('playful', 'play_R', 0.42, 0.1, 1),
  n('playful', 'play_split', 0.09, 0, 0.4),

  // Per-emotion look, blended by weights on the CPU
  ...EMOTIONS.flatMap((e): Spec[] => [
    col(`look:${e}`, `${e}.color`, LOOK[e].color),
    col(`look:${e}`, `${e}.color2`, LOOK[e].color2),
    n(`look:${e}`, `${e}.persist`, LOOK[e].persist, 0.6, 0.995, false),
    n(`look:${e}`, `${e}.streak`, LOOK[e].streak, 0, 0.1, false),
    n(`look:${e}`, `${e}.size`, LOOK[e].size, 0.3, 4, false),
    n(`look:${e}`, `${e}.lum`, LOOK[e].lum, 0, 4, false),
    n(`look:${e}`, `${e}.retW`, LOOK[e].retW, 0.3, 6, false),
    n(`look:${e}`, `${e}.retZ`, LOOK[e].retZ, 0.2, 2, false),
    n(`look:${e}`, `${e}.sparkle`, LOOK[e].sparkle, 0, 1, false),
    n(`look:${e}`, `${e}.litMul`, LOOK[e].litMul ?? 1, 0, 2, false),
    ...(Object.keys(MATTER[e]) as (keyof MatterLook)[]).map((k) =>
      n(`matter:${e}`, `${e}.${k}`, MATTER[e][k], k === 'ringK' ? 2 : k === 'swirl' || k === 'sink' ? -1.5 : 0, k === 'ringK' ? 40 : k === 'flash' ? 10 : 4, false)),
  ]),
];

export type Tuning = Record<string, number | string>;

export function defaultTuning(): Tuning {
  const t: Tuning = {};
  for (const s of SCHEMA) t[s.key] = s.def;
  return t;
}

export const num = (t: Tuning, k: string) => t[k] as number;
export const str = (t: Tuning, k: string) => t[k] as string;

/** Tuning keys that are sent to the GPU as-is. */
export const GPU_TUNING_KEYS = SCHEMA.filter((s): s is NumSpec => !('color' in s) && s.gpu !== false).map((s) => s.key);
