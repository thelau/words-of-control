// SAND (drawing) — a macro camera close over the bed, tilted like a
// photographer crouching at its edge, a low sun raking across it. Grains with
// glints, cast shadows, a pool of light falling off into darkness (the bed
// never shows its edge), and the circle of confusion in alpha for the lens
// (dof.wgsl). Dark metal where the sand has left: the Chladni plate.

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var bed: texture_2d<f32>; // baked by sand.wgsl: h, slope ×16, curvature ×4
@group(0) @binding(3) var wrapS: sampler; // linear, repeat: the bed is periodic

const N = 512u;

fn bedAt(uv: vec2f) -> vec4f { return textureSampleLevel(bed, wrapS, uv, 0.0); }
/** Height at uv (periodic, bilinear), in sim units. */
fn h(uv: vec2f) -> f32 { return bedAt(uv).x; }

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let res = vec2f(F.resX, F.resY);
  let slow = mix(1.0, 0.35, F.lazy);
  let u = F.u * slow;
  // heights: one sim unit is Hs cells tall, so the angle of repose renders at ~33°
  let lim = mix(0.45, 0.85, F.s_hardness) / f32(N) * 60.0;
  let Hs = 0.65 / lim;

  // camera: each angle (F.angle) is a new setup — grazing, three-quarter or straight down, from any
  // direction, near or far, sometimes tilted — aimed near the event, drifting slowly while it rolls
  let ah = hash22(vec2f(F.angle * 113.0, F.seed * 0.01)) * 0.5 + 0.5;
  let T = vec2f(0.5) + vec2f(F.offX, F.offY) * 0.12 + vec2f(cos(ah.x * TAU), sin(ah.x * TAU)) * F.lt * 0.012;
  let yaw = F.seed * 1.618 + F.angle * TAU + (u - 0.5) * 0.12;
  let kind = fract(F.angle * 7.31);
  // the plate is read from above: never lower than ~40°
  let pitch = max(select(mix(1.15, 1.45, ah.y), mix(0.7, 1.0, ah.y), kind < 0.6), 0.7);
  let dist = mix(0.62, 0.52, u) * mix(0.35, 1.3, ah.x * ah.y + 0.2) / F.zoom;
  let roll = select(0.0, (ah.x - 0.5) * 0.7, fract(F.angle * 3.7) > 0.7);
  let fwd = vec3f(cos(yaw) * cos(pitch), sin(yaw) * cos(pitch), -sin(pitch));
  let cam = vec3f(T, 0.0) - fwd * dist;
  let rt0 = normalize(cross(fwd, select(vec3f(0.0, 0.0, 1.0), vec3f(cos(yaw), sin(yaw), 0.0), pitch > 1.45)));
  let up0 = cross(rt0, fwd);
  let rt = rt0 * cos(roll) + up0 * sin(roll);
  let up = up0 * cos(roll) - rt0 * sin(roll);
  let ndc = (fc.xy - res * 0.5) / (res.y * 0.5) * vec2f(1.0, -1.0);
  let rd = normalize(fwd * 2.2 + rt * ndc.x + up * ndc.y);
  if (rd.z > -0.02) { return vec4f(0.0, 0.0, 0.0, 16.0); }

  // the bed's relief is a few cells tall: the plane z = 0 is where it is seen
  let tHit = -cam.z / rd.z;
  let uv = (cam + rd * tHit).xy;

  // the surface
  let e = 1.0 / f32(N);
  let B = bedAt(uv);
  let h0 = B.x;
  var n = normalize(vec3f(-B.y / 16.0 * Hs, -B.z / 16.0 * Hs, 1.0));
  let lap = B.w / 4.0;

  // the sun: low and raking, from the side-back of the camera; it wanders a little over the shot
  let az = yaw + mix(1.9, 2.5, F.variant) + (u - 0.5) * 0.25;
  let el = mix(0.12, 0.26, F.s_light); // raking: the grains and their shadows, never a creamy fill
  let L = normalize(vec3f(cos(az) * cos(el), sin(az) * cos(el), sin(el)));
  let V = -rd;

  // one pixel's footprint on the bed (stretched along the view at grazing angles)
  let foot = tHit / (res.y * 0.5 * 2.2) * (1.0 + 1.0 / max(-rd.z, 0.1));

  // cast shadow along the sun: 6 taps, stride growing with distance, jittered per pixel
  let ld = normalize(L.xy);
  let rise = L.z / length(L.xy) / Hs; // sim height gained per cell toward the sun
  var shadow = 1.0;
  let jt = fract(dot(fc.xy, vec2f(0.0671, 0.00583)) * 52.98);
  for (var i = 1; i <= 6; i++) {
    let s = (f32(i) - jt * 0.8) * (0.9 + 0.5 * f32(i));
    let dh = h(uv + ld * s * e) - (h0 + s * rise);
    shadow = min(shadow, clamp(1.0 - dh * Hs * 0.9, 0.0, 1.0));
  }
  let ao = clamp(1.0 + lap * Hs * 1.5, 0.55, 1.0);

  // grains: each tilts the normal a little, only where a grain spans ≥ ~3 px (smaller would sparkle)
  let gsz = f32(N) * 3.0;
  let gA = ss(0.4, 0.2, foot * gsz);
  let gh = hash22(floor(uv * gsz));
  n = normalize(n + vec3f(gh * 0.28 * gA, 0.0));
  let sandCol = mix(vec3f(0.8, 0.7, 0.56), vec3f(F.baseR, F.baseG, F.baseB), 0.25) * (0.9 + 0.2 * gh.y * gA);
  var c = sandCol * (max(dot(n, L), 0.0) * shadow * 2.2 + 0.035 * ao * (0.5 + 0.5 * n.z));
  // glints: a few grains are mirrors
  let spec = pow(max(dot(reflect(-L, n), V), 0.0), 60.0);
  c += vec3f(1.0, 0.95, 0.88) * spec * step(0.985, gh.x * 0.5 + 0.5) * shadow * gA * 4.0;

  // the plate: dark brushed metal where the sand has been thrown off, a broad sheen of the sun
  let bare = ss(0.1, 0.03, h0);
  let sheen = pow(max(dot(reflect(-L, vec3f(0.0, 0.0, 1.0)), V), 0.0), 8.0) * (0.8 + 0.2 * gnoise(vec2f(uv.x * 900.0, uv.y * 6.0)));
  c = mix(c, vec3f(0.018, 0.02, 0.022) + vec3f(0.35, 0.37, 0.4) * sheen, bare);
  // the pool of light: the bed falls away into darkness (tight enough that its repeat never shows)
  let pd = uv - T;
  c *= exp(-dot(pd, pd) / (0.26 * 0.26 / (F.zoom * F.zoom)));
  // the lens: focused on the aim; the near and far bed dissolve (circle of confusion, px, in alpha)
  let coc = clamp(abs(tHit - dist) / tHit * mix(22.0, 40.0, F.s_intensity) * F.zoom, 0.0, 16.0);
  return vec4f(c * ss(0.0, 0.12, F.lt), coc);
}
