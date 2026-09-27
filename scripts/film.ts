/**
 * Film performances (Playwright's video recorder) and check their motion: every frame is compared with the
 * one before; a jump inside a continuous stretch (not on a planned cut: a step, a phase) is flicker, and is
 * reported with its time.
 *   node scripts/film.ts word …   → docs/captures/film/<word>.webm (+ report)
 */
import { mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { openSession } from './lib/headless.ts';

const words = process.argv.slice(2).length ? process.argv.slice(2) : ['war', 'love', 'spoon'];
const dir = 'docs/captures/film';
mkdirSync(dir, { recursive: true });
const fixtures = JSON.parse(readFileSync('src/jev/fixtures.json', 'utf8'));
const FPS = 25;

for (const w of words) {
  const tmp = `${dir}/tmp`;
  rmSync(tmp, { recursive: true, force: true });
  const s = await openSession({ width: 960, height: 540, video: tmp });
  const tVideo = Date.now(); // the recording starts with the page
  await s.page.goto(s.url + '?mock');
  await s.page.waitForFunction(() => (window as any).__woc, null, { timeout: 30000 });
  const tPerform = Date.now();
  await s.page.evaluate(([a, w]) => (window as any).__woc.perform(a, w), [fixtures[w], w]);
  const g = await s.page.evaluate(() => (window as any).__woc.show().g);
  const lead = (tPerform - tVideo) / 1000 + 0.3; // video time of the performance's start
  await s.page.waitForFunction(() => !(window as any).__woc.show(), null, { polling: 200, timeout: 120000 });
  const video = s.page.video();
  await s.close();
  const slug = w.replace(/[^\p{L}\p{N}]+/gu, '_');
  const out = `${dir}/${slug}.webm`;
  renameSync(await video!.path(), out);
  rmSync(tmp, { recursive: true, force: true });

  // the continuous stretches (performance time): fill, mark and clear, merge, then each step; their edges are cuts
  const spans: [string, number, number][] = [['fill', 0, g.mark], ['mark', g.mark, g.merge], ['merge', g.merge, g.seq],
    ...g.steps.map((x: any, i: number): [string, number, number] => [`step${i}-${x.viz}`, x.t, x.t + x.dur])];
  const cuts = [...spans.flatMap(([, a, b]) => [a, b]), g.end];
  // frames: 48×27 grey, every 1/25 s
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', out, '-vf', `fps=${FPS},scale=48:27,format=gray`, '-f', 'rawvideo', '-']);
  const n = Math.floor(raw.length / (48 * 27));
  const diffs: number[] = [];
  for (let f = 1; f < n; f++) {
    let d = 0;
    for (let k = 0; k < 48 * 27; k++) d += Math.abs(raw[f * 1296 + k] - raw[(f - 1) * 1296 + k]);
    diffs.push(d / 1296);
  }
  // sync: the recording's start is only known to a few hundred ms — slide the plan's cut times over the video
  // and keep the offset where they land on its biggest changes
  let lead2 = lead, bestScore = -1;
  for (let off = -1.5; off <= 1.5; off += 1 / FPS) {
    let score = 0;
    for (const c of cuts) {
      const f = Math.round((c + lead + off) * FPS) - 1;
      if (f > 0 && f < diffs.length - 1) score += Math.max(diffs[f - 1], diffs[f], diffs[f + 1]);
    }
    if (score > bestScore) { bestScore = score; lead2 = lead + off; }
  }
  // a jump is well above the stretch's own motion (cells arriving and going out are expected changes: the fill and
  // the clearing are measured against a looser bound)
  const flicker: string[] = [];
  for (const [name, a, b] of spans) {
    const inShot = diffs.map((d, f) => ({ d, t: (f + 1) / FPS - lead2 })).filter((x) => x.t > a + 0.1 && x.t < b - 0.1);
    if (!inShot.length) continue;
    const med = [...inShot].sort((a, b) => a.d - b.d)[Math.floor(inShot.length / 2)].d;
    for (const x of inShot) {
      const nearCut = cuts.some((c) => Math.abs(c - x.t) < 0.1);
      if (!nearCut && x.d > Math.max(5, med * 3)) flicker.push(`${x.t.toFixed(2)}s ${name} Δ${x.d.toFixed(1)} (median ${med.toFixed(1)})`);
    }
  }
  if (process.env.FILM_FRAMES) {
    // a strip of the flagged moments, for looking
    for (const [k, j] of flicker.slice(Number(process.env.FILM_FROM ?? 0), Number(process.env.FILM_FROM ?? 0) + 4).entries()) {
      const t = Number(j.split('s')[0]) + lead2;
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(Math.max(0, t - 0.08)), '-i', out, '-vf', 'scale=320:-1,tile=5x1', '-frames:v', '1', `${dir}/${slug}-jump${k}.png`]);
    }
  }
  console.log(`${w} [${g.bpm} bpm] ${out}: ${flicker.length ? `${flicker.length} jumps — ${flicker.slice(0, 8).join(', ')}` : 'smooth'}`);
}
