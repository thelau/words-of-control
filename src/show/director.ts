/**
 * The director: turns one appraisal into a performance plan. The grammar is
 * fixed (appraisal → verdict clips → black); everything inside it — which
 * clips, their order, lengths, cuts, parameters — is decided here from the
 * judgement, deterministically (seeded by the word + the answers).
 */
import type { Appraisal } from '../jev/appraisal.ts';
import { mulberry32 } from '../core/rng.ts';

export const CLIPS = ['relief', 'grains', 'fracture', 'haze', 'scan', 'plate'] as const;
export type ClipId = (typeof CLIPS)[number];

export const CUT_MODES = ['barcode', 'numbers', 'spectrum', 'bits', 'scatter', 'line', 'word'] as const;
export type CutMode = (typeof CUT_MODES)[number];

/** One flash of the appraisal. */
export type Cut = { start: number; dur: number; mode: CutMode; variant: number };

/** One verdict clip, framed: zoom 1 = wide; > 1 = macro on (offX, offY). */
export type Shot = { clip: ClipId; start: number; dur: number; seed: number; aborted: boolean; zoom: number; offX: number; offY: number };

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
  const m = A.c.material.p, tx = A.c.texture.p, sh = A.c.shape.p, mo = A.c.motion.p, rh = A.c.rhythm.p;
  return {
    relief: m.stone + m.cloth + m.flesh + m.wood + 0.6 * m.sand + tx.cracked * 0.5 + tx.soft * 0.4 + tx.fibrous * 0.6
      + mo.still * 0.5 + mo.contracting * 0.5 + mo.rising * 0.3 + A.s.weight * 0.5,
    grains: m.sand + m.fire + m.smoke * 0.6 + m.void * 0.5 + m.light * 0.5 + m.ice * 0.4 + tx.grainy + tx.powdery
      + mo.spreading * 0.6 + mo.drifting * 0.5 + mo.falling * 0.6 + mo.circling * 0.5 + mo.trembling * 0.4 + A.s.density * 0.4,
    fracture: m.glass + m.metal + m.ice * 0.8 + m.stone * 0.3 + tx.crystalline + tx.cracked * 0.7 + sh.jagged + sh.splintered + sh.branching
      + mo.breaking + rh.strike * 0.6 + A.s.tension * 0.5,
    haze: m.light + m.smoke + m.water * 0.8 + m.void * 0.7 + tx.liquid * 0.6 + tx.smooth * 0.3 + mo.drifting * 0.4 + mo.still * 0.3
      + (1 - A.s.arousal) * 0.5 + A.lazy * 0.6,
    // the machine reading a surface: ordered, cold, technical, strange words
    scan: A.s.order * 0.7 + m.metal * 0.5 + m.stone * 0.4 + A.c.domain.p.machine * 1.2 + A.c.domain.p.mind * 0.5
      + A.c.sense.p.sight * 0.4 + A.s.strangeness * 0.6 + tx.smooth * 0.3 + mo.still * 0.3,
    // sand shaken into figures by a sound: tonal, ordered, rhythmic, heard words
    plate: m.sand * 0.8 + tx.grainy * 0.5 + tx.powdery * 0.4 + A.s.order * 0.6 + (1 - A.s.tone) * 0.5
      + A.c.sense.p.hearing * 0.9 + rh.pulsing * 0.6 + rh.steady * 0.3 + mo.trembling * 0.5 + mo.circling * 0.3,
  };
}

export function direct(A: Appraisal): Plan {
  const rand = mulberry32(A.seed ^ 0x5bd1e995);
  const aro = A.s.arousal, lazy = A.lazy, conf = A.c.emotion.confidence;
  const rh = A.c.rhythm.top;

  // ---- appraisal: rapid cuts, faster when the word is charged; always ends on a single line (the verdict reached)
  const appraisalDur = lerp(1.7, 2.6, clamp01(A.tape.length / 180)) * lerp(1.1, 0.85, aro);
  const cutLen = lerp(0.26, 0.075, aro) * (lazy > 0.6 ? 1.8 : 1);
  // it opens on the word itself and its bytes: proof the machine is reading *this*
  const cuts: Cut[] = [{ start: 0, dur: lerp(0.32, 0.16, aro), mode: 'word', variant: 0 }];
  let t = cuts[0].dur;
  let prev: CutMode | null = 'word';
  const readings: CutMode[] = ['barcode', 'numbers', 'spectrum', 'bits', 'scatter'];
  while (t < appraisalDur - 0.35) {
    let mode: CutMode;
    do mode = readings[Math.floor(rand() * readings.length)]; while (mode === prev);
    const irregular = rh === 'stuttering' ? 0.9 : rh === 'steady' ? 0.1 : 0.45;
    const dur = cutLen * lerp(1, 0.35 + rand() * 1.6, irregular);
    cuts.push({ start: t, dur, mode, variant: rand() });
    prev = mode;
    t += dur;
    if (rand() < 0.12 * (1 - aro)) t += cutLen * 0.6; // a breath of black between readings
  }
  cuts.push({ start: t, dur: 0.35, mode: 'line', variant: 1 });
  t += 0.35;

  // ---- verdict: 1–4 clips by affinity; an indifferent word gets one long, slow shot
  const aff = affinity(A);
  const ranked = [...CLIPS].sort((a, b) => aff[b] - aff[a]);
  const count = lazy > 0.7 ? 1 : Math.max(1, Math.min(4, Math.round(lerp(1.5, 4.2, aro) - lazy * 1.5)));
  // "nothing" is almost nothing: a short void and a long tail; an idle word lingers
  const empty = A.c.material.top === 'void' && lazy > 0.6;
  const verdictDur = empty ? 3.2 : lazy > 0.7 ? lerp(6, 9, lazy) : lerp(4.5, 9, clamp01(A.s.intensity * 0.7 + A.s.duration * 0.3));
  const gap = lazy > 0.7 ? 0 : lerp(0.45, 0.06, aro);

  // clips that genuinely suit the word; a multi-shot verdict always has a counterpoint (the runner-up),
  // so no family plays more than twice — the strongest repeat (new seed, new framing) when more are needed
  const eligible = ranked.filter((c, i) => aff[c] >= aff[ranked[0]] * 0.5 || i < Math.min(count, 2) || i < Math.ceil(count / 2));
  const picks: ClipId[] = [];
  for (let i = 0; i < count; i++) {
    let c = eligible[i % eligible.length];
    if (c === picks[i - 1]) c = eligible[(i + 1) % eligible.length];
    picks.push(c);
  }
  // weights for durations: the first (best-matching) clip holds longest
  const w = picks.map((_, i) => 1 / (1 + i * 0.45));
  const wsum = w.reduce((a, b) => a + b, 0);

  const shots: Shot[] = [];
  t += 0.15;
  // low confidence: a false start — a shot begins, is cut off, and the machine starts again
  if (conf < 0.5 && lazy < 0.7) {
    const alt = ranked[1 + Math.floor(rand() * 2)];
    const d = lerp(0.35, 0.8, rand());
    shots.push({ clip: alt, start: t, dur: d, seed: (rand() * 2 ** 31) | 0, aborted: true, zoom: 1, offX: 0, offY: 0 });
    t += d + lerp(0.25, 0.6, 1 - conf);
  }
  // framing: a family seen again is seen differently — wide, then macro on a detail, then wide
  const seen: Partial<Record<ClipId, number>> = {};
  picks.forEach((clip, i) => {
    const dur = ((verdictDur - gap * (count - 1)) * w[i]) / wsum;
    const n = (seen[clip] = (seen[clip] ?? 0) + 1);
    const macro = n % 2 === 0;
    const ang = rand() * Math.PI * 2;
    const zoom = macro ? lerp(2.8, 5, rand()) : 1;
    const off = macro ? lerp(0.12, 0.45, rand()) : 0;
    shots.push({ clip, start: t, dur, seed: (rand() * 2 ** 31) | 0, aborted: false, zoom, offX: Math.cos(ang) * off, offY: Math.sin(ang) * off });
    t += dur + (i < count - 1 ? gap : 0);
  });

  const blackAt = t;
  const tail = empty ? 6 : lerp(2.4, 4, clamp01(A.s.scale * 0.5 + A.s.duration * 0.5));
  return { cuts, shots, blackAt, end: blackAt + tail };
}
