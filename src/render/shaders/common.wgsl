const TAU: f32 = 6.28318530718;

struct Particle {
  a: vec4f, // pos.xy, vel.xy   (world units: 1 = half the short screen side, origin = centre, y up)
  b: vec4f, // home.xy, pseed, restLum
  c: vec4f, // lum, size, hot, col2
  d: vec4f, // tint, unused...
};

fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}

fn rnd(a: u32, b: u32) -> f32 {
  return f32(pcg(a ^ pcg(b))) / 4294967295.0;
}

fn hash22(p: vec2f) -> vec2f {
  let q = vec2u(bitcast<u32>(p.x * 7.123 + 11.0), bitcast<u32>(p.y * 3.917 + 5.0));
  let h1 = pcg(q.x ^ pcg(q.y));
  let h2 = pcg(h1 ^ 0x9e3779b9u);
  return vec2f(f32(h1), f32(h2)) / 4294967295.0 * 2.0 - 1.0;
}

fn gnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = dot(hash22(i), f);
  let b = dot(hash22(i + vec2f(1.0, 0.0)), f - vec2f(1.0, 0.0));
  let c = dot(hash22(i + vec2f(0.0, 1.0)), f - vec2f(0.0, 1.0));
  let d = dot(hash22(i + vec2f(1.0, 1.0)), f - vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/** Divergence-free 2D field from a scrolling noise potential. */
fn curl(p: vec2f, t: f32) -> vec2f {
  let e = 0.02;
  let o = vec2f(t * 0.73, -t * 0.51);
  let n1 = gnoise(p + o + vec2f(0.0, e)) + 0.5 * gnoise(2.1 * p - o + vec2f(0.0, e));
  let n2 = gnoise(p + o - vec2f(0.0, e)) + 0.5 * gnoise(2.1 * p - o - vec2f(0.0, e));
  let n3 = gnoise(p + o + vec2f(e, 0.0)) + 0.5 * gnoise(2.1 * p - o + vec2f(e, 0.0));
  let n4 = gnoise(p + o - vec2f(e, 0.0)) + 0.5 * gnoise(2.1 * p - o - vec2f(e, 0.0));
  return vec2f(n1 - n2, -(n3 - n4)) / (2.0 * e);
}

// ---- fullscreen scenes
struct FsOut { @builtin(position) pos: vec4f };

@vertex
fn vs_full(@builtin(vertex_index) vi: u32) -> FsOut {
  let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  return FsOut(vec4f(p * 2.0 - 1.0, 0.0, 1.0));
}

fn hash41(p: vec2f, salt: f32) -> vec4f {
  let q = vec2u(bitcast<u32>(p.x + salt * 0.137), bitcast<u32>(p.y - salt));
  let a = pcg(q.x ^ pcg(q.y));
  let b = pcg(a ^ 0x68bc21ebu);
  let c = pcg(b ^ 0x02e5be93u);
  let d = pcg(c ^ 0x967a889bu);
  return vec4f(f32(a), f32(b), f32(c), f32(d)) / 4294967295.0;
}

fn fbm(p: vec2f, oct: i32) -> f32 {
  var s = 0.0;
  var a = 0.5;
  var q = p;
  for (var i = 0; i < oct; i++) {
    s += a * gnoise(q);
    q = mat2x2f(1.6, 1.2, -1.2, 1.6) * q + vec2f(3.1, 1.7);
    a *= 0.5;
  }
  return s;
}

fn ss(a: f32, b: f32, x: f32) -> f32 { return smoothstep(a, b, x); }
