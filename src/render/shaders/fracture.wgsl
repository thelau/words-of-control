// FRACTURE — the word strikes glass (or splits metal). An intact dark sheet
// reflects one strip of light that slowly crosses it. From the point where the
// word was typed, cracks race out (5–9 uneven rays with forks and bridges; a
// blade or metal word makes one straight cleave). Each shard tilts a little, so
// the reflection breaks at every crack — that is what reads as glass. Cracks
// are dark gaps with a thin bevel highlight; molten matter glows and sheds sparks.

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var<storage, read> rays: array<vec4f>; // see fractureRays.ts (9 vec4 per ray)

const RV = 9u;

fn jag(r: f32, k: u32) -> f32 {
  let a = rays[k * RV + 1u];
  let b = rays[k * RV + 2u];
  return a.y * ss(a.x - 0.01, a.x + 0.01, r) + a.w * ss(a.z - 0.01, a.z + 0.01, r)
       + b.y * ss(b.x - 0.01, b.x + 0.01, r) + b.w * ss(b.z - 0.01, b.z + 0.01, r);
}

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
  p = p / F.zoom + vec2f(F.offX, F.offY);
  let px = 1.0 / (m * F.zoom);
  let slow = mix(1.0, 0.3, F.lazy);
  let t = F.lt * slow;
  let u = F.u;
  let n = u32(F.variant2);
  let cleave = n == 2u;

  let speed = mix(0.6, 4.0, F.s_arousal * 0.7 + F.s_tension * 0.3) * select(1.0, 2.5, cleave);
  let reach = mix(1.1, 2.4, F.s_scale) * select(1.0, 1.6, cleave);
  let front = reach * (1.0 - exp(-t * speed));
  let r0 = length(p);
  let th0 = atan2(p.y, p.x);

  // the sector: last ray at or below this angle (rays are sorted)
  var k0 = n - 1u;
  for (var k = 0u; k < n; k++) { if (rays[k * RV].x <= th0) { k0 = k; } }
  let k1 = (k0 + 1u) % n;

  // breaking: the shard drifts away from the impact
  let mid = rays[k0 * RV].x + wrapA(rays[k1 * RV].x - rays[k0 * RV].x) * 0.5;
  let sep = F.mo_breaking * 0.04 * ss(0.2, 1.0, u) * r0 * select(1.0, 2.0, cleave);
  let q = p - vec2f(cos(mid), sin(mid)) * sep;
  let r = length(q);
  let th = atan2(q.y, q.x);
  let lw = px * mix(0.8, 1.2, F.s_hardness);

  // cracks: distance to rays, forks and bridges
  var dmin = 1e3;
  var fresh = 0.0;
  for (var k = 0u; k < n; k++) {
    let R = rays[k * RV];
    let len = front * R.y;
    if (r < len) {
      let d = abs(wrapA(th - R.x - jag(r, k))) * r;
      dmin = min(dmin, d);
      fresh = max(fresh, exp(-d * d / (lw * lw * 4.0)) * exp(-(len - r) * 6.0));
    }
    let rb = R.z * reach;
    if (r > rb && r < rb + (len - rb) * 0.7) {
      let fa = R.x + R.w;
      dmin = min(dmin, abs(wrapA(th - fa - jag(r, k) * 0.7 - R.w * (rb / r - 1.0))) * r);
    }
  }
  // bridges in this sector, and the shard's ring index (how many bridges lie inside r)
  let a0 = rays[k0 * RV].x;
  let a1 = rays[k1 * RV].x + select(0.0, TAU, rays[k1 * RV].x < a0);
  var ring = 0.0;
  var tiltSeed = f32(k0) * 0.37;
  for (var j = 0u; j < 6u; j++) {
    let B = rays[k0 * RV + 3u + j];
    let Rj = reach * 0.07 * pow(1.6, f32(j + 1u)) * B.x;
    if (Rj > front * 0.85) { break; }
    if (B.y < 0.5) { continue; }
    let r1 = Rj * B.z;
    let pa = vec2f(cos(a0 + jag(Rj, k0)), sin(a0 + jag(Rj, k0))) * Rj;
    let pb = vec2f(cos(a1 + jag(r1, k1)), sin(a1 + jag(r1, k1))) * r1;
    dmin = min(dmin, segD(q, pa, pb));
    // outside this bridge (on the far side from the impact) = a different shard
    let e = pb - pa;
    if ((e.x * (q.y - pa.y) - e.y * (q.x - pa.x)) * (e.x * (-pa.y) - e.y * (-pa.x)) < 0.0) { ring += 1.0; tiltSeed = B.w; }
  }
  let crack = exp(-dmin * dmin / (lw * lw));
  let broken = ss(0.02, 0.0, r - front);

  // the sheet: each shard tilts by its own normal; the reflected strip light breaks at the cracks
  let hs = hash22(vec2f(f32(k0) * 7.1 + ring * 13.7, tiltSeed * 91.0));
  let tilt = (0.04 + 0.12 * F.s_intensity * ss(0.0, 0.3, r)) * broken;
  let nrm = hs * tilt;
  let D = normalize(vec2f(1.0, 0.6));
  let sweep = mix(-1.9, 1.9, u * slow) + (F.variant - 0.5) * 0.6;
  let w = 0.07 + 0.05 * F.s_scale;
  let strip = ss(w, 0.0, abs(dot(p + nrm * 2.5, D) - sweep));
  let glassy = clamp(F.m_glass + F.m_ice * 0.8 + F.m_water * 0.4 + F.m_stone * 0.3, 0.15, 1.0);
  let molten = clamp(F.m_metal * 0.6 + F.m_fire, 0.0, 1.0);
  let cold = vec3f(0.86, 0.93, 1.0);
  var c = cold * (strip * 1.1 * glassy + 0.006 + 0.012 * hs.x * broken);

  // cracks: a dark gap, and a thin bevel on the side facing the light
  c *= 1.0 - 0.92 * crack;
  let bevel = exp(-pow(dmin - lw * 1.6, 2.0) / (lw * lw * 0.5)) * (0.25 + 0.75 * max(dot(normalize(q + 1e-4), -D), 0.0));
  c += cold * bevel * (0.18 + 0.5 * strip) * broken * glassy;

  // molten seams: hot, fresh, shedding sparks
  let hot = vec3f(1.6, 0.52, 0.16);
  c += hot * crack * molten * (0.25 + 2.5 * fresh);
  if (molten > 0.25) {
    let cell = floor(fc.xy / 2.0);
    let hh = hash41(cell, floor(F.lt * 30.0));
    c += hot * 3.0 * step(0.992, hh.x) * crack * molten * fresh;
  }
  // the crushed point of impact
  c += cold * ss(0.05, 0.0, r) * ss(0.6, 0.9, gnoise(q * 90.0) + 0.5) * ss(0.0, 0.05, front) * 0.8;
  // the accent: the freshest crack of a charged word
  c = mix(c, vec3f(F.accR, F.accG, F.accB) * 1.6, crack * fresh * ss(0.75, 0.95, F.s_intensity));
  return vec4f(c, 1.0);
}
