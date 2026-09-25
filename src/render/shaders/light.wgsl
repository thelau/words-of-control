// LIGHT — the word as pure light: almost no objects, a pool of coloured light falling on a dark ground (Turrell's
// fields, Sugimoto's horizons, Eliasson's light through water). The most minimal species.
//
// The hand-off: it opens on the appraisal's return map (the scatter reading: each value against the next, dots
// joined in order, a crosshair on the newest) — the same dots in the same places, frontal. The lines go out, the
// dots become points of light, each opens into a soft pool, and the word's light grows out of them; the points
// travel to its edge and stay there as glints, flaring on the beats.
//
// The light's form is the word's shape, told by how the light falls, never drawn as an outline: a round pool, a
// pane broken jagged, a long river of light, slivers through cracks, three spots crossing (brighter where they
// overlap: light adds), a horizon (a razor line, a faint sky above, a dark sea below), the light turning into a
// vortex, light dappled through branches, one point lamp lighting the ground around it.
// Inside it the light passes through the word's matter (the medium): water casts true caustics (a heightfield of
// eight waves, one per value of the reading; the lens's Jacobian solved backward, so the network has real folds and
// cusps), glass and ice refract hard and split into colour (per channel), smoke is shafts in a slow volume, fire an
// ember glow that never flickers, metal a polished sheen with hard glints, stone/sand/wood a surface raked by grazing
// light, cloth soft luminous folds, flesh a warm translucency, light itself the softest sheets, void nearly nothing.
// A share of the second material takes a region of the light. The ground under it has its own faint grain, so the
// light reads as falling on something. The mood is the colour, never an inversion: positive the word's palette as a
// slowly turning Turrell gradient, a soft penumbra; neutral an exact cool white, a razor edge and a measuring
// hairline; negative colourless, hard, narrower and dimmer. The motion moves the light (rises, sinks and dims, opens,
// closes to a slit, turns, trembles, breaks into shards, drifts). The beat sends a wave of light from one point
// through the medium (the sound's chime, audio/species/light.ts); a strike is one wavefront crossing the dark; a
// tide breathes; swelling/dwindling brighten/fade; a lazy word is slower. Who: I — inside the light (it overflows the
// frame, its near edges out of focus); you — facing it; we — it turns around you; they — far, small, soft.
// Per shot (warpOp): seen frontal, cast on a floor in perspective, leaking out as shafts, or only its edges
// (dark-field); (flowOp): held, sliding across, turning, breathing.
// setup() computes the points, the light's transform, the beat and the eight waves once a frame; fs() draws.
// World units: 1 = half the screen's height, y up, origin at the centre (the scatter's square is ±0.7).

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var<storage, read> tape: array<f32>;
@group(0) @binding(2) var<storage, read_write> SW: array<vec4f>;
@group(0) @binding(3) var<storage, read> S: array<vec4f>;
@group(0) @binding(5) var prev: texture_2d<f32>;
@group(0) @binding(6) var lin: sampler;

// state: 0..NP the points (world xy, luminance, alive); 32 the light (trans.xy, rot, scale); 33 (squash y, open,
// the light's clock, points); 34 the beat's wave (point, radius, amp); 35 the camera (zoom, off xy, rot);
// 36 (near, gain, shards, lensing); 40..48 the waves (k.xy, amplitude, ω)
const NP = 30;

fn tv(i: i32) -> f32 {
  let n = max(i32(F.tapeLen), 1);
  return tape[((i % n) + n) % n];
}
fn beatP() -> f32 { return 60.0 / mix(56.0, 128.0, F.s_arousal); }
fn npts() -> i32 { return clamp(i32(F.tapeLen) - 1, 2, NP); }

fn shapeTop() -> i32 {
  let sh = array<f32, 9>(F.sh_round, F.sh_jagged, F.sh_flowing, F.sh_splintered, F.sh_knotted, F.sh_flat, F.sh_spiral, F.sh_branching, F.sh_point);
  var best = 0;
  for (var i = 1; i < 9; i++) { if (sh[i] > sh[best]) { best = i; } }
  return best;
}

/** How much of motion k plays now (MOTIONS order): the main gesture, the second turning in later. */
fn mw(k: f32) -> f32 {
  return select(0.0, 1.0, F.moTop == k) + select(0.0, F.moSecP * 1.6 * ss(0.35, 0.8, F.vu), F.moSec == k);
}

/** The last beat before now (−1 if none) and the time since it; a stutter skips beats (show/rhythm.ts skipped). */
fn lastBeat() -> vec2f {
  let P = beatP();
  var b = floor(F.vt / P);
  if (F.rh_stuttering > 0.35 && fract(b * 0.618) > 0.55) { b -= 1.0; }
  if (b < 0.0) { return vec2f(-1.0, 99.0); }
  return vec2f(b, F.vt - b * P);
}

fn neg() -> f32 { return clamp(1.0 - F.moodPos - F.moodNeu, 0.0, 1.0); }
fn rot2(p: vec2f, a: f32) -> vec2f { return vec2f(p.x * cos(a) - p.y * sin(a), p.x * sin(a) + p.y * cos(a)); }
/** A palette colour brought to full brightness (its hue, as light). */
fn hue(c: vec3f) -> vec3f { return c / max(max(c.r, max(c.g, c.b)), 1e-3); }

/** The light's size: the word's scale; a negative word's light is narrower. */
fn apR() -> f32 { return mix(0.4, 0.6, F.s_scale) * mix(1.0, 0.72, neg()); }

fn segD(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0));
}

/** Knotted: three elliptical spots through each other (ellipse j, signed distance, approximate). */
fn spot(q: vec2f, j: i32) -> f32 {
  let R = apR();
  let r = rot2(q, f32(j) * PI / 3.0 + tv(j + 90) + F.vt * 0.03);
  return (length(r / vec2f(R, R * 0.42)) - 1.0) * R * 0.42;
}

/** Branching: the branches whose shadows dapple the light (a tree from the reading). */
fn branches(q: vec2f) -> f32 {
  let R = apR();
  var d = segD(q, vec2f(0.1 * R, -R * 1.6), vec2f(0.0, -R * 0.1)) - R * 0.05;
  for (var j = 0; j < 7; j++) {
    let lv = f32(min(j, 5) / 2);
    let base = vec2f((tv(j + 100) - 0.5) * R * 0.8, -R * 0.1 + lv * R * 0.3);
    let a = PI * 0.5 + (tv(j + 105) - 0.5) * 2.4;
    let len = R * (1.1 - 0.25 * lv) * (0.7 + 0.5 * tv(j + 110));
    d = min(d, segD(q, base, base + vec2f(cos(a), sin(a)) * len) - R * (0.03 - 0.007 * lv));
  }
  return d;
}

/** The light's form (the word's shape) as a signed distance in its own space: (distance, softness of its edge). */
fn apSDF(q: vec2f) -> vec2f {
  let R = apR();
  switch shapeTop() {
    case 1: { // jagged: a pane broken — an irregular polygon, its corners the reading's values
      let a = atan2(q.y, q.x) / TAU + 0.5;
      let j = floor(a * 9.0);
      let f = fract(a * 9.0);
      let r = R * mix(0.55 + 0.6 * tv(i32(j) + 60), 0.55 + 0.6 * tv((i32(j) + 1) % 9 + 60), f);
      return vec2f((length(q) - r) * 0.8, 0.6);
    }
    case 2: { // flowing: a long river of light
      let x = q.x / R;
      let c = 0.3 * R * sin(x * 1.6 + tv(0) * 6.0 + F.vt * 0.2) + 0.1 * R * sin(x * 3.9 + tv(1) * 6.0);
      let th = R * 0.34 * (0.75 + 0.35 * sin(x * 1.1 + tv(2) * 6.0));
      return vec2f((abs(q.y - c) - th) * 0.85, 1.4);
    }
    case 3: { // splintered: slivers of light through cracks
      var d = 9.0;
      for (var j = 0; j < 5; j++) {
        let a = tv(j * 2 + 70) * PI;
        let c = (vec2f(tv(j * 2 + 71), tv(j * 3 + 72)) - 0.5) * R * 1.2;
        let dir = vec2f(cos(a), sin(a)) * R * (0.45 + 0.5 * tv(j + 80));
        d = min(d, segD(q, c - dir, c + dir) - R * (0.04 + 0.05 * tv(j + 85)));
      }
      return vec2f(d, 0.5);
    }
    case 4: { return vec2f(min(spot(q, 0), min(spot(q, 1), spot(q, 2))), 1.0); } // knotted
    case 5: { return vec2f(abs(q.y) - R * 0.005, 0.25); }                      // flat: a horizon
    case 8: { return vec2f(length(q) - R * 0.035, 0.3); }                      // point: a lamp
    default: { return vec2f(length(q) - R, 1.0); }                             // round, spiral, branching: a pool
  }
}

/** What else the form does to the light: (its strength inside, a glow it spreads on the ground around it). */
fn apLight(q: vec2f) -> vec2f {
  let R = apR();
  switch shapeTop() {
    case 4: { // three spots: light adds where they cross
      let s = ss(0.02, -0.02, spot(q, 0)) + ss(0.02, -0.02, spot(q, 1)) + ss(0.02, -0.02, spot(q, 2));
      return vec2f(0.25 + 0.45 * s, 0.0);
    }
    case 2: { return vec2f(1.0 - ss(0.9, 2.3, abs(q.x / R)), 0.0); } // a river fades out at its ends
    case 5: { // a horizon: a faint sky above, a darker sea below
      return vec2f(1.6, select(0.035 * exp(q.y / (0.12 * R)), 0.1 * exp(-q.y / (0.5 * R)), q.y > 0.0));
    }
    case 7: { return vec2f(mix(0.1, 1.0, ss(-0.004, 0.05 * R, branches(q * 1.1 + vec2f(0.0, 0.1)))), 0.0); } // dappled
    case 8: { return vec2f(3.0, 0.035 * R * R / (dot(q, q) + 0.004)); }       // a lamp: 1/r² on the ground
    default: { return vec2f(1.0, 0.0); }
  }
}

/** The light's own space: the world point w with its motion undone. */
fn apQ(w: vec2f) -> vec2f {
  let A = S[32];
  let q = rot2(w - A.xy, -A.z) / A.w;
  return vec2f(q.x, q.y / S[33].x);
}
/** A breaking word's form splits into shards, each carried its own way. */
fn shards(q: vec2f) -> vec2f {
  let sh = S[36].z;
  if (sh < 0.001 || shapeTop() == 5) { return q; } // (a horizon does not shatter)
  let g = rot2(q, 0.6) * 3.2;
  let cell = floor(g + 0.35 * sin(g.yx * 1.7));
  return q - hash22(cell + vec2f(F.seed % 97.0)) * sh * 0.25;
}

// ---------------------------------------------------------------- setup: the points, the light, the beat, the waves
@compute @workgroup_size(128)
fn setup(@builtin(local_invocation_index) li: u32) {
  let i = i32(li);
  let tl = F.vt * mix(1.0, 0.4, F.lazy);
  let u = F.vu;
  // the opening: the reading's dots open into light over the first seconds (longer for an idle word)
  let o = ss(0.15, mix(2.6, 4.0, F.lazy), F.vt);
  // the light's gesture (MOTIONS order), grown in with the opening so the first frame is the reading itself
  var tr = vec2f(0.0);
  var ro = 0.0;
  var sc = 1.0;
  tr.y += 0.35 * ss(0.0, 1.0, u) * mw(0.0);                                   // rising
  tr.y -= 0.45 * pow(u, 1.3) * mw(1.0);                                       // falling
  sc *= 1.0 + 0.7 * ss(0.0, 1.0, u) * mw(2.0);                                // spreading
  var sq = mix(1.0, 0.05, ss(0.05, 0.85, u) * mw(3.0));                       // contracting: closes to a slit
  sc *= 1.0 + 0.3 * ss(0.05, 0.85, u) * mw(3.0);
  ro += select(tl * 0.2, 0.35 * sin(tl * 0.3), shapeTop() == 2 || shapeTop() == 5) * mw(4.0); // circling (a long form sways)
  tr += vec2f(gnoise(vec2f(tl * 1.7, 3.0)), gnoise(vec2f(7.0, tl * 1.7))) * 0.016 * mw(5.0); // trembling (smooth)
  sc *= 1.0 + 0.015 * sin(tl * 0.7) * (mw(6.0) + 0.4);                        // still: it barely breathes
  tr.x += (0.45 * (u - 0.35) + 0.04 * sin(tl * 0.5)) * mw(8.0);               // drifting
  // the shot's movement (flowOp): held, sliding across, turning, breathing
  let fo = i32(F.flowOp);
  let calm = mix(1.0, 0.3, F.mo_still);
  if (fo == 1) { tr.x += (F.u - 0.5) * 0.18 * calm; }
  if (fo == 2 && shapeTop() != 5) { ro += F.lt * 0.06 * calm; }
  if (fo == 3) { sc *= 1.0 + 0.05 * sin(F.vt * PI / beatP() * 0.5); }
  // who: "we" — it turns around you (a horizon stays level)
  ro += F.who_we * tl * 0.05 * select(1.0, 0.0, shapeTop() == 5);
  tr *= o; ro *= o;
  sc = mix(1.0, sc, o);
  sq = mix(1.0, sq, o);
  if (i == 0) {
    SW[32] = vec4f(tr, ro, sc);
    SW[33] = vec4f(sq, o, tl, f32(npts()));
    // the camera: the hand-off (angle −1) opens dead frontal; each later angle its own framing; where you stand
    let front = F.angle < 0.0;
    let k = select(1.0, o, front);
    let ah = hash22(vec2f(F.angle * 113.0, F.seed * 0.01));
    let near = mix(1.0, 1.9, F.who_i) * mix(1.0, 0.5, F.who_they * mix(0.5, 1.0, F.s_distance));
    let off = vec2f(F.offX, F.offY) * 0.35 * select(0.0, 1.0, F.zoom > 1.0) + select(ah * 0.08, vec2f(0.0), front);
    let tilt = select(ah.x * 0.08, 0.0, front || shapeTop() == 5);
    SW[35] = vec4f(mix(1.0, F.zoom * near, k), off * k, tilt * k);
    // the gain: swelling grows, dwindling fades, falling dims (sadness is light losing itself), a pulsing tide
    let tide = 1.0 + 0.3 * F.rh_pulsing * (0.5 - 0.5 * cos(F.vt * PI / beatP()));
    let gain = max(0.15, 1.0 + 0.5 * F.rh_swelling * (2.0 * u - 1.0) - 0.7 * F.rh_dwindling * u) * (1.0 - 0.45 * u * mw(1.0)) * tide;
    // lensing: water and liquid words fold the light most
    let lam = mix(0.8, 1.3, clamp(F.m_water + F.tx_liquid * 0.5 + F.s_tension * 0.3, 0.0, 1.0));
    SW[36] = vec4f(near, gain, mw(7.0) * ss(0.1, 1.0, u) * o, lam);
  }
  // the eight waves of the medium: one per value of the reading (direction, wavelength), amplitude ∝ 1/k²
  if (i >= 40 && i < 48) {
    let j = i - 40;
    let a = tv(j * 3 + 20) * TAU + f32(j) * 0.9;
    let kk = mix(3.5, 11.0, tv(j * 3 + 21));
    let amp = (0.4 + 0.6 * tv(j * 3 + 22)) / (kk * kk) * select(1.0, -1.0, j % 2 == 1);
    let om = sqrt(kk) * 0.3 * mix(1.0, 2.0, F.mo_trembling) * mix(1.0, 0.25, F.m_ice) * mix(1.0, 0.3, F.mo_still);
    SW[i] = vec4f(vec2f(cos(a), sin(a)) * kk, amp, om);
  }
  if (i < NP) {
    let n = npts();
    // where the scatter drew it (appraisal.wgsl scatter(): its square is 0.7 of the height, centred)
    let sp = (vec2f(tv(i), tv(i + 1)) - 0.5) * 1.4;
    // where it goes: onto the light's edge, the nearest point (projected along the distance's gradient)
    var p = sp;
    if (shapeTop() == 5) { p = vec2f(sp.x * 1.6, 0.0); } // a horizon gathers them on its line
    for (var it = 0; it < 3; it++) {
      let e = 0.004;
      let d0 = apSDF(p).x;
      let g = vec2f(apSDF(p + vec2f(e, 0.0)).x - apSDF(p - vec2f(e, 0.0)).x, apSDF(p + vec2f(0.0, e)).x - apSDF(p - vec2f(0.0, e)).x) / (2.0 * e);
      p -= g / max(length(g), 1e-3) * d0;
    }
    if (shapeTop() == 8) { p = sp * 0.1; } // a lamp's points gather round it
    var w = mix(sp, p, ss(0.0, 1.0, o));
    // carried by the light's motion
    w.y *= sq;
    w = rot2(w * sc, ro) + tr;
    // the beat: this point flares, softly (a swell, not a flash)
    let lb = lastBeat();
    let fl = select(0.0, exp(-lb.y / 0.5) * ss(0.0, 0.08, lb.y), lb.x >= 0.0 && i32(lb.x) % n == i);
    // bright as dots, then settling to glints once the light holds
    let lum = select(0.0, 1.0, i < n) * (mix(1.0, 0.4, o) + fl * 1.6);
    SW[i] = vec4f(w, lum, select(0.0, 1.0, i < n));
    if (i == 0) {
      // the wave of light the beat sends from its point through the medium
      let amp = select(0.0, exp(-lb.y / 1.3) * ss(0.0, 0.05, lb.y), lb.x >= 0.0) * (0.35 + F.rh_steady * 0.4 + F.rh_stuttering * 0.4 + F.rh_pulsing * 0.3);
      SW[34] = vec4f(f32(i32(max(lb.x, 0.0)) % n), lb.y * 0.5, amp * o, 0.0);
    }
  }
}

// ---------------------------------------------------------------- the medium
struct Wv { g: vec2f, h: vec3f };
/** The waves' height gradient and Hessian (xx, yy, xy) at p. */
fn waves(p: vec2f, t: f32) -> Wv {
  var g = vec2f(0.0);
  var h = vec3f(0.0);
  for (var j = 0; j < 8; j++) {
    let w = S[40 + j];
    let ph = dot(w.xy, p) + w.w * t + f32(j) * 1.7;
    g += w.z * cos(ph) * w.xy;
    h -= w.z * sin(ph) * vec3f(w.x * w.x, w.y * w.y, w.x * w.y);
  }
  return Wv(g, h);
}

/** Light through a moving surface: the lens's Jacobian, solved backward (two steps) so its folds land where the
 *  light does; per channel for dispersion. */
fn caustic(p: vec2f, t: f32, lam: f32, eps: f32, disp: f32) -> vec3f {
  var x = p;
  for (var it = 0; it < 2; it++) { x = p - lam * waves(x, t).g; }
  let H = waves(x, t).h;
  let tr = H.x + H.y;
  let dt = H.x * H.y - H.z * H.z;
  let l = lam * vec3f(1.0 - disp, 1.0, 1.0 + disp);
  let det = 1.0 + l * tr + l * l * dt;
  return 1.0 / (abs(det) + eps);
}

/** Pool caustics: the bright web light draws through moving water — the cell edges of slowly wandering centres
 *  (each cell a lens), bent by a slow current. Returns the distance to the nearest edge. */
fn web(p: vec2f, t: f32) -> f32 {
  let q = p + vec2f(gnoise(p * 0.45 + t * 0.1), gnoise(p * 0.45 + 5.0 - t * 0.1)) * 0.9;
  let i = floor(q);
  var d1 = 9.0; var d2 = 9.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let c = i + vec2f(f32(x), f32(y));
      let h = hash22(c + vec2f(F.seed % 41.0));
      let cp = c + 0.5 + 0.38 * vec2f(sin(t * (0.6 + 0.3 * h.x) + h.y * 6.0), cos(t * (0.5 + 0.3 * h.y) + h.x * 6.0));
      let d = length(q - cp);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return d2 - d1;
}

/** A surface raked by grazing light (stone, sand, wood): its relief lit from the side. */
fn raked(p: vec2f, t: f32) -> f32 {
  let e = 0.01;
  let h0 = fbm(p, 3);
  let n = normalize(vec3f(-(fbm(p + vec2f(e, 0.0), 3) - h0) / e, -(fbm(p + vec2f(0.0, e), 3) - h0) / e, 2.2));
  let a = 2.5 + 0.2 * sin(t * 0.1);
  let L = normalize(vec3f(cos(a), sin(a), 0.3));
  return 0.25 + 1.6 * pow(max(dot(n, L), 0.0), 1.5);
}

/** The light through matter m (MATERIALS order) at p: its intensity per channel (about 1 on average); ff = the
 *  pixel's footprint (fine detail fades where it would alias). */
fn medium(m: i32, p: vec2f, t: f32, ff: f32) -> vec3f {
  let lam = S[36].w;
  let cr = F.tx_crystalline;
  let soft = F.tx_soft;
  let aa = ff * 40.0;
  switch m {
    case 0: { return cup(p, t) * mix(vec3f(1.0), vec3f(1.1, 1.0, 0.9), 0.5); } // metal: a mirror's caustic
    case 1: { return folds(p * 1.2, t * 0.5, lam * 1.25, mix(0.04, 0.25, soft) + aa, 0.1 + cr * 0.06) * 1.2; } // glass
    case 2: { // stone: light raking across a mineral surface from one side, dying across it
      let a = 2.5 + 0.2 * sin(t * 0.1);
      let x = dot((p - S[32].xy) / (apR() * S[32].w), -vec2f(cos(a), sin(a)));
      return vec3f(pow(raked(p * 8.0, t) * 0.55, 2.2) * 1.6 * ss(-1.1, 0.8, x));
    }
    case 3: { return vec3f(raked(p * 13.0, t) * (0.6 + 0.8 * hash41(floor(p * 400.0), 1.0).x)) * 0.6; } // sand
    case 4: { // water: caustics — two webs, the finer one fainter, where they cross the light gathers
      // (each line a little split into colour: red spreads widest, blue keeps to the core)
      let e = vec3f(1.2, 1.0, 0.8) * (mix(0.014, 0.07, soft) + aa);
      let a = exp(-web(p * 3.6, t * 0.8) / e);
      let b = exp(-web(p * 6.9 + vec2f(3.1, 1.7), t * 1.1) / (e * 1.3));
      return (0.05 + 2.2 * a + 0.8 * b + 3.0 * a * b) * mix(1.0, 1.3, lam - 0.8);
    }
    case 5: { // ice: hard facets, their edges split into cold colour
      let e = vec3f(1.3, 1.0, 0.75) * (mix(0.01, 0.05, soft) + aa);
      let a = exp(-web(p * 2.6, t * 0.15) / e);
      return (0.06 + 2.6 * a) * vec3f(0.85, 0.95, 1.1) + folds(p * 1.4, t * 0.2, lam, 0.1 + aa, 0.06) * 0.5;
    }
    case 6: { // smoke: light made visible in a slow volume
      let v = fbm(p * 1.4 + vec2f(t * 0.05, t * 0.08), 3) * 0.5 + 0.5;
      let sh = gnoise(vec2f(p.x * 5.0 + p.y * 1.2, t * 0.05)) * 0.5 + 0.5;
      return vec3f(0.08 + 1.4 * v * v * v + 0.7 * ss(0.45, 0.9, sh) * v);
    }
    case 7: { // fire: embers — veins of heat glowing through dark crust, slow, never a flicker
      let e = mix(0.03, 0.09, soft) + aa;
      let v = web(p * 3.0 + vec2f(0.0, -t * 0.04), t * 0.12);
      let heat = exp(-v / e) * (0.9 + 0.6 * gnoise(p * 1.3 + vec2f(t * 0.03)));
      let h = clamp(heat, 0.0, 1.4);
      return mix(vec3f(0.35, 0.03, 0.005), vec3f(1.8, 1.0, 0.45), ss(0.2, 1.1, h)) * (0.04 + 2.2 * h * h);
    }
    case 8: { return vec3f(raked(p * vec2f(2.0, 18.0), t)) * 0.7; }                       // wood: across its fibres
    case 9: { return folds(p * 1.2, t * 0.4, lam * 0.8, 0.2 + aa, 0.0); }               // cloth: soft folds
    case 10: { // flesh: light through skin — soft folds glowing red where it is thin, faint veins
      let vein = exp(-web(p * 2.2, t * 0.05) / 0.04);
      return folds(p * 1.1, t * 0.3, lam * 0.8, 0.12 + aa, 0.0) * vec3f(1.3, 0.6, 0.45) * (1.0 - 0.45 * vein) + vec3f(0.08, 0.02, 0.01);
    }
    case 12: { return vec3f(0.05); } // void: nearly nothing
    default: { // light itself: light thrown back off moving water onto a wall — silky folds, slowly turning
      return folds(p * 2.4, t * 0.35, lam * 1.1, 0.035 + aa, 0.015);
    }
  }
}

/** Refracted light's folds (light off water on a ceiling, through glass): the caustic with its dim average taken
 *  away, so only the folds and their sheets of light remain. */
fn folds(p: vec2f, t: f32, lam: f32, eps: f32, disp: f32) -> vec3f {
  let c = caustic(p, t, lam, eps, disp);
  return vec3f(0.06) + max(c - vec3f(0.55), vec3f(0.0)) * 0.55;
}

/** Metal: light in a polished ring — the coffee-cup caustic (a nephroid: two bright arcs meeting in a cusp), its
 *  light turning slowly with the source, and the mirror's own lit wall. p: world; the ring is the light's pool. */
fn cup(p: vec2f, t: f32) -> vec3f {
  let R = apR() * S[32].w;
  let a = t * 0.08 + tv(7) * TAU;
  let q = rot2((p - S[32].xy) / R, -a);
  var dmin = 9.0;
  var c0 = vec2f(0.0, -0.92);
  for (var i = 1; i <= 24; i++) {
    let th = (f32(i) / 24.0 - 0.5) * PI;
    let c = vec2f(3.0 * cos(th) - cos(3.0 * th), 3.0 * sin(th) - sin(3.0 * th)) * 0.25 * 0.92;
    dmin = min(dmin, segD(q, c0, c));
    c0 = c;
  }
  let r = length(q);
  // the cusp brightest, the lit wall glinting
  let cusp = exp(-length(q - vec2f(0.46, 0.0)) / 0.04);
  let wall = exp(-abs(r - 0.94) / 0.012) * ss(0.2, -0.6, q.x);
  let glint = pow(max(0.0, cos(atan2(q.y, q.x) * 23.0 + t * 0.3)), 60.0) * wall;
  return vec3f(0.01 + 2.8 * exp(-dmin / 0.01) + 0.35 * exp(-dmin / 0.08) + cusp * 2.0 + wall * 0.6 + glint * 3.0);
}

/** The medium where the light falls: the first material, a region of the second (its share), the texture. */
fn lightAt(p: vec2f, t: f32, ff: f32) -> vec3f {
  let r = 0.5 + 0.6 * gnoise(p * 1.1 + vec2f(F.seed % 53.0, 2.0));
  let k = ss(1.0 - F.matShare - 0.08, 1.0 - F.matShare + 0.08, r) * ss(0.02, 0.1, F.matShare);
  var c: vec3f;
  if (k < 0.01) { c = medium(i32(F.matTop), p, t, ff); }
  else if (k > 0.99) { c = medium(i32(F.matSec), p, t, ff); }
  else { c = mix(medium(i32(F.matTop), p, t, ff), medium(i32(F.matSec), p, t, ff), k); }
  if (F.tx_grainy > 0.05) { c *= mix(1.0, 0.45 + 1.1 * hash41(floor(p * 300.0), 5.0).x, F.tx_grainy * 0.8); }
  if (F.tx_cracked > 0.05) { c *= mix(1.0, ss(0.0, 0.06, abs(gnoise(p * 5.0 + vec2f(F.seed % 37.0)))), clamp(F.tx_cracked * 1.3, 0.0, 1.0)); } // dark fissures
  if (F.tx_fibrous > 0.05) { c *= mix(1.0, 0.6 + 0.8 * (gnoise(vec2f(p.x * 2.0, p.y * 70.0)) + 0.5), F.tx_fibrous); }
  if (F.tx_powdery > 0.05) { // motes: dust hanging in the light
    let h = hash41(floor(p * 160.0 + vec2f(0.0, t * 2.0)), 9.0);
    c += vec3f(step(0.992, h.x) * 3.0 * F.tx_powdery);
  }
  // the ground it falls on: its own faint unevenness
  return c * (0.85 + 0.2 * gnoise(p * 3.1 + 7.0));
}

// ---------------------------------------------------------------- the frame
@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let res = vec2f(F.resX, F.resY);
  let hpx = res.y * 0.5; // px per world unit (before the camera)
  let C = S[35];
  let o = S[33].y;
  let tl = S[33].z;
  let n = i32(S[33].w);
  let ng = neg();
  let R = apR();
  let ws = (fc.xy - res * 0.5) / hpx * vec2f(1.0, -1.0);
  var w = rot2(ws, C.w) / C.x + C.yz;
  let pxw = 1.0 / (hpx * C.x); // one pixel in world units

  // the shot's light (warpOp): 0 frontal, 1 cast on a floor, 2 leaking out as shafts, 3 only its edges
  let lo = i32(F.warpOp) % 4;
  var coc = 0.3 + 1.8 * F.who_they * F.s_distance + 1.2 * F.tx_soft;
  var ff = pxw;
  var sky = 1.0;
  if (lo == 1) {
    // the floor: the light falls on a dark ground seen from low; the horizon high, nothing above it
    let yh = 0.62 / C.x;
    let z = 0.6 / max(yh - w.y, 0.02);
    let tk = ss(0.3, 1.0, o);
    sky = mix(1.0, ss(0.0, 0.3, yh - w.y), tk);
    w = mix(w, vec2f(w.x * z, 0.8 - z) * 0.85, tk);
    ff = mix(pxw, pxw * z * z, tk);
    coc += min(abs(z - 0.8) * 5.0, 10.0) * tk;
  }

  let q = apQ(w);
  let sd = apSDF(shards(q));
  let d = sd.x * S[32].w * min(S[33].x * 1.6, 1.0);
  let al = apLight(q);
  // the edge: a razor for the neutral and the negative, a soft penumbra for the positive and the soft
  let e = (0.003 + 0.09 * F.moodPos * (1.0 - 0.5 * ng) + 0.03 * F.tx_soft) * sd.y + pxw * 0.8;
  // the light grows out of the points (soft pools that open, then give way to the form)
  var dp = 9.0;
  let pool = 0.12 * ss(0.0, 0.45, o) * (1.0 - ss(0.55, 1.0, o));
  if (pool > 0.0005) {
    for (var k = 0; k < NP; k++) {
      if (k >= n) { break; }
      dp = min(dp, length(w - S[k].xy) - pool);
    }
  }
  let grow = (1.0 - ss(0.2, 1.0, o)) * 0.6;
  let ep = max(e, 0.035 * (1.0 - o));
  // its edge splits a little into colour, as through a lens (red outermost); glass, ice and crystal split more
  let disp = 0.002 + 0.006 * clamp(F.m_glass + F.m_ice + F.tx_crystalline, 0.0, 1.0);
  let dd = min(d + grow, dp);
  let fillC = vec3f(ss(ep, -ep, dd - disp), ss(ep, -ep, dd), ss(ep, -ep, dd + disp)) * sky;
  let fill = fillC.g;
  let glow = al.y * ss(0.3, 1.0, o) * sky;
  // a faint spill on the ground round the light, so it falls on something (never a haze)
  let spill = exp(-max(dd, 0.0) / 0.12) * 0.008 * ss(0.3, 1.0, o) * sky;

  // the shafts: light leaking out of the light into the dark (smoke thickens them)
  var shaft = 0.0;
  if (lo == 2 && d > 0.0) {
    let dir = normalize(w - S[32].xy + vec2f(1e-4));
    let nz = gnoise(dir * 5.0 + vec2f(F.seed % 17.0, tl * 0.04)) * 0.5 + 0.5;
    shaft = ss(0.5, 0.95, nz) * exp(-d / (0.35 + 0.6 * F.m_smoke)) * (0.2 + 0.35 * F.m_smoke) * ss(0.0, 0.6, o) * sky;
  }

  // the light itself (the medium swirls for a spiral word)
  var wm = w;
  if (shapeTop() == 6) {
    let v = w - S[32].xy;
    wm = S[32].xy + rot2(v, 2.6 * ss(1.3 * R, 0.0, length(v)) + tl * 0.05);
  }
  var med = vec3f(0.0);
  if (fillC.r + glow + shaft > 0.002) { med = lightAt(wm, tl, ff); }

  // the beat's wave through the medium, and the strike's wavefront across the dark
  let bw = S[34];
  let wave = bw.z * exp(-pow((length(w - S[i32(bw.x)].xy) - bw.y) / 0.06, 2.0));
  let strike = F.strike * exp(-F.lt / 0.9) * exp(-pow((length(w - S[32].xy) - F.lt * 1.4) / 0.02, 2.0)) * ss(0.0, 0.05, F.lt);

  // colour: the mood (never an inversion). The positive: the palette as a field, its gradient slowly turning and
  // shifting over the verdict (Turrell); the neutral an exact cool white; the negative grey
  let ga = 1.5708 + (F.vu * 1.1 + tl * 0.02) * (1.0 - F.moodNeu);
  let gy = clamp(0.5 + dot(w - S[32].xy, vec2f(cos(ga), sin(ga))) / (2.2 * R * S[32].w), 0.0, 1.0);
  let cPos = mix(hue(vec3f(F.p2R, F.p2G, F.p2B)), hue(vec3f(F.p1R, F.p1G, F.p1B)), ss(0.0, 1.0, gy + 0.3 * (F.vu - 0.5)));
  let cNeu = mix(vec3f(0.78, 0.88, 1.0), vec3f(0.92, 0.96, 1.0), gy);
  let tint = cPos * F.moodPos + cNeu * F.moodNeu + vec3f(0.8) * ng;
  let level = 0.3 * F.moodPos + 0.32 * F.moodNeu + 0.24 * ng;
  let ml = dot(med, vec3f(0.2126, 0.7152, 0.0722));
  let mc = mix(med, vec3f(pow(ml, 1.3)), ng); // colourless, harder
  var lit = mc;
  if (lo == 3) { lit = mc * mc * mc * 0.35; } // dark-field: only the brightest of the light remains, its filaments
  var col = tint * lit * level * (fillC * al.x + glow + shaft) * (1.0 + wave * 1.6) + tint * spill;
  // the edge's line: an exact hairline for the neutral and the negative
  let rim = ss(pxw * 1.5, 0.0, abs(d)) * ss(0.7, 1.0, o) * sky;
  let rimC = vec3f(0.85, 0.93, 1.0) * F.moodNeu * 0.12 + vec3f(0.9) * ng * 0.2;
  col += rimC * rim * min(al.x, 1.0);
  col += vec3f(1.0, 0.97, 0.92) * strike;

  // the points: the reading's dots, which became the light (the return map's lines and crosshair go out first)
  let ink = vec3f(F.baseR, F.baseG, F.baseB);
  let lineK = 1.0 - ss(0.1, 1.1, F.vt);
  var pts = vec3f(0.0);
  for (var k = 0; k < NP; k++) {
    if (k >= n) { break; }
    let P = S[k];
    let v = (w - P.xy) / pxw;
    let d2 = dot(v, v);
    if (d2 > 3600.0 && lineK <= 0.0) { continue; }
    let sz = 0.8 + 2.0 * o * ss(0.5, 1.5, P.z);
    let pc = mix(ink, mix(tint, vec3f(1.0), 0.6), o);
    pts += pc * P.z * (exp(-d2 / sz) * 1.3 + exp(-sqrt(d2) / (4.0 + 6.0 * o)) * 0.06 * o) * select(1.0, o, k == 0);
    if (lineK > 0.0 && k + 1 < n) {
      pts += ink * 0.39 * lineK * max(0.0, 1.0 - segD(w, P.xy, S[k + 1].xy) / pxw);
    }
  }
  if (lineK > 0.0) {
    // the crosshair on the newest reading, inside the reading's square
    let lp = S[n - 1].xy;
    let inSq = step(abs(w.x), 0.7 + pxw * 2.0) * step(abs(w.y), 0.7 + pxw * 2.0);
    let ch = max(ss(pxw * 0.5, 0.0, abs(w.x - lp.x)), ss(pxw * 0.5, 0.0, abs(w.y - lp.y)));
    pts += vec3f(F.accR, F.accG, F.accB) * 0.98 * ch * inSq * (1.0 - ss(0.0, 0.5, F.vt));
  }
  col += pts * sky;

  col *= S[36].y * mix(1.0, 0.6, F.m_void);
  // "I": inside the light — its near edges fall out of focus
  coc += F.who_i * 4.0 * ss(0.3, 1.1, length(ws));
  // light has a little persistence on the eye (never across a cut)
  if (F.mode < 0.5 && F.lt - F.angleAt > 0.08) {
    col = mix(col, textureSampleLevel(prev, lin, fc.xy / res, 0.0).rgb, 0.15);
  }
  return vec4f(max(col, vec3f(0.0)), clamp(coc * o, 0.0, 16.0));
}
