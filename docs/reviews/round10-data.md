# Round 10 — data-visualization panel (personas after Tufte, Steele, Thorp; not the real people)

Seen: all 8 sheets; full frames war-02, fuck-04, love-05, spoon-06, war-08, mother-09, war-11, i_miss_you-11.
Read GRID.md and `src/show/space.ts`.

**Tufte.** Most of what I asked for is there. The strip repeats the stand's graphic 45 times and shows the cause:
in war-02 TONE's line sits far outside its mid-scale crowd. The ±σ on the tiles, ordered by |σ|, says why each
tile is on the stage. The cloud is one point per word, with stems and named neighbours, and it is honest. Four
things still aren't. The **map** still draws each word as 8 jittered points (`gauss()*0.006`), which is the dust
back at a smaller size, and it has no box, ticks or scale. The **network** joins the word to its 8 nearest *in
45 dimensions*, drawn inside a 3-D PCA projection. In spoon-06 the red links cross half the box to nodes that
aren't TABLE/WINDOW/GLASS. The **axis step** orbits a 1-D dot plot in perspective (mother-09). Its scale
foreshortens, 0 and 1 swap sides compared with the stand, and 0 is unlabelled. **Tile hue and lightness still
encode nothing**: in fuck-04 ANGER +3.5σ and SACRED −1.8σ are both blue. And σ on bounded confidences inflates:
ACT SWEAR +9.8σ mostly reflects a tiny reference spread.

**Steele.** The arc now reads. The header "45 ANSWERS → 7 THAT MATTER → WHERE IT STANDS" says the story once,
and the stand answers *compared with what*. It keeps the neighbours on this axis (FIRE, STORM, KNIFE) apart from
the nearest on all 45, and it names Jev. The middle still widens, then narrows: tiles (7) → network (45) → map
(2) → axis (1). Cloud and network argue; the map decorates. The ring is now true small multiples, but it says
"the word sits in a corner" 24 times, and each cell turning at its own angle defeats comparison. Labels still
collide ("COL…EMOTION", love-05), and the long phrase in i_miss_you-11 runs past the stage and over LONELINESS.

**Thorp.** The stand is the human frame. "i miss you" at LOSS 0.94 is *not* the extreme: WHY DID YOU LEAVE ME
and GRIEF sit beyond it, a real finding seen without being written. "SURE TO 0.88" keeps the doubt alive. The
denominator is still hidden: 61 dots without names, so nobody sees `asdfgh` on the same ruler as grief. And
nothing at the door says an AI will judge you.

**On length.** Longer by 4–6 s, but only in the *reading* phases: hold the marked grid ~2 s, not 1 (the strips
need reading); give the tiles a full bar (σ is the argument); take the stand from 6 to ~9 s (the dot plot, then
the reference words named). Pay for part of it by dropping the map. Keep the 3-D middle ≤ 8 s: its job is
momentum, not proof.

## Joint ranked changes

1. **Tiles encode σ.** Widths ∝ |σ|, flat lightness. Cap σ, or write "OUTSIDE ALL 61" beyond the range. Show
   category answers as "SWEAR · 99%".
2. **Axis step flat and fixed.** Same orientation as the stand (0 left, 1 right), both ends labelled, no orbit.
   It cuts on the beat by the stacks drawing in, so the stand is where the steps arrive.
3. **Drop the map; one point per word everywhere.** Remove the 8-point jitter.
4. **Honest network.** Link only to the nearest *in the projection*, or dash the 45-D links and caption them
   "NEAREST ON ALL 45". Print "3 DIRECTIONS · N% OF THE VARIATION", with N computed.
5. **Hold the ring's camera.** One shared view and axis order in all 24 cells, cutting together on the downbeat.
   Truncate labels per cell.
6. **Name the denominator.** In the stand's added ~3 s, write the 61 reference words under their dots, small and
   wrapped inside the stage. One line in the room: "AN AI WILL JUDGE THEM. NOTHING IS KEPT."
