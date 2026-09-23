// ANGER — canonical (references/storyboard-anger.png)
// Dark implosion into a white-hot spark → jagged shockwave ring + radial streaks →
// ring shatters, the whole frame streaks outward (fountain) → drifting embers.

fn anger_jag(a: f32) -> f32 {
  let s = u32(U.rSeed);
  let p1 = rnd(s, 11u) * TAU;
  let p2 = rnd(s, 12u) * TAU;
  let p3 = rnd(s, 13u) * TAU;
  // 1 - |sin| gives sharp outward cusps; half-integer frequencies stay continuous around the circle.
  return 0.55 * (0.637 - abs(sin(5.5 * a + p1)))
       + 0.30 * (0.637 - abs(sin(9.5 * a + p2)))
       + 0.15 * (0.637 - abs(sin(16.5 * a + p3)));
}

fn b_anger(c: Ctx) -> B {
  var o = b0();
  let ign = U.anger_ign;
  let ang = c.h.z * TAU;
  let dir = dirOf(ang);
  let isRing = c.h.x < U.anger_ringFrac;
  let isStreak = !isRing && c.h.x < U.anger_ringFrac + U.anger_streakFrac;
  let isEmber = c.h2.z < U.anger_emberFrac;
  let R = U.anger_ringR * c.sc;
  let nearC = smoothstep(0.25 * c.sc, 0.0, c.r);
  let core = smoothstep(0.1 * c.sc, 0.0, c.r);

  // Ignition: gather in the dark, light only where they converge.
  if (c.t < ign) {
    // most grains gather to a tight core; a few overshoot as sparks
    let spark = c.h2.y < 0.04;
    let tgt = dir * select(0.008 + 0.03 * c.h.y * c.h.y, 0.06 + 0.1 * c.h.y, spark) * c.sc;
    o.f = seek(c.p, c.v, tgt, 20.0, 1.0);
    let grow = smoothstep(0.0, ign, c.t);
    o.lum = select(core * core * grow * grow * U.anger_flash * (0.2 + c.h.y), nearC * grow * 2.0, spark);
    o.hot = 0.95;
    return o;
  }

  let tr = c.t - ign;
  let peakEnd = 0.6 * c.dur;
  let shatterT = ign + 1.0 + 0.25 * c.h2.x;

  // Release: one outward impulse, shaped per role.
  let pw = 0.018;
  let pulse = exp(-pow(tr / pw - 2.0, 2.0)) / (pw * 1.7725);
  var spd = 0.0;
  if (isRing) {
    o.drag = U.anger_ringDrag;
    let Rj = R * (1.0 + U.anger_jag * anger_jag(ang) * 2.2) * (0.985 + 0.03 * c.h.y);
    spd = Rj * o.drag;
    o.lum = 1.5;
    o.hot = 0.15;
  } else if (isStreak) {
    o.drag = 0.3;
    spd = U.anger_streakSpeed * c.en * (0.2 + 0.8 * c.h.y * c.h.y);
    o.f = c.rhat * 0.6;
    o.lum = U.anger_streakLum * (0.3 + 0.7 * c.h.w);
    o.size = 1.3 + 0.9 * c.h2.y;
  } else {
    o.drag = 3.0;
    spd = R * 3.0 * sqrt(c.h.y) * 0.95;
    o.lum = U.anger_dustLum * (0.3 + c.h.w);
    o.size = 0.8;
  }
  o.f += dir * spd * pulse;
  o.hot = max(o.hot, 0.8 * nearC);

  // Peak: ring shatters; streaks and shards cycle through the centre (dark on the way back).
  // only some ring shards keep cycling; the rest fly out once and burn out
  let cycles = isStreak || (isRing && c.h2.w < U.anger_shardCycle);
  if (isRing && !cycles && c.t > shatterT) {
    o.f = c.rhat * U.anger_shatter * c.en * (0.6 + 0.8 * c.h.y);
    o.drag = 0.15;
    o.lum = 1.5 * (1.0 - smoothstep(shatterT, shatterT + 0.9, c.t));
    o.hot = 0.0;
  }
  if (cycles && c.t > shatterT && c.t < peakEnd) {
    let vr = dot(c.v, c.rhat);
    if (c.r > c.edge || (vr < -0.05 && c.r > 0.07)) {
      o.f = seek(c.p, c.v, vec2f(0.0), 7.0 + 4.0 * c.h.w, 1.0);
      o.drag = 0.0;
      o.lum = 0.0;
      return o;
    }
    if (c.r <= 0.07) {
      let vl = length(c.v);
      let d = select(dir, c.v / vl, vl > 0.01);
      o.f = d * 260.0 * c.en;
      o.drag = 0.0;
      o.lum = 0.0;
      return o;
    }
    o.f = c.rhat * U.anger_shatter * c.en * (0.6 + 0.8 * c.h.y);
    o.drag = 0.15;
    o.size = select(1.0, 1.3 + 0.9 * c.h2.y, isStreak);
    o.hot = 0.25 * c.h.w;
    // dim near the centre so re-launches don't pile into a white sun
    let shard = select(0.35, 1.0, isStreak);
    o.lum = U.anger_streakLum * shard * (0.2 + 0.8 * c.h.w * c.h.w) * smoothstep(0.05, 0.45, c.r);
    o.hot = 0.3 * nearC;
  } else if (!isRing && !isStreak && c.t > shatterT) {
    o.f = c.rhat * 0.12;
    o.drag = 1.2;
    o.lum *= 1.0 - smoothstep(shatterT, peakEnd, c.t) * 0.6;
  }

  // Decay: embers drift; everything else goes out.
  if (c.t >= peakEnd) {
    if (isEmber) {
      let flick = 0.55 + 0.45 * sin(c.t * (2.0 + 5.0 * c.h2.x) + c.h2.y * TAU);
      // scatter once, then hang in the air
      let scatter = exp(-pow((c.t - peakEnd - 0.15) / 0.12, 2.0)) * 6.0;
      o.f = dirOf(c.h2.x * TAU) * scatter * (0.3 + c.h2.y) + curl(c.p * 2.2 + c.h.xy, c.t * 0.15) * 0.08 + vec2f(0.0, 0.03);
      o.drag = 3.5;
      o.lum = U.anger_emberLum * flick * (1.0 - 0.5 * c.dec);
      o.size = U.anger_emberSize * (0.6 + 0.8 * c.h2.w);
      o.hot = 0.0;
      o.c2 = 1.0;
    } else {
      o.f = vec2f(0.0);
      o.drag = 1.6;
      o.lum *= 1.0 - smoothstep(peakEnd, peakEnd + 0.7, c.t);
    }
  }
  return o;
}
