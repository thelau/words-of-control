/**
 * Sound check: record the real audio output of performances (headless), then
 * measure loudness/peaks and draw a spectrogram with the timeline marked.
 *   node scripts/listen.ts [word …]   → docs/captures/audio/ (local only)
 * Needs ffmpeg.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { openSession } from './lib/headless.ts';

const fixtures = JSON.parse(readFileSync('src/jev/fixtures.json', 'utf8'));
const words = process.argv.slice(2).length ? process.argv.slice(2) : ['fuck', 'nothing', 'mother', 'ocean', 'knife', 'dust'];
const dir = 'docs/captures/audio';
mkdirSync(dir, { recursive: true });
const s = await openSession({ width: 960, height: 540, dpr: 1 });
await s.page.goto(`${s.url}?mock`);
await s.page.waitForFunction(() => (window as any).__woc, null, { timeout: 30000 });

for (const w of words) {
  const b64: string = await s.page.evaluate(async ([a, w]) => {
    const W = (window as any).__woc;
    W.perform(a, w); // creates the audio engine on first use
    const stream: MediaStream = W.audio().record.stream;
    const rec = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 256000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.start();
    await new Promise<void>((r) => { const t = setInterval(() => { if (!W.show()) { clearInterval(t); r(); } }, 100); });
    await new Promise((r) => setTimeout(r, 500));
    rec.stop();
    await new Promise((r) => (rec.onstop = r));
    const buf = await new Blob(chunks).arrayBuffer();
    let bin = '';
    new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin);
  }, [fixtures[w], w]);
  const slug = w.replace(/[^\p{L}\p{N}]+/gu, '_');
  writeFileSync(`${dir}/${slug}.webm`, Buffer.from(b64, 'base64'));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', `${dir}/${slug}.webm`, '-ar', '48000', `${dir}/${slug}.wav`]);
  const log = execFileSync('sh', ['-c', `ffmpeg -hide_banner -i ${dir}/${slug}.wav -af ebur128=peak=true -f null - 2>&1 | tail -16`], { encoding: 'utf8' });
  const I = /I:\s+(-?[\d.]+) LUFS/.exec(log)?.[1];
  const peak = /Peak:\s+(-?[\d.]+) dBFS/.exec(log)?.[1];
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', `${dir}/${slug}.wav`, '-lavfi', 'showspectrumpic=s=1400x500:legend=1:scale=log:fscale=log:color=intensity', `${dir}/spectrum-${slug}.png`]);
  console.log(`${w.padEnd(10)} integrated ${I} LUFS · true peak ${peak} dBFS → ${dir}/spectrum-${slug}.png`);
}
await s.close();
