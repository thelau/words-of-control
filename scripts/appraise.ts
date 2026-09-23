/**
 * Run the full battery (core + appraisal v2) on words and print a review table.
 *   node scripts/appraise.ts [--out docs/file.md] word1 word2 ...
 * Uses .env.local TYPESAFE_API_KEY via proxy/jev.ts. Never prints the key.
 */
import { writeFileSync } from 'node:fs';
import { askJev } from '../proxy/jev.ts';

process.loadEnvFile('.env.local');
const args = process.argv.slice(2);
const oi = args.indexOf('--out');
const out = oi >= 0 ? args.splice(oi, 2)[1] : null;
const words = args.length ? args : ['mother', 'knife', 'almost', 'sorry', 'fire', 'goodbye', 'banana', 'lol', 'asdfgh', 'fuck', 'nothing', 'maybe', 'ocean', 'war', 'mmmm', 'table', 'laurent', 'je t\'aime', '海', 'hello'];

type A = Record<string, any>;
const top = (c: A, n = 1) => Object.entries(c.probabilities as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}`).join(', ');
const sc = (s: A) => (s.score / (Object.keys(s.probabilities).length - 1)).toFixed(2);

const rows: string[] = [];
const cols = ['word', 'ms', 'emotion (conf)', 'material', 'texture', 'shape', 'motion', 'rhythm', 'colour', 'val', 'aro', 'dom', 'order', 'dens', 'loud', 'pitch', 'kiki', 'noise', 'dist', 'who', 'domain', 'act', 'time', 'day'];
rows.push('| ' + cols.join(' | ') + ' |', '|' + cols.map(() => '---').join('|') + '|');
let total = 0;
for (const w of words) {
  const t0 = performance.now();
  let r = await askJev(w, process.env.TYPESAFE_API_KEY);
  if (!r.ok && r.error.kind === 'timeout') r = await askJev(w, process.env.TYPESAFE_API_KEY);
  const ms = Math.round(performance.now() - t0);
  total += ms;
  if (!r.ok) { rows.push(`| ${w} | ${ms} | ERROR ${r.error.kind}: ${r.error.message} |`); continue; }
  const a = r.answers as A;
  rows.push('| ' + [w, ms, `${top(a.emotion, 2)} (${a.emotion.confidence.toFixed(2)})`, top(a.material, 2), top(a.texture), top(a.shape, 2), top(a.motion, 2), top(a.rhythm), top(a.colour),
    sc(a.valence), sc(a.arousal), sc(a.dominance), sc(a.order), sc(a.density), sc(a.loudness), sc(a.pitch), sc(a.phonetics), sc(a.tone), sc(a.distance),
    a.who.choice, a.domain.choice, a.act.choice, a.time.choice, a.daytime.choice].join(' | ') + ' |');
  process.stderr.write('.');
}
const md = `# Appraisal battery v2 — live answers (${new Date().toISOString().slice(0, 10)})\n\n49 questions in one call. Mean latency ${Math.round(total / words.length)} ms (includes network).\nChoice cells: top options with %; scores normalised 0–1.\n\n${rows.join('\n')}\n`;
if (out) writeFileSync(out, md);
console.log('\n' + md);
