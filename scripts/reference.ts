/**
 * Record Jev's answers for the piece's reference words (docs/reference-words.md — the norm every visitor's words are
 * measured against; never visitors' words) into src/jev/reference.json. Resumes: words already recorded are skipped,
 * and the file is saved as it goes. Then run scripts/lexicon.ts.
 *   node scripts/reference.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { askJev } from '../proxy/jev.ts';

process.loadEnvFile('.env.local');
const OUT = 'src/jev/reference.json';
// the list: every comma-separated entry under a "## …" heading
const md = readFileSync('docs/reference-words.md', 'utf8');
const words = [...new Set(md.split(/^## .*$/m).slice(1).flatMap((part) => part.split(/[,\n]/).map((w) => w.trim().toLowerCase()).filter(Boolean)))];
const out: Record<string, unknown> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
let done = 0, failed = 0;
for (const w of words) {
  if (out[w]) { done++; continue; }
  let r = await askJev(w, process.env.TYPESAFE_API_KEY);
  for (let k = 0; k < 2 && !r.ok && ['timeout', 'overloaded', 'rate_limit', 'server', 'network'].includes(r.error.kind); k++) {
    await new Promise((res) => setTimeout(res, 3000 * (k + 1)));
    r = await askJev(w, process.env.TYPESAFE_API_KEY);
  }
  if (!r.ok) { failed++; console.error(`${w}: ${r.error.kind}`); if (r.error.kind === 'credits' || r.error.kind === 'auth') break; continue; }
  // keep only what the piece reads (drop the echoed level legends)
  const a = r.answers as Record<string, Record<string, unknown>>;
  for (const v of Object.values(a)) delete v.legend;
  out[w] = a;
  done++;
  if (done % 10 === 0) { writeFileSync(OUT, JSON.stringify(out)); console.log(`${done} / ${words.length}`); }
}
writeFileSync(OUT, JSON.stringify(out));
console.log(`${Object.keys(out).length} of ${words.length} recorded${failed ? `, ${failed} failed` : ''} → ${OUT}`);
