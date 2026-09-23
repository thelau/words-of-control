// DATA — the appraisal gone 3D (Ryoji Ikeda's move from raster to space, seen
// through a macro lens: references video-a/c/f/h/i). Points of light in space,
// every one placed by the word's own data (the same tape the 2D readings show:
// bytes, Jev's distributions and scores, the typing rhythm). No simulation
// state: a point's place is computed from its index and the time, in one of
// six formations (F.variant2), each the 3D form of a 2D reading:
//   0 landscape — spectrum → the tape as rows of streaming lines (a spectrogram in space)
//   1 city      — barcode → bars whose heights are the values: bright caps, stems fading to the floor
//   2 lattice   — bits → a cube of voxels, lit where the bit is 1
//   3 cloud     — scatter → each value against the next two: a smooth path through the return map, puffs at its vertices
//   4 tube      — line → the tape as one closed curve in space, fraying into dust
//   5 drift     — the void: sparse dust drifting, one highlight wandering through it
// Two kinds of point: most are fine dust (sub-pixel, sharp, gone when out of
// focus); a few carry the lens (a disc as wide as their circle of confusion —
// true bokeh), thinned and brightened when large so the cost stays flat.
// Monochrome with a warm/cool depth ramp chosen by the word; the accent, as in
// the appraisal, on high values. The emotion is behaviour: sadness sinks, anger
// jitters, joy expands, circling turns.

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var<storage, read> tape: array<f32>;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) q: vec2f, // position in the disc (−1..1)
  @location(1) @interpolate(flat) col: vec3f,
};

fn tv(i: i32) -> f32 {
  let n = max(i32(F.tapeLen), 1);
  return tape[((i % n) + n) % n];
}
/** The tape, smoothed (4 taps) and continuous at x (in values). */
fn tvs(x: f32) -> f32 {
  let k = i32(floor(x));
  let f = fract(x);
  let a = tv(k - 1); let b = tv(k); let c = tv(k + 1); let d = tv(k + 2);
  return mix(mix(a, b, 0.75) * 0.5 + b * 0.5, mix(c, d, 0.25) * 0.5 + c * 0.5, ss(0.0, 1.0, f));
}
fn byteOf(i: i32) -> u32 { return u32(clamp(tv(i), 0.0, 1.0) * 255.0 + 0.5); }
fn r1(i: u32, s: u32) -> f32 { return rnd(i, s ^ u32(F.seed)); }
fn ink() -> vec3f { return vec3f(F.baseR, F.baseG, F.baseB); }
fn acc() -> vec3f { return vec3f(F.accR, F.accG, F.accB); }

/** A return-map vertex: three consecutive values as a point in the unit cube, centred. */
fn rv(k: i32) -> vec3f { return vec3f(tv(k), tv(k + 1), tv(k + 2)) - 0.5; }

/** Where point i is (world, y up) and the value it carries (0..1; < 0 = not drawn). */
fn place(i: u32, t: f32) -> vec4f {
  let form = u32(F.variant2 + 0.5);
  let a = r1(i, 1u);
  let b = r1(i, 2u);
  let c = r1(i, 3u);
  let n = max(F.tapeLen, 1.0);
  let scroll = t * mix(2.0, 14.0, F.s_arousal); // the data streams past, faster when charged
  if (form == 0u) {
    // landscape: 40 rows, each a continuous line of the (smoothed) tape streaming along x
    let row = floor(b * 40.0);
    let x = a * 96.0;
    let v = tvs(x + scroll + row * 5.0);
    return vec4f((x - 48.0) * 0.06, v * mix(0.6, 1.5, F.s_intensity), (row - 20.0) * 0.12, v);
  }
  if (form == 1u) {
    // city: a 20×20 grid of bars; points gather at the caps, stems thin toward the floor
    let cell = vec2f(floor(a * 20.0), floor(b * 20.0));
    let v = tv(i32(cell.x + cell.y * 20.0) + i32(scroll * 0.2));
    let hgt = v * mix(0.6, 2.0, F.s_intensity);
    let along = 1.0 - pow(c, 5.0); // mostly near 1: the cap
    let side = r1(i, 4u);
    let off = select(vec2f(side * 0.06, 0.0), vec2f(0.0, side * 0.06), r1(i, 5u) > 0.5);
    return vec4f((cell.x - 10.0) * 0.14 + off.x, along * hgt, (cell.y - 10.0) * 0.14 + off.y, v * mix(0.25, 1.0, along * along));
  }
  if (form == 2u) {
    // lattice: 16³ voxels, lit where the tape's bit is 1; a point jittered inside each lit voxel
    let vox = vec3f(floor(a * 16.0), floor(b * 16.0), floor(c * 16.0));
    let bitIdx = i32(vox.x + vox.y * 16.0 + vox.z * 256.0) + i32(scroll * 2.0);
    let on = (byteOf(bitIdx / 8) >> u32(bitIdx % 8)) & 1u;
    if (on == 0u) { return vec4f(0.0, 0.0, 0.0, -1.0); }
    let j = vec3f(r1(i, 4u), r1(i, 5u), r1(i, 6u)) - 0.5;
    return vec4f((vox - 7.5) * 0.14 + j * 0.05, tv(bitIdx / 8));
  }
  if (form == 3u) {
    let k = i32(floor(a * min(n, 90.0)));
    if (r1(i, 7u) < 0.35) {
      // a puff of dust around a vertex
      let g = vec3f(r1(i, 4u), r1(i, 5u), r1(i, 6u)) * 2.0 - 1.0;
      return vec4f(rv(k) * 3.0 + g * g * g * 0.12, tv(k) * 0.8);
    }
    // the path: a smooth (Catmull-Rom) curve through the vertices, fading along its length behind a moving head
    let s = b;
    let p0 = rv(k - 1); let p1 = rv(k); let p2 = rv(k + 1); let p3 = rv(k + 2);
    let s2 = s * s; let s3 = s2 * s;
    let p = 0.5 * ((2.0 * p1) + (-p0 + p2) * s + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * s2 + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * s3);
    let head = fract(scroll * 0.01);
    let age = fract(head - (f32(k) + s) / min(n, 90.0));
    return vec4f(p * 3.0, mix(0.9, 0.1, age));
  }
  if (form == 4u) {
    // tube: the smoothed tape wound into one closed curve; a thin skin, fraying into dust
    let s = a * TAU;
    let v = tvs(a * min(n, 24.0)); // a slow reading: the curve breathes, never saw-tooths
    let R = 1.4 + v * 0.9;
    let spine = vec3f(cos(s) * R, sin(s * 3.0 + scroll * 0.05) * 0.35 * (0.5 + F.s_tension), sin(s) * R);
    let ring = b * TAU;
    let fray = select(0.0, pow(c, 3.0) * 0.5, r1(i, 8u) < 0.2);
    let tubeR = min(0.02 + 0.03 * v, 0.04) + fray;
    return vec4f(spine + vec3f(cos(ring) * cos(s), sin(ring), cos(ring) * sin(s)) * tubeR, v * (1.0 - fray * 1.6));
  }
  // drift: the void — a sparse dust drifting slowly through the dark, one highlight wandering
  if (r1(i, 9u) > 0.12) { return vec4f(0.0, 0.0, 0.0, -1.0); }
  let p = (vec3f(a, b, c) - 0.5) * vec3f(8.0, 4.0, 8.0) + vec3f(t * 0.04, sin(t * 0.2 + a * 9.0) * 0.1, 0.0);
  return vec4f(p, 0.15 + 0.2 * r1(i, 10u));
}

/** The emotion as behaviour: sadness sinks, anger jitters, joy expands, circling turns, calm is still. */
fn behave(p: vec3f, i: u32, t: f32) -> vec3f {
  var q = p;
  q.y -= F.mo_falling * 0.25 * t * r1(i, 20u) + (1.0 - F.s_valence) * F.lazy * 0.05 * t;
  q *= 1.0 + F.mo_spreading * 0.3 * ss(0.0, 1.0, F.u) + F.s_energy * 0.1 * ss(0.0, 1.0, F.u);
  let jit = F.mo_trembling * 0.02 + F.s_tension * 0.015 * F.s_arousal;
  let h = u32(t * 30.0);
  q += (vec3f(r1(i ^ h, 21u), r1(i ^ h, 22u), r1(i ^ h, 23u)) - 0.5) * jit;
  let ang = t * (0.03 + 0.25 * F.mo_circling + 0.1 * F.s_arousal);
  return vec3f(q.x * cos(ang) - q.z * sin(ang), q.y, q.x * sin(ang) + q.z * cos(ang));
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) i: u32) -> VOut {
  var o: VOut;
  o.pos = vec4f(2.0, 2.0, 2.0, 1.0); // culled unless placed below
  let res = vec2f(F.resX, F.resY);
  let corner = vec2f(select(-1.0, 1.0, (vi & 1u) == 1u), select(-1.0, 1.0, (vi & 2u) == 2u));
  let t = F.lt * mix(1.0, 0.35, F.lazy);
  let form = u32(F.variant2 + 0.5);

  // the camera: each angle orbits to its own side and height; 4 in 10 go inside the formation (macro)
  let ah = hash22(vec2f(F.angle * 113.0, F.seed * 0.01)) * 0.5 + 0.5;
  let inside = fract(F.angle * 5.17) < 0.4 && form != 5u;
  let yaw = F.angle * TAU + t * 0.03;
  let low = form <= 1u; // the landscape and the city are seen from low, grazing; the others from anywhere
  let pitch = select(mix(-0.6, 0.9, ah.y), mix(0.12, 0.45, ah.y), low);
  let far = select(mix(2.6, 5.0, ah.x), mix(3.2, 6.0, ah.x), low);
  let dist = select(far, mix(0.4, 1.2, ah.x), inside) * mix(1.0, 0.85, F.u) / F.zoom;
  // aim (and focus) on a real point of the formation, so the focal plane always lands on structure
  var aim = vec3f(0.0);
  for (var k = 0u; k < 4u; k++) {
    let cand = place(u32(fract(F.angle * 7.71 + f32(k) * 0.137) * 159000.0) + 1u, t);
    if (cand.w >= 0.0) { aim = behave(cand.xyz, 0u, t) * select(0.7, 1.0, inside); break; }
  }
  let cam = aim + vec3f(cos(yaw) * cos(pitch), sin(pitch), sin(yaw) * cos(pitch)) * dist;
  let fwd = normalize(aim - cam);
  let rt = normalize(cross(fwd, vec3f(0.0, 1.0, 0.0)));
  let up = cross(rt, fwd);

  let P0 = place(i, t);
  if (P0.w < 0.0) { return o; }
  let P = behave(P0.xyz, i, t);
  let rel = P - cam;
  let z = dot(rel, fwd);
  if (z < 0.05) { return o; }
  let ndc = vec2f(dot(rel, rt), dot(rel, up)) * 1.8 / z;

  // the lens: circle of confusion (CSS px) from the distance to the focal plane (the aim)
  let aperture = mix(0.012, 0.035, F.s_intensity) * F.zoom * select(1.0, 2.0, inside);
  let coc = min(abs(z - dist) / z * aperture * res.y * 0.5, 22.0);
  // dust (85%): fine and sharp, and gone when out of focus; carriers (15%): the lens's discs
  let carrier = r1(i, 16u) < 0.15;
  let point = select(mix(0.55, 0.85, r1(i, 9u)), mix(0.8, 1.4, r1(i, 9u)), carrier);
  let rad = select(point, max(coc, point), carrier);
  let keep = select(exp(-coc / 2.5), min(1.0, pow(3.0 / rad, 2.0)), carrier);
  if (r1(i, 10u) > keep) { return o; }
  let energy = select(1.0, (point * point) / (rad * rad) / keep, carrier) * select(0.7, 1.8, carrier);

  // brightness from the value it carries (a few blaze); a warm/cool ramp with depth, chosen by the word
  let v = P0.w;
  let bright = (0.06 + 0.5 * v * v + 1.5 * pow(r1(i, 11u), 14.0)) * mix(0.6, 1.1, F.s_density);
  let warm = vec3f(1.0, 0.86, 0.72);
  let cool = vec3f(0.72, 0.84, 1.0);
  let lean = F.s_valence * 0.5 + F.s_temperature * 0.5; // warm near for a warm word, cool near for a cold one
  let depth = ss(0.0, 1.0, (z - dist * 0.6) / (dist * 1.2));
  let tone = ink() * mix(mix(cool, warm, lean), mix(warm, cool, lean), depth);
  // the accent, as in the appraisal: on high values, more often for an intense word
  let accented = v > 0.85 && r1(i, 15u) < mix(0.15, 0.6, F.s_intensity);
  let base = select(tone, acc() * 1.6, accented);
  let fog = exp(-max(z - dist, 0.0) * 0.25);
  // a slow twinkle (a smooth phase per point: never a flicker)
  let tw = 0.75 + 0.25 * sin(F.time * (0.6 + r1(i, 13u)) + r1(i, 14u) * TAU);
  // the drift's one wandering highlight
  let lamp = select(1.0, 6.0, form == 5u && i % 997u == 0u);
  o.col = base * bright * energy * fog * tw * lamp * mix(0.8, 1.3, F.s_light) * ss(0.0, 0.3, F.lt);
  let sz = (rad + 1.0) / res * 2.0;
  o.pos = vec4f(ndc.x * res.y / res.x + corner.x * sz.x, ndc.y + corner.y * sz.y, 0.0, 1.0);
  o.q = corner * (rad + 1.0) / rad;
  return o;
}

@fragment
fn fs(i: VOut) -> @location(0) vec4f {
  // a disc with a soft edge and a faint bright rim (the look of a real lens)
  let d = length(i.q);
  let disc = 1.0 - ss(0.85, 1.0, d);
  let rim = 1.0 + 0.35 * ss(0.6, 0.95, d) * disc;
  return vec4f(i.col * disc * rim, 0.0);
}
