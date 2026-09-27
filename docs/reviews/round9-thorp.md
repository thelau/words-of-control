# Round 9 — a data humanist's review (persona informed by Jer Thorp's work; not the real person)

Material: all 8 sheets; full frames war-01 (filled), fuck-02 (marked), mother-04 (tiles), war-05 (cloud),
i_miss_you-06 and spoon-06 (network full), mother-08 (map full), war-10 (globe), mother-11 and i_miss_you-11
(stand), nothing-13 (room). Read GRID.md, the round 8 reviews, and `src/jev/lexicon.json`.

## Whose data is this?

There are three owners, and the piece shows only one of them clearly. **The visitor's words** are shown with care.
They appear as typed, in quotes, and are never stored. That is real respect, and rarer than it should be. **The
machine's judgement** is shown with full candour. war-01 is the best frame in the work: 45 questions, doubt drawn
as noise (PITCH, AGE, CONCRETENESS break up), and the absurd precision of `SACRED 0.690` for war. You feel the
form before you feel the verdict. That is the right order.

**The artist's 61 words** are the third owner, and the one that holds the power. Every "what matters", every
nearest neighbour and every position on the stand's line is measured against them. I opened the lexicon. It isn't
a curated population. It's a **test fixture list**: `asdfgh`, `qwerty`, `xyz123`, `42`, `lol`, `bitcoin`, `海`,
`je t'aime`, `cancer`, `paris`, and the eight review words themselves. The norm that decides whether *mother* is
unusual is partly keyboard mashing. That is ethically fine only if it's declared, and artistically it's the most
interesting fact in the work. Right now it lives in one grey line on the stand: "61 REFERENCE WORDS, CHOSEN BY THE
ARTIST". It's honest, but nobody can read or question it. Every census has a denominator. Here the denominator is
one person's afternoon of testing.

## Does being measured feel like anything?

In places, yes. fuck-02 (SACRED 0.000 marked blue among the reds) and mother-04 (`WHO: THEY 0.870` as the first
tile) produce the small sting of being filed. The stands are the most human frames. On i_miss_you-11, LOSS 0.94
sits beside "WHY DID YOU LEAVE ME WITHOUT SAYING GOODBYE" while SORRY lies at 0. That's a real sentence about how a
model reads grief. The same frame has a flaw: the long neighbour spills past the stage border, over the grid.

The middle doesn't carry this feeling. war-10 is 25 identical globes. mother-08 is a lone pink cross and two labels
in a void. spoon-06 (network) has "DOMAIN: HOME" printed over the header caption and "SHAPE: ROUND" over
"WINDOW". Those frames are about the engine, not about the person. For 8–10 seconds the visitor watches the
classifier admire itself.

**Agency is zero.** You type, you're judged, the screen cuts to black, and you can't answer. The black is powerful
once. After that it reads as a door closing. In *Living in Data* terms, the visitor is a data subject, never a data
citizen.

## Public art?

Almost. It needs three things: a crowd, a trace and a reply. In a public space the most moving dataset isn't the 61
words, it's *what strangers have typed*. You rightly refuse to keep that. There's a middle road: keep only the
**judgements**, never the words. Keep 45 anonymous numbers per submission, in memory only, gone at closing. With
that, the norm can become *the room's* norm by the end of the day, and nobody's words are ever retained.

## Six changes, ranked

1. **Show the denominator.** At the stand, write the 61 reference words themselves as the dots' labels, very small
   and all legible, on a single hold of about 1.5 s. The visitor should see `asdfgh` and `grief` on the same ruler.
   That one frame is the critique.
2. **Let the visitor refuse one answer.** During the hold after mark, one key (say Backspace) strikes out the top
   marked cell. The score recomputes without it, and the stand shows the *second* verdict, with the first one
   crossed out. That's a reply without storage, and it costs one recomputation of `grid.ts`.
3. **A room norm, not stored words.** Add an in-memory, per-session ring buffer of judgement vectors (no text) that
   joins the reference set as unlabelled grey dots, marked "EARLIER TODAY, NOT KEPT". Clear it on reload. Document
   it in DECISIONS.md, since it touches the storage rule.
4. **Give the reference set an author's voice.** Replace the QA list with 61 words chosen *as a statement* (the
   Memorial lesson: arrangement is meaning), and print the rule once in the room. The test mashes can stay in the
   fixtures.
5. **Cut the middle to what names people and words.** Keep the network, whose neighbours are named, and the stand.
   Drop the ring on the globe bar (war-10) and the map when it has fewer than 10 visible points (mother-08). Fix
   the label collisions in spoon-06 and the overflow in i_miss_you-11.
6. **Say what Jev is, at the door.** Put one line in the room, under YOUR WORDS: "AN AI WILL JUDGE THEM. NOTHING IS
   KEPT." Consent should come before the Enter key, not after the black.
