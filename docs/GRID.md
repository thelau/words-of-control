# The grid — current direction

Laurent, 2026-09-27: "input → a grid of all measurements, filled as results come back → only the cells that matter
remain → they combine into one square, the result → that result switches rapidly on a 4/4 beat, a different
visualisation each beat → black. Not everything black and white." Our own style: Ikeda was an inspiration, not a
model. This supersedes the species, the matrix and the verdict clips of DIRECTION-v2.md.

## The loop

| Phase | Image | Sound |
|---|---|---|
| **Room** | The empty grid (9 × 5), tilted in space, turning slowly, barely there; typing lights it, each key a pulse. | The drone; key clicks. |
| **Wait** (Jev) | The grid's 43 names flicker in their cells. | The drone holds. |
| **Fill** (~1.7–2.6 s) | The grid settles flat while every measurement lands in its cell: its name, a choice's answer, its value (digits searching, then settling), and a small live figure — a score a sine (its value its frequency), a choice its bars, a yes/no a field of dots. A doubtful answer breaks into noise. | Each result a blip at its value, panned where its cell is; a doubtful one only noise. |
| **Mark** | The cells that matter take the word's own colours (Jev's colour answer), one by one. | A bell each; its tone is held. |
| **Clear** | Every other cell goes out, staccato. | A dry click each, where it was. |
| **Merge** | The marked cells slide together into a square at the centre (3 × 3 cells), a mosaic; the grid and the traces of where they were remain. | The held tones glide into the result's chord over a rising noise. |
| **Steps** | The result, re-drawn on every beat of a 4/4 at the word's tempo (92–150 bpm): flat, number, bands, rings, particles, bars, waves, rays, bits, tiles, disc. The last bar in halves; a few downbeats burst to the full frame; it ends on the number. | Kick, offbeat hats (16ths for an aroused word), a clap for an intense one, a bass line from the answers; a stab per step in the voice of its drawing; a crash on a full-frame beat. |
| **Black** | Cut. | The hall blooms once; the drone remembers. |

**What matters:** how far an answer stands from the piece's reference words (src/jev/lexicon.json, built from the
test words, never from visitors'), if Jev is sure enough of it (confidence ≥ 0.45). 4–7 cells, more for an intense word.
**The result:** their values, weighted by how much each matters; its colour, their colours mixed the same way.
**The mode:** major-pentatonic for a positive word, a dark mode for a negative one, fourths for a neutral one, on D.

## Engine

One WebGPU fragment pass draws everything, straight to the canvas at native resolution (src/render/shaders/grid.wgsl).
The room, the wait, the performance and the black are its modes. The score (src/show/grid.ts) is computed once
per word and read by the image (a storage buffer) and the sound (src/audio/score.ts) alike. Per frame the CPU
supplies only the clock, the step on screen and the marked cells' rectangles. Text comes from two atlases painted once
at boot (digits; every name the grid shows).
