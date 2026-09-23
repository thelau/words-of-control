// ANXIETY — an unstable ring that wobbles and never settles. (draft)
fn b_anxiety(c: Ctx) -> B {
  var o = b0();
  let a = atan2(c.p.y, c.p.x);
  let ph = U.rSeed * 0.001;
  let wob = 1.0 + U.anx_wobble * (0.6 * sin(3.0 * a + c.t * 2.3 + ph) + 0.4 * sin(5.0 * a - c.t * 3.1 + ph * 2.0));
  let R = U.anx_R * c.sc * wob * (1.0 + 0.05 * (c.h.y - 0.5));
  let vr = dot(c.v, c.rhat);
  o.f = c.rhat * (-(c.r - R) * 14.0 - 6.0 * vr);
  let flip = sign(sin(c.t * (1.7 + 2.0 * c.h.x) + c.h.y * TAU));
  o.f += c.that * flip * 0.3 * c.en;
  o.f += jitter(c.id, 2u) * U.anx_jitter * 40.0 * smoothstep(0.3, 1.0, c.t);
  o.drag = 1.5;
  let flick = 0.7 + 0.3 * sin(c.t * (11.0 + 9.0 * c.h.w));
  o.lum = 0.8 * smoothstep(0.35, 0.02, abs(c.r - R)) * smoothstep(0.2, 1.2, c.t) * c.fade * flick;
  return o;
}
