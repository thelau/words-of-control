/**
 * Visual check: perform recorded words headless and save a contact sheet per
 * word to docs/captures/<dir>/ (local only, not in git): 3 appraisal cuts,
 * each shot early and late, the black tail, the room after.
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
await s.page.waitForFunction(() => (window as any).__woc, null, { timeout: 30000 });
await s.page.waitForTimeout(1200);

for (const w of words) {
  if (!fixtures[w]) { console.error(`no fixture for ${w}`); continue; }
  await s.page.evaluate(([a, w]) => (window as any).__woc.perform(a, w), [fixtures[w], w]);
  const plan = await s.page.evaluate(() => (window as any).__woc.show().plan);
  // moments to grab, in performance time
  const at: [string, number][] = [];
  const cuts = plan.cuts;
  for (const k of [0, Math.floor(cuts.length / 2), cuts.length - 1]) at.push([`cut-${cuts[k].mode}`, cuts[k].start + cuts[k].dur * 0.6]);
  // one frame per camera angle (at most four per shot)
  plan.shots.forEach((sh: any, i: number) => {
    const angles = sh.angles.slice(0, 4);
    angles.forEach((a: any, k: number) => {
      const end = k + 1 < sh.angles.length ? sh.angles[k + 1].at : sh.dur;
      at.push([`shot${i}-${sh.clip}-${k}`, sh.start + a.at + (end - a.at) * 0.6]);
    });
  });
  at.push(['black', plan.blackAt + 0.5]);
  at.sort((x, y) => x[1] - y[1]); // grab in time order (the signature cut comes after the shots)
  const slug = w.replace(/[^\p{L}\p{N}]+/gu, '_');
  // a new edit of this word replaces the old frames (a shorter plan would otherwise interleave stale ones)
  for (const f of readdirSync(dir)) if (f.startsWith(`${slug}-`)) rmSync(`${dir}/${f}`);
  let n = 0;
  for (const [label, t] of at) {
    await s.page.waitForFunction((t) => { const w = (window as any).__woc; const sh = w.show(); return !sh || w.audioClock() - sh.t0 >= t; }, t, { polling: 'raf', timeout: 30000 });
    await s.page.screenshot({ path: `${dir}/${slug}-${String(n++).padStart(2, '0')}-${label}.png` });
  }
  await s.page.waitForFunction(() => !(window as any).__woc.show(), null, { polling: 100, timeout: 40000 });
  await s.page.waitForTimeout(1500);
  await s.page.screenshot({ path: `${dir}/${slug}-${String(n++).padStart(2, '0')}-room.png` });
  try {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-pattern_type', 'glob', '-i', `${dir}/${slug}-*.png`,
      '-vf', `scale=480:-1,tile=4x${Math.ceil(n / 4)}:padding=6:color=0x3a3a3a`, '-frames:v', '1', `${dir}/sheet-${slug}.png`]);
  } catch { /* frames remain */ }
  console.log(`${w} [${plan.drama}]: ${plan.shots.map((x: any) => (x.aborted ? '~' : '') + x.clip + (x.ops ? `(${x.ops.echo}${x.ops.warp}${x.ops.flow})` : '')).join(' ')} → ${dir}/sheet-${slug}.png`);
}
await s.close();
if (errors.length) { console.error('console errors:\n' + [...new Set(errors)].join('\n')); process.exit(1); }
