/**
 * One visitor, several words in a row (the same session: the room remembers): a strip of each verdict, to see
 * whether the second word looks like the first.
 *   node scripts/sequence.ts word …   → docs/captures/sequence.png
 */
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { openSession } from './lib/headless.ts';

const words = process.argv.slice(2).length ? process.argv.slice(2) : ['love', 'war', 'joy', 'spoon', 'grief', 'fear'];
const dir = 'docs/captures/sequence';
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const fixtures = JSON.parse(readFileSync('src/jev/fixtures.json', 'utf8'));
const s = await openSession({ width: 1280, height: 720 });
await s.page.goto(s.url + '?mock');
await s.page.waitForFunction(() => (window as any).__woc, null, { timeout: 30000 });
let n = 0;
for (const w of words) {
  await s.page.evaluate(([a, w]) => (window as any).__woc.perform(a, w), [fixtures[w], w]);
  const plan = await s.page.evaluate(() => (window as any).__woc.show().plan);
  const v0 = plan.shots[0].start, span = plan.blackAt - v0;
  console.log(`${w.padEnd(14)} ${plan.species.padEnd(6)} ${plan.drama.padEnd(10)} ${plan.shots.map((x: any) => x.clip).join(' ')}`);
  for (const u of [0.15, 0.5, 0.85]) {
    await s.page.waitForFunction((t) => { const W = (window as any).__woc; const sh = W.show(); return !sh || W.audioClock() - sh.t0 >= t; }, v0 + u * span, { polling: 'raf', timeout: 90000 });
    await s.page.screenshot({ path: `${dir}/${String(n++).padStart(3, '0')}.png` });
  }
  await s.page.waitForFunction(() => !(window as any).__woc.show(), null, { polling: 200, timeout: 90000 });
}
await s.close();
execFileSync('ffmpeg', ['-v', 'error', '-y', '-pattern_type', 'glob', '-i', `${dir}/*.png`,
  '-vf', `scale=400:-1,tile=3x${words.length}:padding=4:color=0x3a3a3a`, '-frames:v', '1', 'docs/captures/sequence.png']);
console.log('→ docs/captures/sequence.png');
