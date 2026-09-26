// SCULPTURE (prototype) — Jev's reading as one mass of light. A million particles; each belongs to one of the
// answers (a stream), in proportion to how strongly Jev answered. The mass is written by the reading: first the
// typed word itself, in the air; then a column of strata, one per answer, each as thick and as swollen as its answer
// (labelled beside it: the machine's reading made legible); then the strata melt into a flow where the streams
// weave; then all of it collapses into a core. Trails (the last frame, faded) make the light silken.

struct Uni {
  vp: mat4x4f,
  time: f32, dt: f32, n: u32, nStreams: u32,
  kWord: f32, kStrata: f32, kCurl: f32, kCollapse: f32,
  wordCount: u32, reset: f32, exposure: f32, fade: f32,
  resX: f32, resY: f32, pad0: f32, pad1: f32,
};

struct Stream { shape: vec4f, colour: vec4f }; // y centre, thickness, weight, category | rgb, brightness

@group(0) @binding(0) var<uniform> U: Uni;
@group(0) @binding(1) var<storage, read_write> P: array<vec4f>;   // pos.xyz + seed | vel.xyz + stream
@group(0) @binding(2) var<storage, read> S: array<Stream>;
@group(0) @binding(3) var<storage, read> T: array<u32>;           // 1024 → stream, by weight
@group(0) @binding(4) var<storage, read> W: array<vec4f>;         // the typed word, as points
@group(0) @binding(6) var<storage, read> PR: array<vec4f>;        // the particles, for drawing (the same buffer)

const TAU = 6.28318530718;

fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rnd(i: u32, salt: u32) -> f32 { return f32(pcg(i ^ pcg(salt))) / 4294967295.0; }

/** A divergence-free flow (each component ignores its own axis): three octaves of travelling waves. */
fn flow(p: vec3f, t: f32) -> vec3f {
  var v = vec3f(0.0);
  var q = p;
  var a = 1.0;
  for (var o = 0; o < 3; o++) {
    v += a * vec3f(
      sin(q.y * 1.7 + t * 0.61) + sin(q.z * 2.3 - t * 0.43),
      sin(q.z * 1.3 + t * 0.52) + sin(q.x * 2.1 + t * 0.37),
      sin(q.x * 1.9 - t * 0.47) + sin(q.y * 2.7 + t * 0.58));
    q = vec3f(q.z * 1.9 + 1.3, q.x * 1.9 - 0.7, q.y * 1.9 + 2.1);
    a *= 0.5;
  }
  return v;
}

/** Where particle i stands in the column of strata: its answer's layer, its ring swollen by the answer's strength. */
fn strata(i: u32, s: u32, t: f32) -> vec3f {
  let st = S[s].shape;
  let w = st.z;
  let th = rnd(i, 11u) * TAU + t * (0.05 + 0.12 * w);
  let y = st.x + (rnd(i, 12u) - 0.5) * st.y;
  let ripple = 0.5 + 0.5 * sin(th * (3.0 + floor(st.w * 2.0)) + y * 9.0 + t * 0.4);
  let r = 0.28 * (0.55 + 1.3 * w * (0.35 + 0.65 * ripple)) * (0.92 + 0.16 * rnd(i, 13u));
  return vec3f(0.22 + cos(th) * r, y, sin(th) * r); // (right of centre: the labels take the left margin)
}

@compute @workgroup_size(256)
fn simulate(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= U.n) { return; }
  let s = T[pcg(i * 2654435761u) % 1024u];
  var p = P[i * 2u].xyz;
  var v = P[i * 2u + 1u].xyz;
  // the word: a point of its letters (jittered into a thin sheet)
  let wp = vec3f(0.08, 0.0, 0.0) + W[i % max(U.wordCount, 1u)].xyz + (vec3f(rnd(i, 1u), rnd(i, 2u), rnd(i, 3u)) - 0.5) * vec3f(0.012, 0.012, 0.06);
  if (U.reset > 0.5) {
    P[i * 2u] = vec4f(wp + (vec3f(rnd(i, 4u), rnd(i, 5u), rnd(i, 6u)) - 0.5) * 0.02, rnd(i, 7u));
    P[i * 2u + 1u] = vec4f(0.0, 0.0, 0.0, f32(s));
    return;
  }
  let dt = min(U.dt, 1.0 / 30.0);
  let t = U.time;
  // spring toward the word and toward the strata (critically damped), the flow, and the collapse to the core
  let goal = wp * U.kWord + strata(i, s, t) * U.kStrata;
  let kSpring = (U.kWord + U.kStrata) * mix(6.0, 14.0, rnd(i, 8u));
  var a = (goal - p) * kSpring * kSpring * select(0.0, 1.0, U.kWord + U.kStrata > 0.0) - v * 2.0 * kSpring;
  // the flow: every stream carried by the same slow field, the strong answers furthest (a bound keeps it in frame)
  a += flow(p * 0.9 + vec3f(f32(s) * 0.37, 0.0, 0.0), t * 0.35) * U.kCurl * (0.7 + 0.6 * S[s].shape.z);
  a += -(p - vec3f(0.22, 0.0, 0.0)) * max(length(p - vec3f(0.22, 0.0, 0.0)) - 1.4, 0.0) * 4.0 * U.kCurl;
  a += -vec3f(p.x, p.y * 0.35, p.z) * U.kCollapse * 6.0 - v * U.kCollapse * 1.5;
  v += a * dt;
  v *= exp(-dt * 0.6);
  p += v * dt;
  P[i * 2u] = vec4f(p, P[i * 2u].w);
  P[i * 2u + 1u] = vec4f(v, f32(s));
}

// ---------------------------------------------------------------- the points
struct VOut { @builtin(position) pos: vec4f, @location(0) col: vec3f };

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VOut {
  var o: VOut;
  let p = PR[i * 2u].xyz;
  let s = u32(PR[i * 2u + 1u].w);
  let c = U.vp * vec4f(p, 1.0);
  o.pos = c;
  // brighter for strong answers, dimmer far away; a few particles blaze
  let depth = clamp(c.w / 6.0, 0.0, 1.0);
  let blaze = 1.0 + 6.0 * step(0.998, PR[i * 2u].w);
  o.col = S[s].colour.rgb * S[s].colour.a * blaze * mix(1.0, 0.35, depth) * U.exposure;
  return o;
}

@fragment
fn fs(i: VOut) -> @location(0) vec4f { return vec4f(i.col, 1.0); }

// ---------------------------------------------------------------- trails and the final image
@group(0) @binding(5) var prev: texture_2d<f32>;

struct FsOut { @builtin(position) pos: vec4f };
@vertex
fn vs_full(@builtin(vertex_index) vi: u32) -> FsOut {
  let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  return FsOut(vec4f(p * 2.0 - 1.0, 0.0, 1.0));
}

/** The last frame, faded: silken trails. */
@fragment
fn fs_fade(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  return vec4f(textureLoad(prev, vec2i(fc.xy), 0).rgb * U.fade, 1.0);
}

fn aces(x: vec3f) -> vec3f {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}

/** The light, tone-mapped, with film grain. */
@fragment
fn fs_present(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let q = vec2i(fc.xy) - vec2i(i32(U.pad0), 0); // (the column's left edge on the canvas)
  let c = textureLoad(prev, q, 0).rgb;
  var o = aces(c);
  o = pow(o, vec3f(1.0 / 2.2));
  let g = f32(pcg((u32(fc.x) * 1973u) ^ pcg(u32(fc.y) * 9277u + u32(U.time * 24.0)))) / 4294967295.0 - 0.5;
  o += g * 0.035;
  return vec4f(o, 1.0);
}
