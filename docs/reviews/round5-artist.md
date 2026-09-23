# Round 5 — artist / art director review (verdict visuals)

Material: docs/captures/review7 (27 words), references/craft/*-contact.png, closeups.png, field.wgsl, director.ts.

**Score: 5.5 / 10.** The appraisal is gallery-grade. The verdict now has one language (points of light, monochrome, one accent), which is real progress. But the craft sits one tier below the references, and three of its signatures read as "stock motion template".

## Craft vs the references, per formation

- **landscape**: the best of the set when grazing (fuck-03, storm-18). It is still a uniform blizzard of same-sized discs. References h and i are built from *continuous lines of points* (contour rows) plus a sub-pixel dust layer, with only a few large bokeh highlights. Ours samples `col = a*96` at random, so the rows never read as lines and the terrain reads as noise.
- **city**: the most repeated shot (money, storm, war, ocean, fuck, crap, rage). It reads as a floating diorama of rain in a black void. The points are spread evenly along each bar (`r1*hgt`), so a bar has no top, no edge and no weight. An Ikeda bar is a hard top and a thin stem.
- **lattice**: the 16³ voxel grid shows as an out-of-focus blob (money-03). Nothing in it tells you it is bits.
- **cloud**: straight segments joining the points, plus the central star flare. This is Trapcode Plexus, circa 2014, the cheapest-looking frames in the set (war, thunder, storm, love, mother). Your "ugly af" probably lands here.
- **tube**: a jagged ring with extruded stubs sticking out (love-06, ocean-03). It reads as a crown or a gear. `tv(k)` steps produce saw-teeth and the radius jumps. In references c and closeups-4 the line is a *smooth* filament that frays into dust.
- **the light**: a 4-spike star centred in every cloud, tube and lattice shot. The Sept 23 decision said "no default central sun", and it is back. It is a lens-flare cliché, and it pins every composition to dead centre.
- **relief / chladni / haze**: these break the one-language rule. relief is a floating clay slab with Voronoi cracks, an asset preview. chladni here reads as cream or latex, not the sand you liked. grief's haze is a chromatic-aberration caustic screensaver. Next to the point fields they bring back "a collection of unrelated visuals".

## Coherence, variety, connection

- **Coherence with the appraisal**: good in principle (barcode→city, spectrum→landscape). It is not *felt*, because the cut from the 2D line to the 3D shot has no gesture that shows the marks becoming space.
- **Variety**: poor. It is all warm grey at the same exposure. The accent almost never fires (`P.w > 0.96 && r < 0.3`). Ten of 27 words get a single shot. silence and asdfgh show an empty frame for their whole verdict, and that reads as a bug, not as restraint. rage, storm and war are cloud→city→landscape in the same grey, cut the same way.
- **Connection to the word**: the data is truthful but invisible. Nothing distinguishes "love" from "war" except which formation was drawn.

## 8 changes, ranked

1. **Kill the plexus and the star.** In `place()` form 3, drop the segment-stringing: place points only near the return-map vertices (a Gaussian puff, σ ∝ value), and trace the trajectory as a *curved* Catmull–Rom path, sampled densely and faded along its length. Remove instance 0, or keep it for about 1 in 6 shots, placed at the highest tape value rather than at the origin. This costs nothing and removes the biggest cheap signal.
2. **Two populations per formation: dust and highlights.** Split the instances into about 85% "dust" (radius 0.5–0.8 px, no CoC growth, alpha 0.3) and 15% "carriers" (full bokeh, value-driven). Clamp dust to 1–2 px, which is cheaper than today's 22 px discs. This is the texture of references f and i, and it gives a density gradient rather than confetti.
3. **Sample structure, not noise.** landscape: make `col` sequential per row (`col = fract(i/perRow)*96`), so each row becomes a continuous line (reference h). city: put 40% of each bar's points in the top cap (a bright square), 60% sparse on the stem, and fade the stems toward the floor. tube: smooth `tv` with a 4-tap filter and cap `tubeR` at 0.04. Let dust drift off the curve with `(1-v)`, fraying instead of stubs.
4. **Put the camera inside, not outside.** For city, lattice and cloud, `dist` is 2.6–6, so the formation sits small in a black void. Add a "macro" angle class (about 40% of angles) with `dist` 0.4–1.2, the focal plane on a nearby point and aperture ×2, so the foreground bokeh fills the frame (references e and i).
5. **Colour by depth and data, not just ink.** Tint the points on a two-stop ramp: warm near, cool far (reference i), with the ramp chosen per word from valence and temperature. Raise the accent to `P.w > 0.85` with a probability tied to `s_intensity`, so charged words actually burn. The appraisal's accent colour must be the one that returns in 3D.
6. **A literal hand-off.** For the first 0.5 s of shot 0, `mix()` each point's ndc from its 2D position in the last appraisal cut (the barcode column x, or the line's x) to its 3D projection. The reading visibly lifts into space. This is the "connection felt" moment, at vertex-only cost.
7. **Bring relief, chladni and haze into the point language, or retire them.** Render chladni as points of light (the "points" view already exists in sand.wgsl) or as your sand with grazing light, never a smooth fill. Give relief a point-sampled rim-lit surface instead of a clay slab. Drop the caustic haze. For the void, use a sparse dust drift with one moving highlight: never an empty frame, never chromatic aberration.
8. **Director: fix repetition and the one-shot words.** Cap city at 1 shot per performance and penalise the opener family across the last 3 performances, not just 1. Give indifferent words 2 long takes of *different* formations (landscape then tube, for example) instead of 1. For violent words, force each consecutive shot to change at least two of these three: formation, scale class (macro/wide) and colour ramp, so rage never looks like storm.

Perf note: change 2 lowers fill (most discs shrink). Changes 4 and 6 add vertex math only. Re-run `npm run perf` on the macro angles, because big foreground discs are where fill spikes.
