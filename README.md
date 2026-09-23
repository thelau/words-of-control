# Words of Control

A black screen, a cursor, a word. Jev appraises it; light and sound react.

Start with [`AGENTS.md`](AGENTS.md) (rules and map), [`docs/DIRECTION-v2.md`](docs/DIRECTION-v2.md) (current direction),
[`docs/DECISIONS.md`](docs/DECISIONS.md) and [`docs/ENGINEERING.md`](docs/ENGINEERING.md). Original spec: [`docs/SPEC.md`](docs/SPEC.md).

## Run

```sh
npm install
npm run dev        # http://localhost:5173 — needs a WebGPU browser (Chrome/Edge, Safari 26+)
npm run perf       # headless frame-time check; must pass on every visual/audio change
```

`?n=2000000` sets the grain count (default 1 000 000; the M3 Pro holds 60 fps up to ~1–2M at full resolution). `?fs` enables fullscreen-on-first-key in dev.

Without `VITE_JEV_PROXY` the piece runs on **mock Jev** (deterministic fake answers; test words
`slurtest` → barred, `want to die` → support, `errortest` → fallback).

## Tuning harness (dev only)

Press `` ` `` to open. While open: `R` replay · `N` next test word · `F` freeze · `.` step ·
`S` storyboard PNG (3×2, reaction time) · `C` record WebM · `⏎` fire current params.

A **preset** is a saved snapshot of the tuning constants (hues, radii, forces, persistence…):
the *voicing* of the instrument. Reactions stay generative — every one is computed live from
Jev's judgments × the word's seed × the tuning. Presets save to `presets/*.json`.

## Layout

```
src/
  main.ts               boot, state machine
  input/                keyboard (IME-safe), centred line + cursor
  jev/                  client (cache, timeout), mapping → Params, mock, types
  safety/               blocklist, routing thresholds
  engine/               tuning schema, Params, uniform layout, field (CPU side)
  render/gpu.ts         WebGPU: compute sim → HDR persistence → composite
  render/shaders/       WGSL; behaviours/*.wgsl = one per emotion
  audio/                master chain, drone (with memory), key clicks
  dev/                  harness, storyboard capture, recorder
references/             artist's references (local only, not in git)
docs/                   spec, direction, decisions, engineering, Jev docs, reviews
scripts/                perf, appraisal table, safety probe
presets/                saved tunings
```
