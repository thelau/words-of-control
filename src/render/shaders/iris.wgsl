// IRIS — an eye made of ink (references: video-b). A light burns at the centre
// behind a dark pupil; around it the iris: radial fibres, a collarette ring,
// crypts, concentric growth rings; beyond its rim, ink rays bloom outward
// like dye spreading on milk. Colour is Jev's palette (primary inside, second
// in the stroma, the contrast at the rim of light); glitter twinkles slowly in
// the fibres. The word shapes it: jagged → spiky rays, round → smooth rings,
// spiral → the fibres twist, cracked → veins of light, liquid → soft diffusion,
// density → fibre count, arousal → the pupil contracts and the rays burst.

@group(0) @binding(0) var<uniform> F: FrameU;

fn p1() -> vec3f { return vec3f(F.p1R, F.p1G, F.p1B); }
fn p2() -> vec3f { return vec3f(F.p2R, F.p2G, F.p2B); }
fn p3() -> vec3f { return vec3f(F.p3R, F.p3G, F.p3B); }

/** Noise seamless around the circle: a in [0,1) turns, r radial. */
fn ring(a: f32, r: f32, k: f32, s: f32) -> f32 {
  let n0 = gnoise(vec2f(a * k, r) + s);
  let n1 = gnoise(vec2f((a - 1.0) * k, r) + s);
  return mix(n0, n1, a);
}

fn ringFbm(a: f32, r: f32, k: f32, s: f32) -> f32 {
  return ring(a, r, k, s) * 0.6 + ring(a, r * 2.1, k * 2.0, s + 3.1) * 0.3 + ring(a, r * 4.3, k * 4.0, s + 7.7) * 0.15;
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let res = vec2f(F.resX, F.resY);
  let slow = mix(1.0, 0.35, F.lazy);
  let t = F.lt * slow;
  let u = F.u;
  // the camera: each angle comes closer or further, a little off the axis; a slow push over the shot
  let push = 1.0 + 0.12 * u;
  var p = (fc.xy - res * 0.5) / (res.y * 0.5);
  p = p / (F.zoom * push * mix(0.9, 1.5, fract(F.angle * 3.7))) + vec2f(F.offX, F.offY) * 0.6;
  let s = F.seed * 0.013;
  let spiral = F.sh_spiral * 1.4 + F.mo_circling * 0.6;
  let r = length(p);
  var a = fract(atan2(p.y, p.x) / TAU + 1.0 + spiral * 0.12 * log(r + 0.05) + t * 0.004 * (1.0 + spiral));

  // dimensions: the pupil breathes (contracts with arousal, opens in the dark), the iris reaches its rim
  let R = 0.78;
  let pupil0 = mix(0.3, 0.11, F.s_arousal) * mix(1.0, 1.25, F.lazy);
  let pupil = pupil0 * (1.0 + 0.06 * sin(t * 1.3) - 0.25 * F.s_arousal * exp(-F.lt * 3.0) * ss(0.0, 0.1, F.lt));
  let edge = 0.012 + 0.02 * ringFbm(a, 0.3, 24.0, s);
  let density = mix(40.0, 140.0, F.s_density);

  // the stroma: bundles of fibres, fine hair-like fibres over them, a collarette, crypts and growth rings
  let rn = (r - pupil) / (R - pupil);
  let bundle = ringFbm(a, r * 2.0, density * 0.35, s) * 0.5 + 0.5;
  let hair = pow(ring(a, r * 14.0 - t * 0.2, density * 3.0, s + 11.0) * 0.5 + 0.5, 3.0);
  let hair2 = pow(ring(a, r * 22.0 + t * 0.15, density * 5.3, s + 17.0) * 0.5 + 0.5, 4.0);
  let collar = exp(-pow((rn - mix(0.28, 0.4, F.variant)) / 0.06, 2.0)) * (0.5 + 0.5 * bundle);
  let growth = 0.5 + 0.5 * sin(rn * mix(18.0, 40.0, F.s_order) + ring(a, rn * 2.0, 6.0, s) * 3.0);
  let crypt = ss(0.6, 0.78, ring(a, rn * 5.0, 30.0, s + 5.0) * 0.5 + 0.5) * ss(0.2, 0.5, rn) * ss(0.9, 0.6, rn);
  // deep darks between the bundles, bright threads on them
  var stroma = pow(bundle, mix(2.6, 1.3, F.tx_liquid)) * (0.35 + 1.4 * hair + 0.9 * hair2);
  stroma *= mix(1.0, 0.55 + 0.45 * growth, F.sh_round * 0.7 + F.s_order * 0.4);
  stroma *= 1.0 - crypt * 0.85;
  // depth: the iris darkens toward its rim and falls away under the limbus
  stroma *= mix(1.15, 0.45, ss(0.3, 1.0, rn));
  let inIris = ss(pupil - 0.004, pupil + edge, r) * ss(R + 0.035, R - 0.04, r);
  let tint = ring(a, rn * 1.5, 9.0, s + 41.0) * 0.5 + 0.5;
  let grad = mix(mix(p1() * 1.4, p2(), ss(0.1, 0.7, rn)), p3(), tint * tint * 0.35);
  var c = grad * (stroma + collar * 0.8) * inIris;

  // cracked matter: thin veins of light through the stroma
  let crackAmt = ss(0.25, 0.7, F.tx_cracked + F.mo_breaking * 0.6);
  let vein = exp(-pow(ring(a, rn * 3.0, 14.0, s + 21.0) / 0.012, 2.0)) * crackAmt * inIris;
  c += p3() * vein * 1.2;

  // beyond the rim: ink streaks shoot outward, flowing, ragged, longer for a charged word
  let jag = F.sh_jagged + F.sh_splintered + F.s_phonetics * 0.5;
  let beyond = r - R;
  let reach = mix(0.25, 1.2, F.s_energy * 0.5 + F.s_arousal * 0.5) * ss(0.0, 0.8, u * 1.3);
  let lenN = ringFbm(a, 0.5, mix(12.0, 40.0, F.s_density), s + 31.0) * 0.5 + 0.5;
  let rayLen = reach * (0.2 + 0.8 * pow(lenN, mix(1.0, 2.5, jag)));
  let streak = pow(ring(a, beyond * 3.0 - t * 0.6, mix(120.0, 260.0, F.s_density), s + 51.0) * 0.5 + 0.5, 3.0);
  let ray = ss(rayLen, rayLen * 0.2, beyond) * step(0.0, beyond) * (0.25 + 1.5 * streak);
  c += mix(p2() * 1.2, p3(), ss(0.0, 0.5, beyond / max(rayLen, 0.01))) * ray * 0.7;
  c += p1() * exp(-beyond * 12.0) * step(0.0, beyond) * 0.12; // the rim's own glow

  // glitter: dense points of light in the threads, twinkling slowly (a smooth phase per cell: never a flicker)
  let cell = floor(fc.xy / 2.0);
  let gh = hash22(cell + floor(F.seed)) * 0.5 + 0.5;
  let tw = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(F.time * (0.5 + gh.y) + gh.x * 40.0), 6.0);
  c += mix(p3(), vec3f(1.0), 0.5) * step(0.96, gh.x) * tw * (inIris * (stroma * 0.8 + collar) + ray * 0.8) * 1.4;

  // the pupil: true dark, and at its heart the light, with a four-point star
  c *= ss(pupil * 0.9, pupil + edge, r);
  let lp = p - vec2f(0.0, 0.0);
  let core = exp(-dot(lp, lp) / 0.0006) * 6.0 + exp(-dot(lp, lp) / 0.012) * 0.8;
  let spikes = (exp(-abs(lp.y) * 260.0) * exp(-abs(lp.x) * 5.0) + exp(-abs(lp.x) * 260.0) * exp(-abs(lp.y) * 5.0)) * 1.4;
  let light = mix(vec3f(1.0, 0.96, 0.9), p3(), 0.2) * (core + spikes) * mix(0.6, 1.2, F.s_light);
  c += light;
  // dust of stars in the black around it
  let far = step(0.9965, hash22(floor(fc.xy / 2.0) + 7.0).x * 0.5 + 0.5) * ss(R, R + 0.3, r) * 0.5;
  c += vec3f(0.8, 0.85, 1.0) * far;
  return vec4f(c * ss(0.0, 0.25, F.lt), 1.0);
}
