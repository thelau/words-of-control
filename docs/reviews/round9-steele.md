# Round 9: the grid as a data story (a critic writing from Julie Steele's published perspective)

*Written as a persona informed by the published views on data storytelling of the co-editor of* Beautiful Visualization *and* Designing Data Visualizations. *Not the real person.*

## The arc: present, but the middle doesn't argue

On paper the piece has a very good three-act shape. The **question** is the full 9 × 5 grid (war-02-marked): 45 answers, each with a small figure, and noise where Jev is unsure. It is dense and honest, and the "CLEARED 1 / 38" counter tells you a process is happening. The **evidence** is the 4–7 marked cells, merged on the stage (fuck-04-tiles). The **verdict** is the stand (war-11, i_miss_you-11). The stand is the best frame in the piece: a one-dimensional strip plot of 61 words, with "war" alone at the far right. You read the rank without any numbers, and it hits.

The ~9 s in between are a mood, not an argument. Cloud, network, map and globe all say "the word sits somewhere among other words" four times over. None of them adds a claim the visitor can take away. The last bar makes it worse. The globe (mother-10) goes back out to **45 answers** after the piece spent 5 s narrowing to 5. Its labels print over the dots ("KIND: LIVING BEING" is unreadable), so the climax of the story is also its least readable frame. A story should narrow toward the verdict, and this one widens just before it.

## What is measured, and against what: the story's weak point

The rule is that an answer "matters" because it stands far from the reference words. But every screen shows the **raw value**, never the distance. In war-02, WEIGHT 0.999, INTENSITY 0.999 and TENSION 0.999 are cleared while LOUDNESS 0.999 is marked. With what the visitor can see, that looks arbitrary. fuck-04 puts SACRED 0.000 next to ENERGY 0.999 as equal "evidence", with nothing to show that one matters because it is low and the other because it is high. The comparison with the 61 words only appears in the last 3 seconds. Until then the visitor can't answer "compared with what?", and that question is the whole point of the piece.

Context is also only half there. "61 REFERENCE WORDS, CHOSEN BY THE ARTIST" is exactly the right admission: short, and it owns the bias. But nothing on screen says who did the judging. The room shows only "YOUR WORDS". The central claim of the work, that an AI judges and the artist performs the judgement, never reaches the wall. Confidence has the same problem. It shows as lovely noise in the fill, then disappears. The verdict looks certain even when Jev wasn't.

## Smaller confusions

- **Stand labels contradict the axis.** In war-11, RAGE sits at about 0.25 on VIOLENCE and is labelled a neighbour. It is a neighbour across all seven answers, not on this one. In i_miss_you-11, "WHY DID YOU LEAVE ME WITHOUT SAYING GOODBYE" runs out of the panel.
- **Clouds give the crowd the emphasis.** In war-05 the unlabelled white mass at the origin outshines "war". None of the reference clusters is named, so "among 61 words" stays abstract. Axes like "COLOUR: RED" read as a category, not a scale.
- **Colour hides a real finding.** War and love are both red (Jev's colour answer). That is a genuine discovery, and it could be the most talked-about moment in the room, but nothing points it out.
- **The header** "147 BPM · NEGATIVE 0.96 · 2 / 21" is backstage metadata. The BPM is heard, not read.

## Ranked changes (all buildable, all labels, no prose)

1. **Show the baseline on every marked tile.** Add a faint tick for the reference words' median and a short line from it to the word's value. SACRED 0.000 then reads as "far below everyone", and the tile *is* the reason it matters. Carry the same tick into the fill for the marked cells as they turn colour.
2. **Make the last bar narrow, not widen.** Replace the globe with the stand's own axis: the camera arrives on the single strongest answer, and the 61 dots fall onto the line, so the stand is where the steps were heading, not a new screen. If the globe stays, move it to bar one ("ALL 45"), where widening belongs.
3. **Name who is judging, once.** On the stand, next to the artist line: "45 QUESTIONS ASKED OF AN AI · 61 REFERENCE WORDS, CHOSEN BY THE ARTIST". This is the framing the whole piece depends on.
4. **Name 3–5 reference words in every space**: the nearest and the farthest. Dim the reference crowd so the visitor's word is the brightest mark in each frame (war-05, spoon-08).
5. **Fix the stand's neighbours.** Label the words next to it *on this axis*, and give the overall nearest words a separate mark ("NEAREST OVERALL"). Wrap or cut long reference phrases inside the panel.
6. **Keep doubt visible to the end.** Carry Jev's confidence into the stand: blur or halo the word's dot by its uncertainty, and add a small "SURE 0.93" beside the value. Swap BPM in the header for the story's own steps: "45 ANSWERS → 7 THAT MATTER → WHERE IT STANDS".

The beauty is already there. What's missing is the one thing a data story needs from its first frame: *compared with what.*
