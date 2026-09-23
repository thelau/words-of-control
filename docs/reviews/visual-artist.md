# Visual craft review — 2026-09-23

## Verdict

Anger is close to the storyboard and the engine is right. **The "matter" does not yet read as matter.** It reads as fine pixel noise, fog, or dotted concentric bands. Three root causes:

1. **Matter is shaded as a blurred density field, not as grains.** `splat.wgsl` deposits bilinearly at 0.6× CSS resolution (~3 grains per texel), and `composite.wgsl` takes its normals from mip 2. Sand, glitter and pigment need **individually resolvable grains, lit by a macro surface, with black gaps between them**.
2. **No shadows, and speculars that ignore the light.** The raking light (`lightH 0.07`) is the right idea, but a raking light only reads through cast shadow. The `glint` in `sim_main.wgsl` is `pow(sin(time), 90)`. That is random twinkle, not light catching facets.
3. **Everything turns into a bullseye.** `mRing·sin(2kr)` makes perfect concentric sinusoids, and calm, awe, sadness, anxiety and joy all use it. Five peaks look like a target. Real sand rings (`sand-rings.jpg`) are broken, uneven, overlapping, and cast shadows.

There are also two recurring artefacts:
- **The return phase draws a rectangle** (fear, joy, playful, anxiety, frame 6). Homes come from a box (`makeParticles`: x ±2.3, y ±1.08). Lit grains stay bright while they fly straight home, so they trace the box.
- **Emissive pile-ups blow out to featureless white discs**: tender peak, fear release/peak, playful ribbons, the joy/anger ignition blobs. Additive blending without density normalisation makes a sticker.

Typing (frame 1) is a full-frame radial hairball on every sheet.

## Per-emotion notes

**Anger.** *Works:* the jagged ring (release), radial streak fountain (peak), ember phase. *Generic/broken:* a grey matter halo behind the ring reads as fog, which the refs reject. Peak shows triangular wedge sectors. Embers are fat bokeh discs (`anger_emberSize 6`); ignition is a soft bloom ball, not the storyboard's tight core with needle sparks. *Better:* after the ring shatters, leave the **matter as a lit crater rim with dark radial fissures** (video-a frames 3–5). Embers at 2–3 px, lognormal brightness.

**Calm.** *Works:* palette, slow spin. *Generic:* bullseye rings plus a blown "hair vinyl" disc. *Better:* a **Keplerian shear disc**. Matter rotates with ω ∝ r^-1.5, so the existing density noise shears into long spiral striations (video-c). A few hundred emissive grains draw long arcs.

**Tender.** *Works:* the intimacy of scale. *Broken:* the peak is a white disc. *Better:* matter drifts inward into a **soft mound at C, lit from inside**. Transmission is `exp(-σ·density)` outward from C, so the mound glows peach at thin edges and stays dark-mauve at its core. It breathes at 0.2 Hz.

**Joy.** *Works:* energy and gold. *Generic:* golden hairball, bullseye underneath. *Better:* a **glitter fountain**. Matter is thrown outward and up, and each grain tumbles, so its facet normal rotates with speed and it flashes only when it aligns with the light at C. Grains fall back ballistically toward C.

**Awe.** *Works:* stillness, silver. *Generic:* the most bullseye of all. *Better:* the **video-a crater**. One slow front clears a vast disc and piles the matter into a lit rim at r≈0.9. The interior holds sparse fine dust and the star, in a silver/indigo two-tone.

**Sadness.** *Works:* the tear idea. *Broken:* a neon white circle plus a solid rectangular curtain of vertical lines. *Better:* a **heavy matter ring whose lower arc slumps and drains** in 5–9 rivulets of unequal length (gravity × angular noise → fingering downward). Blue-grey on ink. The light dims through the phase. Emissive only at the rivulet tips.

**Fear.** *Broken:* a white sun, then a white rectangle on return. *Better:* matter **implodes into a dense dark knot**, backlit so only its trembling rim lights. The light is being smothered: lightI falls and flickers. On tremor peaks, 2–3 brief Lichtenberg filaments crack out of the knot.

**Anxiety.** *Works:* the wobble. *Generic:* a hairy amber donut on a bullseye. *Better:* an **unstable rim with Saffman–Taylor fingers** that grow, retract and never settle. Jitter on rim grains only; everything else still. Amber on olive-rust.

**Playful.** *Works:* the Lissajous idea. *Generic:* blown-out light-painting tubes. *Better:* **2–3 point vortices orbiting C** on Lissajous paths, **stirring matter into marbled two-tone curls** (pink/cyan flake). Emissive grains mark the vortex cores as short comets.

**Rest.** Box-distributed uniform specks read as a star field. Use a radial home distribution (below). Leave an almost-imperceptible ember at C (`restLight` ≈0.015) so the carpet's relief is barely there. Glints come from facets drifting slowly.

## Top-10 implementation recommendations (ranked)

**1. Render matter as lit grains using a compute point rasteriser.** This is the material fix.
- Keep the density splat (`splat.wgsl`), but only as the height source. Build mips 1–4 as now.
- Add a second compute pass, `shade_grains`, over all 1M grains. It samples `height = log(1+ρ)` from mip 2–3 at the grain, then computes macro normal N, shadow term S (#2), Lambert `max(N·L,0)·atten`, and facet spec (#6).
- Deposit the result at the **nearest pixel** at full backbuffer resolution: `atomicAdd` into three u32 fixed-point RGB buffers, or pack luminance plus a pigment index with `atomicMax`.
- At DPR 2 that is ~0.27 grains/px, so grains separate with black between them, like `sand-rings.jpg`.
- Per-grain albedo is lognormal (σ 0.5) from `pseed`.
- Delete the screen-space `gnoise` tone (composite L~71). It paints colour on the glass, not the material.

**2. Add raking-light cast shadows.** New half-res compute pass, or inline in #1 per grain.
- March from the point toward C through height mip 1: 12 steps with geometric step growth (×1.35, first step 2 texels).
- Shadow if `h(s) − h(p) > d·tan(elev)`, where `elev = atan(lightH·res.y / |toC|)`.
- Soft shadow: `S = min over samples of clamp(k·(d·tan − Δh)/d, 0, 1)` with k≈8.
- This one term turns rings into terrain.

**3. Feed density back into the sim.** Bind the previous frame's matter mip 1 to `sim_main.wgsl` (read-only texture). In `matterForce`:
- *Pressure:* `F += −kP·∇ρ/(ρ+ρ0)` with kP≈0.6. Grains pile at fronts and form rims and crater lips.
- *Density-dependent mobility:* scale the shock/push by `1/(1+ρ/ρ1)`. Combined with angular noise on push strength, `(1 + 0.4·fbm(8θ, 3r))`, this gives viscous fingering and iris fibres.
- *Anisotropic drag:* `drag_t = 6·drag_r` for iris/fibre emotions (anger, awe), so grains only move radially and leave fibres.
- *Stick–slip:* if `|v| < 0.02` and `|F| < μ·(1+ρ)`, set `v = 0`. Structures freeze like sand instead of springing back.

**4. Replace the sinusoidal ring field.** Remove `sin(2kr)` from `matterForce`. Rings come from **fronts that deposit** instead: 1–3 travelling shocks with decaying speed. Pressure (#3) piles each front into a ridge, and the front stalls where stick–slip wins. Break the fronts with `r_front(θ) = s·t·(1 + 0.08·fbm(3θ, seed))`. Map the fields to emotions: shock → anger/awe/joy; Keplerian shear → calm; slump → sadness; vortex stirring → playful; collapse → fear/tender; fingering rim → anxiety. Tune in `tuning.ts` `MATTER`.

**5. Two-tone pigment that is advected, not screen-space.** Give each grain a pigment id from coherent noise on its **home**: `pig = step(fbm(home·1.5 + seed), 0.5)`. Clumps then move and marble as the fields carry them. Splat two density channels (A/B; the atomic buffer doubles to 2×u32). Albedo = mix by ratio. Palettes (primary / shadow-secondary):

| Emotion | Primary | Secondary |
|---|---|---|
| anger | `#FF4B1F` | oxblood `#3A0A08` |
| calm | `#F2E6CF` | slate `#2B3440` |
| tender | `#F5B9A0` | mauve `#6E4A5A` |
| joy | `#FFC23D` | warm white + 5% teal flakes |
| awe | `#D9DEE8` | indigo `#1B2140` |
| sadness | `#7F95AD` | ink `#0E1622` |
| fear | `#C9E6C4` | bruise `#2A2238` |
| anxiety | `#C8903A` | olive `#4A4424` |
| playful | `#F7A8C4` | cyan `#7FD6E0` |

Add per-grain OKLab hue jitter of ±4°.

**6. Facet glitter speculars.** Replace the `gl = pow(sin(...),90)` glint in `sim_main.wgsl`.
- Each grain gets a facet normal `n_g` (hemisphere, biased up: z ≥ 0.3) from `pseed`.
- It rotates by angle `ω·t`, with ω ∝ |v|·(0.5+hash).
- `H = normalize(L + (0,0,1))`, `spec = pow(max(n_g·H,0), 400)·atten·S`.
- Lit only where the light can reach, so a moving front sweeps a band of sparkle. Write into `tLum` so the particle pass draws it as 1–2 px points.

**7. Stop the white discs.**
- In `particles.wgsl` `vs`, sample matter density at the grain and scale `I /= 1 + ρ_emissive/ρ0`. Or accumulate emissive count in a second small splat buffer and read that.
- Cap the ignition `anger_flash`/`joy` core radius.
- Give the emissive layer a hue-preserving shoulder (tonemap by max channel, keeping ratios) before `film()`, so only the true core goes white.

**8. Rework the typing phase.**
- `kickFrac` 0.004 → 0.0003. Set `kickGlow` to 0 for any grain whose per-frame path exceeds 3 px. No streaks while `reacting = 0` (clamp `path` in `particles.wgsl`).
- Each keystroke emits one **low ripple front** from C through the matter (amplitude 0.02, 0.6 s decay). Only the raking light, which grows per key (`typeLight`), makes it visible.
- Tension: matter contracts 1–2%, not 5% (`tensionAmt 0.02`).
-

**9. Fix the return.**
- In `makeParticles`, sample homes radially: `r = 2.6·sqrt(-ln(u))·σ`, clipped to the frame corners, angle uniform. No rectangle.
- In `sim_main.wgsl`, fade lit grains' `lum` to 0 over the first 35% of `ret` (use `ret`, not `retLate`).
- Stagger by radius: `retDelay = 0.35·r/edge`, so the outer field settles first and the centre releases last.
- Add `curl(p, t)·0.15·(1−retLate)` so homeward paths curve rather than draw spokes.
- Matter should *settle*: stick–slip on, damping ζ≈1.3, not springy.

**10. Ignition as a spark, not a bloom ball.**
- Flash `lightI` for ≤120 ms, and route it mostly through specular (#6), so the whole field glints once, sharply.
- Keep `core` tight.
- Add 40–120 needle sparks: emissive grains with speed 3–6 and a 40 ms life.
- Generalise anger's inhale to all emotions: matter draws in 2–4% over 150–250 ms before release. That is the anticipation every emotion currently lacks.

**Motion.** Critically damped `seek` reads floaty: use expo-out releases, overshoot only for playful. Matter fronts lag the emissive front by 60–100 ms. Stillness comes from friction (#3).

**Performance on M3 Pro, 60 fps.**
- Sim: 1M grains × (4 density taps + ~60 flops) ≈ 0.6 ms.
- Density splat: ~0.3 ms, except under collapse (fear/tender). There, atomic contention on a handful of texels can cost 3–5 ms. Pre-reduce in workgroup shared memory (bin 16×16 tiles), or subsample matter deposits to 1/4 of the grains when `mCollapse > 0.3`.
- `shade_grains` with nearest-pixel atomics: ~0.5 ms.
- Shadow march at half res, 12 taps: ~0.3 ms.
- Bloom unchanged. Total budget ≈ 4–5 ms.

## References to study

1. **Hiroshi Sugimoto, *Lightning Fields*.** Branching filament hierarchy on film: fear, fissures, sparks.
2. **Thomas Blanchard / Roman De Giuli macro pigment films** (e.g. *Oil & Water*, *Colour Rush*). Fingering, iris fibres, advected two-tone pigment: the ground truth behind video-b.
3. **Robert Hodgin, *Magnetosphere* and his Houdini-era dust studies.** Individually lit grains, facet speculars, restrained bloom and DoF.
4. **Memo Akten & Quayola, *Forms* (2012).** Secondary motion, lag, structure from one motion: "one population, many shapes".
5. **Raking-light Chladni/sand-table footage** (e.g. Nigel Stanford's *Cymatics* B-roll, not the grade). Real rings are irregular and live on cast shadow; the clean version is the cliché.
