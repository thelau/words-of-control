# Round 3: sound review

2026-09-23. Sources: `src/audio/*`, measured `.wav` band RMS, spectrograms, `review3` sheets.

## Score: 6/10 (round 2: about 4.5)

**Fixed since round 2:**
- **Voices:** a real Klatt cascade (pulse train, ZOH, crush, doubling per cut).
- **Mix hygiene:** sub cleared, chimes gone, beating capped.
- **Fracture:** transposed strikes with chirps.
- **Black:** an event now, 10–14 dB down for 1.2 s.
- **Plate:** mode jumps land on the Chladni changes (mother, 8.8 s).
- **Gaps:** silent between shots.

**Not fixed:** the mix is still inverted.

| RMS dBFS | appraisal + voices | verdict body | drone |
|---|---|---|---|
| scream | −22…−31 | **−41** (strikes −17) | −39 |
| asdfgh | −20…−29 | −39 | −40 |
| afternoon | −20…−37 | **−37 (8 s, unchanged)** | −37 |
| mother | −20…−27 | −36 | −38 |
| fuck (grains) | −22…−27 | −19 | −40 |

asdfgh (−20.8 LUFS) is as loud as scream (−20.9), and all of it comes from the preamble. Only grains work.

## Where sound and image come apart

- **Fracture:** cracks glow about 2.5 s; the sound ends at about 0.4 s (every chirp starts at ≤ 0.42/speed s).
- **Haze:** light and motes over an unchanged drone (glints about −80 dB).
- **Voices:** they read digits other than those the `numbers` cut shows.
- **`spectrum`:** the voice "vowel freeze" exists only as a comment.
- **Scan:** a 50 ms stepped sine read from the tape, not the scanned surface. It sounds like a melody.

## Fixes, ranked

**1. Verdict above the preamble** (`score.ts`, `clips.ts`)
- **Appraisal `g`:** `0.2·dbToGain(lerp(-10,0,x))`.
- **Voices:** `0.12·dbToGain(lerp(-10,0,x))`. Same `x` as the clips.
- **`CAL`:** measure it (the current values are guesses). Target −18 LUFS short-term at x = 1 and −34 at x = 0.
- **Starting points:** relief +14, fracture +8, haze +10, scan +8, plate +6.
- **Relief bow:** start at `f0·0.9`, not 400 Hz. The lowest modes currently measure −58 dB.

**2. Fracture lasts the shot** (`fracture`)
- Spread ray onsets with the renderer's growth time.
- Add a stress crackle: 0.2 ms clicks at 200/s, τ 0.8 s, into the strike modes at Q 200–600.
- **Grind:** 350 and 1400 Hz bands following shard drift.
- **Level:** body at −24 dBFS on scream.

**3. Haze = lazy afternoon** (`haze`, `drone.ts`)
- **The room slows:** drone oscillators' `detune` to −15·lazy cents, τ 2 s; back after the black.
- **Slat light:** pink noise at 250 Hz–1.8 kHz, −34 dBFS, AM 6 dB by the stripe phase.
- **`open()`:** 3.5 kHz, partials 4–6 up 6 dB.
- **Glints:** 4–6 kHz, one per mote crossing the beam.

**4. Voices read the screen** (`score.ts`, `voice.ts`)
- **`numbers`:** the lead reads the rows' own digits at row timing, ≤ 8/s.
- **`spectrum`:** hold a vowel with F1–F3 at the three tallest bars, or delete the comment.
- **Rate bug:** `stretch = 3.2/rate`. Now it never exceeds about 3 digits/s.
- **Sample rate:** render at 48 kHz. At 16 kHz, resampling removes the ZOH grit above 8 kHz.

**5. The black blooms** (`audio.ts`, `drone.ts`)
- **Hall:** the tail is −60 to −80 dB. Set `hallSend` peak to 2 and wet to 1.0.
- **Duck:** −18 dB, held: `setTargetAtTime(1, at+2.5, 1.5)`. The drone is back within 2 s now.

**6. Scan traces a surface** (`scan`)
- Export the heightfield profile under the laser, like `fractureRays`.
- Glide with `setTargetAtTime` at τ 12 ms.
- **Source:** noise into a Q-30 bandpass, plus the 2nd harmonic at −18 dB.
- **Mapping:** brightness from slope, range ±1 octave.
