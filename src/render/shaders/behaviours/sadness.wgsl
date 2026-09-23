// SADNESS — nothing forms. Energy drains out: a few grains near the centre let go
// and settle downward, slower and slower, dimming as they fall. The light cools
// and sinks (matter: sink). Weight, not a symbol.
fn b_sadness(c: Ctx) -> B {
  var o = b0();
  let near = exp(-dot(c.p, c.p) / (0.35 * c.sc * c.sc));
  // each grain lets go at its own moment; the ones nearer the centre first
  let letGo = 0.4 + c.h2.x * 0.55 * c.dur + (1.0 - near) * 1.2;
  let falling = smoothstep(letGo, letGo + 1.2, c.t);
  // settle: sideways motion dies, a slow terminal fall, slowing further as the reaction ages
  o.f = vec2f(-c.v.x * 2.0, -U.sad_fall * c.en * falling * (1.0 - 0.5 * c.dec));
  o.drag = 1.6 + 2.0 * c.dec;
  let tt = max(c.t - letGo, 0.0);
  o.lum = 0.55 * near * falling * exp(-tt * 0.22) * c.fade;
  o.size = 0.9 + 0.5 * c.h.w;
  o.c2 = c.h.y;
  return o;
}
