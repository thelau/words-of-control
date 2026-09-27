# Round 9 — Josh Smith (data visualization / creative technology)

*Written from a practitioner's point of view (someone who builds interactive and generative data pieces in D3/WebGL), not from any biography. I looked at all 8 contact sheets, 12 full frames, and read GRID.md, space.ts, grid.ts and grid.wgsl.*

## Verdict

The grid (war-01-filled) is honest, dense and good to look at. It has one small multiple per measurement and one figure grammar per data type (sine = score, bars = choice, dots = yes/no, noise = doubt), and it reads from a distance. The stand (war-11, i_miss_you-11) is the best chart in the piece: one axis, 61 dots, the words among them. What sits between those two is where the encoding breaks down. The 3D spaces look like Ikeda but tell the visitor less than a 2D strip plot would. The camera cuts keep time but carry no meaning.

## Encodings: what works, what misleads

- **Nothing shows why a cell was marked.** Marking is by *z* against the reference words, but no cell shows the reference words. In war-02, VIOLENCE 0.98 is marked while WEIGHT 0.999, TENSION 0.999 and DOMINANCE 0.999 are not. To a visitor that looks arbitrary. Sine frequency (with amplitude and speed as backup) is also a weak channel above ~0.7, because 0.75 and 0.99 both read as "many wiggles".
- **The tiles show raw value when they should show deviation.** fuck-04 has SACRED **0.000** in the same colour and type weight as AROUSAL 0.999. It matters *because* it is low, but the tile reads as "strong". GRID.md says the result is "weighted by how much each matters", yet every tile gets equal area.
- **The network's red edges lie about distance.** The word links to its 8 nearest on all 45 answers, but it is drawn in the 3 marked axes. In war-06 the red lines to RAGE, THUNDER and STORM are the *longest* in the box. The picture says "far" and the caption says "nearest".
- **The cloud manufactures its texture.** Each reference word gets 150 gaussian points (σ 0.05), there are 4000 random dust points, and 900 points for the word. The halos look like uncertainty or density but encode nothing. Additive blending then piles every word with a 0 choice-probability into one white blob at the origin (nothing-05, war-05), which is the brightest thing on screen and means "these axes don't apply".
- **Perspective eats position.** The orbits turn continuously and cut every beat, so no view lasts long enough to fix 3D position. The orthographic plates (plan/front/side) are the only views where position can be read, and they only appear in the ring.
- **The globe is the climax and the least readable chart.** mother-10 shows 45 meridian bands bulging by value, seen at an angle, with labels colliding ("KIND: LIVING BEING" runs into the dots). It has no baseline, so a bulge can't be judged. The ring holds 24 nearly identical globes, which is repetition, not information.
- **Colour does two jobs.** It is the word's colour (Jev's answer) *and* the identity of each marked answer. For i_miss_you (5 blues) and spoon (greys and ochres) the identities collapse, so in the globe and ridges you can't tell which band is LOSS.
- **The stand contradicts itself.** RAGE, THUNDER and STORM are nearest *overall* but sit at 0.25–0.7 on VIOLENCE, far from "war" at 0.98 (war-11). The labels are staggered with no leader lines, so which dot is RAGE? The long phrase "WHY DID YOU LEAVE ME…" runs past the stage edge (i_miss_you-11).
- **Map.** Spoon's cross has a 0.6 vertical stalk in perspective (spoon-08), so its place on the plane is ambiguous. The plane has no frame or ticks.

## Motion and interaction

The cuts carry mood (8ths/16ths for negative), which is real. Inside a bar, though, the word jumps to a new screen position every beat, so the eye has to search for it again. Object constancy is free here: pin the word's projected position across a bar's cuts. Typing is the only input, and it is used as a trigger rather than as a comparison. Nothing ever tells a visitor how *their* second word differs from their first.

## Six changes, ranked

1. **Put a reference rug in every cell.** Draw 61 hairline ticks (`cell.lex`, packed as one extra storage block) along the bottom of each cell, with the word's value as a bright tick. Marking becomes self-explanatory, and the stand's best idea runs through the whole piece. Cost: one loop in `figure()`.
2. **Show deviation on the tiles.** Print the value as *value vs reference median* (e.g. "0.000 ↓ median 0.41"), scale tile width by `rel`, and add a mini rug. SACRED then reads as rare-low.
3. **Make the network honest.** Either take the word's edges from the 3 displayed axes, or lay out all points by PCA/MDS on the 45-D normalised gaps (already computed in `gap()`) so screen distance ≈ real distance. Drop `dust()` and the gaussian halos. One crisp point per word, sized by nothing, labels on the nearest.
4. **Replace the globe bar with an orthographic radial chart.** Use a plan view: 45 spokes, a reference-median ring as baseline, and marked spokes labelled at their tips. Turn the ring into 24 small multiples that mean something: the word on each unmarked answer as a strip against the refs.
5. **Fix the stand's labels.** Add leader ticks from each nearest word to its dot, captioned "nearest on all answers". Or choose the neighbours *on this answer*. Wrap long phrases inside the stage.
6. **Compare with the previous words, in memory only.** Keep the last appraisal's 45 numbers (not its text) in a JS variable until the room has been idle for 60 s or the page reloads. Draw it as an unnamed hollow "PREVIOUS" point in the cloud and on the stand's axis, plus one delta line ("VIOLENCE −0.61"). Nothing is written to storage or the network. Performance is flat: one point, one label.

The first two are what turn "impressive" into "understood".
