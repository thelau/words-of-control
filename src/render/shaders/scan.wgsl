// SCAN — the machine reading matter. A black frame; one white laser line sweeps
// down it, bent by a hidden surface (the relief's height field, over the whole
// frame). Only the strip it is passing over is lit — faces turned toward the beam
// catch it, the rest stays dark — and the short persistence lets that strip die
// behind the line: the form is glimpsed, never held.
// Drawn additively into the persistence buffer.

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(2) var hTex: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;

fn hAt(uv: vec2f) -> f32 { return textureSampleLevel(hTex, samp, uv, 0.0).r; }

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let res = vec2f(F.resX, F.resY);
  let uv = fc.xy / res;
  // one or two sweeps over the shot, top to bottom; a charged word sweeps faster and more often
  let sweeps = select(1.0, 2.0, F.s_arousal > 0.55) * mix(1.0, 0.6, F.lazy);
  let rate = sweeps / max(F.dur, 0.1) * 1.2;
  let s = fract(F.u * sweeps) * 1.2 - 0.1;
  let sPrev = s - F.dt * rate;
  let K = mix(0.08, 0.22, F.s_hardness) * mix(0.8, 1.3, F.s_intensity);
  // where the beam crosses this column, now and one frame ago (bent by the surface)
  let yl = s - (hAt(vec2f(uv.x, s)) - 0.5) * K;
  let yp = sPrev - (hAt(vec2f(uv.x, sPrev)) - 0.5) * K;
  // the surface under this pixel, lit by the beam grazing from below: slopes facing it flare
  let e = 4.0 / res; // a broad slope: the surface, not its grain
  let h = hAt(uv);
  let g = vec2f(hAt(uv + vec2f(e.x, 0.0)) - hAt(uv - vec2f(e.x, 0.0)), hAt(uv + vec2f(0.0, e.y)) - hAt(uv - vec2f(0.0, e.y)));
  let nrm = normalize(vec3f(-g * res.y * K * 0.35, 1.0));
  let face = pow(max(dot(nrm, normalize(vec3f(0.0, 1.0, 0.25))), 0.0), 2.0) + 0.04 * h;
  // the strip swept this frame, deposited once (continuous at any frame rate)
  let swept = step(min(yp, yl), uv.y) * step(uv.y, max(yp, yl));
  let dpx = abs(uv.y - yl) * res.y;
  let core = exp(-dpx * dpx / 0.6);
  let white = vec3f(0.92, 0.96, 1.0);
  let c = white * (core * 1.4 + swept * face * 0.9);
  return vec4f(c * ss(0.0, 0.06, F.lt), 0.0);
}
