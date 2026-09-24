/**
 * The per-frame uniform block every scene reads. All fields are f32, so the
 * WGSL struct and the Float32Array are generated from this one list.
 * Appraisal fields are written once per performance; frame fields every frame.
 */
import type { Appraisal } from '../jev/appraisal.ts';

const FRAME = [
  'resX', 'resY', 'dpr', 'time', 'dt',
  'lt', 'dur', 'u', 'seed', 'variant', 'variant2', 'mode', 'aborted', 'layerFade',
  // framing: every clip maps p = p / zoom + off (wide ↔ macro between repeated shots)
  'zoom', 'offX', 'offY',
  // the camera angle within a shot (a new angle = a cut on the same continuous scene), and when it began (s)
  'angle', 'angleAt',
  // data: the shot's operators (field.wgsl shape()): echo, warp, flow; engineOld = ?engine=old (comparison)
  'echoOp', 'warpOp', 'flowOp', 'engineOld',
  // 1: the camera holds still (the word's own gesture is the motion) and frames the whole gesture
  'hold',
  // the verdict's own clock (s) and progress (0..1): the word's gesture runs across all its shots, never resets
  'vt', 'vu',
  // the rhythm (show/rhythm.ts): how strongly this shot carries the verdict's strike
  'strike',
  // chladni: the mode sounding now
  'modeM', 'modeN',
  'charge', 'kick', 'flash', 'invert', 'exposure', 'bloom', 'grain',
  // the output (canvas) size; scenes may render smaller (resX/resY) and be upscaled
  'outX', 'outY', 'outDpr', 'hiRes',
  // the performance's number in this session (the signature)
  'serial',
  // grading per layer: white balance, halation, flat (data: pure black, no vignette)
  'wbR', 'wbG', 'wbB', 'halation', 'flat',
] as const;

// qualities read by the scenes (0..1)
const SCORES = ['arousal', 'valence', 'dominance', 'intensity', 'energy', 'hardness', 'weight', 'temperature', 'scale', 'light',
  'order', 'density', 'tension', 'loudness', 'pitch', 'phonetics', 'tone', 'age', 'duration', 'strangeness', 'distance'] as const;
const MATERIALS = ['metal', 'glass', 'stone', 'sand', 'water', 'ice', 'smoke', 'fire', 'wood', 'cloth', 'flesh', 'light', 'void'] as const;
const MOTIONS = ['rising', 'falling', 'spreading', 'contracting', 'circling', 'trembling', 'still', 'breaking', 'drifting'] as const;
const SHAPES = ['round', 'jagged', 'flowing', 'splintered', 'knotted', 'flat', 'spiral', 'branching', 'point'] as const;
const TEXTURES = ['smooth', 'grainy', 'crystalline', 'liquid', 'powdery', 'fibrous', 'cracked', 'soft'] as const;
const RHYTHMS = ['steady', 'pulsing', 'stuttering', 'strike', 'dwindling', 'swelling'] as const;
const APPRAISAL = [
  ...SCORES.map((k) => `s_${k}`), 'lazy', 'conf', 'tapeLen', 'byteLen', 'moodPos', 'moodNeu',
  ...MATERIALS.map((k) => `m_${k}`), ...MOTIONS.map((k) => `mo_${k}`), ...SHAPES.map((k) => `sh_${k}`), ...TEXTURES.map((k) => `tx_${k}`), ...RHYTHMS.map((k) => `rh_${k}`),
  // the word's gesture: its main motion (index into MOTIONS) and the second one, which turns in later
  'moTop', 'moSec', 'moSecP',
  // the matter, per particle: the word's first and second material (index into MATERIALS), the share of the
  // particles that are the second, how sure Jev is (first + second); its main texture (index into TEXTURES)
  'matTop', 'matSec', 'matShare', 'matSure', 'txTop', 'txSure',
  'baseR', 'baseG', 'baseB', 'accR', 'accG', 'accB',
  // the colour clips' palette (from Jev's colour distribution): primary, second, contrast
  'p1R', 'p1G', 'p1B', 'p2R', 'p2G', 'p2B', 'p3R', 'p3G', 'p3B',
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

  get(k: string): number {
    return this.f32[INDEX.get(k)!];
  }

  set(k: string, v: number) {
    const i = INDEX.get(k);
    if (i === undefined) throw new Error(`frame field ${k}`);
    this.f32[i] = v;
  }

  /** Write the appraisal once per performance. */
  setAppraisal(A: Appraisal) {
    for (const k of SCORES) this.set(`s_${k}`, A.s[k] ?? 0.5);
    this.set('lazy', A.lazy);
    this.set('moodPos', A.mood.pos); this.set('moodNeu', A.mood.neu);
    this.set('conf', A.c.emotion.confidence);
    this.set('tapeLen', A.tape.length);
    this.set('byteLen', A.bytes.length);
    // the material, sharpened (p², renormalised): the word's main matter leads, a trace of a second is only a trace
    const m2 = MATERIALS.map((k) => (A.c.material.p[k] ?? 0) ** 2);
    const msum = m2.reduce((a, b) => a + b, 0) || 1;
    MATERIALS.forEach((k, i) => this.set(`m_${k}`, m2[i] / msum));
    for (const k of RHYTHMS) this.set(`rh_${k}`, A.c.rhythm.p[k] ?? 0);
    const mats = MATERIALS.map((k, i) => [i, A.c.material.p[k] ?? 0] as const).sort((a, b) => b[1] - a[1]);
    this.set('matTop', mats[0][0]); this.set('matSec', mats[1][0]);
    this.set('matShare', mats[1][1] / Math.max(1e-6, mats[0][1] + mats[1][1]));
    this.set('matSure', Math.min(1, (mats[0][1] + mats[1][1]) * 1.25));
    const txs = TEXTURES.map((k, i) => [i, A.c.texture.p[k] ?? 0] as const).sort((a, b) => b[1] - a[1]);
    this.set('txTop', txs[0][0]); this.set('txSure', txs[0][1]);
    // the motion, sharpened like the material: the main gesture leads
    const mo2 = MOTIONS.map((k) => (A.c.motion.p[k] ?? 0) ** 2);
    const mosum = mo2.reduce((a, b) => a + b, 0) || 1;
    MOTIONS.forEach((k, i) => this.set(`mo_${k}`, mo2[i] / mosum));
    const order = MOTIONS.map((k, i) => [i, A.c.motion.p[k] ?? 0] as const).sort((a, b) => b[1] - a[1]);
    this.set('moTop', order[0][0]); this.set('moSec', order[1][0]); this.set('moSecP', order[1][1]);
    for (const k of SHAPES) this.set(`sh_${k}`, A.c.shape.p[k] ?? 0);
    for (const k of TEXTURES) this.set(`tx_${k}`, A.c.texture.p[k] ?? 0);
    // palette: monochrome base warmed/cooled by temperature; one accent from the colour answer
    const t = A.s.temperature;
    this.set('baseR', 0.86 + 0.08 * t); this.set('baseG', 0.84); this.set('baseB', 0.82 + 0.1 * (1 - t));
    const ranked = Object.entries(A.c.colour.p).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const acc = COLOURS[ranked.find((k) => !NEUTRAL.has(k)) ?? 'red'];
    this.set('accR', acc[0]); this.set('accG', acc[1]); this.set('accB', acc[2]);
    const pal = palette(A);
    pal.forEach((c, i) => { this.set(`p${i + 1}R`, c[0]); this.set(`p${i + 1}G`, c[1]); this.set(`p${i + 1}B`, c[2]); });
  }
}

type RGB = [number, number, number];
const mixc = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Three colours from what Jev sees: the two most likely colours (a neutral becomes pearl, steel or ink),
 *  shifted by matter (fire warms, water and ice cool, flesh blushes), and a contrast for the edges of light. */
export function palette(A: Appraisal): [RGB, RGB, RGB] {
  const ranked = Object.entries(A.c.colour.p).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const tone: Record<string, RGB> = { white: [0.95, 0.9, 1], grey: [0.55, 0.62, 0.72], black: [0.12, 0.14, 0.4] };
  const pick = (k: string): RGB => tone[k] ?? COLOURS[k];
  let p1 = pick(ranked[0]), p2 = pick(ranked[1] ?? ranked[0]);
  const m = A.c.material.p;
  const warm: RGB = [1, 0.42, 0.1], cold: RGB = [0.25, 0.45, 1], blush: RGB = [1, 0.45, 0.45];
  p1 = mixc(p1, warm, Math.min(0.5, m.fire * 0.6));
  p2 = mixc(p2, cold, Math.min(0.5, (m.water + m.ice) * 0.5));
  p1 = mixc(p1, blush, Math.min(0.3, m.flesh * 0.4));
  // the contrast: the complement of the primary, softened toward white (a rim of light, never a clash)
  const mx = Math.max(...p1), mn = Math.min(...p1);
  const comp: RGB = [mx + mn - p1[0], mx + mn - p1[1], mx + mn - p1[2]];
  const p3 = mixc(comp, [1, 0.97, 0.94], 0.45);
  return [p1, p2, p3];
}
