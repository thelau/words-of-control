// Final image: HDR light + bloom/halation → film-like per-channel shoulder →
// vignette → sRGB → luminance-dependent grain + triangular dither (no banding).

@group(0) @binding(0) var<uniform> U: Uniforms;
@group(0) @binding(1) var accum: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var bloomTex: texture_2d<f32>;
@group(0) @binding(4) var matterTex: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

fn toSrgb(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(max(c, vec3f(0.0)), vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}

fn h1(p: vec2f, salt: u32) -> f32 {
  return f32(pcg((u32(p.x) * 1973u) ^ pcg(u32(p.y) * 9277u + salt))) / 4294967295.0;
}

const BG = vec3f(0.00304, 0.00243, 0.00182); // #0A0806, linear

// Film shoulder: red saturates first, so bright warm light climbs red → orange → yellow → white.
fn film(c: vec3f) -> vec3f {
  let k = vec3f(1.0, 0.92, 0.85);
  let x = max(c, vec3f(0.0)) * k;
  let y = 1.0 - exp(-x);
  // gentle crosstalk: very bright channels bleed into their neighbours (emulsion layers)
  let over = max(x - 1.2, vec3f(0.0));
  return clamp(y + vec3f(over.g * 0.03, over.r * 0.05 + over.b * 0.02, over.g * 0.03), vec3f(0.0), vec3f(1.0));
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let res = vec2f(U.resX, U.resY);
  let uv = fc.xy / res;
  var c = textureLoad(accum, vec2i(fc.xy), 0).rgb;

  // bloom with a faint radial chromatic split, tinted like film halation
  let q = uv - 0.5;
  let ca = q * 0.004;
  let bl = vec3f(
    textureSampleLevel(bloomTex, samp, uv + ca, 0.0).r,
    textureSampleLevel(bloomTex, samp, uv, 0.0).g,
    textureSampleLevel(bloomTex, samp, uv - ca, 0.0).b);
  c += bl * U.bloom * mix(vec3f(1.0), vec3f(1.0, 0.62, 0.42), U.halation);

  // ---- matter: the density field seen as a surface, lit by the light at C
  let mres = vec2f(U.matterW, U.matterH);
  let d0 = textureSampleLevel(matterTex, samp, uv, 0.0).r;
  let e = 3.0 / mres;
  let hx = textureSampleLevel(matterTex, samp, uv + vec2f(e.x, 0.0), 2.0).r - textureSampleLevel(matterTex, samp, uv - vec2f(e.x, 0.0), 2.0).r;
  let hy = textureSampleLevel(matterTex, samp, uv + vec2f(0.0, e.y), 2.0).r - textureSampleLevel(matterTex, samp, uv - vec2f(0.0, e.y), 2.0).r;
  let hxf = textureSampleLevel(matterTex, samp, uv + vec2f(e.x, 0.0) * 0.4, 0.5).r - textureSampleLevel(matterTex, samp, uv - vec2f(e.x, 0.0) * 0.4, 0.5).r;
  let hyf = textureSampleLevel(matterTex, samp, uv + vec2f(0.0, e.y) * 0.4, 0.5).r - textureSampleLevel(matterTex, samp, uv - vec2f(0.0, e.y) * 0.4, 0.5).r;
  let N = normalize(vec3f(-(hx + 0.35 * hxf) * U.heightK, -(hy + 0.35 * hyf) * U.heightK, 1.0));
  let toC = res * 0.5 - fc.xy;
  let Lv = normalize(vec3f(toC, U.lightH * res.y));
  let diff = max(dot(N, Lv), 0.0);
  let dist = length(toC) / U.pxPerUnit;
  let lr = dist / max(U.lightR, 0.05);
  let atten = U.lightI / (1.0 + lr * lr);
  let cover = 1.0 - exp(-d0 * U.matterGain);
  // albedo: warm-neutral dust, drifting between the two reaction tones over space
  let tone = smoothstep(-0.4, 0.6, gnoise(uv * vec2f(res.x / res.y, 1.0) * 2.3 + vec2f(U.rSeed * 0.0001, 0.0)));
  let hue = mix(vec3f(U.colR, U.colG, U.colB), vec3f(U.col2R, U.col2G, U.col2B), tone);
  let albedo = U.albedo * mix(vec3f(1.0, 0.94, 0.88), hue * 1.6, 0.5 * U.reacting);
  let lightCol = vec3f(U.lightColR, U.lightColG, U.lightColB);
  let crest = pow(diff, 10.0) * 0.6;
  c += albedo * cover * lightCol * (diff * atten + crest * atten + U.ambient * U.lightI);

  // ---- the light itself: small core, four-point diffraction star, fainter diagonals
  let dp = (fc.xy - res * 0.5) / res.y;
  let core = exp(-dot(dp, dp) * 9000.0) * 6.0 + exp(-dot(dp, dp) * 600.0) * 0.4;
  let sp = exp(-abs(dp.y) * 1400.0) * exp(-abs(dp.x) * 7.0) + exp(-abs(dp.x) * 1400.0) * exp(-abs(dp.y) * 7.0);
  let dr = vec2f(dp.x + dp.y, dp.x - dp.y) * 0.7071;
  let sd = exp(-abs(dr.y) * 1800.0) * exp(-abs(dr.x) * 16.0) + exp(-abs(dr.x) * 1800.0) * exp(-abs(dr.y) * 16.0);
  c += U.starI * mix(vec3f(1.0, 0.95, 0.9), lightCol, 0.4) * (core + sp * 0.9 + sd * 0.25);

  c *= U.exposure * U.expoMul;
  let vig = 1.0 - U.vignette * pow(dot(q * vec2f(1.0, 1.25), q * vec2f(1.0, 1.25)) * 2.2, 1.3);
  var outc = toSrgb(BG + film(c) * vig);

  // grain: soft 2-octave, 24 fps, strongest in the mid-tones, faint in pure black
  let gf = floor(U.frame / 5.0);
  let gp = fc.xy / (1.35 * U.dpr);
  let g = (h1(gp, u32(gf)) + h1(gp * 0.5 + 17.0, u32(gf) + 7u) - 1.0);
  let l = dot(outc, vec3f(0.2126, 0.7152, 0.0722));
  outc += g * U.grain * (0.25 + 1.6 * l * (1.0 - l));
  // triangular dither kills 8-bit banding in the dark gradients
  let d = h1(fc.xy, 99u + u32(U.frame)) + h1(fc.xy, 131u + u32(U.frame)) - 1.0;
  outc += d / 255.0;
  return vec4f(outc, 1.0);
}
