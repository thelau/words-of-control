/**
 * The spaces: the data as 3D point clouds and connected points, one per step (show/grid.ts SPACES). Built once per
 * word, as two lists the renderer draws (gpu.ts): points (x, y, z, colour) and line segments (two such vertices).
 * Colour: its integer part is the palette slot (0 white, 1… the marked cells' colours), its fraction the brightness.
 * The axes are the measurements that matter; the other points are the piece's reference words (never visitors').
 *   cloud    — every reference word a haze of points in the space of the first three marked measurements; the word a
 *              dense knot in its colour; the box, its ticks
 *   network  — the reference words, each joined to its four nearest; the word joined to its eight nearest (nearest on
 *              all 45 answers, as everywhere)
 *   terrain  — the density of the reference words over two marked measurements, as a field of points, its rows drawn
 *   map      — the same density as contour lines on a plane, the reference words as points, the word a cross
 *   globe    — every measurement as a meridian band of a sphere, bulging with their value; the marked ones in colour
 *   table    — the whole table: every answer (across) of every reference word (in depth, the word's nearest in front)
 *              as a height; the word's own row in colour
 *   ridges   — every measurement's spread over the reference words, as a ridge line, stacked in depth; the word's
 *              value a tick
 * Each space also carries its caption (a label: what it is) and anchors: small labels placed on the data
 * itself (axis names, the word, its nearest reference words). All coordinates within [−1, 1]³.
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
  /** A fine dust through the box: the space itself. */
  const dust = (n: number) => { for (let i = 0; i < n; i++) pt(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1, WHITE(0.12 + rand() * 0.15)); };
  const me = at(-1);
  // nearest on all the answers (each answer's gap measured against how widely the reference words spread on it)
  const spread = g.cells.map((c) => Math.max(0.05, Math.max(...c.lex) - Math.min(...c.lex)));
  const gap = (j: number) => g.cells.reduce((a, c, k) => a + ((c.value - (c.lex[j] ?? 0)) / spread[k]) ** 2, 0);
  const byNear = Array.from({ length: R }, (_, j) => j).sort((a, b) => gap(a) - gap(b));

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
    for (let j = 0; j < R; j++) { const c = at(j); for (let n = 0; n < 150; n++) pt(c[0] + gauss() * 0.05, c[1] + gauss() * 0.05, c[2] + gauss() * 0.05, WHITE(0.5)); }
    dust(4000);
    for (let n = 0; n < 900; n++) pt(me[0] + gauss() * 0.035, me[1] + gauss() * 0.035, me[2] + gauss() * 0.035, KEY(0, 0.9));
    box();
    for (let a = 0; a < 3; a++) for (let k = 0; k <= 10; k++) { const p = [-1, -1, -1], q = [-1, -1, -1]; p[a] = q[a] = -1 + k / 5; q[(a + 1) % 3] = -0.96; seg(p, q, WHITE(0.5)); }
    axes();
    mark(W, me, 1);
    return `cloud · ${W} among ${R} words`;
  });

  space('network', () => {
    const pts = [...Array.from({ length: R }, (_, j) => at(j)), me];
    const d2 = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    const nearest = byNear.slice(0, 3);
    for (const i of nearest) mark(g.refs[i], pts[i]);
    mark(W, me, 1);
    axes();
    pts.forEach((p, j) => {
      const mine = j === R;
      for (let n = 0; n < (mine ? 120 : 40); n++) pt(p[0] + gauss() * 0.015, p[1] + gauss() * 0.015, p[2] + gauss() * 0.015, mine ? KEY(0, 0.95) : WHITE(0.8));
      const near = mine ? byNear.slice(0, 8) : pts.map((q, i) => [i, d2(p, q)] as const).filter(([i]) => i !== j && i < R).sort((x, y) => x[1] - y[1]).slice(0, 4).map(([i]) => i);
      for (const i of near) seg(p, pts[i], mine ? KEY(0, 0.95) : WHITE(0.45));
      // and a thread to each axis wall: where it stands
      if (mine) for (let a = 0; a < 3; a++) { const q = [...p]; q[a] = -1; seg(p, q, KEY(0, 0.6)); }
    });
    dust(3000);
    box(WHITE(0.3));
    return `network · nearest: ${nearest.map((i) => g.refs[i]).join(', ')}`;
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

  space('map', () => {
    // contour lines (marching squares) at eight levels, on the plane y = 0
    const g2 = (i: number, k: number) => [-1 + (2 * k) / (N - 1), 0, -1 + (2 * i) / (N - 1)];
    for (let lv = 1; lv <= 8; lv++) {
      const iso = lv / 9;
      for (let i = 0; i < N - 1; i++) for (let k = 0; k < N - 1; k++) {
        const v = [hAt(i, k), hAt(i, k + 1), hAt(i + 1, k + 1), hAt(i + 1, k)];
        const c = [g2(i, k), g2(i, k + 1), g2(i + 1, k + 1), g2(i + 1, k)];
        const cross: number[][] = [];
        for (let e = 0; e < 4; e++) {
          const a = v[e], b = v[(e + 1) % 4];
          if ((a < iso) !== (b < iso)) { const t = (iso - a) / (b - a); cross.push(c[e].map((x, d) => x + (c[(e + 1) % 4][d] - x) * t)); }
        }
        if (cross.length >= 2) seg(cross[0], cross[1], WHITE(0.25 + iso * 0.5));
        if (cross.length === 4) seg(cross[2], cross[3], WHITE(0.25 + iso * 0.5));
      }
    }
    for (let j = 0; j < R; j++) { const c = at(j, 0, 1); for (let n = 0; n < 8; n++) pt(c[0] + gauss() * 0.006, 0, c[1] + gauss() * 0.006, WHITE(0.9)); }
    const m = [me[0], 0, me[1]];
    seg([m[0] - 0.12, 0, m[2]], [m[0] + 0.12, 0, m[2]], KEY(0, 0.95));
    seg([m[0], 0, m[2] - 0.12], [m[0], 0, m[2] + 0.12], KEY(0, 0.95));
    seg([m[0], 0, m[2]], [m[0], 0.6, m[2]], KEY(0, 0.95));
    mark(nm(0), [1.05, 0, -1]); mark(nm(1), [-1, 0, 1.05]);
    mark(W, [m[0], 0.62, m[2]], 1);
    return `map · ${nm(0)} × ${nm(1)}`;
  });

  space('globe', () => {
    const n = g.cells.length;
    for (let k = 0; k < n; k++) {
      const c = g.cells[k], r = 0.55 + 0.4 * c.value, colour = c.key >= 0 ? KEY(c.key, 0.9) : WHITE(0.5);
      for (let lon = 0; lon < 4; lon++) for (let lat = 0; lat < 70; lat++) {
        const th = ((k + lon / 4) / n) * 2 * Math.PI, ph = (lat / 69 - 0.5) * Math.PI * 0.94;
        pt(r * Math.cos(ph) * Math.cos(th), r * Math.sin(ph), r * Math.cos(ph) * Math.sin(th), colour);
      }
    }
    for (let a = 0; a < 128; a++) {
      const t0 = (a / 128) * 2 * Math.PI, t1 = ((a + 1) / 128) * 2 * Math.PI;
      seg([Math.cos(t0) * 0.55, 0, Math.sin(t0) * 0.55], [Math.cos(t1) * 0.55, 0, Math.sin(t1) * 0.55], WHITE(0.4));
    }
    g.keys.forEach((k, i) => { const th = ((k + 0.5) / n) * 2 * Math.PI, r = 0.6 + 0.4 * g.cells[k].value; mark(nm(i), [r * Math.cos(th), 0, r * Math.sin(th)], 1 + i); });
    return `globe · ${n} answers`;
  });

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
    return `table · ${n} answers × ${rows.length} words`;
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
    return `ridges · ${n} answers × ${R} words`;
  });

  return { points: new Float32Array(P), lines: new Float32Array(L), ranges, captions, anchors, focus, nearest: byNear.slice(0, 3).map((j) => g.refs[j]) };
}

/** How far each space reaches from its centre: the camera stands back far enough to hold all of it. */
const REACH: Partial<Record<Space, number>> = { globe: 1.2, map: 1.45, terrain: 1.55, ridges: 1.5 };

/** How a view looks at a space: an orbit (perspective, turning); a plan, a front or a side elevation (orthographic,
 *  still — the technical drawings); a close-up turning round the word; any of them may cut the space to a slab
 *  (axis 0–2 at a position: a cross-section). */
export type View = { kind: 'orbit' | 'plan' | 'front' | 'side' | 'close'; seed: number; slab?: [number, number] };

const h = (x: number) => { const s = Math.sin(x * 127.1) * 43758.5453; return s - Math.floor(s); };

/** The stage's view for a step: an orbit — for a neutral word, often a drawing (plan, front, side). */
export function stageView(cam: number, neu: number): View {
  const d = h(cam * 7.7);
  return { kind: d < neu * 0.6 ? (['plan', 'front', 'side'] as const)[Math.floor(h(cam * 3.3) * 3)] : 'orbit', seed: cam };
}

/** The views in the cells around the stage (cell k of the 9 × 5 grid), laid out as one of four plates chosen by the
 *  step: angles (every cell its own orbit), scans (the top row a series of cross-sections through depth, the bottom
 *  row through width, the sides the three drawings and close-ups), sections (plans, fronts and sides, each cut at its
 *  own depth; the corners close-ups), or a mix of all. */
export function ringView(k: number, cam: number, t: number): View {
  const row = Math.floor(k / 9), col = k % 9, seed = (cam + k * 0.618) % 1;
  const plate = Math.floor(h(cam * 13.1) * 4);
  const drawings = ['plan', 'front', 'side'] as const;
  if (plate === 0) return { kind: 'orbit', seed };
  if (plate === 1) {
    // (the series sweeps slowly through the space, as a scanner would)
    const pos = -0.9 + (1.8 * col) / 8 + 0.08 * Math.sin(t * 1.3);
    if (row === 0) return { kind: 'front', seed, slab: [2, pos] };
    if (row === 4) return { kind: 'side', seed, slab: [0, pos] };
    return row === 2 ? { kind: 'close', seed } : { kind: drawings[(row + (col ? 1 : 0)) % 3], seed };
  }
  if (plate === 2) {
    // sections: each cell a drawing cut at its own depth (a plan cut across height, a front across depth, a side
    // across width), the corners close-ups
    if ((row === 0 || row === 4) && (col === 0 || col === 8)) return { kind: 'close', seed };
    const d = (k + row) % 3;
    return { kind: drawings[d], seed, slab: [[1, 2, 0][d], -0.85 + 1.7 * h(k * 1.37 + cam)] };
  }
  return { kind: (['orbit', 'plan', 'close', 'front', 'orbit', 'side'] as const)[(k * 5 + row) % 6], seed, slab: k % 7 === 3 ? [1, -0.6 + 1.2 * h(k + cam)] : undefined };
}

/** The view × projection (column-major) of a view at time t into its step, and how far the camera stands: always
 *  far enough back that the whole space stays inside the frame (a close-up alone goes in, round the word). The
 *  mood moves an orbit: a negative word turns faster and shakes, through a wider lens; a neutral one through a long
 *  lens, almost still; a positive one smoothly. */
export function camera(space: Space, v: View, t: number, aspect: number, mood: { pos: number; neu: number; neg: number }, focus: number[]): { vp: Float32Array; dist: number } {
  const { neu, neg } = mood, cam = v.seed;
  const reach = REACH[space] ?? 1.75;
  const high = space === 'terrain' || space === 'map';
  const shake = (k: number) => neg * 0.018 * Math.sin(t * 47 + k * 11.3) * Math.sin(t * 31 + k * 5.1);
  let eye: number[], target = [0, 0, 0], up = [0, 1, 0], ortho = 0;
  const fov = 0.75 - 0.4 * neu + 0.15 * neg;
  // the narrower half-angle of the frame decides how far back the whole space fits
  const half = Math.min(fov / 2, Math.atan(Math.tan(fov / 2) * aspect));
  let dist = (reach / Math.sin(half)) * (1.04 - 0.04 * (cam * 5.3 % 1));
  if (v.kind === 'plan' || v.kind === 'front' || v.kind === 'side') {
    ortho = ((space === 'globe' ? 1.0 : 1.08) * 1.04) / Math.min(1, aspect); // (a drawing is flat: only the face must fit)
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
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return a.map((x) => x / l); };
