# Engineering

## Performance budget

The piece must be sharp on ordinary hardware, not only on the newest machine.

- **Target:** 60 fps with no visible hitches on a mainstream laptop (e.g. base M1/M2, recent Intel/AMD iGPU).
- **Check:** `npm run perf` runs in an isolated headless Chromium on this machine's GPU at a MacBook Pro 16"
  screen (1728×1117 @2×) with normal vsync. It reports, per phase of real performances and per layer alone,
  the GPU's own time per frame (WebGPU timestamp queries) and dropped frames.
- **Budget on the reference machine (M3 Pro):** GPU p95 ≤ 8.3 ms per frame (≥ 2× headroom over 60 fps);
  no frame > 33 ms. (Uncapped fps is not a valid measure: the GPU changes power state; use GPU time.)
- **Resolution strategy:** soft layers (room, relief, fracture, grains, haze) render at CSS resolution and are
  upscaled by the film composite; the appraisal's text and lines render at native resolution.
- Run it on every visual or audio change; note the numbers in the commit message when they move.

### Current numbers (2026-09-23, M3 Pro, v2)

Full performances: 0 dropped frames everywhere; GPU mean 2.8 ms (room), 3.1–5.8 ms per performance.
Per layer (GPU mean / p95): relief 5.3/6.7, grains 4.5/6.7, fracture 4.1/7.2, haze 2.4/3.4, appraisal
readings 2.9–3.7 / 3.7–5.7, scatter reading ~5/9 (brief, marginally over).

## Sound check

`node scripts/listen.ts` records the actual output of performances and reports integrated loudness and true
peak, plus a spectrogram. Targets: true peak ≤ −3 dBFS; loudness follows the word (indifferent ≈ −23 LUFS,
charged ≈ −17/−18 LUFS); nothing below 35 Hz.

## Code rules

- TypeScript strict, no framework. WebGPU (WGSL) for image, Web Audio (+ AudioWorklet when needed) for sound.
- **One source of truth**: the per-frame uniform layout is generated from one field list (`src/render/frame.ts`);
  the Jev battery lives only in `src/jev/questions.ts`; image and sound read the same plan (`src/show/`).
- **No dead code**: when something is replaced, delete the old path, its params and tuning entries.
  Before committing, check for unused exports (`grep` each export) and run `npm run typecheck`.
- **No allocations in the frame loop** where avoidable (reuse typed arrays and GPU buffers).
- **Deterministic** where it matters: per-performance randomness is seeded from the input and Jev's answers.
- **Comments** explain *why*, not *what*. Each module starts with a one-paragraph header.

## Workflow

1. Change code.
2. `npm run typecheck` and `npm run e2e`.
3. Visual/audio change → `npm run capture` / `node scripts/listen.ts` to check (never the artist's browser) and `npm run perf`.
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
