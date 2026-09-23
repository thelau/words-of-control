// Copy (with optional decay into the persistence buffer) — fullscreen.
@group(0) @binding(0) var src: texture_2d<f32>;

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  return textureLoad(src, vec2i(fc.xy), 0);
}
