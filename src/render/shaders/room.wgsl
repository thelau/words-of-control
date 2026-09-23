// ROOM — rest and typing. Near-black; a sparse film of specks drifting in
// three depths. While the visitor types, specks near the word brighten and
// lean toward it, a few at a time. Never a starfield.
@group(0) @binding(0) var<uniform> F: FrameU;

fn specks(p: vec2f, m: f32, layer: f32) -> f32 {
  let r = length(p);
  let scale = 34.0 * (1.0 + layer * 0.85);
  let lean = (F.charge * 0.035 + F.kick * 0.02) * exp(-r * r * 2.5);
  let drift = vec2f(0.011, 0.0035) * (1.0 + layer * 0.7) * F.time;
  let q = (p * (1.0 - lean) + drift) * scale + layer * 17.3;
  let cell = floor(q);
  let h = hash41(cell, layer + 3.0);
  let dens = 0.05 + F.charge * 0.05 * exp(-r * r * 3.0);
  if (h.x > dens) { return 0.0; }
  let pos = (h.yz - 0.5) * 0.7;
  let dpx = length(fract(q) - 0.5 - pos) * (m / scale);
  let tw = 0.65 + 0.35 * sin(F.time * (0.2 + h.w * 0.5) + h.w * 40.0);
  let near = 1.0 + (F.charge * 2.5 + F.kick * 3.0) * exp(-r * r * 4.0);
  let b = (0.012 + 0.07 * pow(h.w, 7.0)) * tw * near / (1.0 + layer * 0.6);
  let sigma = 0.6 * F.dpr * (1.0 + layer * 0.3);
  return b * exp(-dpx * dpx / (2.0 * sigma * sigma));
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let res = vec2f(F.resX, F.resY);
  let m = min(res.x, res.y) * 0.5;
  var p = (fc.xy - res * 0.5) / m;
  p.y = -p.y;
  var c = 0.0;
  for (var l = 0; l < 3; l++) { c += specks(p, m, f32(l)); }
  let r = length(p);
  c += 0.003 * F.charge * exp(-r * r * 6.0) * (0.8 + 0.2 * sin(F.time * 1.3));
  return vec4f(vec3f(1.0, 0.94, 0.86) * c * F.layerFade, 1.0);
}
