# The grid — current direction

Laurent, 2026-09-27: "input → a grid of all measurements, filled as results come back → only the cells that matter
remain → they combine into one square, the result → that result switches rapidly on a 4/4 beat, a different
visualisation each beat → black. Not everything black and white." Our own style: Ikeda was an inspiration, not a
model. This supersedes the species, the matrix and the verdict clips of DIRECTION-v2.md.

## The loop

| Phase | Image | Sound |
|---|---|---|
| **Room** | One line below the word: the drone's own waveform (read from the audio as it sounds), swelling as the word is typed. | The drone; key clicks. |
| **Wait** (Jev) | The line holds. | The drone holds. |
| **Fill** (~2.8–3.8 s) | Every measurement (45: the full 9 × 5) lands in its cell: its name, a choice's answer, its value (digits searching, then settling), and a strip: the 61 reference words as ticks along 0–1 (as tall as the words that gave that value), the word's own value a bright line — why a cell will matter is seen, its line far from the crowd. A doubtful answer breaks into noise. | Each result a 25 ms test tone at its value, panned where its cell is (a choice two, a yes/no a click, a doubtful one noise). |
| **Mark** | The cells that matter take the word's own colours (Jev's colour answer), one by one. | A pure tone each, held. |
| **Clear** | Every other cell goes out, staccato. | A dry click each, where it was. |
| **Steps** | Cut (no slide): the marked cells as one block on the stage (7 × 3 cells), a tile each. Then a 4/4 at the word's tempo (92–150 bpm): one 3D space per bar, chosen by the data — where the word sits (cloud: one point a word, a stem to the floor), its neighbours (network: laid out by likeness on all 45 answers, so near is near), then a bar stripped back (one voice, no pulse) on how far it stands out (ridges, for a word far from all) or the whole table of answers × words, and a last bar in halves: the ground it stands on (terrain), then the answer it ends on as a flat dot plot (axis) — the camera cutting on each beat. The ring is small multiples: the reference words in the space of each three of the answers that matter most, one triple a cell, labelled, the word a cross in its colour — each turning at its own angle and cutting to a new one on every beat, with the stage. A few downbeats burst to the full frame. | The drone falls silent. One crescendo over four bars: each marked answer a note (which answer it is, moved by how far it stands out), two voices on fixed euclidean patterns (lengths K and K+1: they drift), bar one one voice, bar two both, then a dotted-eighth delay growing, notes lengthening, the filter opening. Noise ticks, sub pulses. A full-frame beat: a burst of noise. |
| **Stand** (≥ 10 s) | The word, large; the answer that sets it most apart (never a category slot like "who"); the reference words as a dot plot along it 0–1 (stacked), the word among them — its rank seen, not written; built slowly: the nearest on this answer one by one, with lines to their dots; the nearest on all answers; "45 questions answered by an AI (Jev), sure to …"; and last, alone, "61 reference words, chosen by the artist". One hue per word (its colour, deeper for answers that stand out less). A word Jev sees as white, grey or black takes the house's accent (orange-red). Ring empty. | The pitch of that answer, alone, a second at most, never high; the drone returns under it. |
| **Black** | Cut. | The hall blooms once; the drone remembers. |

**The mood** (Jev's reading, negative / neutral / positive, a blend). Negative, by subtraction: no tune — a fixed grid
of clicks, a test-tone blip per answer, short sub pulses; the camera cutting on eighths or sixteenths, the points
trembling, and a strobe that is safe (only a word more than half negative, on a beat, never two beats running: at most
2 flashes a second; pale grey, never white) with digital silence on its frames. Neutral: test-tone pitches, pure sines,
no sub; long-lens technical drawings. Positive: lydian, softer and longer notes, a quiet chord; larger, softer points.

**Captions** (src/show/notes.ts, drawn as DOM text; tracked capitals, IBM Plex Mono, the visitor's word always as typed): above the grid the word and where the reading stands (received,
marked, cleared; then the step, the tempo, the mood); below it how to read a cell; under the stage what each step
shows, in plain words; on a space, labels on the data itself (axes, the word, its nearest reference words). Nothing is
invented: every caption is the score's own numbers and names. The word is shown only while its performance lasts.

**The spaces** place the word among the piece's reference words, with the measurements that matter as axes (each
axis spanning what the reference words cover): white points and hairlines, the word and the marked measurements in
their colours, additive light, depth dimming what is far.
**What matters:** how far an answer stands from the piece's reference words (src/jev/lexicon.json, built from the
test words, never from visitors'), if Jev is sure enough of it (confidence ≥ 0.45). 4–7 cells, more for an intense word.
**The result:** their values, weighted by how much each matters; its colour, their colours mixed the same way.
**The mode:** major-pentatonic for a positive word, a dark mode for a negative one, fourths for a neutral one, on D.

## Engine

One render pass straight to the canvas at native resolution: a fullscreen triangle (src/render/shaders/grid.wgsl —
the room, the wait, the cells, the square, the number, the black), then during a space its points (instanced dots)
and lines (1 px) in the step's rectangle (space.wgsl). The score (src/show/grid.ts) is computed once per word; the
spaces' geometry and the steps' sound are built in a worker while the grid fills (src/show/prepare.worker.ts), so
Enter never stalls the page. Per frame the CPU supplies only the clock, the step on screen and its camera.

Laurent, on the second version: "music is cheesy … more into Caterina Barbieri type, modular, noise, smart beats,
Ikeda as well"; "visuals too simplistic"; "the sequencing dynamic is ok"; no swoosh when the cells group ("can be
sharp cut"), no 3D grid settling flat; "the data viz not 2D but 3D, very Ikeda point cloud or dot connected 3D
spaces, map based stuff".
