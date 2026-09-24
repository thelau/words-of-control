// DATA — the appraisal's long echo. Each formation is a 2D reading of the
// appraisal, drawn in points of light by the very same formulas (the same tape:
// bytes, Jev's distributions and scores, the typing rhythm), repeated back into
// depth: the front layer is the reading as it is now; each layer behind it is
// the same reading a moment earlier (or the next stretch of the tape) — time
// and memory become depth. The first shot starts dead frontal, exactly the
// frame the appraisal left on screen, then the camera swings round and the
// flat reading is revealed as a volume, and flies through it.
//   0 landscape — spectrum's rows, echoed back: a spectrogram in space
//   1 city      — the barcode's bars, scrolling, echoed back: a corridor of time
//   2 lattice   — the bit grid, each layer the next bytes: a cube of the word's bits
//   3 cloud     — the scatter's return map, each layer shifted one value: a sheaf of paths
//   4 tube      — the closing line, each echo turned by the next value: a twisting ribbon
//   5 drift     — the void: sparse dust drifting, one highlight wandering through it
// Two kinds of point: most are fine dust (sharp, gone when out of focus); a few
// carry the lens (true bokeh), thinned and brightened when large so the cost
// stays flat. Monochrome with a warm/cool depth ramp and the appraisal's accent.
// The emotion is behaviour: sadness sinks, anger jitters, joy expands.
// The mood is a world: positive is warm light — a glow inside the formation
// lighting the points near it, glitter in the word's own colours (Jev's
// palette), rising and opening; neutral is clinical — cold white, axis-aligned
// views, no blur, no jitter, a constant track, like an instrument measuring;
// negative is the dark — colourless, falling, contracting, the red accent alone.

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var<storage, read> tape: array<f32>;
@group(0) @binding(2) var<storage, read> CAM: array<vec4f>;          // the frame's camera (vs reads)
@group(0) @binding(3) var<storage, read_write> CAMW: array<vec4f>;   // the same buffer (camera() writes)
// the particles: 2 vec4 each — position (xyz) + value (w, < 0 = hidden) | velocity (xyz)
@group(0) @binding(4) var<storage, read> PS: array<vec4f>;           // (vs reads)
@group(0) @binding(5) var<storage, read_write> PW: array<vec4f>;     // the same buffer (simulate() writes)

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) q: vec2f, // position in the disc (−1..1)
  @location(1) @interpolate(flat) col: vec3f,
};

fn tv(i: i32) -> f32 {
  let n = max(i32(F.tapeLen), 1);
  return tape[((i % n) + n) % n];
}
fn byteOf(i: i32) -> u32 { return u32(clamp(tv(i), 0.0, 1.0) * 255.0 + 0.5); }
fn r1(i: u32, s: u32) -> f32 { return rnd(i, s ^ u32(F.seed)); }
fn ink() -> vec3f { return vec3f(F.baseR, F.baseG, F.baseB); }
fn acc() -> vec3f { return vec3f(F.accR, F.accG, F.accB); }
fn pal(k: u32) -> vec3f {
  if (k == 0u) { return vec3f(F.p1R, F.p1G, F.p1B); }
  if (k == 1u) { return vec3f(F.p2R, F.p2G, F.p2B); }
  return vec3f(F.p3R, F.p3G, F.p3B);
}

/** The appraisal's virtual screen (px, 1000 tall) → world (y up; the frontal camera sees exactly this). */
fn scr(px: vec2f, R: vec2f) -> vec2f { return vec2f(px.x - R.x * 0.5, R.y * 0.5 - px.y) / (R.y * 0.5); }

/** Point i of the reading on its frontal plane: (x, y) in world units, z = its echo layer (0 = now … 1 = the
 *  deepest), w = the value it carries (< 0 = not drawn). The drift returns its own world position. */
fn reading(i: u32, t: f32) -> vec4f {
  let form = u32(F.variant2 + 0.5);
  let a = r1(i, 1u);
  let b = r1(i, 2u);
  let c = r1(i, 3u);
  let R = vec2f(1000.0 * F.resX / F.resY, 1000.0);
  // the echo: layer 0 is now; layer k is the reading k beats ago, k steps back in depth
  // (12 distinct planes, each dense enough to read — more would only make a haze)
  let K = 12.0;
  let k = floor(pow(r1(i, 17u), 1.4) * K);
  let tk = max(t - k * mix(0.12, 0.04, F.s_arousal), 0.0);
  // the conveyor flow: the layers stream toward you, looping; they appear from the dark at the back and the
  // front one fades as it leaves — the loop is never seen
  let conveyor = u32(F.flowOp + 0.5) == 1u;
  let z = select(k / K, fract(k / K - t * 0.05 * (0.5 + F.s_arousal)), conveyor);
  let fade = mix(1.0, 0.3, z) * select(1.0, ss(0.0, 0.1, z) * ss(1.0, 0.85, z), conveyor);
  if (form == 0u) {
    // spectrum: rows 6 px apart (points exactly on each row: lines), as long as their value; each echo one row on
    let H = R.y * 0.72;
    let row = floor(a * H / 6.0);
    let v = tv(i32(row) + i32(F.variant * 50.0) + i32(k));
    let L = v * R.x * 0.46 * ss(0.0, 0.6, F.u + row * 0.002 + 0.5);
    let x = R.x * 0.5 + (b * 2.0 - 1.0) * L;
    let p = scr(vec2f(x, (R.y - H) * 0.5 + row * 6.0), R);
    return vec4f(p, z, v * fade);
  }
  if (form == 1u) {
    // barcode: bars of the tape's bits scrolling; each echo is the barcode as it was a beat ago
    let w = 6.0 * (1.0 + floor(F.variant * 3.0));
    // (in space the bars drift, never race: a fast scroll held for seconds strobes)
    let speed = (25.0 + 140.0 * F.s_arousal) * select(1.0, -1.0, F.variant > 0.5);
    // points ride slots that slide with the scroll; a slot shows the bar passing through it, and a bar's points
    // are drawn from the bar itself — so when a slot hands over to the next bar the image is unchanged (no shimmer)
    let slots = floor(R.x / w) + 2.0;
    let slot = f32(i % u32(slots));
    let sub = f32(i / u32(slots));
    let shift = tk * speed / w;
    let idx = i32(slot + floor(shift));
    if (((byteOf(idx / 8) >> u32(((idx % 8) + 8) % 8)) & 1u) == 0u) { return vec4f(0.0, 0.0, 0.0, -1.0); }
    let band = select(R.y, R.y * (0.18 + 0.2 * F.variant), fract(F.variant * 7.0) > 0.45);
    let yb = rnd(u32(idx) * 7919u + u32(sub), 91u);
    let xc = (slot - 1.0 + 0.5 - fract(shift)) * w;
    let p = scr(vec2f(xc, R.y * 0.5 + (yb - 0.5) * band), R);
    return vec4f(p, z, (0.5 + 0.5 * tv(idx / 8)) * fade);
  }
  if (form == 2u) {
    // bits: the grid of the word's bits; each echo holds the next stretch of bytes
    let cell = 3.0 * (5.0 + floor(F.variant * 4.0));
    let side = R.y * 0.78;
    let cols = floor(side / cell);
    let ci = vec2f(floor(a * cols), floor(b * cols));
    let bi = i32(ci.y * floor(cols / 8.0) + ci.x / 8.0 + k * cols);
    if (((byteOf(bi) >> u32(i32(ci.x) % 8)) & 1u) == 0u) { return vec4f(0.0, 0.0, 0.0, -1.0); }
    let o = (R - vec2f(side)) * 0.5;
    // a lit bit is a small square drawn by its outline: crisp, readable at any depth
    let side4 = floor(c * 4.0);
    let along = r1(i, 4u);
    let sq = select(select(vec2f(along, 0.0), vec2f(1.0, along), side4 == 1.0), select(vec2f(along, 1.0), vec2f(0.0, along), side4 == 3.0), side4 >= 2.0);
    let q = o + (ci + 0.18 + sq * 0.64) * cell;
    return vec4f(scr(q, R), z, (0.4 + 0.6 * tv(bi)) * fade);
  }
  if (form == 3u) {
    // scatter: the return map (each value against the next), joined; each echo one value further on
    let side = R.y * 0.7;
    let o = (R - vec2f(side)) * 0.5;
    let j = i32(floor(a * 30.0)) + i32(k);
    let p0 = o + vec2f(tv(j), 1.0 - tv(j + 1)) * side;
    let p1 = o + vec2f(tv(j + 1), 1.0 - tv(j + 2)) * side;
    let dot_ = select(b, 0.0, r1(i, 5u) < 0.25); // a quarter of the points mark the readings themselves
    return vec4f(scr(mix(p0, p1, dot_), R), z, select(0.35, 0.9, dot_ == 0.0) * fade);
  }
  if (form == 4u) {
    // line: one line through the centre; each echo turned a little more by the next value — a ribbon
    let ang = k * (tv(i32(k)) - 0.5) * 0.35 + tk * 0.1 * (tv(i32(k) + 3) - 0.5);
    let x = (a * 2.0 - 1.0) * R.x * 0.5 / (R.y * 0.5);
    let p = vec2f(x * cos(ang), x * sin(ang) + (tv(i32(k) + 7) - 0.5) * 0.1);
    return vec4f(p, z, (0.6 + 0.4 * tv(i32(k))) * fade);
  }
  if (form == 6u) {
    // lone: a name — one point of light held at the centre, a few motes far away in a vast dark
    if (i < 400u) { return vec4f((vec3f(a, b, c) - 0.5) * 0.004, 1.0); }
    if (r1(i, 9u) > 0.01) { return vec4f(0.0, 0.0, 0.0, -1.0); }
    let dir = normalize(vec3f(a, b, c) - 0.5 + 1e-3);
    return vec4f(dir * mix(4.0, 9.0, r1(i, 10u)), 0.08);
  }
  // drift: the void — a sparse dust drifting slowly through the dark, one highlight wandering
  if (r1(i, 9u) > 0.12) { return vec4f(0.0, 0.0, 0.0, -1.0); }
  let p = (vec3f(a, b, c) - 0.5) * vec3f(8.0, 4.0, 8.0) + vec3f(t * 0.04, sin(t * 0.2 + a * 9.0) * 0.1, 0.0);
  return vec4f(p, 0.15 + 0.2 * r1(i, 10u));
}

/** A rotation of p about the y axis. */
fn rotY(p: vec3f, a: f32) -> vec3f { return vec3f(p.x * cos(a) + p.z * sin(a), p.y, -p.x * sin(a) + p.z * cos(a)); }

/** The reading made space. Operators chosen per shot by the director (F.echoOp, F.warpOp, F.flowOp), all
 *  leaving the front layer (kn = 0) exactly where the appraisal drew it:
 *   echo — how the layers stand in space: 0 back in depth · 1 round a ring (a zoetrope) · 2 a twisting tunnel ·
 *          3 onion shells · 4 fanned like pages from their lower edge · 5 burst apart into shards
 *   warp — how the matter bends: 0 none · 1 a wave · 2 a twist · 3 folded on itself · 4 falling · 5 breathing · 6 melting
 *   flow — how it moves: 0 still · 1 a conveyor (the layers stream toward you) · 2 turning · 3 pulsing */
fn shape(xy: vec2f, kn0: f32, i: u32, t: f32) -> vec3f {
  let D = mix(1.7, 3.6, F.s_scale); // the echo's full depth
  let flow = u32(F.flowOp + 0.5);
  let kn = kn0; // (the conveyor already moved the layer in reading())
  var p = vec3f(xy, 0.0);
  let e = u32(F.echoOp + 0.5);
  if (e == 0u) { p.z = -kn * D; }
  else if (e == 1u) { p = rotY(p - vec3f(0.0, 0.0, -1.6), kn * TAU * 0.92) + vec3f(0.0, 0.0, -1.6); }
  else if (e == 2u) {
    let a = kn * PI * mix(1.0, 3.0, F.s_tension);
    p = vec3f(p.x * cos(a) - p.y * sin(a), p.x * sin(a) + p.y * cos(a), -kn * D);
  }
  else if (e == 3u) {
    let r = 1.3 + kn * D * 0.8;
    let dir = normalize(vec3f(p.x, p.y, 1.3));
    p = mix(p, dir * r - vec3f(0.0, 0.0, 1.3 + kn * 0.4), ss(0.0, 0.12, kn));
  }
  else if (e == 4u) {
    let a = kn * PI * 0.85;
    let q = p + vec3f(0.0, 1.0, 0.0);
    p = vec3f(q.x, q.y * cos(a), -q.y * sin(a)) - vec3f(0.0, 1.0, 0.0);
  }
  else {
    let kk = floor(kn * 28.0);
    let d = normalize(vec3f(r1(u32(kk), 30u), r1(u32(kk), 31u), r1(u32(kk), 32u)) - 0.5 + 1e-3);
    p = rotY(p, (r1(u32(kk), 33u) - 0.5) * kn * 2.0) + d * kn * mix(0.7, 1.6, F.s_energy) * ss(0.0, 1.0, F.u + 0.2); // shards, still one body
  }
  let w = u32(F.warpOp + 0.5);
  if (w == 1u) { p.z += sin(p.x * 3.0 + t * 2.0 + kn * 4.0) * 0.15; }
  else if (w == 2u) { p = rotY(p, p.y * 1.2 * sin(t * 0.4 + 1.0)); }
  else if (w == 3u) { p.x = abs(p.x) - 0.25; p.z -= abs(p.x) * 0.6; }
  else if (w == 4u) { p.y -= r1(i, 34u) * t * 0.35 * ss(0.0, 1.0, kn + 0.3); }
  else if (w == 5u) { p *= 1.0 + 0.1 * sin(t * 1.6 + kn * 6.0); }
  else if (w == 6u) { p.y -= max(gnoise(p.xz * 2.0 + 3.0), 0.0) * t * 0.25 * (p.y + 1.2); }
  if (flow == 2u) { p = rotY(p + vec3f(0.0, 0.0, D * 0.4), t * 0.25) - vec3f(0.0, 0.0, D * 0.4); }
  else if (flow == 3u) { p *= 1.0 + 0.07 * sin(t * mix(3.0, 7.0, F.s_arousal)); }
  return p;
}

/** Where point i is (world, y up) and the value it carries (< 0 = not drawn). */
fn place(i: u32, t: f32) -> vec4f {
  let r = reading(i, t);
  if (u32(F.variant2 + 0.5) >= 5u || r.w < 0.0) { return r; }
  return vec4f(shape(r.xy, r.z, i, t), r.w);
}

/** The shot's clock: an idle word's time is slow, and a dwindling word slows down as the shot goes on. */
fn clock() -> f32 {
  let lt = F.lt * mix(1.0, 0.35, F.lazy);
  return lt * (1.0 - 0.45 * F.rh_dwindling * ss(0.0, 1.0, F.u));
}

/** One beat (s), the same tempo the sound keeps (show/rhythm.ts beatPeriod). */
fn beatP() -> f32 { return 60.0 / mix(56.0, 128.0, F.s_arousal); }

/** The rhythm as light in the matter at point P (world) — the same beats the sound plays (clips.ts pulse()):
 *  steady — a band of light passing through on every beat, clockwork; stuttering — the same band, but some
 *  beats do not come (show/rhythm.ts skipped); pulsing — a slow tide of light rolling through; strike — a
 *  shockwave ring running out from the centre in the first half-second. */
fn rhythmLight(P: vec3f) -> f32 {
  let bp = beatP();
  let x = dot(P, vec3f(0.35, 0.1, 0.2)) * 0.5 - F.lt / bp;
  let steady = exp(-pow(fract(x) - 0.5, 2.0) / 0.003);
  let comes = step(fract(floor(F.lt / bp) * 0.618 + F.variant * 7.3), 0.55);
  let tide = 0.5 + 0.5 * sin(dot(P, vec3f(0.7, 0.25, 0.6)) * 2.2 - F.lt * PI / bp);
  let ring = F.strike * exp(-pow(length(P - CAM[4].xyz) - F.lt * 4.0, 2.0) / 0.03) * ss(0.6, 0.3, F.lt);
  return 1.0 + 1.6 * (F.rh_steady + F.rh_stuttering * comes) * steady + 0.9 * F.rh_pulsing * (tide - 0.5) * 2.0 + 5.0 * ring;
}

/** How much of motion k (index into the MOTIONS order of frame.ts) plays at progress u: the main gesture
 *  holds throughout; the second one turns in during the second half (grief falls, then contracts). */
fn mw(k: u32, base: f32, u: f32) -> f32 {
  var w = base;
  if (k == u32(F.moSec + 0.5)) { w += F.moSecP * 1.4 * ss(0.4, 0.85, u); }
  return w;
}

/** The motion Jev reads in the word, played by the whole formation, big enough to read from across a room,
 *  with a shape in time (u = progress through the shot): rising lifts off; falling accelerates, the lowest
 *  points first; spreading opens wide; contracting draws in to a fifth, ease-in; breaking splits into pieces
 *  with gaps; drifting is carried on a current; trembling shivers; circling turns (never fast enough to
 *  strobe); still barely moves. The neutral mood holds it exactly where the data puts it. The rhythm's pulse
 *  throbs through it; a strike is a shockwave. */
fn behaveAt(p: vec3f, i: u32, t: f32, u: f32, gesture: f32) -> vec3f {
  var q = p;
  let exact = ss(0.45, 0.65, F.moodNeu);
  let mv0 = (1.0 - exact) * (1.0 - 0.8 * F.mo_still);
  let mv = mv0 * gesture; // (the big gestures; gesture 0 = the reading at rest, for framing)
  let e = ss(0.0, 1.0, u);
  // the big gestures (rising, falling, spreading, contracting, breaking) follow the verdict's own clock, so
  // they carry across the cuts: shame is still shrunk in its last shot, grief is still falling
  let vu = select(u, max(F.vu, u * 0.35), F.vu > 0.0);
  let ev = ss(0.0, 1.0, vu);
  let vt = select(t, F.vt * mix(1.0, 0.35, F.lazy), F.vu > 0.0);
  let wRise = mw(0u, F.mo_rising, u);
  let wFall = mw(1u, F.mo_falling, u);
  let wSpread = mw(2u, F.mo_spreading, u);
  let wContract = mw(3u, F.mo_contracting, u);
  let wCircle = mw(4u, F.mo_circling, u);
  let wTremble = mw(5u, F.mo_trembling, u);
  let wBreak = mw(7u, F.mo_breaking, u);
  let wDrift = mw(8u, F.mo_drifting, u);
  // rising: lifts off, gently accelerating
  q.y += wRise * (0.1 * vt + 0.012 * vt * vt) * (0.7 + 0.6 * r1(i, 24u)) * mv;
  // falling: under gravity, the lowest points go first
  let late = clamp((p.y + 1.0) * 0.35, 0.0, 1.0);
  let tf = max(vt - late * 1.5, 0.0);
  q.y -= wFall * (0.03 * tf + 0.012 * tf * tf) * (0.8 + 0.4 * r1(i, 20u)) * mv; // (reaches ~−1.5 over a long verdict)
  // spreading opens it out wide; contracting draws it in on itself (to a fifth, ease-in)
  q *= 1.0 + wSpread * 0.9 * ss(0.0, 0.75, vu) * mv;
  q *= 1.0 - min(wContract, 1.0) * 0.8 * ss(0.0, 0.75, vu) * mv; // (visibly shrinking from the first shot on)
  // breaking: it splits into a dozen pieces that part, leaving gaps
  if (wBreak > 0.03) {
    let piece = floor(r1(i, 50u) * 12.0);
    let pd = normalize(vec3f(r1(u32(piece), 51u), r1(u32(piece), 52u), r1(u32(piece), 53u)) - 0.5 + 1e-3);
    q += pd * wBreak * 1.2 * ss(0.05, 0.7, vu) * mv;
  }
  // drifting: carried on a current
  if (wDrift > 0.03) { q += vec3f(curl(q.xz * 0.6 + 3.0, t * 0.12), 0.0).xzy * 0.7 * wDrift * mv; }
  // a strike: the shockwave pushes the matter out as it passes (the first half-second of the strike shot)
  if (F.strike > 0.0) {
    let dr = length(q) - F.lt * 4.0;
    q += normalize(q + 1e-4) * F.strike * 0.25 * exp(-dr * dr / 0.03) * ss(0.6, 0.3, F.lt);
  }
  // trembling: smooth (8–14 Hz, each point its own phase) — never a per-frame random jump
  let jit = (wTremble * 0.09 + F.s_tension * 0.015 * F.s_arousal) * (1.0 - exact);
  let fq = 50.0 + 38.0 * r1(i, 21u);
  q += vec3f(sin(t * fq + r1(i, 22u) * TAU), sin(t * fq * 1.31 + r1(i, 23u) * TAU), sin(t * fq * 0.77 + r1(i, 26u) * TAU)) * jit * 0.5;
  // circling: the whole formation turns (never faster than ~0.3 rad/s: a radial structure strobes — the wagon wheel)
  let ang = t * min(0.03 + 0.6 * wCircle + 0.08 * F.s_arousal, 0.3) * (1.0 - exact) * (1.0 - 0.9 * F.mo_still);
  return vec3f(q.x * cos(ang) - q.z * sin(ang), q.y, q.x * sin(ang) + q.z * cos(ang));
}

fn behave(p: vec3f, i: u32, t: f32) -> vec3f { return behaveAt(p, i, t, F.u, 1.0); }

/** Once per frame: the camera. The echo is a stack of screens facing +z. Each angle looks at it from its own
 *  side and height (never straight on), 1 in 4 from inside it (macro). Where it stands is decided from the
 *  formation as it was when the angle began (F.angleAt), so the camera never hops as the points move; from
 *  there it only drifts and pushes, smoothly. The reveal angle (F.angle < 0, the
 *  first shot after the appraisal) starts dead frontal — the frame the appraisal left — then swings round;
 *  −2 (a greeting) the reverse. It frames what is really there: 32 points of the formation, as shaped, warped
 *  and moving now; it aims at the densest of them (the focus lands on structure) and stands back by the
 *  spread — a burst, a fall or a melt never leaves the camera looking at nothing. */
@compute @workgroup_size(1)
fn camera() {
  let t = clock();
  let t0 = F.angleAt * mix(1.0, 0.35, F.lazy);
  let form = u32(F.variant2 + 0.5);
  let ah = hash22(vec2f(F.angle * 113.0, F.seed * 0.01)) * 0.5 + 0.5;
  let inside = fract(F.angle * 5.17) < 0.25 && form < 5u;
  let exact = F.moodNeu > 0.5;
  // neutral: the instrument's views — straight on, side on, from above — tracking at constant speed
  let axis = floor(ah.x * 3.0);
  // (a held camera — the word's own gesture is the motion — never drifts)
  let yaw = select((ah.x * 2.0 - 1.0) * 1.3 + t * 0.03 * mix(1.0, 0.5, F.moodPos) * (1.0 - F.hold), select(0.0, 1.5708 * sign(ah.y - 0.5), axis == 1.0), exact);
  let pitch = select((ah.y * 2.0 - 1.0) * 0.5, select(0.0, 1.45, axis == 2.0), exact);
  var pts: array<vec3f, 32>;
  var got = 0u;
  var sum = vec3f(0.0);
  for (var k = 0u; k < 64u; k++) {
    if (got == 32u) { break; }
    // half the samples on the reading at rest, half where the gesture ends — the whole gesture is seen
    let atEnd = (k & 1u) == 1u;
    let tk = select(t0, F.dur * mix(1.0, 0.35, F.lazy), atEnd);
    let cand = place(u32(fract(abs(F.angle) * 7.71 + f32(k / 2u) * 0.07373) * 159000.0) + 1u, tk);
    // (framing both, the word's gesture — a contraction, a fall, a spreading — is seen against the frame,
    // never zoomed back to its old size, and never lost out of it)
    if (cand.w >= 0.0) { let q = behaveAt(cand.xyz, 0u, tk, select(F.angleAt / max(F.dur, 0.1), 1.0, atEnd), select(0.0, 1.0, atEnd)); pts[got] = q; sum += q; got += 1u; }
  }
  let centre = select(vec3f(0.0, 0.0, -1.2), sum / f32(max(got, 1u)), got > 0u);
  var spread = 0.8;
  var densest = centre;
  var best = -1.0;
  for (var k = 0u; k < got; k++) {
    spread = max(spread, length(pts[k] - centre));
    var near = 0.0;
    for (var j = 0u; j < got; j++) { near += exp(-dot(pts[k] - pts[j], pts[k] - pts[j]) / 0.15); }
    if (near > best) { best = near; densest = pts[k]; }
  }
  // wide angles aim between the densest structure and the centre; inside, at the structure itself
  let aimPt = mix(densest, centre, select(0.4, 0.0, inside));
  let reach = select(spread * mix(1.0, 1.6, ah.y), mix(0.3, 0.6, ah.x), inside && !exact);
  let track = select(vec3f(0.0), vec3f(cos(yaw), 0.0, -sin(yaw)) * (t * 0.06 - 0.3), exact);
  let orbit = aimPt + track + vec3f(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)) * reach * mix(1.0, 0.85, F.u) / F.zoom;
  let reveal = select(select(1.0, ss(0.6, 2.8, F.lt), F.angle < 0.0), 1.0 - ss(0.4, 3.5, F.lt), F.angle < -1.5);
  let cam = mix(vec3f(0.0, 0.0, 1.8), orbit, reveal);
  let aim = mix(vec3f(0.0), aimPt + track, reveal);
  let fwd = normalize(aim - cam);
  let rt = normalize(cross(fwd, select(vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, -1.0), abs(fwd.y) > 0.98)));
  CAMW[0] = vec4f(cam, length(aim - cam));
  CAMW[1] = vec4f(fwd, select(0.0, 1.0, inside));
  CAMW[2] = vec4f(rt, 0.0);
  CAMW[3] = vec4f(cross(rt, fwd), 0.0);
  CAMW[4] = vec4f(aimPt, 0.0);
}

/** How long a detached particle lives (s) before it returns to its place (fire, sand, smoke). */
// materials, in the MATERIALS order of frame.ts
const METAL = 0u; const GLASS = 1u; const STONE = 2u; const SAND = 3u; const WATER = 4u; const ICE = 5u;
const SMOKE = 6u; const FIRE = 7u; const CLOTH = 9u; const FLESH = 10u; const LIGHT = 11u; const VOID = 12u;
// textures, in the TEXTURES order: smooth grainy crystalline liquid powdery fibrous cracked soft
const T_GRAINY = 1u; const T_CRYSTAL = 2u; const T_POWDER = 4u; const T_CRACKED = 6u; const T_SOFT = 7u;

/** The matter particle i is made of: the word's first material, or — for a share of the particles, as Jev
 *  weighs them — its second (shame: fire and water — embers among waves, steam). */
fn pmat(i: u32) -> u32 { return select(u32(F.matTop + 0.5), u32(F.matSec + 0.5), r1(i, 70u) < F.matShare); }
/** 1 if particle i is of material k, scaled by how sure Jev is of the word's matter. */
fn isM(i: u32, k: u32) -> f32 { return select(0.0, F.matSure, pmat(i) == k); }
/** How sure Jev is of the word's main texture, if it is k. */
fn isT(k: u32) -> f32 { return select(0.0, F.txSure, u32(F.txTop + 0.5) == k); }
fn crystalOf(i: u32) -> f32 { return max(max(isM(i, ICE), isM(i, GLASS)), isT(T_CRYSTAL)); }

/** How long a detached particle lives (s): embers and grains briefly, then back to their place; smoke long,
 *  and it does not come back. */
fn lifeOf(i: u32) -> f32 { return select(mix(1.2, 3.2, r1(i, 42u)), mix(6.0, 10.0, r1(i, 42u)), pmat(i) == SMOKE); }

/** Whether particle i detaches, and which way: 0 embers rising (fire) · 1 grains falling (sand) · 2 smoke
 *  drifting away (smoke). Half of a fire's or a sand's particles, 45% of a smoke's. */
fn detach(i: u32) -> i32 {
  if (u32(F.variant2 + 0.5) >= 5u) { return -1; }
  let m = pmat(i);
  let r = r1(i, 40u) / max(F.matSure, 0.05);
  if (m == FIRE && r < 0.5) { return 0; }
  if (m == SAND && r < 0.5) { return 1; }
  if (m == SMOKE && r < 0.45) { return 2; }
  return -1;
}

/** Once per frame, every particle. Its place in the formation is where the reading puts it; the matter the
 *  word is made of decides how it lives there (abstract, never an illustration):
 *  water — the formation undulates, a slow travelling wave · flesh — it breathes · cloth — it waves ·
 *  stone, metal — stiff and heavy (settles slowly, holds still) · fire, sand, smoke — a share of the points
 *  detach for a short life (rising embers, falling grains, drifting smoke) and return to their place.
 *  Attached points follow their place through a critically damped spring: the matter has inertia, it
 *  travels, never jumps. On a new shot, or when a point's place jumps (a new identity), it is placed. */
@compute @workgroup_size(256)
fn simulate(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= arrayLength(&PW) / 2u) { return; }
  let t = clock();
  let T0 = place(i, t);
  var goal = select(behave(T0.xyz, i, t), PW[i * 2u].xyz, T0.w < 0.0);
  // water: waves of two scales roll through it; flesh: it breathes; cloth: a wave runs across it;
  // ice and glass: it crystallises — its points snap, more and more, to a fine grid
  goal.y += (sin(goal.x * 2.6 + goal.z * 1.3 - t * 1.4) * 0.24 + sin(goal.x * 5.7 - goal.z * 3.1 - t * 2.3) * 0.09) * isM(i, WATER);
  goal *= 1.0 + 0.08 * sin(t * 1.5) * isM(i, FLESH);
  goal.z += sin(goal.x * 3.0 + t * 1.1) * 0.12 * isM(i, CLOTH);
  let crystal = crystalOf(i) * ss(0.0, 0.8, F.vu);
  goal = mix(goal, round(goal * 18.0) / 18.0, crystal);
  let kind = detach(i);
  let L = lifeOf(i);
  if (F.mode > 0.5) {
    // a new shot: in place; the detaching points start their lives staggered, so they leave one by one
    PW[i * 2u] = vec4f(goal, T0.w);
    PW[i * 2u + 1u] = vec4f(0.0, 0.0, 0.0, -r1(i, 43u) * L);
    return;
  }
  var p = PW[i * 2u].xyz;
  var v = PW[i * 2u + 1u].xyz;
  var life = PW[i * 2u + 1u].w;
  let dt = min(F.dt, 1.0 / 30.0);
  if (kind >= 0) { life += dt; }
  // embers and grains return to their place for another life; smoke is gone for good
  if (kind >= 0 && kind != 2 && life > L) { life -= L + r1(i ^ u32(t * 7.0), 44u) * 0.5; p = goal; v = vec3f(0.0); }
  // embers only leave from the top of the matter: a low point waits
  if (kind == 0 && life >= 0.0 && life < dt * 1.5 && goal.y < 0.1 - 0.4 * r1(i, 71u)) { life = -r1(i, 72u) * L; }
  if (kind >= 0 && life >= 0.0) {
    // detached: its own short life
    if (kind == 0) { v += (vec3f(0.0, 0.9, 0.0) + vec3f(curl(p.xz * 3.0, t * 0.7), 0.0).xzy * 0.8) * dt; v *= exp(-0.6 * dt); }
    else if (kind == 1) { v += vec3f(0.0, -2.2, 0.0) * dt; }
    else { v += vec3f(curl(p.xy * 1.6 + 5.0, t * 0.25), 0.0) * 0.45 * dt; v *= exp(-0.9 * dt); }
    p += v * dt;
    PW[i * 2u] = vec4f(p, T0.w);
    PW[i * 2u + 1u] = vec4f(v, life);
    return;
  }
  // a far jump is not motion but a new identity (a point handed from one bar to the next): placed, not flown
  if (length(goal - p) > 0.2) { PW[i * 2u] = vec4f(goal, T0.w); PW[i * 2u + 1u] = vec4f(0.0, 0.0, 0.0, life); return; }
  // stone and metal are stiff and heavy; everything else follows lightly
  let heavy = clamp(isM(i, STONE) + isM(i, METAL) * 0.6, 0.0, 1.0);
  let w0 = mix(25.0, 9.0, heavy); // rad/s: the heavy settle slowly and hold
  v += ((goal - p) * w0 * w0 - v * 2.0 * w0) * dt;
  p += v * dt;
  PW[i * 2u] = vec4f(p, T0.w);
  PW[i * 2u + 1u] = vec4f(v, life);
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) i: u32) -> VOut {
  var o: VOut;
  o.pos = vec4f(2.0, 2.0, 2.0, 1.0); // culled unless placed below
  let res = vec2f(F.resX, F.resY);
  let corner = vec2f(select(-1.0, 1.0, (vi & 1u) == 1u), select(-1.0, 1.0, (vi & 2u) == 2u));
  let t = clock();
  let form = u32(F.variant2 + 0.5);

  // the camera, computed once per frame (camera() above)
  let cam = CAM[0].xyz;
  let fwd = CAM[1].xyz;
  let rt = CAM[2].xyz;
  let up = CAM[3].xyz;
  let aimPt = CAM[4].xyz;
  let dist = CAM[0].w;
  let inside = CAM[1].w > 0.5;
  let exact = F.moodNeu > 0.5;

  // the simulated particle — or, with ?engine=old (F.engineOld), the formula directly (for comparison)
  var P0 = PS[i * 2u];
  var P = P0.xyz;
  if (F.engineOld > 0.5) { P0 = place(i, t); P = behave(P0.xyz, i, t); }
  if (P0.w < 0.0) { return o; }
  // the void thins the matter out
  if (r1(i, 45u) < isM(i, VOID) * 0.75) { return o; }
  // cracked: the matter opens along cracks (gaps that stay put as it moves)
  if (isT(T_CRACKED) > 0.2 && abs(gnoise(P.xy * 5.0 + P.z * 2.0 + 7.0)) < 0.05 * isT(T_CRACKED) * 2.0) { return o; }
  // a detached particle (fire, sand, smoke): how far through its short life
  let kind = select(detach(i), -1, F.engineOld > 0.5);
  let lifeU = select(0.0, clamp(PS[i * 2u + 1u].w / lifeOf(i), 0.0, 1.0), kind >= 0 && PS[i * 2u + 1u].w >= 0.0);
  let rel = P - cam;
  let z = dot(rel, fwd);
  if (z < 0.05) { return o; }
  let ndc = vec2f(dot(rel, rt), dot(rel, up)) * 1.8 / z;

  // the lens: circle of confusion (CSS px) from the distance to the focal plane (the aim)
  // (water, stone and crystal are sharp: no lens blur on them)
  let sharp = max(max(isM(i, WATER), isM(i, STONE)), crystalOf(i));
  let aperture = mix(0.012, 0.035, F.s_intensity) * F.zoom * select(1.0, 1.25, inside) * select(1.0, 0.1, exact) * (1.0 - 0.7 * sharp);
  // (the frame is measured by its short side, so a portrait phone sees the whole formation)
  let side = min(res.x, res.y);
  let coc = min(abs(z - dist) / z * aperture * side * 0.5, 12.0); // (a disc never larger than 12 px: no shot goes to soup)
  // dust (85%): fine and sharp, and gone when out of focus; carriers (15%): the lens's discs
  // (drifting smoke is always soft)
  let carrier = (r1(i, 16u) < mix(0.06, 0.1, F.moodPos) + 0.15 * isM(i, LIGHT) + 0.12 * isT(T_SOFT) && isM(i, STONE) < 0.5) || (kind == 2 && lifeU > 0.0); // the positive glitters (never a haze of discs)
  // never smaller than a pixel (a sub-pixel point sparkles as the camera moves): a finer point is drawn
  // at 1 px and dimmer instead
  let fine = select(mix(0.55, 0.85, r1(i, 9u)), mix(0.8, 1.4, r1(i, 9u)), carrier) * (1.0 - 0.25 * max(isT(T_GRAINY), isT(T_POWDER)));
  let point = max(fine, 1.0);
  let rad = select(point, max(coc, point), carrier);
  // out-of-focus points are thinned — faded in and out over a band, never popped
  let keep = select(exp(-coc / 7.0), min(1.0, pow(3.0 / rad, 2.0)), carrier);
  let fadeIn = clamp((keep - r1(i, 10u)) / 0.2 + 0.5, 0.0, 1.0);
  if (fadeIn <= 0.0) { return o; }
  // swelling: more and more of the matter lights up across the verdict; dwindling: it goes out, grain by
  // grain, to a last few (a smooth band per point: nothing pops)
  let vis = mix(1.0, mix(0.3, 1.0, F.vu), F.rh_swelling) * mix(1.0, mix(1.0, 0.06, pow(F.vu, 0.8)), F.rh_dwindling);
  let present = clamp((vis - r1(i, 60u)) / 0.08, 0.0, 1.0);
  if (present <= 0.0) { return o; }
  let energy = select(1.0, (point * point) / (rad * rad) / keep, carrier) * select(0.7, 1.8, carrier)
             * (fine * fine) / (point * point) * fadeIn;

  // brightness from the value it carries (a few blaze); a warm/cool ramp with depth, chosen by the word
  let v = P0.w;
  let bright = (0.18 + 1.1 * v * v + 1.5 * pow(r1(i, 11u), 14.0)) * mix(0.9, 1.3, F.s_density);
  let warm = vec3f(1.0, 0.86, 0.72);
  let cool = vec3f(0.72, 0.84, 1.0);
  let lean = F.s_valence * 0.5 + F.s_temperature * 0.5; // warm near for a warm word, cool near for a cold one
  let depth = ss(0.0, 1.0, (z - dist * 0.6) / (dist * 1.2));
  var tone = ink() * mix(mix(cool, warm, lean), mix(warm, cool, lean), depth);
  // the mood's colour: the positive's glitter takes the word's palette and a warm light glows inside it;
  // the neutral is cold instrument white; the negative drains to colourless
  let neg = max(1.0 - F.moodPos - F.moodNeu, 0.0);
  let glitter = pal(u32(r1(i, 18u) * 2.99)) * 1.3;
  tone = mix(tone, glitter, F.moodPos * select(0.5, 0.95, carrier));
  tone = mix(tone, vec3f(0.85, 0.92, 1.05), ss(0.5, 0.7, F.moodNeu));
  tone = mix(tone, vec3f(dot(tone, vec3f(0.33))), neg * 0.8);
  let glow = 1.0 + F.moodPos * 3.0 * exp(-dot(P - aimPt, P - aimPt) / 0.35);
  // the accent, as in the appraisal: on high values, more often for an intense word
  let accented = v > 0.85 && r1(i, 15u) < mix(0.15, 0.6, F.s_intensity);
  let base = select(tone, acc() * 1.6, accented);
  let fog = exp(-max(z - dist, 0.0) * 0.25);
  // a slow twinkle (a smooth phase per point: never a flicker)
  // (stone never twinkles; grain and powder twinkle harder)
  let twk = 0.25 * (1.0 - isM(i, STONE)) * (1.0 + 1.5 * max(isT(T_GRAINY), isT(T_POWDER)));
  let tw = 1.0 - twk + twk * sin(F.time * (0.6 + r1(i, 13u)) + r1(i, 14u) * TAU);
  // the drift's one wandering highlight
  var lamp = select(1.0, 6.0, form == 5u && i % 997u == 0u);
  // the matter's light: glass, ice and metal catch sharp glints (a smooth phase per point: never a flicker);
  // water's light shimmers across it; light itself glows
  // glass and ice: sharp glints; metal: longer, harder ones
  let hard = isM(i, GLASS) + isM(i, ICE) * 0.8;
  lamp *= 1.0 + 10.0 * hard * pow(max(sin(F.time * (1.5 + 2.0 * r1(i, 46u)) + r1(i, 47u) * TAU), 0.0), 60.0);
  lamp *= 1.0 + 7.0 * isM(i, METAL) * pow(max(sin(F.time * (0.8 + r1(i, 46u)) + r1(i, 47u) * TAU), 0.0), 16.0);
  // water: light catches the slopes of its waves (the same waves as simulate())
  let wph = P.x * 2.6 + P.z * 1.3 - t * 1.4;
  lamp *= 1.0 + 2.2 * isM(i, WATER) * pow(max(cos(wph), 0.0), 6.0);
  // light blooms; fire's matter darkens as it burns, across the verdict
  lamp *= 1.0 + 1.6 * isM(i, LIGHT);
  lamp *= 1.0 - 0.65 * isM(i, FIRE) * ss(0.0, 1.0, F.vu) * select(1.0, 0.0, kind == 0 && lifeU > 0.0);
  // contracting: denser, brighter as it draws in
  lamp *= 1.0 + 1.5 * F.mo_contracting * ss(0.0, 1.0, F.vu);
  // the pulse lights the matter; a swelling word brightens as the shot goes on, a dwindling one fades
  lamp *= rhythmLight(P) * present;
  // detached: embers cool from hot to dark as they rise; grains fade as they fall; smoke thins
  var ember = vec3f(1.0);
  if (lifeU > 0.0) {
    if (kind == 0) { ember = mix(vec3f(2.4, 1.1, 0.4), vec3f(0.5, 0.12, 0.03), lifeU) * (0.8 + 0.2 * sin(F.time * 4.0 + r1(i, 48u) * TAU)); } // a slow glow, never a strobe
    lamp *= 1.0 - lifeU * select(select(0.8, 0.6, kind == 1), 1.0, kind == 2); // (smoke fades out entirely)
  }
  o.col = base * ember * bright * energy * fog * tw * lamp * glow * mix(0.8, 1.3, F.s_light) * ss(0.0, 0.3, F.lt);
  let sz = (rad + 1.0) / res * 2.0;
  o.pos = vec4f(ndc.x * side / res.x + corner.x * sz.x, ndc.y * side / res.y + corner.y * sz.y, 0.0, 1.0);
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
