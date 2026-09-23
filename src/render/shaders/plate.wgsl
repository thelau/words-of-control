// PLATE — sand on a resonating plate. The word's bytes choose the Chladni
// modes (m, n); each frame the sand migrates away from the vibrating
// antinodes toward the still nodal lines, then slumps to its angle of repose.
// When the mode changes the figure dissolves and reforms. Rendered as sand on
// a dark metal plate under raking light, individual grains glinting. Its sound
// (clips.ts) is the plate itself, ringing in the same mode.

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var<storage, read> src: array<f32>;
@group(0) @binding(2) var<storage, read_write> dst: array<f32>;

const N = 384u;

fn at(p: vec2i) -> f32 {
  let q = clamp(p, vec2i(0), vec2i(i32(N) - 1));
  return src[u32(q.y) * N + u32(q.x)];
}

/** |displacement| of the plate in mode (m, n) at uv ∈ [0,1]² (square plate, free edges approximated). */
fn amp(uv: vec2f) -> f32 {
  let m = F.modeM;
  let n = F.modeN;
  let a = sin(m * 3.14159 * uv.x) * sin(n * 3.14159 * uv.y);
  let b = sin(n * 3.14159 * uv.x) * sin(m * 3.14159 * uv.y);
  return abs(a + select(-1.0, 1.0, F.variant > 0.5) * b);
}

/** Flow at a cell: sand is thrown off where the plate moves, down the gradient of |amp|. */
fn flow(p: vec2i) -> vec2f {
  let uv = (vec2f(p) + 0.5) / f32(N);
  let e = 1.0 / f32(N);
  let g = vec2f(amp(uv + vec2f(e, 0.0)) - amp(uv - vec2f(e, 0.0)), amp(uv + vec2f(0.0, e)) - amp(uv - vec2f(0.0, e))) * f32(N) * 0.5;
  let shake = mix(0.5, 1.4, F.s_energy) * mix(1.0, 0.4, F.lazy);
  let v = -normalize(g + vec2f(1e-6)) * clamp(amp(uv) * shake, 0.0, 1.0) * 0.22;
  return v;
}

/** Pass 1: sand is shaken off the antinodes toward the nodal lines — conservative flux, so it piles up. */
@compute @workgroup_size(16, 16)
fn transport(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= N || gid.y >= N) { return; }
  let i = gid.y * N + gid.x;
  if (F.mode > 0.5) { // a new shot: an even layer of sand, slightly uneven
    dst[i] = 0.45 + 0.1 * gnoise(vec2f(gid.xy) * 0.07 + F.seed * 0.01) + 0.06 * (hash22(vec2f(gid.xy)).x);
    return;
  }
  let p = vec2i(gid.xy);
  let v = flow(p);
  let out = at(p) * (abs(v.x) + abs(v.y));
  let vl = flow(p + vec2i(-1, 0)); let vr = flow(p + vec2i(1, 0));
  let vd = flow(p + vec2i(0, -1)); let vu = flow(p + vec2i(0, 1));
  let inflow = at(p + vec2i(-1, 0)) * max(vl.x, 0.0) + at(p + vec2i(1, 0)) * max(-vr.x, 0.0)
             + at(p + vec2i(0, -1)) * max(vd.y, 0.0) + at(p + vec2i(0, 1)) * max(-vu.y, 0.0);
  dst[i] = at(p) - out + inflow;
}

/** Pass 2: angle of repose — sand steeper than ~33° slides downhill. */
@compute @workgroup_size(16, 16)
fn repose(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= N || gid.y >= N) { return; }
  let p = vec2i(gid.xy);
  let h = at(p);
  // tan θ · dx, in height units: coarse, hard sand holds a steeper slope than fine powder
  let lim = mix(0.45, 0.85, F.s_hardness) / f32(N) * 60.0;
  var dh = 0.0;
  for (var k = 0; k < 4; k++) {
    let o = select(select(vec2i(0, -1), vec2i(0, 1), k == 1), select(vec2i(-1, 0), vec2i(1, 0), k == 2), k >= 2);
    let d = at(p + o) - h;
    if (d > lim) { dh += (d - lim) * 0.2; } else if (-d > lim) { dh -= (-d - lim) * 0.2; }
  }
  dst[gid.y * N + gid.x] = h + dh;
}
