// DATA — the appraisal gone 3D (Ryoji Ikeda's move from raster to space, seen
// through a macro lens: references video-a/c/f/h/i). Points of light in space,
// every one placed by the word's own data (the same tape the 2D readings show:
// bytes, Jev's distributions and scores, the typing rhythm). No simulation
// state: a point's place is computed from its index and the time, in one of
// five formations (F.variant2), each the 3D form of a 2D reading:
//   0 landscape — spectrum → the tape as a terrain (row r reads the tape shifted: a spectrogram)
//   1 city      — barcode → a field of bars, heights = values
//   2 lattice   — bits → a cube of voxels, lit where the bit is 1
//   3 cloud     — scatter → each value against the next two, a 3D return map, joined
//   4 tube      — line → the tape as one closed curve in space
// Monochrome and one accent, as in the appraisal: a value above 0.9 is the accent.
// The emotion is behaviour: density, speed, how points move (sadness sinks,
// anger jitters, joy expands), how close the camera is. Each point is drawn as
// a disc as wide as its circle of confusion (true bokeh); out-of-focus points
// are thinned and brightened so the cost stays flat. Instance 0 is the light.

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var<storage, read> tape: array<f32>;

fn tv(i: i32) -> f32 {
  let n = max(i32(F.tapeLen), 1);
  return tape[((i % n) + n) % n];
}
fn byteOf(i: i32) -> u32 { return u32(clamp(tv(i), 0.0, 1.0) * 255.0 + 0.5); }

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) q: vec2f,                         // position in the disc (−1..1), or the screen for the light
  @location(1) @interpolate(flat) col: vec3f,
  @location(2) @interpolate(flat) kind: f32,     // 0 a point, 1 the light
};

fn ink() -> vec3f { return vec3f(F.baseR, F.baseG, F.baseB); }
fn acc() -> vec3f { return vec3f(F.accR, F.accG, F.accB); }

fn r1(i: u32, s: u32) -> f32 { return rnd(i, s ^ u32(F.seed)); }

/** Where point i is (world, y up) and its value (0..1, the data it carries). */
fn place(i: u32, t: f32) -> vec4f {
  let form = u32(F.variant2 + 0.5);
  let a = r1(i, 1u);
  let b = r1(i, 2u);
  let c = r1(i, 3u);
  let n = max(F.tapeLen, 1.0);
  let scroll = t * mix(2.0, 14.0, F.s_arousal); // the data streams past, faster when charged
  if (form == 0u) {
    // landscape: x = the tape's index (streaming), z = rows, y = value
    let col = a * 96.0;
    let row = floor(b * 48.0);
    let k = i32(floor(col + scroll)) + i32(row) * 7;
    let v = mix(tv(k), tv(k + 1), fract(col + scroll));
    let y = v * mix(0.8, 1.8, F.s_intensity);
    return vec4f((col - 48.0) * 0.06, y + (c - 0.5) * 0.01, (row - 24.0) * 0.1, v);
  }
  if (form == 1u) {
    // city: a 24×24 grid of bars; each point on a bar's edge, heights from the tape (bytes first)
    let cell = vec2f(floor(a * 24.0), floor(b * 24.0));
    let k = i32(cell.x + cell.y * 24.0) + i32(scroll * 0.2);
    let v = tv(k);
    let hgt = v * mix(0.6, 2.2, F.s_intensity);
    let edge = floor(c * 4.0);
    let corner = vec2f(select(0.0, 0.07, edge == 1.0 || edge == 2.0), select(0.0, 0.07, edge >= 2.0));
    return vec4f((cell.x - 12.0) * 0.12 + corner.x, r1(i, 4u) * hgt, (cell.y - 12.0) * 0.12 + corner.y, v);
  }
  if (form == 2u) {
    // lattice: 16³ voxels, lit where the tape's bit is 1; a point jittered inside each lit voxel
    let vox = vec3f(floor(a * 16.0), floor(b * 16.0), floor(c * 16.0));
    let bitIdx = i32(vox.x + vox.y * 16.0 + vox.z * 256.0) + i32(scroll * 2.0);
    let on = f32((byteOf(bitIdx / 8) >> u32(bitIdx % 8)) & 1u);
    let j = vec3f(r1(i, 4u), r1(i, 5u), r1(i, 6u)) - 0.5;
    let p = (vox - 7.5) * 0.14 + j * 0.05;
    return vec4f(p, on * tv(bitIdx / 8) - (1.0 - on) * 2.0);
  }
  if (form == 3u) {
    // cloud: consecutive values as coordinates, points strung along the segments between them
    let k = i32(floor(a * n));
    let s = b;
    let p0 = vec3f(tv(k), tv(k + 1), tv(k + 2));
    let p1 = vec3f(tv(k + 1), tv(k + 2), tv(k + 3));
    let p = mix(p0, p1, s) - 0.5;
    let line = select(0.0, 1.0, s < 0.05 || s > 0.95);
    return vec4f(p * 3.0 + (vec3f(c, r1(i, 4u), r1(i, 5u)) - 0.5) * 0.012, mix(0.3, tv(k), line));
  }
  // tube: the tape wound into one closed curve; its radius, the values
  let s = a * TAU;
  let k = i32(a * n);
  let v = mix(tv(k), tv(k + 1), fract(a * n));
  let R = 1.4 + v * 0.9;
  let spine = vec3f(cos(s) * R, sin(s * 3.0 + scroll * 0.05) * 0.35 * (0.5 + F.s_tension), sin(s) * R);
  let ring = b * TAU;
  let tubeR = 0.03 + 0.08 * v;
  return vec4f(spine + vec3f(cos(ring), sin(ring), 0.0) * tubeR, v);
}

/** The emotion as behaviour: sadness sinks, anger jitters, joy expands, fear trembles, calm is still. */
fn behave(p: vec3f, i: u32, t: f32) -> vec3f {
  var q = p;
  let em = F.s_valence;
  q.y -= F.mo_falling * 0.25 * t * r1(i, 20u) + (1.0 - em) * F.lazy * 0.05 * t;
  q *= 1.0 + F.mo_spreading * 0.3 * ss(0.0, 1.0, F.u) + F.s_energy * 0.1 * ss(0.0, 1.0, F.u);
  let jit = F.mo_trembling * 0.02 + F.s_tension * 0.015 * F.s_arousal;
  q += (vec3f(r1(i ^ u32(t * 30.0), 21u), r1(i ^ u32(t * 30.0), 22u), r1(i ^ u32(t * 30.0), 23u)) - 0.5) * jit;
  let ang = t * (0.03 + 0.25 * F.mo_circling + 0.1 * F.s_arousal);
  return vec3f(q.x * cos(ang) - q.z * sin(ang), q.y, q.x * sin(ang) + q.z * cos(ang));
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var o: VOut;
  let res = vec2f(F.resX, F.resY);
  let corner = vec2f(select(-1.0, 1.0, (vi & 1u) == 1u), select(-1.0, 1.0, (vi & 2u) == 2u));
  let t = F.lt * mix(1.0, 0.35, F.lazy);
  if (ii == 0u) {
    // the light: a full-screen quad, drawn analytically in the fragment
    o.pos = vec4f(corner, 0.0, 1.0);
    o.q = corner;
    o.kind = 1.0;
    o.col = mix(vec3f(1.0, 0.96, 0.9), acc(), 0.15);
    return o;
  }
  let form = u32(F.variant2 + 0.5);
  let i = ii;
  // the camera: each angle orbits to its own side and height, near or far; a slow push over the shot
  let ah = hash22(vec2f(F.angle * 113.0, F.seed * 0.01)) * 0.5 + 0.5;
  let yaw = F.angle * TAU + t * 0.03;
  let low = form <= 1u; // the landscape and the city are seen from low, grazing; the others from anywhere
  let pitch = select(mix(-0.6, 0.9, ah.y), mix(0.12, 0.45, ah.y), low);
  let dist = select(mix(2.6, 5.0, ah.x), mix(3.2, 6.0, ah.x), low) * mix(1.0, 0.85, F.u) / F.zoom;
  let aim = select(vec3f(F.offX, 0.0, F.offY) * 0.6, vec3f(F.offX * 2.0, 0.15, F.offY * 2.0), low);
  let cam = aim + vec3f(cos(yaw) * cos(pitch), sin(pitch), sin(yaw) * cos(pitch)) * dist;
  let fwd = normalize(aim - cam);
  let rt = normalize(cross(fwd, vec3f(0.0, 1.0, 0.0)));
  let up = cross(rt, fwd);

  let P0 = place(i, t);
  if (P0.w < -0.5) { o.pos = vec4f(2.0, 2.0, 2.0, 1.0); return o; } // an empty voxel
  let P = vec4f(behave(P0.xyz, i, t), P0.w);
  let rel = P.xyz - cam;
  let z = dot(rel, fwd);
  if (z < 0.05) { o.pos = vec4f(2.0, 2.0, 2.0, 1.0); return o; }
  let f = 1.8; // focal length (ndc units)
  let ndc = vec2f(dot(rel, rt), dot(rel, up)) * f / z;
  // the lens: circle of confusion (CSS px) from the distance to the focal plane (the target)
  let px = res.y * 0.5;
  let aperture = mix(0.012, 0.035, F.s_intensity) * F.zoom;
  let coc = min(abs(z - dist) / z * aperture * px, 22.0);
  let point = mix(0.7, 1.3, r1(i, 9u));
  let rad = max(coc, point);
  // thin the out-of-focus points (constant cost); the kept ones carry their light
  let keep = min(1.0, pow(3.0 / rad, 2.0));
  if (r1(i, 10u) > keep) { o.pos = vec4f(2.0, 2.0, 2.0, 1.0); return o; }
  let energy = (point * point) / (rad * rad) / keep;

  // brightness from the value it carries (and a few that blaze); the accent where the value passes 0.9
  let bright = (0.05 + 0.4 * P.w * P.w + 1.5 * pow(r1(i, 11u), 14.0)) * mix(0.6, 1.1, F.s_density);
  // the accent is rare, as in the appraisal: only some of the highest values carry it
  let base = select(ink(), acc() * 1.6, P.w > 0.96 && r1(i, 15u) < 0.3);
  // the terrain's far reaches fade into the dark
  let fog = exp(-max(z - dist, 0.0) * 0.25);
  // a slow twinkle (a smooth phase per point: never a flicker)
  let tw = 0.7 + 0.3 * sin(F.time * (0.6 + r1(i, 13u)) + r1(i, 14u) * TAU);
  o.col = base * bright * energy * fog * tw * mix(0.8, 1.3, F.s_light) * ss(0.0, 0.3, F.lt);
  let sz = (rad + 1.0) / res * 2.0;
  o.pos = vec4f(ndc.x * res.y / res.x + corner.x * sz.x, ndc.y + corner.y * sz.y, 0.0, 1.0);
  o.q = corner * (rad + 1.0) / rad;
  o.kind = 0.0;
  return o;
}

@fragment
fn fs(i: VOut) -> @location(0) vec4f {
  if (i.kind > 0.5) {
    // the light at the heart of the formation: a core, a halo and a four-point star
    let res = vec2f(F.resX, F.resY);
    let p = i.q * vec2f(res.x / res.y, 1.0) - vec2f(F.offX, -F.offY) * 0.3;
    let form = u32(F.variant2 + 0.5);
    let on = select(1.0, 0.0, form <= 1u) * mix(0.3, 0.8, F.s_light);
    let d2 = dot(p, p);
    let core = exp(-d2 / 0.0004) * 5.0 + exp(-d2 / 0.02) * 0.35;
    let spikes = (exp(-abs(p.y) * 300.0) * exp(-abs(p.x) * 4.0) + exp(-abs(p.x) * 300.0) * exp(-abs(p.y) * 4.0)) * 1.2;
    return vec4f(i.col * (core + spikes) * on * ss(0.0, 0.3, F.lt), 0.0);
  }
  // a disc with a soft edge and a faint bright rim (the look of a real lens)
  let d = length(i.q);
  let disc = 1.0 - ss(0.85, 1.0, d);
  let rim = 1.0 + 0.35 * ss(0.6, 0.95, d) * disc;
  return vec4f(i.col * disc * rim, 0.0);
}
