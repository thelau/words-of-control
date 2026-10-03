/**
 * The spaces: the data as 3D point clouds and connected points, one per step (show/grid.ts SPACES). Built once per
 * word, as two lists the renderer draws (gpu.ts): points (x, y, z, colour) and line segments (two such vertices).
 * Colour: its integer part is the palette slot (0 white, 1… the marked cells' colours), its fraction the brightness.
 * The axes are the measurements that matter; the other points are the piece's reference words (never visitors').
 *   cloud    — every reference word a point in the space of the first three marked measurements, a stem to the floor
 *              (to read its depth); the word in its colour; the box, its ticks
 *   network  — the words laid out by how alike they are on all 45 answers (their three main directions: near is
 *              near); the word's neighbourhood (its 40 nearest) joined, the word to its eight nearest
 *   terrain  — the density of the reference words over two marked measurements, as a field of points, its rows drawn
 *   axis     — the answer the performance ends on: the reference words as a dot plot along it (stacked where they
 *              agree), the word raised in its colour — the steps lead into where it stands
 *   table    — the whole table: every answer (across) of every reference word (in depth, the word's nearest in front)
 *              as a height; the word's own row in colour
 *   ridges   — every measurement's spread over the reference words, as a ridge line, stacked in depth; the word's
 *              value a tick
 * Each space also carries its caption (a label: what it is) and anchors: small labels placed on the data
 * itself (axis names, the word, its nearest reference words). And for the cells round the stage, small multiples:
 * the reference words in the space of each three of the answers that matter most (one triple a cell). All within
 * [−1, 1]³.
 */
import type { Grid } from './grid.ts';
import { name, SPACES } from './grid.ts';
import { mulberry32 } from '../core/rng.ts';

export type Space = (typeof SPACES)[number];
/** A label on the data: its text, where it is, and its palette slot (0 white, 1… a marked cell's colour). */
export type Anchor = { text: string; p: number[]; c: number };
export type Geometry = {
  points: Float32Array; lines: Float32Array;
  /** Each space's first point and count, first line vertex and count. */
  ranges: Record<Space, [number, number, number, number]>;
  captions: Record<Space, string>;
  /** The word's nearest reference words, on all its answers (nearest first). */
  nearest: string[];
  anchors: Record<Space, Anchor[]>;
  /** Where the word is in each space (a close-up turns round it). */
  focus: Record<Space, number[]>;
  /** The small multiples: per triple of answers, its points and lines (first, count ×2) and its label. */
  pairs: { range: [number, number, number, number]; label: string }[];
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const WHITE = (b: number) => Math.min(0.99, b);
const KEY = (i: number, b: number) => 1 + i + Math.min(0.99, b);

export function build(g: Grid, seed: number, word: string): Geometry {
  const rand = mulberry32(seed ^ 0x3c6ef372);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const P: number[] = [], L: number[] = [];
  const ranges = {} as Geometry['ranges'];
  const captions = {} as Geometry['captions'];
  const anchors = {} as Geometry['anchors'];
  const focus = {} as Geometry['focus'];
  let marks: Anchor[] = [];
  const mark = (text: string, p: number[], c = 0) => marks.push({ text, p, c });
  const W = `“${word}”`;
  const pt = (x: number, y: number, z: number, c: number) => P.push(x, y, z, c);
  const seg = (a: number[], b: number[], c: number) => L.push(a[0], a[1], a[2], c, b[0], b[1], b[2], c);
  const box = (c = WHITE(0.35)) => {
    for (const [a, b] of [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) {
      const v = (i: number) => [i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1];
      seg(v(a), v(b), c);
    }
  };
  const K = g.keys.length, R = g.refs.length;
  const key = (i: number) => g.cells[g.keys[i % K]];
  const s = (v: number) => v * 2 - 1;
  // each marked measurement's axis spans what the reference words (and the word) actually cover
  const span = Array.from({ length: K }, (_, i) => { const xs = [...key(i).lex, key(i).value]; const lo = Math.min(...xs), hi = Math.max(...xs); return [lo, Math.max(hi - lo, 0.05)]; });
  const ax = (i: number, v: number) => (((v - span[i % K][0]) / span[i % K][1]) * 2 - 1) * 0.92;
  /** A reference word j (or the word, j = −1) in the space of marked measurements a, b, c. */
  const at = (j: number, a = 0, b = 1, c = 2) => [a, b, c].map((i) => ax(i, j < 0 ? key(i).value : key(i).lex[j] ?? 0));
  /** Any answer k's value on an axis spanning what the reference words (and the word) cover. */
  const lim = g.cells.map((c) => { const xs = [...c.lex, c.value]; const lo = Math.min(...xs); return [lo, Math.max(Math.max(...xs) - lo, 0.05)]; });
  const nx = (k: number, v: number) => (((v - lim[k][0]) / lim[k][1]) * 2 - 1) * 0.9;
  const me = at(-1);
  // (each answer's spread over the reference words: the network's scale)
  const spread = g.cells.map((c) => Math.max(0.05, Math.max(...c.lex) - Math.min(...c.lex)));
  const byNear = g.near; // (grid.ts: nearest on all the answers, the words' own family left out)

  const nm = (i: number) => name(g, g.keys[i % K]);
  const space = (sp: Space, fill: () => string) => {
    const p0 = P.length / 4, l0 = L.length / 4;
    marks = [];
    captions[sp] = fill();
    anchors[sp] = marks;
    focus[sp] = marks.find((a) => a.text === W)?.p ?? [0, 0, 0];
    ranges[sp] = [p0, P.length / 4 - p0, l0, L.length / 4 - l0];
  };
  /** The three axes of the space of marked measurements a, b, c, named at their far ends. */
  const axes = (a = 0, b = 1, c = 2) => { mark(nm(a), [1.05, -1, -1]); mark(nm(b), [-1, 1.05, -1]); mark(nm(c), [-1, -1, 1.05]); };

  space('cloud', () => {
    // one point a word, a stem to the floor to read its depth
    for (let j = 0; j < R; j++) { const c = at(j); pt(c[0], c[1], c[2], WHITE(0.9)); seg(c, [c[0], -1, c[2]], WHITE(0.14)); }
    for (let n = 0; n < 5; n++) pt(me[0], me[1], me[2], KEY(0, 0.99));
    seg(me, [me[0], -1, me[2]], KEY(0, 0.7));
    for (const d of [[0.06, 0, 0], [0, 0.06, 0], [0, 0, 0.06]]) seg(me.map((x, i) => x - d[i]), me.map((x, i) => x + d[i]), KEY(0, 0.95));
    box();
    for (let a = 0; a < 3; a++) for (let k = 0; k <= 10; k++) { const p = [-1, -1, -1], q = [-1, -1, -1]; p[a] = q[a] = -1 + k / 5; q[(a + 1) % 3] = -0.96; seg(p, q, WHITE(0.5)); }
    axes();
    mark(W, me, 1);
    for (const j of byNear.slice(0, 3)) mark(g.refs[j], at(j));
    return `cloud · ${W} among ${g.total} words`;
  });

  space('network', () => {
    // the words laid out by how alike they are on all the answers: their three main directions (PCA), so near is near
    const rows = [...Array.from({ length: R }, (_, j) => g.cells.map((c, k) => (c.lex[j] ?? 0) / spread[k])), g.cells.map((c, k) => c.value / spread[k])];
    const pts = principal(rows, 3);
    const dd = (a: number, b: number) => rows[a].reduce((s2, x, k) => s2 + (x - rows[b][k]) ** 2, 0);
    for (const i of byNear.slice(0, 3)) mark(g.refs[i], pts[i]);
    mark(W, pts[R], 1);
    // the words's neighbourhood: its 40 nearest joined, each to its four nearest among them; the rest faint points
    const hood = new Set(byNear.slice(0, 40));
    pts.forEach((p, j) => {
      const mine = j === R, near = mine || hood.has(j);
      for (let n = 0; n < (mine ? 5 : 1); n++) pt(p[0], p[1], p[2], mine ? KEY(0, 0.99) : WHITE(near ? 0.9 : 0.25));
      if (!near) return;
      const links = mine ? byNear.slice(0, 8) : [...hood].filter((i) => i !== j).sort((x, y) => dd(j, x) - dd(j, y)).slice(0, 4);
      for (const i of links) seg(p, pts[i], mine ? KEY(0, 0.95) : WHITE(0.4));
    });
    box(WHITE(0.3));
    return `network · nearest: ${byNear.slice(0, 3).map((i) => g.refs[i]).join(', ')}`;
  });

  // the density of the reference words over two marked measurements (a kernel each), and the word's own peak
  const flat = Array.from({ length: R }, (_, j) => at(j, 0, 1));
  const density = (x: number, z: number) => {
    let d = 0;
    for (const c of flat) d += Math.exp(-((x - c[0]) ** 2 + (z - c[1]) ** 2) / 0.03);
    return d;
  };
  const N = 96, field = new Float32Array(N * N);
  let top = 0;
  for (let i = 0; i < N; i++) for (let k = 0; k < N; k++) { const v = density(-1 + (2 * k) / (N - 1), -1 + (2 * i) / (N - 1)); field[i * N + k] = v; top = Math.max(top, v); }
  const hAt = (i: number, k: number) => field[i * N + k] / top;
  const mine = (x: number, z: number) => Math.exp(-((x - me[0]) ** 2 + (z - me[1]) ** 2) / 0.02);

  space('terrain', () => {
    for (let i = 0; i < N; i++) for (let k = 0; k < N; k++) {
      const x = -1 + (2 * k) / (N - 1), z = -1 + (2 * i) / (N - 1), m = mine(x, z);
      const y = -0.5 + hAt(i, k) * 0.9 + m * 0.5;
      pt(x, y, z, m > 0.3 ? KEY(0, 0.5 + m * 0.5) : WHITE(0.25 + hAt(i, k) * 0.6));
    }
    for (let i = 0; i < N; i += 6) for (let k = 0; k < N - 1; k++) {
      const y = (kk: number) => -0.5 + hAt(i, kk) * 0.9 + mine(-1 + (2 * kk) / (N - 1), -1 + (2 * i) / (N - 1)) * 0.5;
      seg([-1 + (2 * k) / (N - 1), y(k), -1 + (2 * i) / (N - 1)], [-1 + (2 * (k + 1)) / (N - 1), y(k + 1), -1 + (2 * i) / (N - 1)], WHITE(0.3));
    }
    mark(nm(0), [1.05, -0.5, -1]); mark(nm(1), [-1, -0.5, 1.05]);
    mark(W, [me[0], 0.2, me[1]], 1);
    return `terrain · ${nm(0)} × ${nm(1)}`;
  });

  space('axis', () => {
    // the answer it ends on: a dot plot of the reference words along it, stacked where they agree; the word raised
    const k = g.stand, c = g.cells[k], x = (v: number) => -0.95 + 1.9 * v, y0 = -0.5;
    const stacks = new Map<number, number>(), counts = new Map<number, number>();
    for (const v of c.lex) { const b = Math.round(v * 50); counts.set(b, (counts.get(b) ?? 0) + 1); }
    const step = Math.min(0.06, 1.3 / Math.max(...counts.values())); // (a tall stack packs closer: it stays in the frame)
    c.lex.forEach((v) => { const b = Math.round(v * 50); const h = stacks.get(b) ?? 0; stacks.set(b, h + 1); pt(x(b / 50), y0 + step * (h + 0.5), 0, WHITE(0.9)); });
    seg([x(0), y0, 0], [x(1), y0, 0], WHITE(0.6));
    for (let i = 0; i <= 10; i++) seg([x(i / 10), y0, 0], [x(i / 10), y0 - 0.04, 0], WHITE(0.5));
    for (let n = 0; n < 5; n++) pt(x(c.value), y0 + 0.9, 0, KEY(Math.max(0, c.key), 0.99));
    seg([x(c.value), y0, 0], [x(c.value), y0 + 0.9, 0], KEY(Math.max(0, c.key), 0.9));
    mark(name(g, k), [x(0), y0 - 0.14, 0]); mark('0', [x(0), y0 - 0.08, 0]); mark('1', [x(1), y0 - 0.08, 0]);
    mark(W, [x(c.value), y0 + 0.97, 0], 1 + Math.max(0, c.key));
    return `axis · ${name(g, k)}`;
  });

  // the small multiples round the stage: the reference words in the space of each three of the answers that matter
  // most, one triple a cell, the word a cross in its colour
  const pairs: Geometry['pairs'] = [];
  const most = g.rank.slice(0, 8);
  for (let i = 0; i < most.length && pairs.length < 24; i++) for (let j = i + 1; j < most.length && pairs.length < 24; j++) for (let l = j + 1; l < most.length && pairs.length < 24; l++) {
    const [a, b, c] = [most[i], most[j], most[l]], p0 = P.length / 4, l0 = L.length / 4;
    for (let r = 0; r < R; r++) pt(nx(a, g.cells[a].lex[r] ?? 0), nx(b, g.cells[b].lex[r] ?? 0), nx(c, g.cells[c].lex[r] ?? 0), WHITE(0.85));
    const colour = KEY(Math.max(0, g.cells[a].key), 0.99), w = [nx(a, g.cells[a].value), nx(b, g.cells[b].value), nx(c, g.cells[c].value)];
    for (let n = 0; n < 4; n++) pt(w[0], w[1], w[2], colour);
    for (const d of [[0.14, 0, 0], [0, 0.14, 0], [0, 0, 0.14]]) seg(w.map((x, q) => x - d[q]), w.map((x, q) => x + d[q]), colour);
    pairs.push({ range: [p0, P.length / 4 - p0, l0, L.length / 4 - l0], label: `${g.cells[a].id} × ${g.cells[b].id} × ${g.cells[c].id}` });
  }

  space('table', () => {
    // every answer across, every reference word in depth (nearest in front), the value as height
    const n = g.cells.length, x = (k: number) => -1 + (2 * k) / (n - 1), y = (v: number) => -0.45 + v * 0.8;
    const rows = byNear.slice(0, Math.min(R, 48));
    rows.forEach((j, r) => {
      const z = -0.85 + (1.85 * r) / (rows.length - 1);
      for (let k = 0; k < n; k++) {
        const c = g.cells[k], v = c.lex[j] ?? 0;
        pt(x(k), y(v), z, c.key >= 0 ? KEY(c.key, 0.45 + 0.4 * v) : WHITE(0.3 + 0.5 * v));
        if (k < n - 1) seg([x(k), y(v), z], [x(k + 1), y(g.cells[k + 1].lex[j] ?? 0), z], WHITE(0.18));
      }
      if (r < 3) mark(g.refs[j], [1.06, y(g.cells[n - 1].lex[j] ?? 0), z]);
    });
    // the word's own row, in front of all
    const zw = -1;
    for (let k = 0; k < n; k++) {
      const c = g.cells[k];
      for (let m = 0; m < 6; m++) pt(x(k) + gauss() * 0.004, y(c.value) + gauss() * 0.004, zw, KEY(Math.max(0, c.key), 0.95));
      if (k < n - 1) seg([x(k), y(c.value), zw], [x(k + 1), y(g.cells[k + 1].value), zw], KEY(0, 0.9));
      if (c.key >= 0) { seg([x(k), -0.5, zw], [x(k), y(c.value), zw], KEY(c.key, 0.9)); mark(name(g, k), [x(k), -0.58, zw], 1 + c.key); }
    }
    mark(W, [-1.06, y(g.cells[0].value), zw], 1);
    return `table · ${n} answers × the ${rows.length} nearest of ${g.total} words`;
  });

  space('ridges', () => {
    const n = g.cells.length, M = 80;
    for (let k = 0; k < n; k++) {
      const c = g.cells[k], z = -1 + (2 * k) / (n - 1);
      const dens = (x: number) => c.lex.reduce((a, v) => a + Math.exp(-((x - v) ** 2) / 0.004), 0);
      const ys = Array.from({ length: M }, (_, i) => dens(i / (M - 1)));
      const mx = Math.max(...ys, 1e-6);
      const colour = c.key >= 0 ? KEY(c.key, 0.9) : WHITE(0.45);
      for (let i = 0; i < M - 1; i++) seg([s(i / (M - 1)), -0.4 + (ys[i] / mx) * 0.5, z], [s((i + 1) / (M - 1)), -0.4 + (ys[i + 1] / mx) * 0.5, z], colour);
      seg([s(c.value), -0.45, z], [s(c.value), 0.2, z], c.key >= 0 ? KEY(c.key, 0.99) : WHITE(0.8));
      if (c.key >= 0) mark(name(g, k), [-1.05, -0.4, z], 1 + c.key);
    }
    mark('0', [-1, -0.5, -1.05]); mark('1', [1, -0.5, -1.05]);
    return `ridges · ${n} answers × ${g.total} words`;
  });

  return { points: new Float32Array(P), lines: new Float32Array(L), ranges, captions, anchors, focus, pairs, nearest: byNear.slice(0, 3).map((j) => g.refs[j]) };
}

/** How far each space reaches from its centre: the camera stands back far enough to hold all of it. */
const REACH: Partial<Record<Space, number>> = { axis: 1.2, terrain: 1.55, ridges: 1.5 };

/** How a view looks at a space: an orbit (perspective, turning); a plan, a front or a side elevation (orthographic,
 *  still — the technical drawings); a close-up turning round the word. */
export type View = { kind: 'orbit' | 'plan' | 'front' | 'side' | 'close'; seed: number };

const h = (x: number) => { const s = Math.sin(x * 127.1) * 43758.5453; return s - Math.floor(s); };

/** The stage's view for a step: an orbit — for a neutral word, often a drawing (plan, front, side); the axis, flat. */
export function stageView(space: Space, cam: number, neu: number): View {
  // (the answer it ends on is drawn flat and still, as on the ending: 0 at the left, 1 at the right)
  if (space === 'axis') return { kind: 'front', seed: cam };
  const d = h(cam * 7.7);
  return { kind: d < neu * 0.6 ? (['plan', 'front', 'side'] as const)[Math.floor(h(cam * 3.3) * 3)] : 'orbit', seed: cam };
}

/** The view × projection (column-major) of a view at time t into its step, and how far the camera stands: always
 *  far enough back that the whole space stays inside the frame (a close-up alone goes in, round the word). The
 *  mood moves an orbit: a negative word turns faster and shakes, through a wider lens; a neutral one through a long
 *  lens, almost still; a positive one smoothly. */
export function camera(space: Space, v: View, t: number, aspect: number, mood: { pos: number; neu: number; neg: number }, focus: number[]): { vp: Float32Array; dist: number } {
  const { neu, neg } = mood, cam = v.seed;
  const reach = REACH[space] ?? 1.75;
  const high = space === 'terrain';
  const shake = (k: number) => neg * 0.018 * Math.sin(t * 47 + k * 11.3) * Math.sin(t * 31 + k * 5.1);
  let eye: number[], target = [0, 0, 0], up = [0, 1, 0], ortho = 0;
  const fov = 0.75 - 0.4 * neu + 0.15 * neg;
  // the narrower half-angle of the frame decides how far back the whole space fits
  const half = Math.min(fov / 2, Math.atan(Math.tan(fov / 2) * aspect));
  let dist = (reach / Math.sin(half)) * (1.04 - 0.04 * (cam * 5.3 % 1));
  if (v.kind === 'plan' || v.kind === 'front' || v.kind === 'side') {
    ortho = (1.08 * 1.04) / Math.min(1, aspect); // (a drawing is flat: only the face must fit)
    dist = 6;
    eye = v.kind === 'plan' ? [0, dist, 0] : v.kind === 'front' ? [0, 0, dist] : [dist, 0, 0];
    if (v.kind === 'plan') up = [0, 0, -1];
  } else {
    const yaw = cam * 2 * Math.PI + t * (0.15 + 0.2 * cam) * (1 + 2 * neg - 0.8 * neu) + shake(1);
    const pitch = (high ? 0.55 + 0.35 * clamp01(cam * 1.7 % 1) : -0.35 + 0.8 * (cam * 3.1 % 1)) + shake(2);
    if (v.kind === 'close') { target = focus; dist = reach * 0.6; }
    eye = [target[0] + dist * Math.cos(pitch) * Math.sin(yaw), target[1] + dist * Math.sin(pitch), target[2] + dist * Math.cos(pitch) * Math.cos(yaw)];
  }
  const f = norm(target.map((x, i) => x - eye[i]));
  const r = norm(cross(f, up));
  const u = cross(r, f);
  const view = [r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -dot(r, eye), -dot(u, eye), dot(f, eye), 1];
  const n = 0.05, far = 60, k = 1 / Math.tan(fov / 2);
  const proj = ortho
    ? [1 / (ortho * aspect), 0, 0, 0, 0, 1 / ortho, 0, 0, 0, 0, -1 / (far - n), 0, 0, 0, -n / (far - n), 1]
    : [k / aspect, 0, 0, 0, 0, k, 0, 0, 0, 0, far / (n - far), -1, 0, 0, (n * far) / (n - far), 0];
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) { let x = 0; for (let i = 0; i < 4; i++) x += proj[i * 4 + rr] * view[c * 4 + i]; out[c * 4 + rr] = x; }
  return { vp: out, dist };
}
/** The first `n` principal directions of `rows` (power iteration on their covariance), each row projected on them,
 *  scaled to fit the box. */
function principal(rows: number[][], n: number): number[][] {
  const d = rows[0].length, mean = Array.from({ length: d }, (_, k) => rows.reduce((a, r) => a + r[k], 0) / rows.length);
  const X = rows.map((r) => r.map((x, k) => x - mean[k]));
  const C = Array.from({ length: d }, (_, a) => Array.from({ length: d }, (_, b) => X.reduce((s, r) => s + r[a] * r[b], 0)));
  const dirs: number[][] = [];
  for (let c = 0; c < n; c++) {
    let v = Array.from({ length: d }, (_, k) => Math.sin(k * 1.7 + c * 3.1) + 1.1);
    for (let it = 0; it < 60; it++) {
      let w = C.map((row) => row.reduce((s, x, k) => s + x * v[k], 0));
      for (const q of dirs) { const pr = w.reduce((s, x, k) => s + x * q[k], 0); w = w.map((x, k) => x - pr * q[k]); }
      const l = Math.hypot(...w) || 1;
      v = w.map((x) => x / l);
    }
    dirs.push(v);
  }
  const P = X.map((r) => dirs.map((q) => r.reduce((s, x, k) => s + x * q[k], 0)));
  // (scaled by the typical spread, not the extreme: one outlier would crush the rest into a ball; outliers clamp)
  const a = P.flat().map(Math.abs).sort((x, y) => x - y), m = Math.max(1e-6, a[Math.floor(a.length * 0.9)]);
  return P.map((p) => p.map((x) => Math.max(-0.95, Math.min(0.95, (x / m) * 0.75))));
}

const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return a.map((x) => x / l); };
