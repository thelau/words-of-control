# Round 7 — artist / art director review

Material: `docs/captures/review13/sheet-*.png`, `jev-readings.txt`, films (grief, shame, joy, maybe, fire, ocean, war) at 2 fps and 6 fps strips, `references/craft/*-contact.png`, `field.wgsl` simulate/behave/beat.

**Score: 6.5 / 10.** Craft 7.5, word legibility 5.

## What reads

- **Colour carries the word.** Fire is amber, ocean is blue-white, grief drains to grey, love is copper. This is the only channel that works every time. It's also the weakest artistic channel, because it tints things and doesn't make them behave.
- **Chladni sand is the best thing in the piece.** Ocean's sand pattern, which moves from a smooth field to deep cells, and grief's pattern, which drains to black, are close to the references (macro, raking light, bleeding off the frame). This is where the work looks like Kurokawa rather than a render demo.
- **Dwindling** (grief, maybe) reads, because the frame visibly thins and dims. **Strike** (war, why) reads as a first-frame pop.
- **Embers** read in fire's 6 fps strip as warm flecks leaving the structure. They read as sparkle, though, not heat. Every point returns to its place after 1–3 s, so there's no sense of consumption.

## What is invisible

- **Motion is played on the whole body while the camera moves.** `behave()` translates, scales and rotates the entire formation. Meanwhile `camera()` drifts, pushes, orbits and re-aims at the densest points. Rising by roughly 0.4 units over a 3 s shot, seen from an orbiting camera, reads as a camera tilt. **Shame (contracting 0.95)** is the worst case: its central 5 seconds are a floating rock slab turning. No contraction registers anywhere in the film. Falling in grief reads only as vertical streaks, which comes from the formation, not the motion.
- **Water undulation** is a 0.18-unit sine on `goal.y`. In ocean's cloud shot the points are 22 px bokeh discs, so a wave in their positions is blurred away. That shot is generic bokeh soup (6 fps strip), not water.
- **Stone and metal "heaviness"** is spring stiffness (ω 25 → 9 rad/s). Nobody perceives a stiffer critically damped spring. Weight is shown by gravity, impact and stillness, not by stiffness.
- **Glints** (`pow(sin, 60)`) last a few frames on 1 px points. They're barely visible and add nothing to money or spoon.
- **The steady pulse** is a 5% scale throb, which is sub-perceptual. Only the 60% brightness pump reads, and at 56–128 bpm with `exp(-7ph)` it looks like exposure breathing rather than rhythm.

## What is illustrative or cheap

- **The relief slab.** The same cracked, Voronoi-like rock tile appears for fire, shame, war, fear and love, floating as a rectangle with a visible edge, like a 3D asset preview. It's unrelated to the reading, it repeats across words, and it's the least "world-class" image in the set. The references never show an object's border.
- **Formations are word-agnostic.** The same radial fan shows up in grief, shame, war and joy. The same "city" bars show up in fire, war, money and maybe. The reading only modulates these at 5–20% amplitude, so the shape grammar drowns out the physics. That's the root of "not connected enough": what you see first (the form) doesn't come from the word.
- **Grief's rain streaks** are close to illustration. They're acceptable because they're abstract, but they're the edge of it.

## Against the references

The dust field (f) and coral (e) references work because one physical behaviour fills the frame and is held long enough to be believed. The work here cuts every 1–2 s between five formations and pushes each behaviour down to a modifier. Each word needs fewer ideas, stated louder and held longer.

## Ranked changes

1. **The reading chooses the form, not the hash.** Map the dominant material to a formation family and a renderer:
   - water → Chladni or landscape as a fluid surface
   - stone and metal → relief
   - fire → a cloud with an emitter
   - smoke and void → a drift or haze
   - light → a lattice

   Keep the hash only for variety within the family. For the director, this is a table, not new code. No perf cost.
2. **Lock the camera when motion dominates** (motion weight > 0.5, or a still word). Frame the union of the start and end extents from `behave()` at `u=0` and `u=1`, then hold, with at most a slow push. Motion only reads against a fixed frame. Forever (still 0.87) should be one long static shot. Right now it swoops.
3. **Make motion 2–3× larger and shaped over time.**
   - Contracting: scale toward 0.2 with an ease-in, brightening as density rises.
   - Breaking: pieces separate with a gap and their own spin, triggered on the strike beat.
   - Falling: gravity-accelerated, per point, with the lowest points arriving first.
   - Play the second motion as the second half of the shot. Grief would be falling, then contracting.
4. **Replace the floating slab.** Show the relief full-bleed and macro, like the Chladni shots, never with an edge. Drive its displacement from the material:
   - cracked for stone and ice
   - a liquid swell for water
   - charred, flaking ash for fire (the height erodes over the shot)
5. **Give each material its own dynamics, not a body-sine.**
   - Water: two-octave height waves with amplitude around 0.4, carriers forced sharp (aperture ×0.3), and a specular sheen from the wave slope.
   - Smoke: longer lives (6–10 s), no return to place, large low-alpha sprites, capped share (overdraw).
   - Fire: emit from the formation's upper points, and let the formation darken or char as the shot goes on. The fire should consume.
   - Stone: no twinkle, no bokeh, no motion, then one fall with a hard stop on the beat.
6. **Make rhythm spatial and structural.**
   - Strike: a shockwave ring, a radial displacement delayed by distance from the aim (one `length()` per particle).
   - Stuttering: freeze the simulation (dt = 0) on skipped beats, the Ikeda hold.
   - Steady: a travelling wavefront through the points, not a scale throb.
   - Swelling and dwindling: the visible particle count grows or thins.

   Sync the audio transients to the same function.
7. **Use the secondary material and motion.** Shame is fire 0.33 plus water 0.26. Split the particles between both behaviours in space (steam, quenching), so words sharing a dominant material still differ. The specificity is in the mix.
8. **Cut the bokeh.** Cap carriers at about 8% and CoC at 12 px, and never let a whole shot go soft (ocean cloud, joy tube). The references are sharp dust with only occasional discs. This is also the cheapest perf win on the list (overdraw), and it buys room for the smoke sprites in item 5.

Every change here is per-particle ALU, table-driven direction or less overdraw. Run `npm run perf` after items 5 and 6, the only ones that add fill.
