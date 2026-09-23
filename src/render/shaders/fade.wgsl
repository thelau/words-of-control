@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
// Output is ignored; blending does dst *= constant (the persistence decay).
@fragment
fn fs() -> @location(0) vec4f { return vec4f(0.0); }
