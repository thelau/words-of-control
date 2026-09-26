# Species checklist

A species is what a verdict is made of, seen at a glance (points, ink, …; see DIRECTION-v2.md "Species").
Every species must react to the whole reading, not only the mood — the particles set the bar. A new species
is done when each line below has an answer in its shader and its voice (clips.ts), or a written reason why not.

| Reading (frame.ts) | What it must change | points (field.wgsl) | solids (solids.wgsl) |
|---|---|---|---|
| mood pos / neu / neg | colour, light, character — never an inversion | palette glitter · clinical axis views · colourless, contracting | warm light, gold chrome, palette matte, glitter · cool exact light, white · colourless |
| material (top) | the substance's physics and surface | per-particle matter: embers, waves, crystals, glints… | chrome, glass (ice frosted, water tinted), matte (stone, sand, wood, cloth, flesh), embers with glowing cracks, light, black gloss |
| material (second) + share | a trace of another substance | a share of the particles | a share of the spheres, and white porcelain as the house contrast |
| texture | the surface's grain | cracked gaps, soft, grainy, crystalline | grainy rough, cracked fissured, soft sheen |
| motion (top, second turning in) | what happens in the shot | behaveAt() gestures on the verdict clock | the cluster rises, falls, spreads, packs tight, turns, trembles, breathes, bursts, drifts |
| shape | the form | the reading's formation + operators | the cluster's envelope: ball, pile, wave, helix, outliers, knot, one great sphere |
| rhythm | beat, stutter, tide, strike, swell/dwindle | rhythmLight(), clock() | a letter struck per beat (its spheres glint), stutter, tide, strike burst, swell/dwindle, lazy clock |
| who / distance | where you stand | camera(): inside, facing, turning, far | close, facing, circling, far |
| palette / colour | the pigments | p1–p3 | p1–p2 on matte and emissive, gold chrome |
| variety (ops) | never built the same way twice | echo, warp, flow + recentOps | light (studio, rim, spot, clinical), camera move + recentOps |
| dramaturgy, hand-off | the form of the performance | director (shared) | director (shared); each 1-bit of the bits reading becomes a sphere |
| sound | the same parameters, the same clock | data(), pulse(), blow() | solids(): the struck letter's spheres ring as a chord of their matter; hum; pulse(), blow() |
