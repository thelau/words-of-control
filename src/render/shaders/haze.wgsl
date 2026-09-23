// HAZE — light, water, smoke, void; and indifference ("a lazy afternoon").
// Light: a shaft of low sun through leaves, dappled and shifting, dust motes
// turning slowly in it. Water: caustics wandering over a dark floor. Smoke: a
// slow lit volume. Void: almost nothing — one drifting warmth. Time passes.

@group(0) @binding(0) var<uniform> F: FrameU;

fn caustic(p: vec2f, t: f32) -> f32 {
  var q = p * 5.0;
  var c = 0.0;
  var a = 1.0;
  for (var i = 0; i < 4; i++) {
    let w = vec2f(sin(q.y * 1.3 + t + f32(i)), cos(q.x * 1.1 - t * 0.8 + f32(i) * 1.7));
    q += w * 0.55;
    c += a / (0.06 + abs(sin(q.x) * sin(q.y)));
    a *= 0.6;
  }
  return pow(c * 0.035, 2.2);
}

fn motes(p: vec2f, m: f32, t: f32, beam: f32) -> f32 {
  var s = 0.0;
  for (var l = 0; l < 2; l++) {
    let scale = 16.0 + f32(l) * 14.0;
    let drift = vec2f(sin(t * 0.07 + f32(l)) * 0.05, -0.012 * t) * (1.0 + f32(l) * 0.5);
    let q = (p + drift) * scale + f32(l) * 11.0;
    let h = hash41(floor(q), 7.0 + f32(l));
    if (h.x > 0.35) { continue; }
    let wob = vec2f(sin(t * (0.3 + h.y) + h.z * 30.0), cos(t * (0.25 + h.z) + h.y * 20.0)) * 0.18;
    let d = length(fract(q) - 0.5 - (h.yz - 0.5) * 0.5 - wob) * (m / scale) / F.dpr;
    let turn = 0.4 + 0.6 * pow(0.5 + 0.5 * sin(t * (0.6 + h.w) + h.w * 50.0), 6.0); // catches the light as it turns
    s += exp(-d * d * 0.6) * turn * (0.5 + h.w) / (1.0 + f32(l));
  }
  return s * beam;
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let res = vec2f(F.resX, F.resY);
  let m = min(res.x, res.y) * 0.5;
  var p = (fc.xy - res * 0.5) / m;
  p.y = -p.y;
  let t = F.lt * mix(1.0, 0.35, F.lazy) + F.seed * 0.001;
  let fadeIn = ss(0.0, mix(0.35, 1.6, F.lazy), F.lt);

  // warmth: indifference and "afternoon" are amber; cold words are blue-grey
  let warm = clamp(F.lazy * 0.6 + F.s_temperature * 0.6, 0.0, 1.0);
  let sun = mix(vec3f(0.62, 0.72, 0.9), vec3f(1.0, 0.72, 0.42), warm) * mix(0.6, 1.2, F.s_light);

  let wLight = F.m_light + F.lazy * 0.6;
  let wWater = F.m_water;
  let wSmoke = F.m_smoke;
  let wVoid = F.m_void;
  let tot = wLight + wWater + wSmoke + wVoid + 1e-4;
  var c = vec3f(0.0);

  // light: a diagonal shaft, dappled by moving leaves
  if (wLight > 0.05) {
    let d = normalize(vec2f(0.55, -1.0));
    let n = vec2f(-d.y, d.x);
    let across = dot(p - vec2f(-0.15, 0.2), n);
    let along = dot(p, d);
    let shaft = exp(-across * across / mix(0.05, 0.12, F.s_scale)) * ss(-1.3, 0.2, -along);
    if (shaft > 0.004) { // outside the shaft there is nothing to dapple
      let leaves = ss(-0.05, 0.35, fbm(p * 2.2 + vec2f(t * 0.05, t * 0.02), 3)) * 0.7 + 0.3;
      let dapple = ss(0.1, 0.5, fbm(p * 6.0 + vec2f(-t * 0.08, t * 0.05), 2) + 0.2);
      let beam = shaft * leaves;
      c += sun * (beam * 0.32 * (0.5 + dapple) + motes(p, m, t, beam * 1.5) * 1.2) * (wLight / tot);
    }
  }
  // water: caustics on a dark floor, vignetted around the word
  if (wWater > 0.05) {
    let cz = caustic(p * mix(1.3, 0.7, F.s_scale), t * 0.6) * exp(-dot(p, p) * 0.6);
    c += mix(vec3f(0.45, 0.7, 1.0), sun, 0.3) * cz * 0.35 * (wWater / tot);
  }
  // smoke: a slow volume lit from the word
  if (wSmoke > 0.05) {
    let v = fbm(p * 1.6 + vec2f(fbm(p * 0.8 + t * 0.03, 2), t * 0.02), 4);
    let lit = exp(-dot(p, p) * 1.4);
    c += vec3f(0.62, 0.6, 0.58) * ss(-0.1, 0.6, v) * lit * 0.22 * (wSmoke / tot);
  }
  // void: nothing, and one warmth drifting through it
  if (wVoid > 0.05) {
    let wander = vec2f(sin(t * 0.11), cos(t * 0.07)) * 0.5;
    let g = exp(-dot(p - wander, p - wander) * 7.0);
    c += sun * g * 0.05 * (wVoid / tot);
  }
  return vec4f(c * fadeIn, 1.0);
}
