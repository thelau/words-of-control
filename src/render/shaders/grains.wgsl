// GRAINS — sand, fire, dust, smoke, ice: 150 000 grains whose
// movement is the word's movement (spreading, falling, rising, drifting,
// circling, contracting, trembling, still, breaking — blended by Jev's
// distribution), drawn as light: velocity streaks with depth of field into a
// persistence buffer (long exposure).

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var<storage, read_write> G: array<vec4f>; // 2 per grain: pos.xy vel.xy | seed, size, depth, lum

fn rnd1(i: u32, s: u32) -> f32 { return rnd(i, s ^ u32(F.seed)); }

/** Burst words emit sparks in 1–3 cones (never 360°): the cone axis for grain i. */
fn coneDir(i: u32) -> vec2f {
  let cones = 1u + u32(rnd1(0u, 41u) * 2.99);
  let c = i % cones;
  let axis = rnd1(c, 43u) * TAU;
  let half = mix(0.45, 1.0, F.s_arousal) * 0.9;
  let a = axis + (rnd1(i, 44u) - 0.5) * 2.0 * half;
  return vec2f(cos(a), sin(a));
}

/** Whether grain i was born a spark: the same draw spawn() makes. */
fn isSpark(i: u32) -> bool {
  let total = F.mo_rising + F.mo_falling + F.mo_spreading + F.mo_contracting + F.mo_circling + F.mo_trembling + F.mo_still + F.mo_breaking + F.mo_drifting + 1e-4;
  return min(rnd1(i, 3u), 0.9999) * total < F.mo_spreading + F.mo_breaking;
}

/** Where a grain starts, by motion (world units: 1 = half the short side, y up). */
fn spawn(i: u32) -> vec4f {
  let a = rnd1(i, 1u) * TAU;
  let r0 = rnd1(i, 2u);
  let dir = vec2f(cos(a), sin(a));
  let aspect = F.resX / F.resY;
  let total = F.mo_rising + F.mo_falling + F.mo_spreading + F.mo_contracting + F.mo_circling + F.mo_trembling + F.mo_still + F.mo_breaking + F.mo_drifting + 1e-4;
  let pick = min(rnd1(i, 3u), 0.9999) * total;
  var acc = F.mo_spreading;
  if (pick < acc) { let d = coneDir(i); return vec4f(d * 0.02, d * (0.6 + 2.6 * pow(rnd1(i, 4u), 2.0)) * mix(0.6, 1.4, F.s_arousal)); }
  acc += F.mo_breaking;
  if (pick < acc) { let d = coneDir(i); return vec4f(d * 0.03, d * (0.5 + 1.8 * pow(rnd1(i, 6u), 1.5))); }
  acc += F.mo_falling;
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
    // B.y carries the size; its sign marks a spark
    let size = 0.6 + pow(rnd1(i, 12u), 5.0) * 3.0;
    G[i * 2u + 1u] = vec4f(rnd1(i, 11u), select(size, -size, isSpark(i)), pow(rnd1(i, 13u), 6.0), 0.0);
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
  // sparks (burst words): staggered births, gravity, a floor to bounce off, a short hot life
  let burst = select(0.0, 1.0, B.y < 0.0); // this grain is a spark
  let born = F.lt >= B.x * min(F.dur * 0.6, 1.5) * burst;
  if (!born) { B.w = 0.0; G[i * 2u + 1u] = B; return; }

  var f = vec2f(0.0);
  var drag = 0.6;
  // each motion contributes its field, weighted by Jev's distribution
  f += th * 0.9 * F.mo_circling / (0.3 + r) - rh * (r - 0.55) * 0.8 * F.mo_circling;
  f += vec2f(0.0, -0.55) * F.mo_falling + vec2f(sin(t * 0.7 + B.x * 20.0) * 0.05, 0.0) * F.mo_falling;
  f += vec2f(0.0, 0.45) * F.mo_rising + curl(p * 2.0, t * 0.3) * 0.2 * F.mo_rising;
  f += -rh * 1.4 * r * F.mo_contracting;
  f += curl(p * 1.3, t * 0.12) * 0.25 * F.mo_drifting;
  f += (vec2f(rnd(i, u32(t * 240.0)), rnd(i, u32(t * 240.0) + 7u)) - 0.5) * 30.0 * F.mo_trembling - p * 6.0 * F.mo_trembling;
  f += vec2f(0.0, -1.6) * burst;
  drag += 0.2 * burst + 2.5 * F.mo_still;
  // unease: turbulence rises with tension and low confidence
  f += curl(p * 3.0, t * 0.5) * (F.s_tension * 0.3 + (1.0 - F.conf) * 0.25) * (1.0 - burst);

  v += f * dt;
  v *= exp(-drag * dt);
  p += v * dt;
  // the floor: sparks bounce and skitter (the kink sells the physics)
  if (burst > 0.5 && clamp(F.mo_spreading + F.mo_breaking, 0.0, 1.0) > 0.45 && p.y < -0.62 && v.y < 0.0) {
    p.y = -0.62;
    v.y = -v.y * 0.35;
    v.x *= 0.7 + 0.6 * rnd(i, u32(t * 60.0));
  }

  // light: a spark lives a short lognormal life and cools; dust shines only where it crosses the light
  let life = 0.35 + 0.9 * exp((B.x - 0.5) * 1.6) * 0.5;
  let age = (F.lt - B.x * min(F.dur * 0.6, 1.5) * burst) / life;
  let spark = select(0.0, exp(-age * 2.2), age < 2.5);
  let dust = mix(0.55, 1.0, ss(0.0, 1.2, length(v)));
  let still = F.mo_still * (0.5 + 0.5 * pow(0.5 + 0.5 * sin(t * 2.0 + B.x * 90.0), 8.0));
  // a spark lights up once it has left the nozzle: the source itself is never a white sun
  B.w = mix(mix(dust, still + 0.3, F.mo_still), spark * ss(0.08, 0.35, length(p)), burst) * ss(0.0, 0.08, t);
  // B.z keeps the grain's depth; its temperature is B.w itself (a spark cools as it dims)
  G[i * 2u] = vec4f(p, v);
  G[i * 2u + 1u] = B;
}
