// PINS — the reading as a pin-art terrain (references/craft/set3/pins.jpg; the relief slabs of Ikeda's data.matrix,
// ik-a/ik-b): a dense field of thin dark rods, 256 × 256, standing on hills, their tips catching a low raking
// light, seen through a macro lens with a very shallow focus.
//
// The terrain IS the word's data: the appraisal's tape (bytes, the choices' probabilities, the scores, the typing)
// is laid on a 9 × 9 grid and drawn smooth (a cubic B-spline) into hills, organically warped; the word's shape
// carves it (round domes, jagged ridged crests, flowing dunes, splintered shards and faults, knotted interference,
// flat plains, a spiral ridge, branching valleys, one great peak); a word of order is stepped in rows like the
// spectrum reading; every pin is raised a hair when its bit in the word's bytes is 1 (the bits reading, the pins'
// grain). Its main motion moves the whole terrain on the verdict clock (it rises, falls, spreads, contracts,
// turns, trembles, breathes, breaks into plates along faults, drifts), and a slow wave always runs through it.
// The rhythm is the verdict's: on every beat a ring of pins is pushed up from a point and runs outward, its tips
// catching the light (a stutter skips a beat, the strike is one great shockwave, swelling and dwindling scale it);
// the ring's first pin burns the word's accent for a moment — the one colour.
//
// Matter (per pin: the first material, a share of the second): stone and sand matte, metal glinting heads, glass
// and ice clear rods (seen through), water wet caps and ripples, fire tips glowing, light tips shining, wood,
// cloth, flesh soft, smoke grey and half there, void black gloss. Texture: grainy/powdery rough and uneven,
// cracked lines of sunken pins, crystalline flat hard caps, soft and liquid smooth. Mood is the light, never an
// inversion: positive warm with the palette on the tips; neutral cool and exact; negative colourless and hard.
//
// The shot's light (F.warpOp): side raking, contre-jour, grazing, clinical. Its camera move (F.flowOp): push in,
// track, crane down, locked. Who the word is about places you: "I" among the pins, "you" facing a slope, "we"
// turning, "they" far and high. The first frame (angle seed −1) looks straight down: a flat data plate.
//
// Drawn exactly, not marched: setup() (compute, one workgroup per tile of 16 × 8 pins) writes each pin's height,
// the height below which it is in shadow (a march toward the light over the terrain), its neighbours' mean height
// (the dark between the rods), its matter and glow, and each tile's highest pin; fs() walks the grid cell by cell
// (skipping whole tiles the ray passes above), intersects each rod as a capped cylinder, and blends up to four
// pins by how much of the pixel each covers (clean silhouettes, no shimmer). The lens blur is in alpha.

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var<storage, read> tape: array<f32>;
@group(0) @binding(2) var<storage, read_write> SW: array<vec4f>; // setup() writes
@group(0) @binding(3) var<storage, read> S: array<vec4f>;        // fs() reads (the same buffer)
// layout: 0..3 camera (pos + focus distance, fwd, right, up); 4 the light (dir, penumbra); 8.. the tiles' highest
// pin (TILES); CELL0.. the pins, one vec4 each: height, shadow line, neighbours' mean height, matter + glow/accent.

const N = 256;              // pins per side (keep species/pins.ts groups and state in step)
const HW = 1.0;             // the field's half width (world units)
const CS = 0.0078125;       // 2 · HW / N
const TX = 16;              // a tile: 16 × 8 pins = one workgroup
const TZ = 8;
const TILESX = 16;          // N / TX
const TILES = 512;
const CELL0 = 520;          // 8 + TILES
const HMAX = 0.62;
const G = 9;                // the data map's grid

fn tv(i: i32) -> f32 {
  let n = max(i32(F.tapeLen), 1);
  return tape[((i % n) + n) % n];
}
fn byteOf(i: i32) -> u32 { return u32(clamp(tv(i), 0.0, 1.0) * 255.0 + 0.5); }
fn letters() -> i32 { return clamp(i32(F.byteLen), 1, 12); }
fn beatP() -> f32 { return 60.0 / mix(56.0, 128.0, F.s_arousal); }
fn neg() -> f32 { return clamp(1.0 - F.moodPos - F.moodNeu, 0.0, 1.0); }
fn clk() -> f32 { return F.vt * mix(1.0, 0.35, F.lazy); }
fn h2(c: vec2i, salt: u32) -> f32 { return f32(pcg((u32(c.x) * 7919u) ^ pcg(u32(c.y) + salt * 104729u))) / 4294967295.0; }
fn rot(p: vec2f, a: f32) -> vec2f { let c = cos(a); let s = sin(a); return vec2f(c * p.x - s * p.y, s * p.x + c * p.y); }

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

// ---------------------------------------------------------------- the camera and the light (pure: every thread)
fn front() -> bool { return F.angle < 0.0; }
fn angleHash() -> vec2f { return hash22(vec2f(F.angle * 113.0, F.seed * 0.01)) * 0.5 + 0.5; }
fn camYaw() -> f32 {
  let ah = angleHash();
  var yaw = ah.x * TAU + F.who_we * F.vt * 0.1;
  if (i32(F.flowOp) == 1 && F.hold < 0.5) { yaw += (F.lt - F.angleAt) * 0.04; }
  return select(yaw, 0.6, front());
}
/** Where the lens looks (xz): each angle its own place on the terrain, near the middle. */
fn camTarget() -> vec2f {
  let ah = angleHash();
  var t = (vec2f(fract(ah.y * 7.13), fract(ah.x * 3.71)) - 0.5) * 0.7 + vec2f(F.offX, F.offY) * 0.15;
  if (i32(F.flowOp) == 1 && F.hold < 0.5) {
    let y = camYaw();
    t += vec2f(cos(y), -sin(y)) * (F.lt - F.angleAt) * 0.02; // a slow track across
  }
  return select(t, vec2f(0.0), front());
}
fn lightDir() -> vec3f {
  let lo = i32(F.warpOp) % 4;
  let y = camYaw();
  let back = vec2f(sin(y), cos(y)); // from the target toward the camera
  var az = 1.57;   // side raking
  var el = 0.2;
  if (lo == 1) { az = 3.0; el = 0.26; }    // contre-jour: from beyond the terrain
  if (lo == 2) { az = 0.85; el = 0.11; }   // grazing, from the camera's side
  if (lo == 3) { az = 2.2; el = 0.75; }    // clinical: high and exact
  el *= mix(1.0, 0.8, neg());              // the dark: lower, longer shadows
  let d = rot(back, az);
  return normalize(vec3f(d.x * cos(el), sin(el), d.y * cos(el)));
}

// ---------------------------------------------------------------- the terrain
fn cellCentre(c: vec2i) -> vec2f {
  let j = (vec2f(h2(c, 1u), h2(c, 2u)) - 0.5) * 0.2;
  return (vec2f(c) + 0.5 + j) * CS - HW;
}

fn bsw(f: f32) -> vec4f {
  let f2 = f * f; let f3 = f2 * f;
  return vec4f(1.0 - 3.0 * f + 3.0 * f2 - f3, 4.0 - 6.0 * f2 + 3.0 * f3, 1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3, f3) / 6.0;
}
/** The tape on a G × G grid, smooth (a cubic B-spline): the hills are the word's values. */
fn dataMap(q: vec2f) -> f32 {
  let g = (q * 0.5 + 0.5) * f32(G - 1);
  let i = vec2i(floor(g));
  let wx = bsw(fract(g.x));
  let wz = bsw(fract(g.y));
  var s = 0.0;
  for (var z = 0; z < 4; z++) {
    var r = 0.0;
    for (var x = 0; x < 4; x++) {
      let c = clamp(i + vec2i(x - 1, z - 1), vec2i(0), vec2i(G - 1));
      r += sqrt(clamp(tv(c.y * G + c.x), 0.0, 1.0)) * wx[x];
    }
    s += r * wz[z];
  }
  return s;
}

/** The ring a beat pushes through the pins (0..1) at p, and the beat's centre. */
fn beatRing(p: vec2f) -> f32 {
  let lb = lastBeat();
  if (lb.x < 0.0) { return 0.0; }
  let i = i32(lb.x);
  let c = camTarget() + (vec2f(tv(i * 2 + 11), tv(i * 2 + 12)) - 0.5) * 0.5;
  let r = lb.y * mix(0.7, 1.5, F.s_arousal);
  let d = length(p - c) - r;
  return exp(-d * d / 0.0005) * exp(-lb.y / 0.45) * ss(0.0, 0.04, lb.y);
}

fn wshape(k: f32) -> f32 { return k * k * 1.3; }

/** The terrain's height at p (world xz), without the pins' own grain. */
fn surface(p: vec2f) -> f32 {
  let t = clk();
  let u = F.vu;
  var q = p;
  // the word's motion (MOTIONS order) moves the whole field
  q = rot(q, t * 0.12 * mw(4.0));                                   // circling
  q /= 1.0 + 0.7 * ss(0.0, 1.0, u) * mw(2.0);                       // spreading: the hills widen out
  q *= 1.0 + 0.6 * ss(0.0, 0.9, u) * mw(3.0);                       // contracting: they draw in, tighter
  q -= vec2f(0.05, 0.018) * t * mw(8.0);                            // drifting
  var amp = 0.4 * mix(0.65, 1.25, F.s_scale * 0.5 + F.s_intensity * 0.5);
  amp *= mix(1.0, mix(0.45, 1.15, ss(0.0, 1.0, u)), mw(0.0));       // rising
  amp *= mix(1.0, mix(1.15, 0.35, pow(u, 1.2)), mw(1.0));           // falling: it sinks
  amp *= 1.0 + 0.04 * sin(t * 0.8) * (mw(6.0) + 0.4);               // breathing (still, and a little always)
  amp *= 1.0 + 0.3 * mw(3.0) * ss(0.0, 0.9, u);
  amp *= swell() * (1.0 + 0.05 * F.rh_pulsing * sin(F.vt * PI / beatP()));
  // organic: the grid warped by a slow field of its own
  let s0 = vec2f(tv(3), tv(7)) * 17.0;
  let qw = q + vec2f(gnoise(q * 2.2 + s0), gnoise(q * 2.2 + s0.yx + 5.3)) * 0.16;
  var d = dataMap(qw) * 0.8 + 0.25 * gnoise(qw * 3.1 + s0 * 0.3);
  // the shape carves it (SHAPES order), each by how sure Jev is of it
  let jag = clamp(wshape(F.sh_jagged) + F.s_tension * 0.3 + F.s_hardness * 0.2 + F.tx_cracked * 0.3, 0.0, 1.2);
  let rg = 1.0 - abs(gnoise(qw * 7.0 + s0.yx));
  d += jag * 0.22 * rg * rg * (0.3 + d);                            // jagged: ridged crests
  d = mix(d, pow(max(d, 0.0), 1.6) * 1.4, clamp(wshape(F.sh_jagged), 0.0, 1.0) * 0.6);
  let r2 = dot(q, q);
  d += wshape(F.sh_round) * 0.35 * max(0.0, 1.0 - r2 / 0.7);         // round: a dome
  d += wshape(F.sh_flowing) * 0.18 * sin(qw.x * 6.0 + qw.y * 2.0 + d * 4.0 - t * 0.3); // flowing: long dunes
  d += wshape(F.sh_knotted) * 0.14 * sin(q.x * 13.0) * sin(q.y * 13.0 + q.x * 5.0);    // knotted
  let an = atan2(q.y, q.x);
  d += wshape(F.sh_spiral) * 0.3 * (0.5 + 0.5 * sin(an * 2.0 - sqrt(r2) * 16.0 + t * 0.3)) * ss(1.0, 0.1, sqrt(r2)); // spiral
  let br = abs(gnoise(qw * 4.0 + 9.0)) + 0.5 * abs(gnoise(qw * 9.0 + 3.0));
  d -= wshape(F.sh_branching) * 0.3 * ss(0.12, 0.0, br);            // branching: valleys
  let pk = camTarget() * 0.6 + (vec2f(tv(1), tv(2)) - 0.5) * 0.2;
  d = mix(d, d * 0.35 + 1.3 * exp(-dot(q - pk, q - pk) / 0.05), clamp(wshape(F.sh_point), 0.0, 1.0)); // point: one peak
  d *= 1.0 - 0.6 * clamp(wshape(F.sh_flat), 0.0, 1.0);             // flat: a plain
  // order: stepped in rows, as the spectrum reads
  let ord = ss(0.5, 0.9, F.s_order);
  d += ord * 0.12 * (tv(i32(floor((q.y + 1.0) / (CS * 6.0))) + 17) - 0.3);
  var h = 0.03 + amp * max(d, 0.0);
  // splintered and breaking: plates along faults, stepped apart (their pins' sides laid bare)
  let brk = clamp(mw(7.0) * ss(0.05, 0.9, u) + wshape(F.sh_splintered) * 0.6, 0.0, 1.3);
  if (brk > 0.01) {
    var id = 0u;
    for (var k = 0; k < 3; k++) {
      let a = tv(k * 3 + 20) * TAU;
      id = id * 2u + select(0u, 1u, dot(q, vec2f(cos(a), sin(a))) > (tv(k * 3 + 21) - 0.5) * 0.8);
    }
    h += (f32(pcg(id + 7u)) / 4294967295.0 - 0.45) * 0.12 * brk;
  }
  // cracked: lines of sunken pins
  h -= F.tx_cracked * 0.035 * ss(0.035, 0.0, abs(gnoise(q * 3.0 + s0 * 0.7)));
  // a slow wave always runs through the field; water ripples from the middle of the view
  h += (0.006 + 0.014 * F.s_energy) * sin(dot(p, vec2f(0.8, 0.6)) * 7.0 - t * mix(0.6, 1.8, F.s_arousal));
  h += F.m_water * 0.008 * sin(length(p - camTarget()) * 55.0 - t * 3.0);
  // the beat's ring, the strike's shockwave
  h += 0.03 * swell() * beatRing(p);
  let ds = length(p - camTarget()) - F.lt * 0.9;
  h += F.strike * 0.12 * exp(-ds * ds / 0.004) * exp(-F.lt / 0.9);
  return clamp(h, 0.012, HMAX - 0.02);
}

/** Pin c's own height: the terrain, raised a hair where its bit of the word is 1, and its grain. */
fn heightAt(c: vec2i) -> f32 {
  let p = cellCentre(c);
  let nb = letters() * 8;
  let b = i32(pcg(u32(c.x) * 131u + u32(c.y) * 7717u) % u32(nb));
  let bit = f32((byteOf(b / 8) >> u32(b % 8)) & 1u);
  let grain = 0.0012 + 0.004 * clamp(F.tx_grainy + F.tx_powdery * 0.7 + F.tx_cracked * 0.3 + F.tx_fibrous * 0.4, 0.0, 1.0)
    - 0.0025 * clamp(F.tx_smooth + F.tx_liquid, 0.0, 1.0);
  var h = surface(p) + bit * 0.0016 + (h2(c, 3u) - 0.5) * grain;
  // splintered: a few pins stand far out of the field
  h += step(0.992, h2(c, 4u)) * wshape(F.sh_splintered) * 0.12;
  // trembling: the pins shiver together (slow enough to see, never a flicker)
  h += gnoise(vec2f(c) * 0.12 + vec2f(clk() * 5.0, 0.0)) * 0.008 * mw(5.0);
  return clamp(h, 0.01, HMAX - 0.02);
}

// ---------------------------------------------------------------- setup
fn lastH(o: vec2i) -> f32 { let q = clamp(o, vec2i(0), vec2i(N - 1)); return SW[CELL0 + q.y * N + q.x].x; }

var<workgroup> tileMax: array<f32, 128>;

@compute @workgroup_size(128)
fn setup(@builtin(local_invocation_index) li: u32, @builtin(workgroup_id) wg: vec3u) {
  let w = i32(wg.x);
  let c = vec2i((w % TILESX) * TX + i32(li) % TX, (w / TILESX) * TZ + i32(li) / TX);
  let h = heightAt(c);
  // the shadow line: marching toward the light, the highest the terrain rises above the light's ray; and the
  // neighbours' mean height (how deep between the rods this pin stands). Both read the pins' heights as the last
  // frame left them (a frame late, unseen; a fresh performance starts unshadowed for its first, black frame)
  let L = lightDir();
  let dl = normalize(L.xz);
  let tanE = L.y / max(length(L.xz), 1e-3);
  let steps = array<f32, 12>(1.0, 2.0, 3.0, 4.0, 6.0, 8.0, 11.0, 15.0, 20.0, 27.0, 36.0, 48.0);
  var occ = 0.0;
  var nbh = h;
  if (F.mode < 0.5) {
    for (var k = 0; k < 12; k++) {
      let o = c + vec2i(round(dl * steps[k]));
      if (any(o < vec2i(0)) || any(o >= vec2i(N))) { break; }
      occ = max(occ, lastH(o) - steps[k] * CS * tanE);
    }
    nbh = (lastH(c + vec2i(1, 0)) + lastH(c - vec2i(1, 0)) + lastH(c + vec2i(0, 1)) + lastH(c - vec2i(0, 1))) * 0.25;
  }
  // matter: the first, a share of the second; glow: the beat's ring passing; accent: the ring's first pin
  let m = select(F.matTop, F.matSec, gnoise(cellCentre(c) * 3.0 + 7.7) * 0.9 + 0.35 + 0.3 * h2(c, 5u) < F.matShare); // in patches, frayed
  let glow = beatRing(cellCentre(c));
  let lb = lastBeat();
  let bc = camTarget() + (vec2f(tv(i32(lb.x) * 2 + 11), tv(i32(lb.x) * 2 + 12)) - 0.5) * 0.5;
  let isAcc = lb.x >= 0.0 && all(abs(cellCentre(c) - bc) < vec2f(CS * 0.5)) && lb.y < 0.9;
  SW[CELL0 + c.y * N + c.x] = vec4f(h, occ, nbh, m + min(glow, 0.99) * 0.49 + select(0.0, 0.5, isAcc));
  // the tile's highest pin: rays passing above it skip the whole tile
  tileMax[li] = h;
  workgroupBarrier();
  for (var s = 64u; s > 0u; s >>= 1u) {
    if (li < s) { tileMax[li] = max(tileMax[li], tileMax[li + s]); }
    workgroupBarrier();
  }
  if (li == 0u) { SW[8 + w] = vec4f(tileMax[0], 0.0, 0.0, 0.0); }
  if (li == 0u && w == 0) {
    // the camera: "I" among the pins, low; "you" facing a slope; "they" far and high; seed −1 straight down
    let tgxz = camTarget();
    let th = surface(tgxz);
    let tgt = vec3f(tgxz.x, th, tgxz.y);
    let ah = angleHash();
    let yaw = camYaw();
    var el = mix(0.22, 0.6, ah.y) * mix(1.0, 0.45, F.who_i) * mix(1.0, 0.75, F.who_you) * mix(1.0, 1.7, F.who_they);
    var dist = mix(0.55, 0.8, fract(ah.x * 5.3)) * mix(1.0, 0.55, F.who_i) * mix(1.0, 2.2, F.who_they * ss(0.3, 0.8, F.s_distance)) / F.zoom;
    let mv = select(i32(F.flowOp), 3, F.hold > 0.5);
    if (mv == 0) { dist *= 1.0 - 0.2 * F.u; }                           // push in
    if (mv == 2) { el = mix(el + 0.35, el, ss(0.0, 1.0, F.u)); }         // crane down
    var cp: vec3f;
    var fwd: vec3f;
    var rt: vec3f;
    if (front()) {
      // straight down on the plate (a hair off vertical so the pins read as rods)
      cp = vec3f(0.0, th + 1.35 / F.zoom, 0.02);
      fwd = normalize(vec3f(0.0, -1.0, -0.015));
      rt = vec3f(1.0, 0.0, 0.0);
    } else {
      cp = tgt + vec3f(sin(yaw) * cos(el), sin(el), cos(yaw) * cos(el)) * dist;
      // never inside the field
      let under = surface(cp.xz) + 0.03;
      cp.y = max(cp.y, under);
      fwd = normalize(tgt - cp);
      rt = normalize(cross(fwd, vec3f(0.0, 1.0, 0.0)));
    }
    SW[0] = vec4f(cp, length(tgt - cp));
    SW[1] = vec4f(fwd, 0.0);
    SW[2] = vec4f(rt, 0.0);
    SW[3] = vec4f(cross(rt, fwd), 0.0);
    SW[4] = vec4f(L, mix(0.007, 0.0035, neg()));
  }
}

// ---------------------------------------------------------------- drawing
fn warmLight() -> vec3f { return mix(mix(vec3f(1.0), vec3f(1.0, 0.92, 0.83), F.moodPos), vec3f(0.88, 0.95, 1.06), F.moodNeu * 0.7); }

struct Mat { alb: vec3f, spec: f32, shin: f32, cover: f32, emit: vec3f, wrap: f32 };

/** A pin's matter (MATERIALS order): stone near-black matte, as the reference. */
fn matter(m: i32) -> Mat {
  var M = Mat(vec3f(0.05, 0.049, 0.048), 0.05, 14.0, 1.0, vec3f(0.0), 0.0);
  switch m {
    case 0: { M = Mat(vec3f(0.025), 0.9, 90.0, 1.0, vec3f(0.0), 0.0); }                     // metal: glinting heads
    case 1: { M = Mat(vec3f(0.012), 1.6, 220.0, 0.45, vec3f(0.0), 0.0); }                  // glass: clear rods
    case 3: { M = Mat(vec3f(0.2, 0.17, 0.13), 0.02, 6.0, 1.0, vec3f(0.0), 0.1); }          // sand
    case 4: { M = Mat(vec3f(0.03, 0.035, 0.04), 1.0, 160.0, 0.8, vec3f(0.0), 0.0); }       // water: wet caps
    case 5: { M = Mat(vec3f(0.3, 0.36, 0.42), 0.5, 90.0, 0.7, vec3f(0.0), 0.2); }          // ice: frosted, clear
    case 6: { M = Mat(vec3f(0.14), 0.0, 4.0, 0.5, vec3f(0.0), 0.4); }                      // smoke: half there
    case 7: { M = Mat(vec3f(0.03, 0.025, 0.022), 0.05, 12.0, 1.0, vec3f(1.0, 0.26, 0.05), 0.0); } // fire: tips glowing
    case 8: { M = Mat(vec3f(0.13, 0.08, 0.05), 0.08, 18.0, 1.0, vec3f(0.0), 0.05); }       // wood
    case 9: { M = Mat(vec3f(0.2, 0.19, 0.18), 0.0, 4.0, 1.0, vec3f(0.0), 0.45); }          // cloth: soft
    case 10: { M = Mat(vec3f(0.2, 0.15, 0.14), 0.05, 10.0, 1.0, vec3f(0.0), 0.5); }        // flesh
    case 11: { M = Mat(vec3f(0.05), 0.1, 20.0, 1.0, vec3f(1.0, 0.97, 0.9) * 1.6, 0.0); }         // light: tips shining
    case 12: { M = Mat(vec3f(0.004), 0.7, 260.0, 1.0, vec3f(0.0), 0.0); }                  // void: black gloss
    default: {}
  }
  return M;
}

/** One pin's colour at a point of its surface. */
fn shade(hp: vec3f, n: vec3f, rd: vec3f, cd: vec4f, cap: bool) -> vec3f {
  let L = S[4].xyz;
  let pen = S[4].w;
  let mi = i32(floor(cd.w));
  let fr = fract(cd.w);
  let accent = fr >= 0.5;
  let glow = (fr - select(0.0, 0.5, accent)) / 0.49;
  let M = matter(mi);
  let y = hp.y;
  let top = ss(cd.x - 0.012, cd.x, y);                       // near its tip
  let lit = ss(cd.y - pen, cd.y + pen, y);                   // above the shadow line
  let ao = pow(clamp(1.0 - (cd.z - y) / 0.045, 0.0, 1.0), 1.7) * 0.9 + 0.1 * top;
  let V = -rd;
  let NdL = dot(n, L);
  let diff = max((NdL + M.wrap) / (1.0 + M.wrap), 0.0) * lit;
  let H = normalize(L + V);
  let shin = M.shin * select(1.0, 3.0, F.tx_crystalline > 0.4) * mix(1.0, 0.5, F.tx_soft);
  var spec = pow(max(dot(n, H), 0.0), shin) * M.spec * lit * (shin + 8.0) / 40.0 * select(0.4, 1.0, cap);
  // every tip keeps a soft sheen (the reference's pale pin heads)
  spec += pow(max(dot(n, H), 0.0), 10.0) * 0.07 * lit * select(0.4, 1.0, cap);
  let fres = pow(1.0 - max(dot(n, V), 0.0), 5.0);
  var alb = M.alb;
  // positive: the palette on the tips, faintly; the dark: colourless
  let pal = mix(vec3f(F.p1R, F.p1G, F.p1B), vec3f(F.p2R, F.p2G, F.p2B), step(0.6, fract(cd.w * 13.7 + y * 40.0)));
  alb = mix(alb, pal * dot(alb, vec3f(0.33)) * 1.6 + alb * 0.2, F.moodPos * 0.22 * (0.3 + 0.7 * top));
  let K = warmLight() * 3.4;
  var col = alb * (K * diff + vec3f(0.035) * (0.5 + 0.5 * n.y) * ao) + K * spec * select(vec3f(1.0), mix(vec3f(1.0), vec3f(1.0, 0.8, 0.52), F.moodPos * 0.6), mi == 0);
  // glossy ones mirror a faint dark hall (a band of horizon), and a rim of the key
  col += vec3f(0.03) * fres * ss(-0.1, 0.25, reflect(rd, n).y) * (M.spec + 0.2) * ao;
  // clear rods: light caught inside them where the key enters
  if (mi == 1 || mi == 5) { col += K * 0.05 * lit * pow(max(-dot(n, L) * 0.5 + 0.5, 0.0), 3.0) * top; }
  // fire and light: the tips glow (embers cool over the verdict), never the bodies
  let heat = select(1.0, 1.0 - 0.6 * ss(0.3, 1.0, F.vu), mi == 7);
  // the beat's ring: the pushed pins' tips catch the light
  col += warmLight() * glow * top * (0.06 + 0.14 * lit);
  // the dark is colourless — but not the fire's glow, nor the accent the ring's first pin burns: the one colour
  col = mix(col, vec3f(dot(col, vec3f(0.2126, 0.7152, 0.0722))), neg() * 0.9);
  // (fire: embers here and there, faint; light: tips shining here and there, as stars)
  let few = 0.04 + 0.96 * step(select(0.975, 0.93, mi == 7), fract(cd.w * 91.7 + cd.x * 311.0));
  col += M.emit * min(exp(-(cd.x - y) / 0.0025), 1.0) * select(0.3, 0.16, mi == 7) * heat * few;
  if (accent) { col += vec3f(F.accR, F.accG, F.accB) * top * 1.6; }
  return col;
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let res = vec2f(F.resX, F.resY);
  let ndc = (fc.xy - res * 0.5) / (res.y * 0.5) * vec2f(1.0, -1.0);
  let ro = S[0].xyz;
  let fd = S[0].w;
  var rd = normalize(S[1].xyz * 2.0 + S[2].xyz * ndc.x + S[3].xyz * ndc.y);
  if (abs(rd.x) < 1e-6) { rd.x = 1e-6; }
  if (abs(rd.z) < 1e-6) { rd.z = 1e-6; }
  let ird = 1.0 / rd;
  // the field's box
  let b0 = (vec3f(-HW, 0.0, -HW) - ro) * ird;
  let b1 = (vec3f(HW, HMAX, HW) - ro) * ird;
  let tn = min(b0, b1);
  let tf = max(b0, b1);
  let t0 = max(max(tn.x, tn.y), max(tn.z, 0.0));
  // (nothing is drawn beyond five focus distances: it has sunk into the dark)
  let t1 = min(min(tf.x, min(tf.y, tf.z)), fd * 5.0);
  let fade = ss(0.0, 0.25, F.lt + F.vt);
  if (t0 >= t1) { return vec4f(0.0, 0.0, 0.0, 0.0); }
  let pix = 1.25 / res.y;
  var t = t0 + 1e-5;
  var T = 1.0;
  var col = vec3f(0.0);
  var depth = -1.0;
  var lastTile = vec2i(-1);
  var hits = 0;
  // the side distance's normal (horizontal, across the ray)
  let across = normalize(vec3f(-rd.z, 0.0, rd.x));
  for (var i = 0; i < 700; i++) {
    if (t >= t1) { break; }
    let p = ro + rd * t;
    let c = clamp(vec2i(floor((p.xz + HW) / CS)), vec2i(0), vec2i(N - 1));
    let lo = vec2f(c) * CS - HW;
    let ex = (lo + select(vec2f(0.0), vec2f(CS), rd.xz > vec2f(0.0)) - ro.xz) * ird.xz;
    let tExit = min(ex.x, ex.y);
    let tile = vec2i(c.x / TX, c.y / TZ);
    if (any(tile != lastTile)) {
      lastTile = tile;
      let tlo = vec2f(tile * vec2i(TX, TZ)) * CS - HW;
      let tex = (tlo + select(vec2f(0.0), vec2f(f32(TX), f32(TZ)) * CS, rd.xz > vec2f(0.0)) - ro.xz) * ird.xz;
      let tT = min(min(tex.x, tex.y), t1);
      let top = S[8 + tile.y * TILESX + tile.x].x + CS * 0.6;
      if (min(p.y, ro.y + rd.y * tT) > top) { t = tT + 1e-5; continue; }
    }
    let cd = S[CELL0 + c.y * N + c.x];
    let h = cd.x;
    let fp = t * pix;
    let R = CS * mix(0.34, 0.26, clamp(F.tx_fibrous + F.tx_powdery * 0.6, 0.0, 1.0));
    let Ri = R + fp * 0.5;
    if (min(p.y, ro.y + rd.y * tExit) <= h + Ri) {
      let cc = cellCentre(c);
      let C = vec3f(cc.x, h, cc.y);
      let oc = ro - C;
      var hitT = -1.0;
      var n = vec3f(0.0, 1.0, 0.0);
      var cov = 0.0;
      var cap = false;
      // the rod: a vertical cylinder (widened by half a pixel: its edge is covered, not stepped)
      let a2 = dot(rd.xz, rd.xz);
      let b2 = dot(oc.xz, rd.xz);
      let c2 = dot(oc.xz, oc.xz) - Ri * Ri;
      let d2 = b2 * b2 - a2 * c2;
      if (d2 > 0.0) {
        let tc = (-b2 - sqrt(d2)) / a2;
        if (tc > t - CS && ro.y + rd.y * tc <= h) {
          hitT = tc;
          let hp = ro + rd * tc;
          n = normalize(vec3f(hp.x - cc.x, 0.0, hp.z - cc.y));
          cov = clamp((R - abs(dot(oc, across))) / fp + 0.5, 0.0, 1.0);
        }
      }
      // its head: a dome (crystalline: a flat hard cap)
      if (hitT < 0.0) {
        let b3 = dot(oc, rd);
        let c3 = dot(oc, oc) - Ri * Ri;
        let d3 = b3 * b3 - c3;
        if (d3 > 0.0) {
          let ts = -b3 - sqrt(d3);
          if (ts > 0.0 && ro.y + rd.y * ts >= h - Ri * 0.2) {
            hitT = ts;
            cap = true;
            n = normalize(ro + rd * ts - C);
            n = normalize(mix(n, vec3f(0.0, 1.0, 0.0), clamp(F.tx_crystalline * 1.2, 0.0, 0.85)));
            cov = clamp((R - sqrt(max(dot(oc, oc) - b3 * b3, 0.0))) / fp + 0.5, 0.0, 1.0);
          }
        }
      }
      if (hitT > 0.0 && cov > 0.0) {
        let M = matter(i32(floor(cd.w)));
        let k = cov * M.cover;
        col += T * k * shade(ro + rd * hitT, n, rd, cd, cap);
        T *= 1.0 - k;
        if (depth < 0.0 && T < 0.5) { depth = hitT; }
        hits++;
        if (T < 0.03 || hits >= 4) { break; }
      }
    }
    t = tExit + 1e-5;
  }
  if (depth < 0.0) { depth = select(t, t1, t >= t1); }
  // the dark beyond: the far terrain sinks into the hall
  let far = 1.0 / (1.0 + pow(max(depth / (fd * 2.4), 0.0), 4.0));
  col *= far;
  // the lens: focused where the camera aims; very shallow (a macro lens), the straight-down plate sharp
  let K = select(mix(40.0, 70.0, F.who_i) * mix(1.0, 1.5, ss(1.0, 2.5, F.zoom)), 6.0, front());
  let coc = clamp(abs(depth - fd) / depth * K, 0.0, 16.0);
  return vec4f(col * fade, coc);
}
