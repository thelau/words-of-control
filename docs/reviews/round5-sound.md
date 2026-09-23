# Round 5: sound review

2026-09-23. Sources: `src/audio/*`, 0.5 s band RMS of 7 `.wav` files, spectrograms, `review7` sheets.

## Score: 6/10 (round 3: 6)

**Works:**
- **War and rage** hit: the verdict is 3–8 dB over the appraisal, with real pressure at 20–150 Hz.
- **Appraisal:** test tones, clicks and the D6 line are clean Ikeda grammar.
- **Hall tail:** blooms at −38…−45 dB for 3 s after the black.

**Doesn't:**
- **Calm words:** the verdict is still quieter than the appraisal (table).
- **Sound and image don't match.** The image is thousands of fine points. The sound is a 60–400 Hz wash with about one 1 kHz blip a second (love). Above 2.5 kHz the verdict sits at −50…−75 dB: the plastic middle, not Ikeda's extremes.
- **Sand, the core material, has no sound.** Chladni's hiss is white noise above 4 kHz: a swoosh.
- **Swooshes remain:** the `swells` bed, the `swell` accent, `breath`.
- **Impacts are thumps:** τ 0.2 s (`sub`) and 0.35 s (`drop`). A 24 dB/oct high-pass at 45 Hz shaves the depth.

| RMS dB | appraisal | verdict | Δ |
|---|---|---|---|
| war | −24…−29 | −15…−24 | **+8** |
| rage | −22…−29 | −17…−28 | +3 |
| looks like crap | −22…−26 | −20…−36 | 0 |
| spoon | −33…−36 | −37…−42 | **−5** |
| grief | −25…−28 | −27…−37 | **−6** |
| love | −24…−30 | −33…−37 | **−9** |
| silence | −27…−29 | −38…−42 | **−12** |

## Fixes, ranked

**1. Verdict over appraisal** (`score.ts`, `clips.ts`, `beds.ts`)
- **Appraisal and voices:** scale both by `dbToGain(lerp(-9,0,x))`.
- **Clip floor:** −20 → −11 dB.
- **Bed floor:** `lerp(-32,-15)` → `lerp(-24,-14)`.
- **Target:** the verdict +4 LU over the appraisal at x = 0, +8 LU at x = 1.

**2. Points heard as points** (`clips.ts` `data()`)
- **Grain layer:** 300–3000 events/s, 0.1 ms impulses plus 2–4 ms sine grains at 6–15 kHz, at −30 dBFS.
- **Mapping:** pan = the point's x; bokeh → low-pass from 16 down to 5 kHz.
- **Cloud FM:** carrier from 200–2000 Hz up to 3–12 kHz.
- **Under landscape and city:** a 36–50 Hz sine floor. Empty the 300–1500 Hz band.

**3. Deep impacts with a tail** (`beds.ts` accents, `audio.ts`)
- **Replace `sub` and `drop` with `impact`:**
  - sine sweep 90 → 41 Hz over 70 ms, with a partner +0.8–1.6 Hz above (the beating tail);
  - amplitude τ 2.5–4 s;
  - `tanh(1.2x)` for harmonics that laptops can play;
  - a 150–350 Hz noise body, τ 60 ms.
- **When:** dark words' shot starts and the Chladni mode changes.
- **Master high-pass:** one biquad at 28 Hz, Q 0.707.

**4. Stones and water, never swoosh** (`beds.ts`, `clips.ts` `chladni`)
- **Delete:** `swells`, the `swell` accent and `breath`.
- **Chladni hiss → grains:** Poisson impulses at 80–600/s, the density following sand velocity (τ 0.6 s after each mode change).
- **Stones:** the grains into 4 resonators at 700–2600 Hz, Q 15–30.
- **Water:** Minnaert chirps, 400 → 1500 Hz over 5–15 ms.
- **Reuse:** the same engine becomes a `sand` bed.

**5. Retire the preset synths; add Ikeda beds** (`beds.ts`)
- **`choir` and `pressure`:** raw saws → sine clusters and bowed-plate modes, beating at 0.3–1.5 Hz.
- **`bells`:** FM chimes → struck plate modes.
- **New beds:**
  - `sinefield`: 14–17 kHz dyads;
  - `datarain`: click streams;
  - `subfloor`: 36–41 Hz with slow AM.
- **Per performance:** `rand` also picks the register, rates and filter ranges.

**6. Trace, don't whistle** (`clips.ts`)
- **`scan`:** still a stepped tape melody (round-3 fix #6). Use noise into a Q-30 band-pass, glided with τ 12 ms along the real profile.
- **`tube`:** a steady 0.12 sine plus its fifth is a test-tone whistle. Hold it at most 1–2 s, then break it into grains.
