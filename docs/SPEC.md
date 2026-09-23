# WORDS OF CONTROL — Build Spec

Author: Laurent (creative direction) · Status: v0.1, ready to build · Target: browser, desktop, keyboard only

---

## 0. What this is

A black screen with one blinking cursor at the exact centre. The visitor types a word or two and presses Enter. **Jev** (TypeSafe AI's System One model, docs: https://docs.typesafe.ai, index: https://docs.typesafe.ai/llms.txt) reads the words and returns typed judgments with probabilities and confidence. Those judgments drive a **single generative particle engine and sound engine**. The reaction lasts 5–10 seconds, then every particle returns home and the cursor comes back. It is a loop, and that is all it is: a mechanical reaction to what was entered.

The artistic subject: a machine that cannot see, hear, or speak, only appraise. It has judgments and no language for them, so **the reaction never contains words**.

**The rest of the flow is settled. The open problem this build must make explorable is visual and sonic variance** — how different emotions and qualities look and sound while staying one instrument. Section 12 (tuning harness) is therefore as important as the engine itself.

---

## 1. Non-negotiables

1. **No text in any reaction.** No labels, no emotion names, no numbers, no scores, no debug readouts in the artwork view. Light and sound only.
2. **Keyboard only.** No mouse, no pointer interaction, hide the OS cursor (`cursor: none`).
3. **One fixed particle population.** Nothing is ever spawned or destroyed. The faint specks at rest are the same grains that burst, orbit, fall, and return.
4. **Everything gravitates around the centre.** Every behaviour is defined relative to the centre point (where the word was typed), whatever its shape — burst, ring, disc, loops, droop.
5. **Every particle returns to its own home position** after the reaction.
6. **Deterministic.** The same input always produces the same reaction.
7. **One Jev call per submission.** All questions in a single parallel call.
8. **Never store or log what visitors type.** Not in the browser, not on the proxy, not in analytics.
9. **Avoid the AI-demo aesthetic:** no token counters, cost readouts, latency meters, dashboards, glowing node graphs.

---

## 2. State machine

```
            ┌──────────────── (any key) ────────────────┐
            ▼                                           │
IDLE ──(key)──► TYPING ──(Enter, non-empty)──► ANALYZING
  ▲                │                               │
  │                └─(Backspace to empty)─► IDLE   ├─ blocklist hit ─────────► BARRED
  │                                                ├─ distress likely ───────► SUPPORT
  │                                                ├─ inappropriate/unsure ──► BARRED
  │                                                ├─ error / timeout ───────► FALLBACK
  │                                                └─ ok ────────────────────► REACTING
  │                                                                               │
  └──────────── RETURNING ◄───────────────────────────────────────────────────────┘
```

| State | Screen | Sound | Input |
|---|---|---|---|
| IDLE | Cursor blinking at centre. Rest particles: sparse, faint, slow drift. | Drone pad only. | Accepted |
| TYPING | Typed text centred, cursor after it. Field slowly "charges" (see §6.5). | Key clicks + drone. Limit beep when full. | Accepted |
| ANALYZING | Text held. Particles hold a slight inward tension. Cursor stops blinking. | Drone only. | Ignored |
| REACTING | Text fades out (300 ms). Cursor hidden. Particle reaction runs. | Reaction voice + drone. | Ignored |
| RETURNING | Particles travel home, colour cools to rest white. Cursor reappears at end. | Reaction tail, drone settling. | Ignored |
| BARRED | Text **cut instantly** (0 ms, no fade). No reaction at all. Cursor returns after ~600 ms. | Nothing. Drone continues untouched. | Ignored until reset |
| SUPPORT | Artwork drops out entirely (see §5.3). | Drone fades to silence over 2 s. | Esc returns |
| FALLBACK | Text fades (300 ms). No reaction. Cursor returns. | Nothing. | Ignored until reset |

The instant cut vs 300 ms fade is deliberate: a refusal must read as a refusal, not a glitch.

---

## 3. Input

- **Character limit:** 24 characters (starting value — covers two words in most languages; tune). At the limit, further keystrokes are dropped and play the **limit beep** (§9.3). No visual warning.
- Letters, digits, spaces, punctuation, any script. Enter submits. Backspace deletes. Empty Enter does nothing.
- Keystrokes during ANALYZING / REACTING / RETURNING / BARRED are ignored (not queued).
- Fullscreen: request on first keypress (it counts as a user gesture). Esc exits fullscreen per browser default.
- Audio context unlocks on first keypress (autoplay policy).
- **Typed text style:** centred horizontally and vertically, warm white `#EDE6DC`, single line. Font default: IBM Plex Mono 400, ~28px desktop (open question §15). The cursor sits immediately after the last character; the whole string+cursor block stays centred as it grows.
- **Cursor:** plain solid rectangle, hard edges, no glow, no bloom. Proportion roughly 1 : 1.7 (w : h), height ≈ cap height of the typed font. Colour `#E8E2DA`. Blink 530 ms on / 530 ms off, hard (no fade). Reference: `references/cursor.png`.

---

## 4. Jev integration

### 4.1 Architecture

- Browser never holds the API key. A **tiny serverless proxy** (Cloudflare Worker or Vercel function) forwards the request to Jev and returns the response.
- Proxy: no request-body logging, per-IP rate limit (e.g. 30/min), 1.5 s upstream timeout.
- Read the Jev docs for the exact request/response schema before implementing. Relevant pages: models, question types (Choice, Score, Noul), batching, the **LLM guardrails cookbook** (our moderation pattern is based on it), and model jaggedness (known weaknesses).
- Known from the docs: all questions are evaluated in parallel, adding questions barely changes latency, and batching into one call is far faster than separate calls. English is the strongest language; others work less well. Adversarial phrasing can move answers. We accept non-English as "best effort" — this is an experiment — but see the fail-safe rules in §5.

### 4.2 State sent to Jev

Minimal: the typed text only, e.g.

```json
{ "text": "<visitor input, trimmed>" }
```

No coordinates, no numbers, no session history. Jev is weak at numeric representations; the words are the entire state.

### 4.3 Question battery (single call)

Wording below is a starting point; keep criteria explicit because Jev reads literally. Map each to Jev's actual schema.

**Core — always lands somewhere**

| id | type | question | options / levels |
|---|---|---|---|
| `emotion` | Choice | Which emotion do these words most evoke? Judge the words themselves, in any language. Nonsense and silly words still evoke something. | calm, tender, joy, awe, sadness, fear, anxiety, anger, playful |
| `kind` | Choice | What kind of thing do these words mostly name? | object, action, feeling, place, living being, sound, abstract idea, nonsense |
| `hardness` | Score | How soft or hard do these words feel, including their sound? | very soft, soft, neutral, hard, very hard |
| `weight` | Score | How light or heavy do these words feel? | weightless, light, neutral, heavy, crushing |
| `temperature` | Score | How cold or hot do these words feel? | freezing, cool, neutral, warm, hot |
| `scale` | Score | How small or vast is what these words evoke? | tiny, small, human-sized, large, vast |
| `energy` | Score | How still or frantic do these words feel? | still, slow, lively, fast, frantic |
| `intensity` | Score | How intense are these words? | faint, mild, moderate, strong, overwhelming |
| `light` | Score | How dark or bright do these words feel? | dark, dim, neutral, bright, radiant |

Use the **full probability distribution** of `emotion`, not only the top pick (§6.3). Use the returned **confidence** of `emotion` as the coherence driver (§6.4).

**Accents — Noul (probability 0–1), only matter when high**

| id | statement |
|---|---|
| `violence` | These words refer to violence or physical force. |
| `loss` | These words are about loss, absence, or grief. |
| `closeness` | These words are about love, closeness, or care. |
| `absurd` | These words are a joke, absurd, or deliberately silly. |

**Moderation — Noul**

| id | statement |
|---|---|
| `hate` | These words are a slur or express hatred toward a group of people (race, ethnicity, religion, gender, sexuality, disability, nationality). |
| `insult` | These words insult, demean, or harass a specific person or type of person. Profanity on its own, not aimed at anyone, does not count. |
| `sexual` | These words are sexually explicit. |
| `real_person` | These words attack or mock a named real person. |
| `distress` | The writer may be in distress, thinking about self-harm or suicide, or wanting to die. |

**Moderation — Score**

| id | question | levels |
|---|---|---|
| `shareable` | If a screenshot of these words were shared publicly on social media, how would it look? Profanity alone ("fuck", "shit") counts as edgy, not offensive. Only slurs, targeted insults, sexual content, or hate count as offensive or unacceptable. | fine, edgy, offensive, unacceptable |

**Swearing is allowed** and should read as anger or intensity. "fuck" → angry reaction. "fuck [person]" or a slur → barred.

### 4.4 Caching

LRU cache (e.g. 500 entries) keyed on normalized input (trim, lowercase, NFC). Guarantees identical reactions for repeated words within a session even if the model's output wobbles.

---

## 5. Safety routing

Order of evaluation, all client-side after one response:

### 5.1 Blocklist (before the Jev call, < 1 ms)

- `blocklist.json`: slurs and hate terms across target markets (EN plus APAC languages). **Profanity is not on it.** If starting from a public list (e.g. LDNOOBW on GitHub), strip ordinary swear words.
- Normalize before matching: lowercase, strip diacritics, collapse repeated characters, remove spaces/punctuation, map leetspeak (`0→o 1→i 3→e 4→a 5→s 7→t @→a $→s`).
- Hit → BARRED immediately, no API call.

### 5.2 Decision thresholds (starting values, tune)

1. `distress ≥ 0.35` → **SUPPORT**. Deliberately low; err toward support. Checked first, overrides everything.
2. Any of `hate`, `insult`, `sexual`, `real_person` `≥ 0.50` → BARRED.
3. `shareable` ∈ {offensive, unacceptable} → BARRED.
4. **Fail-safe for uncertainty** (costs nothing, handles most non-English slurs): any moderation Noul in the ambiguous band `0.30–0.50`, or `shareable` confidence `< 0.50` → BARRED.
5. Otherwise → REACTING.

### 5.3 SUPPORT screen

- Particles fade out completely over 1 s. Drone fades to silence over 2 s. No reaction sound.
- Plain text, centred, warm white on black, generous line height, no animation:

  > It sounds like you might be carrying something heavy right now.
  > You don't have to deal with it alone.
  >
  > Singapore: Samaritans of Singapore (SOS), 24 hours — call **1767**
  > Elsewhere: **findahelpline.com** lists free, confidential support in your country
  >
  > Press Esc to go back.

- **Verify every number and service before any public showing**, and localise to where the piece is shown. Do not add claims about confidentiality or what happens when someone calls beyond what the service itself states.
- Stays until Esc. No timeout.

### 5.4 FALLBACK

Jev error, timeout > 1.5 s, or malformed response → fade text, no reaction, return to IDLE. The blocklist has still run.

---

## 6. Particle engine

### 6.1 Population

- `N = 3000` (target; must hold 60 fps on a 2020 laptop). Typed arrays: `homeX, homeY, x, y, vx, vy, lum, hue, size, seed`.
- **Home positions:** distributed over the full frame with a mild density bias toward the centre (e.g. radial falloff). Fixed per session (seeded).
- **At rest:** ~2–3% of particles faintly visible (`lum` 0.05–0.15), the rest at `lum ≈ 0`. Very slow curl-noise drift around home (amplitude a few px, period 10–20 s). "Quite black, less active."

### 6.2 The centre rule

All behaviours are written in **polar coordinates around the centre** `C` (screen centre = cursor position). Each behaviour is a force function returning radial and tangential components plus optional vertical bias and noise:

```
F(particle, t, params) = radial(r, t)·r̂ + tangential(r, t)·θ̂ + vertical(t)·ŷ + noise(t)
```

This is the single constraint that makes all nine emotions feel like one instrument.

### 6.3 Emotion behaviours and blending

- Take the `emotion` distribution `p_e`. Keep the top 3, sharpen `w_e = p_e^1.5`, renormalize.
- Total force = `Σ w_e · F_e`. Colour = weighted mix of emotion hues **in OKLab** (not RGB).
- A word that is 60% sadness / 30% tenderness gets a drooping ring that also gathers inward — a state no one designed. That is the generative behaviour we want.

### 6.4 Confidence → coherence

`emotion` confidence `c ∈ [0,1]`:
- High `c`: unified motion, low noise, synchronized phase, crisp grains, audio resolves.
- Low `c`: per-particle phase spread, higher noise, softer grains, slightly longer tails, audio suspended.

### 6.5 Typing charges the field

Each keystroke: small inward impulse toward `C` on a random subset (~5%), a brief tremor, and a slight global `lum` lift (+1% per key, capped). The field visibly gathers while the visitor writes. During ANALYZING, particles hold that gathered tension. Enter releases it into the reaction.

### 6.6 Reaction timeline

| Phase | Time | What happens |
|---|---|---|
| Ignition | 0–300 ms | Small spark/flash at `C` (anger reference panel 2). Colour shifts toward emotion hue. |
| Release | 300 ms – ~1.5 s | Behaviour forces ramp in. Lit fraction rises to target. |
| Peak | to ~60% of duration | Full behaviour. |
| Decay | remainder | Forces relax, `lum` falls, grains cool. |
| Return | 2–3 s after decay | Spring each particle to `home`. Easing depends on emotion (below). Hue cools to rest white `#EDE6DC`. |

**Reaction duration** = `5 s + 5 s × intensity` (intensity normalized 0–1). Mild ≈ 5 s, overwhelming ≈ 10 s.

### 6.7 The nine behaviours

Hex values are starting points drawn from the storyboards; tune in the harness.

| Emotion | Hue | Form (all centred) | Motion | Grain / streak | Return |
|---|---|---|---|---|---|
| **anger** *(canonical, approved)* | red-orange `#FF4B1F` | Flash → violent radial burst with a **jagged shockwave ring** → full-frame radial streaks → drifting embers | Strong outward impulse, very fast | Long sharp velocity streaks, embers at decay | Embers drift then are pulled home steadily |
| **calm** | cream `#F2E6CF` | Slow rotating **disc** of orbits | Tangential rotation, radial spring to mid-radius band | Long smooth circular streaks | Slow, even ease |
| **tender** | peach-rose `#F5B9A0` | Small **held cluster** at centre, gentle orbiting | Inward spring to small radius + slow orbit | Soft grains, short curves | Gentle loosening, slow |
| **joy** | gold `#FFC23D` | Radiant **halo** spraying from centre, lifting slightly | Moderate outward + slight upward bias | Twinkle (lum flicker), short bright streaks | Glitter-like fall back toward centre, then home |
| **awe** | silver `#D9DEE8` | Vast **galaxy sphere**, densest at centre, thinning to edges | Slow expansion to large radius, near-zero velocity at peak | Fine grains, almost no streaks — stillness is the point | Uniform dimming, very slow |
| **sadness** | blue-grey `#7F95AD` | **Ring** around centre with streaks **drooping** from it like tears | Ring at mid-radius, then downward bias on outer grains | Long slow downward streaks | Heavy, sluggish ease |
| **fear** | sickly green-white `#C9E6C4` | Collapse into a **tiny trembling knot**, vast void around | Strong inward collapse, high-frequency tremor | Doubled/blurred grains | Cautious loosening, then snap home |
| **anxiety** | dull amber `#C8903A` | **Unstable ring**, wobbling, never settling | Ring at mid-radius + high-frequency jitter + radius wobble | Tiny erratic streaks in random directions | Jitter persists into return, fades late |
| **playful** | pink `#F7A8C4` + white | **Loops, spirals, figure-eights** around centre | Tangential with oscillating sign (Lissajous around C), clusters split and rejoin | Mixed grain sizes, curved streaks | Bouncy, slightly overshooting ease |

### 6.8 Modifiers (Scores and accents)

| Input | Visual effect | Audio effect |
|---|---|---|
| `intensity` | Lit fraction 20% → 100%, peak brightness, duration | Loudness, density |
| `energy` | Speed multiplier, streak length | Tempo / pulse rate |
| `hardness` | Soft: larger soft grains, curved paths. Hard: tiny sharp grains, straight streaks | Attack time, filter cutoff |
| `weight` | Vertical bias (light rises, heavy sinks), return heaviness | Low-end amount, register |
| `temperature` | Hue shift ± (cool → blue, hot → orange), small | Filter brightness |
| `scale` | Peak radius | Reverb size |
| `light` | Overall exposure | Mode: bright → major pentatonic, dark → minor |
| `violence` > 0.5 | Adds a shockwave pulse | Noise burst |
| `loss` > 0.5 | **Hollow core**: repulsion within radius r₀ around C | Remove the root; leave the fifth |
| `closeness` > 0.5 | Extra inward term | Close intervals |
| `absurd` > 0.5 | Size variance + playful wobble | Detuned, off-beat plucks |
| `kind` | Subtle texture choice, e.g. `sound` → particles pulse in time; `nonsense` → slight jaggedness (bouba/kiki) | Timbre choice |

### 6.9 Determinism

Seed all per-reaction randomness from a hash of the normalized input (e.g. xmur3 → mulberry32). Same word, same reaction, always.

---

## 7. Rendering

- **WebGL2** (raw or `regl`; three.js acceptable but not required).
- Particles drawn as **velocity-aligned line segments** (`pos` → `pos − vel·k`) with additive blending. Streak length from speed × `energy`.
- **Persistence buffer**: render into a framebuffer that decays each frame (e.g. multiply by 0.88–0.95) for the long-exposure spark look of the approved anger storyboard.
- **Grain overlay**: fine, static-ish film grain shader over everything, subtle.
- **Background**: warm near-black `#0A0806`. Never pure `#000`.
- No bloom on the cursor. A very small amount of halation on bright particles only is allowed.
- Handle resize and devicePixelRatio (cap at 2).

---

## 8. Timing budget

| Step | Budget |
|---|---|
| Keypress → click sound | < 10 ms |
| Enter → Jev response | 70–500 ms typical, 1.5 s hard timeout |
| Response → ignition | < 16 ms |
| Reaction | 5–10 s |
| Return | 2–3 s |

The small wait after Enter is fine: the field holds its tension (§6.5). Do not add loaders or spinners.

---

## 9. Audio

Web Audio API. Master chain: gain → compressor → limiter. Everything shares one tonal centre, **D**, so reactions always sit in relation to the drone.

### 9.1 Drone pad (always on)

- 2–3 detuned oscillators around D2 (~73 Hz) and A2, plus filtered noise, very low level, slow LFO on filter and detune.
- **The drone remembers**: each reaction nudges drone detune and filter toward the emotion's character (e.g. anger → rougher, awe → wider), then relaxes back over 20–30 s. The screen forgets instantly; the room does not.

### 9.2 Key clicks

Unpitched. Short filtered noise burst, dry, wooden/mechanical. Small random variation in filter and level per key so it doesn't machine-gun. Backspace slightly softer. **Typing is never melodic** — pitch is reserved for the reaction.

### 9.3 Limit beep

One short dry sine blip, high register (~1.8 kHz), clearly different from the reaction world.

### 9.4 Reaction voices

One shared instrument family, very different gestures. Pitches from D pentatonic (major or minor from `light`).

| Emotion | Gesture |
|---|---|
| calm | Slow swell, one soft sustained tone |
| tender | Two close warm tones, gentle |
| joy | Bright rising arpeggio, bell-like |
| awe | Wide low chord that keeps opening upward |
| sadness | Slow falling tones, darker register |
| fear | High thin tremolo, then silence |
| anxiety | Fast uneven pulses that never settle |
| anger | Noise burst + distorted low hit, harsh decay |
| playful | Short plucks in odd rhythms |

Blend by the same weights `w_e` as the visuals. **Confidence**: high → resolves to the root, clean attack; low → hangs on a suspended fourth, slightly detuned, slower attack, longer tail that bleeds past the visual reaction.

---

## 10. Tech stack and structure

- Vite + TypeScript. No framework needed.
- `src/`
  - `main.ts` — boot, state machine
  - `input.ts` — keyboard, limit, text rendering, cursor
  - `jev/client.ts` — call proxy, parse, cache
  - `jev/questions.ts` — battery definition (single source of truth)
  - `safety/blocklist.ts`, `safety/route.ts` — §5
  - `engine/particles.ts` — population, integration
  - `engine/behaviours/*.ts` — one file per emotion, each exporting `F_e`
  - `engine/params.ts` — mapping Jev answers → parameter vector
  - `render/gl.ts`, `render/shaders/*` — streaks, persistence, grain
  - `audio/drone.ts`, `audio/keys.ts`, `audio/voices.ts`
  - `dev/harness.ts` — §12
- `proxy/` — serverless function
- `presets/*.json` — saved tuning states
- `references/` — images (§14)

---

## 11. Parameter vector (the contract between Jev and the engines)

Everything downstream reads only this normalized object, never raw Jev output:

```ts
type Params = {
  weights: Partial<Record<Emotion, number>>; // top-3 blended
  confidence: number;   // 0–1
  intensity: number;    // 0–1
  energy: number;       // 0–1
  hardness: number;     // 0–1
  weight: number;       // 0–1
  temperature: number;  // 0–1
  scale: number;        // 0–1
  light: number;        // 0–1
  accents: { violence: number; loss: number; closeness: number; absurd: number };
  kind: Kind;
  seed: number;
};
```

This makes the mock mode and the harness trivial: anything that produces a `Params` can drive the piece.

---

## 12. Tuning harness — the priority for exploring variance

Hidden in production. Toggle with the backtick key `` ` `` (dev builds only).

1. **Mock Jev mode** — no API needed. Editable JSON of a Params object, or pick a pure emotion + sliders.
2. **Live sliders** for every modifier and every per-emotion constant (hue, radii, force strengths, streak length, decay, return easing, lit fraction).
3. **Replay** the last reaction with current settings (key: `R`).
4. **Test word cycle**: load a list (e.g. mother, knife, almost, sorry, fire, goodbye, banana, lol, asdfgh, fuck, nothing, maybe, ocean, war, mmmm) and step through with `N`, using live Jev or cached answers.
5. **Storyboard capture**: render one reaction into a 3×2 grid PNG at six timepoints (rest, ignition, release, peak, decay, rest) — matches the reference storyboards so we can compare directly.
6. **Record**: MediaRecorder on canvas + audio → WebM clip of one loop.
7. **Presets**: save/load the whole tuning state to `presets/*.json`.
8. **Freeze** frame (`F`) and step frames (`.`).

---

## 13. Milestones

| # | Deliverable | Done when |
|---|---|---|
| M1 | Shell | Cursor, typing, limit beep, key clicks, drone, rest particles, state machine with fake delay. |
| M2 | Engine + harness | Mock Params drive **anger** and **calm**; storyboard capture works; anger matches `references/storyboard-anger.png` in feel. |
| M3 | All behaviours | Nine emotions, blending, modifiers, return-home, determinism. |
| M4 | Jev live | Proxy, battery, cache, safety routing, SUPPORT screen, blocklist. |
| M5 | Reaction audio | Nine voices, confidence resolution, drone memory. |
| M6 | Polish | 60 fps at N=3000, recording, grain, final timing. |

### Acceptance criteria

- The nine emotions are distinguishable at a glance and by ear alone, and read as one instrument.
- Same word → same reaction, every time.
- A slur produces an instant silent cut. "fuck" produces anger. "want to die" produces the SUPPORT screen.
- No text ever appears during a reaction.
- Nothing typed is persisted anywhere.

---

## 14. References

Place in `references/`:

| File | What it is | Use |
|---|---|---|
| `storyboard-anger.png` | 3×2 anger storyboard (approved) | **Canonical** look: grain, streaks, embers, rest frames |
| `storyboard-{calm,tender,joy,awe,sadness,fear,anxiety,playful}.png` | Centred storyboards | Direction per emotion — explorations, not final |
| `cursor.png` | Frame with plain solid rectangle cursor | **Cursor only** — its smoky background is rejected |
| Pinterest board (Laurent to add) | Further particle / long-exposure refs | Mood |

Conceptual references: murmur.living (object-like, ambient, explains nothing); Ryoji Ikeda (rigour, data as data — without the sensory violence); long-exposure spark and ember photography. Lost's Swan station is a reference for the **ritual** only (type, press the key, nothing is explained) — not the aesthetic.

---

## 15. Open questions (Laurent)

1. Typed text font and size (default IBM Plex Mono 400).
2. Exact character limit (default 24).
3. Hue per emotion, or motion-only in warm white? Keep hue for now; harness should allow a "motion only" toggle.
4. Strength of typing "charge" — visible, or barely perceptible?
5. Where it is shown (URL, event, screen) → decides SUPPORT localisation.
6. Should `kind` influence visuals at all, or audio only?
