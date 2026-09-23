/**
 * The director: turns one appraisal into a performance plan. The grammar is
 * fixed (appraisal → verdict clips → black); everything inside it — which
 * clips, their order, lengths, cuts, parameters — is decided here from the
 * judgement, deterministically (seeded by the word + the answers).
 */
import type { Appraisal } from '../jev/appraisal.ts';
import { mulberry32 } from '../core/rng.ts';
import { SAND_CLIPS, isSand } from './sand.ts';
import type { Layer } from '../render/gpu.ts';

/** The verdict vocabulary: families of their own (relief, dust, haze, scan, iris) and sand in five behaviours
 *  (sand.ts). Each family answers to different dimensions of the reading, never just "violent or calm". */
export const CLIPS = ['relief', 'dust', 'haze', 'scan', 'iris', ...SAND_CLIPS] as const;
export type ClipId = (typeof CLIPS)[number];

/** Which renderer layer draws a clip. */
export const layerOf = (c: ClipId): Layer => (isSand(c) ? 'sand' : c === 'dust' ? 'grains' : c);

export const CUT_MODES = ['barcode', 'numbers', 'spectrum', 'bits', 'scatter', 'line', 'word'] as const;
export type CutMode = (typeof CUT_MODES)[number];

/** One flash of the appraisal. */
export type Cut = { start: number; dur: number; mode: CutMode; variant: number };

/** One camera angle inside a shot, from `at` seconds: a cut on the same continuous scene.
 *  zoom 1 = wide, > 1 = close on (offX, offY); `seed` sets the camera (sand: height, direction, roll). */
export type Angle = { at: number; seed: number; zoom: number; offX: number; offY: number };
export const WIDE: Angle = { at: 0, seed: 0.5, zoom: 1, offX: 0, offY: 0 };

/** One verdict clip and its coverage (angles, in order). */
export type Shot = { clip: ClipId; start: number; dur: number; seed: number; aborted: boolean; angles: Angle[] };

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

/** How much each clip suits the judgement (0..~3). */
function affinity(A: Appraisal): Record<ClipId, number> {
  const m = A.c.material.p, tx = A.c.texture.p, sh = A.c.shape.p, mo = A.c.motion.p, rh = A.c.rhythm.p, em = A.c.emotion.p;
  const s = A.s, n = A.n;
  return {
    relief: m.stone + m.cloth + m.flesh + m.wood + tx.cracked * 0.5 + tx.soft * 0.4 + tx.fibrous * 0.6
      + mo.still * 0.5 + mo.contracting * 0.4 + s.weight * 0.5 + em.tender * 0.4 + em.awe * 0.3,
    dust: m.smoke + m.sand * 0.6 + m.void * 0.5 + m.light * 0.5 + m.ice * 0.4 + tx.powdery + mo.drifting * 0.6 + mo.falling * 0.4
      + mo.circling * 0.4 + mo.rising * 0.5 + m.fire * 0.5,
    haze: m.light + m.smoke * 0.6 + m.water * 0.9 + m.void * 0.7 + tx.liquid * 0.6 + tx.smooth * 0.3 + mo.drifting * 0.4 + mo.still * 0.3
      + (1 - s.arousal) * 0.5 + A.lazy * 0.6,
    // the machine reading a surface: ordered, cold, technical, strange words
    scan: s.order * 0.6 + m.metal * 0.5 + m.glass * 0.6 + A.c.domain.p.machine * 1.2 + A.c.domain.p.mind * 0.5
      + A.c.sense.p.sight * 0.4 + s.strangeness * 0.6 + tx.crystalline * 0.5 + em.anxiety * 0.4 + A.c.act.p.nonsense * 0.8,
    // an eye made of ink around a light: seeing, being seen, the body, fire and wonder, round and spiralling forms
    iris: A.c.sense.p.sight * 0.9 + A.c.domain.p.body * 0.5 + em.awe * 0.7 + m.fire * 0.5 + m.light * 0.4 + m.flesh * 0.3
      + sh.round * 0.6 + sh.spiral * 0.7 + mo.spreading * 0.4 + mo.circling * 0.3 + A.c.who.p.you * 0.5 + (1 - s.distance) * 0.3
      + A.c.colour.confidence * 0.4 + em.joy * 0.3 + em.fear * 0.3,
    // sand shaken into the figure of a sound: heard, tonal, ordered, rhythmic words
    chladni: A.c.sense.p.hearing * 1.1 + s.order * 0.4 + (1 - s.tone) * 0.2 + rh.pulsing * 0.6 + rh.steady * 0.4
      + mo.trembling * 0.6 + mo.circling * 0.4 + sh.round * 0.3 + s.sacred * 0.4 + em.joy * 0.3,
    // wind over a deep bed: time, distance, drifting, the long afternoon
    dunes: m.sand * 0.9 + tx.grainy * 0.4 + mo.drifting * 0.6 + s.duration * 0.5 + A.c.time.p.past * 0.3 + A.c.time.p.timeless * 0.4
      + n.loneliness * 0.4 + n.nostalgia * 0.4 + A.lazy * 0.5 + sh.flowing * 0.4 + sh.flat * 0.3 + em.calm * 0.4 + m.void * 0.2,
    // strikes: violence, impact, rage, fire and thunder
    crater: n.violence * 0.9 + rh.strike * 0.8 + rh.stuttering * 0.3 + mo.breaking * 0.6 + mo.spreading * 0.6 + em.anger * 0.8
      + em.fear * 0.4 + s.arousal * 0.6 + m.fire * 0.6 + m.stone * 0.2 + sh.splintered * 0.4 + sh.jagged * 0.3 + s.loudness * 0.3 + A.c.act.p.swear * 0.6,
    // a blade drawn through: a single cut, a point, metal, cold tension
    furrow: sh.point * 1.1 + m.metal * 0.8 + m.glass * 0.4 + sh.jagged * 0.3 + s.tension * 0.5 + s.hardness * 0.3 + em.fear * 0.3
      + A.c.act.p.command * 0.3,
    // pouring away: loss, grief, falling, what is gone
    drain: n.loss * 1.0 + em.sadness * 0.9 + mo.falling * 0.5 + mo.contracting * 0.5 + rh.dwindling * 0.7 + A.c.time.p.past * 0.4
      + n.loneliness * 0.4 + (1 - s.valence) * 0.3,
  };
}

/** The clips of the last few performances: the room remembers, and the machine avoids repeating itself. */
const recent: ClipId[] = [];

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
  const count = lazy > 0.7 ? 1 : Math.max(1, Math.min(7, Math.floor(verdictDur / 1.8 / 1.25), Math.round(lerp(1.5, 7, pace) - lazy * 2)));
  const gap = lazy > 0.7 ? 0 : lerp(0.5, 0.0, pace);

  // clips that suit the word, drawn by affinity with some chance (never the same twice in a row, a family at most twice)
  const eligible = ranked.filter((c, i) => aff[c] >= aff[ranked[0]] * 0.45 || i < Math.min(count, 3));
  const picks: ClipId[] = [];
  for (let i = 0; i < count; i++) {
    const pool = eligible.filter((c) => c !== picks[i - 1] && picks.filter((x) => x === c).length < 2);
    const from = pool.length ? pool : eligible;
    // the first shot is the best match; after it, a weighted draw
    // (nothing is the void: the pinprick of light in haze, always)
    let c = empty ? 'haze' : from[0];
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

  const shots: Shot[] = [];
  t += 0.15;
  // low confidence: a false start — a shot begins, is cut off, and the machine starts again
  if (conf < 0.5 && lazy < 0.7) {
    const alt = ranked[1 + Math.floor(rand() * 2)];
    const d = lerp(0.35, 0.8, rand());
    shots.push({ clip: alt, start: t, dur: d, seed: (rand() * 2 ** 31) | 0, aborted: true, angles: [WIDE] });
    t += d + lerp(0.25, 0.6, 1 - conf);
  }
  picks.forEach((clip, i) => {
    const dur = ((verdictDur - gap * (count - 1)) * w[i]) / wsum;
    shots.push({ clip, start: t, dur, seed: (rand() * 2 ** 31) | 0, aborted: false, angles: angles(dur) });
    t += dur + (i < count - 1 ? gap : 0);
  });

  recent.push(...new Set(picks));
  recent.splice(0, Math.max(0, recent.length - 6));
  const blackAt = t;
  const tail = empty ? 6 : lerp(2.4, 4, clamp01(A.s.scale * 0.5 + A.s.duration * 0.5));
  return { cuts, shots, blackAt, end: blackAt + tail };
}
