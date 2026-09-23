// GRAINS — sand, fire, dust, smoke, ice: 150 000 grains whose
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
  // candidate positions per motion; the dominant motion wins by probability
  let pick = rnd1(i, 3u);
  var acc = 0.0;
  var p = dir * sqrt(r0) * 0.05; // default: a tight knot at the word
  var v = vec2f(0.0);
  let total = F.mo_rising + F.mo_falling + F.mo_spreading + F.mo_contracting + F.mo_circling + F.mo_trembling + F.mo_still + F.mo_breaking + F.mo_drifting + 1e-4;
  acc += F.mo_spreading / total;
  if (pick < acc) { p = dir * r0 * 0.04; v = dir * (0.3 + 2.8 * pow(rnd1(i, 4u), 2.0)) * mix(0.6, 1.5, F.s_arousal); return vec4f(p, v); }
  acc += F.mo_breaking / total;
  if (pick < acc) { p = dir * r0 * 0.12; let k = floor(rnd1(i, 5u) * 37.0); let fa = (k + rnd1(i, 9u) * 0.35) / 37.0 * TAU; v = vec2f(cos(fa), sin(fa)) * (0.4 + 1.8 * pow(rnd1(i, 6u), 1.5)) + dir * 0.2; return vec4f(p, v); }
  acc += F.mo_falling / total;
  if (pick < acc) { p = vec2f((rnd1(i, 7u) * 2.0 - 1.0) * aspect * 1.25, 0.2 + rnd1(i, 8u) * 1.6); return vec4f(p, vec2f(0.0, -0.1)); }
  acc += F.mo_rising / total;
  if (pick < acc) { p = vec2f((rnd1(i, 7u) * 2.0 - 1.0) * 0.5 * (1.0 + r0), -1.05 - rnd1(i, 8u) * 0.4); return vec4f(p, vec2f(0.0, 0.1)); }
  acc += F.mo_circling / total;
  if (pick < acc) { p = dir * (0.25 + 0.6 * r0); return vec4f(p, vec2f(-dir.y, dir.x) * 0.3); }
  acc += F.mo_contracting / total;
  if (pick < acc) { p = vec2f((rnd1(i, 7u) * 2.0 - 1.0) * aspect, rnd1(i, 8u) * 2.0 - 1.0) * 1.3; return vec4f(p, v); }
  acc += F.mo_drifting / total;
  if (pick < acc) { p = vec2f((rnd1(i, 7u) * 2.0 - 1.0) * aspect, rnd1(i, 8u) * 2.0 - 1.0) * 1.3; return vec4f(p, v); }
  acc += F.mo_still / total;
  if (pick < acc) { p = dir * pow(r0, 0.7) * 0.9; return vec4f(p, v); }
  return vec4f(p, v); // trembling: the knot
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
  drag += 1.4 * F.mo_spreading * ss(0.0, 1.2, t) + 2.5 * F.mo_still + 0.8 * F.mo_breaking * ss(0.2, 1.0, t);
  // unease: turbulence rises with tension and low confidence
  f += curl(p * 3.0, t * 0.5) * (F.s_tension * 0.3 + (1.0 - F.conf) * 0.25);

  v += f * dt;
  v *= exp(-drag * dt);
  p += v * dt;

  // brightness: sparks cool as they slow (fire), dust catches the light near the word
  let spd = length(v);
  let fire = F.m_fire + F.m_metal * 0.5;
  let heat = mix(0.55, 1.0, ss(0.0, 1.2, spd)) * mix(1.0, exp(-t * 0.6), fire * 0.7);
  let still = F.mo_still * (0.5 + 0.5 * pow(0.5 + 0.5 * sin(t * 2.0 + B.x * 90.0), 8.0));
  // grains born together at the word stay dark until they have left it (no white sun)
  // an outward burst concentrates light at the centre (density ~ 1/r): compensate so the burst reads as sparks, not a sun
  let born = mix(1.0, ss(0.02, 0.2, r) * min(1.0, r * 1.6), clamp(F.mo_spreading + F.mo_breaking + F.mo_trembling * 0.6, 0.0, 1.0));
  B.w = mix(heat, still + 0.3, F.mo_still) * ss(0.0, 0.08, t) * born;
  G[i * 2u] = vec4f(p, v);
  G[i * 2u + 1u] = B;
}
