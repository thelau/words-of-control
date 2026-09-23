// AWE — a vast galaxy sphere, densest at the centre; stillness is the point. (draft)
fn b_awe(c: Ctx) -> B {
  var o = b0();
  if (c.t < 0.45) {
    o.f = seek(c.p, c.v, dirOf(c.h.z * TAU) * 0.02, 12.0, 1.0);
    return o;
  }
  let rT = U.awe_R * c.sc * pow(c.h.y, 1.7);
  let ang = c.h.z * TAU + c.t * 0.03 * (1.0 - c.h.y);
  o.f = seek(c.p, c.v, dirOf(ang) * rT, U.awe_w, 1.15);
  o.lum = 0.5 * (1.0 - 0.6 * c.h.y) * smoothstep(0.45, 2.8, c.t) * c.fade;
  o.size = 0.7 + 0.9 * pow(c.h2.x, 6.0);
  o.hot = 0.5 * (1.0 - c.h.y);
  o.c2 = step(0.8, c.h2.y);
  return o;
}
