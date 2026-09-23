fn blend(c: Ctx) -> B {
  var acc = B(vec2f(0.0), 0.0, 0.0, 0.0, 0.0, 0.0);
  var ws = 0.0;
  // Weights are uniform across the dispatch, so these branches don't diverge.
  if (U.w0 > 0.001) { let b = b_calm(c);    acc = mixB(acc, b, U.w0); ws += U.w0; }
  if (U.w1 > 0.001) { let b = b_tender(c);  acc = mixB(acc, b, U.w1); ws += U.w1; }
  if (U.w2 > 0.001) { let b = b_joy(c);     acc = mixB(acc, b, U.w2); ws += U.w2; }
  if (U.w3 > 0.001) { let b = b_awe(c);     acc = mixB(acc, b, U.w3); ws += U.w3; }
  if (U.w4 > 0.001) { let b = b_sadness(c); acc = mixB(acc, b, U.w4); ws += U.w4; }
  if (U.w5 > 0.001) { let b = b_fear(c);    acc = mixB(acc, b, U.w5); ws += U.w5; }
  if (U.w6 > 0.001) { let b = b_anxiety(c); acc = mixB(acc, b, U.w6); ws += U.w6; }
  if (U.w7 > 0.001) { let b = b_anger(c);   acc = mixB(acc, b, U.w7); ws += U.w7; }
  if (U.w8 > 0.001) { let b = b_playful(c); acc = mixB(acc, b, U.w8); ws += U.w8; }
  if (ws > 0.0) {
    acc.drag /= ws; acc.lum /= ws; acc.size /= ws; acc.hot /= ws; acc.c2 /= ws;
    // forces are already weighted: Σ w_e · F_e (§6.3)
  } else {
    acc.size = 1.0;
  }
  return acc;
}

fn mixB(acc: B, b: B, w: f32) -> B {
  return B(acc.f + b.f * w, acc.drag + b.drag * w, acc.lum + b.lum * w, acc.size + b.size * w,
           acc.hot + b.hot * w, acc.c2 + b.c2 * w);
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (f32(i) >= U.count) { return; }
  var P = parts[i];
  var p = P.a.xy;
  var v = P.a.zw;
  let home = P.b.xy;
  let ps = P.b.z;
  let restLum = P.b.w;
  let dt = U.dt;
  let rs = u32(U.rSeed);
  // remember where this frame began: the renderer draws the path travelled since
  if (U.frameStart > 0.5) { P.d = vec4f(P.d.xy, p); }

  // ---- rest field: slow curl drift around home, pulled a little inward by typing tension
  let dr = curl(home * 1.6 + vec2f(ps * 17.0, ps * 5.0), U.time * U.driftSpeed) * U.drift;
  let tens = U.tension * U.tensionAmt * smoothstep(0.0, 0.4, length(home));
  let restTarget = (home + dr) * (1.0 - tens);
  var F = seek(p, v, restTarget, U.homeK, 1.0);
  var drag = 0.0;

  let visible = fract(ps * 91.7) < U.restFrac * (1.0 + U.charge * 1.5);
  var tLum = select(0.0, (0.05 + 0.1 * fract(ps * 7.31)) * U.restLum * (1.0 + U.charge * 2.0), visible);
  var tSize = 1.0;
  var tHot = 0.0;
  var tC2 = 0.0;
  var tTint = 0.0;

  // ---- typing charge: a random subset is nudged toward C; they glow faintly while moving
  var kick = P.d.y * exp(-dt * 1.5); // per-grain memory of the last nudge, for its glow
  // a few dozen grains per keystroke, nearest the cursor first (kickFrac is set per grain count on the CPU)
  if (U.kickAmtNow > 0.0 && rnd(i, u32(U.kickSeed)) < U.kickFrac * 3.0 * exp(-dot(home, home) * 1.2)) {
    v += -normalize(p + vec2f(1e-5)) * U.kickAmtNow * (0.4 + rnd(i, 77u));
    kick = 1.0;
  }
  if (U.tremor > 0.0) {
    v += jitter(i, 5u) * U.tremor * dt * 60.0;
  }
  tLum += U.kickGlow * kick * smoothstep(0.02, 0.3, length(v)) * (1.0 - U.reacting);

  // ---- matter: every grain not in the emissive subset is carried by the shared fields
  let lit = U.reacting > 0.5 && rnd(i, rs ^ 0x9e3779b9u) < U.litFrac;
  if (U.reacting > 0.5 && !lit) {
    let sc = mix(0.6, 1.45, U.scale);
    let mt = U.rt - (1.0 - U.confidence) * U.phaseSpread * 0.3 * ps;
    let mf = matterForce(p, v, max(mt, 0.0), U.dur, sc);
    let hold = 1.0 - U.ret;
    F = mix(F, F * 0.08, hold * smoothstep(0.0, 0.4, U.rt)) + mf * hold; // fields take over from home
    drag = U.mDrag * hold;
  }
  // glints: a few grains catch the central light as they turn
  let gl = pow(max(0.0, sin(ps * 311.0 + U.time * (1.0 + 3.0 * fract(ps * 57.0)))), 90.0);
  let lr = length(p) / max(U.lightR, 0.05);
  tLum += U.glint * gl * U.lightI / (1.0 + lr * lr) * step(1.0 - U.glintFrac, fract(ps * 23.0));
  // ---- reaction
  if (lit) {
    var c: Ctx;
    c.id = i;
    c.p = p;
    c.v = v;
    c.r = length(p);
    c.rhat = select(vec2f(1.0, 0.0), p / c.r, c.r > 1e-5);
    c.that = vec2f(-c.rhat.y, c.rhat.x);
    c.h = vec4f(rnd(i, rs + 1u), rnd(i, rs + 2u), rnd(i, rs + 3u), rnd(i, rs + 4u));
    c.h2 = vec4f(rnd(i, rs + 5u), rnd(i, rs + 6u), rnd(i, rs + 7u), rnd(i, rs + 8u));
    // confidence → coherence: low confidence spreads each grain's phase (§6.4)
    let spread = (1.0 - U.confidence) * U.phaseSpread;
    c.t = max(U.rt - spread * c.h2.w, 0.0);
    c.dur = U.dur;
    c.sc = mix(0.6, 1.45, U.scale);
    c.en = mix(0.6, 1.6, U.energy);
    c.dec = smoothstep(0.6 * U.dur, U.dur, c.t);
    c.fade = 1.0 - c.dec;
    c.edge = length(vec2f(U.resX, U.resY)) * 0.5 / U.pxPerUnit + 0.08;

    var o = blend(c);
    let env = smoothstep(0.0, 0.4, c.t) * c.fade;

    // modifiers
    o.f += vec2f(0.0, (0.5 - U.weight) * 2.0 * U.weightBias) * env;
    o.f += curl(p * 3.0, U.rt * 0.4) * U.lowConfNoise * (1.0 - U.confidence) * env;
    // accents (only matter when high)
    let aLoss = smoothstep(0.5, 0.85, U.loss);
    let aClose = smoothstep(0.5, 0.85, U.closeness);
    let aAbs = smoothstep(0.5, 0.85, U.absurd);
    let aViol = smoothstep(0.5, 0.85, U.violence);
    let r0 = 0.16 * c.sc;
    o.f += c.rhat * max(r0 - c.r, 0.0) * 60.0 * aLoss * env;           // hollow core
    o.f += -c.rhat * 0.35 * aClose * env;                                // gathering in
    o.f += c.that * sin(c.t * 3.0 + c.h.w * TAU) * 0.4 * aAbs * env;     // silly wobble
    o.size *= mix(1.0, 0.4 + 1.8 * c.h2.y, aAbs);
    let sw = exp(-pow((c.t - 0.35) / 0.03, 2.0)) * 30.0;                 // shockwave pulse
    o.f += c.rhat * sw * aViol;
    if (U.kindId == 5.0) { o.lum *= 0.7 + 0.3 * sin(c.t * TAU * 2.0); } // sound: pulse in time

    // return: spring home with the blended easing; colour cools
    // return: each grain goes home on its own curved path, the far ones leaving later (a shared exhale)
    let toHome = home + dr - p;
    let far = length(toHome);
    let stagger = smoothstep(0.0, 1.0, (U.rt - U.dur) / max(U.retTime * 0.35, 0.1) - far * 0.35 - c.h2.x * 0.3);
    let bend = vec2f(-toHome.y, toHome.x) * (c.h.z - 0.5) * 1.6 * (1.0 - stagger) * U.ret;
    let hk = seek(p, v, home + dr, U.retW, U.retZ) + bend;
    let rw = U.ret * max(stagger, 0.15);
    F = mix(o.f, hk, rw);
    drag = o.drag * (1.0 - U.ret);
    let retLum = tLum; // travelling home in the dark: no traces
    tLum = mix(o.lum * U.lumMul, retLum, U.ret);
    tSize = mix(o.size * U.sizeMul, 1.0, U.retLate);
    tHot = o.hot * (1.0 - U.ret);
    tC2 = o.c2 * (1.0 - U.retLate);
    tTint = 1.0 - U.retLate;
    // anxiety: jitter persists into the return and fades late
    v += jitter(i, 9u) * U.w6 * U.anx_jitter * U.ret * (1.0 - U.retLate) * dt * 30.0;
  }

  // ---- integrate (semi-implicit Euler, fixed dt)
  v += F * dt;
  v *= exp(-drag * dt);
  p += v * dt;

  let k = 1.0 - exp(-dt * 28.0);
  var lum = mix(P.c.x, tLum, k) * (1.0 - U.fadeAll);
  if (tLum > P.c.x * 3.0) { lum = tLum * (1.0 - U.fadeAll); } // flashes are instant

  P.a = vec4f(p, v);
  P.c = vec4f(lum, mix(P.c.y, tSize, k), mix(P.c.z, tHot, k), mix(P.c.w, tC2, k));
  P.d = vec4f(mix(P.d.x, tTint, k), kick, P.d.zw);
  parts[i] = P;
}
