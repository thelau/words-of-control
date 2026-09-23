// SCAN — the machine reading matter. A black frame; one laser line (the
// accent colour) sweeps down it, bent by a hidden surface (the relief's height
// field, over the whole frame). The long exposure keeps fading copies, so the
// form builds up as contour lines — and is never shown any other way.
// Drawn additively into the persistence buffer.

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(2) var hTex: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let res = vec2f(F.resX, F.resY);
  let uv = fc.xy / res;
  // one or two sweeps over the shot, top to bottom; a charged word sweeps faster and more often
  let sweeps = select(1.0, 2.0, F.s_arousal > 0.55);
  let rate = sweeps * mix(1.0, 0.6, F.lazy) / max(F.dur, 0.1);
  let s = fract(F.u * sweeps * mix(1.0, 0.6, F.lazy)) * 1.2 - 0.1;
  let sPrev = s - F.dt * rate * 1.2;
  let K = mix(0.08, 0.22, F.s_hardness) * mix(0.8, 1.3, F.s_intensity);
  // the laser strobes: at each step it leaves one crisp contour in the long exposure
  let n = mix(26.0, 64.0, F.s_density);
  let step = floor(s * n) != floor(sPrev * n);
  let sc = select(s, floor(s * n) / n, step);
  let h = textureSampleLevel(hTex, samp, vec2f(uv.x, sc), 0.0).r;
  let yl = sc - (h - 0.5) * K;
  let dpx = abs(uv.y - yl) * res.y;
  let core = exp(-dpx * dpx / 0.5);
  let acc = vec3f(F.accR, F.accG, F.accB);
  let strength = select(0.012, 1.2, step); // the live beam barely registers; the marks are bright
  let beam = mix(vec3f(1.0), acc, 0.75) * core * strength;
  return vec4f(beam * ss(0.0, 0.06, F.lt), 0.0);
}
