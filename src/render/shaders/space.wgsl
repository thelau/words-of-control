// SPACE — the data in 3D (show/space.ts): points as small round dots and line segments, added onto the grid pass in
// the step's rectangle. A vertex's w: its palette slot (integer part: 0 white, 1… the marked cells' colours) and
// its brightness (fraction). Depth dims what is far.

struct Cam { vp: mat4x4f, pal: array<vec4f, 9>, px: vec4f }; // px: point size, viewport w, h (device px)
@group(0) @binding(0) var<uniform> C: Cam;

struct VOut { @builtin(position) pos: vec4f, @location(0) col: vec3f, @location(1) uv: vec2f };

fn tint(w: f32, depth: f32) -> vec3f {
  let c = C.pal[u32(w)].rgb * fract(w) * 1.5 * clamp(1.8 - depth / 5.0, 0.2, 1.0);
  return pow(c, vec3f(1.0 / 2.2)); // (the canvas is not sRGB; additive light is close enough in this space)
}

@vertex
fn vs_point(@builtin(vertex_index) vi: u32, @location(0) p: vec4f) -> VOut {
  var corners = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(1, 1), vec2f(-1, -1), vec2f(1, 1), vec2f(-1, 1));
  let q = corners[vi];
  var clip = C.vp * vec4f(p.xyz, 1.0);
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
fn fs_line(v: VOut) -> @location(0) vec4f { return vec4f(v.col, 1.0); }
