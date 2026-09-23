/**
 * Safety routing (§5.2), evaluated client-side on one response.
 * Thresholds calibrated on live Jev answers (docs/jev-calibration.md):
 * no ambiguous "fail-safe" band — it barred innocent words like "banana";
 * weak non-English slurs are covered by the blocklist instead.
 */
import type { Answers, NoulAnswer, ScoreAnswer } from '../jev/types';

export const THRESHOLDS = {
  hateFirst: 0.8, // an unmistakable slur is barred even if distress also fires
  distress: 0.5,
  hate: 0.4,
  insult: 0.5,
  sexual: 0.6,
  real_person: 0.4,
  shareableBad: 0.6, // P(offensive) + P(unacceptable)
};

export type Verdict = 'support' | 'barred' | 'react';

export function route(a: Answers): Verdict {
  const noul = (id: string) => (a[id] as NoulAnswer).noul;
  if (noul('hate') >= THRESHOLDS.hateFirst) return 'barred';
  if (noul('distress') >= THRESHOLDS.distress) return 'support';
  if (noul('hate') >= THRESHOLDS.hate) return 'barred';
  if (noul('insult') >= THRESHOLDS.insult) return 'barred';
  if (noul('sexual') >= THRESHOLDS.sexual) return 'barred';
  if (noul('real_person') >= THRESHOLDS.real_person) return 'barred';
  const sh = a.shareable as ScoreAnswer;
  const bad = (sh.probabilities['2'] ?? 0) + (sh.probabilities['3'] ?? 0);
  if (bad >= THRESHOLDS.shareableBad) return 'barred';
  return 'react';
}
