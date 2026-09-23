// Matter: every grain deposits its mass into a density field (bilinear,
// fixed-point atomics). The field is then lit as a surface in composite.

@group(0) @binding(0) var<uniform> U: Uniforms;
@group(0) @binding(1) var<storage, read> parts: array<Particle>;
@group(0) @binding(2) var<storage, read_write> dens: array<atomic<u32>>;

const FIX: f32 = 256.0;

fn dep(x: i32, y: i32, w: f32) {
  let mw = i32(U.matterW);
  let mh = i32(U.matterH);
  if (x < 0 || y < 0 || x >= mw || y >= mh || w <= 0.0) { return; }
  atomicAdd(&dens[u32(y * mw + x)], u32(w * FIX + 0.5));
}

@compute @workgroup_size(256)
fn splat(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (f32(i) >= U.count) { return; }
  let P = parts[i];
  // world → matter-pixel coordinates (origin top-left, y down)
  let s = U.matterW / U.resX;
  let q = (vec2f(P.a.x, -P.a.y) * U.pxPerUnit + vec2f(U.resX, U.resY) * 0.5) * s;
  let f = fract(q - 0.5);
  let b = vec2i(floor(q - 0.5));
  let m = 0.6 + 0.8 * fract(P.b.z * 13.7); // grain size variety
  dep(b.x, b.y, (1.0 - f.x) * (1.0 - f.y) * m);
  dep(b.x + 1, b.y, f.x * (1.0 - f.y) * m);
  dep(b.x, b.y + 1, (1.0 - f.x) * f.y * m);
  dep(b.x + 1, b.y + 1, f.x * f.y * m);
}

@group(0) @binding(3) var outTex: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(16, 16)
fn resolve(@builtin(global_invocation_id) gid: vec3u) {
  let mw = u32(U.matterW);
  let mh = u32(U.matterH);
  if (gid.x >= mw || gid.y >= mh) { return; }
  let d = f32(atomicLoad(&dens[gid.y * mw + gid.x])) / FIX;
  textureStore(outTex, vec2i(gid.xy), vec4f(d, 0.0, 0.0, 1.0));
}
