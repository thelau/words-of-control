// APPRAISAL — the machine reading the word, as raw data. Every mark is a real
// value from this word's tape (Jev's distributions, scores, confidences, the
// word's UTF-8 bytes, the typing rhythm). Monochrome, pixel-exact, one accent.
// Modes: 0 barcode · 1 numbers · 2 spectrum · 3 bits · 4 scatter · 5 line · 6 word.

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var<storage, read> tape: array<f32>;
@group(0) @binding(2) var atlas: texture_2d<f32>;
@group(0) @binding(4) var wordTex: texture_2d<f32>; // the typed word, drawn once per performance

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
  let dim = vec2f(textureDimensions(atlas));
  let a = vec2f((col + uv.x) / GLYPHS_PER_ROW, (row + uv.y) / 2.0) * dim;
  return textureLoad(atlas, vec2i(clamp(a, vec2f(0.0), dim - 1.0)), 0).a; // nearest: crisp figures
}

fn hexDigit(b: u32, hi: bool) -> f32 { return f32(select(b & 15u, (b >> 4u) & 15u, hi)); }

// ---------------------------------------------------------------- modes
fn barcode(px: vec2f, res: vec2f) -> vec3f {
  // four styles of the same reading (the bits of the tape, scrolling), chosen per cut:
  // 0 full-height bars · 1 stacked bands, each its own stretch of tape and speed ·
  // 2 horizontal rows falling · 3 bars whose width is the value, mirrored from the centre
  let style = u32(fract(F.variant * 13.7) * 4.0);
  let w = F.dpr * (1.0 + floor(F.variant * 3.0));
  var speed = (300.0 + 2200.0 * F.s_arousal) * F.dpr * select(1.0, -1.0, F.variant > 0.5);
  if (style == 1u) {
    let bands = 3.0 + floor(F.s_density * 5.0);
    let b = floor(px.y / res.y * bands);
    if (fract(px.y / res.y * bands) > 0.86) { return vec3f(0.0); } // a black seam between bands
    let bs = fract(sin(b * 12.9898 + F.variant * 7.0) * 43758.5453);
    speed *= (0.3 + 1.7 * bs) * select(1.0, -1.0, bs > 0.5);
    let wb = F.dpr * (1.0 + floor(bs * 4.0));
    let idx = i32(floor((px.x + F.lt * speed) / wb)) + i32(b * 97.0);
    let bit = (byteOf(idx / 8) >> u32(idx % 8)) & 1u;
    return select(ink(), acc(), tv(idx / 8) > 0.93) * f32(bit);
  }
  if (style == 2u) {
    let idx = i32(floor((px.y + F.lt * speed * 0.35) / w));
    let bit = (byteOf(idx / 8) >> u32(idx % 8)) & 1u;
    let side = res.x * (0.2 + 0.25 * F.s_scale);
    if (abs(px.x - res.x * 0.5) > side) { return vec3f(0.0); }
    return select(ink(), acc(), tv(idx / 8) > 0.93) * f32(bit);
  }
  if (style == 3u) {
    // bars as wide as their value: a byte of 255 is a slab, a byte of 3 a hairline
    let x = abs(px.x - res.x * 0.5) + F.lt * speed * 0.2;
    var pos = 0.0;
    var k = i32(F.variant * 50.0);
    var on = 0.0;
    for (var j = 0; j < 48; j++) {
      let wv = (1.0 + tv(k) * 14.0) * F.dpr;
      if (x < pos + wv) { on = f32(j % 2 == 0); break; }
      pos += wv;
      k++;
    }
    let band = res.y * (0.3 + 0.5 * F.s_intensity);
    if (abs(px.y - res.y * 0.5) > band * 0.5) { return vec3f(0.0); }
    return select(ink(), acc(), tv(k) > 0.9) * on;
  }
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
  // whole-pixel scroll: figures stay crisp
  let scroll = floor(F.lt * ch * (4.0 + 26.0 * gh) * (0.5 + F.s_arousal) * dir / F.dpr) * F.dpr;
  let rowf = (px.y + scroll) / ch;
  let row = floor(rowf);
  let uv = vec2f(fract(lx / cw), fract(rowf));
  // every value appears once: column-major over the tape, black past its end
  let rows = ceil(F.tapeLen / nG);
  let rr = row - floor(row / (rows + 6.0)) * (rows + 6.0);
  let k = i32(group * rows + rr);
  if (rr >= rows || f32(k) >= F.tapeLen) { return vec3f(0.0); }
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
  // a return map: each value against the next, joined in order, drawn progressively
  let side = res.y * 0.7;
  let o = (res - vec2f(side)) * 0.5;
  let q = px - o;
  var c = vec3f(0.0);
  let inside = q.x > -2.0 * F.dpr && q.y > -2.0 * F.dpr && q.x < side + 2.0 * F.dpr && q.y < side + 2.0 * F.dpr;
  if (!inside) { return c; }
  let n = min(i32(F.tapeLen) - 1, 30);
  let shown = i32((0.35 + F.u) * f32(n)); // already part-drawn when the cut lands
  var prevPt = vec2f(tv(0), 1.0 - tv(1)) * side;
  for (var i = 1; i < 30; i++) {
    if (i >= min(shown, n)) { break; }
    let pt = vec2f(tv(i), 1.0 - tv(i + 1)) * side;
    // most segments are far from this pixel: a bounding-box test skips them
    let lo = min(pt, prevPt) - vec2f(3.0 * F.dpr);
    let hi = max(pt, prevPt) + vec2f(3.0 * F.dpr);
    if (any(q < lo) || any(q > hi)) { prevPt = pt; continue; }
    let dv = q - pt;
    let d2 = dot(dv, dv);
    if (d2 < 9.0 * F.dpr * F.dpr) { c += ink() * exp(-d2 / (0.8 * F.dpr * F.dpr)); }
    // the thin line from the previous reading
    let pa = q - prevPt;
    let ba = pt - prevPt;
    let dl = length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0));
    if (dl < F.dpr) { c += ink() * 0.28 * (1.0 - dl / F.dpr); }
    prevPt = pt;
  }
  // the crosshair on the newest reading
  let last = max(min(shown, n) - 1, 0);
  let lp = vec2f(tv(last), 1.0 - tv(last + 1)) * side;
  if (last > 0 && (abs(q.x - lp.x) < F.dpr * 0.5 || abs(q.y - lp.y) < F.dpr * 0.5)) { c += acc() * 0.7; }
  return c;
}

fn line(px: vec2f, res: vec2f) -> vec3f {
  // one line through the word; it closes to a point: the verdict is reached. A question's line (variant 0)
  // never closes: it hangs, trembling, and the verdict begins unresolved
  let open = F.variant < 0.5;
  let half = res.x * 0.5 * select(1.0 - ss(0.25, 0.95, F.u), 0.42 + 0.02 * sin(F.lt * 23.0), open);
  let d = abs(px.y - res.y * 0.5);
  if (abs(px.x - res.x * 0.5) > max(half, F.dpr)) { return vec3f(0.0); }
  return ink() * exp(-d * d / (0.5 * F.dpr * F.dpr)) * (1.0 + 2.0 * ss(0.8, 1.0, F.u) * select(1.0, 0.0, open));
}

fn word(px: vec2f, res: vec2f) -> vec3f {
  // the typed word, as drawn once per performance, then its UTF-8 bytes in hex beneath. Opening (variant 0):
  // large, at the centre, held long enough to be read. The signature (variant 2): small, at the same centre
  // (the performance closes where it began, where the cursor returns), the bytes complete and the
  // performance's number after them — every recording carries its own caption
  let sig = F.variant > 1.5;
  let dim = vec2f(textureDimensions(wordTex));
  let h = res.y * select(0.11, 0.03, sig);
  let w = h * dim.x / dim.y;
  let o = vec2f((res.x - w) * 0.5, res.y * 0.5 - h * 0.62);
  let uv = (px - o) / vec2f(w, h);
  var c = vec3f(0.0);
  if (all(uv >= vec2f(0.0)) && all(uv < vec2f(1.0))) { c += ink() * textureLoad(wordTex, vec2i(uv * dim), 0).a; }
  // bytes: "E6 B5 B7 …", appearing one by one (all at once in the signature)
  let cw = 8.0 * F.dpr;
  let chh = 14.0 * F.dpr;
  let nb = F.byteLen;
  // (the signature's row also carries the number: 4 digits after a space)
  let rowW = (nb * 3.0 + select(0.0, 5.0, sig)) * cw;
  let bo = vec2f((res.x - rowW) * 0.5, res.y * 0.5 + h * select(0.62, 0.9, sig));
  let bq = (px - bo) / vec2f(cw, chh);
  if (bq.y >= 0.0 && bq.y < 1.0 && bq.x >= 0.0 && bq.x < nb * 3.0) {
    let bi = i32(floor(bq.x / 3.0));
    let j = i32(floor(bq.x)) % 3;
    if (j < 2 && (sig || f32(bi) < F.u * 1.3 * nb)) {
      let b = byteOf(bi);
      c += acc() * glyph(hexDigit(b, j == 0), fract(bq));
    }
  }
  if (sig) {
    // the number: four digits after the bytes
    let so = bo + vec2f((nb * 3.0 + 1.0) * cw, 0.0);
    let sq = (px - so) / vec2f(cw, chh);
    if (sq.y >= 0.0 && sq.y < 1.0 && sq.x >= 0.0 && sq.x < 4.0) {
      let k = 3 - i32(floor(sq.x));
      let dgt = (u32(F.serial) / u32(pow(10.0, f32(k)))) % 10u;
      c += ink() * 0.7 * glyph(f32(dgt), fract(sq));
    }
  }
  return c;
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
  else if (m == 5) { c = line(px, res); }
  else { c = word(px, res); }
  return vec4f(c * 1.4, 1.0);
}
