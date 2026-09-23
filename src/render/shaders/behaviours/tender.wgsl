// TENDER — a small held cluster at the centre, gently orbiting and breathing. (draft)
fn b_tender(c: Ctx) -> B {
  var o = b0();
  let breathe = 1.0 + 0.1 * sin(c.t * 1.1);
  let band = U.tender_r * c.sc * sqrt(c.h.y) * breathe;
  let pull = smoothstep(0.0, 1.8, c.t);
  o.f = orbit(c, band, U.tender_spin * (0.7 + 0.6 * c.h.z), 3.0 * (0.2 + 0.8 * pull));
  o.drag = 0.6;
  let near = smoothstep(0.3, 0.03, abs(c.r - band));
  o.lum = 0.6 * near * smoothstep(0.4, 2.5, c.t) * c.fade;
  o.c2 = c.h.w * 0.5;
  return o;
}
