// GRID — the whole piece in one pass (show/grid.ts): the room is the empty grid, tilted in space, lit by the typing
// (F.mode 1; waiting for the machine, 2); a performance (F.mode 0, clock F.lt) fills it, marks the cells that matter
// in the word's colours, clears the rest, merges them into one square and re-draws that result on every beat.
// Drawn at native resolution; colours are the colours that reach the screen (see out()).

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var glyphs: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> D: array<f32>; // grid.ts pack()
@group(0) @binding(3) var labels: texture_2d<f32>;
@group(0) @binding(4) var<uniform> R: array<vec4f, 8>; // grid.ts keyRects(): each marked cell, where it is now

const CELL = 28u;
const KEY_MAX = 8u;
const COLS = 9.0;
const ROWS = 5.0;
const LABEL_W = 512.0; // label atlas slot (gpu.ts makeLabelAtlas)
const LABEL_H = 48.0;
const LABEL_PER_ROW = 4.0;
const WHITE = vec3f(0.93, 0.92, 0.9);
const N_DIMS = 43u; // the measurements (grid.ts DIMS): their names are the label atlas's first slots

fn nCells() -> u32 { return u32(D[0]); }
fn nKeys() -> u32 { return u32(D[1]); }
fn cf(k: u32, i: u32) -> f32 { return D[16u + k * CELL + i]; }
fn prob(k: u32, o: u32) -> f32 { return D[16u + k * CELL + 12u + o]; }
fn k0() -> u32 { return 16u + nCells() * CELL; }
fn keyCell(i: u32) -> u32 { return u32(D[k0() + i * 8u]); }
fn keyVal(i: u32) -> f32 { return D[k0() + i * 8u + 1u]; }
fn keyCol(i: u32) -> vec3f { let o = k0() + i * 8u; return vec3f(D[o + 2u], D[o + 3u], D[o + 4u]); }
fn b0() -> u32 { return k0() + KEY_MAX * 8u; }
/** The word's own bytes (after the keys: their count, then one each). */
fn wordByte(i: u32) -> u32 { let n = max(u32(D[b0()]), 1u); return u32(D[b0() + 1u + i % n]); }
fn result() -> f32 { return D[5]; }
fn resultCol() -> vec3f { return vec3f(D[6], D[7], D[8]); }

fn h2(p: vec2f, salt: u32) -> f32 { return f32(pcg((u32(p.x) * 1973u) ^ pcg(u32(p.y) * 9277u + salt))) / 4294967295.0; }
fn h1(i: u32) -> f32 { return f32(pcg(i * 747796405u + 2891336453u)) / 4294967295.0; }
fn lum(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }
/** Ink on a colour: near-black on a light one, white on a dark one. */
fn inkOn(c: vec3f) -> vec3f { return select(WHITE, vec3f(0.02), lum(c) > 0.3); }
fn ease3(x: f32) -> f32 { let t = clamp(x, 0.0, 1.0); return select(1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0, 4.0 * t * t * t, t < 0.5); }
fn easeOut(x: f32) -> f32 { let t = clamp(x, 0.0, 1.0); return 1.0 - pow(1.0 - t, 3.0); }
fn inRect(p: vec2f, r: vec4f) -> bool { return p.x >= r.x && p.y >= r.y && p.x < r.x + r.z && p.y < r.y + r.w; }
/** A 1-px (CSS) line at distance d, antialiased. */
fn line(d: f32) -> f32 { return clamp(F.dpr * 0.5 + 0.5 - abs(d), 0.0, 1.0); }

// ---------------------------------------------------------------- text
fn bilinear(tex: texture_2d<f32>, a: vec2f) -> f32 {
  let dim = vec2i(textureDimensions(tex)) - 1;
  let b = a - 0.5;
  let i = vec2i(floor(b));
  let f = fract(b);
  let t00 = textureLoad(tex, clamp(i, vec2i(0), dim), 0).a;
  let t10 = textureLoad(tex, clamp(i + vec2i(1, 0), vec2i(0), dim), 0).a;
  let t01 = textureLoad(tex, clamp(i + vec2i(0, 1), vec2i(0), dim), 0).a;
  let t11 = textureLoad(tex, clamp(i + vec2i(1, 1), vec2i(0), dim), 0).a;
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
fn glyph(g: f32, uv: vec2f) -> f32 {
  let cell = vec2f(g % 16.0, floor(g / 16.0));
  return bilinear(glyphs, (cell + clamp(uv, vec2f(0.0), vec2f(1.0))) * vec2f(40.0, 60.0));
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
  return glyph(g, vec2f(0.5 + (fract(q.x) - 0.5) * 27.0 / 40.0, q.y));
}

// ---------------------------------------------------------------- layout
struct Lay { org: vec2f, cs: f32 };
fn lay() -> Lay { return Lay(vec2f(F.gridX, F.gridY), F.cs); } // (grid.ts layout())
fn cellRect(k: u32, L: Lay) -> vec4f { return vec4f(L.org + vec2f(f32(k % 9u), f32(k / 9u)) * L.cs, L.cs, L.cs); }
/** The square at the centre (3 × 3 cells): where the result lives. */
fn square(L: Lay) -> vec4f { return vec4f(L.org + vec2f(3.0, 1.0) * L.cs, 3.0 * L.cs, 3.0 * L.cs); }
/** The grid in space: tilted and slowly turning at rest; a performance settles it flat as its results come in.
 *  Returns the point of the plane under pixel p (identity when flat). */
fn plane(p: vec2f, tilt: f32) -> vec2f {
  if (tilt < 0.001) { return p; }
  let res = vec2f(F.resX, F.resY);
  let f = res.y * 1.6;
  let t = F.time * 0.11;
  let ax = tilt * (0.55 + 0.12 * sin(t * 1.3));
  let ay = tilt * 0.42 * sin(t);
  let az = tilt * 0.08 * sin(t * 0.7);
  let cx = cos(ax); let sx = sin(ax); let cy = cos(ay); let sy = sin(ay); let cz = cos(az); let sz = sin(az);
  // R = Rz · Ry · Rx (columns: the plane's axes in camera space)
  let rx = vec3f(cy * cz, cy * sz, -sy);
  let ry = vec3f(sx * sy * cz - cx * sz, sx * sy * sz + cx * cz, sx * cy);
  let n = cross(rx, ry);
  let dir = vec3f(p - res * 0.5, f);
  let o = vec3f(0.0, 0.0, f * (1.0 + 0.35 * tilt));
  let den = dot(dir, n);
  if (abs(den) < 1e-4) { return vec2f(-1e5); }
  let hit = dir * (dot(o, n) / den) - o;
  return vec2f(dot(hit, rx), dot(hit, ry)) + res * 0.5;
}

// ---------------------------------------------------------------- the grid's lines
fn gridLines(q: vec2f, L: Lay, reveal: f32) -> f32 {
  let g = (q - L.org) / L.cs;
  if (g.x < -0.02 || g.y < -0.02 || g.x > COLS + 0.02 || g.y > ROWS + 0.02) { return 0.0; }
  let d = min(abs(g.x - round(g.x)), abs(g.y - round(g.y))) * L.cs;
  // it draws itself out from the centre
  let r = length((g - vec2f(COLS, ROWS) * 0.5) / vec2f(COLS, ROWS) * 2.0);
  return line(d) * step(r, reveal * 1.5);
}

// ---------------------------------------------------------------- one cell
/** The live figure of a measurement in box b (x, y, w, h): a score a sine, a choice its bars, a yes/no a field of
 *  dots; `grow` 0..1 as it arrives. Doubt breaks it into noise. */
fn figure(k: u32, p: vec2f, b: vec4f, grow: f32) -> f32 {
  let v = cf(k, 0u);
  let kind = u32(cf(k, 2u));
  let doubt = clamp((0.75 - cf(k, 1u)) / 0.6, 0.0, 1.0);
  let u = (p - b.xy) / b.zw;
  if (u.x < 0.0 || u.y < 0.0 || u.x > 1.0 || u.y > 1.0) { return 0.0; }
  var c = 0.0;
  if (kind == 0u) {
    let cyc = 1.0 + 5.0 * v;
    let amp = 0.42 * b.w * (0.25 + 0.75 * v) * grow;
    let ph = TAU * u.x * cyc - F.time * (1.0 + 3.0 * v);
    let y = b.y + b.w * 0.5 - amp * sin(ph);
    let slope = amp * TAU * cyc / b.z * cos(ph);
    c = line((p.y - y) / sqrt(1.0 + slope * slope));
  } else if (kind == 1u) {
    let n = max(cf(k, 8u), 1.0);
    let i = floor(u.x * n);
    let gap = fract(u.x * n) > 0.7;
    let hgt = prob(k, u32(i)) * grow * (0.94 + 0.06 * sin(F.time * 3.0 + i));
    // (the top answer's bar full, the others dimmer)
    c = select(0.0, select(0.45, 1.0, prob(k, u32(i)) >= v - 1e-4), !gap && 1.0 - u.y < max(hgt, 0.02));
  } else {
    let g = vec2f(12.0, 4.0);
    let i = floor(u * g);
    let id = u32(i.x + i.y * g.x) + k * 97u;
    let d = length(fract(u * g) - 0.5) * b.z / g.x;
    let lit = h1(id) < v * grow;
    let tw = 0.6 + 0.4 * sin(F.time * 4.0 + f32(id));
    c = clamp(b.z / g.x * 0.16 - d + 0.5, 0.0, 1.0) * select(0.22, tw, lit);
  }
  if (doubt > 0.0) {
    let n = h2(floor(p / F.dpr), u32(F.time * 24.0));
    c = c * step(doubt * 0.7, n) + step(1.0 - doubt * 0.05, h2(floor(p / F.dpr), 9u + u32(F.time * 24.0))) * 0.8;
  }
  return c;
}

/** Cell k drawn in rect r at time t: its name, its answer (a choice), its figure, its value; in its colour once
 *  marked. Returns (colour, coverage). */
fn cellDraw(k: u32, p: vec2f, r: vec4f, t: f32) -> vec4f {
  let arrive = cf(k, 3u);
  if (t < arrive) { return vec4f(0.0); }
  let vanish = cf(k, 4u);
  if (t >= vanish + 0.1 || (t >= vanish && fract((t - vanish) * 30.0) > 0.5)) { return vec4f(0.0); }
  let key = cf(k, 5u);
  let markAt = cf(k, 9u);
  let m = min(r.z, r.w);
  let pad = 0.07 * m;
  let th = 0.075 * m;
  let u = p - r.xy;
  var bg = vec3f(0.0);
  var a = 0.0;
  var fg = WHITE;
  if (key >= 0.0 && t >= markAt && u.x < r.z * easeOut((t - markAt) / 0.12)) {
    bg = keyCol(u32(key));
    a = 1.0;
    fg = inkOn(bg);
  }
  // its arrival: a white flash
  let flash = exp(-(t - arrive) / 0.05) * 0.8;
  var c = bg;
  var cov = a;
  let settle = t - arrive;
  let lab = label(p, r.xy + pad, th, cf(k, 6u), r.z - 2.0 * pad) * 0.62;
  var txt = lab;
  let kind = u32(cf(k, 2u));
  if (kind == 1u) { txt = max(txt, label(p, r.xy + vec2f(pad, pad + th * 1.25), th, cf(k, 7u), r.z - 2.0 * pad)); }
  let vh = th * 1.5;
  txt = max(txt, number(p, vec2f(r.x + pad, r.y + r.w - pad - vh), vh, cf(k, 0u), select(0.0, 1.0, settle < 0.3)));
  let fb = vec4f(r.x + pad, r.y + pad + th * 2.9, r.z - 2.0 * pad, r.w - 2.0 * pad - th * 2.9 - vh - pad * 0.6);
  let fig = figure(k, p, fb, easeOut(settle / 0.4));
  c = mix(c, fg, max(txt, fig * 0.9));
  cov = max(cov, max(txt, fig));
  c = mix(c, WHITE, flash);
  cov = max(cov, flash);
  return vec4f(c, cov);
}

// ---------------------------------------------------------------- the result, drawn eleven ways
/** The result drawn as `viz` (grid.ts VIZ) in rect r; ph = 0..1 through its step. */
fn viz(vz: u32, p: vec2f, r: vec4f, ph: f32, L: Lay) -> vec3f {
  let K = nKeys();
  let u = (p - r.xy) / r.zw;
  let m = min(r.z, r.w);
  let cp = (p - (r.xy + r.zw * 0.5)) / m; // centred, the short side = 1
  let e = easeOut(ph * 4.0);
  let res = result();
  var c = vec3f(0.0);
  if (vz == 0u) { // flat: the result's colour, its number small in the corner
    c = resultCol();
    c = mix(c, inkOn(c), number(p, vec2f(r.x + 0.04 * m, r.y + r.w - 0.1 * m), 0.06 * m, res, 0.0));
  } else if (vz == 1u) { // number: the result, the size of the square
    let h = r.z * 0.88 / 5.0 * 1.5;
    c = resultCol() * number(p, vec2f(r.x + r.z * 0.06, r.y + (r.w - h) * 0.5), h, res, 0.0);
  } else if (vz == 2u) { // bands: a band per answer, as wide as its value, dropping in
    var sum = 0.0;
    for (var i = 0u; i < K; i++) { sum += keyVal(i) + 0.05; }
    var x = 0.0;
    for (var i = 0u; i < K; i++) {
      let w = (keyVal(i) + 0.05) / sum;
      if (u.x >= x && u.x < x + w && u.y < easeOut(ph * 5.0 - f32(i) * 0.12)) { c = keyCol(i); }
      x += w;
    }
  } else if (vz == 3u) { // rings: one per answer, as thick as its value
    let d = length(cp) * 2.0;
    for (var i = 0u; i < K; i++) {
      let ri = (f32(i) + 1.0) / f32(K) * 0.92 * e;
      let w = 0.015 + 0.07 * keyVal(i);
      if (abs(d - ri) < w * 0.5) { c = keyCol(i); }
    }
  } else if (vz == 4u) { // particles: each answer a crowd as dense as its value
    let n = 56.0;
    let g = u * n;
    let id = u32(floor(g.x) + floor(g.y) * n);
    let i = pcg(id) % max(K, 1u);
    let o = vec2f(sin(F.time * 1.7 + h1(id) * TAU), cos(F.time * 1.3 + h1(id + 7u) * TAU)) * 0.25;
    let d = length(fract(g) - 0.5 - o) * m / n;
    if (h1(id + 3u) < keyVal(i) * 0.9 + 0.05) { c = keyCol(i) * clamp(m / n * 0.22 - d + 0.5, 0.0, 1.0); }
  } else if (vz == 5u) { // bars
    let i = u32(floor(u.x * f32(K)));
    if (fract(u.x * f32(K)) < 0.82 && 1.0 - u.y < keyVal(min(i, K - 1u)) * easeOut(ph * 5.0)) { c = keyCol(min(i, K - 1u)); }
  } else if (vz == 6u) { // waves: a lane each, its frequency its value
    let i = min(u32(floor(u.y * f32(K))), K - 1u);
    let lane = r.w / f32(K);
    let v = keyVal(i);
    let cyc = 2.0 + 10.0 * v;
    let ph2 = TAU * u.x * cyc - F.time * 5.0;
    let amp = lane * 0.4 * e;
    let y = r.y + (f32(i) + 0.5) * lane - amp * sin(ph2);
    let slope = amp * TAU * cyc / r.z * cos(ph2);
    let d = abs(p.y - y) / sqrt(1.0 + slope * slope);
    c = keyCol(i) * clamp(F.dpr * 2.0 - d, 0.0, 1.0);
  } else if (vz == 7u) { // rays: a sector per answer, as long as its value
    let a = fract(atan2(cp.y, cp.x) / TAU + 0.25);
    let i = min(u32(floor(a * f32(K))), K - 1u);
    let d = length(cp);
    if (d < (0.08 + 0.4 * keyVal(i)) * e) { c = keyCol(i); }
    c = max(c, WHITE * line((d - (0.08 + 0.4 * res)) * m));
  } else if (vz == 8u) { // bits: the answers as bytes, crossed with the word's own
    let g = floor(u * 8.0);
    let row = u32(g.y);
    let i = row % max(K, 1u);
    let byte = u32(keyVal(i) * 255.0) ^ wordByte(row);
    let bit = (byte >> (7u - u32(g.x))) & 1u;
    let f = fract(u * 8.0);
    if (bit == 1u && f.x > 0.06 && f.y > 0.06 && ph * 8.0 > g.y * 0.5) { c = keyCol(i); }
  } else if (vz == 9u) { // tiles: the mosaic the answers merged into (its tiles, as they landed in the square)
    let sq = square(L);
    for (var i = 0u; i < K; i++) {
      let tr = vec4f(r.xy + (R[i].xy - sq.xy) / sq.zw * r.zw, R[i].zw / sq.zw * r.zw);
      if (inRect(p, tr)) {
        c = keyCol(i);
        let h = min(tr.z, tr.w) * 0.12;
        c = mix(c, inkOn(c), number(p, tr.xy + vec2f(h * 0.5, tr.w - h * 1.5), h, keyVal(i), 0.0));
        let edge = min(min(p.x - tr.x, tr.x + tr.z - p.x), min(p.y - tr.y, tr.y + tr.w - p.y));
        c *= 1.0 - line(edge) * 0.6;
      }
    }
  } else { // disc: the result as one disc on the strongest answer's colour
    c = keyCol(0u);
    if (length(cp) < (0.12 + 0.3 * res) * e) { c = select(resultCol(), keyCol(1u), K > 1u); }
  }
  return c;
}

// ---------------------------------------------------------------- the frame
/** Linear colour → the canvas (sRGB). */
fn out(c: vec3f) -> vec4f {
  let x = clamp(c, vec3f(0.0), vec3f(1.0));
  return vec4f(select(1.055 * pow(x, vec3f(1.0 / 2.4)) - 0.055, x * 12.92, x <= vec3f(0.0031308)), 1.0);
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let L = lay();
  let p = fc.xy;
  if (F.mode > 2.5) { return vec4f(0.0, 0.0, 0.0, 1.0); }
  // ---- the room: the empty form in space, lit by the typing; waiting for the machine, its names flicker
  if (F.mode > 0.5) {
    let q = plane(p, 1.0);
    var c = WHITE * gridLines(q, L, 1.0) * (0.05 + 0.1 * F.charge + 0.2 * F.kick) * F.fade;
    let g = floor((q - L.org) / L.cs);
    if (g.x >= 0.0 && g.y >= 0.0 && g.x < COLS && g.y < ROWS && F.mode > 1.5) {
      let k = u32(g.x + g.y * COLS);
      if (k < N_DIMS) {
        let r = vec4f(L.org + g * L.cs, L.cs, L.cs);
        let on = step(0.5, h1(k * 31u + u32(F.time * 12.0)));
        c = max(c, WHITE * label(q, r.xy + 0.07 * L.cs, 0.075 * L.cs, f32(k), L.cs * 0.86) * 0.35 * on);
      }
    }
    return out(c);
  }
  // ---- a performance
  let t = F.lt;
  let nK = nKeys();
  let merge = D[3];
  let seq = D[4];
  let tilt = 1.0 - ease3(t / (D[2] - 0.1));
  let q = plane(p, tilt);
  var c = vec3f(0.0);
  // the lines: faint while it fills, pulsing with the beat once the result plays
  let sq = square(L);
  // the steps: the result, re-drawn on every beat (the step on screen comes from main.ts)
  if (t >= seq) {
    let r = select(sq, vec4f(0.0, 0.0, F.resX, F.resY), F.full > 0.5);
    if (inRect(q, r)) { return out(viz(u32(F.viz), q, r, F.stepU, L)); }
  }
  // the lines: faint while it fills, pulsing with the beat once the result plays
  var lines = 0.2;
  if (t >= seq) { lines = 0.14 + 0.3 * exp(-F.beatU * 6.0); }
  c = WHITE * gridLines(q, L, t / 0.35) * lines;

  if (t < merge) {
    // fill, mark, select: each cell in its place
    let g = floor((q - L.org) / L.cs);
    if (g.x >= 0.0 && g.y >= 0.0 && g.x < COLS && g.y < ROWS) {
      let k = u32(g.x + g.y * COLS);
      if (k < nCells()) {
        let x = cellDraw(k, q, cellRect(k, L), t);
        c = mix(c, x.rgb, x.a);
      }
    }
    return out(c);
  }
  // the marked cells leave a trace where they were (the pixel's own cell, if it was marked)
  let gc = floor((q - L.org) / L.cs);
  if (gc.x >= 0.0 && gc.y >= 0.0 && gc.x < COLS && gc.y < ROWS) {
    let k = u32(gc.x + gc.y * COLS);
    if (k < nCells() && cf(k, 5u) >= 0.0) {
      let r = cellRect(k, L);
      let edge = min(min(q.x - r.x, r.x + r.z - q.x), min(q.y - r.y, r.y + r.w - q.y));
      c = max(c, keyCol(u32(cf(k, 5u))) * line(edge) * 0.8);
    }
  }
  if (t < seq) {
    // merge: they slide together into the square, one after another (a marked cell is opaque: only the topmost
    // under the pixel is drawn)
    var hit = -1;
    var hr = vec4f(0.0);
    for (var j = 0u; j < nK; j++) {
      let i = nK - 1u - j;
      if (inRect(q, R[i])) { hit = i32(i); hr = R[i]; break; }
    }
    if (hit >= 0) {
      let x = cellDraw(keyCell(u32(hit)), q, hr, t);
      c = mix(c, x.rgb, x.a);
    }
  }
  return out(c);
}
