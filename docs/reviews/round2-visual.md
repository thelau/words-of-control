# Visual review, round 2 (2026-09-23)

## Verdict

The rebuild fixed the structure. **The appraisal and the relief are close to the bar. Fracture and the grains burst are well below it.** Today, fracture reads as a neon starburst and the burst as warp/hyperspace, and those are the two looks the artist banned. Three issues cut across every family:

1. **Everything is a 360° radial event at dead centre.** The centre rule has turned into a vanishing point. *knife* and *scream* are three near-identical stars each.
2. **Light is emitted, never reflected.** Cracks glow, sparks glow, haze glows. Only the relief is *lit*.
3. **One grade for everything.** `film()` warms every channel ×(1, .92, .85) and bloom is tinted (1, .72, .55), so glass, water and ice come out sepia.

## Per family

**Appraisal: near the bar.** *At the bar:* the barcode (keep the red accents), the spectrum, the bits reveal, the inverted cream numbers frame (the best image in the set), the closing line. *Not yet:* `tv()` wraps modulo `tapeLen`, so numbers columns visibly repeat. In *knife*, columns 2 and 9 carry the same sequence, and "0.0000" dominates. Numbers scroll at sub-pixel offsets through a linear sampler, which blurs the glyphs and reads as a "Hollywood terminal". Scatter is 56 dots in an empty box and reads as a broken chart. *Change:* #6.

**Relief: closest to video-d, but still a photo of tinfoil.** *At the bar:* the raking sweep, the cast-shadow march and the cavity term. *Not yet:*
- `if (s_order > .62) q.x = abs(q.x)` makes Rorschach faces (*mother*, *kiss*). That is pareidolia, and it is a gimmick.
- It is a flat top-down square with a uniform single-octave-band frequency (crumpled paper). There is no mass hierarchy and no silhouette.
- video-d's surface is an **object**: oblique view, silhouette, dark sides, portrait proportion, data-driven morph.

*Change:* #4.

**Fracture: below the bar.** The cracks are uniform-width, self-luminous and warm-bloomed, so they read as neon tubes or a firework. `count = 9..22` with angles evenly spaced gives a star. Glass reads as broken only through **discontinuity of a reflection across the crack**. *Change:* #1.

**Grains, burst: below the bar.** 360° straight streaks from the centre fill the frame: hyperspace. *Change:* #2.

**Grains, dust (drifting): mid.** Curl filaments are good as motion. As an image they read as fur or a neural web, because every grain is lit everywhere. *Change:* #7.

**Grains, fire: broken.** The `rising` spawn at y = −1.05 is visible, so it draws a lit wall along the bottom edge (*fire*, *almost*). Heat is decayed by the global `exp(-t·.6)`, not per grain. Spawn below frame (y < −1.3). Give each grain an age, and colour it blackbody 1900 K→900 K over a 0.4–1.2 s lognormal life.

**Grains bug: the white sun.** The default spawn is `tight knot` (trembling, plus the float-sum fallthrough), and `born` only compensates spreading and breaking. *ocean* frame 3 and *almost* frame 3 are central suns. Always apply `born` to the knot, and clamp `pick` to `acc − ε`.

**Haze light (indifference): mid.** The fbm clouds inside a gaussian band read as a nebula, not a shaft of sun. Real shafts have hard, gobo-shaped edges, parallel striations along the axis, and motes that exist only *inside* the light. *Change:* #7.

**Haze water: below the bar.** A soft grey web, like a 2005 plasma screensaver. Caustics are **cusps with huge dynamic range**. *Change:* #8.

**Haze smoke, void: acceptable.**

**Room: at the bar.** Keep it.

**Composite: mid.** Grain and shoulder are good. The problems are the global warm grade, bloom as a haze instead of halation, and the lifted black `BG` on the data cuts. *Change:* #5.

## Top 10, ranked

**1. Fracture as lit glass shards (`fracture.wgsl`).**
- **Shard id:** the sector `k0` (already computed for the bridges), plus a ring index `j`, which is the number of kept bridges with `Rj < r`.
- **Shard normal:** `n = normalize(vec3(hash2(k0,j)·tilt, 1))`, with `tilt = 0.04 + 0.12·s_intensity·ss(0, .3, r)`.
- **Surface:** the plate is near-black glass reflecting one softbox strip: `strip = ss(w, 0, abs(dot(p + n.xy·2.5, D) − sweep(t)))`, with `w ≈ 0.08`, D a diagonal, and `sweep` crossing the frame over the shot.
- **Read:** every shard offsets the strip differently, so the reflection breaks at each crack. That is what makes it glass.
- **Crack lines:** make them a 1 px *dark* gap plus a 1 px bevel highlight on the light-facing side only: `bevel = max(dot(crackNormal2D, L.xy), 0)`.
- **Structure:** keep 5–9 primary rays with uneven angles (`fractureRays.ts`: jitter 0.8 → 2.5 of the slot), and make bridges denser near the impact.
- **Metal and knife:** use `sh_point` or `m_metal` for one straight cleave (2 rays, 180°, one kink), not a star.
- **Cost:** ~12 ALU ops per pixel.

**2. Sparks, not warp (`grains.wgsl` spawn and sim, `grains_draw.wgsl`).**
- **Emission:** in a cone (half-angle 25–60°, oriented by motion: falling ↓, rising ↑, breaking = 2–3 cones), never 360°.
- **Forces:** gravity `−1.6` plus drag 0.8. Add a floor at `y = −0.62`: reflect `v.y·−0.35` and scatter `v.x` by ±30% (grinder sparks: the bounce kink sells physics).
- **Splitting:** 3% of sparks split once, flagged via the `hot` bit, with a 30° child offset.
- **Light:** only 800–2500 lit (`keep` 0.95 → 0.985). Use lognormal brightness and per-age blackbody colour. Raise persistence to 0.95 for sparks.
- **Streaks:** cap streak length at `res.y·.06` (now `.22`). That cuts overdraw roughly 3× and pays for everything above.

**3. Framing grammar: shots, not repeats (`director.ts`, all clip shaders).**
- Add `zoom` and `off` to `FrameU`. Every clip maps `p = p/zoom + off`.
- When the director repeats a family, it must change scale: wide (1) → macro (3–6, `off` on a crack or ridge) → wide. This is video-d's monolith/close alternation.
- Also flip the light side between repeats (`variant`).

**4. Relief as a monolith (`relief.wgsl`).**
- **Remove the `abs(q.x)` mirror.** For "ordered", express it through terraces only.
- **Height:** `h = .6·macro(q·.7) + .3·ridged(q·f) + .1·fine(q·4f)·|∇macro|` (detail concentrates on slopes).
- **Render:** raymarch the heightfield from an oblique camera (pitch 20–35°, orbit ±6° over the shot), 40 linear steps plus 5 bisection steps against `hTex`. Extrude toward the camera so the top edge is a jagged silhouette. Draw the slab's sides at 0.15 albedo.
- **Proportion:** portrait (aspect 0.55) for tall or heavy words.
- **Cost:** the slab covers about 40% of the CSS pixels, so ≈0.8M px × 45 fetches ≈ 1.2 ms. Cut the shadow march from 28 to 16 taps (−0.3 ms).

**5. Neutral pipeline, per-clip light (`composite.wgsl`, `main.ts`).**
- `film()`: remove the ×(1, .92, .85) warm bias. Colour comes from the clip.
- Replace the tinted bloom with **halation**: threshold mip 1 above 1.0, tint (1, .35, .15), weight 0.06. Keep a neutral bloom at ≤0.08. Fracture bloom 0.2 → 0.05.
- **Appraisal:** BG pure 0, no vignette. Ikeda is flat.
- **White balance:** cold for glass, ice and water (≈ .85, .95, 1.1), warm only for fire, sand and afternoon.

**6. Data rigour (`appraisal.wgsl`, `director.ts`).**
- **No wrapping.** Derive each mode's layout from `tapeLen`, so every value appears exactly once: numbers `cols = ceil(tapeLen/rows)`, bits `side = ceil(sqrt(bytes·8))`. Past the end is black.
- **Numbers:** scroll in integer pixels (`floor(scroll/dpr)·dpr`) and use `textureLoad` on the atlas (nearest). Add one scanning highlight row in the accent.
- **Replace scatter** with a *return map*: all byte pairs (bᵢ, bᵢ₊₁) as 1 px points, joined in order by 0.5 px lines, drawn progressively.

**7. Light defines matter (`grains_draw.wgsl` + haze light).**
- **Grains:** give them a z (`B.z` already exists). Light a grain only inside a light slab: `inSlab = ss(w, 0, abs(dot(vec3(p, z), N) − d))`, plus forward-scatter `pow(max(dot(v̂, L), 0), 8)` glints. Motes blink as they cross the light.
- **Haze shaft:** replace the fbm blobs with a gobo:
  - `across`-only noise (`fbm(vec2(across·14, t·.03))`) stretched along the axis gives striations.
  - Add a hard edge (`ss(.0, .015, …)`) with penumbra widening along the length.
  - Add a dappled pool where it meets the floor.
- **Direct haze-light words** to *grains + light slab* at 40k grains, instead of hashed motes (≈1.5 ms).

**8. Real caustics (`haze.wgsl` `caustic`).**
- **Waves:** a water height as a sum of 6 travelling sines. The Hessian `Hs` is analytic.
- **Intensity:** `I = 1/|det(I₂ + k·Hs)|`, with k 0.3–0.9 by `s_intensity`.
- **Tonemap:** `I/(1+I·.15)`, then add 3-tap RGB dispersion (k ± 4%).
- **Result:** sharp cusps and a dark floor, cold. About 60 ALU ops per pixel, under 0.4 ms.

**9. Grains correctness.** Fix the white sun and the bottom wall, and add per-grain age (see "Grains" above). Removes the two worst frames.

**10. Hand-off: the appraisal becomes the matter.**
- The last reading persists 150 ms into the first shot:
  - bits → relief: extrude the bit grid as terraces that erode, `h += .08·bit·(1−ss(0, .8, u))`.
  - line → fracture: the closing line *is* the first crack. Force ray 0 horizontal and let it race first.
- video-d's data→relief transition, with *this word's* bytes.

## Two new families

**A. Sand plate (lit granular heightfield).** This is the missing "lit granular matter", with sand-rings.jpg as ground truth.
- **Buffer:** 512² r16f sand height.
- **Driver** (by motion and shape), advecting sand toward low-|mode| lines: a Chladni mode `sin(mπx)sin(nπy) ± …` with m, n from the byte pairs (ordered words), a single stylus spiral, or wind ripples (drifting).
- **Relaxation:** 3 passes of angle-of-repose per frame (move `(Δh − tanθ·dx)/4` downhill, θ ≈ 33°).
- **Render:** the relief shader (raking light, shadows), plus per-texel glints `pow(hash·n·H, 300)` so individual grains flash.
- **Cost:** 0.4 ms sim + 1.3 ms shading.

**B. Structured-light scan ("the machine reading the surface").**
- **Setup:** black frame. One 1 px laser line (accent colour) sweeps top→bottom, bent by a hidden heightfield: `y' = y + h(x, y)·k`. It uses the same `hTex` as the relief.
- **Exposure:** a long-exposure buffer (the existing trail, persist 0.985) keeps fading copies, so the form builds up as contour lines.
- **Edit:** cut from it to the relief itself for the reveal.
- **Cost:** 1 fullscreen pass plus the trail, under 1 ms.
- **Value:** Ikeda rigour applied to matter; it *is* the machine reading.
