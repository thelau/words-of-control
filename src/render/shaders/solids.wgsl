// SOLIDS — the reading made matter (after video-g: a breathing cluster of chrome, glass and matte spheres on
// black). Every 1-bit of the word's bytes is one sphere — the appraisal's bit grid turned into things — sized by
// its value, packed into a cluster whose envelope is the word's shape (a ball, a low pile, a wave, a helix, a
// scatter with outliers, a tight knot, one great sphere with motes), each of the word's matter (chrome, glass,
// matte porcelain, stone, wood, ember, black gloss; a share of the second material, and a few white spheres as
// the house contrast). The cluster moves as the word moves — rises, falls, spreads, packs tight, turns,
// trembles, breathes, bursts apart, drifts — on the verdict clock; on each beat one letter is struck: all its
// spheres glint together (clips.ts solids() rings them as a chord of their matter).
// Spheres are traced exactly, not marched: true reflections of each other, glass that refracts them, soft
// shadows. setup() (compute, once a frame) places and packs them and the camera; fs() draws.

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var<storage, read> tape: array<f32>;
@group(0) @binding(2) var<storage, read_write> SW: array<vec4f>; // setup() writes
@group(0) @binding(3) var<storage, read> S: array<vec4f>;        // fs() reads (the same buffer)
// layout: 0..3 camera (pos + focus distance, fwd, right, up); 4 the cluster's bounding sphere; 5.x how many
// spheres; then the spheres only (the 1-bits, compacted), 2 vec4 each from 6 + 2i: centre.xyz + radius | matter
// (MATERIALS index; 13 = white porcelain), glow (its letter struck), byte, unused. From STATE, per slot, the
// physics that carries over from frame to frame: position + alive | velocity.

const SLOTS = 96; // 12 bytes × 8 bits (keep in step with gpu.ts)
const STATE = 198; // 6 + 2 · SLOTS
const PORCELAIN = 13.0;

fn tv(i: i32) -> f32 {
  let n = max(i32(F.tapeLen), 1);
  return tape[((i % n) + n) % n];
}
fn byteOf(i: i32) -> u32 { return u32(clamp(tv(i), 0.0, 1.0) * 255.0 + 0.5); }
fn beatP() -> f32 { return 60.0 / mix(56.0, 128.0, F.s_arousal); }
fn letters() -> i32 { return clamp(i32(F.byteLen), 1, 12); }

/** Deterministic value in 0..1 for slot s (the same as clips.ts solids(): from the tape, no hashing). */
fn hv(s: i32, salt: i32) -> f32 { return fract(tv(s + salt) * 7.31 + f32(s % 8) * 0.618 + f32(salt) * 0.137); }

/** The word's main shape (SHAPES order of frame.ts). */
fn shapeTop() -> i32 {
  let sh = array<f32, 9>(F.sh_round, F.sh_jagged, F.sh_flowing, F.sh_splintered, F.sh_knotted, F.sh_flat, F.sh_spiral, F.sh_branching, F.sh_point);
  var best = 0;
  for (var i = 1; i < 9; i++) { if (sh[i] > sh[best]) { best = i; } }
  return best;
}

/** How much of motion k plays now (MOTIONS order): the main gesture throughout, the second turning in later. */
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

fn swell() -> f32 { return max(0.4, 1.0 + 0.2 * F.rh_swelling * (2.0 * F.vu - 1.0) - 0.35 * F.rh_dwindling * F.vu); }

fn bitSet(s: i32) -> bool { return s / 8 < letters() && ((byteOf(s / 8) >> u32(s % 8)) & 1u) != 0u; }
fn firstSlot() -> i32 {
  for (var s = 0; s < SLOTS; s++) { if (bitSet(s)) { return s; } }
  return 0;
}

/** Sphere s's radius (0 when its bit is 0) — the same as clips.ts solids(). */
fn radiusOf(s: i32) -> f32 {
  if (!bitSet(s)) { return 0.0; }
  if (shapeTop() == 8) { return select(0.022, 0.3, s == firstSlot()); } // point: one great sphere, motes
  return (0.035 + 0.075 * pow(hv(s, 3), 1.6)) * mix(0.85, 1.2, F.s_scale);
}

/** Sphere s's matter: the word's first, a share of its second, and a few white porcelain (the house contrast). */
fn matterOf(s: i32) -> f32 {
  if (hv(s, 5) < 0.16 && F.m_void < 0.5) { return PORCELAIN; }
  return select(F.matTop, F.matSec, hv(s, 9) < F.matShare);
}

/** Where sphere s rests before packing: a point in the word's envelope. */
fn home(s: i32) -> vec3f {
  let n = f32(letters() * 8);
  let t = (f32(s) + 0.5) / n;
  // a point in a ball (Fibonacci direction, cube-root radius)
  let ph = f32(s) * 2.39996;
  let y = 1.0 - 2.0 * t;
  let rr = sqrt(max(1.0 - y * y, 0.0));
  let dir = vec3f(cos(ph) * rr, y, sin(ph) * rr);
  // packed tight (the relaxation then spreads them into a touching pile): the ball grows with the letters
  let ball = dir * pow(hv(s, 1), 0.33) * 0.14 * pow(f32(letters()), 0.33);
  switch shapeTop() {
    case 1: { return ball * vec3f(1.3, 0.9, 1.1) * (1.0 + 1.4 * step(0.86, hv(s, 2))); }              // jagged: outliers
    case 2: { let x = (t - 0.5) * 1.4; return vec3f(x, 0.12 * sin(x * 4.0 + tv(0) * 3.0), 0.0) + ball * 0.4; } // flowing
    case 3: { return dir * (0.1 + 0.5 * hv(s, 2)); }                                                   // splintered: flung
    case 4: { return ball * 0.6; }                                                                      // knotted: tight
    case 5: { return ball * vec3f(1.8, 0.35, 1.2) - vec3f(0.0, 0.2, 0.0); }                             // flat: a low pile
    case 6: { let b = t * 3.0 * TAU; let r = 0.06 + 0.32 * t; return vec3f(cos(b) * r, (t - 0.5) * 0.6, sin(b) * r); } // helix
    case 7: { return vec3f(ball.x * (0.4 + 2.0 * t), (t - 0.5) * 0.8, ball.z * (0.4 + 2.0 * t)); }     // branching: widening upward
    case 8: { return select(dir * (0.36 + 0.2 * hv(s, 2)), vec3f(0.0), s == firstSlot()); }             // point: one, and motes
    default: { return ball; }                                                                           // round: a ball
  }
}

// ---------------------------------------------------------------- setup: place, move, pack; the camera
var<workgroup> P: array<vec4f, 128>;
var<workgroup> count: atomic<u32>;

@compute @workgroup_size(128)
fn setup(@builtin(local_invocation_index) li: u32) {
  let s = i32(li);
  let t = F.vt * mix(1.0, 0.35, F.lazy);
  let u = F.vu;
  var c = vec3f(0.0);
  var r = 0.0;
  var glow = 0.0;
  if (s < SLOTS) {
    r = radiusOf(s);
    c = home(s);
    let k = f32(s);
    // the word's gesture (MOTIONS order)
    c.y += (0.45 * ss(0.0, 1.0, u) * (0.5 + hv(s, 4)) + 0.02 * sin(t * 1.3 + k)) * mw(0.0);  // rising (unevenly)
    c.y -= 0.7 * pow(u, 1.6) * (0.4 + 0.6 * hv(s, 4)) * mw(1.0);                              // falling
    c *= 1.0 + 0.9 * ss(0.0, 1.0, u) * mw(2.0);                                               // spreading
    c *= 1.0 - 0.6 * ss(0.0, 0.9, u) * mw(3.0);                                               // contracting: packed tight
    let ca = t * 0.4 * mw(4.0);                                                               // circling
    c = vec3f(c.x * cos(ca) + c.z * sin(ca), c.y, -c.x * sin(ca) + c.z * cos(ca));
    c += vec3f(gnoise(vec2f(t * 7.0, k)), gnoise(vec2f(k, t * 7.0)), gnoise(vec2f(t * 6.0 + 3.0, k))) * 0.018 * mw(5.0); // trembling
    c *= 1.0 + 0.03 * sin(t * 0.8) * (mw(6.0) + 0.3);                                         // breathing (still, and a little always)
    c = mix(c, c * mix(0.3, 2.2, ss(0.05, 1.2, t)), mw(7.0));                                 // breaking: bursting apart
    c += vec3f(0.4 * u, 0.04 * sin(t * 0.7 + k), 0.0) * mw(8.0);                              // drifting
    // the strike: a shockwave flings them out, once (video-g's burst)
    c += normalize(c + vec3f(1e-4)) * F.strike * 0.35 * ss(0.0, 0.2, F.lt) * exp(-F.lt / 0.6);
    // the beat: one letter struck, all its spheres swell and glint together
    let lb = lastBeat();
    glow = select(0.0, exp(-lb.y / 0.3) * ss(0.0, 0.08, lb.y), lb.x >= 0.0 && i32(lb.x) % letters() == s / 8); // (swells in: a glint, not a pop)
    r *= (1.0 + 0.12 * glow) * swell() * (1.0 + 0.05 * F.rh_pulsing * sin(F.vt * PI / beatP()));
  }
  // the physics: each sphere follows where the word wants it on a spring (it carries its velocity from frame to
  // frame), and the packing below keeps them touching, never inside each other — a cluster that jostles and
  // breathes, never jitters (a fresh performance places them at once)
  let dt = min(F.dt, 1.0 / 30.0);
  var pos = c;
  var vel = vec3f(0.0);
  if (s < SLOTS) {
    let st = SW[STATE + s * 2];
    if (F.mode < 0.5 && st.w > 0.5) {
      pos = st.xyz;
      vel = SW[STATE + s * 2 + 1].xyz;
      let w0 = mix(9.0, 20.0, F.s_energy) * (1.0 + 1.5 * mw(7.0) + 1.5 * F.strike);
      vel += ((c - pos) * w0 * w0 - 1.6 * w0 * vel) * dt;
      pos += vel * dt;
    }
  }
  P[li] = vec4f(pos, r);
  if (li == 0u) { atomicStore(&count, 0u); }
  workgroupBarrier();
  // packing: spheres never pass through each other
  for (var it = 0; it < 14; it++) {
    var me = P[li];
    if (me.w > 0.0) {
      var push = vec3f(0.0);
      for (var j = 0; j < SLOTS; j++) {
        let o = P[j];
        if (j == s || o.w <= 0.0) { continue; }
        let d = me.xyz - o.xyz;
        let l = length(d);
        let ov = me.w + o.w + 0.006 - l;
        if (ov > 0.0) { push += d / max(l, 1e-4) * ov * 0.5; }
      }
      me = vec4f(me.xyz + push, me.w);
    }
    workgroupBarrier();
    P[li] = me;
    workgroupBarrier();
  }
  if (s < SLOTS) {
    // the packing's push is felt a little as velocity (they settle, never bounce)
    SW[STATE + s * 2] = vec4f(P[li].xyz, select(0.0, 1.0, r > 0.0));
    SW[STATE + s * 2 + 1] = vec4f(vel + (P[li].xyz - pos) / max(dt, 1e-3) * 0.2, 0.0);
  }
  // only the real spheres are kept (the drawing never looks at a 0-bit)
  if (s < SLOTS && r > 0.0) {
    let i = i32(atomicAdd(&count, 1u));
    SW[6 + i * 2] = P[li];
    SW[7 + i * 2] = vec4f(matterOf(s), glow, f32(s / 8), 0.0);
  }
  workgroupBarrier();
  if (li == 0u) {
    // the cluster's bounding sphere: a ray that misses it is black at once
    var sum = vec3f(0.0);
    var nb = 0.0;
    for (var j = 0; j < SLOTS; j++) { if (P[j].w > 0.0) { sum += P[j].xyz; nb += 1.0; } }
    let bc = sum / max(nb, 1.0);
    var br = 0.0;
    for (var j = 0; j < SLOTS; j++) { if (P[j].w > 0.0) { br = max(br, length(P[j].xyz - bc) + P[j].w); } }
    SW[4] = vec4f(bc, br);
    SW[5] = vec4f(f32(atomicLoad(&count)), 0.0, 0.0, 0.0);
    // the camera: each angle a new setup around the cluster (seed −1: the hand-off, dead frontal); who the word is
    // about places you — "I" close among them, "you" facing them level, "we" circling with them, "they" far off
    let front = F.angle < 0.0;
    let ah = hash22(vec2f(F.angle * 113.0, F.seed * 0.01)) * 0.5 + 0.5;
    var yaw = select((ah.x - 0.5) * 2.4, 0.0, front) + F.who_we * F.vt * 0.12;
    var el = select(mix(-0.1, 0.5, ah.y), 0.05, front) * (1.0 - F.who_you) * (1.0 - F.moodNeu * 0.7);
    var dist = 1.25 * mix(1.0, 0.6, F.who_i) * mix(1.0, 2.0, F.who_they * ss(0.35, 0.8, F.s_distance)) / F.zoom;
    // the shot's move (director.ts solidsOps): a slow push in, an orbit, a crane down, locked
    let mv = i32(F.flowOp);
    if (mv == 0) { dist *= 1.0 - 0.18 * F.u; }
    if (mv == 1) { yaw += (F.lt - F.angleAt) * 0.12; }
    if (mv == 2) { el = mix(el + 0.5, el, ss(0.0, 1.0, F.u)); }
    // aimed at the cluster itself (it may rise, fall or drift), and focused on it
    let tgt = bc + vec3f(F.offX, F.offY, 0.0) * 0.35 * br * 2.0 * select(0.0, 1.0, F.zoom > 1.0);
    let cp = tgt + vec3f(sin(yaw) * cos(el), sin(el), cos(yaw) * cos(el)) * dist;
    let fwd = normalize(tgt - cp);
    let rt = normalize(cross(fwd, vec3f(0.0, 1.0, 0.0)));
    SW[0] = vec4f(cp, length(bc - cp));
    SW[1] = vec4f(fwd, 0.0);
    SW[2] = vec4f(rt, 0.0);
    SW[3] = vec4f(cross(rt, fwd), 0.0);
  }
}

// ---------------------------------------------------------------- tracing
fn spheres() -> i32 { return i32(S[5].x); }

/** The nearest sphere along the ray (t, index; index −1 = none), skipping `skip`. */
fn trace(ro: vec3f, rd: vec3f, skip: i32) -> vec2f {
  var best = 1e5;
  var id = -1.0;
  for (var s = 0; s < spheres(); s++) {
    let cr = S[6 + s * 2];
    if (cr.w <= 0.0 || s == skip) { continue; }
    let oc = ro - cr.xyz;
    let b = dot(oc, rd);
    let h = b * b - (dot(oc, oc) - cr.w * cr.w);
    if (h < 0.0) { continue; }
    let tt = -b - sqrt(h);
    if (tt > 1e-4 && tt < best) { best = tt; id = f32(s); }
  }
  return vec2f(best, id);
}

/** Soft shadow toward L from the other spheres (how close the light's ray passes each). */
fn shadow(p: vec3f, L: vec3f, me: i32) -> f32 {
  var sh = 1.0;
  for (var s = 0; s < spheres(); s++) {
    let cr = S[6 + s * 2];
    if (cr.w <= 0.0 || s == me) { continue; }
    let oc = cr.xyz - p;
    let b = dot(oc, L);
    if (b <= 0.0) { continue; }
    let d = sqrt(max(dot(oc, oc) - b * b, 0.0));
    sh = min(sh, clamp((d - cr.w * 0.8) / (b * 0.3 + 0.01), 0.0, 1.0));
  }
  return sh;
}

/** Occlusion from the neighbours (analytic, sphere by sphere). */
fn occlusion(p: vec3f, n: vec3f, me: i32) -> f32 {
  var o = 1.0;
  for (var s = 0; s < spheres(); s++) {
    let cr = S[6 + s * 2];
    if (cr.w <= 0.0 || s == me) { continue; }
    let v = cr.xyz - p;
    let l2 = dot(v, v);
    o *= 1.0 - clamp(max(dot(n, v), 0.0) / sqrt(l2) * cr.w * cr.w / l2, 0.0, 0.7);
  }
  return o;
}

/** The light's colour: warm for positive words, cool and exact for neutral, plain white in the dark. */
fn warm() -> vec3f { return mix(mix(vec3f(1.0), vec3f(1.0, 0.9, 0.78), F.moodPos), vec3f(0.9, 0.95, 1.05), F.moodNeu * 0.6); }

/** The studio: a large softbox overhead, a strip at each side, a faint horizon — black elsewhere. The shot's
 *  light (director.ts solidsOps) may be studio, rim (from behind), one hard spot, or clinical. */
fn studio(dir: vec3f) -> vec3f {
  let lo = i32(F.warpOp) % 4;
  let top = ss(0.55, 0.8, dir.y) * (0.7 + 0.3 * ss(0.8, 0.98, dir.y)) * select(1.0, 0.15, lo == 1);
  let side = ss(0.8, 0.93, abs(dir.x)) * ss(0.6, 0.25, abs(dir.y)) * select(0.8, 0.0, lo == 2);
  let back = ss(0.75, 0.95, -dir.z) * ss(0.5, 0.1, abs(dir.y)) * select(0.1, 1.8, lo == 1);
  let horizon = exp(-dir.y * dir.y * 60.0) * 0.04;
  return vec3f(top * 2.6 + side * 1.1 + back + horizon) * warm();
}

fn keyLight() -> vec3f {
  let lo = i32(F.warpOp) % 4;
  if (lo == 1) { return normalize(vec3f(0.2, 0.5, -1.0)); }
  if (lo == 2) { return normalize(vec3f(0.1, 1.0, 0.15)); }
  if (lo == 3) { return normalize(vec3f(0.0, 1.0, 0.4)); }
  return normalize(vec3f(-0.4, 0.9, 0.35));
}

/** A matter's colour (matte ones) — the palette for positive words, clinical white for neutral, grey in the dark. */
fn albedo(m: f32, s: i32) -> vec3f {
  let pal = mix(vec3f(F.p1R, F.p1G, F.p1B), vec3f(F.p2R, F.p2G, F.p2B), step(0.5, hv(s, 7)));
  var a = vec3f(0.85);
  let i = i32(m);
  if (i == 2) { a = vec3f(0.42, 0.41, 0.4); }        // stone
  if (i == 3) { a = vec3f(0.72, 0.62, 0.48); }       // sand
  if (i == 8) { a = vec3f(0.45, 0.28, 0.16); }       // wood
  if (i == 9) { a = vec3f(0.7, 0.68, 0.66); }        // cloth
  if (i == 10) { a = vec3f(0.85, 0.55, 0.5); }       // flesh
  if (i == 13) { a = vec3f(0.92, 0.91, 0.9); }       // porcelain
  a = mix(a, pal * 0.9 + 0.1, F.moodPos * 0.55 * select(1.0, 0.3, i == 13));
  let neg = clamp(1.0 - F.moodPos - F.moodNeu, 0.0, 1.0);
  return mix(a, vec3f(dot(a, vec3f(0.3, 0.55, 0.15))), neg);
}

/** Matter kinds: 0 chrome (metal), 1 glass (glass, ice, water, smoke), 2 matte, 3 ember/light, 4 black gloss (void). */
fn kindOf(m: f32) -> i32 {
  let i = i32(m);
  if (i == 0) { return 0; }
  if (i == 1 || i == 4 || i == 5 || i == 6) { return 1; }
  if (i == 7 || i == 11) { return 3; }
  if (i == 12) { return 4; }
  return 2;
}

/** A chrome tint: gold for positive words, plain steel otherwise. */
fn chrome() -> vec3f { return mix(vec3f(0.92, 0.93, 0.95), vec3f(1.0, 0.8, 0.5), F.moodPos * 0.6); }

/** Emission of an ember or light sphere (embers cool over the verdict). */
fn emission(m: f32, s: i32, n: vec3f, V: vec3f) -> vec3f {
  let pal = mix(vec3f(F.p1R, F.p1G, F.p1B), vec3f(F.p2R, F.p2G, F.p2B), step(0.5, hv(s, 7)));
  let face = pow(max(dot(n, V), 0.0), 0.7);
  if (i32(m) == 7) {
    // an ember: a charred, near-black body; its heat shows only as a soft glow from within at its edge (no pattern
    // on its surface — veins read as a cheap lava texture), cooling over the verdict
    let heat = 1.0 - 0.75 * ss(0.2, 1.0, F.vu);
    let edge = pow(1.0 - face, 2.2);
    return vec3f(1.0, 0.3, 0.06) * edge * 1.6 * heat + vec3f(0.5, 0.09, 0.02) * 0.12 * heat + vec3f(0.015) * face;
  }
  return (pal * 0.6 + 0.5) * (1.4 * face + 0.3);
}

/** A sphere seen in a reflection or through glass: lit simply (no further bounces). */
fn seen(s: i32, p: vec3f, rd: vec3f) -> vec3f {
  let cr = S[6 + s * 2];
  let m = S[7 + s * 2].x;
  let n = normalize(p - cr.xyz);
  let k = kindOf(m);
  if (k == 0) { return studio(reflect(rd, n)) * chrome(); }
  if (k == 1) { return studio(reflect(rd, n)) * 0.12 * pow(1.0 - max(dot(n, -rd), 0.0), 2.0); }
  if (k == 3) { return emission(m, s, n, -rd); }
  if (k == 4) { return studio(reflect(rd, n)) * 0.08; }
  return albedo(m, s) * (max(dot(n, keyLight()), 0.0) * 1.1 + 0.04) * warm();
}

/** What a ray finds beyond a surface: another sphere, or the studio. */
fn beyond(ro: vec3f, rd: vec3f, skip: i32) -> vec3f {
  let h = trace(ro, rd, skip);
  if (h.y < 0.0) { return studio(rd); }
  return seen(i32(h.y), ro + rd * h.x, rd);
}

// ---------------------------------------------------------------- drawing
@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let res = vec2f(F.resX, F.resY);
  let ndc = (fc.xy - res * 0.5) / (res.y * 0.5) * vec2f(1.0, -1.0);
  let ro = S[0].xyz;
  let rd = normalize(S[1].xyz * 2.0 + S[2].xyz * ndc.x + S[3].xyz * ndc.y);
  let oc = ro - S[4].xyz;
  let bb = dot(oc, rd);
  if (bb * bb - (dot(oc, oc) - S[4].w * S[4].w) < 0.0) { return vec4f(vec3f(0.0), 0.0); }
  let hit = trace(ro, rd, -1);
  if (hit.y < 0.0) { return vec4f(vec3f(0.0), 0.0); }
  let s = i32(hit.y);
  let t = hit.x;
  let p = ro + rd * t;
  let cr = S[6 + s * 2];
  let info = S[7 + s * 2];
  let m = info.x;
  let kind = kindOf(m);
  let q = normalize(p - cr.xyz); // the surface's own coordinates (the sphere's normal)
  var n = q;
  // texture: grainy matte spheres are rough, cracked ones fissured (crystalline ones stay clean: faceting read as
  // disco balls)
  let grain = clamp(F.tx_grainy + F.tx_powdery * 0.6 + select(0.0, 1.0, i32(m) == 3), 0.0, 1.0);
  if (grain > 0.02 && kind == 2) { n = normalize(n + vec3f(gnoise(q.xy * 60.0), gnoise(q.yz * 60.0), gnoise(q.zx * 60.0)) * 0.4 * grain); }
  var crack = 1.0;
  if (F.tx_cracked > 0.05 && kind == 2) { crack = 1.0 - ss(0.03, 0.0, abs(gnoise(q.xz * 5.0 + q.y * 3.0 + f32(s))) - 0.005) * clamp(F.tx_cracked * 1.4, 0.0, 1.0) * 0.8; }

  let V = -rd;
  let L = keyLight();
  let NdV = max(dot(n, V), 0.0);
  let R = reflect(rd, n);
  var col = vec3f(0.0);
  if (kind == 0) {
    // chrome: the others and the studio, mirrored (Schlick, tinted)
    let fr = chrome() + (1.0 - chrome()) * pow(1.0 - NdV, 5.0);
    col = beyond(p + n * 1e-3, R, s) * fr;
  } else if (kind == 1) {
    // glass on black: what it refracts (the cluster behind it, turned upside down — black where nothing is),
    // a crisp reflection on its rim (Fresnel), a dark ring where the light is trapped inside, and hard pinpoints of
    // the softbox; tinted for water and ice, milky for ice and smoke
    let fr = 0.04 + 0.96 * pow(1.0 - NdV, 5.0);
    let r1 = refract(rd, n, 1.0 / 1.5);
    let pc = p - cr.xyz;
    let b = dot(pc, r1);
    let tout = -b + sqrt(max(b * b - (dot(pc, pc) - cr.w * cr.w), 0.0));
    let pe = p + r1 * tout;
    let ne = normalize(pe - cr.xyz);
    var r2 = refract(r1, -ne, 1.5);
    if (dot(r2, r2) < 0.5) { r2 = reflect(r1, -ne); }
    let i = i32(m);
    let tint = select(select(vec3f(1.0), vec3f(0.82, 0.93, 1.0), i == 5), vec3f(0.7, 0.86, 1.0), i == 4);
    var through = beyond(pe + r2 * 1e-3, r2, s) * tint * ss(0.05, 0.45, NdV);
    through = mix(through, vec3f(dot(through, vec3f(0.33))) * 0.7 + 0.025, select(0.0, 0.45, i == 5 || i == 6));
    col = mix(through, beyond(p + n * 1e-3, R, s), fr)
      + warm() * (pow(max(dot(R, L), 0.0), 400.0) * 6.0 + pow(max(dot(reflect(r1, -ne), L), 0.0), 60.0) * 0.4);
  } else if (kind == 3) {
    col = emission(m, s, n, V);
  } else if (kind == 4) {
    let fr = 0.04 + 0.96 * pow(1.0 - NdV, 5.0);
    col = beyond(p + n * 1e-3, R, s) * fr;
  } else {
    // matte: the softbox (soft shadow from the others), the sky, the neighbours' occlusion, a clean sheen
    // matte: a soft key that wraps round the form into a real shadow side (soft shadows from the others), a
    // little sky, contact shadows where spheres touch, a rim to part it from the dark; porcelain is glazed (the
    // studio mirrored faintly in it)
    let sh = select(shadow(p, L, s), 0.9, i32(F.warpOp) % 4 == 3);
    let ao = occlusion(p, n, s);
    let wrap = pow(clamp((dot(n, L) + 0.25) / 1.25, 0.0, 1.0), 1.6) * sh;
    let sky = 0.035 * (n.y * 0.5 + 0.5);
    let sheen = pow(max(dot(R, L), 0.0), mix(24.0, 80.0, F.s_hardness)) * sh * mix(0.5, 0.1, F.tx_soft);
    let glaze = select(0.0, 1.0, i32(m) == 13) * (0.04 + 0.5 * pow(1.0 - NdV, 4.0));
    col = (albedo(m, s) * (wrap * 1.3 + sky) * ao + sheen + studio(R) * glaze * 0.35 + pow(1.0 - NdV, 3.0) * 0.06) * warm() * crack;
  }
  // smooth silhouettes: how far inside the sphere's disc this pixel's ray passes, in pixels; at the edge the
  // pixel is shared with whatever lies behind
  let oc0 = ro - cr.xyz;
  let bq = dot(oc0, rd);
  let dperp = sqrt(max(dot(oc0, oc0) - bq * bq, 0.0));
  let cov = clamp((cr.w - dperp) / (t / F.resY) + 0.5, 0.0, 1.0);
  if (cov < 1.0) {
    let hb = trace(ro, rd, s);
    let behind = select(vec3f(0.0), seen(i32(hb.y), ro + rd * hb.x, rd), hb.y >= 0.0);
    col = mix(behind, col, cov);
  }
  // the beat: the struck letter's spheres glint (a rim of light) — the chord the sound strikes
  let rim = pow(1.0 - NdV, 2.0);
  col += (warm() * 0.6 + 0.4) * info.y * (rim * 1.2 + 0.08);
  // positive: points of glitter on the highlights; the dark: colourless
  let gl = step(0.994, hash41(floor(fc.xy / 2.0), floor(F.time * 3.0)).x) * ss(0.6, 1.2, dot(col, vec3f(0.33)));
  col += vec3f(1.0, 0.85, 0.6) * gl * F.moodPos;
  // (an ember keeps its fire even in the dark: it is the one accent)
  let neg = clamp(1.0 - F.moodPos - F.moodNeu, 0.0, 1.0) * select(1.0, 0.2, kind == 3 && i32(m) == 7);
  col = mix(col, vec3f(dot(col, vec3f(0.2126, 0.7152, 0.0722))), neg * 0.85);
  // the lens: focused where the camera aims; near and far spheres dissolve (circle of confusion, px, in alpha)
  let coc = clamp(abs(t - S[0].w) / t * mix(16.0, 34.0, ss(1.0, 3.0, F.zoom)), 0.0, 16.0);
  return vec4f(col * ss(0.0, 0.25, F.lt + F.vt), coc);
}
