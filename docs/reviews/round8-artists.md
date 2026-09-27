# Round 8 — studio crit: craft and form (three artists)

Panel: an audiovisual artist (Ikeda / Alva Noto lineage), a generative artist (WebGL/TD, festival screens), a modular
musician (Barbieri / Malone). Looked at all 8 sheets and full frames war-01/02/06/07/09/10, love-06/12,
mother-07/08, fuck-04, spoon-08, nothing-05, spectrograms of war and love; read GRID.md, audio/render.ts, show/space.ts.

## What works

- **The fill is the piece's best 2 seconds.** war-01 is a real image: 45 cells, a sine whose frequency *is* the value,
  and the same value heard as a 25 ms tone at `400·2^(4v)`, panned by column. Doubt breaking into noise (pitch, age,
  ambiguity) is quiet and exact. Here sound and image really are one thing.
- **Mark → clear → cut** has good editing: the colour arriving cell by cell, the staccato vanish, the hard transient
  + 42 Hz sub at `g.seq`. Keep it.
- **The drawings beat the orbits.** The globe's plan view (the rosette in mother-07, ring top row and bottom row) and
  the orthographic network plates in war-07 are the most distinctive frames in the set. The spinning 3D boxes are
  the generic ones.
- The room (love-12): one grey waveform, a cursor. Right.

## What doesn't

**Visual.** (1) *The ring is wallpaper.* nothing-05: 24 near-identical globes. war-09: the scan plate yields cells
that are just a flat line or empty (top row cells 2, 5, 7; bottom row cells 4, 6); war-07 has close-ups staring at
nothing (top cell 4, bottom cell 3). A plate that repeats one object 24 times reads as a screensaver grid.
(2) *The stage is under-filled.* The camera fits `REACH / sin(half)` for the worst rotation, so the space uses ~35%
of the stage (war-09 terrain, love-09 network). (3) *Full frames fall apart.* war-06 ridges: tangle sitting bottom-right,
top half empty, labels on top of each other ("colour: red" under "shape: jagged"). mother-08 lattice: a front-ortho
view of a cube collapses to a 14×14 dot grid; the box line cuts through the caption. And the lattice isn't data —
`rand() < c.value`, indexed `(i*n+j) % cells` — it's decoration pretending to be data. (4) *Labels collide*
everywhere (nothing-05 "kind: abstract idea" over "material: void"; spoon-08 "spoon"/"mother"/"baby" in one corner).
(5) *Colour.* The tiles (fuck-04: salmon, periwinkle, blush, lilac) read as a product UI palette, not a piece. The
pale tints carry no meaning, and war/love/fuck all end in the same red.
(6) *The stand is the weakest frame for the most important moment*: small red mono in an empty grid ("who: they
0.87" for mother is an anticlimax; "above 61 of 61" reads like a tie). The word itself is never big.

**Sound.** (1) *The arpeggio collapses.* It plays the marked answers' **values**, and marked answers saturate:
love's tiles are 0.99/0.99/0.88/0.999/0.93/0.88; fuck's six are 0.999 plus one 0.000. `tuning()` maps those onto one
or two notes, so K vs K+1 phasing can't be heard. The love spectrogram confirms it: one ~1.06 kHz line under the
whole steps (the "chord" is a unison), a repeating pluck at ~2 kHz. (2) *Barbieri is legato, sustained,
long-form, wet*; this is dry 30–200 ms plucks (`gate` 0.03–0.2, `exp(-x/(gate·0.5))`) re-patched on every beat
(octave 0/1/2 jumping per space), with a random `rand() > p.dens` mask that erases the pattern. Result: a busy
sequencer, not a process. (3) *The Ikeda side is pastiche by addition*: clicks + glitch bursts + 6–14 kHz stabs + sub,
all on top of a pentatonic/phrygian arp, triggered by `rand() < 0.3·neg`. Ikeda is rigid, metric and subtractive;
randomness and layering are what make it read "Ikeda-like". (4) The room drone keeps sounding under the steps (the
red band below 600 Hz in both spectrograms) — it muddies every cut.

**Form.** 21 cuts at ~0.4 s, eight spaces, repeats (war: cloud twice, terrain twice). Everything changes every beat
in image *and* sound, so nothing accumulates. There's no arc across the 8 s.

## Top 6 changes, ranked

1. **Make the lines the waveforms.** The room already draws the drone's waveform; carry that through. In each space
   the oscillator's wavetable is the drawn geometry: the terrain's rows, the ridge lines, the globe's meridian radii
   (45 values = one cycle), the contour loops. The stage draws the line the speakers are playing. This is the
   distinctive idea the piece is one step away from, and it replaces the arbitrary `PATCH` table.
2. **Fix the sequencer's material and form.** Pitch from *which* answer (its grid index → scale degree) or its
   distance from the reference words (z-score), not its saturated value; value → velocity/fold. Replace the
   `rand()` density with a fixed euclidean mask so K/K+1 phasing is audible. Keep one pattern across all steps; let
   the spaces move only fold and cutoff, never octave. Longer gates (0.25–0.6 s) and a dotted-8th ping-pong delay
   with feedback that grows across the steps: one 8 s crescendo, not 21 re-patches.
3. **Ikeda by subtraction for negative words.** Drop the tonal arp entirely above `neg > 0.6`: a single sine at the
   top answer's frequency, a 32nd click grid that's deterministic, and hard silences — the white strobe frames get
   *digital silence* (drone included), black frames get full-scale noise. Duck the drone to zero at `g.seq` for every word.
4. **Rebuild the ring as time or as the rest of the data, not copies.** Either a film strip (each cell is the step
   n−k, frozen, so the ring fills clockwise with the performance's own history), or each cell is one of the 24
   unmarked answers' own slice through the space. Ban views that project to < 5% of the cell (flat scans, empty close-ups).
5. **Cut or make real the weak spaces; fit cameras to projected bounds.** Lattice → the real 45 × 61 lexicon matrix
   as a point block with the word's row as a coloured slab. Ridges full frame: raise the camera, centre it. Fit
   each camera to the projected bounding box of *its* frame so the stage fills to ~80%. Add greedy screen-space
   label de-collision (nudge down by line height).
6. **Colour and the stand.** One saturated colour per word (Jev's), plus white; express rank among the marked cells
   by pattern or brightness of the figure, not pastel tints. At the stand: the word itself, large, once, then its
   answer placed on a single horizontal line of the 61 reference words (dots, the word the only coloured one) — the
   rank *seen*, not written. Prefer a score over a categorical answer for the stand (no "who: they").
