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
| **Fill** (~1.7–2.6 s) | Every measurement lands in its cell: its name, a choice's answer, its value (digits searching, then settling), and a small live figure — a score a sine (its value its frequency), a choice its bars, a yes/no a field of dots. A doubtful answer breaks into noise. | Each result a 25 ms test tone at its value, panned where its cell is (a choice two, a yes/no a click, a doubtful one noise). |
| **Mark** | The cells that matter take the word's own colours (Jev's colour answer), one by one. | A pure tone each, held. |
| **Clear** | Every other cell goes out, staccato. | A dry click each, where it was. |
| **Steps** | Cut (no slide): the marked cells as one block on the stage at the centre (7 × 3 cells, landscape), a tile each with its name and value. Then on every beat of a 4/4 at the word's tempo (92–150 bpm) a new **3D space** of the data, a new camera: cloud, network, terrain, map, globe, lattice, ridges, planes (show/space.ts). Around the stage, each cell of the grid's ring shows the same space drawn another way — one of four plates per step: angles, scans (series of cross-sections), sections (plans, fronts, sides cut at their own depth), or a mix, with close-ups on the word. The last bar in halves; a few downbeats burst to the full frame; then a bar held on where the word stands: the answer that sets it most apart, and its rank among the reference words ("violence 0.98 · above 61 of 61 words"). | The held tones cut dead. A sequencer (after Caterina Barbieri): two arpeggios of the marked answers, lengths K and K+1, drifting in and out of phase, sine through a wavefolder and a filter that opens across the sequence; each space re-patches it (fold, octave, gate, density). Noise ticks and sub hits on euclidean patterns (no four-on-the-floor). A full-frame beat: white noise and a high sine. The number: its pitch alone. |
| **Black** | Cut. | The hall blooms once; the drone remembers. |

**The mood** (Jev's reading, negative / neutral / positive, a blend) bends it all. Negative: lower, folded harder and
driven, the second voice detuned against the first, the filter kept dark, harsher ticks, more sub, a low rumble pumping
with it; the camera closer, faster, shaking, every point trembling. Neutral: test-tone pitches (half-octaves of
1 kHz), pure sines, sparse, no sub; a long lens, far off, almost still. Positive: lydian, higher, light folding, the
filter opening; a smooth wide orbit.

**Captions** (src/show/notes.ts, drawn as DOM text): above the grid the word and where the reading stands (received,
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
