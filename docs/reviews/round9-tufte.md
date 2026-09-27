# Round 9 — a review after Tufte's principles

*(A critic applying Edward Tufte's published principles; not the man himself.)*

## The evidence

There is one honest graphic in this piece, and it comes last. The **stand** (`i_miss_you-11-stand`, `war-11`)
is a one-dimensional dot plot: 61 reference words along LOSS from 0 to 1, the visitor's words among them in their
colour, with the rank shown by position rather than stated. It uses little ink, has real scales and a sourced
comparison set ("61 REFERENCE WORDS, CHOSEN BY THE ARTIST"). The rest of the piece should be measured against it.
Even the stand has two faults. The dots near 0 pile on top of each other, so thirty words look like twelve. And the
nearest words (SORRY, WHY DID YOU LEAVE ME…) are chosen by distance on all 45 answers but plotted on LOSS alone.
SORRY sits at 0.1 as the "nearest" word and says nothing about why. Two different measures share one line without
being told apart.

**The grid** (`war-01-filled`) is a good macro design: 45 cells, the same layout for every word, labels and numbers
in the same place, so readers learn it once and can compare across words. The micro level is weak. A sine whose
*frequency* encodes the value is a poor encoding: nobody can tell 0.972 from 0.999 by counting cycles (WEIGHT,
TEMPERATURE, INTENSITY). VALENCE 0.000 still draws a wave, so zero shows as something. The numeral carries all
the information and the sine is decoration. The choice cells (bars across the options) are real small distributions
and should stay. The deeper problem is that each cell shows the value, while cells are marked for their *deviation
from the reference words*, and that reference is drawn nowhere. In `war-02-marked`, TONE 0.992 turns red while
INTENSITY 0.999 does not. The viewer cannot see why. Cause and effect are hidden, and that is the central fault in
the piece's integrity.

**The tiles** (`war-04-tiles`) make it worse. VIOLENCE is bright red and COLOUR dark red at the same 0.980, so the
lightness reads as magnitude but encodes nothing. The numbers mix two quantities: "COLOUR RED 0.980" is Jev's
confidence in a category, while "LOUDNESS 0.999" is a magnitude, and both use the same type. In `fuck` the tile SACRED
0.000 gets the same area and colour as ANGER 0.999.

**The 3D spaces.** `cloud` draws each of the 61 reference words as 150 Gaussian-jittered points, then adds 4,000
random "dust" points (`space.ts`, `dust(4000)`). That is about 13,000 marks for 61 observations, and the dust (about
a third of the points) is pure noise styled to look like data. It fakes density and is the clearest chartjunk in the
work. The `network` draws "nearest" links computed in 45 dimensions inside a 3-dimensional projection. In
`spoon-06-network-full` the eight red lines to its nearest words run the whole width of the box, so the picture says
*far* while the caption says *near*. The `map` (`war-08-map-full`) has no axes, no ticks and no scale: two floating
labels, a cross on a stalk and one contour island. It is mostly black and says little. The **globe**
(`mother-10`, `war-09`) is a radar chart wrapped round a sphere. It hides half its 45 values behind the other half,
labels four, and shows again, less legibly, what the grid already showed well.

**The ring of 24.** Small multiples work when the frame stays the same and one variable changes. In `war-05-cloud`,
16 of the 24 cells are near-empty dust. In `mother-10` all 24 are the same globe at slightly different angles, which
is repetition, not comparison. In `war-09` the "sections" carry diagonal slab planes that nothing explains. The
network ring (`love-07`) comes closest: plan, front and side drawings that could be read. As it stands the ring is
wallpaper.

**Colour and type.** Using Jev's colour answer as the highlight hue is a good idea: a nominal colour for a nominal
choice. It fails when Jev answers white, black or grey (`nothing`, `to be or not to be`): the highlight merges with
the white data-ink and the smallest effective difference disappears. The tracked Plex Mono capitals are calm and
well ranked. Labels collide, though. In `spoon-06`, DOMAIN: HOME runs over the header and WINDOW over SHAPE: ROUND.
In `mother-10` the labels sink into the globe's points. In `i_miss_you-11` the nearest-word label crosses the
stage frame.

## Six changes, ranked

1. **Put the reference into every cell.** Replace the sine with a strip: 61 hairline ticks for the reference
   words on 0–1, the word's value as a bold tick, and the width of Jev's doubt as a grey band. The marking then shows
   its cause (the tick outside the pack), and the grid becomes the stand's graphic repeated 45 times.
2. **One mark per observation.** Remove `dust()` and the Gaussian halos. Draw 61 points for 61 words, the word
   larger, and label the box's axis ends 0 and 1.
3. **Encode what selected the tiles.** Order the tiles by distinctiveness, let size or lightness stand for that
   (stated in the caption) or keep them flat, and set confidence apart from magnitude (e.g. "RED · 98%").
4. **Make the ring true small multiples.** Keep one view and one pair of axes, and change a single thing per cell:
   one marked answer against another, or the word against each of its 24 nearest words, each highlighted in turn.
5. **Replace the globe; fix the network.** The last bar should return to the macro view: the 9 × 5 grid in
   miniature, the marked cells lit. Link the network only to neighbours that are close in the space shown, or
   caption the lines "nearest on all 45" and draw them dashed.
6. **Label discipline and a fallback hue.** Place labels to avoid collisions. Give every space its axes. On the
   stand, stack dots that coincide and caption the nearest words "nearest on all 45 answers". When Jev's colour is
   white, black or grey, highlight with a fixed accent instead.
