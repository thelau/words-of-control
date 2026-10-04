/**
 * The reference lexicon the grid compares a word against (src/jev/lexicon.json): the reference words' readings
 * (recorded by scripts/reference.ts from docs/reference-words.md), as numbers only (scores, the other answers, each
 * choice's distribution), compactly: the keys once, then each word's values in hundredths. These are the piece's own reference words — never what visitors typed.
 *   node scripts/lexicon.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildAppraisal } from '../src/jev/appraisal.ts';

// the list is the source: only the entries docs/reference-words.md still names (one cut there is gone here)
const md = readFileSync('docs/reference-words.md', 'utf8');
const listed = new Set(md.split(/^## .*$/m).slice(1).flatMap((part) => part.split(/[,\n]/).map((w) => w.trim().toLowerCase()).filter(Boolean)));
const recorded = Object.fromEntries(Object.entries(JSON.parse(readFileSync('src/jev/reference.json', 'utf8'))).filter(([w]) => listed.has(w)));
// compact: the keys once (scores, the other answers, each choice's options), then per word its values in that order,
// in hundredths (show/grid.ts reads it back)
const first = Object.values(recorded)[0];
const A0 = buildAppraisal(first as never, '', 1);
const keys = { s: Object.keys(A0.s), n: Object.keys(A0.n), c: Object.fromEntries(Object.entries(A0.c).map(([k, v]) => [k, Object.keys(v.p)])) };
const words: Record<string, number[]> = {};
for (const [w, a] of Object.entries(recorded)) {
  const A = buildAppraisal(a as never, w, 1);
  const h = (x: number | undefined) => Math.round((x ?? 0) * 100);
  words[w] = [...keys.s.map((k) => h(A.s[k])), ...keys.n.map((k) => h(A.n[k])), ...Object.entries(keys.c).flatMap(([k, os]) => os.map((o) => h(A.c[k].p[o])))];
}
writeFileSync('src/jev/lexicon.json', JSON.stringify({ keys, words }));
console.log(`${Object.keys(words).length} words → src/jev/lexicon.json`);
