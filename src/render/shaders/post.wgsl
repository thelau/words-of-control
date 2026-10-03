// THE MONITOR — the scene (grid + spaces, rendered to a float texture) seen on a worn video monitor: phosphor glow
// (taller than wide: light bleeds down the tube in streaks), the three guns a little out of register, chroma smeared
// along the line as on tape, fine scanlines, grain. One look for every phase; nothing in it flashes.
// Glow: the scene → a quarter-size copy (fs_down) → blurred across (fs_across) → blurred down, longer (fs_down_tube).

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
  return vec4f(c * smoothstep(0.05, 0.6, l), 1.0);
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
fn fs_down_tube(v: FsOut) -> @location(0) vec4f {
  let d = px(src);
  return vec4f(blur(v.pos.xy * d, vec2f(0.0, d.y * 3.5)), 1.0);
}

fn luma(c: vec3f) -> f32 { return dot(c, vec3f(0.299, 0.587, 0.114)); }

@fragment
fn fs_post(v: FsOut) -> @location(0) vec4f {
  let res = vec2f(F.resX, F.resY);
  let uv = v.pos.xy / res;
  let dp = F.dpr / res.x;
  // the guns out of register: red right, blue left, more towards the edges
  let mis = dp * (0.9 + 1.6 * abs(uv.x - 0.5));
  let r = textureSample(src, lin, uv + vec2f(mis, 0.0)).r;
  let g = textureSample(src, lin, uv).g;
  let b = textureSample(src, lin, uv - vec2f(mis, 0.0)).b;
  var c = vec3f(r, g, b);
  // tape: brightness sharp, colour smeared along the line (and trailing to the right)
  let ch = (textureSample(src, lin, uv - vec2f(dp * 2.5, 0.0)).rgb + textureSample(src, lin, uv - vec2f(dp * 6.5, 0.0)).rgb + c * 2.0) * 0.25;
  c = luma(c) + (ch - luma(ch)) * 1.15;
  // phosphor glow
  c += textureSample(glow, lin, uv).rgb * 1.1;
  // scanlines: two CSS pixels a line, the bright parts filling them in
  let line = 0.5 + 0.5 * cos(v.pos.y / F.dpr * 3.14159265);
  c *= mix(1.0, 0.8 + 0.2 * line, 1.0 - smoothstep(0.4, 1.0, luma(c)));
  // grain, and the tube's corners a little darker
  let n = f32(pcg(u32(v.pos.x) + u32(v.pos.y) * 4099u + pcg(u32(F.time * 60.0))) & 1023u) / 1023.0 - 0.5;
  c += n * 0.025;
  let e = uv - 0.5;
  c *= 1.0 - dot(e, e) * 0.35;
  return vec4f(max(c, vec3f(0.0)), 1.0);
}
