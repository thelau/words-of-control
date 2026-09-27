# Round 8 — five visitors, one word each (the grid, step-25+)

Imagined from the real frames in `docs/captures/review/` (all 8 contact sheets; full frames: war filled / network /
cloud-full / stand / room, love marked, fuck tiles, mother globe, i miss you ridges, spoon's white frame). Words the
visitors "type" are mapped onto the captured words so the reactions describe real frames.

## The visitors

**Maya, 16, with her dad — types `fuck`** (of course).
- "The boxes filling up with little waves is sick. Then it went *act: swear 0.999, emotion: anger 0.999* and I died."
- "Sacred 0.000 was the funniest thing in the museum." Then white flashes, fast, for ages: "okay my eyes hurt."
- Dad: "Why is 'anger' blue?" She films the swear tiles and the end card for her story; nobody films the 3D cubes.

**Hélène, retired nurse — types `mother`.**
- The coloured blocks (pink, brown, yellow — *living being, tender, home, soft*) move her: "It understood."
- Then a spinning globe with labels printed on top of each other; she can't read them from where she stands.
- The ending: **who: they 0.87**. "They? My mother isn't *they*." She leaves slightly hurt, and doesn't type again.

**Sam, software engineer, on a date — types `love`; his date types `i miss you`.**
- He clocks it fast: "45 features, top outliers vs. a reference set, then embeddings as point clouds. Nice shader work."
- *emotion: tender 0.99* lands; the date smiles. Hers: stamped **negative 0.55**, a few white flashes on a sad sentence,
  and the ending **act: statement 1.00**. "It told me I made a statement." A laugh, a bit deflated.
- They'd type a third word to compare. He'd post the grid fill, not the ending.

**Kenji, tourist, little English — types `war`** (it's on the news).
- The grid is gibberish ("phonetics", "concreteness") but the numbers, the red and the sine waves he gets: it's measuring.
- The marked red cells and *"war"* labelled among *knife, fire, rage* he half-understands. That line was tiny, bottom-left.
- The strobe at 147 bpm makes him step back. **violence 0.98** he understands; "above 61 of 61 words" he doesn't.

**Jonas, art student, skeptical — types `to be or not to be`, then `nothing`.**
- "Ikeda with a tooltip. The cubes are interchangeable; globe, cloud, ridges, whatever the word." Bored by beat 10.
- But **material: void 1.00** for *nothing* gets him: "okay, that's a good line." The rank bugs him: 61 *which* words?
- Would come back for the grid fill and the endings. Would not film the middle.

## What happened, across them

- **Understood:** the fill ("it's measuring my word") and the marked tiles ("these are what makes it *my* word"). That
  merged block of 4–7 labelled colours is the most legible, most filmable, most shared frame of the piece.
- **Lost:** the 3D spaces. Striking for 2–3 beats, then a screensaver. Nobody could say what differed between words
  in this part. The only human sentence in it, *nearest: knife, fire, rage*, is 10 px of grey in a corner.
- **The ending** works when the answer is a word people would say about their word (violence, void, tender, metal),
  and fails when it's a category slot (*who: they*, *act: statement*). "above N of 61 words" reads as a score, which
  makes people want to beat it (good), but nobody knows the 61 (cold).
- **The room** shows a cursor and a line, nothing else. Maya's dad asked "do we type?" A newcomer won't know.
- **Second word:** yes for Maya, Sam and Jonas (to compare, to beat the score); no for Hélène (hurt by the ending).

## The strobe: yes, too much, and it's a safety issue

From `src/main.ts`, the chance of a white frame per sixteenth is `neg × (0.3 + 0.7 × arousal) × 0.5`. For *war*
(neg 0.96, arousal 0.92) that's ~45% of sixteenths at 147 bpm, **~4.5 full-screen white flashes a second**. For *fuck*,
~50% at 150 bpm, **~5 a second**, for about 8 s. That's above the 3-flashes-a-second limit (WCAG 2.3.1 / Harding) for
photosensitive epilepsy, full-field, near-white on black, in a dark room. Two more problems: it leaks. *i miss you*
(negative 0.55) flashes about once a second, on a sad sentence. And *spoon* (neutral 0.74) was captured on a white
frame (spoon-03). One flash in a burst is punctuation. Five a second is what makes people step back.

## Fixes, ranked by impact

1. **Make the strobe safe and rarer.** At most 3 flashes a second, lower on a word that's sad but calm: gate it on
   arousal × negative, e.g. only above 0.6 each. Never a full-field near-white. Flash the stage only, or a dim tint of
   the word's colour. No flashes on neutral words. Post a photosensitivity notice at the entrance anyway.
2. **End on a human answer.** Pick the stand answer from the ones a visitor would say (scores and concrete choices).
   Leave out the category slots (*who*, *act*, *kind*) unless nothing else stands out. Replace "above 61 of 61 words"
   with the nearest reference words, e.g. "more violent than every word it knows · closest to knife, fire, rage".
3. **Promote the neighbours.** When the word appears in a space, show its three nearest words big, next to it, for one
   beat. It's the one moment in the middle that says something about *this* word.
4. **Hold the marked tiles for two beats, not one.** It's the part people understand and film.
5. **Invite typing.** A faint "type a word" in the room until the first key. During the steps, show the word itself
   larger than the 10 px header.
6. **Fix label collisions and size** in the spaces (mother's globe: *emotion: tender* printed over *kind: living
   being*). Size the labels to be read from 2–3 m.
7. **Leave a trace for the second word.** The previous word's stand line stays faint in the room until the next Enter,
   so couples and friends compare.
