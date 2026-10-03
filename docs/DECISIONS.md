# Decisions log

Decisions by Laurent that refine or override docs/SPEC.md. Newest first.

## 2026-10-03

- **Open source** ("opensource this, let's keep any confidential info out"): the repository public under MIT; keys only
  in `.env.local` (never committed — history checked); the AI-persona reviews say so.
- **A vintage monitor look** ("more refined … a bit Akira VHS rendering style in pixels and colors", on three references
  of 3D cubic data viz; "could be a shader … you know better"): one post pass over everything — glow, misregistration,
  tape chroma, scanlines, grain; no flashes.
- **No buzz after the mark** ("it makes a zzzzz type of sound"): the held tones of what matters were beating.

- **No strobe; the cells' arrival a glint** ("the white flashing is annoying for some of the analysis, like war"): the
  negative strobe removed (and its silences); a cell's arrival a brief dim glint instead of a white flash. The ending's
  labels never collide ("the graph and the labels conflict on the last screen").

- **Less repetition (after the round-11 reviews: new media artists, curators, spectators)** ("go"): the middle
  earns its length (one to four bars by how unusual the words are) and its order (opening on what is most striking);
  colour from the words (no more shared orange); the ending ≥ 12 s, the words alone first, "also one of the 400",
  no echoes ("love" ends on MANY MEANINGS), nearest words without the words' own family, one count everywhere;
  Jev's doubt as form (false starts, wavering answer, out-of-tune notes); nonsense gets a deadpan short version; words
  in another script are said to be measured against English. Not now: the typing rhythm and a trace of the last
  visitor ("I don't want the last 2 right now").

## 2026-09-28

- **The ring follows the music** ("yes ok", to the proposal): each sequencer note lights a cell — the first voice
  clockwise, the second anticlockwise — the cell turning while it rings, then resting dim; no boxes.

- **Reference words: ordinary language, 400 entries** ("can you pick a much larger set"; "yes, yes"): everyday things,
  people, places, feelings, ideas, actions, short things people say, qualities, and 40 everyday sentences (so a
  sentence is measured against sentences) — docs/reference-words.md, recorded by scripts/reference.ts (the test words
  no longer serve as the norm). "What matters" by rarity among them (the same measure for scores and choices: choices
  no longer win by default). The ending says the answer in plain words ("COMPLETELY SINCERE"). Tested with sentences.

## 2026-09-27

- **Longer, for reading (after the round-10 reviews)** ("it feels all a bit short"; reviewers: time for reading, not
  more 3D): the fill ~1 s longer, the marked cells held ~2 s, the tiles a whole bar, a stripped-back fourth bar, the
  ending ≥ 10 s built name by name ("chosen by the artist" last, alone); the map dropped, the axis step flat; one hue
  per word; tiles as wide as their answer stands out, σ capped, category slots never leading; sub −6 dB, octaves fixed,
  longer notes, the drone returning under the ending. No sentence addressed to the visitor at the ending ("the words at
  the end don't need"). Reference words: parked by the artist.

- **The ring alive again; the ending held** ("the surrounding cells … feel static and boring"; "the last screen is so
  fast I can't see whatever you write"): the small multiples became 3-answer spaces, each turning at its own angle and
  cutting on the beat; the ending holds two bars (at least 6 s), the drone returning under it.

- **After the round-9 data reviews (Tufte, Steele, Smith, Thorp personas)** ("ok let's do"): every cell shows why it
  matters (a strip of the reference words and the word's value); tiles show ±σ; one point per word, no dust or halos;
  the network laid out by likeness on all answers (PCA); the globe replaced by the ending's answer as a dot plot; the
  ring made small multiples of answer pairs (replacing the variant views); the ending a stacked dot plot with leader
  lines, nearest on this answer and on all, and who answered; the header the arc "45 answers → 7 that matter → where
  it stands"; an accent for a white/grey/black word. Open, for the artist: the reference set (it is still the test
  words, e.g. asdfgh, qwerty), and an in-memory comparison with the previous visitor (numbers only).

- **The ring back to variants of the space on the stage** ("I preferred before when it was a duplicate, slightly
  variant, of the one in the centre"): not the film strip of earlier steps (a reviewer's suggestion). Still, no shake.

- **"Your words", above the input (the piece is Words of Control, plural); labels in capitals** (chosen among options): captions, cell names and labels on
  the data in tracked uppercase IBM Plex Mono at ~12.5 px (readable from a few metres); the visitor's word always as
  typed; numbers unchanged. The cells' outlines no longer linger after the analysis.

- **After the round-8 reviews** ("ok go fix", on the proposal): the strobe made safe; the ending shows the word
  among the reference words on the answer that sets it apart (never a category slot), its nearest words, and says
  the 61 were chosen by the artist; one space per bar, chosen by the data, the camera cutting on the beat; the ring a
  film strip of the spaces already shown; the marked cells held longer, their words larger; saturated colours; the
  sequencer rebuilt (pitch from which answer and how far it stands out, fixed patterns, one crescendo, a growing
  delay), negative by subtraction, the drone silent under the steps; a faint "type a word" in the room; the lattice
  replaced by the real table of answers × words; labels never on top of each other.

- **Two more measurements: ambiguity and concreteness** (chosen among four, "so we have a perfect grid"): "How many
  different meanings could the words have?" and "How abstract or concrete are the words?" — 45 answers, a full
  9 × 5 grid. Test words re-recorded (scripts/fixtures.ts), reference lexicon rebuilt (scripts/lexicon.ts).

- **Labels only; the room a line; the ring accompanies; the mood from pleasant to epileptic** ("things pass by so
  fast … anything more than labels is pointless"; the grid before the input "clashes with the input … could be a
  simple oscillating sine in sync with the drone"; "the score at the end is a bit lame" → where it stands (chosen
  among four options); "the inner empty cells should be … duplicating, accompanying what's in the middle"; no
  cropping in the middle; "on the negative side … noise used like a bass … should be more rapid Ikeda-esque"; "the
  more negative the more epileptic, the more positive the more pleasant"; "not the exact same when shown in the
  cells around"). The room is the drone's waveform; the ring shows the same space as angles, scans, sections and
  close-ups; every camera fits its space; negative words cut on sixteenths and strobe, and sound as clicks, 32nd
  rolls, glitch bursts and high sine stabs; positive ones soft, larger points, a quiet chord.

- **Small copy across the piece, a wider stage, the mood range back** ("have small copy across all to explain what the
  score is, nothing is fake but it's all abstract"; "the war version is more rapid but still feel positive, we should
  have this negative/neutral/positive range as we used to have but on this style"; "take 2 more cells on the left
  and same on the right … more landscape than square"). Captions and labels on the data (DOM text), the stage 7 × 3
  cells, the mood bending sound and camera (see docs/GRID.md); the big number drawn from a large digit atlas (it was
  pixellated).

- **Steps in 3D, sharp cuts, a modular sound** ("music is cheesy … Caterina Barbieri type, modular, noise, smart
  beats, Ikeda as well"; "visuals are now too simplistic"; "the sequencing dynamic is ok"; "not a fan of the swoosh
  when grouping … can be sharp cut. Same with the 3D grid becoming flat"; "the data viz not 2D but 3D, very Ikeda point
  cloud or dot connected 3D spaces, map based stuff"). The grid stays flat; the marked cells cut to the square; each
  beat a 3D space of the data (point clouds, networks, terrain, contour map, globe, lattice, ridges, planes); the
  sound a polymetric arpeggiator with wavefolding, euclidean noise and sub, test tones and clicks — no kick, hats,
  clap, bell, riser or glide. See docs/GRID.md.

- **The grid replaces the matrix** ("still gimmicky, not nice", then Laurent's own structure): input → a grid of
  every measurement, each cell its name, value and a small live figure, filling as the results land → only the
  cells that matter remain, in place → they combine into one square at the centre, the result → the result
  switches on a 4/4 beat at a tempo from the word, a different drawing each beat → black. Colour where the key
  results are. "We are getting our own style, Ikeda was an inspiration but we don't copy." See docs/GRID.md.
- **Just the input on the first screen, no species picker**; the room is the same engine (the empty grid), "so it's
  all optimized and seamless". The earlier species (particles, ink, solids, plug-ins), the appraisal cuts, the
  beds and the robot voices are removed; everything is one WebGPU pass ("if WebGPU can do the job then it's better";
  "smooth as hell"; "keep this lean").

- **The matrix cuts at the film's rhythm** ("can't you record videos to check on timing", after "clone this on speed
  of sequence, cut"). Filmed and measured against the Ikeda film: it cut 4 times a second with 3–4 s uncut sections;
  Ikeda's cuts 10.4/s, flashes of 1–2 frames, 28% black, on a ~3 s pulse. Now each section is one or two ~3 s cycles
  (faster for an aroused word): an attack of flicker written by the word's own bits (1 = two frames on, 0 = one; then
  one off; some flashes inverted white, more for an intense word), a hold, a black tail (longer for a sad or lazy
  word); the section's own clock runs on through its flicker. Each flash is heard as a burst of noise over a sub;
  cuts are hard (no ring-out). Blacks are true black (no grain, no vignette). Measured on "war", inside the verdict:
  10.9 cuts/s, 34% black, 1–2 frame intervals dominant.

- **The atlas read as an annual report** ("act as Ryoji Ikeda and his team … it feels like a cheap far away clone …
  more like an annual report"). Replaced by the matrix: no sentences, no charts, no labels but numbers — white on
  black, 1 px, digits from the glyph atlas; six sections cut on frames: scan (the reading as one bit stream), matrix
  (every value of the word and of the reference words, ≈2 700 numbers), zoom (into the number that sets it apart),
  signal (sure = sine, no call = noise, a playhead sounding each band), field (the words as points in space), end
  (one line, one sine). Sound is the same data: pulse train, sine blips, glissando, sine vs noise, clicks, one sine.

- **The atlas shows the machine's certainty** ("what the machine is sure of and what the machine is confidently not
  knowing or doesn't want to make a call on"): a certainty plate (SURE / NO CALL, the near-ties with what it almost
  said, heard as two tones beating), doubtful answers drawn out of focus and wavering everywhere. Also built, as
  recommended: the hand (how the word was typed, replayed at the visitor's pace — nothing kept) and the sigil (the
  word's mark: every answer a ray, its bytes at the centre; it closes the performance, replacing the caption).

## 2026-09-26

- **No theatrical intro for the atlas** ("we don't need most of the intro, only the analysis part"): no title card of
  the word first, no held reading at the end of the analysis; the readings start at once and cut into the grid. The
  grid builds in at most ~5 s.

- **The verdict is the atlas** ("yea good suggestions", after Ikeda's data-verse): the word as a scientific specimen —
  four annotated plates (grid of every answer as an instrument, the most distinctive answer in focus, the crowd of
  every answer against the reference words, the map of valence × arousal with its nearest words), the answers that
  set it apart in red, heard as test tones, clicks and a sub (no beds). It compares against the piece's own reference
  lexicon (src/jev/lexicon.json, scripts/lexicon.ts), never against what visitors typed (nothing typed is kept).
  Particles, solids and ink remain reachable from the picker for comparison.

- **Back to the previous iteration** (solids, particles, ink, full viewport; "looks like crap … go back full viewport
  … if necessary let's go back to solids and particles and ink"). Removed: the film-replay sequence, the 9:16 / square
  frame, the sculpture prototype, pins and strata. New reference for "proper Ryoji work": Data-verse (High Museum,
  2025; references/craft/set4/dataverse.mp4) — real datasets shown as precise, annotated scientific specimens, grids of
  many, rare red/blue, a slow contemplative passage — closest to our appraisal, which the artist has consistently liked.

- **Exactly the film** ("if you can make it exactly as the video … great"): the verdict replays the film's own score,
  measured frame by frame (show/film.ts: 15 cycles of 3.0 s, one character per frame: black, matter, white data slab,
  dim data) — its figures and its order (A, break, B, return). The word fills it (its matter, its readings) and picks
  which cycles it reaches. The random composers are gone.
- **Format: 9:16, the full height of the screen** (works on a phone as is); no border, no reflection ("skeuomorphic").
- **Ink removed** ("it's terrible"). The mood beds are removed from the verdict (the film has no drones: its lows come
  only with its bursts).

- **Clone the film's speed, cuts and format** ("try to clone this on speed of sequence, cut, format"). **Square**, not a
  portrait slab. The sequence turns on the film's cycle (~3 s): an attack of coded flicker (the word's own bits),
  a hold, a black tail; section A, a break, section B strobing, a held last cycle.
- **The music is continuous; the cut is the beat** ("the visual cut is the music beats and tempo … the scenes are part
  of it"): every flash is a burst of noise over a sub, every cut a click; common elements run throughout (thin high
  tones, a soft line under the holds), and each scene's hold brings its own sound (its material's voice, its data).
- **The species become materials the scenes use**: a performance has its own and a second one its scenes turn to.
- (Superseded the same day: the "pulse / break / return" form with random gaps, and the slab/square toggle.)

- **New canon references** (references/README.md "CANON"): Ryoji Ikeda's data.matrix sequence for the STRUCTURE, and
  a set of 3D references for the shots between the data shots. "This + the sequence nullify the previous inspirations."
- **The verdict is a sequence that responds to the word** ("we need a system as a sequence that responds to the
  words entered"): flat data shots of the word's own readings, 3D shots of its species, black silences and data
  strobes alternate on a grid; the tempo, the lengths, what fills the gaps and the rhythm are all the word's.
  "Not cloning Ikeda but massively inspired — ultimately we will define our style."
- **The sound breathes with the sequence** (amends "no drops, ever"): loud on the 3D shots, a floor (−26 dB) and a thin
  tone on the black and the data shots, the data's clicks heard in full — never a dead silence.
- **Ink stays** (not in the references): closer, more organic, darker/shadowed or coloured, a strong render — real ink.

## 2026-09-25

- **Cut: the light and contours species** ("lights and contours look like crap"). Embers carry no surface pattern
  ("the lava style is ugly"). Wanted back in solids: merging forms and cylindrical bodies, as in the first version.
  Ink: closer (macro) and organic, "not a typical screensaver".

- **No clear cases: the species is chance** ("the selection of a species based on the input is not good, I prefer
  the previous randomness (without repeating the last species shown), it makes it less surprising"). Overrides the
  clear-cases decision below: never the last species; among the others, a draw the reading only leans on.

- **Particles: fuller, straighter, walkable** ("sometimes it's too empty … I prefer straight geometric forms
  (lines, columns, dense large fields, a bit of incoherence …) an installation you walk through"): a new formation,
  the hall (a forest of columns of light — one per 1-bit, as tall as its value — laser lines, a floor of lines, a few
  columns off the grid, walked through at eye level); the organic cloud and tube weigh less; 25% more points
  (250k; the costly soft formations use fewer); wide shots aim at the formation's centre, never side-on to a flat
  reading (no more empty corners); breaking splits into spatial shards, not ghost copies.

- **Clear cases pick their species** ("if a visual is more appropriate than others based on some of the scores …
  in specific cases … we still want as much variety as possible"): liquids and smoke → ink; hard objects → solids;
  the machine, nonsense, ordered abstractions → points; a strong feeling with a flowing shape → ink. A clear case
  may repeat the last species, never a third time in a row; the rest (about 60% of the test words) stays a soft
  choice among the species not just seen.

- **The support screen is global** ("if this is launched globally, just remove it"): no single country's helpline
  (Singapore's removed, overrides SPEC §5.3's example); findahelpline.com, which lists free, confidential support in
  every country.

## 2026-09-24 (late)

- **No sound interruption, for every species, at every cut** ("for all, no sound interruption"). The picture cuts;
  the sound carries across: each shot's voice rings on under the next and across the black between shots; ink
  is one continuous voice over all its shots (a cut is heard as the water changing course); the beat counts on
  the verdict clock and never restarts at a cut; floors of beating sines never cancel to silence; the pulsing
  tide never ebbs to nothing. Only the cut to black cuts the sound (into the reverb).
- **Species: the second word must not look like the first** (the daughter's test: "it's the same second time").
  Two performances in a row never share a species; ink is the second species (points being the first). The ink
  must not look like ruled columns. **Every species reacts to the whole reading as the particles do**
  (docs/SPECIES.md is the checklist).

## 2026-09-24

- **No drops, ever** — no sound interruption, no frozen image. A strike is a shockwave and one deep blow; a stutter
  is a beat that does not come.

- **Errors live inside the minimal UI** (overrides the test-stage popup): one quiet line under the word — "no answer —
  press enter to try again" (temporary) or "unavailable — press enter to try again" — the word stays, Enter retries,
  Esc lets it go. Technical cause and fix only in dev, as a fainter second line. Slow networks are not a blocker:
  Jev gets 8 s (was 1.4 s) and a temporary failure is retried once, silently.

- **Input limit 60 characters** (was 24, SPEC §3): a short sentence, still one line. The typed line shrinks only
  when it would outgrow the screen; the appraisal's word and byte rows scale to fit.

## 2026-09-23 (night)

- **The verdict is the appraisal gone 3D, same style** (Laurent: "from that 2D mode … to 3D versions of his style").
  One language across the piece: monochrome, one accent, every mark placed by the word's data, seen through a
  macro lens (references video-a/c/f/h/i). Formations: landscape, city, lattice, cloud, tube, drift (the void).
  The verdict opens on the 3D form of the reading the appraisal showed most. Emotion = behaviour, not new worlds.
- **Kept:** relief (video-d) and Chladni sand. **Retired:** kaleidoscope, mirror/mosaic/strips framings ("matrix
  view is not working" — zoom and camera angles instead), iris, dust, sand dunes/crater/furrow/drain, fireworks,
  glass, haze, and scan ("I hate this visual").
- **References must be studied, all of them** (references/craft/, video-a … video-i + contact sheets).


- **Sand is the core material** ("I like the one that looks like sand moving texture"). **Retired:** the
  fireworks/sparks and the broken-glass fracture ("ugly"). Verdict vocabulary now: sand in five behaviours
  (Chladni, dunes, crater, furrow, drain) seen as sand, dark beads or points of light; relief, dust, haze, scan.
- **Sensory overload, addictive; immense (not infinite) variety.** More randomness per performance; camera
  angles and proximity vary; kaleidoscope / mirror / mosaic / strips framings are welcome.
- **Edit pace follows the word:** dark, violent words cut sharp and fast; calm ones hold long takes. The verdict
  runs longer than before.
- **Appraisal:** keep the original reading types (barcode, numbers, spectrum, bits, scatter, line, word) and vary
  within the barcode family; new reading types were rejected.
- **Voices:** only in the appraisal. No voices under the verdict (unless one day something truly eerie).
- **Sound:** violence as depth — long sub impacts with a beating vibration tail, pressure, rumble — never
  plastic bangs or guns; dragging through sand sounds like stones and water, smooth, never a swoosh. Sound
  needs as much variety as the image (beds drawn per performance).
- **No ML at runtime** for variety: authored generators + combinatorics + randomness.
- Laurent's framing: "in a way it's more *Sensory Words* than *Words of Control*" (title not decided).

## 2026-09-23 (later)

- **Direction v2** (docs/DIRECTION-v2.md): Enter → *appraisal* (rapid, Ikeda-style data) → *verdict* as a
  series of generated micro-clips synthesizing the emotion → *cut to black with reverb tail* → rest. No
  "big bang" return. Sound and image are always one thing (rest, typing, reacting).
- **Numbers and raw data on screen are allowed** during the appraisal, rapid Ikeda style (overrides SPEC §1.1
  "no numbers"). Still no readable labels/emotion names.
- **Voices: robot** (non-AI formant/retro speech) by default; what Jev reads (sentiment etc.) may choose a
  different voice character.
- **Expanded analysis** approved: many more qualities per word, still one Jev call, plus local measures
  (the string's bytes, typing rhythm) never stored.
- The bar: "it just needs to be badass."

## 2026-09-23

- **No caching of Jev answers.** Same word → close reaction only via word-seeded randomness; answers may differ.
- **Every Jev/proxy error shows a popup** at this stage (incl. out of credits), instead of silent FALLBACK.
- **Support = explicit statements only** (distress ≥ 0.50 with the calibrated wording). Ambiguous phrases ("i give up",
  "help me") react normally. *Parked for re-decision later*, possibly with something discreet appearing somewhere.
- **Low-intensity words are not "nothing".** They get an *indifference* mode: time passing, disinterest — the mood of a
  lazy afternoon in the south of France (mood, not visuals). Slow drift, light barely warming, unhurried.
- **Installation** = the same page: a keyboard far away (a typewriter in an empty room) and a large screen showing
  exactly the same thing.
- **Sadness must not be a crying sphere.** Too illustrative. Direction to try: matter losing energy and settling,
  light dimming and cooling, the slowest return.
- **Craft direction** (from references/craft and the four reviews in docs/reviews/): lit granular matter, not
  glowing dots; no default central sun; one topology per emotion; quiet typing; return as a shared signature exhale.
- Open: which emotion owns rings (proposal: anxiety); whether low confidence reads as visible hesitation
  (proposal: yes).
