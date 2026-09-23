/**
 * Storyboard capture (§12.5): one reaction → 3×2 PNG at six timepoints
 * (rest, ignition, release, peak, decay, rest), laid out like the references.
 */
import type { App } from '../main';
import type { Params } from '../engine/params';
import { num } from '../engine/tuning';

export async function captureStoryboard(app: App, fire: () => void, p: Params) {
  const src = app.renderer.canvas;
  const W = 900;
  const H = Math.round((W * src.height) / src.width);
  const gap = 16;
  const out = document.createElement('canvas');
  out.width = W * 3 + gap * 4;
  out.height = H * 2 + gap * 3;
  const g = out.getContext('2d')!;
  g.fillStyle = '#3a3a3a';
  g.fillRect(0, 0, out.width, out.height);

  const dur = 5 + 5 * p.intensity;
  const ret = num(app.field.tuning, 'returnTime');
  const times = [0.15, 0.9, 0.45 * dur, 0.8 * dur, dur + ret + 0.6];
  const slot = (i: number) => [gap + (i % 3) * (W + gap), gap + Math.floor(i / 3) * (H + gap)] as const;
  const grab = (i: number) => { const [x, y] = slot(i); g.drawImage(src, x, y, W, H); };

  await new Promise<void>((resolve) => {
    let k = -1; // -1: capture rest, then fire
    let started = false;
    const hook = () => {
      if (k === -1) { grab(0); k = 0; fire(); started = true; return; }
      if (!started) return;
      const rt = app.field.reaction ? app.field.rt : Infinity;
      if (k < times.length && rt >= times[k]) { grab(k + 1); k++; }
      if (k >= times.length) { app.frameHooks.delete(hook); resolve(); }
    };
    app.frameHooks.add(hook);
  });

  const a = document.createElement('a');
  a.href = out.toDataURL('image/png');
  a.download = `storyboard-${Object.keys(p.weights).join('+')}-${Date.now()}.png`;
  a.click();
}
