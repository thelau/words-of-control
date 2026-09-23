/**
 * Offline Jev (?mock): replays live answers recorded for our own test words
 * (src/jev/fixtures.json, see scripts/fixtures.ts). An unknown word borrows a
 * recorded appraisal chosen by hash, so it is still deterministic.
 * Test tokens: `errortest` → error popup; `want to die` → support; `fuck you` → barred.
 */
import { normalizeInput, xmur3 } from '../core/rng.ts';
import type { Answers } from './types.ts';

export const MOCK_ERROR = 'errortest';

let fixtures: Record<string, Answers> | null = null;

export async function mockAnswers(text: string): Promise<Answers> {
  fixtures ??= (await import('./fixtures.json')).default as unknown as Record<string, Answers>;
  const key = normalizeInput(text);
  if (fixtures[key]) return fixtures[key];
  const words = Object.keys(fixtures).filter((w) => w !== 'want to die' && w !== 'fuck you');
  return fixtures[words[xmur3(key)() % words.length]];
}
