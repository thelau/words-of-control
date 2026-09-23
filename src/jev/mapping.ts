/** Jev answers → Params (§11). Downstream never sees raw answers. */
import { EMOTIONS, KINDS, type Emotion, type Kind } from '../engine/emotions';
import { blendWeights, type Params } from '../engine/params';
import type { Answers, ChoiceAnswer, NoulAnswer, ScoreAnswer } from './types';

const SCORE_LEVELS = 5;

export function toParams(a: Answers, seed: number): Params {
  const choice = (id: string) => a[id] as ChoiceAnswer;
  const score = (id: string) => {
    const s = a[id] as ScoreAnswer | undefined;
    return s ? Math.min(1, Math.max(0, s.score / (SCORE_LEVELS - 1))) : 0.5;
  };
  const noul = (id: string) => (a[id] as NoulAnswer | undefined)?.noul ?? 0;

  const emo = choice('emotion');
  const dist: Partial<Record<Emotion, number>> = {};
  for (const e of EMOTIONS) dist[e] = emo.probabilities[e] ?? 0;
  const kind = (KINDS as readonly string[]).includes(choice('kind')?.choice) ? (choice('kind').choice as Kind) : 'abstract idea';

  return {
    weights: blendWeights(dist),
    confidence: emo.confidence,
    intensity: score('intensity'),
    energy: score('energy'),
    hardness: score('hardness'),
    weight: score('weight'),
    temperature: score('temperature'),
    scale: score('scale'),
    light: score('light'),
    accents: { violence: noul('violence'), loss: noul('loss'), closeness: noul('closeness'), absurd: noul('absurd') },
    kind,
    seed,
  };
}
