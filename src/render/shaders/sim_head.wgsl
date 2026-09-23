@group(0) @binding(0) var<uniform> U: Uniforms;
@group(0) @binding(1) var<storage, read_write> parts: array<Particle>;

/** Everything a behaviour may read about one particle. Polar frame around the centre C (§6.2). */
struct Ctx {
  id: u32,
  p: vec2f,
  v: vec2f,
  r: f32,
  rhat: vec2f,   // radial unit vector
  that: vec2f,   // tangential unit vector (counter-clockwise)
  h: vec4f,      // per-particle, per-reaction randoms
  h2: vec4f,
  t: f32,        // reaction time for this particle (with confidence phase spread)
  dur: f32,      // reaction duration (s), excluding return
  sc: f32,       // scale multiplier
  en: f32,       // energy multiplier
  dec: f32,      // 0 → 1 across the decay phase
  fade: f32,     // 1 - dec
  edge: f32,     // distance from C to a screen corner
};

/** What a behaviour returns. Blended across emotions by their weights. */
struct B {
  f: vec2f,
  drag: f32,
  lum: f32,
  size: f32,
  hot: f32,  // push toward white-hot
  c2: f32,   // amount of secondary colour
};

fn b0() -> B { return B(vec2f(0.0), 0.0, 0.0, 1.0, 0.0, 0.0); }

/** Damped spring toward a target: w = angular frequency, z = damping ratio. */
fn seek(p: vec2f, v: vec2f, tgt: vec2f, w: f32, z: f32) -> vec2f {
  return w * w * (tgt - p) - 2.0 * z * w * v;
}

/** Orbit around C: radial spring to `band`, tangential drive toward angular speed `omega`. */
fn orbit(c: Ctx, band: f32, omega: f32, k: f32) -> vec2f {
  let vr = dot(c.v, c.rhat);
  let vt = dot(c.v, c.that);
  let w = sqrt(k);
  return c.rhat * (-k * (c.r - band) - 1.6 * w * vr) + c.that * (omega * c.r - vt) * 1.5;
}

fn dirOf(a: f32) -> vec2f { return vec2f(cos(a), sin(a)); }

fn jitter(id: u32, salt: u32) -> vec2f {
  let f = u32(U.frame);
  return vec2f(rnd(id, f * 7u + salt), rnd(id, f * 7u + salt + 3u)) - 0.5;
}

/**
 * Matter fields: shared forces that shape the whole carpet of grains (not the
 * emissive subset). Blended per emotion on the CPU into a handful of gains.
 */
fn matterForce(p: vec2f, v: vec2f, t: f32, dur: f32, sc: f32) -> vec2f {
  let r = length(p);
  let rhat = select(vec2f(1.0, 0.0), p / r, r > 1e-5);
  let that = vec2f(-rhat.y, rhat.x);
  let env = smoothstep(0.0, 0.5, t) * (1.0 - smoothstep(0.6 * dur, dur, t));
  var f = vec2f(0.0);
  // shockwave: a travelling radial front that blasts grains outward and piles them into a ridge
  let front = U.mShockSpeed * sc * t;
  let wave = exp(-pow((r - front) / (0.06 + 0.05 * t), 2.0));
  f += rhat * U.mShock * wave * 12.0 / (1.0 + 1.5 * t);
  // swirl: a slow vortex (target angular speed falls off with radius)
  let vt = dot(v, that);
  let omega = U.mSwirl * 1.2 / (0.25 + r);
  f += that * (omega * r - vt) * 1.2 * step(0.001, abs(U.mSwirl));
  // cymatic rings: grains migrate to the nodes of a radial standing wave
  let k = U.mRingK / sc;
  f += -rhat * U.mRing * sin(2.0 * k * r) * smoothstep(0.0, 0.15, r);
  // collapse toward C / breathe out
  f += -rhat * U.mCollapse * min(r, 1.2);
  // weight: sink or lift
  f += vec2f(0.0, -U.mSink);
  // flow: filaments from a curl field
  f += curl(p * 1.8, t * 0.35) * U.mNoise;
  // indifference: a slow warm breeze, long lazy eddies — time passing
  f += (curl(p * 0.7 + vec2f(t * 0.03, 0.0), t * 0.04) * 0.35 + vec2f(0.05, 0.012)) * U.mLazy;
  return f * env;
}
