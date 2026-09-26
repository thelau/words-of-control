// Final image: scene light + bloom/halation → film-like per-channel shoulder →
// vignette → sRGB → luminance-dependent grain + triangular dither.
// `flash` whitens the frame for one beat; `invert` flips it (appraisal cuts).

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var scene: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var bloomTex: texture_2d<f32>;
@group(0) @binding(4) var sceneHi: texture_2d<f32>;

fn toSrgb(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(max(c, vec3f(0.0)), vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}

fn h1(p: vec2f, salt: u32) -> f32 {
  return f32(pcg((u32(p.x) * 1973u) ^ pcg(u32(p.y) * 9277u + salt))) / 4294967295.0;
}

const BG = vec3f(0.00304, 0.00243, 0.00182); // #0A0806, linear

// per-channel shoulder: bright light desaturates toward white; colour comes from each clip
fn film(c: vec3f) -> vec3f {
  let x = max(c, vec3f(0.0));
  let over = max(x - 1.2, vec3f(0.0));
  return clamp(1.0 - exp(-x) + vec3f(over.g * 0.03, over.r * 0.05 + over.b * 0.02, over.g * 0.03), vec3f(0.0), vec3f(1.0));
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let res = vec2f(F.outX, F.outY);
  let uv0 = fc.xy / res;
  // the frame: the performance lives in a square in the dark (the room fills the screen); below it, a faint
  // reflection on a black floor (after Ikeda's slab in the hall)
  let box = select(vec2f(1.0), vec2f(F.boxW, F.boxH), F.boxOn > 0.5);
  let centre = vec2f(0.5, select(0.5, 0.46, box.y < 0.99));
  var uv = (uv0 - centre) / box + 0.5;
  let inside = all(uv >= vec2f(0.0)) && all(uv <= vec2f(1.0));
  var refl = 0.0;
  if (!inside && uv.y > 1.0 && uv.x >= 0.0 && uv.x <= 1.0) {
    refl = 0.16 * exp(-(uv.y - 1.0) * 9.0);
    uv = vec2f(uv.x, 2.0 - uv.y);
  }
  var c = vec3f(0.0);
  if (inside || refl > 0.0) {
    // soft layers are rendered at CSS resolution and upscaled; the data stays native
    c = textureSampleLevel(scene, samp, uv, 0.0).rgb;
    if (F.hiRes > 0.5) { c = textureLoad(sceneHi, vec2i(uv * vec2f(textureDimensions(sceneHi))), 0).rgb; }
    // neutral bloom (small) + film halation: only the brightest light bleeds red into the emulsion
    if (F.bloom > 0.0 || F.halation > 0.0) {
      let bl = textureSampleLevel(bloomTex, samp, uv, 0.0).rgb;
      c += bl * F.bloom + max(bl - vec3f(0.35), vec3f(0.0)) * vec3f(1.0, 0.35, 0.15) * F.halation;
    }
    // (the reflection is soft: the floor is not a mirror)
    if (!inside) { c = textureSampleLevel(bloomTex, samp, uv, 0.0).rgb * 2.0 * refl + c * refl * 0.5; }
  }
  // the frame reads as an object even when it is dark: a surface barely lifted from the black, a hairline edge
  if (box.x < 0.99 && inside) {
    let px = (min(uv, 1.0 - uv)) * box * res;
    c += vec3f(0.0015) + vec3f(0.03) * ss(1.5, 0.0, min(px.x, px.y));
  }
  let q = uv0 - 0.5;
  c = c * vec3f(F.wbR, F.wbG, F.wbB) * F.exposure + vec3f(F.flash);
  let vig = mix(1.0 - 0.35 * pow(dot(q * vec2f(1.0, 1.25), q * vec2f(1.0, 1.25)) * 2.2, 1.3), 1.0, F.flat);
  var outc = toSrgb(BG * (1.0 - F.flat) + film(c) * vig);
  if (F.invert > 0.5) { outc = vec3f(0.93, 0.91, 0.88) - outc; }
  // film grain (24 fps, ~1.35 CSS px, strongest in the mid-tones) + dither against banding, one hash each
  let gf = u32(F.time * 24.0);
  let gp = fc.xy / (1.35 * F.outDpr);
  let g = h1(gp, gf) - 0.5;
  let l = dot(outc, vec3f(0.2126, 0.7152, 0.0722));
  outc += g * 1.4 * F.grain * (0.25 + 1.6 * l * (1.0 - l));
  let d = h1(fc.xy, 99u + gf) - 0.5;
  return vec4f(outc + d / 255.0, 1.0);
}
