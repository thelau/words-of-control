// GRID — the piece's 2D layer in one pass (show/grid.ts): the room is one line, the drone's own waveform, under the
// word, swelling with the typing (F.mode 1; waiting for the machine, 2, it holds); a performance (F.mode 0, clock F.lt) fills it, marks the cells that matter in the
// word's colours, clears the rest, then cuts to the steps: the marked cells merged on the stage, or a black window
// (a 3D space is drawn there, space.wgsl; the last step's words are DOM text). Native resolution; linear → sRGB (out()).

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var glyphs: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> D: array<f32>; // grid.ts pack()
@group(0) @binding(3) var labels: texture_2d<f32>;
@group(0) @binding(4) var glyphsBig: texture_2d<f32>; // the same digits, three times the size
@group(0) @binding(5) var<storage, read> wave: array<f32, 256>; // the drone's waveform (audio/drone.ts wave())

const CELL = 28u;
const KEY_MAX = 8u;
const COLS = 9.0;
const ROWS = 5.0;
const LABEL_W = 512.0; // label atlas slot (gpu.ts makeLabelAtlas)
const LABEL_H = 48.0;
const LABEL_PER_ROW = 4.0;
const WHITE = vec3f(0.93, 0.92, 0.9);

fn nCells() -> u32 { return u32(D[0]); }
fn nKeys() -> u32 { return u32(D[1]); }
fn cf(k: u32, i: u32) -> f32 { return D[16u + k * CELL + i]; }
fn prob(k: u32, o: u32) -> f32 { return D[16u + k * CELL + 12u + o]; }
fn k0() -> u32 { return 16u + nCells() * CELL; }
const KEY = 12u;
fn keyCell(i: u32) -> u32 { return u32(D[k0() + i * KEY]); }
fn keyVal(i: u32) -> f32 { return D[k0() + i * KEY + 1u]; }
fn keyCol(i: u32) -> vec3f { let o = k0() + i * KEY; return vec3f(D[o + 2u], D[o + 3u], D[o + 4u]); }
/** Key i's tile on the stage (a unit rect, grid.ts tiles()). */
fn keyTile(i: u32) -> vec4f { let o = k0() + i * KEY + 5u; return vec4f(D[o], D[o + 1u], D[o + 2u], D[o + 3u]); }
fn b0() -> u32 { return k0() + KEY_MAX * KEY; }
/** The word's own bytes (after the keys: their count, then one each). */
fn wordByte(i: u32) -> u32 { let n = max(u32(D[b0()]), 1u); return u32(D[b0() + 1u + i % n]); }

fn h2(p: vec2f, salt: u32) -> f32 { return f32(pcg((u32(p.x) * 1973u) ^ pcg(u32(p.y) * 9277u + salt))) / 4294967295.0; }
fn h1(i: u32) -> f32 { return f32(pcg(i * 747796405u + 2891336453u)) / 4294967295.0; }
fn lum(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }
/** Ink on a colour: near-black on a light one, white on a dark one. */
fn inkOn(c: vec3f) -> vec3f { return select(WHITE, vec3f(0.02), lum(c) > 0.3); }
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
fn glyph(g: f32, uv: vec2f, big: bool) -> f32 {
  let a = (vec2f(g % 16.0, floor(g / 16.0)) + clamp(uv, vec2f(0.0), vec2f(1.0))) * vec2f(40.0, 60.0);
  if (big) { return bilinear(glyphsBig, a * 3.0); }
  return bilinear(glyphs, a);
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
// ---------------------------------------------------------------- the grid's lines
fn gridLines(q: vec2f, L: Lay) -> f32 {
  let g = (q - L.org) / L.cs;
  if (g.x < -0.02 || g.y < -0.02 || g.x > COLS + 0.02 || g.y > ROWS + 0.02) { return 0.0; }
  return line(min(abs(g.x - round(g.x)), abs(g.y - round(g.y))) * L.cs);
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
  let th = select(0.075, 0.1, key >= 0.0 && t >= markAt) * m; // (a marked cell's words grow: read from further)
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

// ---------------------------------------------------------------- the marked cells, merged on the stage
/** The step in rect r: the marked cells merged (a tile each, its name and value) when `tiles`; else a black window. */
fn viz(tiles: bool, p: vec2f, r: vec4f) -> vec3f {
  var c = vec3f(0.0);
  if (tiles) {
    for (var i = 0u; i < nKeys(); i++) {
      let u = keyTile(i);
      let tr = vec4f(r.xy + u.xy * r.zw, u.zw * r.zw);
      if (inRect(p, tr)) {
        c = keyCol(i);
        let h = min(tr.z, tr.w) * 0.12;
        let pad = h * 0.5;
        let ink = max(number(p, tr.xy + vec2f(pad, tr.w - h * 1.5), h, keyVal(i), 0.0),
          label(p, tr.xy + pad, h * 0.6, cf(keyCell(i), 6u), tr.z - 2.0 * pad) * 0.8);
        let opt = cf(keyCell(i), 7u);
        c = mix(c, inkOn(c), select(ink, max(ink, label(p, tr.xy + vec2f(pad, pad + h * 0.8), h * 0.6, opt, tr.z - 2.0 * pad)), opt >= 0.0));
        let edge = min(min(p.x - tr.x, tr.x + tr.z - p.x), min(p.y - tr.y, tr.y + tr.w - p.y));
        c *= 1.0 - line(edge) * 0.6;
      }
    }
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
  // ---- the room: the drone as one line across the screen, below the word; typing swells it, a key kicks it
  if (F.mode > 0.5) {
    let x = p.x / F.resX * 255.0;
    let i = u32(clamp(floor(x), 0.0, 254.0));
    let v = mix(wave[i], wave[i + 1u], fract(x));
    let amp = F.resY * 0.05 * (0.35 + 0.65 * F.charge + 0.6 * F.kick);
    let y = F.resY * 0.68 - v * amp;
    let slope = (wave[i + 1u] - wave[i]) * amp / (F.resX / 255.0);
    let c = WHITE * line((p.y - y) / sqrt(1.0 + slope * slope)) * (0.3 + 0.3 * F.charge) * F.fade;
    return out(c);
  }
  // ---- a performance
  let t = F.lt;
  let seq = D[2];
  let g = floor((p - L.org) / L.cs);
  let inGrid = g.x >= 0.0 && g.y >= 0.0 && g.x < COLS && g.y < ROWS;
  let k = u32(g.x + g.y * COLS);
  if (t < seq) {
    // fill, mark, clear: each cell in its place
    var c = WHITE * gridLines(p, L) * 0.2;
    if (inGrid && k < nCells()) {
      let x = cellDraw(k, p, cellRect(k, L), t);
      c = mix(c, x.rgb, x.a);
    }
    return out(c);
  }
  // the steps: the step on screen comes from main.ts; a strobe frame is pale grey
  if (t >= seq && F.flash > 0.5) { return out(WHITE * 0.55); }
  let r = select(stage(L), vec4f(0.0, 0.0, F.resX, F.resY), F.full > 0.5);
  if (inRect(p, r)) { return out(viz(F.viz < 0.5, p, r)); }
  // around it the grid, pulsing with the beat, and a trace of each marked cell where it was
  var c = WHITE * gridLines(p, L) * (0.12 + 0.3 * exp(-F.beatU * 6.0));
  if (inGrid && k < nCells() && cf(k, 5u) >= 0.0) {
    let cr = cellRect(k, L);
    let edge = min(min(p.x - cr.x, cr.x + cr.z - p.x), min(p.y - cr.y, cr.y + cr.w - p.y));
    c = max(c, keyCol(u32(cf(k, 5u))) * line(edge) * 0.8);
  }
  return out(c);
}
