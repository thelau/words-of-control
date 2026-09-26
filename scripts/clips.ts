/**
 * Contact sheet of verdict clips played alone: each clip, on a given word's
 * answers, grabbed at a few moments. For polishing a clip in isolation.
 *   node scripts/clips.ts [--word mother] [--dur 5] [--seed 12345] [--ops echo,warp,flow] clip …   → docs/captures/clips/
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
const [echo, warp, flow] = opt('--ops', '0,0,0').split(',').map(Number);
// --angles n: n camera angles across the shot (seeds spread over 0..1), one frame grabbed in each
const nAngles = Number(opt('--angles', '1'));
const clips = args.length ? args : ['landscape', 'city', 'lattice', 'cloud', 'tube', 'drift', 'relief', 'chladni'];
const dir = 'docs/captures/clips';
mkdirSync(dir, { recursive: true });
const fixtures = JSON.parse(readFileSync('src/jev/fixtures.json', 'utf8'));

// --phone: a portrait phone viewport (390×844 @3×)
const phone = args.includes('--phone');
if (phone) args.splice(args.indexOf('--phone'), 1);
const s = await openSession(phone ? { width: 390, height: 844, dpr: 3 } : { width: 1280, height: 720 });
s.page.on('console', (m) => { if (/error|invalid|validation/i.test(m.text())) console.log('page:', m.text()); });
await s.page.goto(s.url + '?mock');
await s.page.waitForFunction(() => (window as any).__woc, null, { timeout: 30000 });
for (const clip of clips) {
  for (const f of readdirSync(dir)) if (f.startsWith(`${clip}-`)) rmSync(`${dir}/${f}`);
  const tag = `${clip}-${word}-${seed}-${echo}${warp}${flow}`;
  await s.page.evaluate(([a, w, clip, dur, seed, echo, warp, flow, nAngles]) => {
    const W = (window as any).__woc;
    W.perform(a, w);
    const A = W.show().A;
    W.performPlan(A, { cuts: [], shots: [{ clip, start: 0.05, dur, seed, aborted: false, angles: Array.from({ length: nAngles }, (_, k) => ({ at: (k * dur) / nAngles, seed: nAngles > 1 ? (k + 0.37) / nAngles : 0.5, zoom: 1, offX: 0, offY: 0 })), ops: { echo, warp, flow } }], cycles: [], blackAt: dur + 0.1, end: dur + 0.3 });
  }, [fixtures[word], word, clip, dur, seed, echo, warp, flow, nAngles] as const);
  let n = 0;
  for (const u of nAngles > 1 ? Array.from({ length: nAngles }, (_, k) => (k + 0.6) / nAngles) : [0.1, 0.3, 0.55, 0.9]) {
    await s.page.waitForFunction((t) => { const w = (window as any).__woc; const sh = w.show(); return !sh || w.audioClock() - sh.t0 >= t; }, 0.05 + u * dur, { polling: 'raf', timeout: 90000 });
    await s.page.screenshot({ path: `${dir}/${clip}-${n++}.png` });
  }
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-pattern_type', 'glob', '-i', `${dir}/${clip}-*.png`,
    '-vf', `scale=640:-1,tile=${Math.min(4, Math.max(4, nAngles))}x${Math.ceil(Math.max(4, nAngles) / 4)}:padding=4:color=0x3a3a3a`, '-frames:v', '1', `${dir}/sheet-${tag}.png`]);
  console.log(`${tag} → ${dir}/sheet-${tag}.png`);
  await s.page.waitForFunction(() => !(window as any).__woc.show(), null, { polling: 200, timeout: 90000 });
}
await s.close();
