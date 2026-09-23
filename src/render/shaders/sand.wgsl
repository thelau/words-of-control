// SAND — a thin layer of sand on a resonating plate (N², periodic). The word's
// bytes choose the Chladni modes (chladni.ts); sand is thrown off the vibrating
// antinodes toward the still nodal lines. Each step: the velocity field once per
// cell (pass 0), sand moves by conservative flux along it (pass 1 — never
// created, only moved), then slumps to its angle of repose (pass 2). A last pass
// bakes height, slope and curvature into a filterable texture for the camera.

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var<storage, read> src: array<f32>;
@group(0) @binding(2) var<storage, read_write> dst: array<f32>;
@group(0) @binding(4) var<storage, read_write> vel: array<vec2f>;
@group(0) @binding(5) var baked: texture_storage_2d<rgba16float, write>;

const N = 512u;

fn wrap(p: vec2i) -> vec2i { return (p + vec2i(i32(N))) % vec2i(i32(N)); }
fn at(p: vec2i) -> f32 { let q = wrap(p); return src[u32(q.y) * N + u32(q.x)]; }
fn velAt(p: vec2i) -> vec2f { let q = wrap(p); return vel[u32(q.y) * N + u32(q.x)]; }

/** tan(repose) per cell, in height units: coarse, hard sand holds a steeper slope */
fn reposeLim() -> f32 { return mix(0.45, 0.85, F.s_hardness) / f32(N) * 60.0; }

fn amp(uv: vec2f) -> f32 {
  let a = sin(F.modeM * PI * uv.x) * sin(F.modeN * PI * uv.y);
  let b = sin(F.modeN * PI * uv.x) * sin(F.modeM * PI * uv.y);
  let phi = (F.variant * 0.8 + 0.1) * PI; // a mix angle: never the same diagonal
  return abs(cos(phi) * a + sin(phi) * b);
}

/** Thrown off the antinodes, down the gradient of |displacement|, to the still lines (cells per step, |v|₁ ≤ 1). */
fn flow(p: vec2i) -> vec2f {
  let uv = (vec2f(wrap(p)) + 0.5) / f32(N);
  let e = 1.0 / f32(N);
  let g = vec2f(amp(uv + vec2f(e, 0.0)) - amp(uv - vec2f(e, 0.0)), amp(uv + vec2f(0.0, e)) - amp(uv - vec2f(0.0, e)));
  let shake = mix(0.5, 1.4, F.s_energy) * mix(1.0, 0.4, F.lazy);
  let v = -normalize(g + vec2f(1e-6)) * clamp(amp(uv) * shake, 0.0, 1.0) * 0.33;
  return v / max(1.0, (abs(v.x) + abs(v.y)) / 0.95);
}

/** Pass 0: the velocity of every cell, once. */
@compute @workgroup_size(16, 16)
fn velocity(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= N || gid.y >= N) { return; }
  vel[gid.y * N + gid.x] = select(flow(vec2i(gid.xy)), vec2f(0.0), F.mode > 0.5);
}

/** Pass 1: conservative flux along the velocity field. */
@compute @workgroup_size(16, 16)
fn transport(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= N || gid.y >= N) { return; }
  let i = gid.y * N + gid.x;
  let p = vec2i(gid.xy);
  if (F.mode > 0.5) { // a new shot: a thin, faintly uneven dusting
    let uv = (vec2f(gid.xy) + 0.5) / f32(N);
    let g = gnoise(uv * 9.0 + F.seed * 0.01) + 0.5 * gnoise(uv * 23.0 - F.seed * 0.02);
    dst[i] = 0.2 + 0.05 * g + 0.03 * hash22(vec2f(gid.xy)).x;
    return;
  }
  let v = velAt(p);
  let out = at(p) * (abs(v.x) + abs(v.y));
  let vl = velAt(p + vec2i(-1, 0)); let vr = velAt(p + vec2i(1, 0));
  let vd = velAt(p + vec2i(0, -1)); let vu = velAt(p + vec2i(0, 1));
  let inflow = at(p + vec2i(-1, 0)) * max(vl.x, 0.0) + at(p + vec2i(1, 0)) * max(-vr.x, 0.0)
             + at(p + vec2i(0, -1)) * max(vd.y, 0.0) + at(p + vec2i(0, 1)) * max(-vu.y, 0.0);
  dst[i] = max(at(p) - out + inflow, 0.0);
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

/** After the last step: bake height, slope and curvature into a filterable texture for the camera (sand_draw). */
@compute @workgroup_size(16, 16)
fn bake(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= N || gid.y >= N) { return; }
  let p = vec2i(gid.xy);
  let h = at(p);
  let gx = (at(p + vec2i(1, 0)) - at(p - vec2i(1, 0))) * 0.5;
  let gy = (at(p + vec2i(0, 1)) - at(p - vec2i(0, 1))) * 0.5;
  let lap = at(p + vec2i(2, 0)) + at(p - vec2i(2, 0)) + at(p + vec2i(0, 2)) + at(p - vec2i(0, 2)) - 4.0 * h;
  textureStore(baked, p, vec4f(h, gx * 16.0, gy * 16.0, lap * 4.0)); // scaled into f16's sweet spot
}
