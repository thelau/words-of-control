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
| **Steps** | Cut (no slide): the marked cells as one block on the stage (7 × 3 cells), a tile each. Then a 4/4 at the word's tempo (92–150 bpm): as many bars of 3D space as the words earn — one for ordinary words, up to four for unusual ones (how unusual: the mean rarity of what matters) — opening on what is most striking (ridges: beyond every reference word on an answer; network: a close neighbour; cloud: lost in the crowd; terrain: a place; else the table), the rest in an order of their own, downbeats bursting to the full frame by chance; one 3D space per bar — where the word sits (cloud: one point a word, a stem to the floor), its neighbours (network: laid out by likeness on all 45 answers, so near is near; its 40 nearest joined, the rest faint), then a bar stripped back (one voice, no pulse) on how far it stands out (ridges, for a word far from all) or the whole table of answers × words, and a last bar in halves: the ground it stands on (terrain), then the answer it ends on as a flat dot plot (axis) — the camera cutting on each beat. The ring is small multiples — the reference words in the space of each three of the answers that matter most, one triple a cell, labelled, the word a cross in its colour, no boxes — played by the sequencer: each note of the first voice lights the next cell clockwise, each of the second (one note longer) the next anticlockwise, so the two patterns are seen drifting apart and meeting; a lit cell flashes and turns to a new angle while it rings, then rests, dim and still. A few downbeats burst to the full frame. | The drone falls silent. One crescendo over four bars: each marked answer a note (which answer it is, moved by how far it stands out), two voices on fixed euclidean patterns (lengths K and K+1: they drift), bar one one voice, bar two both, then a dotted-eighth delay growing, notes lengthening, the filter opening. Noise ticks, sub pulses. A full-frame beat: a burst of noise. |
| **Stand** (≥ 12 s) | The words, large, in their colour; the answer that sets them most apart (never a category slot like "who", never a mere echo of the words; wavering between two readings while Jev is unsure); the reference words as a dot plot along it 0–1 (stacked), the words among them — their rank seen, not written; the nearest on this answer one by one, with lines to their dots (their own family left out); last, one line: "answered by an AI (Jev) · 993 reference words". Nothing more ("don't fill the space because there is space"). Nonsense (Jev: nonsense): nothing marked, no steps, "NOTHING STANDS OUT". Doubt: unsure cells arrive with false starts; the notes drift out of tune by Jev's doubt. Ring empty. **Colour** ("Ryoji Ikeda if he used more colors"): black, white and the words' pure, flat colour — a test card's, never a glow (red, orange, yellow, green, cyan, blue, violet, pink, brown, white); a second colour in turn on the marked cells when Jev sees one strongly (love: red and pink; war: red); white/grey/black → the second colour or the matter's; colourless words white. Type in the marked cells at full ink. | The pitch of that answer, alone, a second at most, never high; the drone returns under it. |
| **Black** | Cut. | The hall blooms once; the drone remembers. |

**The mood** (Jev's reading, negative / neutral / positive, a blend). Negative, by subtraction: no tune — a fixed grid
of clicks, a test-tone blip per answer, short sub pulses; the camera cutting on eighths or sixteenths, the points
trembling, (no strobe: the artist found it annoying). Neutral: test-tone pitches, pure sines,
no sub; long-lens technical drawings. Positive: lydian, softer and longer notes, a quiet chord; larger, softer points.

**Captions** (src/show/notes.ts, drawn as DOM text; tracked capitals, IBM Plex Mono, the visitor's word always as typed): above the grid the word and where the reading stands (received,
marked, cleared; then the step, the tempo, the mood); below it how to read a cell; under the stage what each step
shows, in plain words; on a space, labels on the data itself (axes, the word, its nearest reference words). Nothing is
invented: every caption is the score's own numbers and names. The word is shown only while its performance lasts.

**The spaces** place the word among the piece's reference words, with the measurements that matter as axes (each
axis spanning what the reference words cover): white points and hairlines, the word and the marked measurements in
their colours, additive light, depth dimming what is far.
**What matters:** how rare an answer is among the piece's reference words — the share of them at least as far out,
the same measure for a score and a choice — if Jev is sure enough of it (confidence ≥ 0.45). **The reference words**
(docs/reference-words.md → scripts/reference.ts → src/jev/reference.json → scripts/lexicon.ts → src/jev/lexicon.json):
993 entries: ordinary language (everyday things, people, places, feelings, ideas, actions, short things people say,
qualities, everyday sentences) and what people type into a piece like this (talking to the machine, confessions,
questions, anger, images, the world, names, daily life, children, sayings and songs, a few untranslatable words,
non-words, long sentences) — never visitors' words. Chosen against simulated visitors (docs/visitor-simulation.md,
held out; `node scripts/simulate.ts`): at 400 entries their nearest reference word lay at a median distance of
0.059 (names 0.29, swearing off the scale); at 993, 0.039, and the neighbours read as meaning ("taylor swift" →
beyonce, michael jackson; "i cheated on her" → my husband cheats, my friend betrayed me). Plain translations are left
out: they only echoed the visitor's word back. Stored compactly (keys once, values in hundredths: 117 KB gzipped).
The ending's dot plot becomes columns of dots (one per 7 px of the scale); the cloud's stems fade with the count. The ending says the answer in the battery's own words
("COMPLETELY SINCERE", "AWE"), the measure and its value small beneath. 4–7 cells, more for an intense word.
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
