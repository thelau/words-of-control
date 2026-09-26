/**
 * Paints the atlas's plates (show/atlas.ts) once per performance, at the screen's native resolution, as precise
 * as a printed plate: monospace, hairlines, scales and ticks. Two inks, packed in an rgba8 texture: white in the red
 * channel, red in the green channel (atlas.wgsl colours them); the blue channel holds each item's number + 1 over its
 * rect (0: an annotation), so the image finds a pixel's item in one read. Returns the plates and their reveal rects.
 */
import type { Appraisal } from '../jev/appraisal.ts';
import { MAP, mapPos, onMap, type AtlasModel, type Dim } from '../show/atlas.ts';

export const MAX_ITEMS = 64;
const WHITE = 'rgb(255,0,0)', RED = 'rgb(0,255,0)';
const FONT = '"IBM Plex Mono", ui-monospace, monospace';

export function paintAtlas(A: Appraisal, text: string, m: AtlasModel, W: number, H: number): { plates: OffscreenCanvas[]; rects: Float32Array } {
  const u = H / 1100; // one design unit
  const plates = m.plates.map(() => new OffscreenCanvas(W, H));
  const g = plates.map((c) => c.getContext('2d')!);
  for (const [pi, x] of g.entries()) {
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    // the items' numbers in blue, then everything else drawn additively over them (red and green only)
    m.plates[pi].items.slice(0, MAX_ITEMS).forEach((it, k) => { x.fillStyle = `rgb(0,0,${k + 1})`; x.fillRect(it.x0 * W, it.y0 * H, (it.x1 - it.x0) * W, (it.y1 - it.y0) * H); });
    x.globalCompositeOperation = 'lighter';
    x.lineWidth = Math.max(1, u); x.textBaseline = 'alphabetic';
  }
  const font = (x: OffscreenCanvasRenderingContext2D, px: number, weight = 400) => { x.font = `${weight} ${Math.round(px * u)}px ${FONT}`; };
  const ink = (x: OffscreenCanvasRenderingContext2D, red: boolean, a = 1) => { x.fillStyle = x.strokeStyle = red ? RED : WHITE; x.globalAlpha = a; };
  const line = (x: OffscreenCanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) => { x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke(); };
  const label = (id: string) => id.toUpperCase();
  const valueText = (d: Dim) => (d.kind === 'choice' ? `${d.top} ${d.value.toFixed(2)}` : d.value.toFixed(2));
  const hex = [...A.bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  const header = (x: OffscreenCanvasRenderingContext2D, left: string, right: string) => {
    ink(x, false, 0.85); font(x, 13);
    x.textAlign = 'left'; x.fillText(left, W * 0.06, H * 0.065);
    x.textAlign = 'right'; x.fillText(right, W * 0.94, H * 0.065);
    ink(x, false, 0.5); line(x, W * 0.06, H * 0.08, W * 0.94, H * 0.08);
    // the edge ticks (a scale along the plate's border)
    for (let k = 0; k <= 50; k++) { const y = H * (0.1 + (0.85 * k) / 50); line(x, W * 0.025, y, W * 0.025 + (k % 5 ? 4 : 10) * u, y); line(x, W * 0.975, y, W * 0.975 - (k % 5 ? 4 : 10) * u, y); }
    x.globalAlpha = 1;
  };
  /** A scale: the lexicon's ticks behind, this word's marker in front. */
  const scale = (x: OffscreenCanvasRenderingContext2D, d: Dim, x0: number, x1: number, y: number, h: number, red: boolean, names = false) => {
    ink(x, false, 0.6); line(x, x0, y, x1, y);
    for (let k = 0; k <= 4; k++) { const px = x0 + ((x1 - x0) * k) / 4; line(x, px, y, px, y + h * 0.18); }
    ink(x, false, 0.32);
    d.lex.forEach((v) => { const px = x0 + (x1 - x0) * v; line(x, px, y - h * 0.35, px, y); });
    if (names) {
      // the names, rotated — a name that would overprint its neighbour is left out (its tick stays)
      font(x, 9); ink(x, false, 0.45);
      let lastX = -1e9;
      d.lex.map((v, i) => [v, m.ref[i]?.w ?? ''] as [number, string]).sort((p, q) => p[0] - q[0]).forEach(([v, w]) => {
        const px = x0 + (x1 - x0) * v;
        if (px - lastX < 12 * u || Math.abs(v - d.value) * (x1 - x0) < 14 * u) return;
        lastX = px;
        x.save(); x.translate(px, y - h * 0.42); x.rotate(-Math.PI / 2); x.textAlign = 'left'; x.fillText(w, 0, 3 * u); x.restore();
      });
    }
    ink(x, red, 1);
    const px = x0 + (x1 - x0) * d.value;
    x.lineWidth = Math.max(1, 2 * u); line(x, px, y - h, px, y + h * 0.25); x.lineWidth = Math.max(1, u);
    x.beginPath(); x.moveTo(px, y - h - 2 * u); x.lineTo(px - 4 * u, y - h - 9 * u); x.lineTo(px + 4 * u, y - h - 9 * u); x.fill();
    x.globalAlpha = 1;
  };
  const rects = new Float32Array(m.plates.length * MAX_ITEMS * 8);
  m.plates.forEach((p, pi) => p.items.slice(0, MAX_ITEMS).forEach((it, k) => rects.set([it.x0, it.y0, it.x1, it.y1, it.t, it.dur, it.red ? 1 : 0, 1], (pi * MAX_ITEMS + k) * 8)));

  // ---- grid
  {
    const x = g[0], p = m.plates[0];
    header(x, `SPECIMEN  ${text}`, `${m.dims.length} READINGS · ${m.ref.length} REFERENCE WORDS · JEV`);
    p.items.forEach((it, k) => {
      const X0 = it.x0 * W, Y0 = it.y0 * H, X1 = it.x1 * W, Y1 = it.y1 * H, cw = X1 - X0, ch = Y1 - Y0;
      const d = m.dims[k];
      ink(x, false, 0.25); x.strokeRect(X0, Y0, cw, ch); x.globalAlpha = 1;
      font(x, 10);
      if (d) {
        ink(x, false, 0.8); x.textAlign = 'left'; x.fillText(label(d.id), X0 + 6 * u, Y0 + 14 * u);
        ink(x, it.red, 1); x.textAlign = 'right'; x.fillText(valueText(d), X1 - 6 * u, Y0 + 14 * u);
        if (d.kind === 'choice' && d.dist) {
          // the distribution: a bar per option (in the question's own order), the top one full
          const opts = Object.entries(A.c[d.id].p);
          const bw = (cw - 12 * u) / opts.length;
          opts.forEach(([o, v], j) => {
            const bx = X0 + 6 * u + j * bw, bh = (ch - 40 * u) * v, by = Y1 - 14 * u;
            ink(x, it.red && o === d.top, o === d.top ? 1 : 0.55);
            if (o === d.top) x.fillRect(bx + 1, by - bh, bw - 2, bh); else x.strokeRect(bx + 1, by - Math.max(bh, 1), bw - 2, Math.max(bh, 1));
            ink(x, false, 0.4); font(x, 7); x.textAlign = 'center'; x.fillText(o.slice(0, 3), bx + bw / 2, Y1 - 4 * u);
          });
        } else scale(x, d, X0 + 8 * u, X1 - 8 * u, Y0 + ch * 0.66, ch * 0.3, it.red);
      } else {
        // the specimen's own cells: its bytes, its bits, how it was typed, its nearest words, how rare it is
        const j = k - m.dims.length;
        ink(x, false, 0.8); x.textAlign = 'left';
        const titles = ['BYTES', 'BITS', 'TYPING', 'LENGTH', 'NEAREST', 'RARITY'];
        x.fillText(titles[j] ?? '', X0 + 6 * u, Y0 + 14 * u);
        font(x, 9); ink(x, false, 0.75);
        if (j === 0) hex.match(/.{1,24}/g)?.slice(0, 5).forEach((r, i) => x.fillText(r, X0 + 6 * u, Y0 + (32 + i * 13) * u));
        if (j === 1) {
          const s = Math.max(2, Math.min((cw - 12 * u) / 32, (ch - 30 * u) / 12));
          [...A.bytes].slice(0, 12).forEach((b, r) => { for (let bit = 0; bit < 8; bit++) if ((b >> (7 - bit)) & 1) x.fillRect(X0 + 6 * u + bit * s * 1.4, Y0 + 24 * u + r * s * 1.4, s, s); });
        }
        if (j === 2) {
          const iv = A.typing.intervals.slice(0, 24);
          const bw = (cw - 12 * u) / Math.max(1, iv.length);
          iv.forEach((v, i) => { const bh = Math.min(1, v / 600) * (ch - 36 * u); x.fillRect(X0 + 6 * u + i * bw, Y1 - 8 * u - bh, Math.max(1, bw - 2 * u), bh); });
        }
        if (j === 3) { x.fillText(`${A.bytes.length} BYTES`, X0 + 6 * u, Y0 + 34 * u); x.fillText(`${[...text].length} CHARACTERS`, X0 + 6 * u, Y0 + 48 * u); }
        if (j === 4) m.nearest.forEach(([w, dd], i) => { x.fillText(w.slice(0, 18), X0 + 6 * u, Y0 + (34 + i * 14) * u); x.textAlign = 'right'; x.fillText(dd.toFixed(2), X1 - 6 * u, Y0 + (34 + i * 14) * u); x.textAlign = 'left'; });
        if (j === 5) {
          const rare = Math.min(1, m.dims.reduce((a, d) => a + d.z, 0) / m.dims.length / 2);
          x.fillText(rare.toFixed(2), X0 + 6 * u, Y0 + 34 * u);
          ink(x, false, 0.6); line(x, X0 + 6 * u, Y0 + ch * 0.7, X1 - 6 * u, Y0 + ch * 0.7);
          ink(x, true, 1); x.fillRect(X0 + 6 * u, Y0 + ch * 0.7 - 3 * u, (cw - 12 * u) * rare, 6 * u);
        }
      }
      x.globalAlpha = 1;
    });
  }

  // ---- focus
  {
    const x = g[1], d = m.focus, it = m.plates[1].items[0];
    header(x, `FOCUS  ${text}`, 'THE READING THAT SETS IT APART');
    ink(x, false, 1); font(x, 64, 300); x.textAlign = 'left';
    x.fillText(d.kind === 'choice' ? `${label(d.id)} · ${(d.top ?? '').toUpperCase()}` : label(d.id), W * 0.08, H * 0.25);
    ink(x, true, 1); font(x, 96, 300); x.textAlign = 'right'; x.fillText(d.value.toFixed(2), W * 0.92, H * 0.25);
    const n = d.lex.length, above = d.lex.filter((v) => v < d.value).length;
    ink(x, false, 0.8); font(x, 14); x.textAlign = 'left';
    x.fillText(above >= n / 2 ? `HIGHER THAN ${above} OF ${n} REFERENCE WORDS` : `LOWER THAN ${n - above} OF ${n} REFERENCE WORDS`, W * 0.08, H * 0.32);
    scale(x, d, it.x0 * W, it.x1 * W, H * 0.66, H * 0.1, true, true);
    ink(x, false, 0.6); font(x, 11); x.textAlign = 'center';
    for (let k = 0; k <= 4; k++) x.fillText((k / 4).toFixed(2), (it.x0 + ((it.x1 - it.x0) * k) / 4) * W, H * 0.72);
    ink(x, true, 1); font(x, 13); x.fillText(text, (it.x0 + (it.x1 - it.x0) * d.value) * W, H * 0.66 - H * 0.1 - 16 * u);
    x.globalAlpha = 1;
  }

  // ---- crowd
  {
    const x = g[2];
    header(x, `CROWD  ${text}`, `${m.dims.length} READINGS × ${m.ref.length} WORDS`);
    m.plates[2].items.forEach((it, k) => {
      const d = m.dims[k], y = (it.y0 + it.y1) / 2 * H, a0 = W * 0.2, a1 = W * 0.94;
      font(x, 9); ink(x, false, 0.7); x.textAlign = 'right'; x.fillText(label(d.id), a0 - 10 * u, y + 3 * u);
      ink(x, false, 0.18); line(x, a0, y, a1, y);
      ink(x, false, 0.45); d.lex.forEach((v) => { const px = a0 + (a1 - a0) * v; line(x, px, y - 4 * u, px, y + 4 * u); });
      ink(x, it.red, 1); x.lineWidth = Math.max(1, 2 * u);
      const px = a0 + (a1 - a0) * d.value; line(x, px, y - 8 * u, px, y + 8 * u); x.lineWidth = Math.max(1, u);
      x.globalAlpha = 1;
    });
  }

  // ---- map
  {
    const x = g[3];
    header(x, `MAP  ${text}`, `VALENCE × AROUSAL · NEAREST: ${m.nearest.map(([w, d]) => `${w} ${d.toFixed(2)}`).join('  ')}`);
    const X = (v: number) => v * W, Y = (v: number) => v * H;
    ink(x, false, 0.35); x.strokeRect(X(MAP.x0), Y(MAP.y0), X(MAP.x1 - MAP.x0), Y(MAP.y1 - MAP.y0));
    for (let k = 1; k < 10; k++) {
      const [gx] = onMap(k / 10, 0), [, gy] = onMap(0, k / 10);
      ink(x, false, 0.1); line(x, X(gx), Y(MAP.y0), X(gx), Y(MAP.y1)); line(x, X(MAP.x0), Y(gy), X(MAP.x1), Y(gy));
    }
    ink(x, false, 0.6); font(x, 10); x.textAlign = 'left';
    x.fillText('VALENCE →', X(MAP.x1) - 80 * u, Y(MAP.y1) + 18 * u);
    x.save(); x.translate(X(MAP.x0) - 12 * u, Y(MAP.y1)); x.rotate(-Math.PI / 2); x.fillText('AROUSAL →', 0, 0); x.restore();
    const [mx, my] = onMap(...mapPos(A.s));
    // lines to the three nearest words, with their distances
    ink(x, true, 0.8);
    for (const [w, dd] of m.nearest) {
      const ref = m.ref.find((r) => r.w === w);
      if (!ref) continue;
      const [px, py] = onMap(...mapPos(ref.s));
      line(x, X(mx), Y(my), X(px), Y(py));
      font(x, 9); x.textAlign = 'center'; x.fillText(dd.toFixed(2), X((mx + px) / 2), Y((my + py) / 2) - 4 * u);
    }
    // the words: every dot; a name only where it does not overprint another (nor this word's)
    const taken: [number, number, number, number][] = [[X(mx) - 4 * u, Y(my) - 24 * u, X(mx) + 90 * u, Y(my) + 6 * u]];
    font(x, 9);
    m.ref.forEach(({ w, s }) => {
      const [px, py] = onMap(...mapPos(s));
      ink(x, false, 0.85); x.beginPath(); x.arc(X(px), Y(py), 2.2 * u, 0, Math.PI * 2); x.fill();
      const name = w.slice(0, 16), bx: [number, number, number, number] = [X(px) + 5 * u, Y(py) - 6 * u, X(px) + 6 * u + x.measureText(name).width, Y(py) + 5 * u];
      if (taken.some((r) => bx[0] < r[2] && bx[2] > r[0] && bx[1] < r[3] && bx[3] > r[1])) return;
      taken.push(bx);
      ink(x, false, 0.55); x.textAlign = 'left'; x.fillText(name, X(px) + 6 * u, Y(py) + 3 * u);
    });
    ink(x, true, 1); x.beginPath(); x.arc(X(mx), Y(my), 5 * u, 0, Math.PI * 2); x.fill();
    font(x, 14, 600); x.textAlign = 'left'; x.fillText(text, X(mx) + 10 * u, Y(my) - 8 * u);
    x.globalAlpha = 1;
  }
  return { plates, rects };
}
