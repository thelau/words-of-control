// INK — the reading gone liquid. A real fluid (stable fluids: advection, vorticity, pressure projection)
// seeded with the appraisal's last reading — its bars dissolve into dye — then fed by the word itself:
// one source per byte, each firing on the word's beat (the same beats the sound plays, clips.ts ink()),
// pushing the way the word moves (grief falls, joy rises, fear trembles, love circles), in its matter's
// viscosity (stone is thick, water curls, smoke rises and thins, fire rises and darkens).
// Domain: the unit square, y up; the screen shows it "cover" (the long side spans it).

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var<storage, read> tape: array<f32>;
@group(0) @binding(2) var velIn: texture_2d<f32>;
@group(0) @binding(3) var velOut: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var pIn: texture_2d<f32>;
@group(0) @binding(5) var pOut: texture_storage_2d<rgba16float, write>;
@group(0) @binding(6) var divIn: texture_2d<f32>;
@group(0) @binding(7) var divOut: texture_storage_2d<rgba16float, write>;
@group(0) @binding(8) var dyeIn: texture_2d<f32>;
@group(0) @binding(9) var dyeOut: texture_storage_2d<rgba16float, write>;
@group(0) @binding(10) var lin: sampler;
// the fibres: coordinates carried by the flow (two staggered phases, each re-seeded in turn so none stretches to
// nothing) — they give the dye its fine organic detail, tendrils drawn out by the current itself
@group(0) @binding(11) var fibIn: texture_2d<f32>;
@group(0) @binding(12) var fibOut: texture_storage_2d<rgba16float, write>;
const FIB_PERIOD = 4.0;

const VN = 256.0;  // velocity grid (keep in step with gpu.ts INK_VEL)
const DN = 1536.0; // dye grid (gpu.ts INK_DYE)

fn tv(i: i32) -> f32 {
  let n = max(i32(F.tapeLen), 1);
  return tape[((i % n) + n) % n];
}
fn byteOf(i: i32) -> u32 { return u32(clamp(tv(i), 0.0, 1.0) * 255.0 + 0.5); }
fn fresh() -> bool { return F.mode > 0.5; }
/** The fluid's time step: an idle word's fluid moves slower (its beats stay on the sound's clock). */
fn stepDt() -> f32 { return min(F.dt, 1.0 / 30.0) * mix(1.0, 0.35, F.lazy); }
fn beatP() -> f32 { return 60.0 / mix(56.0, 128.0, F.s_arousal); }

/** One source per byte of the word (3–12). */
fn sources() -> i32 { return clamp(i32(F.byteLen), 3, 12); }

/** The word's main shape (index into SHAPES of frame.ts). */
fn shapeTop() -> i32 {
  let sh = array<f32, 9>(F.sh_round, F.sh_jagged, F.sh_flowing, F.sh_splintered, F.sh_knotted, F.sh_flat, F.sh_spiral, F.sh_branching, F.sh_point);
  var best = 0;
  for (var i = 1; i < 9; i++) { if (sh[i] > sh[best]) { best = i; } }
  return best;
}

/** Where source k sits: the sources are laid out in the word's shape (a ring for the round, a wave for the
 *  flowing, a spiral, a tree for the branching, one point, a scatter for the jagged…), each nudged by its value. */
fn srcPos(k: i32) -> vec2f {
  let n = sources();
  let t = f32(k) / f32(max(n - 1, 1));
  let j = vec2f(tv(k) - 0.5, tv(k + 1) - 0.5);
  let h = hash22(vec2f(f32(k) * 3.1, F.seed * 0.01));
  let a = f32(k) / f32(n) * TAU + tv(k + 1) * 2.0;
  var q: vec2f;
  switch shapeTop() {
    case 1: { q = vec2f(0.5) + h * vec2f(0.34, 0.2); }                                         // jagged: a scatter
    case 2: { q = vec2f(0.15 + 0.7 * t, 0.5 + 0.13 * sin(t * TAU + tv(0) * 3.0)); }             // flowing: a wave across
    case 3: { q = vec2f(0.5) + vec2f(cos(h.x * PI), sin(h.x * PI) * 0.62) * 0.33 * (0.2 + 0.8 * t); } // splintered: shards out
    case 4: { q = vec2f(0.5) + h * 0.07; }                                                      // knotted: a tight knot
    case 5: { q = vec2f(0.12 + 0.76 * t, 0.36); }                                               // flat: a low line
    case 6: { let r = 0.03 + 0.26 * t; let b = t * 2.5 * TAU; q = vec2f(0.5) + vec2f(cos(b), sin(b) * 0.62) * r; } // spiral
    case 7: {                                                                                  // branching: a tree
      let lv = floor(log2(f32(k) + 1.0));
      let x = (f32(k) + 1.0 - exp2(lv) + 0.5) / exp2(lv);
      q = vec2f(0.5 + (x - 0.5) * 0.7, 0.3 + lv * 0.12);
    }
    case 8: { q = vec2f(0.5) + h * 0.015; }                                                     // point: one source
    default: { q = vec2f(0.5) + vec2f(cos(a), sin(a) * 0.62) * 0.3 * (0.35 + 0.65 * tv(k)); }  // round: a ring
  }
  return q + j * 0.03;
}

/** How much of motion k plays now: the main gesture throughout, the second turning in during the second half. */
fn mw(k: f32) -> f32 {
  return select(0.0, 1.0, F.moTop == k) + select(0.0, F.moSecP * 1.6 * ss(0.35, 0.8, F.vu), F.moSec == k);
}

/** Which way the word pushes from a source at s (MOTIONS order: rising falling spreading contracting circling
 *  trembling still breaking drifting); b = the beat (trembling and breaking change with it). */
fn push(s: vec2f, b: f32) -> vec2f {
  let out = normalize(s - vec2f(0.5) + vec2f(1e-4));
  let jig = hash22(vec2f(b, F.seed * 0.001));
  return vec2f(0.0, 1.0) * mw(0.0) + vec2f(0.0, -1.0) * mw(1.0) + out * mw(2.0) - out * mw(3.0)
    + vec2f(-out.y, out.x) * mw(4.0) + normalize(jig + vec2f(1e-4)) * mw(5.0) * 0.8
    + out * mw(7.0) * 1.8 + vec2f(1.0, 0.15) * mw(8.0) * 0.5;
}

/** The last beat that fired before now (−1 if none), and time since it. A stutter skips some beats
 *  (show/rhythm.ts skipped). */
fn lastBeat() -> vec2f {
  let P = beatP();
  var b = floor(F.vt / P);
  if (F.rh_stuttering > 0.35 && fract(b * 0.618) > 0.55) { b -= 1.0; }
  if (b < 0.0) { return vec2f(-1.0, 99.0); }
  return vec2f(b, F.vt - b * P);
}

/** The strength of the sources over the verdict: a swelling word grows, a dwindling one fades. */
fn swell() -> f32 { return max(0.05, 1.0 + 0.6 * F.rh_swelling * (2.0 * F.vu - 1.0) - 0.85 * F.rh_dwindling * F.vu); }

/** The splat of the source now firing, at domain point p: (weight, source index); the source breathes out
 *  over ~0.45 s after its beat. */
fn splat(p: vec2f) -> vec2f {
  let lb = lastBeat();
  if (lb.x < 0.0) { return vec2f(0.0, -1.0); }
  let k = i32(lb.x) % sources();
  let r = mix(0.008, 0.018, F.s_scale) * mix(1.0, 0.6, F.mo_trembling); // (fine: the view is macro)
  // the source travels along its push while it pours: each beat draws a moving stroke of ink, never a blob that
  // piles up in place (a still word's drop stays where it falls)
  let pd0 = normalize(push(srcPos(k), lb.x) + vec2f(1e-4, 0.0));
  let d = p - srcPos(k) - pd0 * min(lb.y, 0.6) * 0.16 * (1.0 - F.mo_still);
  let env = exp(-lb.y / mix(0.45, 0.15, F.mo_breaking + F.mo_trembling * 0.5) * (1.0 - 0.6 * F.mo_still)) * ss(0.0, 0.03, lb.y);
  let x = dot(d, d) / (r * r);
  if (x > 100.0) { return vec2f(0.0, f32(k)); } // far from the drop (and from a still drop's widest front)
  // a jet, not a ball: the drop is drawn out along its push, a short streak trailing behind the source (a round
  // blob of fresh dye read as a glowing bokeh light)
  let pd = pd0;
  let along = dot(d, pd) + r * 1.2;
  let across = dot(d, vec2f(-pd.y, pd.x));
  let xj = (across * across * 2.2 + along * along / 4.0) / (r * r);
  let drop = exp(-xj * xj * xj); // (a crisp edge: a soft one read as an out-of-focus glowing oval)
  // a still word does not push: its drop opens where it falls, like ink on wet paper — a crisp front spreading
  // out, feathered unevenly (each drop its own fringe), leaving growth rings and a faint wash behind it
  let R = r * (1.0 + 2.6 * sqrt(min(lb.y, 1.6)));
  let a = atan2(d.y, d.x);
  let fk = f32(k) * 7.3 + lb.x;
  let fr = R * (1.0 + 0.22 * gnoise(vec2f(cos(a), sin(a)) * 1.6 + vec2f(fk, 0.0)) + 0.07 * gnoise(vec2f(cos(a), sin(a)) * 7.0 + vec2f(0.0, fk)));
  let dist = length(d);
  let front = exp(-pow((dist - fr) / (r * 0.22), 2.0)) + 0.12 * ss(fr, fr * 0.7, dist);
  return vec2f(mix(drop, front * 0.8, F.mo_still) * env * swell(), f32(k));
}

/** The source's matter: the word's first material, or for a share of the sources its second
 *  (MATERIALS order of frame.ts) — shame is embers among waves. */
fn srcMat(k: i32) -> f32 { return select(F.matTop, F.matSec, fract(f32(k) * 0.618 + 0.3) < F.matShare); }
/** How a matter moves on its own: heavy matter sinks, fire, smoke and light rise. */
fn matLift(m: f32) -> f32 {
  let i = i32(m);
  if (i == 0 || i == 2 || i == 3 || i == 5) { return -1.0; }
  if (i == 4 || i == 8 || i == 10) { return -0.5; }
  if (i == 6 || i == 7 || i == 11) { return 1.0; }
  return 0.0;
}
/** Ice and glass (and crystalline words) freeze over the verdict. */
fn frozen() -> f32 { return clamp(F.m_ice + F.m_glass + F.tx_crystalline * 0.7, 0.0, 1.0) * ss(0.25, 0.85, F.vu); }

/** Distance to the nearest cell edge (the cracks of a cracked word). */
fn cellEdge(p: vec2f) -> f32 {
  let i = floor(p);
  var d1 = 9.0; var d2 = 9.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let c = i + vec2f(f32(x), f32(y));
      let d = length(p - (c + hash22(c) * 0.45 + 0.5));
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return d2 - d1;
}
/** A cracked word's dye is laid down already broken. */
fn cracks(p: vec2f) -> f32 {
  if (F.tx_cracked < 0.05) { return 1.0; }
  let e = cellEdge(p * 22.0 + vec2f(F.seed % 37.0));
  return mix(1.0, ss(0.03, 0.1, e), clamp(F.tx_cracked * 1.5, 0.0, 1.0));
}

fn velAt(p: vec2f) -> vec2f { return textureSampleLevel(velIn, lin, p, 0.0).xy; }
fn velLoad(c: vec2i) -> vec2f { return textureLoad(velIn, clamp(c, vec2i(0), vec2i(i32(VN) - 1)), 0).xy; }
fn curlAt(c: vec2i) -> f32 {
  return (velLoad(c + vec2i(1, 0)).y - velLoad(c - vec2i(1, 0)).y - velLoad(c + vec2i(0, 1)).x + velLoad(c - vec2i(0, 1)).x) * 0.5 * VN;
}

// ---------------------------------------------------------------- velocity: advect + forces + vorticity
@compute @workgroup_size(16, 16)
fn force(@builtin(global_invocation_id) id: vec3u) {
  let c = vec2i(id.xy);
  if (fresh()) { textureStore(velOut, c, vec4f(0.0)); return; }
  let p = (vec2f(id.xy) + 0.5) / VN;
  let dt = stepDt();
  var v = velAt(p - dt * velLoad(c));
  // the matter's viscosity: heavy matter is thick and slow, water and smoke run free
  let thick = F.m_stone + F.m_metal + F.m_wood * 0.7 + F.m_sand * 0.6 + F.m_ice * 0.5 + F.m_flesh * 0.4 + F.m_cloth * 0.4;
  v *= exp(-dt * mix(0.25, 2.2, clamp(thick, 0.0, 1.0)));
  // ice and glass freeze: the flow stops as the verdict goes on
  v *= exp(-dt * frozen() * 6.0);
  // vorticity: smoke and fire curl most, water curls, the soft and the still barely (confinement toward |ω| peaks)
  let curls = mix(3.0, 12.0, clamp(F.m_smoke + F.m_fire + F.m_water * 0.7 + F.s_tension * 0.4 + F.s_arousal * 0.3, 0.0, 1.0))
    * (1.0 - 0.7 * F.tx_soft) * (1.0 - 0.8 * F.mo_still);
  let w = curlAt(c);
  let gw = vec2f(abs(curlAt(c + vec2i(1, 0))) - abs(curlAt(c - vec2i(1, 0))), abs(curlAt(c + vec2i(0, 1))) - abs(curlAt(c - vec2i(0, 1))));
  let n = gw / (length(gw) + 1e-5);
  v += vec2f(n.y, -n.x) * w * curls * dt / VN;
  // buoyancy: the dye's weight — fire, smoke and light rise, water, stone and metal sink (and so do falling words)
  let dens = textureSampleLevel(dyeIn, lin, p, 0.0).a;
  let lift = F.m_fire + F.m_smoke + F.m_light * 0.7 + F.mo_rising * 0.8 - F.m_water * 0.6 - F.m_stone - F.m_metal * 0.8 - F.mo_falling;
  v.y += dens * lift * 0.3 * dt;
  // the word's own gesture everywhere (weak): a drifting word is carried, a circling one turns, a trembling one shivers,
  // a contracting one is drawn in
  let o = p - vec2f(0.5);
  v += (vec2f(0.04, 0.006) * mw(8.0) + vec2f(-o.y, o.x) * 0.15 * mw(4.0) - o * 0.12 * mw(3.0)) * dt;
  v += curl(p * 9.0, F.vt * 3.0) * 0.25 * dt * (mw(5.0) + F.s_arousal * 0.3) * mix(1.0, 0.1, F.mo_still);
  // a pulsing word: the whole fluid rocks back and forth on the tide (two beats), as the sound's tide swells
  v += vec2f(-o.y, o.x) * F.rh_pulsing * 0.5 * sin(F.vt * PI / beatP()) * dt;
  // the shot's current (its construction, director.ts inkOps): none, a shear, one great turn, two cells
  let calm = mix(1.0, 0.15, F.mo_still);
  let fo = i32(F.flowOp);
  if (fo == 1) { v.x += (p.y - 0.5) * 0.35 * dt * calm; }
  if (fo == 2) { v += vec2f(-o.y, o.x) * 0.35 * dt * calm; }
  if (fo == 3) { v += vec2f(PI * sin(TAU * p.x) * cos(PI * p.y), -TAU * cos(TAU * p.x) * sin(PI * p.y)) * 0.012 * dt * calm; }
  // the source now firing pushes the word's way
  let sp = splat(p);
  if (sp.y >= 0.0) {
    let k = i32(sp.y);
    let strength = mix(1.5, 5.0, F.s_intensity * 0.5 + F.s_arousal * 0.5) * mix(1.0, 0.08, F.mo_still);
    v += push(srcPos(k), floor(lastBeat().x)) * sp.x * strength * dt;
    // ink billows as it enters: a small turbulence where it pours, so it never lands as a smooth shape
    v += curl(p * 70.0, F.vt * 2.5) * sp.x * mix(0.004, 0.012, F.s_arousal) * (1.0 - F.mo_still);
    // and its matter moves its own way (the second material's sources are another substance)
    v.y += matLift(srcMat(k)) * sp.x * 1.2 * dt;
  }
  // the strike: one shockwave out of the centre at the start of its shot
  if (F.strike > 0.0) {
    let r = length(o);
    v += normalize(o + vec2f(1e-4)) * F.strike * 5.0 * exp(-pow(r - F.lt * 0.9, 2.0) / 0.0015) * ss(0.5, 0.2, F.lt) * dt;
  }
  // walls: the fluid stays in its vessel
  let edge = min(min(p.x, 1.0 - p.x), min(p.y, 1.0 - p.y));
  v *= ss(0.0, 0.02, edge);
  textureStore(velOut, c, vec4f(clamp(v, vec2f(-2.0), vec2f(2.0)), 0.0, 0.0));
}

// ---------------------------------------------------------------- projection (the fluid is incompressible)
@compute @workgroup_size(16, 16)
fn divergence(@builtin(global_invocation_id) id: vec3u) {
  let c = vec2i(id.xy);
  let d = (velLoad(c + vec2i(1, 0)).x - velLoad(c - vec2i(1, 0)).x + velLoad(c + vec2i(0, 1)).y - velLoad(c - vec2i(0, 1)).y) * 0.5;
  textureStore(divOut, c, vec4f(d, 0.0, 0.0, 0.0));
}

fn pLoad(c: vec2i) -> f32 { return textureLoad(pIn, clamp(c, vec2i(0), vec2i(i32(VN) - 1)), 0).x; }

@compute @workgroup_size(16, 16)
fn jacobi(@builtin(global_invocation_id) id: vec3u) {
  let c = vec2i(id.xy);
  if (fresh()) { textureStore(pOut, c, vec4f(0.0)); return; }
  let s = pLoad(c + vec2i(1, 0)) + pLoad(c - vec2i(1, 0)) + pLoad(c + vec2i(0, 1)) + pLoad(c - vec2i(0, 1));
  textureStore(pOut, c, vec4f((s - textureLoad(divIn, c, 0).x) * 0.25, 0.0, 0.0, 0.0));
}

@compute @workgroup_size(16, 16)
fn project(@builtin(global_invocation_id) id: vec3u) {
  let c = vec2i(id.xy);
  let g = vec2f(pLoad(c + vec2i(1, 0)) - pLoad(c - vec2i(1, 0)), pLoad(c + vec2i(0, 1)) - pLoad(c - vec2i(0, 1))) * 0.5;
  textureStore(velOut, c, vec4f(velLoad(c) - g, 0.0, 0.0));
}

// ---------------------------------------------------------------- dye: rgb = pigment, a = density

/** A pigment from the word's palette, chosen by a value of its tape (the contrast colour is rare). */
fn pigment(x: f32) -> vec3f {
  let p1 = vec3f(F.p1R, F.p1G, F.p1B);
  let p2 = vec3f(F.p2R, F.p2G, F.p2B);
  let p3 = vec3f(F.p3R, F.p3G, F.p3B);
  return select(mix(p1, p2, ss(0.3, 0.7, x)), p3, x > 0.9);
}

/** The appraisal's last reading, as dye: its bars (the tape's bits, full height), or for a question one line. */
fn reading(p: vec2f) -> vec4f {
  if (F.variant2 > 0.5) {
    let on = ss(0.004, 0.0015, abs(p.y - 0.5)) * step(0.12, p.x) * step(p.x, 0.88);
    return vec4f(vec3f(F.baseR, F.baseG, F.baseB), 1.0) * on;
  }
  // the barcode's bits, but as strokes of ink, not ruled columns: the reading is tilted (each word its own angle), bent by
  // a slow noise, and each bar is a stroke of its own length, height and weight (from its values) — the black stays
  let ang = (fract(F.seed * 0.618) - 0.5) * PI; // any angle, the word's own
  let c0 = p - vec2f(0.5);
  var c = vec2f(c0.x * cos(ang) - c0.y * sin(ang), c0.x * sin(ang) + c0.y * cos(ang));
  let sd = vec2f(fract(F.seed * 0.013) * 50.0, fract(F.seed * 0.029) * 50.0);
  c += vec2f(fbm(c * 2.5 + sd, 3), fbm(c * 2.5 + sd + vec2f(5.2, 1.3), 3)) * 0.09;
  let r = c + vec2f(0.5);
  let idx = i32(floor(r.x * DN / 7.0));
  let fx = fract(r.x * DN / 7.0);
  let bit = f32((byteOf(idx / 8) >> u32(idx % 8)) & 1u) * step(fx, 0.2 + 0.45 * tv(idx + 17));
  let y0 = 0.5 + (tv(idx + 11) - 0.5) * 0.35;
  let half = 0.04 + 0.2 * tv(idx + 13);
  let stroke = ss(0.0, 0.04, half - abs(r.y - y0));
  let band = ss(0.0, 0.05, 0.4 - abs(c0.x)) * ss(0.0, 0.05, 0.36 - abs(c0.y));
  return vec4f(pigment(tv(idx / 8 + 3)), 1.0) * bit * stroke * band * cracks(p);
}

@compute @workgroup_size(16, 16)
fn dye(@builtin(global_invocation_id) id: vec3u) {
  let c = vec2i(id.xy);
  let p = (vec2f(id.xy) + 0.5) / DN;
  if (fresh()) { textureStore(dyeOut, c, reading(p)); textureStore(fibOut, c, vec4f(p, p)); return; }
  let dt = stepDt();
  let back = p - dt * velAt(p);
  var d = textureSampleLevel(dyeIn, lin, back, 0.0);
  // the fibres ride the same current; each phase starts over (at rest) when its clock wraps
  var fib = textureSampleLevel(fibIn, lin, back, 0.0);
  if (fract(F.vt / FIB_PERIOD) < F.dt / FIB_PERIOD) { fib = vec4f(p, fib.zw); }
  if (fract(F.vt / FIB_PERIOD + 0.5) < F.dt / FIB_PERIOD) { fib = vec4f(fib.xy, p); }
  textureStore(fibOut, c, fib);
  // the dye thins: smoke and void vanish, fire burns away, a dwindling word empties; the rest stays
  let fade = 0.09 + F.m_smoke * 0.3 + F.m_void * 0.6 + F.m_fire * 0.2 + F.rh_dwindling * 0.25 * F.vu;
  d *= exp(-dt * fade);
  // fire burns to soot: the colour goes before the matter does
  d = vec4f(d.rgb * exp(-dt * F.m_fire * 0.7), d.a);
  let sp = splat(p);
  if (sp.y >= 0.0) {
    let k = i32(sp.y);
    // (pouring eases where the ink is already thick: it never builds into a solid glowing blob)
    let add = sp.x * dt * 2.6 * (1.0 - 0.6 * F.mo_still) * cracks(p) * (1.0 - ss(0.5, 1.4, d.a));
    d += vec4f(pigment(tv(k + 5 + i32(lastBeat().x) * 3)) * add, add);
  }
  textureStore(dyeOut, c, min(d, vec4f(4.0)));
}

/** Ridged noise, 0..1: thin bright ridges (the fibres) in darker ground. */
fn fibreAt(x: vec2f) -> f32 {
  let n = gnoise(x) + 0.5 * gnoise(x * 2.13 + vec2f(5.1, 1.7));
  return 1.0 - clamp(abs(n) * 2.2, 0.0, 1.0);
}

// ---------------------------------------------------------------- drawing (the dye lit as a surface)
@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let res = vec2f(F.resX, F.resY);
  // cover: the long side spans the domain; each angle is a cut to a closer view of the same fluid
  // where you stand (who the word is about): "I" close, inside it; "you" facing it; "we" turning around in it;
  // "they", far off — the fluid small in the dark
  var q = (fc.xy - res * 0.5) / max(res.x, res.y) * vec2f(1.0, -1.0);
  let near = mix(1.0, 1.6, F.who_i) * mix(1.0, 0.7, F.who_they * ss(0.35, 0.8, F.s_distance));
  let turn = F.who_we * F.vt * 0.06;
  q = vec2f(q.x * cos(turn) - q.y * sin(turn), q.x * sin(turn) + q.y * cos(turn));
  // (macro: the camera is close in the liquid — the fibres make the closeness hold); each angle is its own framing
  // — a place in the fluid, a closeness, a slow drift — whatever the word (the hand-off, angle < 0, stays centred)
  let ah = hash22(vec2f(F.angle * 113.0, F.seed * 0.01));
  let framed = select(1.0, 0.0, F.angle < 0.0);
  let place = ah * 0.17 * framed + vec2f(F.offX, F.offY) * 0.15;
  let closer = 1.0 + 0.45 * (0.5 + 0.5 * ah.x * ah.y) * framed;
  let drift = normalize(ah.yx + vec2f(1e-3)) * (F.lt - F.angleAt) * 0.005 * framed;
  q = q * 0.46 / (F.zoom * near * closer) + place + drift + vec2f(0.5);

  let e = 1.5 / DN / F.zoom;
  let gx = textureSampleLevel(dyeIn, lin, q + vec2f(e, 0.0), 0.0).a - textureSampleLevel(dyeIn, lin, q - vec2f(e, 0.0), 0.0).a;
  let gy = textureSampleLevel(dyeIn, lin, q + vec2f(0.0, e), 0.0).a - textureSampleLevel(dyeIn, lin, q - vec2f(0.0, e), 0.0).a;
  // the fibres: ridged noise at the coordinates the flow has carried — stretched along the current into tendrils
  // and filaments (two phases cross-faded, each weighted away from its reset)
  let fb = textureSampleLevel(fibIn, lin, q, 0.0);
  let wA = 1.0 - abs(2.0 * fract(F.vt / FIB_PERIOD) - 1.0);
  let fscale = mix(70.0, 130.0, F.s_density) * mix(1.0, 0.6, F.tx_soft);
  let fibre = mix(fibreAt(fb.zw * fscale), fibreAt(fb.xy * fscale), wA);
  let det = mix(1.0, 0.5 + 1.3 * pow(fibre, 2.5), mix(0.8, 0.45, F.tx_soft)); // (on average about as dense as without)
  // the dye's surface: its density as height (steeper for heavy matter), the fibres as its fine relief
  // (gentle: a strong relief shaded every dense drop as a lit dome — a glowing ball)
  let relief = mix(1.5, 5.0, F.s_hardness) * F.zoom;
  let n = normalize(vec3f(-gx * relief - dpdx(det) * 0.8, -gy * relief + dpdy(det) * 0.8, 1.0));
  let d = textureSampleLevel(dyeIn, lin, q + n.xy * 0.004 / F.zoom, 0.0);
  let wall = min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y));
  // (the fibres also run through the dense ink: a thick drop is never a smooth glowing blob)
  var dens = (1.0 - exp(-d.a * 1.6 * det)) * mix(1.0, det, 0.65) * ss(0.02, 0.1, wall) * ss(0.0, 0.08, 0.72 - length(q - 0.5) * F.who_they);
  // stone is crisp-edged; a grainy word (or sand) granulates, its pigment settling into the grain
  // ice and glass freeze: the edges set hard, and catch cold points of light
  let fz = frozen();
  dens = mix(dens, ss(0.2, 0.32, dens), clamp(F.m_stone * 0.8 + fz * 0.9, 0.0, 1.0));
  let gr = clamp(F.tx_grainy + F.tx_powdery * 0.6 + F.m_sand, 0.0, 1.0);
  dens *= mix(1.0, 0.45 + 1.1 * (0.5 + 0.5 * gnoise(q * DN * 0.8)), gr * 0.8);
  // pigment: where the dye is thin it is pale and luminous, where it is dense its colour deepens and saturates
  // (absorption through its depth), with a fine light along its folds — the depth of real ink (video-b)
  let raw = clamp(d.rgb / max(d.a, 1e-3), vec3f(0.0), vec3f(1.5));
  let depthK = 1.0 + 1.6 * ss(0.2, 2.0, d.a);
  let hue = pow(raw / max(max(raw.r, max(raw.g, raw.b)), 1e-3), vec3f(depthK)) * max(raw.r, max(raw.g, raw.b))
    * mix(1.25, 0.8, ss(0.2, 2.0, d.a)) + raw * 0.25 * ss(0.5, 0.0, d.a);
  // the shot's light (director.ts inkOps): a key from above, a light behind (thin dye glows), a raking light
  // (every fold a ridge), or dark-field (only the edges)
  let lo = i32(F.warpOp) % 4;
  let L = normalize(select(vec3f(-0.5, 0.6, 0.65), vec3f(-0.9, 0.15, 0.25), lo == 2));
  let diff = max(dot(n, L), 0.0);
  let spec = pow(max(dot(reflect(-L, n), vec3f(0.0, 0.0, 1.0)), 0.0), mix(18.0, 80.0, F.s_hardness)) * (1.0 - 0.8 * F.tx_soft);
  var col = hue * dens * (0.35 + 0.9 * diff) + vec3f(1.0, 0.97, 0.93) * spec * dens * mix(0.25, 1.0, F.m_water + F.m_glass + F.m_metal + F.m_ice);
  let fold = length(vec2f(gx, gy)) * DN * 0.05;
  col += hue * ss(0.3, 1.2, fold) * dens * 0.35; // the folds catch a thread of light
  if (lo == 1) { col = hue * (dens * (1.0 - dens) * 3.2 + 0.15 * dens) + vec3f(1.0, 0.97, 0.93) * spec * dens * 0.5; }
  if (lo == 2) { col = hue * dens * (0.08 + 1.5 * diff * diff) + vec3f(1.0) * spec * dens * 0.6; }
  if (lo == 3) { col = hue * ss(0.05, 0.6, fold) * 1.4 + hue * dens * 0.05; }
  // metal: a mercury skin, the room's light sliding over it; fire and light glow from within (fire's glow
  // dies with its colour: the soot stays dark)
  let env = mix(0.35, 1.0, pow(1.0 - n.z, 0.6)) * (0.7 + 0.3 * n.y); // (a floor: the gentler relief left mercury dark)
  col = mix(col, (vec3f(0.78, 0.8, 0.84) * env + vec3f(1.0) * spec * 2.0) * dens, F.m_metal * 0.85);
  // (the glow lives where the ink thins at its edges — dense fresh ink glowing whole read as a lamp)
  col += hue * dens * (1.0 - dens) * 2.4 * (F.m_fire * 0.7 + F.m_light * 0.6);

  // the mood, in the pigment (never an inversion): negative is colourless and contracted — grey dye, hard
  // contrast; neutral is clinical — cool, with the density's isolines drawn exact, like a reading; positive keeps
  // its colours and glows warm (no glitter: the ink's own forming is the texture)
  let lum = dot(col, vec3f(0.2126, 0.7152, 0.0722));
  let neg = clamp(1.0 - F.moodPos - F.moodNeu, 0.0, 1.0);
  col = mix(col, vec3f(pow(lum, 1.25) * 1.3), neg);
  col = mix(col, mix(vec3f(lum), vec3f(0.55, 0.75, 1.0) * lum * 1.6, 0.6), F.moodNeu * 0.7);
  let iso = abs(fract(d.a * 6.0) - 0.5);
  let lineW = fwidth(d.a * 6.0) * 1.2;
  col += vec3f(0.8, 0.9, 1.0) * ss(lineW, 0.0, iso) * ss(0.05, 0.2, d.a) * F.moodNeu * 0.35;
  col += hue * dens * 0.25 * F.moodPos;

  // the beat as light through the dye (steady and stuttering words), in time with the sound's tick
  let lb = lastBeat();
  col *= 1.0 + (F.rh_steady + F.rh_stuttering) * 0.5 * exp(-lb.y / 0.12) * select(1.0, 0.0, lb.x < 0.0);
  // and the tide of a pulsing word (the sound's slow tone, clips.ts pulse())
  col *= 1.0 + 0.45 * F.rh_pulsing * (0.5 - 0.5 * cos(F.vt * PI / beatP()));
  // light glows; void is barely there
  col *= (1.0 + F.m_light * 0.8) * (1.0 - 0.5 * F.m_void);
  // absorption, last: the thick core of the ink goes deeper, its thin edges carry the light (a dense drop lit
  // brightest read as a glowing ball)
  col *= mix(1.0, 0.35, ss(0.45, 0.95, dens));
  return vec4f(col * ss(0.0, 0.08, F.lt + F.vt), 1.0);
}
