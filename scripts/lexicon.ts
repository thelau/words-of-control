/**
 * The reference lexicon the grid compares a word against (src/jev/lexicon.json): the reference words' readings
 * (recorded by scripts/reference.ts from docs/reference-words.md), as numbers only (scores, the other answers, each
 * choice's distribution). These are the piece's own reference words — never what visitors typed.
 *   node scripts/lexicon.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildAppraisal } from '../src/jev/appraisal.ts';

const recorded = JSON.parse(readFileSync('src/jev/reference.json', 'utf8'));
const r2 = (x: number) => Math.round(x * 100) / 100;
const out: Record<string, { s: Record<string, number>; n: Record<string, number>; c: Record<string, Record<string, number>> }> = {};
for (const [w, a] of Object.entries(recorded)) {
  const A = buildAppraisal(a as never, w, 1);
  out[w] = {
    s: Object.fromEntries(Object.entries(A.s).map(([k, v]) => [k, r2(v)])),
    n: Object.fromEntries(Object.entries(A.n).map(([k, v]) => [k, r2(v)])),
    c: Object.fromEntries(Object.entries(A.c).map(([k, v]) => [k, Object.fromEntries(Object.entries(v.p).map(([o, p]) => [o, r2(p)]))])),
  };
}
writeFileSync('src/jev/lexicon.json', JSON.stringify(out));
console.log(`${Object.keys(out).length} words → src/jev/lexicon.json`);
