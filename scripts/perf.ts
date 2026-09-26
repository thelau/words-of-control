/**
 * Performance check (run on every visual change):  npm run perf
 *
 * Renders at a MacBook Pro 16" screen (1728×1117 @2×) with normal vsync and
 * reports, per phase, the GPU's own time per frame (timestamp queries) and
 * dropped frames. The budget is set so an ordinary laptop still holds 60 fps:
 * on an M3 Pro the GPU p95 must stay under 8.3 ms (≥ 2× headroom), and no
 * frame may take longer than 33 ms (a visible hitch). Exits non-zero when over.
 *
 *   npm run perf -- --size 1280x720x1  # WxHxDPR
 */
import { readFileSync } from 'node:fs';
import { openSession } from './lib/headless.ts';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const [W, H, DPR] = arg('size', '1728x1117x2').split('x').map(Number);
const BUDGET_P95_MS = Number(arg('budget', '8.3'));

const s = await openSession({ width: W, height: H, dpr: DPR });
const { page } = s;
await page.goto(`${s.url}?mock&full`);
await page.waitForFunction(() => (window as any).__woc, null, { timeout: 30000 });
await page.waitForTimeout(1500);

// per frame: the rAF interval (dropped frames) and the GPU's time for that frame
const sample = (ms: number) => page.evaluate((ms) => new Promise<{ dt: number[]; gpu: number[] }>((res) => {
  const W = (window as any).__woc;
  const dt: number[] = [];
  const gpu: number[] = [];
  let last = performance.now();
  const t0 = last;
  const f = (now: number) => {
    dt.push(now - last);
    last = now;
    const g = W.gpuMs();
    if (g > 0) gpu.push(g);
    if (now - t0 < ms) requestAnimationFrame(f); else res({ dt: dt.slice(2), gpu });
  };
  requestAnimationFrame(f);
}), ms);

const q = (d: number[], p: number) => { const x = [...d].sort((a, b) => a - b); return x[Math.min(x.length - 1, Math.floor(p * x.length))] ?? 0; };
const stats = (r: { dt: number[]; gpu: number[] }) => ({
  frames: r.dt.length,
  gpuMean: r.gpu.reduce((a, b) => a + b, 0) / Math.max(1, r.gpu.length),
  gpuP95: q(r.gpu, 0.95),
  gpuMax: q(r.gpu, 1),
  worstFrame: q(r.dt, 1),
  dropped: r.dt.filter((x) => x > 25).length,
});

const fixtures = JSON.parse(readFileSync('src/jev/fixtures.json', 'utf8'));
const rows: [string, ReturnType<typeof stats>][] = [];
rows.push(['room (rest)', stats(await sample(2000))]);
// one performance per clip family, sampled through its verdict
for (const [word, label] of [['fuck', 'verdict (fuck)'], ['mother', 'verdict (mother)'], ['dust', 'verdict (dust)'], ['nothing', 'drift (nothing)']] as const) {
  await page.evaluate(([a, w]) => (window as any).__woc.perform(a, w), [fixtures[word], word]);
  const plan = await page.evaluate(() => (window as any).__woc.show().plan);
  await page.waitForFunction((t) => { const w = (window as any).__woc; const s = w.show(); return !s || w.audioClock() - s.t0 >= t; }, plan.shots[0].start, { polling: 'raf' });
  rows.push([`appraisal→verdict ${label} ${plan.species}`, stats(await sample(Math.min(4000, (plan.blackAt - plan.shots[0].start) * 1000)))]);
  await page.waitForFunction(() => !(window as any).__woc.show(), null, { polling: 200, timeout: 40000 });
}
// per layer, alone, on the most charged word: where the GPU time goes
const layers: [string, ReturnType<typeof stats>][] = [];
const solo = (clip: string, mode: string) => page.evaluate(([a, clip, mode]) => {
  const W = (window as any).__woc;
  W.perform(a, 'fuck');
  const A = W.show().A;
  const cuts = mode ? [{ start: 0, dur: 3.2, mode, variant: 0.3 }] : [];
  const shots = clip ? [{ clip, start: 0.05, dur: 3.2, seed: 7, aborted: false, angles: [{ at: 0, seed: 0.5, zoom: 1, offX: 0, offY: 0 }], ops: { echo: 0, warp: 0, flow: 0 } }] : [];
  W.performPlan(A, { cuts, shots, blackAt: 3.3, end: 3.9 });
}, [fixtures.fuck, clip, mode]);
for (const clip of ['landscape', 'city', 'lattice', 'cloud', 'tube', 'drift', 'hall', 'relief', 'chladni', 'ink', 'solids', 'threads', 'pins', 'strata']) {
  await solo(clip, '');
  await page.waitForTimeout(700);
  layers.push([`clip ${clip}`, stats(await sample(2000))]);
  await page.waitForFunction(() => !(window as any).__woc.show(), null, { polling: 100, timeout: 10000 });
}
for (const mode of ['barcode', 'numbers', 'spectrum', 'bits', 'scatter', 'line']) {
  await solo('', mode);
  await page.waitForTimeout(700);
  layers.push([`appraisal ${mode}`, stats(await sample(2000))]);
  await page.waitForFunction(() => !(window as any).__woc.show(), null, { polling: 100, timeout: 10000 });
}
await s.close();

console.log(`\nperf  ${W}×${H} @${DPR}x  budget: GPU p95 ≤ ${BUDGET_P95_MS} ms, no frame > 33 ms\n`);
console.log('phase'.padEnd(44) + 'frames  gpu mean   p95    max   worst frame  dropped');
let fail = false;
for (const [name, r] of rows) {
  const over = r.gpuP95 > BUDGET_P95_MS || r.worstFrame > 33;
  fail ||= over;
  console.log(name.padEnd(44) + `${String(r.frames).padStart(6)} ${r.gpuMean.toFixed(2).padStart(8)} ${r.gpuP95.toFixed(2).padStart(6)} ${r.gpuMax.toFixed(2).padStart(6)} ${r.worstFrame.toFixed(1).padStart(10)} ${String(r.dropped).padStart(8)}${over ? '   OVER' : ''}`);
}
console.log('\nper layer (alone, word "fuck")'.padEnd(45) + 'frames  gpu mean   p95    max');
for (const [name, r] of layers) {
  const over = r.gpuP95 > BUDGET_P95_MS;
  fail ||= over;
  console.log(name.padEnd(44) + `${String(r.frames).padStart(6)} ${r.gpuMean.toFixed(2).padStart(8)} ${r.gpuP95.toFixed(2).padStart(6)} ${r.gpuMax.toFixed(2).padStart(6)}${over ? '   OVER' : ''}`);
}
process.exit(fail ? 1 : 0);
