/**
 * What the captions say (src/captions.ts), moment by moment — plain, factual, all from the score:
 *   grid     — above it, the word and where the reading stands (answers received, marked, cleared); below it, how to
 *              read a cell
 *   steps    — above the grid, the step, the tempo, the mood; under the stage (or in a corner, full frame) what is
 *              shown; on a space, labels on the data itself (axes, the word, its nearest reference words)
 * Positions in CSS px.
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
    out.push({ key: 'head', text: `${word} — ${n} answers from one call to Jev`, x: gx, y: gy - 10, align: 'bl' });
    const got = g.cells.filter((c) => c.arrive <= t).length;
    const marked = g.cells.filter((c) => c.markAt <= t).length;
    const gone = g.cells.filter((c) => c.vanish <= t).length;
    const where = t < g.mark ? `received ${got} / ${n}`
      : t < g.select ? `marked ${marked} / ${K} — furthest from ${R} reference words, among answers Jev is sure of`
      : `cleared ${gone} / ${n - K}`;
    out.push({ key: 'where', text: where, x: gx + gw, y: gy - 10, align: 'br' });
    out.push({ key: 'foot', text: 'each cell: the question · Jev’s answer · its value 0–1 · a figure of it (a score a sine, a choice its options, yes/no dots) · noise where Jev is unsure', x: gx, y: gy + gh + 10 });
    return out;
  }
  const i = g.steps.findIndex((s) => t >= s.t && t < s.t + s.dur);
  const st = g.steps[i];
  if (!st) return out;
  const m = A.mood, mood = m.neg >= m.pos && m.neg >= m.neu ? 'negative' : m.pos >= m.neu ? 'positive' : 'neutral';
  out.push({ key: 'head', text: `${word} — step ${i + 1} / ${g.steps.length} · ${g.bpm} bpm · mood ${mood} ${Math.max(m.pos, m.neu, m.neg).toFixed(2)}`, x: gx, y: gy - 10, align: 'bl' });
  const text = st.viz === 'tiles' ? `THE ${K} ANSWERS THAT MATTER — of the answers Jev is sure of, those furthest from ${R} reference words: ${g.keys.map((k) => name(g, k)).join(', ')}.`
    : st.viz === 'number' ? `RESULT ${g.result.toFixed(3)} — the ${K} answers that matter, averaged, each weighted by how far it stands from the reference words.`
    : geo?.captions[st.viz] ?? '';
  const S = stage(w, h).map((x) => x / dpr);
  if (st.full) out.push({ key: 'panel', text, x: 16, y: h / dpr - 16, align: 'bl', width: Math.min(560, gw * 0.5) });
  else out.push({ key: 'panel', text, x: S[0] + 12, y: S[1] + S[3] + 12, width: S[2] * 0.6 });
  // labels on the data: each anchor projected through the step's camera into its rectangle
  if (space && geo) {
    const [rx, ry, rw, rh] = space.rect, vp = space.vp;
    geo.anchors[space.viz].forEach((a, k) => {
      const [x, y, z] = a.p;
      const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
      if (cw <= 0.05) return;
      const nx = (vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / cw, ny = (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / cw;
      if (Math.abs(nx) > 0.98 || Math.abs(ny) > 0.98) return;
      out.push({ key: `a${k}`, text: a.text, x: (rx + (nx * 0.5 + 0.5) * rw) / dpr, y: (ry + (0.5 - ny * 0.5) * rh) / dpr - 7, anchor: a.c ? srgb(g.colours[a.c - 1]) : 'rgba(237,230,220,0.8)' });
    });
  }
  return out;
}
