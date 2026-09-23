// Physically-flavoured bloom: 13-tap downsample chain (Karis average on the
// first level to tame fireflies), 3×3 tent upsample, additive.

struct BloomPass {
  texel: vec2f,   // 1 / source size
  radius: f32,    // upsample tent radius (in source texels)
  karis: f32,     // 1 on the first downsample
};

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> B: BloomPass;

struct V { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> V {
  let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  var o: V;
  o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0);
  o.uv = vec2f(p.x, 1.0 - p.y);
  return o;
}

fn s(uv: vec2f) -> vec3f { return textureSampleLevel(src, samp, uv, 0.0).rgb; }
fn luma(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }
fn kw(c: vec3f) -> f32 { return 1.0 / (1.0 + luma(c)); }

@fragment
fn fs_down(i: V) -> @location(0) vec4f {
  let t = B.texel;
  let a = s(i.uv + t * vec2f(-2.0, 2.0)); let b = s(i.uv + t * vec2f(0.0, 2.0)); let c = s(i.uv + t * vec2f(2.0, 2.0));
  let d = s(i.uv + t * vec2f(-2.0, 0.0)); let e = s(i.uv);                     let f = s(i.uv + t * vec2f(2.0, 0.0));
  let g = s(i.uv + t * vec2f(-2.0, -2.0)); let h = s(i.uv + t * vec2f(0.0, -2.0)); let k = s(i.uv + t * vec2f(2.0, -2.0));
  let j = s(i.uv + t * vec2f(-1.0, 1.0)); let l = s(i.uv + t * vec2f(1.0, 1.0));
  let m = s(i.uv + t * vec2f(-1.0, -1.0)); let n = s(i.uv + t * vec2f(1.0, -1.0));
  if (B.karis > 0.5) {
    // Karis average per 2×2 group: suppresses single-pixel fireflies
    let g0 = (a + b + d + e) * 0.25; let g1 = (b + c + e + f) * 0.25;
    let g2 = (d + e + g + h) * 0.25; let g3 = (e + f + h + k) * 0.25;
    let g4 = (j + l + m + n) * 0.25;
    let w0 = kw(g0) * 0.125; let w1 = kw(g1) * 0.125; let w2 = kw(g2) * 0.125; let w3 = kw(g3) * 0.125; let w4 = kw(g4) * 0.5;
    return vec4f((g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4), 1.0);
  }
  var o = e * 0.125;
  o += (a + c + g + k) * 0.03125;
  o += (b + d + f + h) * 0.0625;
  o += (j + l + m + n) * 0.125;
  return vec4f(o, 1.0);
}

@fragment
fn fs_up(i: V) -> @location(0) vec4f {
  let t = B.texel * B.radius;
  var o = s(i.uv) * 4.0;
  o += (s(i.uv + vec2f(-t.x, 0.0)) + s(i.uv + vec2f(t.x, 0.0)) + s(i.uv + vec2f(0.0, -t.y)) + s(i.uv + vec2f(0.0, t.y))) * 2.0;
  o += s(i.uv + vec2f(-t.x, -t.y)) + s(i.uv + vec2f(t.x, -t.y)) + s(i.uv + vec2f(-t.x, t.y)) + s(i.uv + vec2f(t.x, t.y));
  return vec4f(o / 16.0, 1.0);
}
