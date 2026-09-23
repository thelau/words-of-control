/**
 * The uniform block shared by every shader. All fields are f32, so the WGSL
 * struct and the Float32Array layout are generated from one list.
 */
import { GPU_TUNING_KEYS } from './tuning';

const RUNTIME = [
  // frame
  'resX', 'resY', 'pxPerUnit', 'dpr', 'time', 'dt', 'frameDt', 'frameStart', 'count', 'frame', 'sessionSeed',
  // rest / typing
  'homeK', 'charge', 'kickSeed', 'kickAmtNow', 'kickFrac', 'tremor', 'tension', 'fadeAll',
  // reaction
  'reacting', 'rt', 'dur', 'rSeed', 'ret', 'retLate', 'litFrac', 'confidence',
  'w0', 'w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8',
  'intensity', 'energy', 'hardness', 'weight', 'temperature', 'scale', 'light',
  'violence', 'loss', 'closeness', 'absurd', 'kindId',
  // blended look
  'colR', 'colG', 'colB', 'col2R', 'col2G', 'col2B',
  'persist', 'streak', 'sizeMul', 'lumMul', 'retW', 'retZ', 'expoMul', 'sparkle',
  // matter + central light
  'matterW', 'matterH', 'lightI', 'lightR', 'lightColR', 'lightColG', 'lightColB', 'starI',
  'mShock', 'mShockSpeed', 'mSwirl', 'mRing', 'mRingK', 'mCollapse', 'mSink', 'mNoise', 'mLazy', 'retTime',
] as const;

const UNIFORM_FIELDS: string[] = [...RUNTIME, ...GPU_TUNING_KEYS];

const INDEX = new Map(UNIFORM_FIELDS.map((k, i) => [k, i]));

/** Byte size of one uniform slot, padded to the 256-byte dynamic offset alignment. */
export const UNIFORM_SLOT_BYTES = Math.ceil((UNIFORM_FIELDS.length * 4) / 256) * 256;

export function uniformStructWGSL(): string {
  return `struct Uniforms {\n${UNIFORM_FIELDS.map((k) => `  ${k}: f32,`).join('\n')}\n};\n`;
}

export class UniformData {
  readonly f32 = new Float32Array(UNIFORM_SLOT_BYTES / 4);
  set(key: string, v: number) {
    const i = INDEX.get(key);
    if (i === undefined) throw new Error(`unknown uniform ${key}`);
    this.f32[i] = v;
  }
  get(key: string): number {
    return this.f32[INDEX.get(key)!];
  }
}
