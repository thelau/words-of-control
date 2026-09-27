/**
 * Visual check: perform recorded words headless and save a contact sheet per
 * word to docs/captures/<dir>/ (local only, not in git): the grid filling, marked, cleared, merging, a few of its
 * steps, the black, the room after.
 *   node scripts/capture.ts [--dir v2] [--size 1280x720x1] word …
 * Needs ffmpeg for the sheets (frames are kept either way).
 */
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { openSession } from './lib/headless.ts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = args.indexOf(`--${k}`); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const dir = path.resolve('docs/captures', opt('dir', 'v2'));
const [W, H, DPR] = opt('size', '1280x720x1').split('x').map(Number);
const fixtures = JSON.parse(readFileSync('src/jev/fixtures.json', 'utf8'));
const words = args.length ? args : ['fuck', 'knife', 'nothing', 'ocean', 'mother', 'dust', 'glass', 'goodbye'];
mkdirSync(dir, { recursive: true });

const s = await openSession({ width: W, height: H, dpr: DPR });
const errors: string[] = [];
s.page.on('console', (m) => { if (m.type() === 'error' || /invalid|validation/i.test(m.text())) errors.push(m.text()); });
await s.page.goto(`${s.url}?mock`);
await s.page.waitForFunction(() => (window as any).__woc, null, { timeout: 90000 });
await s.page.waitForTimeout(1200);

for (const w of words) {
  if (!fixtures[w]) { console.error(`no fixture for ${w}`); continue; }
  await s.page.evaluate(([a, w]) => (window as any).__woc.perform(a, w), [fixtures[w], w]);
  const g = await s.page.evaluate(() => (window as any).__woc.show().g);
  // moments to grab, in performance time
  const at: [string, number][] = [['fill', (g.mark - 0.3) * 0.5], ['filled', g.mark - 0.05], ['marked', g.select - 0.02],
    ['cleared', g.seq - 0.05]];
  for (const k of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 19]) { const st = g.steps[k]; if (st) at.push([`step${k}-${st.viz}${st.full ? '-full' : ''}`, st.t + st.dur * 0.5]); }
  at.push(['black', g.end + 0.3]);
  const slug = w.replace(/[^\p{L}\p{N}]+/gu, '_');
  // a new edit of this word replaces the old frames (a shorter plan would otherwise interleave stale ones)
  for (const f of readdirSync(dir)) if (f.startsWith(`${slug}-`)) rmSync(`${dir}/${f}`);
  let n = 0;
  for (const [label, t] of at) {
    console.error(`  … ${label} @${t.toFixed(2)}`);
    await s.page.waitForFunction((t) => { const w = (window as any).__woc; const sh = w.show(); return !sh || w.audioClock() - sh.t0 >= t; }, t, { polling: 'raf', timeout: 90000 });
    await s.page.screenshot({ path: `${dir}/${slug}-${String(n++).padStart(2, '0')}-${label}.png` });
  }
  await s.page.waitForFunction(() => !(window as any).__woc.show(), null, { polling: 100, timeout: 90000 });
  await s.page.waitForTimeout(1500);
  await s.page.screenshot({ path: `${dir}/${slug}-${String(n++).padStart(2, '0')}-room.png` });
  try {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-pattern_type', 'glob', '-i', `${dir}/${slug}-*.png`,
      '-vf', `scale=480:-1,tile=4x${Math.ceil(n / 4)}:padding=6:color=0x3a3a3a`, '-frames:v', '1', `${dir}/sheet-${slug}.png`]);
  } catch { /* frames remain */ }
  console.log(`${w}: ${g.bpm} bpm, ${g.keys.length} matter → ${dir}/sheet-${slug}.png`);
}
await s.close();
if (errors.length) { console.error('console errors:\n' + [...new Set(errors)].join('\n')); process.exit(1); }
