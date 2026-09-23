/**
 * The director: turns one appraisal into a performance plan. The grammar is
 * fixed (appraisal → verdict clips → black); everything inside it — which
 * clips, their order, lengths, cuts, parameters — is decided here from the
 * judgement, deterministically (seeded by the word + the answers).
 */
import type { Appraisal } from '../jev/appraisal.ts';
import { mulberry32 } from '../core/rng.ts';
import type { Layer } from '../render/gpu.ts';

/** The verdict vocabulary. The appraisal gone 3D — data formations (field.wgsl), each the spatial form of
 *  a 2D reading, and drift, the void — and two matters the data acts on: the relief (data → surface) and
 *  chladni (the word's bytes as sound shaping sand). One language: monochrome, one accent,
 *  every mark from the word's data; each family answers to different dimensions of the reading. */
export const DATA_CLIPS = ['landscape', 'city', 'lattice', 'cloud', 'tube', 'drift'] as const;
export const CLIPS = [...DATA_CLIPS, 'relief', 'chladni'] as const;
export type ClipId = (typeof CLIPS)[number];

/** Which renderer layer draws a clip. */
export const layerOf = (c: ClipId): Layer =>
  (DATA_CLIPS as readonly string[]).includes(c) ? 'data' : c === 'chladni' ? 'sand' : (c as Layer);

export const CUT_MODES = ['barcode', 'numbers', 'spectrum', 'bits', 'scatter', 'line', 'word'] as const;
export type CutMode = (typeof CUT_MODES)[number];

/** One flash of the appraisal. */
export type Cut = { start: number; dur: number; mode: CutMode; variant: number };

/** One camera angle inside a shot, from `at` seconds: a cut on the same continuous scene.
 *  zoom 1 = wide, > 1 = close on (offX, offY); `seed` sets the camera (sand: height, direction, roll;
 *  data: side, height, inside or not — and −1 = the frontal reveal of the appraisal's reading). */
export type Angle = { at: number; seed: number; zoom: number; offX: number; offY: number };
export const WIDE: Angle = { at: 0, seed: 0.5, zoom: 1, offX: 0, offY: 0 };

/** How a data shot is built (field.wgsl shape()): echo 0–5, warp 0–6, flow 0–3. */
export type Ops = { echo: number; warp: number; flow: number };
export const STILL: Ops = { echo: 0, warp: 0, flow: 0 };

/** One verdict clip, its operators and its coverage (angles, in order). */
export type Shot = { clip: ClipId; start: number; dur: number; seed: number; aborted: boolean; angles: Angle[]; ops: Ops };

export type Plan = {
  cuts: Cut[];
  shots: Shot[];
  /** When the image cuts to black (the verdict ends). */
  blackAt: number;
  /** When the reverb tail has died and the room returns. */
  end: number;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** How much each clip suits the judgement (0..~3) — each family listens to its own dimensions. */
function affinity(A: Appraisal): Record<ClipId, number> {
  const m = A.c.material.p, tx = A.c.texture.p, sh = A.c.shape.p, mo = A.c.motion.p, rh = A.c.rhythm.p, em = A.c.emotion.p;
  const s = A.s, n = A.n, d = A.c.domain.p, tm = A.c.time.p;
  return {
    // the long view: time, distance, nature, drifting, the idle and the lonely
    landscape: s.duration * 0.8 + tm.past * 0.5 + tm.timeless * 0.5 + d.nature * 0.7 + mo.drifting * 0.6 + sh.flowing * 0.5
      + sh.flat * 0.4 + s.distance * 0.5 + n.loneliness * 0.5 + em.calm * 0.4 + A.lazy * 0.5 + em.sadness * 0.3,
    // the built world: order, the city, weight, hardness, power, rage held in structure
    city: s.order * 0.7 + d.city * 1.1 + s.density * 0.5 + s.dominance * 0.5 + s.hardness * 0.4 + m.stone * 0.4 + m.metal * 0.4
      + rh.steady * 0.4 + em.anger * 0.5 + n.violence * 0.4 + tx.crystalline * 0.3,
    // the machine's own matter: bits, codes, the digital, the strange, nonsense, anxiety
    lattice: d.machine * 1.1 + d.mind * 0.4 + s.strangeness * 0.6 + tx.crystalline * 0.4 + A.c.act.p.nonsense * 1.0
      + em.anxiety * 0.5 + rh.stuttering * 0.5 + s.order * 0.3 + em.playful * 0.4,
    // a cloud of relations: chaos, fear, spreading, smoke and void, the cosmos, wonder
    cloud: (1 - s.order) * 0.6 + em.fear * 0.7 + em.awe * 0.6 + mo.spreading * 0.6 + mo.breaking * 0.5 + m.smoke * 0.5 + m.void * 0.4
      + d.cosmos * 0.8 + s.strangeness * 0.3 + (1 - A.c.emotion.confidence) * 0.4 + em.joy * 0.3,
    // one line closing on itself: the tone, the circle, love, the sacred, the timeless
    tube: s.tone * 0.5 + mo.circling * 0.7 + sh.round * 0.5 + sh.spiral * 0.6 + A.c.sense.p.hearing * 0.4 + em.tender * 0.7
      + n.closeness * 0.6 + s.sacred * 0.5 + tm.timeless * 0.3 + d.home * 0.4 + d.body * 0.3,
    // data made surface: matter, body, weight, stone, flesh, wood, the still
    relief: m.stone * 0.8 + m.flesh * 0.7 + m.wood * 0.6 + m.cloth * 0.5 + tx.cracked * 0.5 + tx.soft * 0.4 + tx.fibrous * 0.5
      + mo.still * 0.5 + mo.contracting * 0.4 + s.weight * 0.5 + d.body * 0.4,
    // the word's bytes as a sound shaping sand: heard, tonal, rhythmic, sand itself
    chladni: A.c.sense.p.hearing * 1.1 + m.sand * 0.8 + tx.grainy * 0.4 + rh.pulsing * 0.6 + mo.trembling * 0.6 + s.order * 0.3
      + s.sacred * 0.3 + em.joy * 0.2,
    // the void, the lazy afternoon: a sparse dust drifting
    drift: m.void * 0.9 + m.light * 0.4 + m.smoke * 0.5 + A.lazy * 0.8 + (1 - s.arousal) * 0.3 + m.water * 0.3 + mo.drifting * 0.4,
  };
}

/** The clips of the last few performances: the room remembers, and the machine avoids repeating itself. */
const recent: ClipId[] = [];
/** The operator combinations of the last performances: never built the same way twice in a row. */
const recentOps: string[] = [];
const openers: ClipId[] = [];

/** `salt` makes every performance of the same answers a little different (the room is live, never a replay). */
export function direct(A: Appraisal, salt = (Math.random() * 2 ** 31) | 0): Plan {
  const rand = mulberry32(A.seed ^ 0x5bd1e995 ^ salt);
  const aro = A.s.arousal, lazy = A.lazy, conf = A.c.emotion.confidence;
  const rh = A.c.rhythm.top;

  // ---- appraisal: rapid cuts, faster when the word is charged; always ends on a single line (the verdict reached)
  const appraisalDur = lerp(1.7, 2.6, clamp01(A.tape.length / 180)) * lerp(1.1, 0.85, aro);
  const cutLen = lerp(0.26, 0.075, aro) * (lazy > 0.6 ? 1.8 : 1);
  // it opens on the word itself and its bytes: proof the machine is reading *this*
  const cuts: Cut[] = [{ start: 0, dur: lerp(0.32, 0.16, aro), mode: 'word', variant: 0 }];
  let t = cuts[0].dur;
  let prev: CutMode | null = 'word';
  // which readings the machine favours depends on what it found: ordered words read as barcodes and bits,
  // crowded ones as figures, heard ones as spectra, strange ones as return maps (barcodes come in four styles)
  const readings: CutMode[] = ['barcode', 'numbers', 'spectrum', 'bits', 'scatter'];
  const emo = A.c.emotion;
  const rw = [
    A.s.order + A.c.domain.p.machine * 0.5, A.s.density + A.bytes.length / 24, A.c.sense.p.hearing + (1 - A.s.tone) * 0.5,
    A.s.order * 0.5 + A.c.material.p.metal * 0.5 + 0.2, A.s.strangeness + (1 - emo.confidence) * 0.6,
  ].map((x) => 0.15 + x * x);
  rw[0] += 0.6; // the barcode is the house style
  const drawReading = () => { let q = rand() * rw.reduce((x, y) => x + y, 0); for (let k = 0; k < rw.length; k++) { q -= rw[k]; if (q <= 0) return readings[k]; } return readings[0]; };
  while (t < appraisalDur - 0.35) {
    let mode: CutMode;
    do mode = drawReading(); while (mode === prev);
    const irregular = rh === 'stuttering' ? 0.9 : rh === 'steady' ? 0.1 : 0.45;
    const dur = cutLen * lerp(1, 0.35 + rand() * 1.6, irregular);
    cuts.push({ start: t, dur, mode, variant: rand() });
    prev = mode;
    t += dur;
    if (rand() < 0.12 * (1 - aro)) t += cutLen * 0.6; // a breath of black between readings
  }
  cuts.push({ start: t, dur: 0.35, mode: 'line', variant: 1 });
  t += 0.35;

  // ---- verdict: 1–6 clips by affinity (a charged word is an overload of shots); an indifferent word gets one long, slow shot
  const aff = affinity(A);
  // "nothing" is almost nothing: a short void and a long tail; an idle word lingers
  const empty = A.c.material.top === 'void' && lazy > 0.6;
  // the room remembers its last performances and avoids them — except for the idle words, whose clip is their meaning
  if (lazy < 0.6) for (const c of CLIPS) aff[c] *= Math.pow(0.7, recent.filter((r) => r === c).length);
  const ranked = [...CLIPS].sort((a, b) => aff[b] - aff[a]);
  const charge = clamp01(aro * 0.75 + A.s.density * 0.25);
  // the edit's pace: dark, violent words cut sharp and fast; calm, tender, idle ones hold long takes
  const em = A.c.emotion.p;
  const dark = clamp01(A.n.violence + em.anger * 0.7 + em.fear * 0.6 + em.anxiety * 0.3 + A.s.tension * 0.3);
  const pace = clamp01(charge * 0.5 + dark * 0.6 - lazy * 0.5 - (em.calm + em.tender) * 0.3);
  // lengths (s): verdict 9–14 (the void 5), each shot ≥ 1.8, each camera angle ≥ 0.4 — never a flicker
  const verdictDur = empty ? 5 : lazy > 0.7 ? lerp(9, 13, lazy) : lerp(9, 14, clamp01(A.s.intensity * 0.5 + A.s.duration * 0.3 + (1 - pace) * 0.2));
  const count = empty ? 1 : lazy > 0.7 ? 2 : Math.max(2, Math.min(7, Math.floor(verdictDur / 1.8 / 1.25), Math.round(lerp(1.5, 7, pace) - lazy * 2)));
  const gap = lazy > 0.7 ? 0 : lerp(0.5, 0.0, pace);

  // the hand-off: the verdict opens on the 3D form of the reading the appraisal showed most — the analysis
  // becomes space in one gesture (unless the word is idle or empty)
  const COUNTERPART: Partial<Record<CutMode, ClipId>> = { barcode: 'city', numbers: 'cloud', spectrum: 'landscape', bits: 'lattice', scatter: 'cloud' };
  const shown = new Map<ClipId, number>();
  for (const c of cuts) { const k = COUNTERPART[c.mode]; if (k) shown.set(k, (shown.get(k) ?? 0) + c.dur); }
  // …never the formation the last performance opened on
  const handOff = [...shown.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).find((k) => !openers.includes(k));
  // clips that suit the word, drawn by affinity with some chance (never the same twice in a row, a family at most twice)
  const eligible = ranked.filter((c, i) => aff[c] >= aff[ranked[0]] * 0.45 || i < count || c === handOff);
  const picks: ClipId[] = [];
  for (let i = 0; i < count; i++) {
    // each clip once per verdict: a performance is a sequence of different images
    const from = eligible.filter((c) => !picks.includes(c));
    if (!from.length) break;
    // the first shot is the best match; after it, a weighted draw
    // (nothing is the void: a sparse drift of dust, always)
    let c = empty ? 'drift' : lazy < 0.6 && handOff && from.includes(handOff) ? handOff : from[0];
    if (i > 0) {
      const wts = from.map((x) => Math.pow(Math.max(aff[x], 1e-3), 2));
      let r = rand() * wts.reduce((a, b) => a + b, 0);
      for (let k = 0; k < from.length; k++) { r -= wts[k]; if (r <= 0) { c = from[k]; break; } }
    }
    picks.push(c);
  }
  // weights for durations: the first (best-matching) clip holds longest
  const w = picks.map((_, i) => 1 / (1 + i * 0.2));
  const wsum = w.reduce((a, b) => a + b, 0);

  // coverage: a shot is cut between camera angles on the same continuous scene — faster for a charged word
  const angles = (dur: number): Angle[] => {
    if (lazy > 0.7 || empty) return [WIDE];
    // angle length: ~4 s for a calm word down to ~0.25 s for a violent one (irregular, never a metronome)
    const len = lerp(4, 0.55, pace) * lerp(0.8, 1.25, rand());
    const out: Angle[] = [];
    for (let at = 0; at < dur - 0.4; at += Math.max(0.4, len * lerp(0.6, 1.4, rand()))) {
      const r = rand();
      const zoom = r < 0.45 ? 1 : r < 0.75 ? lerp(1.4, 2.2, rand()) : lerp(2.8, 5, rand());
      const a = rand() * Math.PI * 2, off = zoom > 1 ? lerp(0.1, 0.45, rand()) : 0;
      out.push({ at, seed: rand(), zoom, offX: Math.cos(a) * off, offY: Math.sin(a) * off });
    }
    return out.length ? out : [WIDE];
  };

  // the operators of each data shot: weighted by the mood and by the word's own dimensions, drawn with
  // chance, never a combination this performance or the last ones already used
  const mo = A.c.motion.p, md = A.mood;
  const draw = (w: number[]) => { let q = rand() * w.reduce((x, y) => x + y, 0); for (let k = 0; k < w.length; k++) { q -= w[k]; if (q <= 0) return k; } return 0; };
  const chooseOps = (): Ops => {
    for (let tries = 0; tries < 12; tries++) {
      const ops: Ops = {
        echo: draw([md.neu * 1.5 + 0.3, md.neu + md.pos * 0.8 + 0.2, md.pos * 1.2 + A.c.shape.p.spiral + 0.2, md.pos * 1.5 + A.c.shape.p.round * 0.5 + 0.1,
          md.neg * 0.8 + mo.falling * 0.5 + 0.1, md.neg * 1.3 + mo.spreading + mo.breaking + 0.1]),
        warp: draw([md.neu * 1.5 + 0.3, md.pos + A.c.shape.p.flowing * 0.8 + 0.1, A.s.tension * 0.6 + mo.circling * 0.5 + 0.1, md.neg * 0.7 + 0.1,
          md.neg * 0.6 + mo.falling + 0.05, md.pos * 1.2 + 0.1, md.neg * 0.8 + A.c.emotion.p.sadness + 0.05]),
        flow: draw([md.neu + mo.still + 0.2, md.neu * 0.8 + md.neg * 0.6 + 0.2, md.pos + mo.circling + 0.2, md.neg * 0.5 + A.c.rhythm.p.pulsing + 0.1]),
      };
      const key = `${ops.echo}${ops.warp}${ops.flow}`;
      if (!recentOps.includes(key)) { recentOps.push(key); recentOps.splice(0, Math.max(0, recentOps.length - 24)); return ops; }
    }
    return { echo: Math.floor(rand() * 6), warp: Math.floor(rand() * 7), flow: Math.floor(rand() * 4) };
  };

  const shots: Shot[] = [];
  t += 0.15;
  // low confidence: a false start — a shot begins, is cut off, and the machine starts again
  if (conf < 0.5 && lazy < 0.7) {
    const alt = ranked[1 + Math.floor(rand() * 2)];
    const d = lerp(0.35, 0.8, rand());
    shots.push({ clip: alt, start: t, dur: d, seed: (rand() * 2 ** 31) | 0, aborted: true, angles: [WIDE], ops: STILL });
    t += d + lerp(0.25, 0.6, 1 - conf);
  }
  picks.forEach((clip, i) => {
    const dur = ((verdictDur - gap * (picks.length - 1)) * w[i]) / wsum;
    let cover = angles(dur);
    // the reveal: the first shot, when it is the echo of the appraisal's main reading, opens on the reading
    // itself, frontal (angle seed −1), and holds ≥ 3 s while the camera swings round into its depth
    if (i === 0 && clip === handOff) cover = [{ ...WIDE, seed: -1 }, ...cover.filter((x) => x.at >= 3)];
    shots.push({ clip, start: t, dur, seed: (rand() * 2 ** 31) | 0, aborted: false, angles: cover, ops: chooseOps() });
    t += dur + (i < picks.length - 1 ? gap : 0);
  });

  openers.push(picks[0]);
  openers.splice(0, Math.max(0, openers.length - 3));
  recent.push(...new Set(picks));
  recent.splice(0, Math.max(0, recent.length - 6));
  const blackAt = t;
  const tail = empty ? 6 : lerp(2.4, 4, clamp01(A.s.scale * 0.5 + A.s.duration * 0.5));
  return { cuts, shots, blackAt, end: blackAt + tail };
}
