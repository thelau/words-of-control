// LIGHT — a verdict species (placeholder: to be built). The plug-in contract (gpu.ts, src/show/species/types.ts):
//   setup() — compute, groups × 128 threads, once a frame: may keep any state in SW (read_write, persists across
//             frames; F.mode > 0.5 on the species' first frame of a performance: start fresh)
//   fs()    — the frame (CSS resolution): colour, and its blur for the lens in alpha (px, 0..16); reads S (the same
//             buffer as SW) and prev (its own last frame, for trails: ignore it when F.mode > 0.5)

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var<storage, read> tape: array<f32>;
@group(0) @binding(2) var<storage, read_write> SW: array<vec4f>;
@group(0) @binding(3) var<storage, read> S: array<vec4f>;
@group(0) @binding(5) var prev: texture_2d<f32>;
@group(0) @binding(6) var lin: sampler;

@compute @workgroup_size(128)
fn setup(@builtin(global_invocation_id) id: vec3u) {
  if (id.x == 0u) { SW[0] = vec4f(F.vt); }
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let res = vec2f(F.resX, F.resY);
  let uv = fc.xy / res;
  let old = textureSampleLevel(prev, lin, uv, 0.0).rgb * select(0.9, 0.0, F.mode > 0.5);
  let d = length(fc.xy - res * 0.5) / res.y;
  return vec4f(max(old, vec3f(ss(0.02, 0.0, abs(d - 0.2 - 0.05 * sin(S[0].x))))), 0.0);
}
