/**
 * Mock Jev: plausible, deterministic answers without the API. Used until the
 * proxy is configured, and by the harness. Same shape as the real response.
 */
import { EMOTIONS, KINDS, type Emotion } from '../engine/emotions';
import { mulberry32, normalizeInput, xmur3 } from '../core/rng';
import type { Answers, ScoreAnswer } from './types';

type Hint = { e: Partial<Record<Emotion, number>>; s?: Partial<Record<string, number>>; n?: Partial<Record<string, number>>; kind?: string };

// scores are 0..4 expected values
const HINTS: Record<string, Hint> = {
  mother: { e: { tender: 0.7, calm: 0.15, sadness: 0.1 }, s: { hardness: 0.8, weight: 1.8, temperature: 3, intensity: 2.4 }, n: { closeness: 0.9 }, kind: 'living being' },
  knife: { e: { fear: 0.55, anger: 0.3, anxiety: 0.1 }, s: { hardness: 4, temperature: 1, energy: 2.5, intensity: 3 }, n: { violence: 0.8 }, kind: 'object' },
  almost: { e: { anxiety: 0.45, sadness: 0.25, calm: 0.15 }, s: { intensity: 1.2 }, kind: 'abstract idea' },
  sorry: { e: { sadness: 0.55, tender: 0.3, anxiety: 0.1 }, s: { hardness: 1, intensity: 1.8 }, n: { loss: 0.4 }, kind: 'feeling' },
  fire: { e: { anger: 0.45, awe: 0.25, fear: 0.2 }, s: { temperature: 4, energy: 3.6, light: 3.8, intensity: 3.4 }, kind: 'object' },
  goodbye: { e: { sadness: 0.8, tender: 0.15 }, s: { weight: 3, intensity: 2.5, energy: 0.8 }, n: { loss: 0.85 }, kind: 'action' },
  banana: { e: { playful: 0.75, joy: 0.2 }, s: { hardness: 1, weight: 1, light: 3 }, n: { absurd: 0.7 }, kind: 'object' },
  lol: { e: { playful: 0.6, joy: 0.35 }, s: { energy: 3, weight: 0.6, intensity: 1.8 }, n: { absurd: 0.6 }, kind: 'sound' },
  asdfgh: { e: { playful: 0.35, anxiety: 0.3, calm: 0.15 }, s: { hardness: 3, intensity: 1 }, n: { absurd: 0.8 }, kind: 'nonsense' },
  fuck: { e: { anger: 0.85, anxiety: 0.08 }, s: { hardness: 3.8, energy: 3.8, intensity: 3.6, temperature: 3.5 }, n: { violence: 0.3 }, kind: 'sound' },
  nothing: { e: { calm: 0.4, sadness: 0.35, awe: 0.15 }, s: { weight: 0.3, intensity: 0.6, light: 1, scale: 3 }, n: { loss: 0.55 }, kind: 'abstract idea' },
  maybe: { e: { anxiety: 0.3, calm: 0.3, playful: 0.2, tender: 0.1 }, s: { intensity: 0.8 }, kind: 'abstract idea' },
  ocean: { e: { awe: 0.55, calm: 0.4 }, s: { scale: 4, weight: 2.5, temperature: 1.2, energy: 1.5, intensity: 2.8 }, kind: 'place' },
  war: { e: { fear: 0.4, anger: 0.35, sadness: 0.2 }, s: { weight: 4, hardness: 3.8, scale: 3.8, intensity: 3.9, light: 0.4 }, n: { violence: 0.95, loss: 0.6 }, kind: 'abstract idea' },
  mmmm: { e: { calm: 0.5, tender: 0.3, joy: 0.15 }, s: { hardness: 0.3, energy: 0.6, intensity: 1.2 }, kind: 'sound' },
};

/** Test tokens for safety paths while mocked. */
const MOCK_BARRED = ['slurtest', 'fuck you'];
const MOCK_SUPPORT = ['want to die', 'kill myself'];
export const MOCK_ERROR = 'errortest';

function score(v: number, conf = 0.7): ScoreAnswer {
  const probabilities: Record<string, number> = {};
  let sum = 0;
  for (let i = 0; i < 5; i++) {
    const p = Math.exp(-Math.pow(i - v, 2) * 1.6);
    probabilities[String(i)] = p;
    sum += p;
  }
  for (const k in probabilities) probabilities[k] /= sum;
  return { type: 'score', score: v, confidence: conf, probabilities };
}

export function mockAnswers(text: string): Answers {
  const norm = normalizeInput(text);
  const rand = mulberry32(xmur3('mock:' + norm)());
  const hint = HINTS[norm];

  // emotion distribution
  const probs: Record<string, number> = {};
  let sum = 0;
  for (const e of EMOTIONS) {
    const p = (hint?.e[e] ?? 0) + Math.pow(rand(), 4) * (hint ? 0.1 : 0.9);
    probs[e] = p;
    sum += p;
  }
  for (const e of EMOTIONS) probs[e] /= sum;
  const top = EMOTIONS.reduce((a, b) => (probs[a] > probs[b] ? a : b));
  // confidence ≈ 1 − normalized entropy
  const H = -EMOTIONS.reduce((s, e) => s + (probs[e] > 0 ? probs[e] * Math.log(probs[e]) : 0), 0);
  const confidence = 1 - H / Math.log(EMOTIONS.length);

  const sc = (id: string) => score(hint?.s?.[id] ?? 0.6 + rand() * 2.8);
  const nl = (id: string) => ({ type: 'noul' as const, noul: hint?.n?.[id] ?? rand() * 0.2 });

  const barred = MOCK_BARRED.includes(norm);
  const support = MOCK_SUPPORT.some((s) => norm.includes(s));
  const kind = hint?.kind ?? KINDS[Math.floor(rand() * KINDS.length)];

  return {
    emotion: { type: 'choice', choice: top, confidence, probabilities: probs },
    kind: { type: 'choice', choice: kind, confidence: 0.7, probabilities: { [kind]: 1 } },
    hardness: sc('hardness'), weight: sc('weight'), temperature: sc('temperature'), scale: sc('scale'),
    energy: sc('energy'), intensity: sc('intensity'), light: sc('light'),
    violence: nl('violence'), loss: nl('loss'), closeness: nl('closeness'), absurd: nl('absurd'),
    hate: { type: 'noul', noul: barred ? 0.9 : 0.02 },
    insult: { type: 'noul', noul: barred ? 0.8 : 0.03 },
    sexual: { type: 'noul', noul: 0.01 },
    real_person: { type: 'noul', noul: 0.01 },
    distress: { type: 'noul', noul: support ? 0.8 : 0.02 },
    shareable: { type: 'score', score: barred ? 3 : 0.2, confidence: 0.8, probabilities: barred ? { '0': 0, '1': 0.05, '2': 0.25, '3': 0.7 } : { '0': 0.8, '1': 0.2, '2': 0, '3': 0 } },
  };
}
