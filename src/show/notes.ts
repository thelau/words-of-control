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

/** The labels kept for the step on screen (see below). */
const chosen = { step: '', keys: new Set<number>() };

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
    // where the word stands: the answer that sets it most apart, and the reference words laid out along it (0 … 1),
    // the word among them — its rank seen, not written; then its nearest words, and whose words these are
    const k = g.stand, c = g.cells[k], colour = srgb(g.colours[Math.max(0, c.key)]);
    const cx = S[0] + S[2] / 2, cy = S[1] + S[3] / 2, x0 = S[0] + S[2] * 0.12, x1 = S[0] + S[2] * 0.88, ly = cy + 34;
    const at = (v: number) => x0 + v * (x1 - x0);
    // (a long phrase is set smaller, to fit the stage: Plex Mono's advance is 0.6 em)
    out.push({ key: 'word', text: word, x: cx, y: cy - 86, align: 'c', size: 'big', colour, px: Math.min(64, (S[2] * 0.8) / (word.length * 0.6)) });
    out.push({ key: 'answer', text: `${name(g, k)}  ${c.value.toFixed(2)}`, x: cx, y: cy - 28, align: 'c', size: 'mid', colour });
    out.push({ key: 'rule', text: '', x: x0, y: ly, rule: x1 - x0 });
    out.push({ key: 'r0', text: '0', x: x0 - 16, y: ly, align: 'c' }, { key: 'r1', text: '1', x: x1 + 16, y: ly, align: 'c' });
    c.lex.forEach((v, j) => out.push({ key: `d${j}`, text: '', x: at(v), y: ly, align: 'c', anchor: true }));
    const near = geo?.nearest ?? [];
    near.forEach((w2, i) => { const j = g.refs.indexOf(w2); if (j >= 0) out.push({ key: `n${i}`, text: w2, x: at(c.lex[j]), y: ly + 18 + 15 * i, align: 'c' }); });
    out.push({ key: 'me', text: '', x: at(c.value), y: ly, align: 'c', anchor: true, me: true, colour });
    out.push({ key: 'melabel', text: word, x: at(c.value), y: ly - 10, align: 'c', colour });
    out.push({ key: 'note', text: `${R} reference words, chosen by the artist`, x: cx, y: S[1] + S[3] - 18, align: 'c' });
    return out;
  }
  const text = st.viz === 'tiles' ? `${K} answers that matter`
    : geo?.captions[st.viz as Space] ?? '';
  // (below the grid, outside it: the grid's cells carry views of the space)
  if (st.full) out.push({ key: 'panel', text, x: 16, y: h / dpr - 16, align: 'bl' });
  else out.push({ key: 'panel', text, x: gx, y: gy + gh + 10 });
  // labels on the data: each anchor projected through the step's camera into its rectangle. Which ones show is
  // decided on the step's first frame (one that would land on another is left out) and kept for the whole step — a
  // label never blinks in and out as the camera turns
  if (space && geo) {
    const [rx, ry, rw, rh] = space.rect, vp = space.vp;
    const project = (p: number[]) => {
      const [x, y, z] = p;
      const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
      if (cw <= 0.05) return null;
      const nx = (vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / cw, ny = (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / cw;
      return Math.abs(nx) > 0.98 || Math.abs(ny) > 0.98 ? null : [(rx + (nx * 0.5 + 0.5) * rw) / dpr, (ry + (0.5 - ny * 0.5) * rh) / dpr];
    };
    const anchors = geo.anchors[space.viz];
    const stepKey = `${A.seed}|${i}`;
    if (chosen.step !== stepKey) {
      const placed: number[][] = [];
      chosen.step = stepKey;
      chosen.keys = new Set();
      // (the word's own label first: it is never the one left out)
      [...anchors.entries()].sort(([, a], [, b]) => Number(b.text === word) - Number(a.text === word)).forEach(([k, a]) => {
        const q = project(a.p);
        if (!q || placed.some(([qx, qy]) => Math.abs(qx - q[0]) < 90 && Math.abs(qy - q[1]) < 13)) return;
        placed.push(q);
        chosen.keys.add(k);
      });
    }
    anchors.forEach((a, k) => {
      const q = chosen.keys.has(k) ? project(a.p) : null;
      if (q) out.push({ key: `a${k}`, text: a.text, x: q[0], y: q[1] - 7, anchor: true, colour: a.c ? srgb(g.colours[a.c - 1]) : undefined });
    });
  }
  return out;
}
