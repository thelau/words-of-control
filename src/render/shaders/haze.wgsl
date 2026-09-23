// HAZE — light, water, smoke, void; and indifference.
// Light: a shaft with hard gobo edges and striations along its axis; for an
// idle afternoon it falls through shutter slats, drifting slowly across the
// dark, with motes that exist only inside the light. Water: caustics from a
// travelling wave field (sharp cusps on a dark floor). Smoke: a slow lit
// volume. Void (nothing): one pinprick of light drifting through black.

@group(0) @binding(0) var<uniform> F: FrameU;

/** Caustic intensity from a sum of travelling waves: I = 1 / |det(I + k·Hessian)|. */
fn caustic(p: vec2f, t: f32, k: f32) -> f32 {
  var hxx = 0.0; var hyy = 0.0; var hxy = 0.0;
  for (var i = 0; i < 6; i++) {
    let fi = f32(i);
    let a = fi * 2.399 + 0.7;
    let d = vec2f(cos(a), sin(a));
    let freq = 2.2 + fi * 1.3;
    let amp = 0.9 / (freq * freq);
    let ph = dot(p, d) * freq + t * (0.6 + 0.25 * fi);
    let s = -amp * freq * freq * sin(ph);
    hxx += s * d.x * d.x; hyy += s * d.y * d.y; hxy += s * d.x * d.y;
  }
  let det = (1.0 + k * hxx) * (1.0 + k * hyy) - k * k * hxy * hxy;
  // flat water lights the floor at 1: only the focusing (I > 1) is light, the rest stays dark
  let I = 1.0 / max(abs(det), 0.015);
  let focus = max(I - 1.4, 0.0);
  return focus * focus / (1.0 + focus * 0.4);
}

fn motes(p: vec2f, m: f32, t: f32, light: f32) -> f32 {
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
  return s * light;
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let res = vec2f(F.resX, F.resY);
  let m = min(res.x, res.y) * 0.5;
  var p = (fc.xy - res * 0.5) / m;
  p.y = -p.y;
  p = p / F.zoom + vec2f(F.offX, F.offY);
  let t = F.lt * mix(1.0, 0.35, F.lazy) + F.seed * 0.001;
  let fadeIn = ss(0.0, mix(0.35, 1.6, F.lazy), F.lt);

  let warm = clamp(F.lazy * 0.6 + F.s_temperature * 0.6, 0.0, 1.0);
  let sun = mix(vec3f(0.62, 0.72, 0.9), vec3f(1.0, 0.72, 0.42), warm) * mix(0.6, 1.2, F.s_light);

  let wLight = F.m_light + ss(0.55, 0.8, F.lazy) * 0.6 * (1.0 - F.m_void);
  let wWater = F.m_water;
  let wSmoke = F.m_smoke;
  let wVoid = F.m_void;
  let tot = wLight + wWater + wSmoke + wVoid + 1e-4;
  var c = vec3f(0.0);

  // light: a hard-edged shaft; an idle afternoon breaks it into shutter slats
  if (wLight > 0.05) {
    let d = normalize(vec2f(0.5, -1.0));
    let n = vec2f(-d.y, d.x);
    let across = dot(p - vec2f(-0.2, 0.3), n);
    let along = dot(p, d);
    let width = mix(0.28, 0.5, F.s_scale) * (1.0 + 0.25 * along); // penumbra widens with distance
    let edge = 0.006 + 0.02 * max(along + 0.6, 0.0);
    var shaft = ss(width + edge, width - edge, abs(across)) * ss(-1.4, -0.9, along) * ss(1.6, 0.9, along);
    // shutter slats (persiennes): parallel bars that drift very slowly
    let slats = F.lazy * ss(0.4, 0.8, F.lazy);
    let bars = ss(0.12, 0.08, abs(fract(along * 7.0 + t * 0.02) - 0.5) - 0.18);
    shaft *= mix(1.0, bars, slats);
    if (shaft > 0.002) {
      let stri = 0.75 + 0.25 * fbm(vec2f(across * 14.0, t * 0.03), 3);
      c += sun * (shaft * stri * 0.3 + motes(p, m, t, shaft) * 1.1) * (wLight / tot);
    }
    // where the light lands: a soft pool on the floor
    c += sun * 0.02 * exp(-dot(p - vec2f(0.45, -0.75), p - vec2f(0.45, -0.75)) * 3.0) * slats * (wLight / tot);
  }
  // water: caustics wandering over a dark floor
  if (wWater > 0.05) {
    let k = mix(0.3, 0.9, F.s_intensity);
    let q = p * mix(5.5, 3.2, F.s_scale);
    let cz = vec3f(caustic(q * 1.012, t * 0.5, k), caustic(q, t * 0.5, k), caustic(q * 0.988, t * 0.5, k));
    c += vec3f(0.5, 0.75, 1.0) * cz * 0.012 * exp(-dot(p, p) * 0.35) * (wWater / tot);
  }
  // smoke: a slow volume lit from the word
  if (wSmoke > 0.05) {
    let v = fbm(p * 1.6 + vec2f(fbm(p * 0.8 + t * 0.03, 2), t * 0.02), 4);
    c += vec3f(0.62, 0.6, 0.58) * ss(-0.1, 0.6, v) * exp(-dot(p, p) * 1.4) * 0.22 * (wSmoke / tot);
  }
  // void: black, and one pinprick of light drifting through it
  if (wVoid > 0.05) {
    let at = vec2f(sin(t * 0.13 + 1.0), cos(t * 0.09)) * 0.6;
    let dpx = length(p - at) * m / F.dpr;
    c += sun * exp(-dpx * dpx * 0.5) * 0.6 * ss(0.0, 1.5, F.lt) * (wVoid / tot);
  }
  return vec4f(c * fadeIn, 1.0);
}
