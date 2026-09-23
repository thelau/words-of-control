// SAND — a height field of sand (periodic, N²) moved by one of five
// behaviours (see src/show/sand.ts): shaken into a Chladni figure, blown into
// ripples, blasted by impacts, ploughed by a blade, or drained into a hole.
// Each step: the velocity field is computed once per cell (pass 0), sand moves
// by conservative flux along it (never created, only moved — or swallowed by
// the drain), then slumps to the angle of repose.

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var<storage, read> src: array<f32>;
@group(0) @binding(2) var<storage, read_write> dst: array<f32>;
@group(0) @binding(3) var<storage, read> E: array<vec4f>; // the shot's events (sand.ts packSand)
@group(0) @binding(4) var<storage, read_write> vel: array<vec2f>; // pass 0 writes, pass 1 reads
@group(0) @binding(5) var baked: texture_storage_2d<rgba16float, write>; // for the camera: h, slope x/y, curvature

const N = 512u;

fn wrap(p: vec2i) -> vec2i { return (p + vec2i(i32(N))) % vec2i(i32(N)); }
fn at(p: vec2i) -> f32 { let q = wrap(p); return src[u32(q.y) * N + u32(q.x)]; }

/** tan(repose) per cell, in height units: coarse, hard sand holds a steeper slope */
fn reposeLim() -> f32 { return mix(0.45, 0.85, F.s_hardness) / f32(N) * 60.0; }

/** Shortest periodic offset from b to a (uv). */
fn pd(a: vec2f, b: vec2f) -> vec2f { let d = a - b; return d - round(d); }

// ---- behaviours: the velocity of sand at a cell, in cells per step (|v|₁ ≤ 1)

fn chladniAmp(uv: vec2f) -> f32 {
  let a = sin(F.modeM * PI * uv.x) * sin(F.modeN * PI * uv.y);
  let b = sin(F.modeN * PI * uv.x) * sin(F.modeM * PI * uv.y);
  let phi = (F.variant * 0.8 + 0.1) * PI; // a mix angle: never the same diagonal
  return abs(cos(phi) * a + sin(phi) * b);
}

fn flow(p: vec2i) -> vec2f {
  let uv = (vec2f(wrap(p)) + 0.5) / f32(N);
  let e = 1.0 / f32(N);
  let beh = E[0].x;
  let t = F.lt;
  var v = vec2f(0.0);
  if (beh < 0.5) {
    // chladni: thrown off the antinodes, down the gradient of |displacement|, to the still lines
    let g = vec2f(chladniAmp(uv + vec2f(e, 0.0)) - chladniAmp(uv - vec2f(e, 0.0)), chladniAmp(uv + vec2f(0.0, e)) - chladniAmp(uv - vec2f(0.0, e)));
    let shake = mix(0.5, 1.4, F.s_energy) * mix(1.0, 0.4, F.lazy);
    v = -normalize(g + vec2f(1e-6)) * clamp(chladniAmp(uv) * shake, 0.0, 1.0) * 0.22;
  } else if (beh < 1.5) {
    // dunes: saltation downwind, faster on the exposed (stoss) slope, none in the lee of a crest
    let w = vec2f(cos(E[0].z), sin(E[0].z));
    let h = at(p);
    let grad = vec2f(at(p + vec2i(1, 0)) - at(p - vec2i(1, 0)), at(p + vec2i(0, 1)) - at(p - vec2i(0, 1))) * 0.5;
    let up = at(p - vec2i(round(w * 4.0)));
    let lee = ss(reposeLim() * 2.5, reposeLim() * 1.2, up - h);
    let expo = clamp(1.0 + dot(grad, w) / reposeLim() * 1.4, 0.0, 2.5);
    v = w * E[0].w * 0.16 * expo * lee * mix(1.0, 0.35, F.lazy);
  } else if (beh < 2.5) {
    // crater: each impact blasts sand outward for a moment, harder in its ejecta rays
    let n = u32(E[0].y);
    for (var i = 0u; i < n; i++) {
      let m = E[2u + i];
      let dt = t - m.z;
      if (dt < 0.0 || dt > 0.5) { continue; }
      let d = pd(uv, m.xy);
      let r = length(d) / m.w;
      let ang = atan2(d.y, d.x);
      let rays = 0.65 + 0.7 * pow(0.5 + 0.5 * gnoise(vec2f(ang * 5.0, f32(i) * 7.0 + m.z)), 2.0);
      let k = exp(-dt / 0.12) * ss(1.6, 0.5, r) * ss(0.0, 0.12, r) * rays;
      // a jittered direction per cell: grains scatter, and the grid's axes never show
      let ja = ang + (hash22(vec2f(p) + F.lt * 60.0).x) * 0.6;
      v += vec2f(cos(ja), sin(ja)) * k;
    }
  } else if (beh < 3.5) {
    // furrow: each blade's tip pushes sand aside (and a little forward) as it is drawn through
    for (var k = 0u; k < u32(E[0].y); k++) {
      let a = E[8u + k * 2u].xy;
      let b = E[8u + k * 2u].zw;
      let T = E[9u + k * 2u];
      let s = ss(T.x, T.y, t);
      let moving = step(T.x, t) * step(t, T.y + 0.05);
      let tip = mix(a, b, s);
      let dir = normalize(b - a);
      let d = pd(uv, tip);
      let side = sign(dir.x * d.y - dir.y * d.x);
      let near = exp(-dot(d, d) / (T.z * T.z)) * moving;
      v += (vec2f(-dir.y, dir.x) * side * 0.85 + dir * 0.3) * near;
    }
  } else {
    // drain: the funnel widens over the shot; inside it the bed slides toward the hole
    let D = E[14];
    let d = pd(uv, D.xy);
    let Rt = D.z * 2.0 + 0.22 * ss(0.0, 1.0, F.u);
    let ja = atan2(d.y, d.x) + hash22(vec2f(p) + F.lt * 60.0).x * 0.6; // jittered: the grid's axes never show
    v = -vec2f(cos(ja), sin(ja)) * 0.45 * ss(Rt, Rt * 0.5, length(d)) * step(0.1, t);
  }
  let l1 = abs(v.x) + abs(v.y);
  return v / max(1.0, l1 / 0.95);
}

fn velAt(p: vec2i) -> vec2f { let q = wrap(p); return vel[u32(q.y) * N + u32(q.x)]; }

/** Pass 0: the velocity of every cell, once. */
@compute @workgroup_size(16, 16)
fn velocity(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= N || gid.y >= N) { return; }
  vel[gid.y * N + gid.x] = select(flow(vec2i(gid.xy)), vec2f(0.0), F.mode > 0.5);
}

/** Pass 1: conservative flux along the velocity field; the drain swallows. */
@compute @workgroup_size(16, 16)
fn transport(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= N || gid.y >= N) { return; }
  let i = gid.y * N + gid.x;
  let p = vec2i(gid.xy);
  let uv = (vec2f(gid.xy) + 0.5) / f32(N);
  if (F.mode > 0.5) { // a new shot: lay the bed — a thin dusting on a plate, else deep sand, faintly uneven
    let g = gnoise(uv * 9.0 + F.seed * 0.01) + 0.5 * gnoise(uv * 23.0 - F.seed * 0.02);
    let thin = E[0].x < 0.5;
    dst[i] = select(0.6 + 0.05 * g, 0.2 + 0.05 * g, thin) + 0.03 * hash22(vec2f(gid.xy)).x;
    return;
  }
  let v = velAt(p);
  let out = at(p) * (abs(v.x) + abs(v.y));
  let vl = velAt(p + vec2i(-1, 0)); let vr = velAt(p + vec2i(1, 0));
  let vd = velAt(p + vec2i(0, -1)); let vu = velAt(p + vec2i(0, 1));
  let inflow = at(p + vec2i(-1, 0)) * max(vl.x, 0.0) + at(p + vec2i(1, 0)) * max(-vr.x, 0.0)
             + at(p + vec2i(0, -1)) * max(vd.y, 0.0) + at(p + vec2i(0, 1)) * max(-vu.y, 0.0);
  var h = at(p) - out + inflow;
  if (E[0].x > 3.5 && F.lt > 0.1) {
    let D = E[14];
    let hole = ss(D.z, D.z * 0.5, length(pd(uv, D.xy)));
    h *= 1.0 - hole * D.w;
  }
  dst[i] = max(h, 0.0);
}

/** Pass 2: angle of repose — sand steeper than the limit slides downhill (pairwise, so conservative). */
@compute @workgroup_size(16, 16)
fn repose(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= N || gid.y >= N) { return; }
  let p = vec2i(gid.xy);
  let h = at(p);
  let lim = reposeLim();
  var dh = 0.0;
  for (var k = 0; k < 4; k++) {
    let o = select(select(vec2i(0, -1), vec2i(0, 1), k == 1), select(vec2i(-1, 0), vec2i(1, 0), k == 2), k >= 2);
    let d = at(p + o) - h;
    if (d > lim) { dh += (d - lim) * 0.24; } else if (-d > lim) { dh -= (-d - lim) * 0.24; }
  }
  dst[gid.y * N + gid.x] = h + dh;
}

/** Hills under the bed, in sim height units: a sum of waves with whole-number frequencies (so the bed stays
 *  periodic), domain-warped; they breathe and travel with the word's motion. Only the glitter, lines and pins
 *  worlds stand on hills; sand keeps its flat bed. */
fn hills(p: vec2i) -> f32 {
  let mat = E[1].z;
  if (mat < 0.5) { return 0.0; }
  let uv = (vec2f(p) + 0.5) / f32(N) * TAU;
  let t = F.lt * mix(1.0, 0.3, F.lazy);
  let drift = t * (0.05 + 0.25 * F.mo_drifting + 0.15 * F.mo_spreading);
  let w = uv + 0.6 * vec2f(sin(uv.y * 2.0 + drift), sin(uv.x * 3.0 - drift));
  var h = 0.0;
  for (var k = 0; k < 6; k++) {
    let fk = f32(k);
    let dir = vec2f(f32(2 + (k * 3 + i32(F.seed)) % 5), f32(1 + (k * 2 + i32(F.seed * 0.1)) % 6)) * select(1.0, -1.0, k % 2 == 1);
    h += sin(dot(w, dir) + fk * 1.7 + drift * (1.0 + fk * 0.3)) / (1.0 + fk * 0.6);
  }
  let amp = mix(1.5, 4.5, F.s_scale * 0.5 + F.s_intensity * 0.5) * mix(1.0, 1.0 + 0.2 * sin(t * 1.5), F.mo_trembling + F.mo_circling * 0.5);
  let grow = mix(1.0, ss(0.0, 0.8, F.u), F.mo_rising);
  return (h * 0.25 + 0.6) * amp * grow;
}

fn total(p: vec2i) -> f32 { return at(p) + hills(p); }

/** After the last step: bake height, slope and curvature into a filterable texture for the camera (sand_draw). */
@compute @workgroup_size(16, 16)
fn bake(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= N || gid.y >= N) { return; }
  let p = vec2i(gid.xy);
  let h = total(p);
  let gx = (total(p + vec2i(1, 0)) - total(p - vec2i(1, 0))) * 0.5;
  let gy = (total(p + vec2i(0, 1)) - total(p - vec2i(0, 1))) * 0.5;
  let lap = total(p + vec2i(2, 0)) + total(p - vec2i(2, 0)) + total(p + vec2i(0, 2)) + total(p - vec2i(0, 2)) - 4.0 * h;
  textureStore(baked, p, vec4f(h, gx * 16.0, gy * 16.0, lap * 4.0)); // scaled into f16's sweet spot
}
