// PLAYFUL — loops, spirals and figure-eights; clusters split and rejoin. (draft)
fn b_playful(c: Ctx) -> B {
  var o = b0();
  let k = floor(c.h.x * 5.0);
  var fr = array<vec2f, 5>(vec2f(1.0, 2.0), vec2f(3.0, 2.0), vec2f(2.0, 3.0), vec2f(1.0, 3.0), vec2f(3.0, 4.0));
  let f = fr[u32(k)];
  let ph = k * 1.7 + U.rSeed * 0.0001;
  let sp = 0.5 * c.en;
  let cc = vec2f(sin(f.x * sp * c.t + ph), sin(f.y * sp * c.t + ph * 1.3)) * U.play_R * c.sc;
  let perp = dirOf(ph + c.t * 0.7);
  let side = select(-1.0, 1.0, c.h.y > 0.5);
  let split = U.play_split * c.sc * (0.5 + 0.5 * sin(c.t * 1.3 + k));
  let off = dirOf(c.h.z * TAU) * 0.035 * c.sc * sqrt(c.h.w) + perp * split * side;
  let tgt = cc + off;
  o.f = seek(c.p, c.v, tgt, 5.5, 0.45);
  o.size = mix(0.5, 2.4, c.h2.x * c.h2.x);
  o.c2 = step(c.h2.y, 0.35);
  o.lum = 0.85 * smoothstep(0.35, 0.03, distance(c.p, tgt)) * smoothstep(0.2, 1.4, c.t) * c.fade;
  return o;
}
