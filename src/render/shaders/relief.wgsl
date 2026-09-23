// RELIEF — a sculpted surface, like plaster or stone cast from the word.
// A height field whose character comes from the appraisal (jagged → ridged,
// round → billowed, flowing → warped, cracked → fissured, ordered → terraced),
// carved into a standing slab and raymarched from a camera that orbits a few
// degrees: a silhouette, dark cut sides, and a low raking light sweeping across
// with real cast shadows. Portrait for most words, wide for flat ones.

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
  let seed = vec2f(F.seed % 97.0, F.seed % 61.0);
  let warpAmt = 0.15 + 0.7 * F.sh_flowing + 0.4 * F.tx_liquid + 0.3 * F.tx_soft;
  let w = vec2f(fbm(q * 0.9 + seed + vec2f(0.0, t * 0.04), 3), fbm(q * 0.9 + seed + vec2f(5.2, -t * 0.04), 3));
  let p = q + w * warpAmt;
  let freq = mix(1.6, 4.4, F.s_density) * mix(1.3, 0.8, F.s_scale);
  let jag = clamp(F.sh_jagged + F.sh_splintered + F.s_phonetics * 0.6 + F.s_hardness * 0.3 - 0.35, 0.0, 1.0);
  // mass hierarchy: big masses, then ridges, then fine detail
  let mass = fbm(p * 0.7 + seed * 0.3, 3) * 0.5 + 0.5;
  let mid = mix(billow(p * freq + seed), ridged(p * freq + seed), jag);
  let fine = gnoise(p * freq * 4.0 + seed) * 0.5 + 0.5;
  var h = 0.55 * mass + 0.33 * mid + 0.12 * fine * ss(0.2, 0.7, mass);
  // fissures open as the shot runs (cracked texture, breaking motion)
  let crack = F.tx_cracked + F.mo_breaking * 0.8;
  if (crack > 0.05) {
    let e = cellEdge(p * freq * 1.3 + seed.yx);
    h -= crack * 0.3 * (1.0 - ss(0.0, 0.06 + 0.1 * ss(0.0, 1.0, F.u), e));
  }
  // terraces: an ordered, man-made surface
  let terr = ss(0.55, 0.95, F.s_order) * 0.8;
  let k = mix(6.0, 14.0, F.s_density);
  h = mix(h, (floor(h * k) + ss(0.0, 1.0, fract(h * k)) * 0.35) / k, terr);
  // rising: the relief grows out of the flat plane; trembling: it shivers
  let grow = mix(1.0, ss(0.0, 0.8, F.u), F.mo_rising);
  return h * grow + gnoise(q0 * 40.0 + vec2f(t * 60.0)) * 0.004 * F.mo_trembling;
}

@compute @workgroup_size(16, 16)
fn height(@builtin(global_invocation_id) gid: vec3u) {
  let dim = textureDimensions(hOut);
  if (gid.x >= dim.x || gid.y >= dim.y) { return; }
  let P = panel(vec2f(F.resX, F.resY));
  let aspect = P.z / P.w; // the texture covers the slab face; features keep their proportions
  let uv = (vec2f(gid.xy) + 0.5) / vec2f(dim);
  let q = (uv - 0.5) * vec2f(aspect, 1.0) * 2.0;
  textureStore(hOut, vec2i(gid.xy), vec4f(heightAt(q), 0.0, 0.0, 1.0));
}

/** The slab's proportions (width/height) and size: tall and portrait by default, wide for flat words. */
fn panel(res: vec2f) -> vec4f {
  let aspect = mix(mix(0.55, 0.9, F.sh_round + F.sh_point), 1.6, F.sh_flat);
  let size = mix(1.05, 1.5, F.s_scale);
  return vec4f(0.0, 0.0, aspect * size, size);
}

/** Height at slab uv (0..1), in world units toward the camera. */
fn hAt(uv: vec2f, H: f32) -> f32 { return textureSampleLevel(hTex, samp, uv, 0.0).r * H; }

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let res = vec2f(F.resX, F.resY);
  let P = panel(res);
  let W = P.z;
  let Hs = P.w;
  let H = mix(0.1, 0.24, F.s_hardness) * mix(0.8, 1.2, F.s_intensity);
  let slow = mix(1.0, 0.3, F.lazy);

  // camera: slightly below and to the side of a standing slab, orbiting a few degrees over the shot
  // each camera angle (F.angle) comes round the slab from its own side and height
  let yaw = (F.variant - 0.5) * 0.5 + (F.angle - 0.5) * 1.1 + (F.u * slow - 0.5) * 0.2;
  let pitch = 0.1 + 0.06 * F.s_scale + fract(F.angle * 5.3) * 0.35;
  let dist = Hs * 1.8 / F.zoom; // the slab fills ~¾ of the frame height when wide
  let aim = vec3f(F.offX * W * 0.5, F.offY * Hs * 0.5, H * 0.5);
  let cam = aim + vec3f(sin(yaw) * cos(pitch), -sin(pitch), cos(yaw) * cos(pitch)) * dist;
  let fw = normalize(aim - cam);
  let rt = normalize(cross(fw, vec3f(0.0, 1.0, 0.0)));
  let up = cross(rt, fw);
  let ndc = (fc.xy - res * 0.5) / (res.y * 0.5) * vec2f(1.0, -1.0);
  let rd = normalize(fw * 2.6 + rt * ndc.x + up * ndc.y);

  // the slab's bounding box: x ∈ ±W/2, y ∈ ±Hs/2, z ∈ [−0.06, H] (a thin plinth behind the relief)
  let bmin = vec3f(-W * 0.5, -Hs * 0.5, -0.06);
  let bmax = vec3f(W * 0.5, Hs * 0.5, H);
  let inv = 1.0 / rd;
  let t0 = (bmin - cam) * inv;
  let t1 = (bmax - cam) * inv;
  let tmin = max(max(min(t0.x, t1.x), min(t0.y, t1.y)), min(t0.z, t1.z));
  let tmax = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z));
  if (tmax < max(tmin, 0.0)) { return vec4f(0.0, 0.0, 0.0, 1.0); }

  // march the height field inside the box
  var tt = max(tmin, 0.0);
  let steps = 48;
  let dt = (tmax - tt) / f32(steps);
  var hit = false;
  var pos = cam + rd * tt;
  let entryUV = vec2f(pos.x / W + 0.5, 0.5 - pos.y / Hs);
  let entryH = hAt(entryUV, H);
  var side = pos.z < entryH - 1e-3 && (abs(pos.x) > W * 0.5 - 1e-3 || abs(pos.y) > Hs * 0.5 - 1e-3);
  if (!side) {
    for (var i = 0; i < steps; i++) {
      pos = cam + rd * tt;
      let uv = vec2f(pos.x / W + 0.5, 0.5 - pos.y / Hs);
      if (pos.z <= hAt(uv, H)) { hit = true; break; }
      tt += dt;
    }
    if (hit) {
      var a = tt - dt;
      var b = tt;
      for (var j = 0; j < 5; j++) {
        let mid = (a + b) * 0.5;
        let pm = cam + rd * mid;
        if (pm.z <= hAt(vec2f(pm.x / W + 0.5, 0.5 - pm.y / Hs), H)) { b = mid; } else { a = mid; }
      }
      pos = cam + rd * b;
    }
  }
  if (!hit && !side) { return vec4f(0.0, 0.0, 0.0, 1.0); }

  // the raking key light sweeps across during the shot
  let ang = mix(-2.7, -0.5, F.u * slow) + F.variant * 0.8;
  let elev = mix(0.1, 0.35, F.s_light);
  let L = normalize(vec3f(cos(ang), sin(ang), elev));
  let tint = mix(vec3f(1.0), vec3f(1.0, 0.86, 0.8), F.m_flesh) * mix(vec3f(1.0), vec3f(0.86, 0.9, 0.95), F.m_stone)
           * mix(vec3f(1.0), vec3f(1.0, 0.88, 0.72), F.m_wood);
  let albedo = vec3f(F.baseR, F.baseG, F.baseB) * tint * 0.85;
  if (side) {
    // the slab's cut sides: dark, catching a little of the light
    return vec4f(albedo * 0.12 * (0.4 + 0.6 * max(dot(vec3f(sign(pos.x), 0.0, 0.0), L), 0.0)), 1.0);
  }

  let uv = vec2f(pos.x / W + 0.5, 0.5 - pos.y / Hs);
  let dim = vec2f(textureDimensions(hTex));
  let e = 1.0 / dim;
  let hx = (hAt(uv + vec2f(e.x, 0.0), H) - hAt(uv - vec2f(e.x, 0.0), H)) / (2.0 * e.x * W);
  let hy = (hAt(uv + vec2f(0.0, e.y), H) - hAt(uv - vec2f(0.0, e.y), H)) / (2.0 * e.y * Hs);
  let n = normalize(vec3f(-hx, hy, 1.0));
  var lit = max(dot(n, L), 0.0);

  // cast shadow: march toward the light over the height field
  var shadow = 1.0;
  var sp = pos;
  for (var i = 1; i < 16; i++) {
    sp += L * 0.025;
    let suv = vec2f(sp.x / W + 0.5, 0.5 - sp.y / Hs);
    if (any(suv < vec2f(0.0)) || any(suv > vec2f(1.0)) || sp.z > H) { break; }
    shadow = min(shadow, clamp((sp.z - hAt(suv, H)) * 60.0, 0.0, 1.0));
  }
  // cavity occlusion
  var ao = 0.0;
  for (var k = 0; k < 6; k++) {
    let a = f32(k) * 1.047;
    ao += hAt(uv + vec2f(cos(a), sin(a)) * e * 10.0, H);
  }
  let cav = clamp(1.0 - (ao / 6.0 - pos.z) / H * 3.0, 0.35, 1.0);
  let fill = 0.012 * (0.5 + 0.5 * n.z);
  var c = albedo * (lit * shadow * 1.7 + fill) * cav;
  c += vec3f(F.accR, F.accG, F.accB) * pow(lit * shadow, 12.0) * 0.6 * ss(0.6, 1.0, F.s_intensity);
  return vec4f(c, 1.0);
}
