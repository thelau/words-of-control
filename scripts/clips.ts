/**
 * Contact sheet of verdict clips played alone: each clip, on a given word's
 * answers, grabbed at a few moments. For polishing a clip in isolation.
 *   node scripts/clips.ts [--word mother] [--dur 5] [--seed 12345] clip …   → docs/captures/clips/
 * (a sand shot's material follows its seed: 12345, 1 and 10 show all three for a word)
 */
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { openSession } from './lib/headless.ts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const word = opt('--word', 'fuck');
const dur = Number(opt('--dur', '5'));
const seed = Number(opt('--seed', '12345'));
const clips = args.length ? args : ['landscape', 'city', 'lattice', 'cloud', 'tube', 'drift', 'relief', 'scan', 'chladni'];
const dir = 'docs/captures/clips';
mkdirSync(dir, { recursive: true });
const fixtures = JSON.parse(readFileSync('src/jev/fixtures.json', 'utf8'));

const s = await openSession({ width: 1280, height: 720 });
s.page.on('console', (m) => { if (/error|invalid|validation/i.test(m.text())) console.log('page:', m.text()); });
await s.page.goto(s.url + '?mock');
await s.page.waitForFunction(() => (window as any).__woc, null, { timeout: 30000 });
for (const clip of clips) {
  for (const f of readdirSync(dir)) if (f.startsWith(`${clip}-`)) rmSync(`${dir}/${f}`);
  const tag = `${clip}-${word}-${seed}`;
  await s.page.evaluate(([a, w, clip, dur, seed]) => {
    const W = (window as any).__woc;
    W.perform(a, w);
    const A = W.show().A;
    W.performPlan(A, { cuts: [], shots: [{ clip, start: 0.05, dur, seed, aborted: false, angles: [{ at: 0, seed: 0.5, zoom: 1, offX: 0, offY: 0 }] }], blackAt: dur + 0.1, end: dur + 0.3 });
  }, [fixtures[word], word, clip, dur, seed] as const);
  let n = 0;
  for (const u of [0.1, 0.3, 0.55, 0.9]) {
    await s.page.waitForFunction((t) => { const w = (window as any).__woc; const sh = w.show(); return !sh || w.audioClock() - sh.t0 >= t; }, 0.05 + u * dur, { polling: 'raf', timeout: 30000 });
    await s.page.screenshot({ path: `${dir}/${clip}-${n++}.png` });
  }
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-pattern_type', 'glob', '-i', `${dir}/${clip}-*.png`,
    '-vf', 'scale=640:-1,tile=4x1:padding=4:color=0x3a3a3a', '-frames:v', '1', `${dir}/sheet-${tag}.png`]);
  console.log(`${tag} → ${dir}/sheet-${tag}.png`);
  await s.page.waitForFunction(() => !(window as any).__woc.show(), null, { polling: 200, timeout: 20000 });
}
await s.close();
