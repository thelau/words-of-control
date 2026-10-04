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
    // where the words stand, built slowly: the words alone first; then the answer that sets them most apart (when Jev
    // is unsure, it wavers between two readings before it settles); the reference words as a dot plot along it (0 … 1,
    // stacked where they agree), filling in, the words among them — the rank seen, not written; one by one the nearest
    // on this answer, a line to their dot; and last, who answered, against how many words. Nothing more. Nonsense: the words, and that nothing stands out.
    const lt = t - st.t, k = g.stand, c = g.cells[k], colour = srgb(g.colours[Math.max(0, c.key)] ?? [0.85, 0.85, 0.85]);
    const cx = S[0] + S[2] / 2, cy = S[1] + S[3] / 2, x0 = S[0] + S[2] * 0.12, x1 = S[0] + S[2] * 0.88, ly = cy + 40;
    const at = (v: number) => x0 + v * (x1 - x0);
    const short = (w2: string) => (w2.length > 22 ? `${w2.slice(0, 21)}…` : w2);
    // (a long phrase is set smaller, to fit the stage: Plex Mono's advance is 0.6 em)
    out.push({ key: 'word', text: word, x: cx, y: cy - 96, align: 'c', size: 'big', colour, px: Math.min(64, (S[2] * 0.8) / (word.length * 0.6)) });
    if (g.nonsense) {
      if (lt > 1.2) out.push({ key: 'answer', text: 'nothing stands out', x: cx, y: cy - 30, align: 'c', size: 'mid' });
      return out;
    }
    if (lt < 1.5) return out;
    // the answer in the battery's own words ("COMPLETELY SINCERE", "AWE"), the measure and its value small beneath
    const human = c.kind === 1 ? LABELS[c.opt] : plain(c.id, c.value);
    let shown = human;
    if (c.conf < 0.75 && lt < 4 && Math.floor(lt / 0.22) % 2 === 1) {
      // (Jev's doubt: the reading it almost gave, flickering, until it settles)
      if (c.kind === 1) { const ti = c.probs.indexOf(Math.max(...c.probs)); const si = c.probs.map((p, i) => [p, i] as const).filter(([, i]) => i !== ti).sort((a2, b2) => b2[0] - a2[0])[0][1]; shown = LABELS[c.opt - ti + si]; }
      else shown = plain(c.id, c.value + (c.value > 0.5 ? -0.25 : 0.25));
    }
    out.push({ key: 'answer', text: shown, x: cx, y: cy - 44, align: 'c', size: 'mid', colour });
    out.push({ key: 'measure', text: `${c.id}  ${c.value.toFixed(2)}`, x: cx, y: cy - 22, align: 'c', colour });
    out.push({ key: 'rule', text: '', x: x0, y: ly, rule: x1 - x0 });
    out.push({ key: 'r0', text: '0', x: x0 - 16, y: ly, align: 'c' }, { key: 'r1', text: '1', x: x1 + 16, y: ly, align: 'c' });
    // the reference words as columns of dots, one every 7 px of the scale, as high as how many gave that value (the
    // tallest 40 px), filling in left to right
    const bins = new Map<number, number>();
    for (const v of c.lex) { const b = Math.round(at(v) / 7); bins.set(b, (bins.get(b) ?? 0) + 1); }
    const peak = Math.max(...bins.values()), first = Math.min(...bins.keys());
    const height = (b: number) => (bins.has(b) ? Math.max(1, Math.round((8 * bins.get(b)!) / peak)) * 5 : 0);
    for (const b of bins.keys()) if (lt > 1.5 + (b - first) * 0.008) out.push({ key: `d${b}`, text: '', x: b * 7 - 1, y: ly - 3, align: 'bl', stack: height(b) });
    out.push({ key: 'me', text: '', x: at(c.value), y: ly - 5, align: 'c', anchor: true, me: true, colour });
    // the words' own label: above the tallest stack it spans (never on the dots), a thin line down to their dot
    const CHAR = 8.5; // (a caption's advance: 12.5 px Plex Mono, 0.6 em + 0.08 em tracking)
    const xw = at(c.value), half = (word.length * CHAR) / 2;
    const lx = Math.max(x0 + half, Math.min(x1 - half, xw));
    const top = Math.min(ly - 5, ...[...bins.keys()].filter((b) => Math.abs(b * 7 - lx) <= half + 4).map((b) => ly - 3 - height(b)));
    const labelY = Math.min(ly - 24, top - 16);
    out.push({ key: 'melabel', text: word, x: lx, y: labelY, align: 'c', colour });
    out.push({ key: 'meline', text: '', x: xw, y: labelY + 8, vline: Math.max(0, ly - 9 - (labelY + 8)) });
    // the nearest on this answer, one by one (their own family left out; left to right)
    const kin = new Set(g.near);
    const onAxis = c.lex.map((v, j) => [j, Math.abs(v - c.value)] as const).filter(([j]) => kin.has(j)).sort((a2, b2) => a2[1] - b2[1]).slice(0, 3).map(([j]) => j).sort((a2, b2) => c.lex[a2] - c.lex[b2]);
    // (one row below the line, spread so no two labels overlap; each joined to its place on the scale by an elbow:
    // down from the scale, along, down to the label)
    const rowY = ly + 34, elbow = ly + 14;
    const width = onAxis.map((j) => short(g.refs[j]).length * CHAR + 18), right = S[0] + S[2] - 12;
    const place = onAxis.map((j) => at(c.lex[j]));
    // (pushed right past each other, then back from the stage's edge, so none overlaps)
    for (let i = 0; i < place.length; i++) place[i] = Math.max(place[i], i ? place[i - 1] + (width[i - 1] + width[i]) / 2 : S[0] + 12 + width[i] / 2);
    for (let i = place.length - 1; i >= 0; i--) place[i] = Math.min(place[i], i < place.length - 1 ? place[i + 1] - (width[i] + width[i + 1]) / 2 : right - width[i] / 2);
    onAxis.forEach((j, i) => {
      if (lt < 3 + i * 1.2) return;
      const dx = at(c.lex[j]), lxn = place[i];
      out.push({ key: `nl${i}`, text: '', x: dx, y: ly + 3, vline: elbow - ly - 3 });
      if (Math.abs(lxn - dx) > 1) out.push({ key: `nh${i}`, text: '', x: Math.min(dx, lxn), y: elbow, rule: Math.abs(lxn - dx) });
      out.push({ key: `nv${i}`, text: '', x: lxn, y: elbow, vline: rowY - elbow - 9 });
      out.push({ key: `n${i}`, text: short(g.refs[j]), x: lxn, y: rowY, align: 'c' });
    });
    // (words in another script than English's are still measured against English words: said plainly)
    const foreign = /[^\u0000-\u024f\s\p{P}\p{N}\p{S}]/u.test(word);
    if (lt > 8) out.push({ key: 'ai', text: `answered by an AI (Jev) · ${g.total} reference words${foreign ? ' · in English' : ''}`, x: cx, y: S[1] + S[3] - 20, align: 'c' });
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
