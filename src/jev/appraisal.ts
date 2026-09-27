/**
 * The appraisal: everything the machine knows about one submission, in one
 * typed object. Built from Jev's answers + what the page measured locally
 * (the word's bytes, how it was typed). Lives only for one performance and is
 * never stored. Downstream (director, image, sound) reads only this.
 */
import { APPRAISAL, QUESTIONS } from './questions.ts';
import type { Answers, ChoiceAnswer, NoulAnswer, ScoreAnswer } from './types.ts';

const ALL = { ...QUESTIONS, ...APPRAISAL } as Record<string, { type: string; criteria?: unknown }>;
const MODERATION = new Set(['hate', 'insult', 'sexual', 'real_person', 'distress', 'shareable']);

/** Question ids by type, in battery order (moderation excluded: it is not material for the art). */
const idsOf = (type: string) => Object.keys(ALL).filter((k) => ALL[k].type === type && !MODERATION.has(k));
export const SCORE_IDS = idsOf('score');
export const CHOICE_IDS = idsOf('choice');
export const NOUL_IDS = idsOf('noul');
/** The options of each choice question, in battery order. */
export const OPTIONS: Record<string, string[]> = Object.fromEntries(
  CHOICE_IDS.map((k) => [k, Object.keys(ALL[k].criteria as Record<string, string>)]),
);

export type Choice = { top: string; p: Record<string, number>; confidence: number };

export type Appraisal = {
  seed: number;
  /** UTF-8 bytes of the word: the most literal data there is. */
  bytes: Uint8Array;
  /** Scores normalised to 0..1, by question id. */
  s: Record<string, number>;
  c: Record<string, Choice>;
  n: Record<string, number>;
  /** How sure Jev is of each answer (0..1), by question id: a choice's or a score's own confidence; for the others
   *  (a probability of yes), how far from a coin toss. */
  k: Record<string, number>;
  /** 0..1 — how indifferent the machine is to this word. */
  lazy: number;
  /** The mood the piece is played in (sums to 1): each is its own world, in image and in sound. */
  mood: { pos: number; neu: number; neg: number };
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function buildAppraisal(a: Answers, text: string, seed: number): Appraisal {
  const s: Record<string, number> = {};
  const k: Record<string, number> = {};
  for (const id of SCORE_IDS) {
    const q = a[id] as ScoreAnswer | undefined;
    const levels = Array.isArray(ALL[id].criteria) ? (ALL[id].criteria as unknown[]).length : 5;
    s[id] = q ? clamp01(q.score / (levels - 1)) : 0.5;
    k[id] = q?.confidence ?? 0;
  }
  const c: Record<string, Choice> = {};
  for (const id of CHOICE_IDS) {
    const q = a[id] as ChoiceAnswer | undefined;
    const p: Record<string, number> = {};
    for (const o of OPTIONS[id]) p[o] = q?.probabilities[o] ?? 0;
    const top = q?.choice ?? OPTIONS[id][0];
    c[id] = { top, p, confidence: q?.confidence ?? 0 };
    k[id] = q?.confidence ?? 0;
  }
  const n: Record<string, number> = {};
  for (const id of NOUL_IDS) { n[id] = (a[id] as NoulAnswer | undefined)?.noul ?? 0; k[id] = Math.abs(2 * n[id] - 1); }

  const bytes = new TextEncoder().encode(text);

  // Indifference: faint, calm, ordinary, uncharged — "a lazy afternoon".
  const lazy = clamp01(
    (1 - s.intensity) * 0.45 + (1 - s.arousal) * 0.2 + (1 - s.strangeness) * 0.15 + (1 - Math.abs(s.valence - 0.5) * 2) * 0.2 - 0.35,
  ) / 0.65;

  // the mood: light for joy, tenderness, awe, play and warm calm; clinical for the neutral and the idle;
  // dark for anger, fear, anxiety, sadness and violence
  const em = c.emotion.p;
  const pos = (em.joy + em.tender + em.awe + em.playful + em.calm * 0.5) * (0.4 + s.valence) + n.closeness * 0.3;
  const neg = (em.anger + em.fear + em.anxiety + em.sadness) * (1.4 - s.valence) + n.violence * 0.8 + n.loss * 0.4;
  const neu = clamp01(lazy) * 0.9 + (1 - s.intensity) * 0.5 + (1 - c.emotion.confidence) * 0.3 + (c.kind?.p?.object ?? 0) * 0.5;
  const sum = pos + neg + neu + 1e-6;
  return { seed, bytes, s, c, n, k, lazy: clamp01(lazy), mood: { pos: pos / sum, neu: neu / sum, neg: neg / sum } };
}
