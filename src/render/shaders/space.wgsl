fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}

// SPACE — the data in 3D (show/space.ts): points as small round dots and line segments, added onto the grid pass in
// the step's rectangle. A vertex's w: its palette slot (integer part: 0 white, 1… the marked cells' colours) and
// its brightness (fraction). Depth dims what is far; a negative word makes every point tremble (fx.y).

// px: point size, viewport w, h (device px); fx: time, unrest, camera distance, brightness
struct Cam { vp: mat4x4f, pal: array<vec4f, 9>, px: vec4f, fx: vec4f };
@group(0) @binding(0) var<uniform> C: Cam;

struct VOut { @builtin(position) pos: vec4f, @location(0) col: vec3f, @location(1) uv: vec2f };

fn tint(w: f32, depth: f32) -> vec3f {
  let c = C.pal[u32(w)].rgb * fract(w) * 0.55 * clamp(1.7 - 0.7 * depth / C.fx.z, 0.25, 1.0);
  // (linear light, added up: the monitor rolls off where it crowds)
  return c * C.fx.w;
}

@vertex
fn vs_point(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32, @location(0) p: vec4f) -> VOut {
  var corners = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(1, 1), vec2f(-1, -1), vec2f(1, 1), vec2f(-1, 1));
  let q = corners[vi];
  let h = pcg(ii ^ pcg(u32(C.fx.x * 30.0)));
  let j = (vec3f(f32(h & 1023u), f32((h >> 10u) & 1023u), f32((h >> 20u) & 1023u)) / 511.5 - 1.0) * C.fx.y * 0.012;
  var clip = C.vp * vec4f(p.xyz + j, 1.0);
  clip = vec4f(clip.xy + q * C.px.x / C.px.yz * clip.w, clip.zw);
  return VOut(clip, tint(p.w, clip.w), q);
}

@fragment
fn fs_point(v: VOut) -> @location(0) vec4f {
  let a = clamp((1.0 - length(v.uv)) * C.px.x, 0.0, 1.0);
  return vec4f(v.col * a, 1.0);
}

@vertex
fn vs_line(@location(0) p: vec4f) -> VOut {
  let clip = C.vp * vec4f(p.xyz, 1.0);
  return VOut(clip, tint(p.w, clip.w), vec2f(0.0));
}

@fragment
fn fs_line(v: VOut) -> @location(0) vec4f { return vec4f(v.col * 0.5, 1.0); } // (lines quieter than points: they add up)
