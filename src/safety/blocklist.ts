/**
 * Pre-call blocklist (§5.1): slurs and hate terms only — never ordinary profanity.
 * Matching is by whole token (so "spice" never trips a short slur), plus the
 * whole input with spaces removed (so "babi cina" and "b a b i c i n a" match).
 */
import list from './blocklist.json' with { type: 'json' };

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '') // strip diacritics
    .replace(/[013457@$]/g, (c) => LEET[c] ?? c)
    .replace(/(.)\1+/gu, '$1'); // collapse repeats
}

const squash = (s: string) => s.replace(/[\s\p{P}\p{S}]+/gu, '');

const ALL = (list as { terms: string[] }).terms.map((t) => squash(norm(t))).filter(Boolean);
const TERMS = new Set(ALL);
// scripts written without spaces between words: match anywhere
const UNSPACED = ALL.filter((t) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u.test(t));

export function isBlocked(text: string): boolean {
  const n = norm(text);
  const sq = squash(n);
  if (TERMS.has(sq)) return true;
  if (UNSPACED.some((t) => sq.includes(t))) return true;
  const tokens = n.split(/[\s\p{P}\p{S}]+/u).filter(Boolean);
  // single tokens, and adjacent pairs (for two-word terms)
  for (let i = 0; i < tokens.length; i++) {
    if (TERMS.has(tokens[i])) return true;
    if (i + 1 < tokens.length && TERMS.has(tokens[i] + tokens[i + 1])) return true;
  }
  return false;
}
