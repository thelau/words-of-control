/**
 * What the captions say (src/captions.ts), in capitals: labels only — it all passes too fast for sentences. Above the grid the
 * word and where the reading stands (received, marked, cleared; then the step, the tempo, the mood); below it what a
 * step shows; on a space, labels on the data itself (axes, the word, its nearest reference words); the last step,
 * the answer that sets the word most apart and its rank among the reference words. Positions in CSS px.
 */
import type { Caption } from '../captions.ts';
import type { Grid } from './grid.ts';
import { LABELS, layout, RING, stage, standGraph } from './grid.ts';
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
  const n = g.cells.length, K = g.keys.length;
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
  out.push({ key: 'head', text: `${word} · ${mood} ${Math.max(m.pos, m.neu, m.neg).toFixed(2)}`, x: gx, y: gy - 10, align: 'bl' });
  const S = stage(w, h).map((x) => x / dpr);
  if (st.viz === 'stand') {
    // where the words stand, read like an instrument, built slowly: the words alone; then the answer that sets them
    // most apart, in the battery's own words (when Jev is unsure it wavers between two readings before it settles),
    // the measure printed above it; the reference words' spread on it as a large bar graph lighting left to right
    // (grid.wgsl), the words' needle in their ink and their name over it; then, as fields along the bottom — a printed
    // label over a lit value, each cut to its width so nothing ever overlaps — their nearest on this answer (numbered
    // like the ticks under the scale), their nearest on all the answers, who answered and how sure. Nonsense: the
    // words, and that nothing stands out.
    const lt = t - st.t, k = g.stand, c = g.cells[k], colour = srgb(g.colours[Math.max(0, c.key)] ?? [0.85, 0.85, 0.85]);
    const cx = S[0] + S[2] / 2, H = S[3], [bx, by, bw, bh] = standGraph(S);
    const short = (w2: string, n2 = 26) => (w2.length > n2 ? `${w2.slice(0, n2 - 1)}…` : w2);
    // (a long phrase is set smaller, to fit: Barlow's light lowercase advances about 0.5 em)
    out.push({ key: 'word', text: word, x: cx, y: S[1] + H * 0.19, align: 'c', size: 'big', px: Math.min(72, (S[2] * 0.86) / (word.length * 0.5)) });
    if (g.member && lt > 1.5) out.push({ key: 'member', text: `also one of the ${g.total}`, x: cx, y: S[1] + H * 0.06, align: 'c' });
    if (g.nonsense) {
      if (lt > 1.2) out.push({ key: 'answer', text: 'nothing stands out', x: cx, y: S[1] + H * 0.42, align: 'c', size: 'mid', lit: true });
      return out;
    }
    if (lt < 1.5) return out;
    const human = c.kind === 1 ? LABELS[c.opt] : plain(c.id, c.value);
    let shown = human;
    if (c.conf < 0.75 && lt < 4 && Math.floor(lt / 0.22) % 2 === 1) {
      // (Jev's doubt: the reading it almost gave, flickering, until it settles)
      if (c.kind === 1) { const ti = c.probs.indexOf(Math.max(...c.probs)); const si = c.probs.map((p, i) => [p, i] as const).filter(([, i]) => i !== ti).sort((a2, b2) => b2[0] - a2[0])[0][1]; shown = LABELS[c.opt - ti + si]; }
      else shown = plain(c.id, c.value + (c.value > 0.5 ? -0.25 : 0.25));
    }
    out.push({ key: 'measure', text: `${c.id}  ·  ${c.value.toFixed(2)}`, x: cx, y: S[1] + H * 0.335, align: 'c' });
    out.push({ key: 'answer', text: shown, x: cx, y: S[1] + H * 0.405, align: 'c', size: 'mid', colour });
    out.push({ key: 'r0', text: '0', x: bx, y: by + bh + 22, align: 'c' }, { key: 'r1', text: '1', x: bx + bw, y: by + bh + 22, align: 'c' });
    // their name over their needle, once the light has passed it (kept inside the graph)
    if (lt > 1.5 + 1.2 * c.value) {
      const half = Math.min(word.length * 7.5, 280) / 2 + 4;
      out.push({ key: 'me', text: word, x: Math.max(bx + half, Math.min(bx + bw - half, bx + c.value * bw)), y: by - bh * 0.08 - 12, align: 'c', colour, lit: true, maxw: 280 });
    }
    // the ticks' numbers under the scale (grid.wgsl draws the ticks), spread at least a numeral apart and clear of
    // the scale's own 0 and 1
    if (lt > 3.5) {
      const xs = g.standNear.map((j) => bx + c.lex[j] * bw);
      for (let i2 = 0; i2 < xs.length; i2++) xs[i2] = Math.max(xs[i2], i2 ? xs[i2 - 1] + 12 : bx + 16);
      for (let i2 = xs.length - 1; i2 >= 0; i2--) xs[i2] = Math.min(xs[i2], i2 < xs.length - 1 ? xs[i2 + 1] - 12 : bx + bw - 16);
      xs.forEach((x2, i2) => out.push({ key: `t${i2}`, text: String(i2 + 1), x: x2, y: by + bh + 22, align: 'c', lit: true }));
    }
    // the fields
    const fw = bw / 3, fy = S[1] + H * 0.83;
    const field = (i2: number, at: number, label: string, value: string) => {
      if (lt < at) return;
      out.push({ key: `fr${i2}`, text: '', x: bx + i2 * fw, y: fy - 10, rule: fw - 16 });
      out.push({ key: `fl${i2}`, text: label, x: bx + i2 * fw, y: fy, maxw: fw - 16 });
      out.push({ key: `fv${i2}`, text: value, x: bx + i2 * fw, y: fy + 20, maxw: fw - 16, lit: true });
    };
    field(0, 3.5, `nearest on ${c.id}`, g.standNear.map((j, i2) => `${i2 + 1} ${short(g.refs[j], 18)}`).join('   '));
    field(1, 6.5, `nearest on all ${n} answers`, g.near.slice(0, 3).map((j) => short(g.refs[j], 18)).join(' · '));
    // (words in another script than English's are still measured against English words: said plainly)
    const foreign = /[^\u0000-\u024f\s\p{P}\p{N}\p{S}]/u.test(word);
    field(2, 8, `answered by an AI (Jev)${foreign ? ' · in English' : ''}`, `sure to ${c.conf.toFixed(2)} · ${g.total} reference words`);
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
    // (cut to the cell: a tiny caption advances ~5.9 px a letter, 9 px Plex Mono + 0.06 em)
    const fit = Math.floor((gw / 9 - 12) / 5.9);
    if (pair) out.push({ key: `p${p}`, text: pair.label.length > fit ? `${pair.label.slice(0, fit - 1)}…` : pair.label, x: gx + (k % 9) * (gw / 9) + 6, y: gy + Math.floor(k / 9) * (gh / 5) + 5, size: 'tiny' });
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
