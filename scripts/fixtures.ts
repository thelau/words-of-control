/**
 * Record live Jev answers for OUR test words (never visitor input) into
 * src/jev/fixtures.json. Mock mode (?mock) and the e2e tests replay these, so
 * development is deterministic and costs no API calls.
 *   node scripts/fixtures.ts [word …]
 */
import { writeFileSync } from 'node:fs';
import { askJev } from '../proxy/jev.ts';

process.loadEnvFile('.env.local');
const WORDS = process.argv.slice(2).length ? process.argv.slice(2) : [
  'mother', 'knife', 'almost', 'sorry', 'fire', 'goodbye', 'banana', 'lol', 'asdfgh', 'fuck', 'nothing', 'maybe',
  'ocean', 'war', 'mmmm', 'table', 'hello', 'glass', 'thunder', 'sleep', 'rust', 'afternoon', 'why', 'kiss',
  'je t\'aime', '海', 'forever', 'scream', 'dust', 'home', 'want to die', 'fuck you', 'god', 'rain', 'laurent',
];
const out: Record<string, unknown> = {};
for (const w of WORDS) {
  let r = await askJev(w, process.env.TYPESAFE_API_KEY);
  if (!r.ok && r.error.kind === 'timeout') r = await askJev(w, process.env.TYPESAFE_API_KEY);
  if (!r.ok) { console.error(w, r.error.kind, r.error.message); continue; }
  // keep only what the piece reads (drop the echoed level legends)
  const a = r.answers as Record<string, Record<string, unknown>>;
  for (const v of Object.values(a)) delete v.legend;
  out[w] = a;
  process.stderr.write('.');
}
writeFileSync('src/jev/fixtures.json', JSON.stringify(out));
console.log(`\n${Object.keys(out).length} fixtures written`);
