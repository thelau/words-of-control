// DUST — sand, ash, smoke, ice, motes: 150 000 grains whose
// movement is the word's movement (spreading, falling, rising, drifting,
// circling, contracting, trembling, still, breaking — blended by Jev's
// distribution), drawn as light: velocity streaks with depth of field into a
// persistence buffer (long exposure).

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var<storage, read_write> G: array<vec4f>; // 2 per grain: pos.xy vel.xy | seed, size, depth, lum

fn rnd1(i: u32, s: u32) -> f32 { return rnd(i, s ^ u32(F.seed)); }

/** Where a grain starts, by motion (world units: 1 = half the short side, y up). */
fn spawn(i: u32) -> vec4f {
  let a = rnd1(i, 1u) * TAU;
  let r0 = rnd1(i, 2u);
  let dir = vec2f(cos(a), sin(a));
  let aspect = F.resX / F.resY;
  let total = F.mo_rising + F.mo_falling + F.mo_spreading + F.mo_contracting + F.mo_circling + F.mo_trembling + F.mo_still + F.mo_breaking + F.mo_drifting + 1e-4;
  let pick = min(rnd1(i, 3u), 0.9999) * total;
  // spreading: a slow exhaled cloud (never a burst); breaking: grains shaken loose, falling
  var acc = F.mo_spreading;
  if (pick < acc) { return vec4f(dir * sqrt(r0) * 0.15, dir * (0.08 + 0.2 * rnd1(i, 4u))); }
  acc += F.mo_falling + F.mo_breaking;
  if (pick < acc) { return vec4f((rnd1(i, 7u) * 2.0 - 1.0) * aspect * 1.25, 1.1 + rnd1(i, 8u) * 0.8, 0.0, -0.1); }
  acc += F.mo_rising;
  if (pick < acc) { return vec4f((rnd1(i, 7u) * 2.0 - 1.0) * 0.5 * (1.0 + r0), -1.35 - rnd1(i, 8u) * 0.4, 0.0, 0.15); }
  acc += F.mo_circling;
  if (pick < acc) { let p = dir * (0.25 + 0.6 * r0); return vec4f(p, vec2f(-dir.y, dir.x) * 0.3); }
  acc += F.mo_contracting;
  if (pick < acc) { return vec4f(vec2f((rnd1(i, 7u) * 2.0 - 1.0) * aspect, rnd1(i, 8u) * 2.0 - 1.0) * 1.3, 0.0, 0.0); }
  acc += F.mo_drifting;
  if (pick < acc) { return vec4f(vec2f((rnd1(i, 7u) * 2.0 - 1.0) * aspect, rnd1(i, 8u) * 2.0 - 1.0) * 1.3, 0.0, 0.0); }
  acc += F.mo_still;
  if (pick < acc) { return vec4f(dir * pow(r0, 0.7) * 0.9, 0.0, 0.0); }
  return vec4f(dir * sqrt(r0) * 0.05, 0.0, 0.0); // trembling: a small knot
}

@compute @workgroup_size(256)
fn sim(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  let n = arrayLength(&G) / 2u;
  if (i >= n) { return; }
  if (F.mode > 0.5) {
    let s = spawn(i);
    G[i * 2u] = s;
    G[i * 2u + 1u] = vec4f(rnd1(i, 11u), 0.6 + pow(rnd1(i, 12u), 5.0) * 3.0, pow(rnd1(i, 13u), 6.0), 0.0);
    return;
  }
  var A = G[i * 2u];
  var B = G[i * 2u + 1u];
  var p = A.xy;
  var v = A.zw;
  let dt = min(F.dt, 1.0 / 30.0) * mix(1.0, 0.35, F.lazy);
  let t = F.lt;
  let r = length(p) + 1e-4;
  let rh = p / r;
  let th = vec2f(-rh.y, rh.x);
  var f = vec2f(0.0);
  var drag = 0.6;
  // each motion contributes its field, weighted by Jev's distribution
  f += th * 0.9 * F.mo_circling / (0.3 + r) - rh * (r - 0.55) * 0.8 * F.mo_circling;
  f += vec2f(0.0, -0.55) * F.mo_falling + vec2f(sin(t * 0.7 + B.x * 20.0) * 0.05, 0.0) * F.mo_falling;
  f += vec2f(0.0, 0.45) * F.mo_rising + curl(p * 2.0, t * 0.3) * 0.2 * F.mo_rising;
  f += -rh * 1.4 * r * F.mo_contracting;
  f += curl(p * 1.3, t * 0.12) * 0.25 * F.mo_drifting;
  f += (vec2f(rnd(i, u32(t * 240.0)), rnd(i, u32(t * 240.0) + 7u)) - 0.5) * 30.0 * F.mo_trembling - p * 6.0 * F.mo_trembling;
  drag += 2.5 * F.mo_still;
  // unease: turbulence rises with tension and low confidence
  f += curl(p * 3.0, t * 0.5) * (F.s_tension * 0.3 + (1.0 - F.conf) * 0.25);

  v += f * dt;
  v *= exp(-drag * dt);
  p += v * dt;
  // light: dust shines only where it crosses the light; the still hold their breath
  let dust = mix(0.55, 1.0, ss(0.0, 1.2, length(v)));
  let still = F.mo_still * (0.5 + 0.5 * pow(0.5 + 0.5 * sin(t * 2.0 + B.x * 90.0), 8.0));
  B.w = mix(dust, still + 0.3, F.mo_still) * ss(0.0, 0.08, t);
  G[i * 2u] = vec4f(p, v);
  G[i * 2u + 1u] = B;
}
