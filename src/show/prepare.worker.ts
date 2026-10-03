/**
 * Prepares what a performance needs only from its steps on (≥ 2 s in), off the main thread so the page never stalls
 * on Enter: the 3D spaces (show/space.ts) and the steps' sound (audio/render.ts).
 */
import type { Appraisal } from '../jev/appraisal.ts';
import type { Grid } from './grid.ts';
import { build } from './space.ts';
import { renderSteps } from '../audio/render.ts';

self.onmessage = (e: MessageEvent<{ id: number; A: Appraisal; g: Grid; sr: number }>) => {
  const { id, A, g, sr } = e.data;
  const geo = build(g, A.seed, new TextDecoder().decode(A.bytes));
  const steps = renderSteps(A, g, sr);
  (self as unknown as Worker).postMessage({ id, geo, steps }, [geo.points.buffer, geo.lines.buffer, steps.L.buffer, steps.R.buffer, steps.sL.buffer, steps.sR.buffer]);
};
