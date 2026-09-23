// CALM — a slow rotating disc of orbits; long smooth circular trails.
fn b_calm(c: Ctx) -> B {
  var o = b0();
  let band = mix(U.calm_rIn, U.calm_rOut, sqrt(c.h.y)) * c.sc;
  let omega = U.calm_spin * c.en * (0.85 + 0.3 * c.h.z) * mix(1.25, 0.8, band / (U.calm_rOut * c.sc));
  let pull = smoothstep(0.0, 2.2, c.t);
  o.f = orbit(c, band, omega, U.calm_k * (0.15 + 0.85 * pull));
  o.drag = 0.15;
  let near = smoothstep(0.4, 0.04, abs(c.r - band));
  o.lum = 0.75 * near * smoothstep(0.2, 2.4, c.t) * c.fade * (0.6 + 0.4 * c.h.w);
  o.hot = 0.15 * smoothstep(0.2, 0.0, c.r);
  return o;
}
