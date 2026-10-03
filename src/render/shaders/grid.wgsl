// GRID — the piece's 2D layer in one pass (show/grid.ts), drawn as an instrument panel: a PRINTED layer (the
// panel's silkscreen — grey rules, crosses, labels, scales, empty readout boxes, unlit lamps, the ghosts of every
// segment) and a LIT layer (vacuum-fluorescent light — segmented bar graphs, needles, numerals — in the panel's
// phosphor; what matters lit in the words' own ink, like a warning lamp). The panel is there from the start; the
// answers light it. The room is one line, the drone's own waveform (F.mode 1; waiting, 2); a performance (F.mode 0,
// clock F.lt) fills it, marks the cells that matter, turns the rest off, then cuts to the steps: the marked cells
// merged on the stage, a black window for a 3D space (space.wgsl), or where the words stand (a large bar graph; its
// words are DOM text). Native resolution, linear light; the monitor (post.wgsl) tones and blooms it.

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var glyphs: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> D: array<f32>; // grid.ts pack()
@group(0) @binding(3) var labels: texture_2d<f32>;
@group(0) @binding(4) var glyphsBig: texture_2d<f32>; // the same digits, three times the size
@group(0) @binding(5) var<storage, read> wave: array<f32, 256>; // the drone's waveform (audio/drone.ts wave())

const CELL = 12u;
const BINS = 128u;
const BYTE_MAX = 256u;
const KEY_MAX = 8u;
const COLS = 9.0;
const ROWS = 5.0;
const LABEL_W = 512.0; // label atlas slot (gpu.ts atlas())
const LABEL_H = 48.0;
const LABEL_PER_ROW = 4.0;
// (linear light) the panel's phosphor (#52f2d2), the silkscreen's grey (#8c96a3)
const PHOS = vec3f(0.084, 0.888, 0.645);
const PRINT = vec3f(0.262, 0.305, 0.366);
const GHOST = 0.032; // an unlit segment, still faintly there

fn nCells() -> u32 { return u32(D[0]); }
fn nKeys() -> u32 { return u32(D[1]); }
fn nRefs() -> f32 { return D[3]; }
fn cf(k: u32, i: u32) -> f32 { return D[16u + k * CELL + i]; }
fn k0() -> u32 { return 16u + nCells() * CELL; }
const KEY = 12u;
fn keyCell(i: u32) -> u32 { return u32(D[k0() + i * KEY]); }
fn keyVal(i: u32) -> f32 { return D[k0() + i * KEY + 1u]; }
fn keyCol(i: u32) -> vec3f { let o = k0() + i * KEY; return vec3f(D[o + 2u], D[o + 3u], D[o + 4u]); }
/** Key i's tile on the stage (a unit rect, grid.ts tiles()). */
fn keyTile(i: u32) -> vec4f { let o = k0() + i * KEY + 5u; return vec4f(D[o], D[o + 1u], D[o + 2u], D[o + 3u]); }
fn b0() -> u32 { return k0() + KEY_MAX * KEY; }
/** How many reference words gave answer k a value in bin i (grid.ts pack(): after the bytes). */
fn hist(k: u32, i: u32) -> f32 { return D[b0() + 1u + BYTE_MAX + k * BINS + min(i, BINS - 1u)]; }

fn h1(i: u32) -> f32 { return f32(pcg(i * 747796405u + 2891336453u)) / 4294967295.0; }
fn easeOut(x: f32) -> f32 { let t = clamp(x, 0.0, 1.0); return 1.0 - pow(1.0 - t, 3.0); }
fn inRect(p: vec2f, r: vec4f) -> bool { return p.x >= r.x && p.y >= r.y && p.x < r.x + r.z && p.y < r.y + r.w; }
/** A hairline (1 CSS px) at distance d, antialiased. */
fn line(d: f32) -> f32 { return clamp(F.dpr * 0.5 + 0.5 - abs(d), 0.0, 1.0); }
/** Coverage of rect r at p, antialiased edges. */
fn box(p: vec2f, r: vec4f) -> f32 {
  let d = min(min(p.x - r.x, r.x + r.z - p.x), min(p.y - r.y, r.y + r.w - p.y));
  return clamp(d + 0.5, 0.0, 1.0);
}
/** A hairline rectangle's outline. */
fn frame(p: vec2f, r: vec4f) -> f32 {
  let d = min(min(abs(p.x - r.x), abs(r.x + r.z - p.x)), min(abs(p.y - r.y), abs(r.y + r.w - p.y)));
  return select(0.0, line(d), p.x > r.x - 1.0 && p.x < r.x + r.z + 1.0 && p.y > r.y - 1.0 && p.y < r.y + r.w + 1.0);
}

// ---------------------------------------------------------------- text
fn bilinear(tex: texture_2d<f32>, a: vec2f) -> f32 {
  let dim = vec2i(textureDimensions(tex)) - 1;
  let b = a - 0.5;
  let i = vec2i(floor(b));
  let f = fract(b);
  let t00 = textureLoad(tex, clamp(i, vec2i(0), dim), 0).r;
  let t10 = textureLoad(tex, clamp(i + vec2i(1, 0), vec2i(0), dim), 0).r;
  let t01 = textureLoad(tex, clamp(i + vec2i(0, 1), vec2i(0), dim), 0).r;
  let t11 = textureLoad(tex, clamp(i + vec2i(1, 1), vec2i(0), dim), 0).r;
  return mix(mix(t00, t10, f.x), mix(t01, t11, f.x), f.y);
}
/** Label `idx` (grid.ts LABELS) with its top-left at org, h px high. */
fn label(p: vec2f, org: vec2f, h: f32, idx: f32, maxW: f32) -> f32 {
  let q = (p - org) / h * LABEL_H;
  if (q.x < 0.0 || q.y < 0.0 || q.x >= LABEL_W || q.y >= LABEL_H || p.x - org.x > maxW) { return 0.0; }
  let slot = vec2f(idx % LABEL_PER_ROW, floor(idx / LABEL_PER_ROW)) * vec2f(LABEL_W, LABEL_H);
  return bilinear(labels, slot + q);
}
/** Glyph g of the digit atlas (row 0: 0-9 A-F; row 1: . - x :), cell 40 × 60. */
fn glyph(g: f32, uv: vec2f, big: bool) -> f32 {
  let a = (vec2f(g % 16.0, floor(g / 16.0)) + clamp(uv, vec2f(0.0), vec2f(1.0))) * vec2f(40.0, 60.0);
  if (big) { return bilinear(glyphsBig, a * 3.0); }
  return bilinear(glyphs, a);
}
/** How far an answer stands from the reference words, "+2.9σ", top-left at org, h px high. */
fn sigma(p: vec2f, org: vec2f, h: f32, z: f32) -> f32 {
  let w = h * 27.0 / 60.0;
  let q = (p - org) / vec2f(w, h);
  if (q.x < 0.0 || q.y < 0.0 || q.x >= 5.0 || q.y >= 1.0) { return 0.0; }
  let i = i32(floor(q.x));
  let a = min(abs(z), 9.9);
  var g = select(17.0, 20.0, z >= 0.0); // − or +
  if (i == 1) { g = floor(a); }
  else if (i == 2) { g = 16.0; }
  else if (i == 3) { g = floor(fract(a) * 10.0); }
  else if (i == 4) { g = 21.0; } // σ
  return glyph(g, vec2f(0.5 + (fract(q.x) - 0.5) * 27.0 / 40.0, q.y), h > 60.0);
}
/** "0.xyz" of v, top-left at org, h px high; `scramble` > 0: the digits still searching. */
fn number(p: vec2f, org: vec2f, h: f32, v: f32, scramble: f32) -> f32 {
  let w = h * 27.0 / 60.0; // Plex Mono's advance (0.6 em of the 44 px glyph) in its 40 px slot
  let q = (p - org) / vec2f(w, h);
  if (q.x < 0.0 || q.y < 0.0 || q.x >= 5.0 || q.y >= 1.0) { return 0.0; }
  let i = i32(floor(q.x));
  var n = i32(clamp(v, 0.0, 0.999) * 1000.0);
  if (scramble > 0.0) { n = i32(h1(u32(F.time * 30.0) * 7u + u32(org.x) + u32(org.y) * 131u) * 999.0); }
  var g = 0.0;
  if (i == 1) { g = 16.0; }
  else if (i == 2) { g = f32(n / 100); }
  else if (i == 3) { g = f32((n / 10) % 10); }
  else if (i == 4) { g = f32(n % 10); }
  return glyph(g, vec2f(0.5 + (fract(q.x) - 0.5) * 27.0 / 40.0, q.y), h > 60.0);
}

// ---------------------------------------------------------------- layout
struct Lay { org: vec2f, cs: f32 };
fn lay() -> Lay { return Lay(vec2f(F.gridX, F.gridY), F.cs); } // (grid.ts layout())
fn cellRect(k: u32, L: Lay) -> vec4f { return vec4f(L.org + vec2f(f32(k % 9u), f32(k / 9u)) * L.cs, L.cs, L.cs); }
/** The stage at the centre (7 × 3 cells): where the steps play (grid.ts stage()). */
fn stage(L: Lay) -> vec4f { return vec4f(L.org + vec2f(1.0, 1.0) * L.cs, 7.0 * L.cs, 3.0 * L.cs); }

/** The panel between the gauges: faint rules, and a small cross at each corner. */
fn panelLines(q: vec2f, L: Lay) -> f32 {
  let g = (q - L.org) / L.cs;
  if (g.x < -0.06 || g.y < -0.06 || g.x > COLS + 0.06 || g.y > ROWS + 0.06) { return 0.0; }
  let d = abs(g - round(g)) * L.cs;
  let rule = line(min(d.x, d.y)) * 0.22;
  let arm = L.cs * 0.045;
  let cross = select(0.0, line(min(d.x, d.y)), max(d.x, d.y) < arm);
  return max(rule, cross * 0.9);
}

// ---------------------------------------------------------------- the gauge
/** The reference words' spread on answer k as a vacuum-fluorescent bar graph in box b: `cols` columns (a divisor
 *  of BINS) of `segs`
 *  segments, a column lit as high as its share of the words (square-rooted: a quarter of them fills it), the unlit
 *  segments' ghosts always there; `on` 0..1, how far the columns have lit, left to right. Returns (lit, ghost). */
fn segGraph(k: u32, p: vec2f, b: vec4f, cols: u32, segs: u32, on: f32) -> vec2f {
  let u = (p - b.xy) / b.zw;
  if (u.x < 0.0 || u.y < 0.0 || u.x >= 1.0 || u.y >= 1.0) { return vec2f(0.0); }
  let cw = b.z / f32(cols);
  let ci = u32(u.x * f32(cols));
  let cx = p.x - b.x - f32(ci) * cw;
  let gx = max(F.dpr, cw * 0.25);
  let sh = b.w / f32(segs);
  let up = b.y + b.w - p.y;
  let si = floor(up / sh);
  let sy = up - si * sh;
  let gy = max(F.dpr, sh * 0.3);
  let a = box(vec2f(cx, sy), vec4f(gx * 0.5, gy * 0.5, cw - gx, sh - gy));
  if (a <= 0.0) { return vec2f(0.0); }
  let per = BINS / cols;
  var n = 0.0;
  for (var j = 0u; j < per; j++) { n += hist(k, ci * per + j); }
  let lit = select(0.0, ceil(f32(segs) * min(1.0, sqrt(n / (0.25 * nRefs())))), n > 0.0);
  let shown = select(0.0, 1.0, (f32(ci) + 0.5) / f32(cols) <= on);
  return vec2f(select(0.0, a, si < lit) * shown, a);
}

/** The words' own value on a gauge in box b: a needle the full height and a little past, and a pointer under the
 *  scale. Returns its coverage. */
fn needle(p: vec2f, b: vec4f, v: f32) -> f32 {
  let x = b.x + clamp(v, 0.0, 1.0) * b.z;
  var c = select(0.0, clamp(F.dpr + 0.5 - abs(p.x - x), 0.0, 1.0), p.y > b.y - b.w * 0.08 && p.y < b.y + b.w);
  let t0 = b.y + b.w + 3.0 * F.dpr;
  let th = 5.0 * F.dpr;
  if (p.y > t0 && p.y < t0 + th) { c = max(c, clamp((p.y - t0) * 0.75 - abs(p.x - x) + 0.5, 0.0, 1.0)); }
  return c;
}

/** The scale under a gauge: a hairline, ticks at 0, ½ and 1. */
fn scale(p: vec2f, b: vec4f) -> f32 {
  let y = b.y + b.w + 1.5 * F.dpr;
  var c = select(0.0, line(p.y - y), p.x >= b.x && p.x <= b.x + b.z);
  let tx = min(min(abs(p.x - b.x), abs(p.x - b.x - b.z)), abs(p.x - b.x - b.z * 0.5));
  if (p.y > y && p.y < y + 3.0 * F.dpr) { c = max(c, line(tx)); }
  return c;
}

/** Cell k as a gauge in rect r at time t: printed — its name, its scale, an empty readout box, an unlit lamp,
 *  the ghosts of its segments; lit when its answer arrives — the reference words' spread, the needle at its value,
 *  its numerals (a choice: the option, lit, under its name); once marked, all of it in its ink, the lamp on, the
 *  gauge outlined; turned off when cleared (the printed panel stays, dimmer). Doubt: the segments dimmer, the
 *  needle in dashes. */
fn gauge(k: u32, p: vec2f, r: vec4f, t: f32) -> vec4f {
  let cs = r.z;
  let m = 0.075 * cs;
  let arrive = cf(k, 3u);
  let vanish = cf(k, 4u);
  let key = cf(k, 5u);
  let markAt = cf(k, 9u);
  let on = t >= arrive && t < vanish;
  let marked = key >= 0.0 && t >= markAt;
  let ink = select(PHOS, keyCol(u32(max(key, 0.0))), marked);
  let doubt = clamp((0.75 - cf(k, 1u)) / 0.6, 0.0, 1.0);
  let settle = t - arrive;
  // (an answer Jev is unsure of comes on with false starts)
  let flick = doubt > 0.3 && settle < 0.6 && fract(settle * 9.0) > 0.5;
  let lit = select(0.0, 1.0, on && !flick);
  let dim = select(1.0, 0.45, t >= vanish);

  let th = 0.094 * cs;
  let lab = label(p, r.xy + m, th, cf(k, 6u), r.z - 2.0 * m - 0.14 * cs);
  let g = vec4f(r.x + m, r.y + 0.36 * cs, r.z - 2.0 * m, 0.27 * cs);
  let sg = segGraph(k, p, g, 32u, 9u, easeOut(settle / 0.35) * 1.02);
  let vh = 0.15 * cs;
  let rb = vec4f(r.x + m, r.y + r.w - m - vh - 0.05 * cs, vh * 27.0 / 60.0 * 5.0 + 0.07 * cs, vh + 0.05 * cs);
  let num = number(p, rb.xy + vec2f(0.035 * cs, 0.025 * cs), vh, cf(k, 0u), select(0.0, 1.0, settle < 0.3));
  let lamp = vec4f(r.x + r.z - m - 0.1 * cs, r.y + m + 0.012 * cs, 0.1 * cs, 0.04 * cs);

  // printed
  var pr = max(select(lab * 0.85, 0.0, marked), scale(p, g) * 0.55);
  pr = max(pr, frame(p, rb) * 0.4);
  pr = max(pr, frame(p, lamp) * 0.5);
  var c = PRINT * pr * dim + PHOS * sg.y * GHOST * dim;
  // lit
  // (doubt: the segments dimmer, the needle broken into dashes)
  var l = sg.x * 0.75 * (1.0 - 0.5 * doubt);
  l = max(l, needle(p, g, cf(k, 0u)) * select(1.0, step(0.5, fract(p.y / (6.0 * F.dpr))), doubt > 0.3));
  l = max(l, num);
  if (u32(cf(k, 2u)) == 1u) { l = max(l, label(p, r.xy + vec2f(m, m + th * 0.95), th, cf(k, 7u), r.z - 2.0 * m)); }
  if (marked) {
    let wipe = easeOut((t - markAt) / 0.12);
    l = max(l, lab);
    l = max(l, box(p, lamp) * select(0.0, 1.0, (p.x - r.x) < r.z * wipe));
    l = max(l, frame(p, vec4f(r.xy + 2.0 * F.dpr, r.zw - 4.0 * F.dpr)) * 0.85 * select(0.0, 1.0, (p.x - r.x) < r.z * wipe));
  }
  c += ink * l * lit;
  // its arrival: a brief glint along the needle (never a flash)
  c += ink * needle(p, g, cf(k, 0u)) * exp(-max(settle, 0.0) / 0.05) * 0.6 * select(0.0, 1.0, on);
  return vec4f(c, 1.0);
}

// ---------------------------------------------------------------- the marked cells, merged on the stage
/** The step in rect r: the marked cells merged — a gauge each, larger: its name and option, its gauge, its value and
 *  how far it stands from the reference words (σ), all in its ink, the lamp on — when `tiles`; else black (a space is
 *  drawn there). */
fn tilesDraw(p: vec2f, r: vec4f) -> vec3f {
  for (var i = 0u; i < nKeys(); i++) {
    let u = keyTile(i);
    let tr = vec4f(r.xy + u.xy * r.zw, u.zw * r.zw);
    if (inRect(p, tr)) {
      let k = keyCell(i);
      let ink = keyCol(i);
      let s = min(tr.z, tr.w);
      let m = 0.07 * s;
      let th = 0.075 * s;
      var l = label(p, tr.xy + m, th, cf(k, 6u), tr.z * 0.6);
      let opt = cf(k, 7u);
      if (opt >= 0.0) { l = max(l, label(p, tr.xy + vec2f(m, m + th * 1.25), th, opt, tr.z * 0.6)); }
      l = max(l, sigma(p, tr.xy + vec2f(tr.z - m - th * 27.0 / 60.0 * 5.0, m), th, cf(k, 11u)));
      let g = vec4f(tr.x + m, tr.y + tr.w * 0.36, tr.z - 2.0 * m, tr.w * 0.3);
      let sg = segGraph(k, p, g, 32u, 10u, 1.0);
      l = max(l, sg.x * 0.75);
      l = max(l, needle(p, g, keyVal(i)));
      let vh = 0.17 * s;
      l = max(l, number(p, vec2f(tr.x + m, tr.y + tr.w - m - vh), vh, keyVal(i), 0.0));
      l = max(l, frame(p, vec4f(tr.xy + 3.0 * F.dpr, tr.zw - 6.0 * F.dpr)) * 0.8);
      let pr = scale(p, g) * 0.55;
      return PRINT * pr + ink * sg.y * GHOST + ink * l;
    }
  }
  return vec3f(0.0);
}

/** Where the words stand: the reference words' spread on that answer as a large bar graph in F.sg (64 columns, the
 *  ghosts there from the start, the columns lighting left to right from F.st), the words' needle in their ink when
 *  the columns have passed it, ticks under the scale at their three nearest (F.n1…n3, numbered in DOM text). */
fn standDraw(p: vec2f) -> vec3f {
  if (F.standK < 0.0) { return vec3f(0.0); }
  let b = vec4f(F.sgX, F.sgY, F.sgW, F.sgH);
  let k = u32(F.standK);
  let t = F.lt - F.st;
  let sweep = clamp((t - 1.5) / 1.2, 0.0, 1.0);
  let sg = segGraph(k, p, b, 64u, 14u, sweep);
  let v = cf(k, 0u);
  let ink = keyCol(u32(max(cf(k, 5u), 0.0)));
  var c = PHOS * (sg.x * 0.55 + sg.y * GHOST);
  if (sweep >= v) { c = max(c, ink * needle(p, b, v)); }
  // the scale: a hairline, a tick each tenth
  let y = b.y + b.w + 1.5 * F.dpr;
  var pr = select(0.0, line(p.y - y), p.x >= b.x - 1.0 && p.x <= b.x + b.z + 1.0);
  let tx = abs(fract((p.x - b.x) / b.z * 10.0 + 0.5) - 0.5) * b.z / 10.0;
  if (p.y > y && p.y < y + 4.0 * F.dpr && p.x >= b.x - 1.0 && p.x <= b.x + b.z + 1.0) { pr = max(pr, line(tx)); }
  if (t > 3.5) {
    for (var i = 0; i < 3; i++) {
      let nv = select(F.n1, select(F.n2, F.n3, i == 2), i > 0);
      if (nv >= 0.0 && p.y > y + 6.0 * F.dpr && p.y < y + 14.0 * F.dpr) { c = max(c, PHOS * line(p.x - (b.x + nv * b.z)) * 0.9); }
    }
  }
  return c + PRINT * pr * 0.6;
}

// ---------------------------------------------------------------- the frame
@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let L = lay();
  let p = fc.xy;
  if (F.mode > 2.5) { return vec4f(0.0, 0.0, 0.0, 1.0); }
  // ---- the room: the drone as one line across the screen, below the words; typing swells it, a key kicks it
  if (F.mode > 0.5) {
    let x = p.x / F.resX * 255.0;
    let i = u32(clamp(floor(x), 0.0, 254.0));
    let v = mix(wave[i], wave[i + 1u], fract(x));
    let amp = F.resY * 0.05 * (0.35 + 0.65 * F.charge + 0.6 * F.kick);
    let y = F.resY * 0.68 - v * amp;
    let slope = (wave[i + 1u] - wave[i]) * amp / (F.resX / 255.0);
    let c = PHOS * line((p.y - y) / sqrt(1.0 + slope * slope)) * (0.35 + 0.35 * F.charge) * F.fade;
    return vec4f(c, 1.0);
  }
  // ---- a performance
  let t = F.lt;
  let seq = D[2];
  let g = floor((p - L.org) / L.cs);
  let inGrid = g.x >= 0.0 && g.y >= 0.0 && g.x < COLS && g.y < ROWS;
  let k = u32(g.x + g.y * COLS);
  if (t < seq) {
    // fill, mark, clear: the panel, powering on left to right in its first 0.4 s, each gauge lit in its place
    let on = clamp(t * 2.5 - (p.x - L.org.x) / (COLS * L.cs) * 0.6, 0.0, 1.0);
    var c = PRINT * panelLines(p, L) * on;
    if (inGrid && k < nCells()) { c += gauge(k, p, cellRect(k, L), t).rgb * on; }
    return vec4f(c, 1.0);
  }
  // the steps: the step on screen comes from main.ts
  let r = select(stage(L), vec4f(0.0, 0.0, F.resX, F.resY), F.full > 0.5);
  if (inRect(p, r)) {
    if (F.viz < 0.5) { return vec4f(tilesDraw(p, r), 1.0); }
    if (abs(F.viz - 1.0) < 0.5) { return vec4f(standDraw(p), 1.0); }
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
  // around it the panel, pulsing with the beat — still and dim on the ending
  let pulse = select(0.35 * exp(-F.beatU * 6.0), 0.0, abs(F.viz - 1.0) < 0.5);
  return vec4f(PRINT * panelLines(p, L) * (0.7 + pulse), 1.0);
}
