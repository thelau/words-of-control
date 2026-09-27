# Words of Control

A cursor, a word. Jev appraises it; a grid of every measurement fills, keeps what matters, and plays the result on a beat.

Start with [`AGENTS.md`](AGENTS.md) (rules and map), [`docs/GRID.md`](docs/GRID.md) (current direction),
[`docs/DECISIONS.md`](docs/DECISIONS.md) and [`docs/ENGINEERING.md`](docs/ENGINEERING.md). Original spec: [`docs/SPEC.md`](docs/SPEC.md).

## Run

```sh
npm install
npm run dev        # http://localhost:5173 — needs a WebGPU browser (Chrome/Edge, Safari 26+)
npm run perf       # headless frame-time check; must pass on every visual/audio change
```

`?fs` enables fullscreen-on-first-key in dev.

Without `VITE_JEV_PROXY` the piece runs on **mock Jev** (deterministic fake answers; test words
`slurtest` → barred, `want to die` → support, `errortest` → fallback).

## Dev harness (dev only)

Press `` ` `` to open. Click a word to perform its recorded Jev answers (the panel shows its tempo, what
matters and its steps); `N` next word · `R` replay · `C` record a WebM.

## Layout

```
src/
  main.ts               boot, state machine, frame loop (one clock for image and sound)
  input/                keyboard (IME-safe), centred line + cursor
  jev/                  questions (the battery), appraisal (answers → typed data), client, mock, fixtures, lexicon
  safety/               blocklist, routing thresholds
  show/                 grid.ts the score (cells, what matters, timing, steps); space.ts the 3D spaces; prepare worker
  render/               WebGPU renderer (one pass), frame uniforms; shaders: grid.wgsl (2D), space.wgsl (points, lines)
  audio/                engine (master, reverb, performance bus), drone, keys, render (the performance as samples), score (plays it)
  dev/                  harness, recorder
proxy/                  Jev proxy core (dev: Vite middleware)
scripts/                perf, e2e, capture, film, listen, sequence, lexicon, appraise, fixtures, probe (see AGENTS.md)
docs/                   grid (current direction), spec, decisions, engineering, Jev docs, reviews
references/             artist's references (local only, not in git)
```
