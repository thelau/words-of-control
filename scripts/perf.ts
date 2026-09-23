/**
 * Performance check (run on every visual change):  npm run perf
 *
 * Renders uncapped (no vsync) at a MacBook Pro 16" screen (1728×1117 @2×) and
 * reports frame times for the rest state and a heavy reaction. The budget is
 * set so an ordinary laptop still holds 60 fps: on an M3 Pro the p95 frame
 * must stay under 8.3 ms (≥ 2× headroom). Exits non-zero when over budget.
 *
 *   npm run perf -- --n 2000000        # grain count
 *   npm run perf -- --size 1280x720x1  # WxHxDPR
 */
import { openSession } from './lib/headless.ts';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const [W, H, DPR] = arg('size', '1728x1117x2').split('x').map(Number);
const N = arg('n', '');
const BUDGET_P95_MS = Number(arg('budget', '8.3'));

const s = await openSession({ width: W, height: H, dpr: DPR, uncapped: true });
const { page } = s;
await page.goto(`${s.url}?mock${N ? `&n=${N}` : ''}`);
await page.waitForFunction(() => (window as any).__woc, null, { timeout: 30000 });
await page.waitForTimeout(1500);

const sample = (ms: number) => page.evaluate((ms) => new Promise<number[]>((res) => {
  const dts: number[] = [];
  let last = performance.now();
  const t0 = last;
  const f = (now: number) => { dts.push(now - last); last = now; if (now - t0 < ms) requestAnimationFrame(f); else res(dts.slice(2)); };
  requestAnimationFrame(f);
}), ms);

const stats = (d: number[]) => {
  const s2 = [...d].sort((a, b) => a - b);
  const q = (p: number) => s2[Math.min(s2.length - 1, Math.floor(p * s2.length))];
  return { frames: d.length, mean: d.reduce((a, b) => a + b, 0) / d.length, p50: q(0.5), p95: q(0.95), max: s2[s2.length - 1] };
};

const rows: [string, ReturnType<typeof stats>][] = [];
rows.push(['rest', stats(await sample(2500))]);
await page.evaluate(() => (window as any).__woc.fire({
  weights: { anger: 1 }, confidence: 0.85, intensity: 1, energy: 0.9, hardness: 0.8, weight: 0.5, temperature: 0.8,
  scale: 0.7, light: 0.7, accents: { violence: 0.8, loss: 0, closeness: 0, absurd: 0 }, kind: 'sound', seed: 7,
}));
await page.waitForTimeout(1200);
rows.push(['reaction (anger, max intensity)', stats(await sample(3000))]);
await s.close();

const count = N || 'default';
console.log(`\nperf  ${W}×${H} @${DPR}x  grains=${count}  budget p95 ≤ ${BUDGET_P95_MS} ms\n`);
console.log('phase'.padEnd(34) + 'frames   mean    p50    p95    max   fps(mean)');
let fail = false;
for (const [name, r] of rows) {
  const over = r.p95 > BUDGET_P95_MS;
  fail ||= over;
  console.log(name.padEnd(34) + `${String(r.frames).padStart(6)} ${r.mean.toFixed(2).padStart(6)} ${r.p50.toFixed(2).padStart(6)} ${r.p95.toFixed(2).padStart(6)} ${r.max.toFixed(2).padStart(6)}   ${(1000 / r.mean).toFixed(0).padStart(5)}${over ? '   OVER BUDGET' : ''}`);
}
process.exit(fail ? 1 : 0);
