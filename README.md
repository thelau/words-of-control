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

## Dev harness (dev only)

Press `` ` `` to open. Click a word to perform its recorded Jev answers; `1–4` plays one clip alone
(relief, grains, fracture, haze) with the current appraisal; `N` next word · `R` replay · `C` record a WebM.

## Layout

```
src/
  main.ts               boot, state machine, frame loop (one clock for image and sound)
  input/                keyboard (IME-safe, typing rhythm), centred line + cursor
  jev/                  questions (the battery), appraisal (answers → typed data + tape), client, mock, fixtures
  safety/               blocklist, routing thresholds
  show/                 director (appraisal → plan), timeline (what is on screen at t)
  render/               WebGPU renderer, frame uniforms, fracture crack table
  render/shaders/       room, appraisal, relief, fracture, grains, haze, bloom, composite
  audio/                engine (master, reverb, performance bus), drone, keys, score (appraisal + chorus), clips
  dev/                  harness, recorder
proxy/                  Jev proxy core (dev: Vite middleware)
scripts/                perf, e2e, capture, listen, appraise, fixtures, probe (see AGENTS.md)
docs/                   spec, direction, decisions, engineering, Jev docs, reviews
references/             artist's references (local only, not in git)
```
