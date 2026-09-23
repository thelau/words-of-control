import type { JevError } from '../../proxy/jev';

/** Jev System One response shapes (docs/jev-api.md §12.4). */
export type NoulAnswer = { type: 'noul'; noul: number };
export type ChoiceAnswer = { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> };
export type ScoreAnswer = {
  type: 'score'; score: number; confidence: number;
  legend?: Record<string, unknown>; probabilities: Record<string, number>; // keys "0".."n-1"
};
export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;
export type Answers = Record<string, Answer>;

export type Route =
  | { kind: 'react'; answers: Answers }
  | { kind: 'barred' }
  | { kind: 'support' }
  | { kind: 'fallback' }
  | { kind: 'error'; error: JevError };
