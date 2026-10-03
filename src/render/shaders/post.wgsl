// THE MONITOR — the scene (grid + spaces, linear light in a float texture) seen as light on dark glass: what is bright
// blooms a little (halation), highlights roll off softly instead of
// clipping where lines and points add up, the glass a touch darker at its corners; then to the screen (sRGB).
// Glow: the scene → a quarter-size copy of what is bright (fs_down) → blurred across (fs_across) → blurred down
// (fs_vertical).

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var lin: sampler;
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var glow: texture_2d<f32>;

fn px(t: texture_2d<f32>) -> vec2f { return 1.0 / vec2f(textureDimensions(t)); }

// the quarter-size copy: a 4 × 4 box (four bilinear taps), the light that is bright enough to bloom
@fragment
fn fs_down(v: FsOut) -> @location(0) vec4f {
  let d = px(src);
  let uv = v.pos.xy * d * 4.0;
  let c = (textureSample(src, lin, uv + d * vec2f(-1, -1)).rgb + textureSample(src, lin, uv + d * vec2f(1, -1)).rgb
         + textureSample(src, lin, uv + d * vec2f(-1, 1)).rgb + textureSample(src, lin, uv + d * vec2f(1, 1)).rgb) * 0.25;
  let l = max(c.r, max(c.g, c.b));
  return vec4f(c * smoothstep(0.15, 0.8, l), 1.0);
}

// a 9-tap gaussian along `dir` (in texels), with linear-sampling offsets
fn blur(uv: vec2f, dir: vec2f) -> vec3f {
  let o = array<f32, 3>(1.3846, 3.2308, 0.0);
  let w = array<f32, 3>(0.3162, 0.0703, 0.2270);
  var c = textureSample(src, lin, uv).rgb * w[2];
  for (var i = 0; i < 2; i++) {
    c += (textureSample(src, lin, uv + dir * o[i]).rgb + textureSample(src, lin, uv - dir * o[i]).rgb) * w[i];
  }
  return c;
}

@fragment
fn fs_across(v: FsOut) -> @location(0) vec4f {
  let d = px(src);
  return vec4f(blur(v.pos.xy * d, vec2f(d.x * 1.5, 0.0)), 1.0);
}

@fragment
fn fs_vertical(v: FsOut) -> @location(0) vec4f {
  let d = px(src);
  return vec4f(blur(v.pos.xy * d, vec2f(0.0, d.y * 1.6)), 1.0);
}

/** Highlights roll off: unchanged up to the knee, then approaching white without ever clipping hard. */
fn roll(c: vec3f) -> vec3f {
  let k = 0.65;
  return select(c, k + (1.0 - k) * (1.0 - exp(-(c - k) / (1.0 - k))), c > vec3f(k));
}

@fragment
fn fs_post(v: FsOut) -> @location(0) vec4f {
  let uv = v.pos.xy / vec2f(F.resX, F.resY);
  var c = textureSample(src, lin, uv).rgb + textureSample(glow, lin, uv).rgb * 0.3;
  let e = uv - 0.5;
  c = roll(c * (1.0 - dot(e, e) * 0.25));
  let n = f32(pcg(u32(v.pos.x) + u32(v.pos.y) * 4099u + pcg(u32(F.time * 60.0))) & 1023u) / 1023.0 - 0.5;
  let x = clamp(c, vec3f(0.0), vec3f(1.0));
  let s = select(1.055 * pow(x, vec3f(1.0 / 2.4)) - 0.055, x * 12.92, x <= vec3f(0.0031308));
  return vec4f(s + n * 0.006, 1.0);
}
