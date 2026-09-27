/**
 * What the captions say (src/captions.ts), in capitals: labels only — it all passes too fast for sentences. Above the grid the
 * word and where the reading stands (received, marked, cleared; then the step, the tempo, the mood); below it what a
 * step shows; on a space, labels on the data itself (axes, the word, its nearest reference words); the last step,
 * the answer that sets the word most apart and its rank among the reference words. Positions in CSS px.
 */
import type { Caption } from '../captions.ts';
import type { Grid } from './grid.ts';
import { LABELS, layout, RING, stage } from './grid.ts';
import type { Geometry, Space } from './space.ts';
import { plain, type Appraisal } from '../jev/appraisal.ts';

/** The labels kept for the step on screen (see below). */
const chosen = { step: '', keys: new Set<number>() };

const srgb = (c: number[]) => `rgb(${c.map((x) => Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055))).join(',')})`;

/** The captions, set in capitals (Swiss / Ikeda-like labels) — except the visitor's word, always as typed. */
export function notes(...args: Parameters<typeof words>): Caption[] {
  const word = `“${new TextDecoder().decode(args[0].bytes)}”`, W = word.toUpperCase();
  return words(...args).map((c) => ({ ...c, text: c.text.toUpperCase().split(W).join(word) }));
}

function words(A: Appraisal, g: Grid, geo: Geometry | null, t: number, w: number, h: number, dpr: number,
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
  const arc = st.viz === 'stand' ? 'where it stands' : `${n} answers → ${K} that matter → where it stands`;
  out.push({ key: 'head', text: `${word} · ${arc} · ${mood} ${Math.max(m.pos, m.neu, m.neg).toFixed(2)}`, x: gx, y: gy - 10, align: 'bl' });
  const S = stage(w, h).map((x) => x / dpr);
  if (st.viz === 'stand') {
    // where the words stand, built slowly: the words and the answer that sets them most apart; the reference words as a
    // dot plot along it (0 … 1, stacked where they agree), filling in, the words among them — the rank seen, not
    // written; then one by one the nearest on this answer, a line to their dot; the nearest on all the answers; who
    // answered and how sure; and last, alone, how many reference words they were measured against
    const lt = t - st.t, k = g.stand, c = g.cells[k], colour = srgb(g.colours[Math.max(0, c.key)]);
    const cx = S[0] + S[2] / 2, cy = S[1] + S[3] / 2, x0 = S[0] + S[2] * 0.12, x1 = S[0] + S[2] * 0.88, ly = cy + 40;
    const at = (v: number) => x0 + v * (x1 - x0);
    const short = (w2: string) => (w2.length > 22 ? `${w2.slice(0, 21)}…` : w2);
    // (a long phrase is set smaller, to fit the stage: Plex Mono's advance is 0.6 em)
    out.push({ key: 'word', text: word, x: cx, y: cy - 96, align: 'c', size: 'big', colour, px: Math.min(64, (S[2] * 0.8) / (word.length * 0.6)) });
    // the answer in the battery's own words ("COMPLETELY SINCERE", "AWE"), the measure and its value small beneath
    const human = c.kind === 1 ? LABELS[c.opt] : plain(c.id, c.value);
    out.push({ key: 'answer', text: human, x: cx, y: cy - 44, align: 'c', size: 'mid', colour });
    out.push({ key: 'measure', text: `${c.id}  ${c.value.toFixed(2)}`, x: cx, y: cy - 22, align: 'c', colour });
    out.push({ key: 'rule', text: '', x: x0, y: ly, rule: x1 - x0 });
    out.push({ key: 'r0', text: '0', x: x0 - 16, y: ly, align: 'c' }, { key: 'r1', text: '1', x: x1 + 16, y: ly, align: 'c' });
    // (a stack never rises past 40 px: a tall one packs its dots closer)
    const bins = c.lex.map((v) => Math.round(at(v) / 7)), count = new Map<number, number>(), stack = new Map<number, number>();
    for (const b of bins) count.set(b, (count.get(b) ?? 0) + 1);
    const dotY = c.lex.map((v, j) => {
      const b = bins[j], hh = stack.get(b) ?? 0, gap = Math.min(6, 40 / (count.get(b) ?? 1));
      stack.set(b, hh + 1);
      if (lt > j * 0.02) out.push({ key: `d${j}`, text: '', x: at(v), y: ly - 5 - gap * hh, align: 'c', anchor: true });
      return ly - 5 - gap * hh;
    });
    out.push({ key: 'me', text: '', x: at(c.value), y: ly - 5, align: 'c', anchor: true, me: true, colour });
    out.push({ key: 'melabel', text: word, x: at(c.value), y: ly - 22 - Math.min(40, 6 * (stack.get(Math.round(at(c.value) / 7)) ?? 0)), align: 'c', colour });
    // the nearest on this answer, one by one (left to right, each on its own line, a line up to its dot)
    const onAxis = c.lex.map((v, j) => [j, Math.abs(v - c.value)] as const).sort((a2, b2) => a2[1] - b2[1]).slice(0, 3).map(([j]) => j).sort((a2, b2) => c.lex[a2] - c.lex[b2]);
    onAxis.forEach((j, i) => {
      if (lt < 1.5 + i * 1.2) return;
      const x = at(c.lex[j]), y = ly + 22 + 16 * i;
      out.push({ key: `nl${i}`, text: '', x, y: dotY[j], vline: y - dotY[j] - 6 });
      out.push({ key: `n${i}`, text: short(g.refs[j]), x, y, align: 'c' });
    });
    if (lt > 5) out.push({ key: 'overall', text: `nearest on all ${n} answers: ${(geo?.nearest ?? []).map(short).join(' · ')}`, x: cx, y: S[1] + S[3] - 56, align: 'c' });
    if (lt > 6.5) out.push({ key: 'ai', text: `${n} questions answered by an AI (Jev), sure to ${c.conf.toFixed(2)}`, x: cx, y: S[1] + S[3] - 36, align: 'c' });
    if (lt > 8) out.push({ key: 'note', text: `${R} reference words`, x: cx, y: S[1] + S[3] - 16, align: 'c' });
    return out;
  }
  const text = st.viz === 'tiles' ? `${K} answers that matter`
    : geo?.captions[st.viz as Space] ?? '';
  // (below the grid, outside it: the grid's cells carry views of the space)
  if (st.full) out.push({ key: 'panel', text, x: 16, y: h / dpr - 16, align: 'bl' });
  else out.push({ key: 'panel', text, x: gx, y: gy + gh + 10 });
  // the small multiples round the stage: each cell's pair of answers, small, in its corner
  if (space && geo && !st.full) RING.forEach((k, p) => {
    const pair = geo.pairs[p];
    // (trimmed to the cell: about 26 characters of this small type)
    if (pair) out.push({ key: `p${p}`, text: pair.label.length > 26 ? `${pair.label.slice(0, 25)}…` : pair.label, x: gx + (k % 9) * (gw / 9) + 6, y: gy + Math.floor(k / 9) * (gh / 5) + 5, size: 'tiny' });
  });
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
