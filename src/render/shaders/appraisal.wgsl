// APPRAISAL — the machine reading the word, as raw data. Every mark is a real
// value from this word's tape (Jev's distributions, scores, confidences, the
// word's UTF-8 bytes, the typing rhythm). Monochrome, pixel-exact, one accent.
// Modes: 0 barcode · 1 numbers · 2 spectrum · 3 bits · 4 scatter · 5 line.

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var<storage, read> tape: array<f32>;
@group(0) @binding(2) var atlas: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;

const GLYPHS_PER_ROW = 16.0; // atlas row 0: 0-9 A-F · row 1: . - x : (16..19), blank (20)

fn tv(i: i32) -> f32 {
  let n = max(i32(F.tapeLen), 1);
  return tape[((i % n) + n) % n];
}

fn byteOf(i: i32) -> u32 { return u32(clamp(tv(i), 0.0, 1.0) * 255.0 + 0.5); }

fn ink() -> vec3f { return vec3f(F.baseR, F.baseG, F.baseB); }
fn acc() -> vec3f { return vec3f(F.accR, F.accG, F.accB); }

/** Glyph coverage for glyph index g at cell-local uv (0..1). */
fn glyph(g: f32, uv: vec2f) -> f32 {
  let col = g % GLYPHS_PER_ROW;
  let row = floor(g / GLYPHS_PER_ROW);
  let a = vec2f((col + uv.x) / GLYPHS_PER_ROW, (row + uv.y) / 2.0);
  return textureSampleLevel(atlas, samp, a, 0.0).a;
}

fn hexDigit(b: u32, hi: bool) -> f32 { return f32(select(b & 15u, (b >> 4u) & 15u, hi)); }

// ---------------------------------------------------------------- modes
fn barcode(px: vec2f, res: vec2f) -> vec3f {
  let w = F.dpr * (1.0 + floor(F.variant * 3.0));
  let speed = (300.0 + 2200.0 * F.s_arousal) * F.dpr * select(1.0, -1.0, F.variant > 0.5);
  let idx = i32(floor((px.x + F.lt * speed) / w));
  let bit = (byteOf(idx / 8) >> u32(idx % 8)) & 1u;
  let band = select(res.y, res.y * (0.18 + 0.2 * F.variant), fract(F.variant * 7.0) > 0.45);
  if (abs(px.y - res.y * 0.5) > band * 0.5) { return vec3f(0.0); }
  let hot = tv(idx / 8) > 0.93;
  return select(ink(), acc(), hot) * f32(bit);
}

fn numbers(px: vec2f, res: vec2f) -> vec3f {
  // sparse columns of raw figures, black between them (never a wall of text)
  let cw = 7.0 * F.dpr;
  let ch = 13.0 * F.dpr;
  let nG = 5.0 + floor(F.variant * 5.0);
  let x0 = res.x * 0.12;
  let spacing = res.x * 0.76 / nG;
  let group = floor((px.x - x0) / spacing);
  let lx = px.x - x0 - group * spacing;
  if (group < 0.0 || group >= nG || lx > cw * 7.0) { return vec3f(0.0); }
  let band = ss(0.06, 0.16, px.y / res.y) * ss(0.94, 0.84, px.y / res.y);
  if (band <= 0.0) { return vec3f(0.0); }
  let j = i32(floor(lx / cw));
  let gh = fract(sin(group * 12.9898 + F.variant * 78.233) * 43758.5453);
  let dir = select(1.0, -1.0, gh > 0.5);
  let scroll = F.lt * ch * (4.0 + 26.0 * gh) * (0.5 + F.s_arousal) * dir;
  let rowf = (px.y + scroll) / ch;
  let row = floor(rowf);
  let uv = vec2f(fract(lx / cw), fract(rowf));
  let k = i32(row) * 7 + i32(group) * 13 + i32(F.variant * 97.0);
  let v = tv(k);
  var g = 20.0; // blank cell
  if (gh < 0.3) {
    // hex bytes "E6 B5"
    let b0 = byteOf(k);
    let b1 = byteOf(k + 1);
    if (j == 0) { g = hexDigit(b0, true); } else if (j == 1) { g = hexDigit(b0, false); }
    else if (j == 3) { g = hexDigit(b1, true); } else if (j == 4) { g = hexDigit(b1, false); }
  } else {
    // "0.9731"
    let n = u32(clamp(v, 0.0, 0.99999) * 10000.0);
    if (j == 0) { g = select(0.0, 1.0, v >= 1.0); } else if (j == 1) { g = 16.0; }
    else if (j >= 2 && j <= 5) { g = f32((n / u32(pow(10.0, f32(5 - j)))) % 10u); }
  }
  if (g == 20.0) { return vec3f(0.0); }
  let a = glyph(g, uv);
  let lit = v > 0.96 || (row == floor(F.lt * 7.0 + gh * 40.0) % 50.0 && gh > 0.7);
  return select(ink(), acc(), lit) * a * band;
}

fn spectrum(px: vec2f, res: vec2f) -> vec3f {
  let s = 3.0 * F.dpr;
  let H = res.y * 0.72;
  let y = px.y - (res.y - H) * 0.5;
  if (y < 0.0 || y > H) { return vec3f(0.0); }
  let i = i32(floor(y / s));
  if (fract(y / s) > 1.0 / 3.0) { return vec3f(0.0); }
  let v = tv(i + i32(F.variant * 50.0));
  let reveal = ss(0.0, 0.6, F.u + f32(i) * 0.002);
  let L = v * res.x * 0.46 * reveal;
  let dx = select(abs(px.x - res.x * 0.5), px.x - res.x * 0.04, F.variant > 0.5);
  if (dx > L || dx < 0.0) { return vec3f(0.0); }
  return select(ink(), acc(), v > 0.9);
}

fn bits(px: vec2f, res: vec2f) -> vec3f {
  let cell = (5.0 + floor(F.variant * 4.0)) * F.dpr;
  let side = res.y * 0.78;
  let o = (res - vec2f(side)) * 0.5;
  let q = (px - o) / cell;
  if (q.x < 0.0 || q.y < 0.0 || q.x >= side / cell || q.y >= side / cell) { return vec3f(0.0); }
  let ci = vec2i(floor(q));
  let cols = i32(side / cell);
  if (f32(ci.y) / f32(cols) > F.u * 1.4) { return vec3f(0.0); }
  let bit = (byteOf(ci.y * (cols / 8) + ci.x / 8) >> u32(ci.x % 8)) & 1u;
  let inner = all(fract(q) > vec2f(0.12)) && all(fract(q) < vec2f(0.88));
  var on = f32(bit) * f32(inner);
  if (F.s_arousal > 0.7 && fract(F.lt * 11.0) < 0.12) { on = 1.0 - on; }
  return ink() * on * f32(inner);
}

fn scatter(px: vec2f, res: vec2f) -> vec3f {
  let side = res.y * 0.7;
  let o = (res - vec2f(side)) * 0.5;
  let q = px - o;
  var c = vec3f(0.0);
  // frame
  let e = min(min(q.x, q.y), min(side - q.x, side - q.y));
  if (abs(e) < F.dpr * 0.6) { c += ink() * 0.35; }
  let n = min(i32(F.tapeLen), 56);
  let shown = i32(F.u * 1.2 * f32(n));
  var last = vec2f(-1e4);
  // only pixels inside the plot need the points (the loop is per pixel)
  let inside = q.x > -2.0 * F.dpr && q.y > -2.0 * F.dpr && q.x < side + 2.0 * F.dpr && q.y < side + 2.0 * F.dpr;
  for (var i = 0; i < 56; i++) {
    if (!inside) { break; }
    if (i >= min(shown, n)) { break; }
    let pt = vec2f(tv(i), 1.0 - tv(i + 1)) * side;
    let dv = q - pt;
    let d2 = dot(dv, dv);
    if (d2 < 16.0 * F.dpr * F.dpr) { c += ink() * exp(-d2 / (1.6 * F.dpr * F.dpr)); }
    last = pt;
  }
  // crosshair on the latest reading
  if (abs(q.x - last.x) < F.dpr * 0.5 || abs(q.y - last.y) < F.dpr * 0.5) {
    if (q.x > 0.0 && q.y > 0.0 && q.x < side && q.y < side) { c += acc() * 0.8; }
  }
  return c;
}

fn line(px: vec2f, res: vec2f) -> vec3f {
  // one line through the word; it closes to a point: the verdict is reached
  let half = res.x * 0.5 * (1.0 - ss(0.25, 0.95, F.u));
  let d = abs(px.y - res.y * 0.5);
  if (abs(px.x - res.x * 0.5) > max(half, F.dpr)) { return vec3f(0.0); }
  return ink() * exp(-d * d / (0.5 * F.dpr * F.dpr)) * (1.0 + 2.0 * ss(0.8, 1.0, F.u));
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let res = vec2f(F.resX, F.resY);
  let px = fc.xy;
  let m = i32(F.mode);
  var c = vec3f(0.0);
  if (m == 0) { c = barcode(px, res); }
  else if (m == 1) { c = numbers(px, res); }
  else if (m == 2) { c = spectrum(px, res); }
  else if (m == 3) { c = bits(px, res); }
  else if (m == 4) { c = scatter(px, res); }
  else { c = line(px, res); }
  return vec4f(c * 1.4, 1.0);
}
