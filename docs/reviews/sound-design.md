# Words of Control: sound design

Review date 2026-09-23. Scope: SPEC §9, `src/audio/*`, `engine/params.ts` and `engine/field.ts`, capture sheets, `references/craft`.

## 1. Concept: sand on a plate

The machine cannot speak, so its sound should not be *music about* emotions. It should be the sound of a **material being appraised**. The visuals already name that material: lit granular matter, glitter dust, embers and a central star. `sand-rings.jpg` is practically a Chladni figure. The whole piece is therefore **one physical instrument: a resonant metal plate with grains on it.**

- Rest is the plate humming in a draught.
- Typing is a fingertip on its housing.
- A reaction is the plate being excited in a new way: struck, bowed, rained on, choked.

The visible particles are the audible grains. All nine gestures share one body (a modal resonator bank), one space and one tuning lattice; only the **exciter** and the **damping** change.

**Register.** The body runs from D2 (73 Hz) to D7 (2.3 kHz). Glitter sits at 4–10 kHz and is always short. There are no fundamentals below 60 Hz; gallery rooms turn deep sub into boom.

**Tuning: keep D, drop 12-TET pentatonic.** A switched major/minor pentatonic sounds like wind chimes, which is the meditation-app trap. Use **just intonation on D's harmonic series** instead, in the spirit of Kali Malone:

| light | Ratios over D | Character |
|---|---|---|
| > 0.6 (otonal) | 1, 9/8, 5/4, 3/2, 5/3 (+7/4 for awe) | Partials of one body; bright, fused |
| 0.4–0.6 | 1, 9/8, 4/3, 3/2, **no third** | A neutral word stays undecided |
| < 0.4 (utonal) | 1, 6/5, 4/3, 3/2, 8/5 | Subharmonic, dark |

## 2. Rest: the drone

### Critique of `drone.ts`

1. **It sounds like a patch, not a material.** Detuned saws into a 320 Hz lowpass are the most recognisable preset timbre in electronic music.
2. **The D1 sine at 36.7 Hz (gain 0.45) is the loudest part and mostly inaudible.** Laptops and gallery speakers can't reproduce it. It still eats limiter headroom, excites room modes and makes the −18 dB bus compressor pump under every reaction.
3. **The static D–A fifth becomes wallpaper within an hour.**
4. **The memory is 3 values that relax to exact neutral in about 25 s**, and `cancelScheduledValues` means each reaction erases the previous one. Nothing accumulates.

### Proposal: the drone is the plate at rest

- **Body.** 16 modes of the shared modal worklet (§8): D harmonics 2–12 plus 4 plate modes (×2.76, ×5.40, ×8.93). T60 is 4–8 s.
- **Excitation.** Pink noise at about −60 dBFS, band 80 Hz–3 kHz, amplitude-modulated by two incommensurate random walks (τ 40 s and 7 min).
- **Movement.** Partial pairs are detuned 0.07–0.3 Hz, so beating drifts over minutes (Radigue). No periodic modulation is shorter than 90 s.
- **Fundamental.** D2 plus harmonics 2–4 through soft `tanh`. The fundamental is then implied even on small speakers. Delete the D1 sub.
- **Level.** −40 dBFS RMS.

**The room remembers, on three timescales.** The memory is an additive state vector: each reaction *adds* to it and the vector decays. Nothing is overwritten.
- **Residue (τ ≈ 35 s).** The reaction's final chord stays as 1–3 lifted drone modes. The screen forgets; the plate is literally still ringing.
- **Colour (τ ≈ 25 s):**
  - `rough` sets beat rate and AM depth.
  - `width` sets side gain.
  - `bright` sets tilt.
  - `hollow` drops the fundamental −6 dB after a `loss` accent.
- **Evening (τ ≈ 20 min, 8% of each push).** A day of "war" leaves a rougher, darker room than a morning of "ocean". It is 5 floats; no text is stored.

## 3. Typing, Enter, the wait

### Critique of `keys.ts`

- **No wood.** A resonant lowpass on noise gives a *thud*; there are no modes.
- **Too loud.** The clicks sit about 15 dB above the drone.
- **Random per press.** The same key should sound the same, as on a real keyboard.

### Proposal: the fingertip on the housing

- **Sound.** An 0.8 ms impulse drives 3 heavily damped inharmonic modes (≈190, 470 and 1,380 Hz, T60 25–45 ms), plus a 1 ms tick at 6 kHz.
- **Variation.** Hash `event.code` into ±6% mode frequency and ±1.5 dB. A word then gets a rhythm signature but no melody. The modes are off-lattice, so §9.2 still holds.
- **Backspace.** −5 dB, top mode removed.
- **Levels.** Peak −24 dBFS. Keep the limit beep (1.8 kHz, 2 ms ramps, −30 dBFS); its foreignness is correct.

**Charging.** Keys raise `charge` from 0 to 1 over 12 keystrokes, matching `field.tensionTarget`. Charge drives a **sand hiss**: grains of 0.5–2 ms, band 2–6 kHz, density rising from 2/s to 40/s. The drone's excitation rises by up to +3 dB. 

**Enter: the machine holds its breath.**
- The drone's upper modes damp by −6 dB over 150 ms.
- The hiss freezes and narrows.
- No loader sound: ANALYZING is audible tension inside "drone only". Ignition spends the charge.

## 4. The nine gestures

**Timeline.** D = 5 + 5·intensity.

| Phase | Time |
|---|---|
| I, ignition | 0–0.3 s |
| R, release | 0.3–1.5 s |
| P, peak | to 0.6D |
| Dc, decay | to D |
| Ret, return | D to D + 3 s |

**Voice.** Exciters (strike, grains, bow, tone, pluck) → shared **body** (24 modes) → M/S width → space.

**Blending.** The body is **morphed**: one set of mode frequencies and T60s, weight-averaged, so the instrument stays one. The exciters are **summed**, with layer gain = `w_e` (already p^1.5-sharpened); layers with w < 0.12 are dropped. Sadness 0.6 + tender 0.3 then gives falling tones through a closely held beating pair, a hybrid nobody designed.

**The centre rule in audio.** Every ignition is mono and dead centre. **Stereo width (side gain) is the particle radius**, driven by the same curve as the visuals.

| | Recipe |
|---|---|
| **anger** | **I:** 3 ms white burst + sine 150→73 Hz over 90 ms, `tanh` drive 4, LP 1.2 kHz, −6 dBFS. **Shockwave:** noise BP (Q 2) sweeping 7 kHz→250 Hz over the ring's expansion (~400 ms), heard as a falling tear locked to its radius. **R–P:** grain storm of 150–350/s, 2–6 ms, 1–8 kHz, through the body with +40% inharmonicity and a 45/32 tritone mode, AM 23–37 Hz (roughness). **Dc:** embers, Poisson crackles thinning from 10/s to 1/s, each ringing one high mode for 120 ms (cooling metal). **Ret:** body damped. |
| **calm** | **I:** soft 8 ms mallet on D3. **R–P:** band noise *bows* D3/A3/D4 modes (Q ≈ 400), attack 1.4 s, one sustained tone. The M/S circle rotates at the disc's angular speed; sparse soft grains at 5/s. **Ret:** even τ 1.2 s, resolves to 1/1. |
| **tender** | **I–P:** two FM tones (index 0.25) on D4, 1.2 Hz apart (a slow beat), or 9/8 when closeness is low. 12 ms attack. Narrow (side ≈ 0) and dry (wet −8 dB). **Ret:** the pair drifts to a 3 Hz beat as it fades, loosening the cluster. |
| **joy** | **I:** ping on D6. **R:** rising arpeggio of modal bells (partials 1, 2, 2.76, 5.4) up the otonal set, inter-onset 70–140 ms, drifting +10 cents. **P:** glints, 1–3 ms grains at 4–9 kHz; density = lit fraction × 60/s, pan scattered full width. **Ret:** glitter "falls", with grains gliding down an octave while thinning. |
| **awe** | **I:** near-silent D7 sine for the star; no transient. **R–P:** the **harmonic series unfolds upward**. Partials 2, 3, 4, 5, 6, 7, 8, 9, 12 enter every 350–600 ms, one per visual ring, each with a decorrelated pan, in the large reverb. **At peak nothing moves**: no AM, no grains. **Ret:** uniform dimming, τ 2.5 s, into the drone residue. |
| **sadness** | **R:** a bowed ring tone on D3 + 6/5, LP 1.8 kHz. **P:** "tears", tones of 400–900 ms at 1.5–3/s, each gliding *down* 6/5 to 4/3, with pan following the droop. 4.5 Hz vibrato, ±6 cents. **Ret:** the last tone sags −30 cents as it fades. |
| **fear** | **I:** an **inhalation**, a 250 ms reversed noise swell. The drone ducks −10 dB (the void). **P:** thin tremolo, D6 against 16/15, −30 dB, irregular AM at 11–17 Hz, near-mono. **Late P:** **silence**; everything stops over 60 ms. **Ret:** one dry body click on the visual snap home, then the drone returns over 1.5 s. |
| **anxiety** | Damped strikes with inter-onset times on a random walk between 70 and 190 ms, never quantised. A sustained D4 follows the ring's radius wobble (±35 cents) from the *same* noise function. It hangs on 15/8 vs 16/15 and **never resolves, even at high confidence**. The jitter outlasts the visuals by 1 s. |
| **playful** | Karplus-Strong plucks, the piece's only strings, with decays of 40–400 ms (mixed grain sizes). 3:5 or 4:7 polyrhythms with octave leaps. Pan traces the visual Lissajous (sin 3ωt, sin 2ωt). **Ret:** a slide that overshoots a third and settles. |

## 5. Modifiers

| Input | Audio |
|---|---|
| intensity | Layer gain −18→0 dB (∝ i^1.6), grain density ×0.4→×1.6, duration |
| energy | Pulse, arpeggio, grain and AM rates ×0.6→×1.8; shock-sweep speed |
| hardness | Attack 25→0.5 ms, inharmonicity 0→+40%, high-mode T60, LP 1.5→9 kHz |
| weight | Register ±1 octave, low shelf +4 dB at 120 Hz, glide bias (heavy sags, light lifts) |
| temperature | Tilt ±3 dB/oct around 1 kHz; hot adds `tanh` warmth, cold adds sine purity and glitter |
| scale | Crossfade the small (1.2 s) and large (6 s) convolvers; pre-delay 5→60 ms; maximum width |
| light | Pitch set (§1), body brightness |
| confidence | Resolution vs suspension (below) |
| violence > 0.5 | Anger strike + noise burst on the visual shock pulse |
| loss > 0.5 | **Root removed**: body mode 1/1 muted, gestures skip it and keep 3/2; drone fundamental −6 dB for 30 s |
| closeness > 0.5 | Intervals compressed to seconds and unisons; wet −6 dB; width ×0.5 |
| absurd > 0.5 | ±25 cent detune, off-beat plucks (swing 0.6), a "wrong" 16/15 ignition ping |
| kind | Exciter bias: object struck; action sharper; feeling bowed; place more early reflections; living being 5 Hz breath AM; sound pulsed; abstract idea pure sines; nonsense inharmonic body |

**Confidence (c).** Grain jitter is (1−c)·30 ms, voice detune (1−c)·10 cents, and attack ×(2−c). At decay onset a **cadence** event retunes the final tones:
- **c > 0.65: resolution.** They land on 1/1 + 3/2 with a clean attack.
- **c < 0.4: suspension.** They hang on detuned 4/3, and the tail runs 2–4 s past the visuals into the drone residue.

## 6. Sync with the visuals

| Visual | Audio |
|---|---|
| Flash, star | Mono strike or ping at t0, gain from `M.flash` |
| Shockwave | BP sweep; cutoff = f(ring radius) |
| Lit grains, streaks | Grain density = lit fraction; grain length ∝ streak |
| Glints | 1–3 ms glitter grains; density = `look.sparkle` |
| Radius | Side gain |
| Embers | Poisson crackles |
| Return | Damping rises; residue passes to the drone |

**One clock.**
1. **Shared envelope maths.** Extract `field.step`'s envelopes (`ss`, `sustain`, `flash`, `ret`) into a pure `engine/timeline.ts`. Field and score both import it. Audio samples curves at 64 points per second into `setValueCurveAtTime`.
2. **Audio is the master clock.** Schedule the score at `t0 = ctx.currentTime + 0.04`. Start the field at `performance.now() + (t0 − now + outputLatency)·1000`, calibrated through `getOutputTimestamp()`. The flash and the transient then coincide, even over Bluetooth.
3. **Sync exactly only where the eye demands it.** Flash, shock and snap home are exact. Grains and glints share density and band but are seeded independently; nothing is read back from the GPU.

## 7. Refusal, support, mastering, fatigue

**BARRED.** The drone stays **untouched**; a refusal is absence. But the charge hiss **cuts in 0 ms** (2 ms de-click) on the same frame as the text. That hard stop *is* the audible refusal, without adding any sound. **FALLBACK:** the hiss fades over 300 ms, like the text.

**SUPPORT.**
- Equal-power fade over 2 s.
- Clear the residue and colour memory.
- Nothing plays over the helpline text.
- After Esc, fade back in over 6 s.

**Mastering.**
- **Master chain:**
  - Drop the −18 dB bus compressor; its pumping reads as "processing".
  - Compress the reaction bus only (−12 dB, 2:1, 30 ms).
  - Duck the drone with automation (−3 dB; −10 for fear).
  - Put a **5 ms lookahead limiter in the worklet** at −3 dBTP. `DynamicsCompressorNode` has no lookahead and distorts low hits.
  - Add a 45 Hz high-pass (24 dB/oct).
  - Give the harness a 3-band notch "room EQ" for install.
- **Calibrate at the visitor position with an SPL meter:**
  - Drone: 38–42 dBA, just above room noise.
  - Typical reaction: 70–76 dBC; anger ≤ 82 dBC.
  - The ~30 dB contrast between rest and peak *is* the piece.
- **Playback:**
  - Speakers: near-fields at ear height, flanking the screen; an optional sub crossed at 60 Hz.
  - Headphone preset: wet −3 dB, crossfeed, limiter −4 dB, width ×0.7.
  - Check the mono sum, because decorrelated pans can cancel.
- **Fatigue over hours:**
  - Nothing sustained above 4 kHz.
  - No drone periodicity under 90 s.
  - Anger strikes repeated within 60 s are trimmed −1.5 dB each, recovering over 5 min. Only gain changes, so determinism per word holds.
  - The evening memory keeps the room moving.

## 8. Implementation

```
src/audio/
  audio.ts      buses (drone, keys, react) → master (EQ, HPF, limiter); 2 convolvers
  clock.ts      audio↔performance time, t0 scheduling
  lattice.ts    JI sets from light / loss
  score.ts      compose(Reaction) → Score — pure, deterministic, unit-testable
  gestures/*.ts nine writers (GestureCtx, w) → Ev[]
  voice.ts      plays a Score on the persistent Plate node + width/space automation
  drone.ts      rewritten on a 16-mode Plate; additive 3-timescale memory
  keys.ts       modal tap + charge hiss
  worklets/plate.worklet.ts  modal bank, grain/strike/bow exciters, KS, limiter
```

- **AudioWorklet** handles the body, grains and Karplus-Strong. KS needs feedback shorter than 128 samples, and hundreds of grains per second as nodes would thrash the garbage collector. Events are scheduled sample-accurately inside the worklet.
- **Native nodes** handle the convolvers, M/S, EQ and long tones.
- **CPU budget:** under 8% of one 2020-laptop core; 48 two-pole modes at 48 kHz is about 5 M multiply-adds per second.
- **Determinism.**
  - Audio RNG is `mulberry32(p.seed ^ 0xA0D10)`, a separate stream from the visuals.
  - The noise and IR are seeded from `sessionSeed`.
  - Taps are hashed from `event.code`.
- **IR and samples.** Generate the IR with per-band decay, early reflections and L/R decorrelation. Stay sample-free, with one worthwhile exception: **a self-recorded impulse response of a real steel plate** (about 300 KB). Its dense physical modes give the plate a truth no synthetic IR matches.

```ts
// score.ts — pure: Reaction → Score
export type Ev =
  | { k: 'strike'; t: number; gain: number; hard: number; pan: number }
  | { k: 'grains'; t0: number; t1: number; rate: Float32Array; len: [number, number]; band: [number, number] }
  | { k: 'tone'; t: number; ratio: number; att: number; hold: number; rel: number; gain: number; glide?: number }
  | { k: 'pluck'; t: number; ratio: number; decay: number; pan: number };
export type Body = { ratios: number[]; t60: number[]; inharm: number; damp: number };
export type Score = { t: Timeline; events: Ev[]; width: Float32Array; body: Body; tail: number };
export type GestureCtx = { p: Params; r: Reaction; rand: () => number; set: number[]; t: Timeline };
export type Gesture = (g: GestureCtx, w: number) => Ev[];

export function compose(r: Reaction): Score {
  const p = r.params;
  const rand = mulberry32(p.seed ^ 0xa0d10);
  const t = timeline(r);                         // shared with field.ts
  const set = lattice(p.light, p.accents.loss);
  const events: Ev[] = [];
  for (const e of EMOTIONS) {
    const w = p.weights[e] ?? 0;
    if (w >= 0.12) events.push(...GESTURES[e]({ p, r, rand, set, t }, w));
  }
  events.push(...cadence(p.confidence, set, t)); // 1/1+3/2, or hang on 4/3
  return {
    t, events, body: morphBody(p),                // one body, weight-averaged
    width: sampleCurve((x) => env(x, r).radius, t.home, 64),
    tail: lerp(0.5, 4, 1 - p.confidence),
  };
}

// voice.ts
export function play(a: AudioEngine, s: Score): number {
  const t0 = a.now + 0.04;
  a.plate.port.postMessage({ type: 'score', t0, body: s.body, events: s.events });
  a.side.gain.setValueCurveAtTime(s.width, t0, s.t.home);
  return t0; // caller converts to performance time and starts the field
}

// plate.worklet.ts — modal body core
class Plate extends AudioWorkletProcessor {
  N = 24; b = new Float32Array(24); c = new Float32Array(24); g = new Float32Array(24);
  y1 = new Float32Array(48); y2 = new Float32Array(48);
  setMode(i: number, hz: number, t60: number, gain: number) {
    const R = Math.exp(-6.91 / (t60 * sampleRate));
    this.b[i] = 2 * R * Math.cos((2 * Math.PI * hz) / sampleRate);
    this.c[i] = -R * R; this.g[i] = gain * (1 - R);
  }
  process(_in: Float32Array[][], [out]: Float32Array[][]) {
    for (let n = 0; n < out[0].length; n++) {
      const x = this.excite(currentTime + n / sampleRate); // [L, R] exciter
      for (let ch = 0; ch < 2; ch++) {
        let s = 0;
        for (let i = 0; i < this.N; i++) {
          const k = i + ch * 24;
          const y = this.g[i] * x[ch] + this.b[i] * this.y1[k] + this.c[i] * this.y2[k];
          this.y2[k] = this.y1[k]; this.y1[k] = y; s += y;
        }
        out[ch][n] = s;
      }
    }
    return true;
  }
}
```

## 9. Listening references

1. **Éliane Radigue, *Kyema* (1988).** A near-static drone kept alive for an hour by beating partials. This is the model for rest and for "the room remembers".
2. **Kali Malone, *The Sacrificial Code* (2019).** Austere just-intonation canons: consonance without sweetness. It grounds the lattice and the resolve/suspend logic.
3. **Ryoji Ikeda, *matrix* (2000).** Sine precision, millisecond clicks, silence as material. This is the glint layer and the discipline of the high register, without the sensory violence.
4. **Hildur Guðnadóttir, "Bridge of Death" (*Chernobyl*, 2019).** Real plant recordings made tonal without losing their physicality. It is the plate-and-grains idea: matter that sings.
5. **Mica Levi, "Lipstick to Void" (*Under the Skin*, 2014).** Microtonal strings that never land. This is what fear, anxiety and low confidence should feel like: a judgment the machine cannot finish.
