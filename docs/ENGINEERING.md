# Engineering

## Performance budget

The piece must be sharp on ordinary hardware, not only on the newest machine.

- **Target:** 60 fps with no visible hitches on a mainstream laptop (e.g. base M1/M2, recent Intel/AMD iGPU).
- **Check:** `npm run perf` renders uncapped (no vsync) in an isolated headless Chromium on this machine's GPU at a
  MacBook Pro 16" screen (1728×1117 @2×), for the rest state and a maximum-intensity reaction.
- **Budget on the reference machine (M3 Pro):** p95 frame ≤ 8.3 ms, i.e. ≥ 2× headroom over 60 fps.
  Hitches (single frames > 33 ms) are bugs.
- Run it on every visual or audio change; keep a note of the numbers in the commit message when they move.
- Useful knobs: `?n=` grain count; `npm run perf -- --n 2000000 --size 2560x1440x1 --budget 8.3`.

### Current numbers (2026-09-23, M3 Pro, 1M grains, continuous-reaction engine v1)

| phase | mean | p95 | max | note |
|---|---|---|---|---|
| rest | 1.98 ms | 6.0 ms | 90 ms | hitch to investigate |
| anger reaction, max intensity | 4.18 ms | 8.5 ms | 142 ms | **over budget** + hitches |

The v1 reaction engine is being replaced by the clip sequencer (docs/DIRECTION-v2.md); the new code must
meet the budget from the start. Suspects for the hitches: per-step `Float32Array` allocation in
`Field.step`, pipeline/texture creation during resize, GC from DOM work.

## Code rules

- TypeScript strict, no framework. WebGPU (WGSL) for image, Web Audio (+ AudioWorklet when needed) for sound.
- **One source of truth** for parameters: tuning schema (`src/engine/tuning.ts`) → GPU uniform layout is
  generated from it; the Jev battery lives only in `src/jev/questions.ts`.
- **No dead code**: when something is replaced, delete the old path, its params and tuning entries.
  Before committing, check for unused exports (`grep` each export) and run `npm run typecheck`.
- **No allocations in the frame loop** where avoidable (reuse typed arrays and GPU buffers).
- **Deterministic** where it matters: per-performance randomness is seeded from the input and Jev's answers.
- **Comments** explain *why*, not *what*. Each module starts with a one-paragraph header.

## Workflow

1. Change code.
2. `npm run typecheck`.
3. Visual/audio change → headless capture to check the look (never the artist's browser) and `npm run perf`.
4. Update docs if behaviour or design changed; record the artist's decisions in `docs/DECISIONS.md`.
5. Commit locally with a message that says what changed and, when relevant, the perf numbers.

## Layout

```
src/            the piece (see README.md for the module map)
proxy/          Jev proxy core (dev: Vite middleware; prod: serverless function, later)
scripts/        perf, appraisal table, safety probe; scripts/lib/headless.ts = shared headless session
docs/           spec, direction, decisions, engineering, Jev docs, reviews (captures/ stays local)
references/     artist's references — local only, never in git
presets/        saved tuning snapshots
```
