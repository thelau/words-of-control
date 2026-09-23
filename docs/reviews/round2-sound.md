# Round 2: sound review

2026-09-23. Sources: `src/audio/*`, `director.ts`, the spectrograms, band-RMS I measured on the `.wav` captures (ffmpeg), the `review2` sheets.

## Verdict

The architecture is right: one clock, a sample-exact appraisal rendered from the tape, one voice per clip, dry cut at black with the reverb ringing on. The **mix defeats the concept**, though. Every word: loud appraisal, verdict near drone level, inaudible black.

| (dBFS RMS) | appraisal | verdict body | after black |
|---|---|---|---|
| scream | −15…−18 | −27…−31 (strikes −18) | −33 |
| mother (relief) | −19…−25 | −30…−31 | −31…−34 |
| dust (grains) | −20…−25 | −33…−36 | −35 |
| nothing (haze) | −17…−21 | −31…−33 | −31…−33 |
| ocean (haze) | −17…−21 | **−19…−20** | −34 |

- **The loudest part of every performance is the preamble.** The verdict, which is the piece itself, comes in 8–12 dB below it.
- **A calm ocean is louder than a scream.**
- **For nothing and mother the black changes nothing below 1 kHz.**
- **Dust's grains sit at −53 dB above 4 kHz**: a full screen of filaments heard as a faint hiss 20 dB under the drone.

## Top 10, ranked

### 1. Rebuild the loudness hierarchy, and calibrate each clip

- **Appraisal** at about −26 LUFS short-term (precise, not big): `g.gain` 0.9 → 0.35 in `playPerformance`. The **verdict** carries the range, −34 (afternoon) to −15 (scream).
- **Per-clip calibration.** Built-in levels differ wildly (sine pad vs noise through narrow bandpasses). In the harness, render each clip at `level = 1` offline, measure LUFS, and store `CAL = { relief, fracture, grains, haze }` in `clips.ts` so every clip lands at −18 LUFS.
- **Level curve** in dB: `lerp(-20, 0, x ** 1.3)` instead of `lerp(0.22, 1, x)`.
- **Master.** Remove the compressor (−20 dB, 2.5:1), which glues the drone to the reactions; limiter at −3, drop `trim`.

### 2. The robot chorus: from synth pad to a machine reading digits

**Now:** a sawtooth into three *parallel* bandpasses, vowels stepping with `setValueAtTime`, 4–11 voices on a just-intonation chord (1, 3/2, 2, 5/2…), live nodes free of the cuts. That is a Moog "vox" preset singing a major chord: toy-like, close to reward music.

**SAM?** Right character, but don't ship it: instant Commodore-64 nostalgia, and the JS ports are reverse-engineered with no clear licence, a risk for an exhibited work. Use it as the tuning *reference*. **Build a Klatt-lite digit reader inside `renderAppraisal`** (already plain JS into a buffer), so voices are sample-locked to the cuts for free:

```ts
// per voice, at 48 kHz; resonator: y = A·x + B·y1 + C·y2
// C = -exp(-2π·BW/sr), B = 2·exp(-π·BW/sr)·cos(2π·F/sr), A = 1 - B - C
src = voiced ? pulseTrain(f0) /* 1-sample impulse: harsher than a saw */ : noise();
y = R(F1,BW 70)(R(F2,BW 100)(R(F3,BW 160)(R(3500,250)(src))));   // cascade, not parallel
// fricatives: noise → resonator (s 5.5k, sh 2.6k); plosive = 30 ms silence + 3 ms burst; formants glide 35 ms, never step
```

**Lexicon.** Digits only, a 10-word phoneme table (French *zéro…neuf* as an option), e.g. zero = Z IH R OW, five = F AY(730/1090→270/2290) V.

**The robot is in the post-processing, not the source:**
- **Monotone f0.** Take D2's harmonic `h ∈ {2, 3, 4}` from `A.s.age`. Drop 3 semitones only on the last digit of each group (Speak & Spell).
- **Sample-rate reduction.** Zero-order hold every `k` samples, with `k = 4…12` (12→4 kHz). No anti-alias filter: the aliasing is the grit.
- **Bit reduction.** `q = round(x·2^(b−1))/2^(b−1)` with `b = 8→3`.

**Per-cut gating: the voices *are* the tape.** `numbers`: each voice reads the exact digits on screen (same `tv(r*7+…)`). `barcode`/`bits`: formants off, raw pulse trains gated by the bits. `spectrum`: all voices freeze on one vowel whose formants are the sine-cluster bars. `scatter`: consonants only. `line`: absolute silence.

**Arc.** Cut 1: one intelligible voice, dry and centred, reads the word's own UTF-8 bytes. Each later cut doubles the voices (1→16) at other tape offsets, ±0.2 s apart, and crushes `k` and `b` further, until the chorus is a wall of consonant noise that cuts to the silent line: *Nummern* through Ikeda.

**Character from Jev.** Age → f0 harmonic and formant scale 0.85–1.25; dominance → fewer, slower, less crushed voices with a louder lead; arousal → 2.5–7 digits/s; tension → bits and jitter; metal/glass → 3 ms feedback comb (tin can); smoke/void → noise source (whisper), k = 12; fire → tanh drive.

### 3. Clear out the sub-bass

The yellow 20–60 Hz columns in every spectrogram are the per-cut "felt" hits (62→44 Hz at 0.32) and the fracture thud (130→**42** Hz): inaudible on laptops, boom in a gallery.

- Delete the per-cut sweep; keep one Ikeda sub pulse on the `line` entry (rectangular-gated 55 Hz, 40 ms, −18 dBFS).
- Fracture thud 180 → 98 Hz over 80 ms.
- Master high-pass: two biquads at 45 Hz, Q 0.54/1.31 (24 dB/oct). 200 Hz high-pass on the reverb *input*. Drone low shelf −4 dB at 150 Hz.

### 4. Make the black an event

Each shot sends 0.45 into one 6.5 s reverb, so every cut smears and the black lands in a wash that is already full.

- **Two spaces.** `room`, a 0.9 s IR for the verdict (send 0.2), keeps cuts hard. `hall`, the 6.5 s IR, is fed *only* in the last 250 ms before `blackAt` (ramp `hallSend` in `cutAt`): the tail blooms once, at the black.
- **Appraisal buffer dry.** Its `s = 0.18` currently leaves the D6 line tone ringing through the first 3 s of every verdict; you can see it at 1.17 kHz in nothing, afternoon and ocean.
- **Drone ducks at the black**: −12 dB in 30 ms, back via `setTargetAtTime(level, blackAt + 1.2, 0.8)`.
- **Brighter IR**: `k = 0.6 − 0.3·t` in `impulse()`. Measured tails are low mud (>1 kHz at −67 dB within 1 s).

### 5. Fracture: hear the cracks

The image: dozens of bright lines racing from the centre. The sound: one low thump, and crazing through Q-90 resonators that measures inaudible (−50 dB above 1 kHz). Scream plays four identical thumps.

- **Share the clip's branch list.** Export `(t, length, angle)` per line from the fracture generator; each becomes a **dispersive chirp** (frozen-lake "pew": sine 7 kHz → 900 Hz over `20 + 40·length` ms, −24 dBFS, pan `cos(angle)·0.8`), rendered into one buffer like `crackle()`.
- **Strike.** A 1 ms click, then 6 inharmonic modes at 600–5 kHz with Q 60–200 (glass) or 2.4× lower (metal).
- **Seeded transposition** (±3 semitones, off-lattice) so repeats don't clone.

### 6. Grains: the sound as dense as the image

- **Real grains.** 1–4 ms Hann-windowed noise bursts in three bands (1.5, 4, 8 kHz), not single-sample impulses through one bandpass. Density from the visible particle count (2–20 k/s), +12 dB after calibration.
- **Motion.** A radial burst (fuck) sweeps the band down an octave and width mono→full over the expansion; swirling filaments (dust) drive pan and tilt from the same flow-noise function.

### 7. Haze: remove the wind chimes

The pings, `D2 × [24, 27, 32, 36, 40]`, are D-E-G-A-B: a **major pentatonic** at 1.7–2.9 kHz, the meditation-app trap exactly. The chord `[2, 3, 4·third, 8]` (5/4 third when valence > 0.6) is a major pad, and the loudest verdict in the set (ocean). Replace them:
- **Open the drone itself**: `drone.filter` to 2.4 kHz, inharmonic modes up. Haze is the room exhaling.
- **Caustic noise**: pink noise into a feedback comb (`DelayNode` 1/(D2·4) s, fb 0.7, ±3% sweep at 0.07 Hz) following the web's drift.
- **Motes** as Ikeda glints: 3 ms rectangular 6–9 kHz bursts, −42 dBFS, when a visible mote crosses a light peak. Calibrate haze to −28 LUFS.

### 8. Relief: bow it for real

`f0` can fall to 37 Hz; the modes sit at 60–350 Hz under a bow lowpass starting at 250 Hz. Mother's verdict measures at the drone's own level: the lit stone relief is silent. Raise `f0` an octave (≥ D3), Q 400–900 so the modes *sing*, body gain ×4, and make the raking light a slow bandpass on the exciter, 400 Hz → 4 kHz over the shot.

### 9. The appraisal, to Ikeda grade

It is close; now make it precise rather than "computer bleeps".
- **Tone bursts.** `blip()` → rectangular-gated bursts starting at zero-crossings, no exponential tail: test signals, not plinks.
- **Saturation.** Delete the global `tanh(1.2x)·0.9`, which softens every click; hard-ceiling only at |x| > 0.98.
- **Cap `spectrum` at 6.5 kHz.** It reaches 9.9 kHz, a piercing sustained sine (the 10 kHz line in fuck, ocean, nothing).
- **Breath gaps** are digital zero with the drone ducked −6 dB. Silence is material.
- **Replay the gesture.** The first cut plays `A.typing.intervals` as 0.2 ms clicks, 4× faster.

### 10. Drone memory and fatigue

- **Beating.** `remember()` sets `beat·(1 + rough·25)`, up to 2.8 Hz, relaxing to `evening.rough·8` ≈ 0.9 Hz. Dust, mother and knife show a regular ~1 Hz tremolo at 110–340 Hz, even *before* the performance: it breaks "nothing periodic under 90 s" and wears over hours. Cap the pair beat at 0.25 Hz; express roughness as gain on the inharmonic modes (2.76, 5.4, 8.93) plus a random-walk AM, τ ≥ 20 s.
- **Residue.** Octaves and fifths only, never thirds (haze feeds its third), or the drone drifts into a major chord over a day.
- **Bug.** `lean()` cancels the filter automation `remember()` scheduled; give lean its own filter.
- **Repetition.** Trim the appraisal −1 dB per performance within 2 min, recovering over 10 min, so it never becomes a jingle.
