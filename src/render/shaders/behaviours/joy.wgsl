// JOY — a radiant halo spraying from the centre, lifting, twinkling; glitter falls back. (draft)
fn b_joy(c: Ctx) -> B {
  var o = b0();
  let dir = dirOf(c.h.z * TAU);
  let tw = 1.0 - U.joy_twinkle + U.joy_twinkle * pow(0.5 + 0.5 * sin(c.t * (9.0 + 14.0 * c.h.w) + c.h2.x * TAU), 3.0);
  if (c.t < 0.25) {
    o.f = seek(c.p, c.v, dir * 0.03 * c.sc, 16.0, 1.0);
    o.lum = smoothstep(0.2, 0.0, c.r) * 1.2;
    o.hot = 0.7;
    return o;
  }
  let R = U.joy_R * c.sc * (0.6 + 0.6 * c.h.y);
  let vr = dot(c.v, c.rhat);
  o.drag = 2.0;
  o.f = -c.rhat * 0.35 + vec2f(0.0, U.joy_lift * c.fade);
  let spraying = c.t < 0.6 * c.dur;
  if (c.r < 0.05 && vr <= 0.05 && spraying) {
    let vl = length(c.v);
    let d = select(dir, c.v / vl, vl > 0.02);
    o.f = d * R * 2.0 * 60.0 * c.en;
    o.drag = 0.0;
  }
  o.lum = 0.8 * tw * c.fade * smoothstep(0.0, 0.1, c.r + 0.05);
  o.hot = 0.4 * smoothstep(0.2, 0.0, c.r);
  o.c2 = step(0.7, c.h2.y);
  return o;
}
