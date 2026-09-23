// DEPTH OF FIELD — the macro lens. The scene arrives with its circle of
// confusion (in pixels) in alpha; each pixel gathers the neighbours whose blur
// disc reaches it (scatter-as-gather on a golden-angle spiral), so bright grains
// out of focus open into soft bokeh discs and the focal plane stays razor sharp.

@group(0) @binding(0) var src: texture_2d<f32>;

const TAPS = 16;
const RMAX = 16.0;

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let dim = vec2i(textureDimensions(src));
  let p = vec2i(fc.xy);
  let c0 = textureLoad(src, p, 0);
  var acc = c0.rgb;
  var w = 1.0;
  for (var i = 1; i < TAPS; i++) {
    let r = sqrt(f32(i) / f32(TAPS)) * RMAX;
    let a = f32(i) * 2.39996323;
    let q = clamp(p + vec2i(round(vec2f(cos(a), sin(a)) * r)), vec2i(0), dim - 1);
    let s = textureLoad(src, q, 0);
    // a sample counts if its own blur disc reaches this pixel
    let k = ss(r - 1.0, r + 0.5, s.a);
    acc += s.rgb * k;
    w += k;
  }
  return vec4f(acc / w, 1.0);
}
