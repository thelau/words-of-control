/**
 * Simulated visitors (docs/visitor-simulation.md — invented, held out from the reference list): records Jev's answers
 * for each entry (.cache/simulated.json, local; resumes), then scores how well the reference words match what is
 * typed:
 *   nearness — the distance from each entry to its nearest reference word on all the answers (the grid's own
 *              measure), against how close the reference words are to each other (leave one out): an entry much
 *              farther than that has no real neighbour;
 *   ceiling  — how many entries go beyond every reference word on some answer that matters (rarity at its cap:
 *              a coarser "what matters");
 *   and, per entry, its three nearest reference words, to read whether they make sense → .cache/simulation.md.
 *   node scripts/simulate.ts            (record what is missing, then score)
 *   node scripts/simulate.ts --score    (score only)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { askJev } from '../proxy/jev.ts';

const OUT = '.cache/simulated.json';
mkdirSync('.cache', { recursive: true });
const md = readFileSync('docs/visitor-simulation.md', 'utf8');
const groups = md.split(/^## /m).slice(1).map((part) => {
  const [head, ...rest] = part.split('\n');
  return { group: head.trim(), entries: rest.join('\n').split(/[,\n]/).map((w) => w.trim()).filter(Boolean) };
});
const recorded: Record<string, unknown> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};

if (!process.argv.includes('--score')) {
  process.loadEnvFile('.env.local');
  for (const { entries } of groups) for (const w of entries) {
    if (recorded[w]) continue;
    let r = await askJev(w, process.env.TYPESAFE_API_KEY);
    for (let k = 0; k < 2 && !r.ok && ['timeout', 'overloaded', 'rate_limit', 'server', 'network'].includes(r.error.kind); k++) {
      await new Promise((res) => setTimeout(res, 3000 * (k + 1)));
      r = await askJev(w, process.env.TYPESAFE_API_KEY);
    }
    if (!r.ok) { console.error(`${w}: ${r.error.kind}`); if (r.error.kind === 'credits' || r.error.kind === 'auth') break; continue; }
    recorded[w] = r.answers;
    writeFileSync(OUT, JSON.stringify(recorded));
  }
}

// score, with the piece's own code (through Vite: it reads the lexicon JSON)
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
const { buildAppraisal } = await server.ssrLoadModule('/src/jev/appraisal.ts');
const { grid } = await server.ssrLoadModule('/src/show/grid.ts');
type Cell = { value: number; lex: number[] };
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? NaN; };
const q90 = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length * 0.9)] ?? NaN; };

let refs: string[] = [], density: number[] = [];
const rows: { group: string; w: string; gap: number; near: string[]; ceiling: boolean }[] = [];
for (const { group, entries } of groups) for (const w of entries) {
  if (!recorded[w]) continue;
  const A = buildAppraisal(recorded[w], w, 1);
  const g = grid(A);
  const cells = g.cells as Cell[];
  const spread = cells.map((c) => Math.max(0.05, Math.max(...c.lex) - Math.min(...c.lex)));
  const gap = (vals: (k: number) => number, j: number) => cells.reduce((a, c, k) => a + ((vals(k) - c.lex[j]) / spread[k]) ** 2, 0) / cells.length;
  if (!refs.length) {
    // how close the reference words are to each other: each one's nearest other one
    refs = g.refs;
    density = refs.map((_, i) => Math.min(...refs.map((__, j) => (i === j ? Infinity : gap((k) => cells[k].lex[i], j)))));
  }
  const near = (g.near as number[]).slice(0, 3);
  const ceiling = (g.keys as number[]).some((k) => cells[k].value > Math.max(...cells[k].lex) || cells[k].value < Math.min(...cells[k].lex));
  rows.push({ group, w, gap: gap((k) => cells[k].value, near[0]), near: near.map((j) => g.refs[j]), ceiling });
}
await server.close();

const typical = median(density);
const far = rows.filter((r) => r.gap > 2 * typical);
const lines = [
  `# Simulated visitors × ${refs.length} reference words`, '',
  `${rows.length} entries. Nearest reference word: median distance ${median(rows.map((r) => r.gap)).toFixed(3)}, 90th percentile ${q90(rows.map((r) => r.gap)).toFixed(3)} — the reference words' own spacing ${typical.toFixed(3)} (median nearest other).`,
  `Without a real neighbour (more than twice that spacing): ${far.length} (${Math.round((100 * far.length) / rows.length)} %). Beyond every reference word on an answer that matters: ${rows.filter((r) => r.ceiling).length}.`, '',
  '| group | median distance | without a neighbour |', '|---|---|---|',
  ...groups.map(({ group }) => { const rs = rows.filter((r) => r.group === group); return `| ${group} | ${median(rs.map((r) => r.gap)).toFixed(3)} | ${rs.filter((r) => r.gap > 2 * typical).length} / ${rs.length} |`; }),
  '', '| entry | distance | nearest three |', '|---|---|---|',
  ...rows.map((r) => `| ${r.w} | ${r.gap.toFixed(3)}${r.gap > 2 * typical ? ' ·' : ''} | ${r.near.join(' · ')} |`),
];
writeFileSync('.cache/simulation.md', lines.join('\n'));
console.log(lines.slice(0, 5).join('\n'));
