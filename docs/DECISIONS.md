# Decisions log

Decisions by Laurent that refine or override docs/SPEC.md. Newest first.

## 2026-09-25

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
