# Round 11 — artists' crit (repetition)

Four personas, *informed by* the published work of Lozano-Hemmer, Akten, Herndon and Lieberman. They are not those
people. Seen: `sequence.png` first, then the sheets (my father…, spoon, nothing) and 10 full frames (love marked/table/
stand, mother terrain, i miss you network/axis/room, father stand, nothing tiles, spoon fill).

**Verdict on repetition:** yes, it gets boring by the third words. The sequence reads as six copies of one film with
the labels changed. Columns 2, 4 and 5 are near identical across rows: the same orange slab, the same box with a ring,
the same white blob. Five of the six rows are the same orange, because the accent is standing in for "achromatic",
which is common. The fill→mark→clear works as a **ritual** and should stay fixed. What happens after it is also fixed,
and that is the problem: the order of the spaces, four bars, one header, one camera grammar. The one moment that
surprises is the stand: "my father never said he was proud of me" → COMPLETELY SINCERE, nearest "he never came back ·
we broke up · she didn't call back". That is where the data says something, and nothing else in the piece reaches it.

**Lozano-Hemmer (the public as material).** Each visitor is sealed off: the room they leave to the next person is the
same wave it was before them. The piece is about a machine judging the public, but the public never sees itself as a
crowd. Keep the privacy line, since it is part of the work's ethics, and let a *trace without text* carry over. The
next room's drone could be detuned by the last verdict, or the last colour could linger on the wave for a few seconds.
Someone who watches three visitors should see the room remember something it cannot repeat.

**Akten (what the machine sees).** The most revealing thing in the frames is the flatness of the machine's reading:
IRONY 0.997 for spoon, greyed out as doubt, and "completely sincere" for a confession. You filter doubt out
(confidence ≥ 0.45), but doubt is where Jev shows its seams. Right now every word gets the same confident choreography
and the same rhetoric of certainty. Let doubt change the form. A word Jev is unsure of should play differently from one
it is sure of, not just show noise in one cell.

**Herndon (consent, collective data).** The 400 reference words are the norm, and "ordinary language" is a choice made
by an author. The ending now hides that ("400 reference words", with the word "chosen" gone). Say whose norm it is. On
participation: typing gives the visitor a verdict and nothing else. Their hand leaves no mark on the music. Keystroke
*timing* (intervals only, never letters, held in RAM, gone at black) would let the same word typed differently play
differently, with consent built in, since they can see and hear it happen.

**Lieberman (play, delight).** The grid is handsome, but by the third words the 3D spaces feel like a screensaver:
white point clouds that turn, the Ikeda default. I want one small joy you can't predict. When the visitor types a word
that is itself among the 400 (love, war, spoon, "i miss you" all are), the piece should notice: "ALSO ONE OF THE 400",
and its own dot lights up in the plot. Let short words be quick and long sentences be long. Right now a spoon lasts as
long as a father.

## Ranked, buildable changes

1. **Steps, the data picks the shape** (`src/show/grid.ts` score). Number of bars = number of marked answers − 2
   (so 2–5 bars). Tempo already comes from the words. The first space is the one for the answer with the largest |σ|.
   The fixed cloud→network→table→terrain→axis order goes, and so does the fixed header
   ("45 → 7 → WHERE IT STANDS"): show it only on the first words of a session. The ritual (room, fill, mark, clear,
   stand, black) stays the same every time.
2. **Colour, retire the orange fallback** (mark, tiles, stand). When Jev's colour answer is white, grey or black, draw
   that: an inverted stage (grey tiles, white marks, dark type) or pure white. Keep the orange accent for a violence
   or mood extreme only, so it means something again. Driven by the colour answer and its confidence.
3. **Doubt as a form** (steps and stand, driven by mean confidence over the 45 and the doubtful count). Above a
   threshold, the doubtful answers survive the clear as noise cells. The camera stops cutting on the beat and drifts.
   The stand's red line becomes a smear across the confidence range. The caption reads "SURE TO 0.61", not 0.99.
4. **The stand finds the contradiction.** After "nearest on all 45", add the one answer where the words part from
   those nearest ("LIKE HE NEVER CAME BACK — EXCEPT TIME: PAST"). Driven by the largest difference to the mean of the
   3 nearest. If the words are themselves among the reference words, say so, and light their own dot.
5. **The visitor's hand** (room → steps sound). Inter-key intervals, held in RAM only, set the euclidean rotation and
   the swing. The same pattern flickers the room's wave as they type. Letters are never used. The artist must confirm
   this is within the "never store" rule (DECISIONS.md).
6. **The room remembers without words** (room and black). For about 20 s after black, the wave carries the last
   words' colour and the drone keeps its mode, fading back to D. Within one sitting, earlier words appear in the
   spaces as unlabelled crosses (vectors only, never text, cleared on idle). The artist must decide this against the
   privacy rules first.
