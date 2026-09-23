// PLATE (drawing) — the sand height field on a dark metal plate: raking light,
// short cast shadows, bare metal catching a strip of light where the sand has
// left, and single grains glinting on the ridges.

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var<storage, read> sand: array<f32>;

const N = 384u;

fn at(p: vec2i) -> f32 {
  let q = clamp(p, vec2i(0), vec2i(i32(N) - 1));
  return sand[u32(q.y) * N + u32(q.x)];
}

fn h(uv: vec2f) -> f32 {
  let p = uv * f32(N) - 0.5;
  let i = vec2i(floor(p));
  let f = fract(p);
  return mix(mix(at(i), at(i + vec2i(1, 0)), f.x), mix(at(i + vec2i(0, 1)), at(i + vec2i(1, 1)), f.x), f.y);
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let res = vec2f(F.resX, F.resY);
  let side = res.y * 0.86;
  var uv = (fc.xy - (res - vec2f(side)) * 0.5) / side;
  uv = (uv - 0.5) / F.zoom + 0.5 + vec2f(F.offX, -F.offY) * 0.5;
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return vec4f(0.0, 0.0, 0.0, 1.0); }

  let e = 1.0 / f32(N);
  let H = 0.9;
  let s = h(uv);
  let n = normalize(vec3f(-(h(uv + vec2f(e, 0.0)) - h(uv - vec2f(e, 0.0))) * H / (2.0 * e) * e * 40.0,
                           (h(uv + vec2f(0.0, e)) - h(uv - vec2f(0.0, e))) * H / (2.0 * e) * e * 40.0, 1.0));
  let slow = mix(1.0, 0.3, F.lazy);
  let ang = mix(-2.5, -0.7, F.u * slow) + F.variant * 0.6;
  let L = normalize(vec3f(cos(ang), sin(ang), mix(0.18, 0.4, F.s_light)));
  let lit = max(dot(n, L), 0.0);
  // short cast shadow along the light
  var shadow = 1.0;
  for (var i = 1; i < 10; i++) {
    let q = uv + normalize(L.xy) * vec2f(1.0, -1.0) * e * f32(i) * 2.0;
    shadow = min(shadow, clamp(1.0 - (h(q) - s - f32(i) * e * 2.0 * L.z * 8.0) * 14.0, 0.0, 1.0));
  }
  // bare metal where the sand has left: dark, with a strip of reflected light
  let bare = ss(0.16, 0.03, s);
  let strip = ss(0.1, 0.0, abs(dot(uv - 0.5, normalize(vec2f(1.0, 0.4))) - mix(-0.6, 0.6, F.u * slow)));
  let metal = vec3f(0.05, 0.055, 0.06) + vec3f(0.5, 0.55, 0.6) * strip * 0.6;
  let sandCol = mix(vec3f(0.9, 0.84, 0.74), vec3f(F.baseR, F.baseG, F.baseB), 0.3) * 0.8;
  var c = mix(sandCol * (lit * shadow * 1.4 + 0.02), metal, bare);
  // single grains glinting on the lit ridges
  let cell = floor(uv * f32(N) * 1.6);
  let g = hash22(cell + floor(F.time * 6.0));
  c += vec3f(1.0, 0.95, 0.9) * pow(max(g.x, 0.0), 60.0) * lit * shadow * (1.0 - bare) * 3.0;
  // the plate's edge
  let edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  c *= ss(0.0, 0.004, edge);
  return vec4f(c, 1.0);
}
