// CONTOURS — the reading as land, drawn only by lines of light (after video-h's line terrain and the dark pin-art
// terrain; video-i's bokeh). It opens on the appraisal's spectrum — rows of horizontal bars — seen flat-on, exactly
// as the appraisal left it; then the rows tilt away into depth and rise: each row of the spectrum becomes a ridge
// of the land, as long and as tall as its bar, its line of light lit across its bar and faint beyond it. The land is
// never drawn as a surface — black — only its lines: the rows (sections, dotted like strung beads), the isolines
// (contours, survey-exact), or the pins (a dark relief of lit pin heads), seen at macro with a shallow focus.
//
// The whole reading shapes it (docs/SPECIES.md):
//   mood      positive: the word's palette row by row, warm, glitter on the beads · neutral: cool white, exact
//             isolines with index contours, sharper focus · negative: colourless, thin, hard (never inverted)
//   material  the land's substance (the first everywhere, the second a share of the rows): stone ridged and
//             sharp, sand dunes with ripples, water swells rolling in, ice and glass terraced with cold glints, metal
//             smooth with a sheen, fire's valleys glowing like lava, smoke drifting and soft, cloth folded, flesh
//             round, wood grained, light brighter, void sparse
//   texture   cracked: faults break every line · grainy/powdery: a fine grain · crystalline: terraces · soft:
//             softer, wider lines · fibrous: grained ridges · liquid: swells
//   motion    the land rises, subsides, spreads, packs tight, turns (the camera circles), trembles, holds still,
//             breaks into faults that open, drifts (the spectrum flows in like a waterfall); the second turns in later
//   shape     the ridges' profile: round hills, jagged peaks, flat mesas, a meandering range, a knot, splinters,
//             one great peak (point), a spiral ridge, branching valleys carved through it
//   rhythm    on each beat of the verdict clock a comb of rows (or a contour level) lights up; a stutter skips beats;
//             pulsing is a tide (the land breathes); the strike a shockwave ring; swelling / dwindling; lazy: slower
//   who       I: low among the lines · you: facing, level · we: turning · they: high and far
//   ops       warp = the line style (dotted rows, contours, pins, ridgelines + index contours);
//             flow = the camera's move (a low flight in, standing and panning, a crane up, a lateral track)
// setup() computes the land into a height grid (one cell per spectrum row × NX across) and the camera, once a
// frame; fs() marches each ray through the grid and draws the lines at the hit (anti-aliased in screen pixels,
// fading to their mean where they get denser than the pixels), its blur for the lens in alpha.

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var<storage, read> tape: array<f32>;
@group(0) @binding(2) var<storage, read_write> SW: array<vec4f>; // setup() writes
@group(0) @binding(3) var<storage, read> S: array<vec4f>;        // fs() reads (the same buffer)
// layout: 0 camera pos + focus distance · 1 fwd + focal · 2 right + reveal · 3 up + the angle it was set for ·
// 4 geometry (half-width, row spacing, row origin, rows) · 5 (amplitude, scroll, contour interval, height bound) ·
// from G0: the grid, NX cells per row, each its four corners' heights (world; x0z0, x1z0, x0z1, x1z1) · from G1: the
// same cells' land (height, second-material share, fault: 1 whole, 0 crack).

const NX: i32 = 320;
const NRMAX: i32 = 400;
const G0: i32 = 8;
const G1: i32 = G0 + NX * NRMAX;
const WXF: f32 = 2.4;  // the landscape's half-width (world) once revealed
const DEPTH: f32 = 6.4; // its depth

fn tv(i: i32) -> f32 {
  let n = max(i32(F.tapeLen), 1);
  return tape[((i % n) + n) % n];
}
fn beatP() -> f32 { return 60.0 / mix(56.0, 128.0, F.s_arousal); }
/** The land's own clock: an idle word moves slower (its beats stay on the sound's clock). */
fn clockT() -> f32 { return F.vt * mix(1.0, 0.35, F.lazy); }

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

fn swell() -> f32 { return max(0.3, 1.0 + 0.35 * F.rh_swelling * (2.0 * F.vu - 1.0) - 0.6 * F.rh_dwindling * F.vu); }

// ---------------------------------------------------------------- the spectrum (appraisal.wgsl spectrum())
/** One spectrum row, in scene pixels (the appraisal draws a row every 3 CSS px). */
fn rowPx() -> f32 { return 3.0 * F.resY * F.outDpr / max(F.outY, 1.0); }
fn rows() -> f32 { return min(floor(0.72 * F.resY / rowPx()) + 1.0, f32(NRMAX)); }
fn rowVal(k: i32) -> f32 { return tv(k + i32(F.variant * 50.0)); }
/** Row k's bar across the land (−1..1 = the screen's width when flat-on): its centre and half-width. */
fn bar(k: i32) -> vec2f {
  let v = rowVal(k);
  if (F.variant > 0.5) { return vec2f(-0.92 + 0.46 * v, 0.46 * v); }
  return vec2f(0.0, 0.92 * v);
}

/** The reveal: 0 = the spectrum flat-on (the appraisal's last frame), 1 = the landscape. */
fn reveal() -> f32 {
  if (F.angle >= 0.0) { return 1.0; }
  let r = ss(0.25, 2.6, F.lt - F.angleAt);
  return r * r * (3.0 - 2.0 * r);
}

/** The land's geometry now: half-width (world), row spacing (world), the row at z = 0, the number of rows. Flat-on,
 *  a row is its pixel row; revealed, the rows open into depth. Spreading and contracting words widen or pack it. */
fn geo() -> vec4f {
  let e = reveal();
  let nr = rows();
  let dz0 = 2.0 * rowPx() / F.resX;
  let rho0 = 0.36 * F.resY / rowPx() - 1.0 / 6.0;
  let k = (1.0 + 0.55 * ss(0.0, 1.0, F.vu) * mw(2.0)) * (1.0 - 0.35 * ss(0.0, 1.0, F.vu) * mw(3.0));
  return vec4f(mix(1.0, WXF * k, e), mix(dz0, DEPTH / nr * k, e), rho0, nr);
}

/** How far the rows have flowed in (drifting: the spectrum runs toward you like a waterfall), in rows. */
fn scroll() -> f32 { return clockT() * mix(0.8, 3.0, F.s_arousal) * mw(8.0); }

/** The height scale (world): the word's scale and intensity, rising or subsiding, swelling, breathing on the tide. */
fn amp() -> f32 {
  let u = ss(0.0, 1.0, F.vu);
  var a = mix(0.2, 0.52, 0.5 * F.s_scale + 0.5 * F.s_intensity);
  a *= mix(1.0, mix(0.4, 1.25, u), mw(0.0));
  a *= mix(1.0, mix(1.15, 0.28, pow(F.vu, 1.2)), mw(1.0));
  a *= 1.0 + 0.3 * u * mw(3.0);
  a *= (1.0 - 0.6 * F.sh_flat) * (1.0 - 0.6 * F.m_void);
  a *= 1.0 + 0.1 * F.rh_pulsing * sin(F.vt * PI / beatP());
  return a * swell() * reveal();
}
/** The contour interval: about fourteen levels to the full height. */
fn interval() -> f32 { return mix(0.2, 0.52, 0.5 * F.s_scale + 0.5 * F.s_intensity) * (1.0 - 0.6 * F.sh_flat) * (1.0 - 0.6 * F.m_void) / 14.0; }

/** A row's matter: the word's first, or for a share of the rows its second (MATERIALS order of frame.ts). */
fn isSec(k: i32) -> f32 { return select(0.0, 1.0, fract(f32(k) * 0.618 + 0.3) < F.matShare); }

// ---------------------------------------------------------------- the land
/** The shape's weights, sharpened (the main form leads): jagged, flat, flowing, knotted, point, spiral, branching, splintered. */
struct Shape { jag: f32, flat: f32, flow: f32, knot: f32, point: f32, spiral: f32, branch: f32, split: f32 };
fn shape() -> Shape {
  let w = array<f32, 9>(F.sh_round, F.sh_jagged, F.sh_flowing, F.sh_splintered, F.sh_knotted, F.sh_flat, F.sh_spiral, F.sh_branching, F.sh_point);
  var s2 = 0.0;
  for (var i = 0; i < 9; i++) { s2 += w[i] * w[i]; }
  let k = 1.0 / max(s2, 1e-4);
  return Shape(w[1] * w[1] * k, w[5] * w[5] * k, w[2] * w[2] * k, w[4] * w[4] * k, w[8] * w[8] * k, w[6] * w[6] * k, w[7] * w[7] * k, w[3] * w[3] * k);
}

/** Row k's ridge at X (bar units): a hill whose base is its bar — round, peaked, a mesa — taller for a longer bar. */
fn ridge(k: i32, X: f32, sh: Shape) -> f32 {
  let bc = bar(k);
  let v = rowVal(k);
  var c = bc.x + sh.flow * 0.35 * sin(f32(k) * 0.045 + fract(F.seed * 0.013) * TAU);
  var b = max(bc.y, 0.035);
  c *= 1.0 - 0.6 * sh.knot;
  b *= 1.0 - 0.45 * sh.knot;
  let u = (X - c) / b;
  let a = abs(u);
  if (a >= 1.0) { return 0.0; }
  let bell = (1.0 - u * u) * (1.0 - u * u);
  let peak = pow(1.0 - a, 1.7) * (1.0 + 0.25 * sin(f32(k) * 2.7));
  let mesa = ss(1.0, 0.55, a) * 0.5;
  let jag = clamp(sh.jag + F.m_stone * 0.5 + sh.split * 0.4, 0.0, 1.0);
  let p = mix(mix(bell, peak, jag), mesa, sh.flat);
  return p * (0.2 + 0.8 * v) * (1.0 - 0.65 * sh.point);
}

/** Voronoi on q: (distance to the nearest edge, the cell's hash). */
fn cells(q: vec2f) -> vec2f {
  let i = floor(q);
  var d1 = 9.0; var d2 = 9.0; var id = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let c = i + vec2f(f32(x), f32(y));
      let h = hash22(c);
      let d = length(q - (c + h * 0.45 + 0.5));
      if (d < d1) { d2 = d1; d1 = d; id = h.x; } else if (d < d2) { d2 = d; }
    }
  }
  return vec2f(d2 - d1, id);
}

/** The rows' ridges at X around data row kap, softly joined (a Gaussian across ±5 rows: every row still shows as a
 *  rib): (height, second-material share). */
fn ridges(X: f32, kap: f32, sh: Shape) -> vec2f {
  var rs = vec2f(0.0); var ws = 0.0;
  let k0 = i32(round(kap));
  for (var j = -5; j <= 5; j++) {
    let k = k0 + j;
    let d = f32(k) - kap;
    let w = exp(-d * d * 0.11);
    rs += w * vec2f(ridge(k, X, sh), isSec(k));
    ws += w;
  }
  return rs / ws;
}

/** The land at X (bar units, −1..1) and row coordinate rho, from its ridges rs: (height in world units, second-material
 *  share, fault). (The terms a reading does not have are skipped: F is uniform, so are these branches.) */
fn landFrom(rs: vec2f, X: f32, rho: f32, sh: Shape) -> vec4f {
  let g = geo();
  let t = clockT();
  var h = rs.x;
  // the land's own coordinates once revealed (so its grain never swims while the rows open)
  let q = vec2f(X * WXF, (rho - g.z) * DEPTH / g.w);
  let seedo = vec2f(fract(F.seed * 0.0137) * 40.0, fract(F.seed * 0.0291) * 40.0);
  // a low floor, so the land beyond the spectrum is never dead flat
  h += 0.09 * fbm(q * 0.9 + seedo, 2) + 0.05;
  // one great peak (point), a spiral ridge, branching valleys carved through it
  let r = length(q);
  h += sh.point * 0.95 * exp(-r * r * 1.6);
  if (sh.spiral > 0.02) { h += sh.spiral * 0.45 * pow(0.5 + 0.5 * cos(atan2(q.y, q.x) - r * 3.2 + t * 0.15), 3.0) * exp(-r * 0.35); }
  if (sh.branch > 0.02) { h *= mix(1.0, ss(0.0, 0.22, abs(fbm(q * 0.8 + seedo * 1.3, 3))), sh.branch * 0.85); }
  // matter: stone ridged, sand dunes rippled, water swelling in, cloth folded, smoke drifting, wood grained
  if (F.m_stone > 0.02) { h += F.m_stone * 0.12 * (0.5 - abs(gnoise(q * 3.1 + seedo))) * h; }
  if (F.m_sand > 0.02) { h += F.m_sand * (0.035 * sin(q.y * 26.0 + 2.0 * gnoise(q * 1.3)) + 0.12 * ss(-0.4, 0.6, sin(q.x * 1.3 + q.y * 0.6))); }
  h += (F.m_water + F.tx_liquid * 0.6) * 0.07 * sin(q.y * 4.5 + 0.8 * sin(q.x * 0.9) + t * 1.4);
  h += F.m_cloth * 0.08 * sin(q.x * 4.0 + 1.5 * sin(q.y * 1.2));
  if (F.m_smoke > 0.02) { h += F.m_smoke * 0.12 * fbm(q * 1.2 + vec2f(t * 0.12, -t * 0.05), 2); }
  let fib = F.m_wood + F.tx_fibrous * 0.7;
  if (fib > 0.02) { h += fib * 0.015 * sin(q.x * 70.0 + 3.0 * gnoise(q * 2.0)); }
  // grain: a fine roughness; trembling shivers (harder on the beat)
  let grain = F.tx_grainy + F.tx_powdery * 0.6;
  if (grain > 0.02) { h += grain * 0.012 * gnoise(q * 40.0); }
  if (mw(5.0) > 0.02) {
    let lb = lastBeat();
    let kick = select(0.0, exp(-lb.y / 0.25), lb.x >= 0.0);
    h += mw(5.0) * (0.012 + 0.03 * kick) * gnoise(q * 9.0 + vec2f(t * 13.0, -t * 9.0));
  }
  // ice, glass, crystalline: terraces (the contours bunch at their edges)
  let terr = clamp(F.m_ice + F.m_glass * 0.8 + F.tx_crystalline * 0.8, 0.0, 1.0);
  if (terr > 0.02) {
    let iv = interval() / max(amp(), 1e-3) * 2.0; // (in the land's own units)
    let st = h / iv - 0.5; // (the treads sit between two contours: the contours gather on the risers)
    h = mix(h, (floor(st) + 0.5 + ss(0.7, 1.0, fract(st))) * iv, terr * 0.85);
  }
  // faults: cracked, splintered and breaking land splits into blocks that shift apart (breaking: more and more)
  let fault = clamp(F.tx_cracked + sh.split * 0.7 + mw(7.0), 0.0, 1.0);
  var crack = 1.0;
  if (fault > 0.02) {
    let fc = cells(q * 0.9 + seedo);
    h += fault * (fc.y - 0.1) * (0.015 * F.tx_cracked + 0.22 * mw(7.0) * ss(0.05, 1.0, F.vu));
    crack = mix(1.0, ss(0.0, 0.05, fc.x), fault);
  }
  // the edges fall away into the black
  h *= ss(1.0, 0.86, abs(X)) * ss(-0.5, 5.0, rho) * ss(g.w - 0.5, g.w - 6.0, rho);
  // the strike: one ring of land thrown up, running out from the centre at the start of its shot
  h += F.strike * 0.5 * exp(-pow(r - F.lt * 1.8, 2.0) * 6.0) * exp(-F.lt / 1.1);
  return vec4f(h * amp(), rs.y, crack, 0.0);
}

fn land(X: f32, rho: f32) -> vec4f {
  let sh = shape();
  return landFrom(ridges(X, rho + scroll(), sh), X, rho, sh);
}

fn landAt(p: vec2f) -> f32 {
  let g = geo();
  return land(p.x / g.x, g.z + p.y / g.y).x;
}

// ---------------------------------------------------------------- setup: the grid, and the camera
// each workgroup computes a tile of 16 × 8 cells: the ridges of the 20 rows its Gaussian reaches (once each), the land
// at its 17 × 9 corners, shared; then each cell keeps its four corners together (the march reads one vec4 per step)
var<workgroup> R: array<vec2f, 340>;
var<workgroup> T: array<vec4f, 153>;

@compute @workgroup_size(128)
fn setup(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_index) li: u32) {
  let ix0 = (i32(wg.x) % (NX / 16)) * 16;
  let r0 = (i32(wg.x) / (NX / 16)) * 8;
  let nr = i32(rows());
  let sh = shape();
  let sc = scroll();
  let kb = i32(floor(f32(r0) + sc)) - 5;
  if (r0 < nr) {
    for (var s = i32(li); s < 340; s += 128) {
      let k = kb + s / 17;
      R[s] = vec2f(ridge(k, f32(ix0 + s % 17) / f32(NX - 1) * 2.0 - 1.0, sh), isSec(k));
    }
  }
  workgroupBarrier();
  for (var s = i32(li); s < 153; s += 128) {
    let r = r0 + s / 17;
    if (r < nr) {
      let kap = f32(r) + sc;
      let k0 = i32(round(kap));
      var rs = vec2f(0.0); var ws = 0.0;
      for (var j = -5; j <= 5; j++) {
        let d = f32(k0 + j) - kap;
        let w = exp(-d * d * 0.11);
        rs += w * R[(k0 + j - kb) * 17 + s % 17];
        ws += w;
      }
      T[s] = landFrom(rs / ws, f32(ix0 + s % 17) / f32(NX - 1) * 2.0 - 1.0, f32(r), sh);
    }
  }
  workgroupBarrier();
  let lx = i32(li) % 16;
  let ly = i32(li) / 16;
  if (r0 + ly < nr) {
    let c = ly * 17 + lx;
    let i = (r0 + ly) * NX + ix0 + lx;
    SW[G0 + i] = vec4f(T[c].x, T[c + 1].x, T[c + 17].x, T[c + 18].x);
    SW[G1 + i] = T[c];
  }
  if (wg.x != 0u || li != 0u) { return; }
  let g = geo();
  let e = reveal();
  let t = clockT();
  // the camera: each angle a new place in the land (seed −1: the reveal, from straight above the spectrum)
  let h1 = hash22(vec2f(F.angle * 113.0 + 0.7, fract(F.seed * 0.001) * 31.0)) * 0.5 + 0.5;
  let h2 = hash22(vec2f(F.angle * 71.0 + 3.1, fract(F.seed * 0.001) * 17.0)) * 0.5 + 0.5;
  let front = F.angle < 0.0;
  let since = F.lt - F.angleAt;
  // who the word is about: "I" low among the lines, "you" facing them level, "we" turning, "they" high and far
  let they = F.who_they * ss(0.35, 0.8, F.s_distance);
  var yaw = select((h1.x - 0.5) * 0.8 + select(0.0, sign(h2.x - 0.85) * 1.1, abs(h2.x - 0.5) > 0.35), 0.0, front);
  yaw *= 1.0 - 0.8 * F.who_you;
  yaw += F.who_we * F.vt * 0.07 + mw(4.0) * t * 0.09;
  var hc = select(mix(0.07, 0.4, h1.y * h1.y), 0.3, front);
  hc *= mix(1.0, 0.3, F.who_i);
  hc += they * 1.3;
  var el = select(-mix(0.06, 0.3, h2.y), -0.2, front) * (1.0 - 0.6 * F.who_i) - they * 0.35;
  var pos = vec3f(select((h2.y - 0.5) * 1.2, 0.0, front), 0.0, select(mix(1.2, 2.5, h1.x), 2.5, front) + they * 1.5);
  // the shot's move (director.ts pluginOps → contours ops()): a low flight in, standing and panning, a crane, a track
  let mv = i32(F.flowOp);
  let calm = mix(1.0, 0.25, F.mo_still) * mix(1.0, 0.5, F.lazy);
  let fdir = vec3f(-sin(yaw), 0.0, -cos(yaw));
  if (mv == 0) { pos += fdir * since * mix(0.07, 0.24, F.s_arousal) * calm; }
  if (mv == 1) { yaw += since * 0.045 * select(1.0, -1.0, h1.y > 0.5) * calm; }
  if (mv == 2) { hc += since * 0.05 * calm; el -= since * 0.012 * calm; }
  if (mv == 3) { pos += vec3f(cos(yaw), 0.0, -sin(yaw)) * since * 0.09 * select(1.0, -1.0, h2.x > 0.5) * calm; }
  // above the land, never inside it (the ground under the camera, a little ahead)
  let ground = max(landAt(pos.xz), landAt(pos.xz + fdir.xz * 0.25));
  pos.y = ground + hc + 0.02;
  let dir = normalize(vec3f(-sin(yaw) * cos(el), sin(el), -cos(yaw) * cos(el)));
  var cp = pos;
  var fwd = dir;
  var rt = normalize(cross(fwd, vec3f(0.0, 1.0, 0.0)));
  var up = cross(rt, fwd);
  if (front) {
    // the reveal: from straight above the spectrum (the screen's width = the land's), tilting down into it —
    // an arc around a pivot that moves from the land's centre to where this camera looks
    let a = F.resX / F.resY;
    let tgt = pos + dir * 1.9;
    let phi = mix(PI * 0.5, asin(clamp((pos.y - tgt.y) / 1.9, -1.0, 1.0)), e);
    let dist = mix(2.0 / a, 1.9, e);
    let piv = mix(vec3f(0.0), tgt, e);
    cp = piv + vec3f(0.0, sin(phi), cos(phi)) * dist;
    fwd = normalize(piv - cp);
    rt = vec3f(1.0, 0.0, 0.0);
    up = cross(rt, fwd);
  }
  // focus: where the centre of the frame meets the land (the macro lens pulls focus when the camera moves)
  var ft = 4.0;
  var tt = 0.05;
  for (var s = 0; s < 56; s++) {
    let p = cp + fwd * tt;
    if (p.y < landAt(p.xz)) { ft = tt; break; }
    tt *= 1.09;
  }
  let prev = SW[0].w;
  let snap = F.mode > 0.5 || abs(SW[3].w - F.angle) > 1e-5 || prev <= 0.0;
  let focus = select(mix(prev, ft, 1.0 - exp(-min(F.dt, 0.1) * 3.0)), ft, snap);
  SW[0] = vec4f(cp, focus);
  SW[1] = vec4f(fwd, 2.0 * F.zoom);
  SW[2] = vec4f(rt, e);
  SW[3] = vec4f(up, F.angle);
  SW[4] = g;
  SW[5] = vec4f(amp(), scroll(), interval(), amp() * 1.6 + F.strike * 0.5 + 0.08);
}

// ---------------------------------------------------------------- drawing
/** Where world (x, z) falls in the grid: the cell's index and the fraction inside it (x < 0: off the land). */
fn gridAt(x: f32, z: f32) -> vec3f {
  let g = S[4];
  let gx = (x / g.x * 0.5 + 0.5) * f32(NX - 1);
  let gr = g.z + z / g.y;
  if (gx < 0.0 || gx > f32(NX - 1) || gr < 0.0 || gr > g.w - 1.0) { return vec3f(-1.0); }
  let i0 = min(i32(gx), NX - 2);
  let r0 = min(i32(gr), i32(g.w) - 2);
  return vec3f(f32(r0 * NX + i0), gx - f32(i0), gr - f32(r0));
}
/** The land's height at world (x, z), bilinear from the cell's four corners (one read); below the floor off the land. */
fn gridH(x: f32, z: f32) -> f32 {
  let c = gridAt(x, z);
  if (c.x < 0.0) { return -1.0; }
  let q = S[G0 + i32(c.x)];
  return mix(mix(q.x, q.y, c.y), mix(q.z, q.w, c.y), c.z);
}
/** The second-material share and the fault at world (x, z) (nearest cell corner). */
fn gridM(x: f32, z: f32) -> vec2f {
  let c = gridAt(x, z);
  if (c.x < 0.0) { return vec2f(0.0, 1.0); }
  return S[G1 + i32(c.x) + select(0, 1, c.y > 0.5) + select(0, NX, c.z > 0.5)].yz;
}

/** A pigment from the word's palette, chosen by a value (the contrast colour is rare). */
fn pigment(x: f32) -> vec3f {
  let p1 = vec3f(F.p1R, F.p1G, F.p1B);
  let p2 = vec3f(F.p2R, F.p2G, F.p2B);
  let p3 = vec3f(F.p3R, F.p3G, F.p3B);
  return select(mix(p1, p2, ss(0.3, 0.7, x)), p3, x > 0.9);
}

/** A matter's light (MATERIALS order): its tint on a line, and how much it glows. */
fn matTint(m: f32) -> vec3f {
  let i = i32(m);
  if (i == 0) { return vec3f(0.85, 0.9, 1.0); }  // metal: steel
  if (i == 1 || i == 5) { return vec3f(0.8, 0.92, 1.0); } // glass, ice: cold
  if (i == 2) { return vec3f(0.8, 0.78, 0.76); } // stone
  if (i == 3) { return vec3f(1.0, 0.82, 0.6); }  // sand: ochre
  if (i == 4) { return vec3f(0.6, 0.8, 1.0); }   // water
  if (i == 6) { return vec3f(0.7, 0.7, 0.72); }  // smoke
  if (i == 7) { return vec3f(1.0, 0.45, 0.12); } // fire
  if (i == 8) { return vec3f(0.95, 0.7, 0.45); } // wood
  if (i == 10) { return vec3f(1.0, 0.7, 0.65); } // flesh
  return vec3f(1.0);
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let res = vec2f(F.resX, F.resY);
  let ndc = (fc.xy - res * 0.5) / (res.y * 0.5) * vec2f(1.0, -1.0);
  let ro = S[0].xyz;
  let focal = S[1].w;
  let rd = normalize(S[1].xyz * focal + S[2].xyz * ndc.x + S[3].xyz * ndc.y);
  let e = S[2].w;
  let g = S[4];
  let L5 = S[5];
  // the land's box: a ray that misses it is black at once
  let bmin = vec3f(-g.x, -0.3, (0.0 - g.z) * g.y);
  let bmax = vec3f(g.x, L5.w, (g.w - 1.0 - g.z) * g.y);
  let inv = 1.0 / select(rd, vec3f(1e-6), abs(rd) < vec3f(1e-6));
  let ta = (bmin - ro) * inv;
  let tb = (bmax - ro) * inv;
  let tn = max(max(min(ta.x, tb.x), min(ta.y, tb.y)), max(min(ta.z, tb.z), 0.0));
  let tf = min(min(max(ta.x, tb.x), max(ta.y, tb.y)), max(ta.z, tb.z));
  // march the heightfield: steps shrink near the ground, grow with distance (the far land is out of focus anyway)
  var t = tn;
  var hit = false;
  if (tn < tf) {
    var tp = t;
    var dp = 1.0;
    for (var i = 0; i < 60; i++) {
      let p = ro + rd * t;
      let d = p.y - gridH(p.x, p.z);
      if (d < 0.0) {
        t = tp + (t - tp) * dp / max(dp - d, 1e-6);
        hit = true;
        break;
      }
      if (t > tf) { break; }
      tp = t;
      dp = d;
      t += max(d * 0.65, 0.002 + t * 0.015);
    }
  }
  let p = ro + rd * t;
  let G = vec3f(gridH(p.x, p.z), gridM(p.x, p.z));
  let X = p.x / g.x;
  let rhoF = g.z + p.z / g.y;          // the row coordinate of the land
  let kap = rhoF + L5.y;               // the data row coordinate (rows flow in when drifting)
  let k = i32(round(kap));
  let lvl = G.x / L5.z - 0.5;          // the contour coordinate (levels between the whole intervals)
  let xd = p.x / (DEPTH / g.w);        // along a row, in row spacings
  // the pixel's footprint on the land: the screen → (along, across the rows) Jacobian, so every bead is round on the
  // screen and every line its width in pixels, however the land is seen
  let a11 = dpdx(xd); let a12 = dpdy(xd); let a21 = dpdx(kap); let a22 = dpdy(kap);
  let det = a11 * a22 - a12 * a21;
  let idet = select(1.0 / det, 0.0, abs(det) < 1e-9);
  let gK = max(length(vec2f(a21, a22)), 1e-5);     // rows per pixel
  let gD = max(length(vec2f(a11, a12)), 1e-5);     // row spacings along a row per pixel
  let fwX = max(fwidth(X), 1e-5);
  let fwL = max(fwidth(lvl), 1e-5);
  let pxw = focal * res.y * 0.5 / max(t, 1e-3);  // pixels per world unit at the hit

  // the lens, drawn exactly: near and far beads open into discs (their light spread over them), lines widen and dim;
  // focused where the frame's centre meets the land (neutral words: sharper). The shared lens only softens a little.
  let coc = clamp(abs(t - S[0].w) / max(t, 1e-3) * mix(12.0, 26.0, ss(1.0, 2.5, F.zoom)) * mix(1.0, 1.5, F.who_i)
    * (1.0 - 0.45 * F.moodNeu), 0.0, 14.0) * e;

  // the style of the shot (ops warp): 0 dotted rows · 1 contours · 2 pins · 3 ridgelines + index contours
  let st = i32(F.warpOp) % 4;
  let neg = clamp(1.0 - F.moodPos - F.moodNeu, 0.0, 1.0);
  let soft = clamp(F.tx_soft + F.m_smoke * 0.8 + F.m_cloth * 0.3, 0.0, 1.0);
  let hard = clamp(F.m_stone + F.m_metal + F.m_ice + F.m_glass + neg * 0.6, 0.0, 1.0);
  // line half-widths (px): soft matter wider, hard matter and the dark finer; flat-on, exactly the spectrum's pixel row
  let lw = mix(mix(0.6, 1.0, soft) * mix(1.0, 0.85, hard), 0.5, 1.0 - e);
  // (a defocused line spreads, but never past a small share of the gap to its neighbours — dense lines out of focus
  // go dark rather than merge into stripes — and its light is spread over its width)
  let W = lw + min(coc * 0.2, 0.12 / gK);
  let kW = pow((lw + 0.5) / (lw + coc * 0.6 + 0.5), 1.6);
  let bead0 = clamp(0.0045 * pxw, 0.6, 2.6) * mix(1.0, 1.3, soft);
  // (rows denser than the pixels fade to their mean light: never a moiré)
  let rowPxS = 1.0 / gK;
  let ny = ss(1.1, 2.6, rowPxS + coc);

  // how much of each line family the style draws
  var wRow = 1.0; var wDot = 1.0; var wIso = 0.0; var wPin = 0.0;
  if (st == 1) { wRow = 0.05; wDot = 0.0; wIso = 1.0; }
  if (st == 2) { wRow = 0.0; wDot = 0.0; wPin = 1.0; }
  if (st == 3) { wDot = 0.0; wIso = 0.5; }
  // neutral words lean toward the survey (exact contours), and draw their rows as clean lines
  wIso = max(wIso, F.moodNeu * 0.45 * select(1.0, 0.0, st == 2));
  wDot *= 1.0 - F.moodNeu * 0.6;
  let dotted = wDot * ss(0.15, 0.8, e);
  let beadsShown = max(dotted, wPin);

  // the beat: a comb of rows (or a contour level) lights up, the same beats the sound strikes (a stutter skips)
  let lb = lastBeat();
  let fl = select(0.0, exp(-lb.y / 0.35) * ss(0.0, 0.03, lb.y), lb.x >= 0.0) * (0.6 + F.rh_steady + F.rh_stuttering) * e;
  let bi = i32(lb.x);

  // the relief under the lines (only the pins and metal read the slope)
  var n = vec3f(0.0, 1.0, 0.0);
  if (st == 2 || F.m_metal > 0.05) {
    let ex = 0.02;
    n = normalize(vec3f(gridH(p.x - ex, p.z) - gridH(p.x + ex, p.z), 2.0 * ex, gridH(p.x, p.z - ex) - gridH(p.x, p.z + ex)));
  }
  let rake = max(dot(n, normalize(vec3f(-0.8, 0.45, -0.3))), 0.0);

  let sec = ss(0.3, 0.7, G.y);
  let m = mix(F.matTop, F.matSec, step(0.5, sec));
  let tint = matTint(m);
  let elev = clamp(G.x / max(L5.x, 1e-3), 0.0, 1.0);
  let fire = clamp(F.m_fire + select(0.0, 0.8, i32(m) == 7) * sec, 0.0, 1.0);
  let icy = clamp(F.m_ice + F.m_glass + F.tx_crystalline * 0.5, 0.0, 1.0);

  // the rows: this one and its neighbours (a wide bead reaches across), each its own — its bar, its brightness, its
  // colour, solid or beaded, its beads' spacing and phase (so the land never reads as a mesh)
  var col = vec3f(0.0);
  var flatI = 0.0;
  let sparkle = (F.moodPos + icy) * e > 0.02;
  for (var j = -1; j <= 1; j++) {
    // (a neighbour row only matters when its light reaches this pixel)
    if (j != 0 && bead0 * 1.3 + coc + W + 2.0 < 0.5 * rowPxS) { continue; }
    let kk = k + j;
    let ok = kap - f32(kk);
    let r1 = tv(kk * 5 + 31);
    let r2 = tv(kk * 11 + 23);
    let r3 = tv(kk * 3 + 41);
    // its bar: lit across it, faint beyond (flat-on: nothing beyond it, as in the appraisal)
    let bc = bar(kk);
    let inBar = ss(0.5, -0.5, (abs(X - bc.x) - bc.y) / fwX);
    let lit = mix(mix(0.0, mix(0.07, 0.03, F.m_void), e), 1.0, inBar);
    let bright = mix(0.4, 1.0, r2) * (1.0 + 1.2 * step(0.94, r2)) * (1.0 + 2.4 * select(0.0, fl, (((kk - bi) % 7) + 7) % 7 == 0));
    // the line (in pixels across it)
    let dl = abs(ok) / gK;
    let line = ss(W + 0.6 + coc * 0.25, W - 0.4 - coc * 0.25, dl) * kW;
    if (j == 0) { flatI = ss(1.0, 0.0, dl) * inBar; }
    // the beads: a row's spacing (1, ½ or 2 row spacings) and phase from its data; a few rows stay solid lines
    let sp = select(select(1.0, 0.5, r3 > 0.62), 2.0, r3 < 0.25);
    let xk = xd / sp + r3 * 7.0;
    let beadR = bead0 * mix(0.8, 1.25, r1);
    let R = beadR + min(coc, 0.45 * min(1.0 / gK, sp / gD));
    let kB = (beadR + 0.5) * (beadR + 0.5) / ((R + 0.5) * (R + 0.5)) * 1.8;
    var beads = 0.0;
    var glit = 0.0;
    for (var b = -1; b <= 1; b++) {
      let jb = round(xk) + f32(b);
      let o = vec2f((xk - jb) * sp, ok);
      let s = vec2f(a22 * o.x - a12 * o.y, -a21 * o.x + a11 * o.y) * idet;
      let d = length(s);
      let disc = ss(R + 0.7, R - 0.5, d) * (0.85 + 0.35 * ss(R * 0.5, R, d) * ss(2.0, 5.0, coc));
      beads += disc;
      // positive: a few beads glitter (slowly, never a strobe); ice and glass: cold glints
      if (sparkle && disc > 0.0) {
        let tw = hash41(vec2f(jb, f32(kk)), floor(F.time * 2.0 + r2));
        glit += disc * step(0.975, tw.x) * (0.5 + 0.5 * sin(F.time * 4.0 + tw.y * TAU));
      }
    }
    // beads packed tighter than the pixels merge back into their line
    let beadPx = sp / gD;
    let solid = select(0.0, 1.0, r1 < 0.2);
    let bd = mix(beads * kB, line, max(ss(4.0, 1.5, beadPx), solid));
    let rowI = mix(line, bd, dotted) * mix(1.0, wRow + wDot, e);
    let pinI = beads * kB * (0.2 + 1.4 * rake) * wPin;
    // its colour: the word's palette row by row, its matter's tint (a second matter's rows their own)
    let c = pigment(tv(kk * 7 + 3)) * mix(vec3f(1.0), tint, 0.35);
    let pinC = mix(vec3f(0.85, 0.83, 0.8), c, 0.5) * tint;
    col += (c * rowI + pinC * pinI) * lit * bright * ny;
    col += (vec3f(1.0, 0.86, 0.62) * F.moodPos * 2.2 + vec3f(0.8, 0.9, 1.0) * icy * 1.5) * glit * kB * lit * beadsShown * e;
    // fire: the low rows glow like lava lines, crawling slowly
    col += vec3f(1.0, 0.36, 0.07) * fire * line * ss(0.35, 0.0, elev) * (0.7 + 0.3 * sin(xd * 0.35 - clockT() * 1.6)) * 1.6 * e * ny;
  }
  // far off, where the rows are denser than the pixels: their mean light, dim (a texture, never a haze)
  col += pigment(tv(k * 7 + 3)) * tint * (1.0 - ny) * min(2.0 * lw * gK, 1.0) * 0.15 * (wRow + wDot) * e;

  // the contours: every interval, each fifth a heavier index contour (neutral: the survey)
  let li = i32(round(lvl));
  let index = select(0.0, 1.0, ((li % 5) + 5) % 5 == 2);
  let lwI = lw * (1.0 + 0.7 * index);
  let wl = lwI + min(coc * 0.2, 0.12 / fwL);
  let oL = abs(fract(lvl + 0.5) - 0.5) / fwL;
  let nyL = ss(0.9, 0.35, fwL);
  let iso = ss(wl + 0.6 + coc * 0.25, wl - 0.4 - coc * 0.25, oL) * pow((lwI + 0.5) / (lwI + coc * 0.6 + 0.5), 1.6) * nyL
    * select(1.0, 0.0, G.x < 0.25 * L5.z);
  let lvlFlare = select(0.0, fl, (((li - bi) % 4) + 4) % 4 == 0);
  let isoCol = mix(pigment(0.75), pigment(0.2), elev) * mix(vec3f(1.0), tint, 0.35);
  col += isoCol * iso * wIso * e * 1.5 * (1.0 + 2.0 * lvlFlare) * (1.0 + 0.8 * index * F.moodNeu);
  col += vec3f(1.0, 0.36, 0.07) * fire * iso * ss(0.35, 0.0, elev) * 1.4 * e;
  // the pins' dark relief under its lit heads
  col += vec3f(0.8, 0.82, 0.85) * rake * rake * 0.018 * wPin * e;
  col *= (1.0 + F.m_light * 0.7) * (1.0 - 0.45 * F.m_void);
  // metal: a sheen slides along the lines facing the light
  col *= 1.0 + F.m_metal * 1.2 * pow(max(dot(reflect(rd, n), normalize(vec3f(0.3, 0.6, -0.7))), 0.0), 12.0);
  // a cracked or breaking land: every line breaks at the faults
  col *= mix(1.0, G.z, e);
  // the land's edges dissolve into the black: its far rows become the horizon
  col *= mix(1.0, ss(0.0, 45.0, rhoF) * ss(g.w, g.w - 10.0, rhoF) * ss(1.0, 0.8, abs(X)), e);

  // the mood (never an inversion): negative colourless and hard; neutral cool and exact; positive in its palette, warm
  let lum = dot(col, vec3f(0.2126, 0.7152, 0.0722));
  col = mix(col, vec3f(pow(lum, 1.15) * 1.25), neg * e);
  col = mix(col, mix(vec3f(lum), vec3f(0.62, 0.8, 1.0) * lum * 1.5, 0.7), F.moodNeu * 0.8 * e);
  col *= mix(vec3f(1.0), vec3f(1.08, 1.0, 0.9), F.moodPos);
  // the tide of a pulsing word, and the whole land's strength
  col *= (1.0 + 0.45 * F.rh_pulsing * (0.5 - 0.5 * cos(F.vt * PI / beatP()))) * mix(1.0, swell(), 0.5);
  // flat-on: the appraisal's own ink (its accent on the longest bars), exactly as it was left
  let flat = select(vec3f(F.baseR, F.baseG, F.baseB), vec3f(F.accR, F.accG, F.accB), rowVal(k) > 0.9) * 1.4 * flatI;
  col = mix(flat, col * 1.3, ss(0.0, 0.25, e));
  col *= select(0.0, 1.0, hit);
  return vec4f(col * ss(0.0, 0.08, F.lt + F.vt), coc * 0.4 * select(0.0, 1.0, hit));
}
