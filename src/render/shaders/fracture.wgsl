// FRACTURE — the word strikes something. From the point where it was typed,
// jagged radial cracks race outward, fork, and are then joined by concentric
// bridges, like struck glass. Glass and ice stay cold and clean; metal and fire open
// as molten seams that shed sparks. "Breaking" pushes the plates apart.

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var<storage, read> rays: array<vec4f>; // see fractureRays.ts (9 vec4 per ray)

const RV = 9u;

/** A crack's angular offset at radius r: nearly straight, with a few sharp kinks. */
fn jag(r: f32, k: u32) -> f32 {
  let a = rays[k * RV + 1u];
  let b = rays[k * RV + 2u];
  return a.y * ss(a.x - 0.01, a.x + 0.01, r) + a.w * ss(a.z - 0.01, a.z + 0.01, r)
       + b.y * ss(b.x - 0.01, b.x + 0.01, r) + b.w * ss(b.z - 0.01, b.z + 0.01, r);
}

/** Distance from p to segment ab. */
fn segD(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

fn wrapA(a: f32) -> f32 { return a - TAU * floor(a / TAU + 0.5); }

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let res = vec2f(F.resX, F.resY);
  let m = min(res.x, res.y) * 0.5;
  var p = (fc.xy - res * 0.5) / m;
  p.y = -p.y;
  let px = 1.0 / m;
  let slow = mix(1.0, 0.3, F.lazy);
  let t = F.lt * slow;
  let u = F.u;

  // propagation: a strike is near-instant, a slow stress creeps
  let speed = mix(0.6, 4.0, F.s_arousal * 0.7 + F.s_tension * 0.3);
  let reach = mix(1.1, 2.4, F.s_scale);
  let front = reach * (1.0 - exp(-t * speed));

  // breaking: the plates drift apart along their sector's direction
  let nRays = F.variant2;
  let sector = floor((atan2(p.y, p.x) / TAU + 0.5) * nRays);
  let sepDir = vec2f(cos((sector + 0.5) / nRays * TAU - 3.14159), sin((sector + 0.5) / nRays * TAU - 3.14159));
  let sep = F.mo_breaking * 0.05 * ss(0.2, 1.0, u) * length(p);
  let q = p - sepDir * sep;
  let r = length(q);
  let th = atan2(q.y, q.x);
  let lw = px * mix(0.9, 1.4, F.s_hardness);  // crack half-width

  var crack = 0.0;   // crack line coverage
  var fresh = 0.0;   // how recently the front passed (hot)
  // radial cracks and their forks — only the few whose angle is near this pixel's
  let kc = floor((th / TAU + 0.5) * nRays);
  for (var dk = -2.0; dk <= 2.0; dk += 1.0) {
    let k = u32((kc + dk + nRays) % nRays);
    let R = rays[k * RV];
    let len = front * R.y;
    if (r < len) {
      let d = abs(wrapA(th - R.x - jag(r, k))) * r;
      let c = exp(-d * d / (lw * lw));
      crack = max(crack, c);
      fresh = max(fresh, c * exp(-(len - r) * 6.0));
    }
    // a fork leaves the crack at its own radius
    let rb = R.z * reach;
    if (r > rb && r < rb + (len - rb) * 0.7) {
      let fa = R.x + R.w;
      let d2 = abs(wrapA(th - fa - jag(r, k) * 0.7 - R.w * (rb / r - 1.0))) * r;
      crack = max(crack, exp(-d2 * d2 / (lw * lw * 0.6)) * 0.8);
    }
  }
  // short straight bridges join the two cracks bracketing this pixel (spider-web glass)
  let k0 = u32((floor((th / TAU + 0.5) * nRays - 0.5) + nRays) % nRays);
  let k1 = u32((f32(k0) + 1.0) % nRays);
  let a0 = rays[k0 * RV].x;
  let a1 = rays[k1 * RV].x + select(0.0, TAU, k1 < k0);
  for (var j = 0u; j < 6u; j++) {
    let B = rays[k0 * RV + 3u + j];
    let Rj = reach * 0.07 * pow(1.6, f32(j + 1u)) * B.x;
    if (Rj > front * 0.85) { break; }
    if (B.y < 0.5) { continue; }
    let r1 = Rj * B.z;
    let pa = vec2f(cos(a0 + jag(Rj, k0)), sin(a0 + jag(Rj, k0))) * Rj;
    let pb = vec2f(cos(a1 + jag(r1, k1)), sin(a1 + jag(r1, k1))) * r1;
    let d = segD(q, pa, pb);
    crack = max(crack, exp(-d * d / (lw * lw * 0.6)) * 0.7);
  }
  // crushed zone at the point of impact
  let crush = ss(0.09, 0.0, r) * ss(0.6, 0.9, gnoise(q * 90.0) + 0.5) * ss(0.0, 0.05, front);

  // matter
  let glassy = clamp(F.m_glass + F.m_ice * 0.8 + F.m_stone * 0.3, 0.0, 1.0);
  let molten = clamp(F.m_metal + F.m_fire, 0.0, 1.0);
  let cold = vec3f(0.82, 0.9, 1.05);
  let white = vec3f(F.baseR, F.baseG, F.baseB);
  let hot = vec3f(1.6, 0.55, 0.18);

  var c = vec3f(0.0);

  // the cracks themselves: light catches them unevenly along their length
  let glint = 0.55 + 0.45 * pow(gnoise(vec2f(r * 40.0, th * 7.0)) * 0.5 + 0.5, 2.0);
  let edge = mix(mix(white, cold, glassy), hot, molten * (0.4 + 0.6 * fresh));
  c += edge * crack * glint * mix(1.1, 2.2, F.s_intensity) * (1.0 + fresh * 2.5 * molten);
  c += edge * crush * 1.4;

  // molten seams shed sparks
  if (molten > 0.25) {
    let cell = floor(fc.xy / (2.0 * F.dpr));
    let hs = hash41(cell, floor(F.lt * 30.0));
    c += hot * 3.0 * step(0.992, hs.x) * crack * molten * fresh;
  }
  // the strongest crack carries the accent, for charged words only
  let acc = vec3f(F.accR, F.accG, F.accB);
  c = mix(c, acc * 2.0 * crack, crack * ss(0.7, 0.95, F.s_intensity) * step(0.5, fresh));
  return vec4f(c, 1.0);
}
