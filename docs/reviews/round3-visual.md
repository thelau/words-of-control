# Visual review, round 3 (2026-09-23)

**Score: 6.5/10, up from about 5 in round 2.** Round 2's structural fixes landed (neutral film, halation, spark cones, scan, plate, macro framing). The macros are now the best images: the fissured relief in *scream*, the dunes in *thunder*. What holds the piece back is detail: three looks read as graphics, not matter (fracture as a circuit diagram, plate as an emblem, scan as Joy Division).

Note: `docs/captures/review3/` mixes two runs (`knife-05-shot1-fracture-a` and `knife-05-shot1-scan-a`; same for *scream*), so the sheets misstate the edit. Clear the folder before each capture.

## Per clip

**Relief: mid-high.** Mirror gone; the macros are at the bar (*scream* 13, 15). The wide shot is still a small frontal slab of crumpled tinfoil (*mother*); at pitch 0.1 there are no sides and no silhouette.

**Fracture: below the bar, and different from round 2.** The neon star is gone; four new problems:
- The radial `broken` gate draws a **large visible disc** (*glass*, *fuck*, *scream*).
- `jag()` sums smoothsteps, which gives **stair-step offsets**. Those read as PCB traces.
- The crack plus a bevel at `lw·1.6` makes **double parallel lines**, which look like a vector drawing.
- The impact hash-dots make a small **asterisk glyph** that sits in every macro frame.

Flat grey shards (0.006–0.018 linear) read as matte plastic. *fire* gets two fracture shots with orange seams: wrong category.

**Grains: mid.** The cones fixed the hyperspace look, but:
- A uniform angular spread makes a **hard-edged wedge**. In *fuck* 6 there is a vertical edge plus the floor line.
- A field of **grey radial streaks** still fills the background: the non-spark grains.
- The floor is a lit horizontal line.

Dust is now subtle and good.

**Haze: mid-high.**
- *afternoon*: slats and mood right, but zebra-regular, with no surface to land on. *nothing*: right.
- **Water:** real cusps, but thick, blurred filaments; `q·1.012`/`q·0.988` is a cheap lens-style RGB split. In macro (*海* 6, 7) it magnifies into plasma tubes.

**Scan: mid.** Strong idea, but the contours cross with no hidden-line removal: *Unknown Pleasures* in red (*knife*), an oscilloscope in green (*asdfgh*). The high-frequency relief height makes them jitter like a seismograph.

**Plate: mid.** The *thunder* macros are beautiful. The wide shot is a centred tile, and every plate has **the same diagonal slash** (six words): `a − b` is antisymmetric, so x = y is always nodal. With no albedo grain the sand reads as plaster; *forever* reads as a Celtic ornament.

**Appraisal cuts: at the bar**, except scatter. For short words the return map is 3–6 lines in an empty box.

## Six fixes, ranked

**1. Fracture reads as glass, not a diagram (`fracture.wgsl`).**
- **No disc.** Gate the tilt per shard: the shard is broken when `front·R.y > r` for both of its bounding rays `k0` and `k1`. Make the base tone independent of `broken`.
- **Kinks, not steps.** Make `jag` = Σ slopeᵢ·max(r − rᵢ, 0), so the ray bends and never offsets.
- **One bevel.** Put a single 0.5 px bevel on one side of the crack only: `sign(wrapA(th − R.x))` against the light.
- **Impact.** Replace the gnoise dots with 30–60 hashed micro-rays of length 0.02–0.08.
- **Tone.** Base 0.002. Add a broad second reflection per shard (`0.04·ss(−1, 1, dot(p + nrm·4, D2))`), so the shards separate by *reflected tone*, not flat grey.

**2. Director: the right matter (`director.ts` `affinity`).**
- Fracture: add `− m.fire − m.smoke − 0.5·m.water`.
- Grains: add `+ m.fire·0.8 + mo.rising·0.6`, so *fire* gets rising embers.
- Enforce "a family at most twice" with a test.

**3. Sparks: soft cones, a clean background (`grains.wgsl`, `grains_draw.wgsl`).**
- In `coneDir`, use a gaussian angle: `(rnd+rnd+rnd−1.5)·half·0.9`.
- In sparky words, don't light non-spark grains: `lit *= 1 − sparky·(1 − burst)`.
- Move the floor to `y < −0.9` (just out of frame in the wide shot). Only the bounced sparks re-enter.

**4. Plate: no slash, no emblem (`plate.wgsl`, `plate_draw.wgsl`).**
- Modes: `cos(φ)·a + sin(φ)·b`, with φ from a byte. Better still, use free-edge `cos(mπx)cos(nπy)` terms.
- Albedo: multiply the sand by `0.85 + 0.3·hash(cell·2)` for grain-scale albedo, and gate the glints by `lit⁴`.
- Framing: open the plate in oblique macro (reuse the relief's camera and marcher over the sand buffer), never as a centred tile.

**5. Scan: occlusion and calm (`scan.wgsl`, the renderer's blend state).**
- **Hidden lines.** Draw each strobed contour opaque over a band from `yl` to `yl + 1/n` (black below the line, alpha 1), with blend `src + dst·(1 − a)`.
- **Height.** Sample a low-passed height (a 5-tap blur, or a mip at LOD 3).
- **Crossings.** Clamp `K ≤ 1.4/n` so contours never cross.
- **Colour.** A white core; the accent only on the live beam.

**6. Caustics: sharp and physical (`haze.wgsl`).**
- **Dispersion.** Disperse in `k` (`k·0.97, k, k·1.03`), not in scale.
- **Sharpness.** Tonemap `focus³/(1 + focus²·0.3)`.
- **Macro.** In macro, add a wave octave at 3× frequency instead of magnifying.
- **Floor.** Add a faint lit floor, `0.01·(0.7 + 0.3·fbm(p·30))·(1 + cz)`, so the light lands on something.
- **Cost.** About +30 ALU ops, under 0.5 ms.

Next: the wide relief shot needs pitch 0.3–0.45 so the silhouette and sides show.
