// ATLAS — the word as a specimen (show/atlas.ts, painted by render/atlasPaint.ts). Shows the plate F.variant2 at
// native resolution; each of its items is wiped in at its time (left to right, a bright scan line at the edge);
// everything outside the items (titles, frames, the border's scale) appears at once. A pixel's item is read
// from the plate's blue channel (atlasPaint.ts); an item the machine doubts wavers. Two inks: white (the painted
// red channel) and red (the green channel), the red breathing slowly.

@group(0) @binding(0) var<uniform> F: FrameU;
@group(0) @binding(1) var plates: texture_2d_array<f32>;
@group(0) @binding(2) var<storage, read> R: array<vec4f>; // per plate, 64 items × 2: rect | t, dur, red, doubt

const MAX_ITEMS = 64u;

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let res = vec2f(F.resX, F.resY);
  let uv = fc.xy / res;
  let plate = u32(F.variant2 + 0.5);
  let tex = textureLoad(plates, vec2i(fc.xy), i32(plate), 0);
  var px = tex.rg;
  var show = select(0.0, 1.0, F.lt > 0.06); // (annotations: at once, after one frame of black)
  var scan = 0.0;
  // the pixel's item (its number + 1 is painted in blue over its rect)
  let item = u32(round(tex.b * 255.0));
  if (item > 0u && item <= MAX_ITEMS) {
    let a = R[(plate * MAX_ITEMS + item - 1u) * 2u];
    let b = R[(plate * MAX_ITEMS + item - 1u) * 2u + 1u];
    let prog = clamp((F.lt - b.x) / max(b.y, 1e-3), 0.0, 1.0);
    let fx = (uv.x - a.x) / max(a.z - a.x, 1e-4);
    show = step(fx, prog);
    // doubt: the answer the machine is unsure of is out of focus, and wavers — drifting sideways, slowly
    let doubt = b.w;
    if (doubt > 0.05) {
      let o = vec2i(vec2f(round(sin(F.time * 1.3 + f32(item) * 2.1) * doubt * 3.0 * F.dpr), 0.0));
      let r = doubt * 1.6 * F.dpr;
      var acc = vec2f(0.0);
      for (var k = 0; k < 8; k++) {
        let a = f32(k) * 0.785398 + 0.3;
        acc += textureLoad(plates, vec2i(fc.xy) + o + vec2i(round(vec2f(cos(a), sin(a)) * r)), i32(plate), 0).rg;
      }
      px = mix(px, acc / 8.0, min(1.0, doubt * 1.5));
    }
    // the scan line: a thin bright edge travelling with the wipe, gone once it has passed
    scan = exp(-pow((fx - prog) * (a.z - a.x) * res.x / 2.0, 2.0)) * step(prog, 0.999) * step(0.001, prog);
  }
  let white = vec3f(0.93, 0.91, 0.88);
  let red = vec3f(1.0, 0.1, 0.04) * (0.8 + 0.2 * sin(F.time * 2.4));
  let c = (white * px.r + red * px.g) * show + white * scan * 0.9;
  return vec4f(c, 1.0);
}
