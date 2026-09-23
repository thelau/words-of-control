// RELIEF — a sculpted surface, like plaster or stone cast from the word.
// A height field whose character comes from the appraisal (jagged → ridged,
// round → billowed, flowing → warped, cracked → fissured, ordered → terraced
// and mirrored), lit by a low raking light that sweeps across during the shot,
// with real cast shadows. Framed as a slab centred on the word, or full bleed
// when the word is vast.

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var hOut: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var hTex: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;

fn ridged(p: vec2f) -> f32 {
  var s = 0.0; var a = 0.5; var q = p;
  for (var i = 0; i < 6; i++) {
    let n = 1.0 - abs(gnoise(q) * 2.0);
    s += a * n * n;
    q = mat2x2f(1.6, 1.2, -1.2, 1.6) * q + vec2f(3.1, 1.7);
    a *= 0.5;
  }
  return s;
}

fn billow(p: vec2f) -> f32 {
  var s = 0.0; var a = 0.5; var q = p;
  for (var i = 0; i < 5; i++) {
    s += a * abs(gnoise(q) * 2.0);
    q = mat2x2f(1.6, 1.2, -1.2, 1.6) * q + vec2f(1.3, 4.7);
    a *= 0.5;
  }
  return s;
}

/** Distance to the nearest cell edge (fissures). */
fn cellEdge(p: vec2f) -> f32 {
  let i = floor(p);
  var d1 = 9.0; var d2 = 9.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let c = i + vec2f(f32(x), f32(y));
      let o = c + hash22(c) * 0.45 + 0.5;
      let d = length(p - o);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return d2 - d1;
}

fn heightAt(q0: vec2f) -> f32 {
  let slow = mix(1.0, 0.25, F.lazy);
  let t = F.lt * slow;
  var q = q0;
  // contracting: the surface is drawn in toward the word
  q *= 1.0 + F.mo_contracting * 0.35 * ss(0.0, 1.0, F.u);
  // ordered words are mirrored, like a cast
  if (F.s_order > 0.62) { q.x = abs(q.x); }
  let seed = vec2f(F.seed % 97.0, F.seed % 61.0);
  let warpAmt = 0.15 + 0.7 * F.sh_flowing + 0.4 * F.tx_liquid + 0.3 * F.tx_soft;
  let w = vec2f(fbm(q * 1.1 + seed + vec2f(0.0, t * 0.04), 4), fbm(q * 1.1 + seed + vec2f(5.2, -t * 0.04), 4));
  let p = q + w * warpAmt;
  let freq = mix(1.4, 4.2, F.s_density) * mix(1.3, 0.8, F.s_scale);
  let jag = clamp(F.sh_jagged + F.sh_splintered + F.s_phonetics * 0.6 + F.s_hardness * 0.3 - 0.35, 0.0, 1.0);
  var h = mix(billow(p * freq + seed), ridged(p * freq + seed), jag);
  // fissures open as the shot runs (cracked texture, breaking motion)
  let crack = F.tx_cracked + F.mo_breaking * 0.8;
  if (crack > 0.05) {
    let e = cellEdge(p * freq * 1.3 + seed.yx);
    h -= crack * 0.35 * (1.0 - ss(0.0, 0.06 + 0.1 * ss(0.0, 1.0, F.u), e));
  }
  // terraces: an ordered, man-made surface
  let terr = ss(0.55, 0.95, F.s_order) * 0.8;
  let k = mix(6.0, 14.0, F.s_density);
  h = mix(h, (floor(h * k) + ss(0.0, 1.0, fract(h * k)) * 0.35) / k, terr);
  // rising: the relief grows out of the flat plane; trembling: it shivers
  let grow = mix(1.0, ss(0.0, 0.8, F.u), F.mo_rising);
  h = h * grow + gnoise(q0 * 40.0 + vec2f(t * 60.0)) * 0.004 * F.mo_trembling;
  return h;
}

@compute @workgroup_size(16, 16)
fn height(@builtin(global_invocation_id) gid: vec3u) {
  let dim = textureDimensions(hOut);
  if (gid.x >= dim.x || gid.y >= dim.y) { return; }
  let P = panel(vec2f(F.resX, F.resY));
  let aspect = P.z / P.w; // the texture covers the slab; features keep their proportions
  let uv = (vec2f(gid.xy) + 0.5) / vec2f(dim);
  let q = (uv - 0.5) * vec2f(aspect, 1.0) * 2.0;
  textureStore(hOut, vec2i(gid.xy), vec4f(heightAt(q), 0.0, 0.0, 1.0));
}

/** The slab's rectangle in pixels (centred on the word). */
fn panel(res: vec2f) -> vec4f {
  let full = ss(0.72, 0.9, F.s_scale);
  let h = mix(mix(0.58, 0.86, F.s_scale) * res.y, res.y, full);
  let aspect = mix(mix(0.62, 1.0, F.sh_round + F.sh_point), 1.7, F.sh_flat);
  let w = mix(min(h * aspect, res.x * 0.9), res.x, full);
  return vec4f((res - vec2f(w, h)) * 0.5, w, h);
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let res = vec2f(F.resX, F.resY);
  let P = panel(res);
  let uv = (fc.xy - P.xy) / P.zw;
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return vec4f(0.0, 0.0, 0.0, 1.0); }
  let dim = vec2f(textureDimensions(hTex));
  let e = 1.0 / dim;
  let H = mix(1.6, 3.8, F.s_hardness) * mix(0.8, 1.3, F.s_intensity);
  let h = textureSampleLevel(hTex, samp, uv, 0.0).r;
  let hx = textureSampleLevel(hTex, samp, uv + vec2f(e.x, 0.0), 0.0).r - textureSampleLevel(hTex, samp, uv - vec2f(e.x, 0.0), 0.0).r;
  let hy = textureSampleLevel(hTex, samp, uv + vec2f(0.0, e.y), 0.0).r - textureSampleLevel(hTex, samp, uv - vec2f(0.0, e.y), 0.0).r;
  let n = normalize(vec3f(-hx * H * dim.x * 0.04, hy * H * dim.y * 0.04, 1.0));

  // raking key light sweeping across the surface during the shot
  let slow = mix(1.0, 0.3, F.lazy);
  let ang = mix(-2.6, -0.6, F.u * slow) + F.variant * 0.8;
  let elev = mix(0.07, 0.3, F.s_light);
  let L = normalize(vec3f(cos(ang), sin(ang), elev));
  var lit = max(dot(n, L), 0.0);

  // cast shadow: march toward the light across the height field
  let dir2 = normalize(L.xy) * vec2f(1.0, -1.0) / dim * 3.0;
  var shadow = 1.0;
  var sp = uv;
  for (var i = 1; i < 28; i++) {
    sp += dir2;
    let hs = textureSampleLevel(hTex, samp, sp, 0.0).r;
    let rise = (hs - h) * H - f32(i) * 3.0 / dim.x * elev * 18.0;
    shadow = min(shadow, clamp(1.0 - rise * 9.0, 0.0, 1.0));
  }
  // cavity occlusion
  var ao = 0.0;
  for (var k = 0; k < 6; k++) {
    let a = f32(k) * 1.047;
    ao += textureSampleLevel(hTex, samp, uv + vec2f(cos(a), sin(a)) * e * 10.0, 0.0).r;
  }
  let cav = clamp(1.0 - (ao / 6.0 - h) * H * 3.0, 0.35, 1.0);

  // plaster white, faintly tinted by the matter
  let tint = mix(vec3f(1.0), vec3f(1.0, 0.86, 0.8), F.m_flesh) * mix(vec3f(1.0), vec3f(0.86, 0.9, 0.95), F.m_stone)
           * mix(vec3f(1.0), vec3f(1.0, 0.88, 0.72), F.m_wood);
  let albedo = vec3f(F.baseR, F.baseG, F.baseB) * tint * 0.85;
  let fill = 0.012 * (0.5 + 0.5 * n.z);
  var c = albedo * (lit * shadow * 1.7 + fill) * cav;
  // a thin accent where the light grazes the highest ridges (only when charged)
  c += vec3f(F.accR, F.accG, F.accB) * pow(lit * shadow, 12.0) * 0.6 * ss(0.6, 1.0, F.s_intensity);
  // torn edges: the slab dissolves into the dark at its borders
  let edge = min(min(uv.x, 1.0 - uv.x) * P.z, min(uv.y, 1.0 - uv.y) * P.w);
  let tear = ss(0.0, 10.0 * F.dpr, edge + (gnoise(uv * 30.0) * 8.0 + h * 12.0) * F.dpr);
  return vec4f(c * tear, 1.0);
}
