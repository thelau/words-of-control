/**
 * Paints the atlas's plates off the main thread (atlasPaint.ts takes ~0.3 s at native resolution: on the page it
 * froze the typed line's fade). Loads IBM Plex Mono's three weights itself; answers with the plates as ImageBitmaps.
 */
import { paintAtlas } from './atlasPaint.ts';
import { atlasModel } from '../show/atlas.ts';
import type { Appraisal } from '../jev/appraisal.ts';
import plex300 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-300-normal.woff2?url';
import plex400 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2?url';
import plex600 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2?url';

type Job = { id: number; A: Appraisal; text: string; W: number; H: number; serial: number };
const scope = self as unknown as { fonts: FontFaceSet; onmessage: ((e: MessageEvent<Job>) => void) | null; postMessage: (m: unknown, t: Transferable[]) => void };

const fonts = Promise.all([[plex300, '300'], [plex400, '400'], [plex600, '600']].map(async ([url, weight]) => {
  const f = new FontFace('IBM Plex Mono', `url(${url})`, { weight });
  scope.fonts.add(f);
  await f.load();
}));

scope.onmessage = async (e: MessageEvent<Job>) => {
  const { id, A, text, W, H, serial } = e.data;
  await fonts.catch(() => {});
  const { plates, rects } = paintAtlas(A, text, atlasModel(A), W, H, serial);
  const bitmaps = plates.map((c) => c.transferToImageBitmap());
  scope.postMessage({ id, bitmaps, rects }, [...bitmaps, rects.buffer]);
};
