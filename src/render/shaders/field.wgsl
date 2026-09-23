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

/** The emotion as behaviour: sadness sinks, anger jitters, joy expands and rises, circling turns, calm is still.
 *  The neutral mood holds everything exactly where the data puts it. */
fn behave(p: vec3f, i: u32, t: f32) -> vec3f {
  var q = p;
  let exact = ss(0.45, 0.65, F.moodNeu);
  q.y -= (F.mo_falling * 0.25 * t * r1(i, 20u) + (1.0 - F.s_valence) * F.lazy * 0.05 * t) * (1.0 - exact);
  q.y += F.moodPos * 0.25 * t * r1(i, 24u) * r1(i, 25u); // the positive rises, unhurried
  // the positive opens outward; the negative contracts, drawn in on itself
  let neg = 1.0 - F.moodPos - F.moodNeu;
  q *= 1.0 + (F.mo_spreading * 0.3 + F.moodPos * 0.25 - neg * 0.12) * ss(0.0, 1.0, F.u) * (1.0 - exact) + F.s_energy * 0.1 * ss(0.0, 1.0, F.u);
  let jit = (F.mo_trembling * 0.02 + F.s_tension * 0.015 * F.s_arousal) * (1.0 - exact);
  // a tremble, smooth (8–14 Hz, each point its own phase) — never a per-frame random jump
  let fq = 50.0 + 38.0 * r1(i, 21u);
  q += vec3f(sin(t * fq + r1(i, 22u) * TAU), sin(t * fq * 1.31 + r1(i, 23u) * TAU), sin(t * fq * 0.77 + r1(i, 26u) * TAU)) * jit * 0.5;
  let ang = t * (0.03 + 0.25 * F.mo_circling + 0.1 * F.s_arousal) * (1.0 - exact);
  return vec3f(q.x * cos(ang) - q.z * sin(ang), q.y, q.x * sin(ang) + q.z * cos(ang));
}

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
  let t = F.lt * mix(1.0, 0.35, F.lazy);
  let t0 = F.angleAt * mix(1.0, 0.35, F.lazy);
  let form = u32(F.variant2 + 0.5);
  let ah = hash22(vec2f(F.angle * 113.0, F.seed * 0.01)) * 0.5 + 0.5;
  let inside = fract(F.angle * 5.17) < 0.25 && form < 5u;
  let exact = F.moodNeu > 0.5;
  // neutral: the instrument's views — straight on, side on, from above — tracking at constant speed
  let axis = floor(ah.x * 3.0);
  let yaw = select((ah.x * 2.0 - 1.0) * 1.3 + t * 0.03 * mix(1.0, 0.5, F.moodPos), select(0.0, 1.5708 * sign(ah.y - 0.5), axis == 1.0), exact);
  let pitch = select((ah.y * 2.0 - 1.0) * 0.5, select(0.0, 1.45, axis == 2.0), exact);
  var pts: array<vec3f, 32>;
  var got = 0u;
  var sum = vec3f(0.0);
  for (var k = 0u; k < 64u; k++) {
    if (got == 32u) { break; }
    let cand = place(u32(fract(abs(F.angle) * 7.71 + f32(k) * 0.07373) * 159000.0) + 1u, t0);
    if (cand.w >= 0.0) { let q = behave(cand.xyz, 0u, t0); pts[got] = q; sum += q; got += 1u; }
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

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) i: u32) -> VOut {
  var o: VOut;
  o.pos = vec4f(2.0, 2.0, 2.0, 1.0); // culled unless placed below
  let res = vec2f(F.resX, F.resY);
  let corner = vec2f(select(-1.0, 1.0, (vi & 1u) == 1u), select(-1.0, 1.0, (vi & 2u) == 2u));
  let t = F.lt * mix(1.0, 0.35, F.lazy);
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

  let P0 = place(i, t);
  if (P0.w < 0.0) { return o; }
  let P = behave(P0.xyz, i, t);
  let rel = P - cam;
  let z = dot(rel, fwd);
  if (z < 0.05) { return o; }
  let ndc = vec2f(dot(rel, rt), dot(rel, up)) * 1.8 / z;

  // the lens: circle of confusion (CSS px) from the distance to the focal plane (the aim)
  let aperture = mix(0.012, 0.035, F.s_intensity) * F.zoom * select(1.0, 1.25, inside) * select(1.0, 0.1, exact);
  // (the frame is measured by its short side, so a portrait phone sees the whole formation)
  let side = min(res.x, res.y);
  let coc = min(abs(z - dist) / z * aperture * side * 0.5, 22.0);
  // dust (85%): fine and sharp, and gone when out of focus; carriers (15%): the lens's discs
  let carrier = r1(i, 16u) < mix(0.15, 0.22, F.moodPos); // the positive glitters (never a haze of discs)
  // never smaller than a pixel (a sub-pixel point sparkles as the camera moves): a finer point is drawn
  // at 1 px and dimmer instead
  let fine = select(mix(0.55, 0.85, r1(i, 9u)), mix(0.8, 1.4, r1(i, 9u)), carrier);
  let point = max(fine, 1.0);
  let rad = select(point, max(coc, point), carrier);
  // out-of-focus points are thinned — faded in and out over a band, never popped
  let keep = select(exp(-coc / 7.0), min(1.0, pow(3.0 / rad, 2.0)), carrier);
  let fadeIn = clamp((keep - r1(i, 10u)) / 0.2 + 0.5, 0.0, 1.0);
  if (fadeIn <= 0.0) { return o; }
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
  let tw = 0.75 + 0.25 * sin(F.time * (0.6 + r1(i, 13u)) + r1(i, 14u) * TAU);
  // the drift's one wandering highlight
  let lamp = select(1.0, 6.0, form == 5u && i % 997u == 0u);
  o.col = base * bright * energy * fog * tw * lamp * glow * mix(0.8, 1.3, F.s_light) * ss(0.0, 0.3, F.lt);
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
