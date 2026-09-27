// MATRIX — the verdict as a score of pure data (show/matrix.ts): white on black, 1-pixel lines, digits only. Drawn
// at native resolution; F.variant2 = the section, F.secT / F.secU its clock (it runs on through the section's
// flicker). Every mark is a number of the reading.

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var<storage, read> tape: array<f32>;
@group(0) @binding(2) var atlas: texture_2d<f32>;
@group(0) @binding(3) var<storage, read> D: array<f32>; // matrix.ts pack()

const REF_MAX = 64u;
const GLYPHS_PER_ROW = 16.0;

fn tv(i: i32) -> f32 { let n = max(i32(F.tapeLen), 1); return tape[((i % n) + n) % n]; }
fn byteOf(i: i32) -> u32 { return u32(clamp(tv(i), 0.0, 1.0) * 255.0 + 0.5); }
fn nDims() -> u32 { return u32(D[0]); }
fn nRefs() -> u32 { return u32(D[1]); }
fn focus() -> u32 { return u32(D[2]); }
fn val(k: u32) -> f32 { return D[4u + k * 4u]; }
fn conf(k: u32) -> f32 { return D[5u + k * 4u]; }
fn pt(j: u32) -> vec3f { let o = 4u + nDims() * 4u + j * 4u; return vec3f(D[o], D[o + 1u], D[o + 2u]); } // j = 0: the word
fn refv(k: u32, j: u32) -> f32 { return D[4u + nDims() * 4u + (nRefs() + 1u) * 4u + k * REF_MAX + j]; }
fn doubt(k: u32) -> f32 { return clamp((0.75 - conf(k)) / 0.6, 0.0, 1.0); }
fn h1(p: vec2f) -> f32 { return f32(pcg((u32(p.x) * 1973u) ^ pcg(u32(p.y) * 9277u))) / 4294967295.0; }

/** Glyph coverage (atlas row 0: 0-9 A-F; row 1: . - x :), nearest: crisp. */
fn glyph(g: f32, uv: vec2f) -> f32 {
  let col = g % GLYPHS_PER_ROW;
  let row = floor(g / GLYPHS_PER_ROW);
  let dim = vec2f(textureDimensions(atlas));
  let a = vec2f((col + uv.x) / GLYPHS_PER_ROW, (row + uv.y) / 2.0) * dim;
  return textureLoad(atlas, vec2i(clamp(a, vec2f(0.0), dim - 1.0)), 0).a;
}
/** The i-th character of "0.xyz" for a value in 0..1 (5 characters). */
fn digitOf(v: f32, i: i32) -> f32 {
  if (i == 1) { return 16.0; }
  let n = i32(clamp(v, 0.0, 0.999) * 1000.0);
  if (i == 0) { return 0.0; }
  if (i == 2) { return f32(n / 100); }
  if (i == 3) { return f32((n / 10) % 10); }
  return f32(n % 10);
}

// ---------------------------------------------------------------- 0 scan: the reading as one bit stream
/** Bit b of the stream: the word's bytes, then every answer's value and confidence as bytes, then the references. */
fn bitAt(b: i32) -> f32 {
  let byte = b / 8;
  let nb = i32(F.byteLen);
  var v: u32;
  if (byte < nb) { v = byteOf(byte); }
  else {
    let k = u32(byte - nb);
    let n = nDims();
    if (k < n * 2u) { v = u32(select(val(k / 2u), conf(k / 2u), k % 2u == 1u) * 255.0); }
    else { let r = k - n * 2u; v = u32(refv(r / REF_MAX % n, r % REF_MAX) * 255.0); }
  }
  return f32((v >> u32(7 - b % 8)) & 1u);
}
fn scan(px: vec2f, res: vec2f) -> f32 {
  // four bands, each its own stretch of the stream, width and speed; the word's own bytes run in the first
  let band = floor(px.y / res.y * 4.0);
  let w = F.dpr * (1.0 + band);
  let speed = (900.0 + 2600.0 * F.s_arousal) * F.dpr * select(1.0, -1.0, band % 2.0 == 1.0) * (0.5 + 0.25 * band);
  let b = i32(floor((px.x + floor(F.secT * speed)) / w)) + i32(band) * 4096;
  let seam = step(fract(px.y / res.y * 4.0), 0.985);
  return bitAt(abs(b)) * seam;
}

// ---------------------------------------------------------------- 1 matrix: every value, in columns
/** A character cell: the columns fill the width exactly (43 answers × 7 characters). */
fn cellW() -> f32 { return floor(F.resX / (f32(nDims()) * 7.0)); }
fn cellH() -> f32 { return floor(cellW() * 1.8); }
/** The matrix at point p (px of a virtual sheet): column k = answer k (5 characters + 2 blank), row j = reference
 *  word j, row nRefs = the word itself (brightest); it scrolls vertically, each column at its own speed. */
fn sheet(p: vec2f, scroll: bool) -> f32 {
  let cw = cellW(); let ch = cellH();
  let colW = cw * 7.0;
  let k = u32(floor(p.x / colW));
  if (k >= nDims()) { return 0.0; }
  let lx = p.x - f32(k) * colW;
  let ci = i32(floor(lx / cw));
  if (ci > 4) { return 0.0; }
  let rows = f32(nRefs() + 1u);
  let sp = select(0.0, floor(F.secT * ch * (2.0 + 9.0 * fract(f32(k) * 0.618)) * select(1.0, -1.0, k % 2u == 1u)), scroll);
  let rowf = (p.y + sp) / ch;
  let r = u32(((i32(floor(rowf)) % i32(rows)) + i32(rows)) % i32(rows));
  let uv = vec2f(fract(lx / cw), fract(rowf));
  let me = r == nRefs();
  let v = select(refv(k, r), val(k), me);
  let g = glyph(digitOf(v, ci), vec2f(uv.x * 1.15 - 0.07, uv.y));
  // the word's own values burn; a column the machine is unsure of flickers
  let fl = select(1.0, step(0.35 * doubt(k), h1(vec2f(f32(k), floor(F.time * 24.0)))), doubt(k) > 0.05);
  return g * select(0.55, 1.0, me) * fl;
}

// ---------------------------------------------------------------- 2 zoom: into the number that sets it apart
fn zoom(px: vec2f, res: vec2f) -> f32 {
  let k = focus();
  // the focus cell: column k, the word's row (at scroll 0)
  let cell = vec2f((f32(k) * 7.0 + 2.5) * cellW(), (f32(nRefs()) + 0.5) * cellH());
  let s = exp(F.secU * F.secU * 6.5); // 1 → ~665×
  let p = cell + (px - res * 0.5) / s;
  var c = sheet(p, false);
  // the readout of where we are (corner, native size)
  if (px.x < 30.0 * cellW() && px.y > res.y - cellH() * 2.0) {
    let ci = i32(floor(px.x / cellW()));
    let uv = vec2f(fract(px.x / cellW()), fract((px.y - (res.y - cellH() * 2.0)) / cellH()));
    let n = i32(s);
    var g = 20.0;
    if (ci == 0) { g = 18.0; } // x
    else if (ci >= 1 && ci <= 4) { g = f32((n / i32(pow(10.0, f32(4 - ci)))) % 10); }
    c = max(c, glyph(g, uv) * 0.8);
  }
  return c;
}

// ---------------------------------------------------------------- 3 signal: sine for the sure, noise for the doubtful
fn signal(px: vec2f, res: vec2f) -> f32 {
  let n = f32(nDims());
  let bh = res.y / n;
  let k = u32(min(floor(px.y / bh), n - 1.0));
  let ly = (px.y - f32(k) * bh) / bh - 0.5; // −0.5..0.5 within the band
  let v = val(k);
  let d = doubt(k);
  // the trace: a sine, as many cycles across the screen as the value says, travelling; its amplitude the value
  let cyc = 2.0 + 38.0 * v;
  let x = px.x / res.x;
  let y = 0.38 * (0.25 + 0.75 * v) * sin((x * cyc - F.secT * (0.5 + v)) * TAU);
  let dist = abs(ly - y) * bh;
  let line = (1.0 - smoothstep(0.5 * F.dpr, 1.2 * F.dpr, dist)) * (1.0 - d);
  // noise: dots, as dense as the doubt, redrawn every frame
  let noise = step(1.0 - d * 0.55, h1(floor(px / F.dpr) + vec2f(floor(F.time * 60.0) * 17.0, 0.0))) * step(abs(ly), 0.44);
  // the playhead sweeping the bands, top to bottom: the band it is on is lit
  let head = F.secU * n;
  let on = 1.0 - smoothstep(0.0, 1.0, abs(f32(k) + 0.5 - head));
  let seam = step(F.dpr, (ly + 0.5) * bh); // (a pixel of black between bands)
  return max(line, noise * 0.8) * (0.45 + 0.55 * on) * seam + step(abs(px.y - head * bh), 0.5 * F.dpr) * 0.7;
}

// ---------------------------------------------------------------- 4 field: the words as points in space
fn field(px: vec2f, res: vec2f) -> f32 {
  let a = F.secT * mix(0.6, 1.6, F.s_arousal);
  let ca = cos(a); let sa = sin(a);
  let cb = cos(0.45); let sb = sin(0.45);
  let sc = res.y * 0.62;
  var c = 0.0;
  // the cube the space lives in: its twelve edges, 1 px, faint
  for (var e = 0u; e < 12u; e++) {
    let axis = e / 4u;
    let bitsA = e % 4u;
    var a0 = vec3f(-0.5);
    var a1 = vec3f(-0.5);
    let o1 = select(-0.5, 0.5, (bitsA & 1u) == 1u);
    let o2 = select(-0.5, 0.5, (bitsA & 2u) == 2u);
    if (axis == 0u) { a0 = vec3f(-0.5, o1, o2); a1 = vec3f(0.5, o1, o2); }
    else if (axis == 1u) { a0 = vec3f(o1, -0.5, o2); a1 = vec3f(o1, 0.5, o2); }
    else { a0 = vec3f(o1, o2, -0.5); a1 = vec3f(o1, o2, 0.5); }
    let p0 = scr(a0, ca, sa, cb, sb, sc, res);
    let p1 = scr(a1, ca, sa, cb, sb, sc, res);
    let pa = px - p0; let ba = p1 - p0;
    let hh = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    c = max(c, 0.22 * (1.0 - smoothstep(0.4 * F.dpr, 1.0 * F.dpr, length(pa - ba * hh))));
  }
  // (points are few: each pixel tests them all)
  for (var j = 0u; j <= nRefs(); j++) {
    let s = scr(pt(j) - vec3f(0.5), ca, sa, cb, sb, sc, res);
    let dd = length(px - s);
    if (j == 0u) {
      // the word: a hard point, and its crosshair across the whole screen
      c = max(c, 1.0 - smoothstep(3.0 * F.dpr, 4.0 * F.dpr, dd));
      c = max(c, 0.5 * max(step(abs(px.x - s.x), 0.5 * F.dpr), step(abs(px.y - s.y), 0.5 * F.dpr)));
    } else {
      c = max(c, 0.75 * (1.0 - smoothstep(1.0 * F.dpr, 1.8 * F.dpr, dd)));
    }
  }
  return c;
}
/** A point of the field (centred on 0) on the screen: turned by a (cos, sin), tilted by b, in perspective. */
fn scr(q: vec3f, ca: f32, sa: f32, cb: f32, sb: f32, sc: f32, res: vec2f) -> vec2f {
  let r = vec3f(q.x * ca + q.z * sa, q.y, -q.x * sa + q.z * ca);
  return vec2f(r.x, r.y * cb - r.z * sb) * vec2f(1.0, -1.0) * sc * (1.6 / (2.2 + r.z)) + res * 0.5;
}

// ---------------------------------------------------------------- 5 end: every band into one line, one sine
fn end(px: vec2f, res: vec2f) -> f32 {
  let n = f32(nDims());
  let t = smoothstep(0.0, 0.7, F.secU);
  let k = u32(clamp(floor(px.x / res.x * n), 0.0, n - 1.0));
  // the answers as vertical lines (a spectrum), shrinking into the centre line
  let x0 = (f32(k) + 0.5) / n * res.x;
  let hgt = val(k) * res.y * 0.4 * (1.0 - t);
  let bar = step(abs(px.x - x0), 0.5 * F.dpr) * step(abs(px.y - res.y * 0.5), hgt);
  let v = val(focus());
  let y = res.y * 0.5 + res.y * 0.12 * t * (1.0 - smoothstep(0.75, 1.0, F.secU)) * sin(px.x / res.x * (2.0 + 38.0 * v) * TAU - F.secT * 3.0);
  let line = (1.0 - smoothstep(0.5 * F.dpr, 1.2 * F.dpr, abs(px.y - y))) * t;
  return max(bar, line) * (1.0 - smoothstep(0.9, 1.0, F.secU));
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let res = vec2f(F.resX, F.resY);
  let px = fc.xy;
  let s = i32(F.variant2 + 0.5);
  var c = 0.0;
  if (s == 0) { c = scan(px, res); }
  else if (s == 1) { c = sheet(px, true); }
  else if (s == 2) { c = zoom(px, res); }
  else if (s == 3) { c = signal(px, res); }
  else if (s == 4) { c = field(px, res); }
  else { c = end(px, res); }
  return vec4f(vec3f(0.95, 0.94, 0.92) * c, 1.0);
}
