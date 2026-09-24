# AGENTS.md

Instructions for any coding agent working on this repo. Keep this file short; detail lives in `docs/`.

## What this is

*Words of Control* — a new media art piece. A visitor types a word; one call to Jev (TypeSafe AI)
*appraises* it; an authored grammar of live generative image + sound performs that judgement, then cuts
to black. Nothing on screen or in the speakers is AI-generated: Jev only judges.

## Read first

- `docs/DIRECTION-v2.md` — current direction (appraisal → verdict micro-clips → black). Supersedes parts of the spec.
- `docs/DECISIONS.md` — the artist's decisions, newest first. They override `docs/SPEC.md` where they differ.
- `docs/SPEC.md` — original build spec (still authoritative for everything not overridden).
- `docs/ENGINEERING.md` — performance budget, workflow, code rules.
- `docs/jev-api.md`, `docs/jev-calibration.md`, `docs/jev-appraisal-v2.md` — Jev API, safety calibration, live answers.
- `docs/reviews/` — curator, visual artist, sound designer, scene critic reviews.

## Hard rules

- **Never store or log what visitors type** (browser, proxy, analytics, files). No caching of Jev answers either.
- **One Jev call per submission.** The API key lives only in `.env.local` (`TYPESAFE_API_KEY`) and the proxy; never in the page, never printed.
- **Every Jev/proxy error shows as one quiet line under the word** (src/notice.ts): the word stays, Enter retries. Technical detail only in dev, never to visitors. Blocklist runs before any call.
- **Sound and image are one thing**, driven by the same parameters and clock.
- **Performance is checked on every visual/audio change**: `npm run perf` must pass (see `docs/ENGINEERING.md`). Ordinary laptops must hold 60 fps.
- **No dead code.** Remove what is replaced; don't leave unused exports, params or files.
- **Document as you go**: decisions in `docs/DECISIONS.md` (only when the artist decides), design in `docs/`, a comment where code isn't self-evident.
- **Never drive the artist's own browser.** Visual checks use the isolated headless Chromium (`scripts/lib/headless.ts`).
- **The artist runs `npm run dev` himself** (port 5173). Agents use private servers (the scripts pick a free port) and stop them after.
- **Git:** local commits are fine; don't push unless asked. Nothing large in git: `references/`, `docs/captures/`, `.cache/` stay local.

## Commands

```sh
npm run dev         # artist's dev server (http://localhost:5173); ?mock = offline fake Jev
npm run typecheck
npm run perf        # GPU time + dropped frames at 1728×1117 @2×, per phase and per layer; must pass
npm run e2e         # keyboard flow, safety paths, storage (add -- --live for one real Jev call)
npm run capture -- word …         # contact sheets → docs/captures/ (local)
node scripts/listen.ts word …     # record the real audio: loudness, true peak, spectrogram (needs ffmpeg)
node scripts/film.ts word …       # record performances as video; flags jumps inside shots (flicker)
node scripts/clips.ts clip …      # one clip alone (--word, --ops e,w,f, --angles n) → contact sheet
node scripts/sequence.ts word …   # one visitor, several words in a row (one session) → docs/captures/sequence.png
node scripts/appraise.ts word …   # full battery on real words → table (uses the API key)
node scripts/fixtures.ts          # re-record Jev answers for the test words (mock mode + tests)
node scripts/probe.ts             # safety calibration probe (see docs/jev-calibration.md)
```
