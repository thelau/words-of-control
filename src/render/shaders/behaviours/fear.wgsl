// FEAR — collapse into a tiny trembling knot; a vast void around it. (draft)
fn b_fear(c: Ctx) -> B {
  var o = b0();
  let tgt = dirOf(c.h.z * TAU) * U.fear_r * c.sc * sqrt(c.h.y);
  o.f = seek(c.p, c.v, tgt, 9.0, 0.8);
  o.f += jitter(c.id, 1u) * U.fear_tremor * 30.0 * smoothstep(0.3, 1.0, c.t) * (0.3 + 0.7 * c.fade);
  o.lum = 0.9 * smoothstep(0.35, 0.02, c.r) * smoothstep(0.1, 0.9, c.t) * c.fade;
  o.hot = 0.35;
  return o;
}
