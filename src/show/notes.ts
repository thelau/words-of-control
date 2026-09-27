/**
 * What the captions say (src/captions.ts): labels only — it all passes too fast for sentences. Above the grid the
 * word and where the reading stands (received, marked, cleared; then the step, the tempo, the mood); below it what a
 * step shows; on a space, labels on the data itself (axes, the word, its nearest reference words); the last step,
 * the answer that sets the word most apart and its rank among the reference words. Positions in CSS px.
 */
import type { Caption } from '../captions.ts';
import type { Grid } from './grid.ts';
import { layout, name, stage } from './grid.ts';
import type { Geometry, Space } from './space.ts';
import type { Appraisal } from '../jev/appraisal.ts';

const srgb = (c: number[]) => `rgb(${c.map((x) => Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055))).join(',')})`;

export function notes(A: Appraisal, g: Grid, geo: Geometry | null, t: number, w: number, h: number, dpr: number,
  space: { viz: Space; vp: Float32Array; rect: number[] } | null): Caption[] {
  const L = layout(w, h), gx = L.x / dpr, gy = L.y / dpr, gw = (9 * L.cs) / dpr, gh = (5 * L.cs) / dpr;
  const word = `“${new TextDecoder().decode(A.bytes)}”`;
  const n = g.cells.length, K = g.keys.length, R = g.refs.length;
  const out: Caption[] = [];
  if (t < g.seq) {
    out.push({ key: 'head', text: `${word} · ${n} answers`, x: gx, y: gy - 10, align: 'bl' });
    const got = g.cells.filter((c) => c.arrive <= t).length;
    const marked = g.cells.filter((c) => c.markAt <= t).length;
    const gone = g.cells.filter((c) => c.vanish <= t).length;
    const where = t < g.mark ? `received ${got} / ${n}` : t < g.select ? `marked ${marked} / ${K}` : `cleared ${gone} / ${n - K}`;
    out.push({ key: 'where', text: where, x: gx + gw, y: gy - 10, align: 'br' });
    return out;
  }
  const i = g.steps.findIndex((s) => t >= s.t && t < s.t + s.dur);
  const st = g.steps[i];
  if (!st) return out;
  const m = A.mood, mood = m.neg >= m.pos && m.neg >= m.neu ? 'negative' : m.pos >= m.neu ? 'positive' : 'neutral';
  out.push({ key: 'head', text: `${word} · ${i + 1} / ${g.steps.length} · ${g.bpm} bpm · ${mood} ${Math.max(m.pos, m.neu, m.neg).toFixed(2)}`, x: gx, y: gy - 10, align: 'bl' });
  const S = stage(w, h).map((x) => x / dpr);
  if (st.viz === 'stand') {
    // the answer that sets the word most apart, ranked among the reference words
    const k = g.keys[0], c = g.cells[k];
    const mean = c.lex.reduce((a, b) => a + b, 0) / R;
    const up = c.value >= mean, beyond = c.lex.filter((v) => (up ? v < c.value : v > c.value)).length;
    const cx = S[0] + S[2] / 2, cy = S[1] + S[3] / 2;
    out.push({ key: 'stand', text: `${name(g, k)}  ${c.value.toFixed(2)}`, x: cx, y: cy - 34, align: 'c', size: 'big', colour: srgb(g.colours[0]) });
    out.push({ key: 'rank', text: `${up ? 'above' : 'below'} ${beyond} of ${R} words`, x: cx, y: cy + 26, align: 'c', size: 'mid' });
    return out;
  }
  const text = st.viz === 'tiles' ? `${K} answers that matter`
    : geo?.captions[st.viz as Space] ?? '';
  // (below the grid, outside it: the grid's cells carry views of the space)
  if (st.full) out.push({ key: 'panel', text, x: 16, y: h / dpr - 16, align: 'bl' });
  else out.push({ key: 'panel', text, x: gx, y: gy + gh + 10 });
  // labels on the data: each anchor projected through the step's camera into its rectangle
  if (space && geo) {
    const [rx, ry, rw, rh] = space.rect, vp = space.vp;
    geo.anchors[space.viz].forEach((a, k) => {
      const [x, y, z] = a.p;
      const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
      if (cw <= 0.05) return;
      const nx = (vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / cw, ny = (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / cw;
      if (Math.abs(nx) > 0.98 || Math.abs(ny) > 0.98) return;
      out.push({ key: `a${k}`, text: a.text, x: (rx + (nx * 0.5 + 0.5) * rw) / dpr, y: (ry + (0.5 - ny * 0.5) * rh) / dpr - 7, anchor: true, colour: a.c ? srgb(g.colours[a.c - 1]) : undefined });
    });
  }
  return out;
}
