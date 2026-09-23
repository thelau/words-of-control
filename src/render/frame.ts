/**
 * The per-frame uniform block every scene reads. All fields are f32, so the
 * WGSL struct and the Float32Array are generated from this one list.
 * Appraisal fields are written once per performance; frame fields every frame.
 */
import type { Appraisal } from '../jev/appraisal.ts';

const FRAME = [
  'resX', 'resY', 'dpr', 'time', 'dt',
  'lt', 'dur', 'u', 'seed', 'variant', 'variant2', 'mode', 'aborted', 'layerFade',
  'charge', 'kick', 'flash', 'invert', 'exposure', 'bloom', 'grain',
  // the output (canvas) size; scenes may render smaller (resX/resY) and be upscaled
  'outX', 'outY', 'outDpr', 'hiRes',
] as const;

// qualities read by the scenes (0..1)
const SCORES = ['arousal', 'valence', 'dominance', 'intensity', 'energy', 'hardness', 'weight', 'temperature', 'scale', 'light',
  'order', 'density', 'tension', 'loudness', 'pitch', 'phonetics', 'tone', 'age', 'duration', 'strangeness', 'distance'] as const;
const MATERIALS = ['metal', 'glass', 'stone', 'sand', 'water', 'ice', 'smoke', 'fire', 'wood', 'cloth', 'flesh', 'light', 'void'] as const;
const MOTIONS = ['rising', 'falling', 'spreading', 'contracting', 'circling', 'trembling', 'still', 'breaking', 'drifting'] as const;
const SHAPES = ['round', 'jagged', 'flowing', 'splintered', 'knotted', 'flat', 'spiral', 'branching', 'point'] as const;
const TEXTURES = ['smooth', 'grainy', 'crystalline', 'liquid', 'powdery', 'fibrous', 'cracked', 'soft'] as const;
const APPRAISAL = [
  ...SCORES.map((k) => `s_${k}`), 'lazy', 'conf', 'tapeLen', 'byteLen',
  ...MATERIALS.map((k) => `m_${k}`), ...MOTIONS.map((k) => `mo_${k}`), ...SHAPES.map((k) => `sh_${k}`), ...TEXTURES.map((k) => `tx_${k}`),
  'baseR', 'baseG', 'baseB', 'accR', 'accG', 'accB',
];

const FIELDS = [...FRAME, ...APPRAISAL];
const INDEX = new Map(FIELDS.map((k, i) => [k, i]));
export const FRAME_BYTES = Math.ceil((FIELDS.length * 4) / 16) * 16;

export const frameStructWGSL = () => `struct FrameU {\n${FIELDS.map((k) => `  ${k}: f32,`).join('\n')}\n};\n`;

/** Named colours of the `colour` question, linear RGB. */
const COLOURS: Record<string, [number, number, number]> = {
  black: [0.02, 0.02, 0.02], white: [0.9, 0.88, 0.85], grey: [0.35, 0.35, 0.36], red: [0.9, 0.03, 0.02], orange: [1, 0.3, 0.04],
  yellow: [1, 0.72, 0.12], green: [0.12, 0.6, 0.18], blue: [0.05, 0.25, 0.95], violet: [0.35, 0.1, 0.8], pink: [1, 0.35, 0.5],
  brown: [0.45, 0.2, 0.07],
};
const NEUTRAL = new Set(['black', 'white', 'grey']);

export class Frame {
  readonly f32 = new Float32Array(FRAME_BYTES / 4);

  set(k: string, v: number) {
    const i = INDEX.get(k);
    if (i === undefined) throw new Error(`frame field ${k}`);
    this.f32[i] = v;
  }

  /** Write the appraisal once per performance. */
  setAppraisal(A: Appraisal) {
    for (const k of SCORES) this.set(`s_${k}`, A.s[k] ?? 0.5);
    this.set('lazy', A.lazy);
    this.set('conf', A.c.emotion.confidence);
    this.set('tapeLen', A.tape.length);
    this.set('byteLen', A.bytes.length);
    for (const k of MATERIALS) this.set(`m_${k}`, A.c.material.p[k] ?? 0);
    for (const k of MOTIONS) this.set(`mo_${k}`, A.c.motion.p[k] ?? 0);
    for (const k of SHAPES) this.set(`sh_${k}`, A.c.shape.p[k] ?? 0);
    for (const k of TEXTURES) this.set(`tx_${k}`, A.c.texture.p[k] ?? 0);
    // palette: monochrome base warmed/cooled by temperature; one accent from the colour answer
    const t = A.s.temperature;
    this.set('baseR', 0.86 + 0.08 * t); this.set('baseG', 0.84); this.set('baseB', 0.82 + 0.1 * (1 - t));
    const ranked = Object.entries(A.c.colour.p).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const acc = COLOURS[ranked.find((k) => !NEUTRAL.has(k)) ?? 'red'];
    this.set('accR', acc[0]); this.set('accG', acc[1]); this.set('accB', acc[2]);
  }
}
