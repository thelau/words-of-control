const TAU: f32 = 6.28318530718;

fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}

struct FsOut { @builtin(position) pos: vec4f };

@vertex
fn vs_full(@builtin(vertex_index) vi: u32) -> FsOut {
  let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  return FsOut(vec4f(p * 2.0 - 1.0, 0.0, 1.0));
}
