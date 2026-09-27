# Round 10 — studio crit: craft and form (three artists)

Panel: audiovisual (Ikeda / Alva Noto lineage), generative (WebGL, festival screens), modular musician (Barbieri /
Malone). Looked at all 8 sheets; full frames war-01/04/06/07/08/11, love-05, mother-10, fuck-02, spoon-06,
nothing-07, i_miss_you-11, to_be-08; spectrograms of war and love; read GRID.md, audio/render.ts, show/space.ts.

## Since round 8

Much of what we asked for is in. The drone is gone under the steps (war's band below 600 Hz stops dead at the cut).
Pitch now comes from which answer it is and its σ, not its value. The euclidean masks are fixed. The negative mode
works by taking things away. The stand shows the word large on a dot plot. **The stand is now a real ending:** "war",
VIOLENCE 0.98, with FIRE / STORM / KNIFE behind it on the line, is the frame a visitor would photograph. The fill
(war-01) is still the best image in the piece. The tile cut (war-04: seven reds, σ top right) is clean and confident.

**The sequencer is now convincing for tonal words.** Love's spectrogram shows a real pattern: several pitches from
600 Hz to 4 kHz, delay tails stepping down, density rising through bars 3–4. That is a process, not a re-patch. It is
still not Barbieri. Gates are 0.07–0.22 s, `PATCH.oct` still jumps octave on every space, and the loudest thing in
both files is the 48 Hz sub on every beat. For war that makes the steps read as minimal techno: kick + clicks, with
the test-tone blips down near −50 dB. The mark phase is a solid 350–600 Hz slab, the loudest sustained sound in the
piece, in the same register for every word. On both spectrograms the stand is a 1 s tone and then about 3 s of
near-silence. We cannot see the drone "returning under it".

## The ring: busy, and tautological

It is no longer 24 copies, but it still reads as wallpaper (war-07, love-05, nothing-07). The reasons are
structural:
- **The word is always in a corner.** The axes are the answers where the word is most extreme, and each axis spans
  exactly to the word. So every cube says the same thing: a cross at a corner, and the crowd collapsed on a floor
  edge, because the choice answers are near one-hot. Twenty-four views of one fact.
- **The boxes are about 70% of the ink.** Twelve edges per cell, turning, cutting on every beat: 24 things moving at
  once. The eye gets no single event to follow, so it is busy rather than alive.
- **Labels overflow the cells** ("VIOLENCE × DOMAIN × COLOURVIOLENCE × …", war-07 top row).

The axis step has the same flaw. Every word makes the same L: a tall stack at 0 and the word alone at 1
(mother-10, and the sheets for all 8 words).

## Generic vs distinctive

- **Generic:** the network-in-a-box (war-06, spoon-06) is the After-Effects Plexus look, and so is its full-frame
  burst. The map (war-08, to_be-08) is sparse points in clumps of three, labels floating with no axes, one contour
  blob, and a red cross far off: it reads as empty, not as data.
- **Colour** is still split. War and "i miss you" (one hue, lightness by σ) are right. Love (red + pinks), mother
  (pink/brown/yellow) and fuck (red + periwinkle for ANGER) read as a cosmetics palette.
- **The stage is still underfilled.** The network uses about 25% of it in war-07.
- **Collisions remain:** spoon-06's box cuts through the header; in i_miss_you-11 "WHY DID YOU LEAVE ME…" runs across
  GRIEF's leader line.

## Length

The artist is right: it is short, but only because nothing accumulates. **Add 6–8 s, all of it in the structure:**
- **Fill: +1.5 s** (to about 3.5 s). The 45 tones become an audible phrase. It is the best section; let it breathe.
- **Steps: 4 → 8 bars, with a form.** Bars 1–4 as now. Bar 5 is a breakdown: the ring freezes, one space holds full
  frame for the whole bar, one voice remains, and the delay carries it. Bars 6–8 rebuild with the gates lengthening
  (0.3–0.8 s) and the filter opening. The arc is then heard.
- **Stand: keep 6 s,** but make the drone audibly return by second 2.
- **Mark / clear: no more time.**

## Top 6, ranked

1. **Make the ring the sequencer's display.** Cell *i* lights and cuts only when voice A plays answer *i* (the ring
   bars for voice B). Only the playing cell turns; the rest hold still in orthographic view. Drop the boxes and keep
   the ticks. The ring becomes the score you hear: alive, not busy.
2. **Break the tautology.** Pair one marked answer with the unmarked answers Jev is sure of, 2D and orthographic. The
   word then lands anywhere, and each cell says something different. Clip labels to the cell.
3. **The 8-bar form with a bar-5 breakdown** (see Length). Also +1.5 s of fill.
4. **Sound:** sub −6 dB, only in bars 3–4 and bars 7–8. Remove `PATCH.oct`. Longer gates as the form builds. Mark
   tones in the register of the word's stand pitch, not one fixed slab. The drone back under the stand at audible
   level.
5. **Replace or fix the weak spaces.** Drop the axis step: let the stand's dot plot build during the last bar
   instead. Give the map a ground grid, drawn axes and a camera fitted to the data. Replace network-in-a-box with an
   orthographic plan (no box), which is closer to round 8's plates that worked. Fit the stage to 80%.
6. **One hue per word, lightness by σ** (as war already does). Greedy label de-collision on the stand and the
   network. Replace the sentence-length reference items when the artist chooses the real set.
