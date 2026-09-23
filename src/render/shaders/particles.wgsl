// Grains as light: each particle is drawn as the path it travelled during
// this frame (a capsule from its frame-start position to now, stretched along
// velocity), with depth of field, heavy-tailed brightness, a hot tapered head
// and optional spark flicker along the streak.

@group(0) @binding(0) var<uniform> U: Uniforms;
@group(0) @binding(1) var<storage, read> parts: array<Particle>;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) sd: vec2f,                     // along (px from head toward tail), across (px)
  @location(1) @interpolate(flat) geo: vec4f, // L, radius, coc, taper
  @location(2) @interpolate(flat) col: vec3f,
  @location(3) @interpolate(flat) fx: vec4f,  // hot, sparkle, phase, soft
};

const REST_WHITE = vec3f(0.846, 0.791, 0.723); // #EDE6DC, linear

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var o: VOut;
  let P = parts[ii];
  let lum = P.c.x;
  if (lum < 0.002) {
    o.pos = vec4f(2.0, 2.0, 2.0, 1.0);
    return o;
  }
  let ppu = U.pxPerUnit;
  let tint = P.d.x;
  let head = P.a.xy * ppu;
  let vel = P.a.zw * ppu;
  var path = head - P.d.zw * ppu;                     // travelled this frame
  if (dot(path, path) > U.resY * U.resY * 0.25) { path = vel * U.frameDt; } // no wrap-around smears
  let tailVec = path + vel * U.streak * U.streakScale * tint;
  let L0 = length(tailVec);
  let L = min(L0, 0.55 * U.resY);
  let axis = select(vec2f(1.0, 0.0), tailVec / max(L0, 1e-5), L0 > 0.01);
  let nrm = vec2f(-axis.y, axis.x);

  // depth of field: most grains near the focal plane, a few very close to the lens
  let hz = rnd(ii, 0xD0Fu);
  // fast streaks stay crisp (a defocused streak is a grey band, not light)
  let coc = U.dofMax * U.dpr * pow(hz, 5.0) * mix(0.35, 1.0, tint) / (1.0 + L0 / (6.0 * U.dpr));
  let w0 = U.sizeBase * U.dpr * P.c.y;                // in-focus diameter
  let r = max(w0 * 0.5, 0.5) + coc;
  let m = r + 1.5;

  let cx = select(-m, L + m, (vi & 1u) == 1u);
  let cy = select(-m, m, (vi & 2u) == 2u);
  let px = head - axis * cx + nrm * cy;
  o.pos = vec4f(px / (vec2f(U.resX, U.resY) * 0.5), 0.0, 1.0);
  o.sd = vec2f(cx, cy);

  // brightness: heavy-tailed per-grain mass × energy spread over its footprint
  let hm = rnd(ii, 0xA55u);
  let mass = mix(1.0, 0.45 + U.massSpread * pow(hm, 7.0) + 0.6 * hm, tint);
  let focusSpread = min(1.0, (w0 * w0 + 0.25) / (4.0 * r * r));          // bokeh is dim: energy conserved
  let lenSpread = pow((2.0 * r) / (2.0 * r + L), U.streakConserve);      // long streaks share their light
  let cover = min(w0, 1.0);
  let I = lum * mass * focusSpread * lenSpread * cover * mix(1.0, U.gain, tint);

  let hue = mix(vec3f(U.colR, U.colG, U.colB), vec3f(U.col2R, U.col2G, U.col2B), P.c.w);
  let col = mix(REST_WHITE, hue, tint * (1.0 - U.monochrome));
  o.col = col * I;
  o.geo = vec4f(L, r, coc, mix(1.0, U.taper, tint));
  o.fx = vec4f(P.c.z, U.sparkle * tint * step(coc, 1.5), hm * 40.0, max(0.55, coc * 0.3));
  return o;
}

@fragment
fn fs(i: VOut) -> @location(0) vec4f {
  let L = i.geo.x;
  let r0 = i.geo.y;
  let coc = i.geo.z;
  let s = i.sd.x;
  let t = clamp(s / max(L, 1.0), 0.0, 1.0);
  // tapered capsule: full radius at the head, thinner toward the tail
  let rr = max(r0 * mix(1.0, i.geo.w, t), 0.5);
  let ds = max(max(-s, s - L), 0.0);
  let dist = length(vec2f(ds, i.sd.y));
  let soft = i.fx.w;
  var a = 1.0 - smoothstep(rr - soft, rr + soft, dist);
  // lens bokeh: slightly brighter rim on out-of-focus discs
  if (coc > 2.0) { a *= 0.8 + 0.45 * smoothstep(rr * 0.35, rr * 0.95, dist); }
  // head burns hot, tail cools
  let along = mix(1.0, 0.18, pow(t, 0.8));
  // spark flicker: irregular bursts along the path (two incommensurate waves, per-grain rate)
  let fr = 0.08 + 0.25 * fract(i.fx.z * 0.618);
  let wv = sin(s * fr + i.fx.z) + 0.7 * sin(s * fr * 2.71 + i.fx.z * 1.7);
  let flick = mix(1.0, 0.35 + 1.3 * smoothstep(0.2, 1.4, wv), i.fx.y * step(r0 * 3.0, s));
  // white-hot core near the head
  let core = i.fx.x * exp(-dist * dist / max(rr * rr * 0.6, 0.3)) * (1.0 - t);
  let hotCol = mix(vec3f(1.0, 0.55, 0.22), vec3f(1.0, 0.9, 0.75), i.fx.x);
  let lum = max(max(i.col.r, i.col.g), i.col.b);
  let col = mix(i.col, hotCol * lum, clamp(core, 0.0, 0.9));
  return vec4f(col * a * along * flick, 0.0);
}
