/**
 * The Params vector (§11): the only contract between Jev and the engines.
 * Everything downstream reads Params, never raw Jev output.
 */
import { EMOTIONS, type Emotion, type Kind, KINDS } from './emotions';
import { hexToLinear, mixOklab, shiftHue, type RGB } from '../core/color';
import { num, str, type Tuning } from './tuning';

export type Params = {
  weights: Partial<Record<Emotion, number>>;
  confidence: number;
  intensity: number;
  energy: number;
  hardness: number;
  weight: number;
  temperature: number;
  scale: number;
  light: number;
  accents: { violence: number; loss: number; closeness: number; absurd: number };
  kind: Kind;
  seed: number;
};

/** Keep the top 3, sharpen with p^1.5, renormalize (§6.3). */
export function blendWeights(dist: Partial<Record<Emotion, number>>): Partial<Record<Emotion, number>> {
  const top = Object.entries(dist)
    .filter(([, p]) => (p ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 3)
    .map(([e, p]) => [e, Math.pow(p ?? 0, 1.5)] as const);
  const sum = top.reduce((s, [, p]) => s + p, 0) || 1;
  return Object.fromEntries(top.map(([e, p]) => [e, p / sum]));
}

export type Reaction = {
  params: Params;
  duration: number; // seconds, excluding return
  returnTime: number;
  litFrac: number;
  color: RGB;
  color2: RGB;
  look: { persist: number; streak: number; sizeMul: number; lumMul: number; retW: number; retZ: number; expoMul: number; sparkle: number };
  weightsArr: number[]; // indexed like EMOTIONS
  matter: Record<'shock' | 'shockSpeed' | 'swirl' | 'ring' | 'ringK' | 'collapse' | 'sink' | 'noise' | 'lazy' | 'light' | 'lightR' | 'star' | 'flash', number>;
  /** 0..1: how indifferent the machine is to this word (low intensity) */
  lazy: number;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function deriveReaction(p: Params, t: Tuning): Reaction {
  const weightsArr = EMOTIONS.map((e) => p.weights[e] ?? 0);
  const wsum = weightsArr.reduce((a, b) => a + b, 0) || 1;
  const w = weightsArr.map((x) => x / wsum);
  const blend = (suffix: string) => EMOTIONS.reduce((acc, e, i) => acc + w[i] * num(t, `${e}.${suffix}`), 0);

  const tempShift = (p.temperature - 0.5) * num(t, 'tempHue'); // + hot → rotate toward orange
  const color = shiftHue(mixOklab(EMOTIONS.map((e) => hexToLinear(str(t, `${e}.color`))), w), -tempShift);
  const color2 = shiftHue(mixOklab(EMOTIONS.map((e) => hexToLinear(str(t, `${e}.color2`))), w), -tempShift);

  // hardness: soft → bigger grains, shorter streaks; hard → tiny sharp grains, straight long streaks
  const sizeMul = blend('size') * lerp(1.45, 0.7, p.hardness);
  const streak = blend('streak') * lerp(0.6, 1.5, p.energy) * lerp(0.8, 1.25, p.hardness);

  // indifference: below a threshold of intensity the emotion recedes and time passing takes over
  const lazy = Math.max(0, Math.min(1, (num(t, 'lazyBelow') - p.intensity) / Math.max(num(t, 'lazyBelow'), 0.01))) ** 0.8;
  const keep = 1 - 0.85 * lazy;
  const LAZY_LIGHT: RGB = hexToLinear('#E9B97A'); // low late-afternoon amber

  return {
    lazy,
    params: p,
    duration: lerp(5 + 5 * p.intensity, num(t, 'lazyDur'), lazy),
    returnTime: num(t, 'returnTime'),
    litFrac: lerp(num(t, 'litMin'), num(t, 'litMax'), p.intensity) * blend('litMul') * keep,
    color: mixOklab([color, LAZY_LIGHT], [1 - lazy * 0.7, lazy * 0.7]),
    color2: mixOklab([color2, LAZY_LIGHT], [1 - lazy * 0.5, lazy * 0.5]),
    look: {
      persist: blend('persist'),
      streak,
      sizeMul,
      lumMul: blend('lum') * lerp(0.55, 1.25, p.intensity),
      retW: blend('retW') * lerp(1.15, 0.8, p.weight),
      retZ: blend('retZ'),
      expoMul: lerp(0.7, 1.3, p.light),
      sparkle: blend('sparkle') * lerp(0.6, 1.2, p.hardness),
    },
    weightsArr: w,
    matter: {
      shock: keep * blend('shock') * lerp(0.6, 1.4, p.intensity) * lerp(0.8, 1.2, p.hardness),
      shockSpeed: blend('shockSpeed') * lerp(0.7, 1.4, p.energy),
      swirl: keep * blend('swirl') * lerp(0.6, 1.4, p.energy),
      ring: keep * blend('ring') * lerp(0.7, 1.3, p.intensity),
      ringK: blend('ringK') * lerp(1.3, 0.75, p.scale),
      collapse: keep * blend('collapse') + p.accents.closeness * 0.2,
      sink: blend('sink') + (p.weight - 0.5) * 0.3,
      noise: keep * blend('noise') * lerp(0.7, 1.3, p.energy),
      lazy,
      light: lerp(blend('light') * lerp(0.6, 1.5, p.light) * lerp(0.7, 1.3, p.intensity), 0.45, lazy),
      lightR: lerp(blend('lightR') * lerp(0.7, 1.4, p.scale), 1.4, lazy),
      star: keep * blend('star'),
      flash: keep * (blend('flash') + p.accents.violence * 2),
    },
  };
}

export const kindIndex = (k: Kind) => KINDS.indexOf(k);

export function neutralParams(seed = 1): Params {
  return {
    weights: { calm: 1 }, confidence: 0.8, intensity: 0.5, energy: 0.5, hardness: 0.5, weight: 0.5,
    temperature: 0.5, scale: 0.5, light: 0.5,
    accents: { violence: 0, loss: 0, closeness: 0, absurd: 0 },
    kind: 'feeling', seed,
  };
}
