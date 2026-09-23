// GRAINS (drawing) — each grain as light: a velocity streak with depth of
// field, additive into the persistence buffer. Reads the simulation's buffer.

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var<storage, read> G: array<vec4f>;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) sd: vec2f,
  @location(1) @interpolate(flat) geo: vec3f, // L, radius, soft
  @location(2) @interpolate(flat) col: vec3f,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var o: VOut;
  let A = G[ii * 2u];
  let B = G[ii * 2u + 1u];
  let res = vec2f(F.resX, F.resY);
  let ppu = min(res.x, res.y) * 0.5;
  let head = A.xy * ppu;
  let vel = A.zw * ppu;
  let exposure = F.dt + mix(0.002, 0.012, F.s_energy);
  var tail = vel * exposure;
  let L0 = length(tail);
  let L = min(L0, res.y * 0.22);
  let axis = select(vec2f(1.0, 0.0), tail / max(L0, 1e-4), L0 > 0.01);
  let nrm = vec2f(-axis.y, axis.x);
  // depth of field: a few grains near the lens become soft discs
  let coc = B.z * mix(10.0, 26.0, F.m_smoke + F.m_void * 0.5) * F.dpr / (1.0 + L0 / (5.0 * F.dpr));
  let size = B.y * mix(1.4, 0.8, F.s_hardness) * mix(1.0, 2.2, F.m_smoke) * F.dpr * 0.6;
  let r = max(size * 0.5, 0.5) + coc;
  let mg = r + 1.5;
  let cx = select(-mg, L + mg, (vi & 1u) == 1u);
  let cy = select(-mg, mg, (vi & 2u) == 2u);
  let px = head - axis * cx + nrm * cy;
  o.pos = vec4f(px.x / (res.x * 0.5), px.y / (res.y * 0.5), 0.0, 1.0);
  o.sd = vec2f(cx, cy);
  o.geo = vec3f(L, r, max(0.6, coc * 0.3));
  // colour by matter: fire hot, sand warm, ice cold, smoke grey, light gold
  let fire = F.m_fire + F.m_metal * 0.4;
  var col = vec3f(F.baseR, F.baseG, F.baseB);
  col = mix(col, vec3f(1.0, 0.45, 0.14) * (0.7 + 0.8 * B.w), clamp(fire * 1.4, 0.0, 1.0));
  col = mix(col, vec3f(0.95, 0.78, 0.55), clamp(F.m_sand * 1.4, 0.0, 1.0));
  col = mix(col, vec3f(0.7, 0.85, 1.05), clamp(F.m_ice * 1.4, 0.0, 1.0));
  col = mix(col, vec3f(1.0, 0.82, 0.5), clamp(F.m_light, 0.0, 1.0));
  // the rare grain carries the accent
  col = select(col, vec3f(F.accR, F.accG, F.accB) * 1.6, B.x > 0.994);
  let mass = 0.4 + 4.0 * pow(B.x, 12.0);
  let spread = min(1.0, (size * size + 0.25) / (4.0 * r * r)) * pow(2.0 * r / (2.0 * r + L), 0.35);
  // most grains are faint; a few heavy ones carry the light (black stays black between them)
  // bursts are a few thousand bright sparks in black; drifting dust needs many faint grains to form filaments
  let burst = clamp(F.mo_spreading + F.mo_breaking + F.mo_rising * 0.6, 0.0, 1.0);
  let keep = mix(0.45, 0.95, burst);
  let lit = step(keep, fract(B.x * 7.31));
  let gain = mix(0.06, 0.2, F.s_intensity) * mix(1.0, 4.0, burst);
  o.col = col * B.w * mass * spread * min(size, 1.0) * gain * lit;
  if (B.w < 0.003) { o.pos = vec4f(2.0, 2.0, 2.0, 1.0); }
  return o;
}

@fragment
fn fs(i: VOut) -> @location(0) vec4f {
  let L = i.geo.x;
  let r = i.geo.y;
  let s = i.sd.x;
  let t = clamp(s / max(L, 1.0), 0.0, 1.0);
  let rr = max(r * mix(1.0, 0.4, t), 0.5);
  let ds = max(max(-s, s - L), 0.0);
  let dist = length(vec2f(ds, i.sd.y));
  let a = 1.0 - ss(rr - i.geo.z, rr + i.geo.z, dist);
  return vec4f(i.col * a * mix(1.0, 0.2, pow(t, 0.8)), 0.0);
}
