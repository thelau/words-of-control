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
 *  every mark from the word's data; each family answers to different dimensions of the reading.
 *  Ink and solids are other species (the reading gone liquid, ink.wgsl; made matter, solids.wgsl), each a
 *  whole performance of its own. */
export const DATA_CLIPS = ['landscape', 'city', 'lattice', 'cloud', 'tube', 'drift', 'lone'] as const;
export const CLIPS = [...DATA_CLIPS, 'relief', 'chladni', 'ink', 'solids'] as const;
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

/** How a data shot is built (field.wgsl shape()): echo 0–5, warp 0–6, flow 0–3.
 *  An ink shot (ink.wgsl) uses flow as its current (none, shear, one turn, two cells) and warp as its light
 *  (key, behind, raking, dark-field); echo is unused. */
export type Ops = { echo: number; warp: number; flow: number };
export const STILL: Ops = { echo: 0, warp: 0, flow: 0 };

/** One verdict clip, its operators and its coverage (angles, in order). `flash`: it lands with a white beat;
 *  `flip`: it is played in the opposite mood (a misreading, corrected later). */
export type Shot = { clip: ClipId; start: number; dur: number; seed: number; aborted: boolean; angles: Angle[]; ops: Ops; flash?: boolean; flip?: boolean; hold?: boolean };

/** What a performance is made of, seen at a glance: the points (the data formations, the relief, the sand), ink,
 *  or solids. Two performances in a row are never the same species — the second word must not look like the first. */
export type Species = 'points' | 'ink' | 'solids';

/** The performance's form, chosen from the reading (see direct()). */
export type Drama = 'storm' | 'barrage' | 'endless' | 'misreading' | 'bloom' | 'measure' | 'shrug' | 'name' | 'greeting' | 'question' | 'void';

export type Plan = {
  drama: Drama;
  species: Species;
  cuts: Cut[];
  shots: Shot[];
  /** Seconds over which the image fades before the black (0 = a hard cut). */
  fade: number;
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
    // a name: one point held alone (only ever chosen by the name dramaturgy)
    lone: 0,
    // the void, the lazy afternoon: a sparse dust drifting
    drift: (m.void * 0.9 + m.smoke * 0.4 + mo.drifting * 0.3) * A.lazy,
    // (their own species: never mixed into a performance of points)
    ink: 0,
    solids: 0,
  };
}

/** The clips of the last few performances: the room remembers, and the machine avoids repeating itself. */
const recent: ClipId[] = [];
/** The operator combinations of the last performances: never built the same way twice in a row. */
const recentOps: string[] = [];
const openers: ClipId[] = [];
let lastSpecies: Species | null = null;
/** How many performances in a row have been lastSpecies. */
let streak = 0;

/** The clear cases, where one species is plainly the word's material (Laurent: "if a visual is more appropriate
 *  than others based on some of the scores … in specific cases"): liquids and smoke are ink; hard objects are
 *  solids; the machine, nonsense and ordered abstractions are points; a strong feeling with a flowing shape is ink.
 *  Anything else is a soft choice. */
function signature(A: Appraisal): Species | null {
  const m = A.c.material.p, k = A.c.kind.p, d = A.c.domain.p;
  if (m.water + m.smoke >= 0.6 || A.c.texture.p.liquid >= 0.6) return 'ink';
  if ((k.object ?? 0) >= 0.6 && m.metal + m.stone + m.glass + m.wood + m.ice >= 0.6) return 'solids';
  if (d.machine >= 0.6 || A.c.act.p.nonsense >= 0.5 || ((k['abstract idea'] ?? 0) >= 0.7 && A.s.order >= 0.7)) return 'points';
  if (A.c.emotion.confidence >= 0.8 && A.mood.neu < 0.3 && A.c.shape.p.flowing >= 0.4) return 'ink';
  return null;
}

/** How much each species suits the reading: ink the liquid (feeling, fluids, flowing, spreading), solids the
 *  material (objects and bodies, hard and heavy matter, round and jagged forms), points the data (the machine,
 *  order, nonsense, the abstract, the idle). */
function suits(A: Appraisal): Record<Species, number> {
  const m = A.c.material.p, sh = A.c.shape.p, tx = A.c.texture.p, mo = A.c.motion.p, d = A.c.domain.p, k = A.c.kind.p;
  return {
    ink: (1 - A.mood.neu) + m.water + m.smoke + m.fire * 0.7 + m.light * 0.5 + sh.flowing + tx.liquid + tx.soft * 0.3
      + mo.spreading * 0.5 + mo.drifting * 0.5 + mo.circling * 0.4 + A.n.closeness * 0.3 + (k.feeling ?? 0),
    solids: (k.object ?? 0) * 1.5 + (k['living being'] ?? 0) + m.metal + m.stone + m.glass + m.wood + m.ice + m.flesh * 0.5
      + A.s.hardness + A.s.weight + sh.round * 0.6 + sh.jagged * 0.6 + sh.point * 0.5 + d.body * 0.5,
    points: d.machine + d.mind * 0.5 + A.s.order + A.c.act.p.nonsense + (k['abstract idea'] ?? 0) + A.s.strangeness
      + d.city * 0.5 + tx.crystalline * 0.5 + A.lazy * 0.5 + (k.sound ?? 0) * 0.5,
  };
}

/** `salt` makes every performance of the same answers a little different (the room is live, never a replay). */
export function direct(A: Appraisal, salt = (Math.random() * 2 ** 31) | 0): Plan {
  const rand = mulberry32(A.seed ^ 0x5bd1e995 ^ salt);
  const aro = A.s.arousal, lazy = A.lazy, conf = A.c.emotion.confidence;
  const rh = A.c.rhythm.top;
  const md = A.mood, em = A.c.emotion.p, act = A.c.act.p;

  // ---- the dramaturgy: the performance's form follows the reading, not only its fill
  const asked = act.question > 0.4 || A.bytes[A.bytes.length - 1] === 0x3f;
  const empty = A.c.material.top === 'void' && lazy > 0.6;
  const drama: Drama =
    act.name > 0.45 ? 'name'
    : act.greeting > 0.45 ? 'greeting'
    : asked ? 'question'
    : empty ? 'void'
    : md.neg > 0.6 && aro > 0.62 ? 'barrage'
    : (A.n.loss > 0.5 || em.sadness > 0.5) && md.neg > 0.45 ? 'endless'
    : conf < 0.35 && lazy < 0.6 ? 'misreading'
    : md.pos >= md.neg && md.pos >= md.neu ? 'bloom'
    : md.neu > 0.6 && lazy > 0.5 && (A.c.kind.p['abstract idea'] ?? 0) > 0.4 ? 'shrug'
    : md.neu >= md.neg ? 'measure'
    : 'storm';

  // ---- the species (a name is points: its one held point is its meaning)
  // among the others, the reading chooses — mostly the one that suits it best, sometimes the next
  // a clear case takes its species (even the last one, but never a third time in a row); otherwise the reading
  // chooses softly among the others — mostly the one that suits it best, sometimes the next
  const fit = suits(A);
  const pool = (['points', 'ink', 'solids'] as Species[]).filter((x) => x !== lastSpecies);
  const wsp = pool.map((x) => Math.exp(1.5 * fit[x]));
  let rs = rand() * wsp.reduce((x, y) => x + y, 0);
  let species: Species = pool[pool.length - 1];
  for (let i = 0; i < pool.length; i++) { rs -= wsp[i]; if (rs <= 0) { species = pool[i]; break; } }
  const sig = signature(A);
  if (sig && !(sig === lastSpecies && streak >= 2)) species = sig;
  if (drama === 'name') species = 'points';
  streak = species === lastSpecies ? streak + 1 : 1;
  lastSpecies = species;

  // ---- appraisal: rapid cuts, faster when the word is charged
  const appraisalDur = lerp(1.7, 2.6, clamp01(A.tape.length / 180)) * lerp(1.1, 0.85, aro);
  const cutLen = lerp(0.26, 0.075, aro) * (lazy > 0.6 ? 1.8 : 1);
  // it opens on the word itself and its bytes, held long enough to be read: proof the machine is reading *this*
  const cuts: Cut[] = [{ start: 0, dur: lerp(0.7, 0.45, aro), mode: 'word', variant: 0 }];
  let t = cuts[0].dur;
  let prev: CutMode | null = 'word';
  // which readings the machine favours depends on what it found: ordered words read as barcodes and bits,
  // crowded ones as figures, heard ones as spectra, strange ones as return maps (barcodes come in four styles)
  const readings: CutMode[] = ['barcode', 'numbers', 'spectrum', 'bits', 'scatter'];
  const rw = [
    A.s.order + A.c.domain.p.machine * 0.5, A.s.density + A.bytes.length / 24, A.c.sense.p.hearing + (1 - A.s.tone) * 0.5,
    A.s.order * 0.5 + A.c.material.p.metal * 0.5 + 0.2, A.s.strangeness + (1 - conf) * 0.6,
  ].map((x) => 0.15 + x * x);
  rw[0] += 0.6; // the barcode is the house style
  const drawReading = () => { let q = rand() * rw.reduce((x, y) => x + y, 0); for (let k = 0; k < rw.length; k++) { q -= rw[k]; if (q <= 0) return readings[k]; } return readings[0]; };
  while (t < appraisalDur - 0.4) {
    let mode: CutMode;
    do mode = drawReading(); while (mode === prev);
    const irregular = rh === 'stuttering' ? 0.9 : rh === 'steady' ? 0.1 : 0.45;
    const dur = cutLen * lerp(1, 0.35 + rand() * 1.6, irregular);
    cuts.push({ start: t, dur, mode, variant: rand() });
    prev = mode;
    t += dur;
    if (rand() < 0.12 * (1 - aro)) t += cutLen * 0.6; // a breath of black between readings
  }

  // ---- the hand-off: the appraisal ends on its main reading, and the verdict opens on that same reading, frontal,
  // then turns it into space — one continuous gesture (a question instead ends on a line that never closes)
  const COUNTERPART: Partial<Record<CutMode, ClipId>> = { barcode: 'city', numbers: 'cloud', spectrum: 'landscape', bits: 'lattice', scatter: 'cloud' };
  const READING_OF: Partial<Record<ClipId, CutMode>> = { city: 'barcode', cloud: 'scatter', landscape: 'spectrum', lattice: 'bits' };
  const shown = new Map<ClipId, number>();
  for (const c of cuts) { const k = COUNTERPART[c.mode]; if (k) shown.set(k, (shown.get(k) ?? 0) + c.dur); }
  // (ink opens on the barcode: its bars become the first dye; solids on the bits: each 1-bit becomes a sphere)
  const handOff = species === 'ink' ? 'city' : species === 'solids' ? 'lattice' : [...shown.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).find((k) => !openers.includes(k));
  // (a barcode hand-off ends on the vertical-bar style — appraisal.wgsl style = ⌊fract(variant·13.7)·4⌋ = 0 —
  // the one the echo rebuilds, so the last flat frame and the first 3D frame are the same image)
  let lastVariant = rand();
  while (handOff === 'city' && Math.floor((lastVariant * 13.7) % 1 * 4) !== 0) lastVariant = rand();
  if (drama === 'question') {
    cuts.push({ start: t, dur: 0.6, mode: 'line', variant: 0 });
    t += 0.6;
  } else if (handOff) {
    cuts.push({ start: t, dur: 0.45, mode: READING_OF[handOff]!, variant: lastVariant });
    t += 0.45;
  }

  // ---- verdict
  const aff = affinity(A);
  // the reading chooses the form: the word's main material leads to its family of forms, and the relief (a
  // slab of matter) only ever answers heavy matter — never love, fire or shame
  const m = A.c.material.p;
  const FAMILY: Record<string, Partial<Record<ClipId, number>>> = {
    stone: { relief: 3, city: 1.5 }, metal: { relief: 2, city: 2, lattice: 1.3 }, wood: { relief: 2.5, landscape: 1.3 },
    flesh: { relief: 1.8, tube: 1.5 }, cloth: { tube: 1.8, landscape: 1.4 }, water: { landscape: 2.5, tube: 1.3 },
    fire: { cloud: 2, tube: 1.5 }, smoke: { cloud: 2, drift: 1.5 }, void: { drift: 2.5, cloud: 1.3 },
    light: { lattice: 2, tube: 1.5 }, ice: { lattice: 2, city: 1.4 }, glass: { lattice: 2, city: 1.5 }, sand: { chladni: 3, landscape: 1.4 },
  };
  const topMat = A.c.material.top;
  for (const [clip, k] of Object.entries(FAMILY[topMat] ?? {})) aff[clip as ClipId] *= 1 + (k - 1) * Math.min(1, m[topMat] * 1.4);
  if (m.stone + m.metal + m.wood + m.flesh < 0.3) aff.relief *= 0.05;
  // the room remembers its last performances and avoids them — except for the idle words, whose clip is their meaning
  if (lazy < 0.6) for (const c of CLIPS) aff[c] *= Math.pow(0.7, recent.filter((r) => r === c).length);
  // rare clips are rationed across the session: the relief and the sand are treats, not staples
  for (const c of ['relief', 'chladni'] as ClipId[]) if (recent.includes(c)) aff[c] *= 0.25;
  const ranked: ClipId[] = CLIPS.filter((c) => c !== 'lone').sort((a, b) => aff[b] - aff[a]);
  const charge = clamp01(aro * 0.75 + A.s.density * 0.25);
  const dark = clamp01(A.n.violence + em.anger * 0.7 + em.fear * 0.6 + em.anxiety * 0.3 + A.s.tension * 0.3);
  // the pace of the edit: fast and sharp in the dark, energetic and flowing in the light, long in the idle
  const pace = clamp01(charge * 0.5 + dark * 0.6 + md.pos * A.s.energy * 0.5 - lazy * 0.5 - em.calm * 0.3);

  // per dramaturgy: duration (s), shot count, gap between shots, angle length, fade, tail
  type Form = { dur: number; count: number; gap: number; angle: number; fade: number; tail: number };
  const F: Record<Drama, Form> = {
    void: { dur: 5, count: 1, gap: 0, angle: 99, fade: 0, tail: 6 },
    name: { dur: lerp(8, 11, A.s.intensity), count: 1, gap: 0, angle: 99, fade: 2.5, tail: 4 },
    greeting: { dur: lerp(8, 11, A.s.energy), count: 2, gap: 0.2, angle: 3, fade: 0, tail: 3 },
    question: { dur: lerp(6, 8, aro), count: 2, gap: 0.1, angle: lerp(2.5, 1, pace), fade: 0, tail: 1.2 },
    barrage: { dur: lerp(9, 12, A.s.intensity), count: 6, gap: 0, angle: 0.85, fade: 0, tail: 3.5 },
    endless: { dur: lerp(13, 17, A.s.intensity), count: 3, gap: 0.3, angle: 4.5, fade: 5, tail: 8 },
    misreading: { dur: lerp(9, 12, A.s.intensity), count: 4, gap: 0.15, angle: lerp(3, 1, pace), fade: 0, tail: 3 },
    bloom: { dur: lerp(10, 14, A.s.intensity), count: Math.round(lerp(3, 6, A.s.energy * 0.5 + aro * 0.5)), gap: 0.1, angle: lerp(3.5, 1.2, pace), fade: 1.5, tail: 3.5 },
    measure: { dur: lerp(9, 12, A.s.duration), count: 5, gap: 0, angle: 2, fade: 0, tail: 2.5 },
    shrug: { dur: lerp(11, 14, lazy), count: 1, gap: 0, angle: 99, fade: 0, tail: 3 },
    storm: { dur: lerp(9, 14, clamp01(A.s.intensity * 0.5 + A.s.duration * 0.3 + (1 - pace) * 0.2)),
      count: Math.max(2, Math.min(6, Math.round(lerp(2, 6, pace)))), gap: lerp(0.4, 0, pace), angle: lerp(4, 0.55, pace), fade: 0, tail: lerp(2.4, 4, clamp01(A.s.scale * 0.5 + A.s.duration * 0.5)) },
  };
  // a sentence earns more time than a word: up to ~40% longer for six words or more
  const words = 1 + A.bytes.filter((b) => b === 0x20).length;
  const form = { ...F[drama], dur: F[drama].dur * (1 + 0.07 * Math.min(6, words - 1)) };

  // clips that suit the word, drawn by affinity with some chance; each clip once per verdict
  const eligible = ranked.filter((c, i) => aff[c] >= aff[ranked[0]] * 0.45 || i < form.count || c === handOff);
  const picks: ClipId[] = [];
  if (species !== 'points') picks.push(...Array<ClipId>(form.count).fill(species));
  else for (let i = 0; i < form.count; i++) {
    const from = eligible.filter((c) => !picks.includes(c));
    if (!from.length) break;
    let c: ClipId = drama === 'void' ? 'drift' : drama === 'name' ? 'lone' : i === 0 && handOff && from.includes(handOff) ? handOff : from[0];
    if (i > 0) {
      const wts = from.map((x) => Math.pow(Math.max(aff[x], 1e-3), 2));
      let r = rand() * wts.reduce((a, b) => a + b, 0);
      for (let k = 0; k < from.length; k++) { r -= wts[k]; if (r <= 0) { c = from[k]; break; } }
    }
    picks.push(c);
  }
  // durations: the bloom builds to its longest shot at ~60%; the others give the first (best) shot the most
  const w = picks.map((_, i) => drama === 'bloom' ? 1 + 0.8 * Math.exp(-(((i + 0.5) / picks.length - 0.6) ** 2) / 0.04) : drama === 'measure' ? 1 : 1 / (1 + i * 0.2));
  const wsum = w.reduce((a, b) => a + b, 0);

  // coverage: a shot is cut between camera angles on the same continuous scene; the measure cuts on a strict tempo
  // the word's gesture is the motion: when one motion dominates (or the word is still), the camera holds —
  // one or two long takes — so the gesture is seen whole, not chased
  const mTop = Math.max(...Object.values(A.c.motion.p));
  const hold = drama !== 'barrage' && (mTop > 0.55 || A.c.motion.p.still > 0.45);
  const angles = (dur: number): Angle[] => {
    if (form.angle >= 99) return [WIDE];
    if (hold) return dur > 6 ? [{ ...WIDE, seed: rand() }, { ...WIDE, at: dur * 0.55, seed: rand() }] : [{ ...WIDE, seed: rand() }];
    const len = form.angle * lerp(0.8, 1.25, rand());
    const out: Angle[] = [];
    for (let at = 0; at < dur - 0.6; at += drama === 'measure' ? form.angle : Math.max(0.75, len * lerp(0.7, 1.3, rand()))) {
      const r = rand();
      const zoom = r < 0.45 ? 1 : r < 0.75 ? lerp(1.4, 2.2, rand()) : lerp(2.8, 5, rand());
      const a = rand() * Math.PI * 2, off = zoom > 1 ? lerp(0.1, 0.45, rand()) : 0;
      out.push({ at, seed: rand(), zoom, offX: Math.cos(a) * off, offY: Math.sin(a) * off });
    }
    return out.length ? out : [WIDE];
  };

  // the operators of each data shot: weighted by the mood and by the word's own dimensions, drawn with
  // chance, never a combination this performance or the last ones already used
  const mo = A.c.motion.p;
  const draw = (wt: number[]) => { let q = rand() * wt.reduce((x, y) => x + y, 0); for (let k = 0; k < wt.length; k++) { q -= wt[k]; if (q <= 0) return k; } return 0; };
  // operators that would contradict the word's gesture are never drawn: nothing opens out (a fan, a burst)
  // for a contracting or still word, nothing turns or streams for a still one, nothing rigid for a drifting one
  const mp = A.c.motion.p;
  const fits = (o: Ops) =>
    !((mp.contracting > 0.4 || mp.still > 0.45) && (o.echo === 4 || o.echo === 5)) &&
    !(mp.still > 0.45 && (o.flow === 1 || o.flow === 2 || o.warp === 1 || o.warp === 2 || o.warp === 6)) &&
    !(mp.drifting > 0.45 && o.flow === 0 && o.warp === 0) &&
    !(mp.breaking > 0.4 && o.echo === 0 && o.warp === 0);
  const chooseOps = (): Ops => {
    for (let tries = 0; tries < 12; tries++) {
      const ops: Ops = {
        echo: draw([md.neu * 1.5 + 0.3, md.neu + md.pos * 0.8 + 0.2, md.pos * 1.2 + A.c.shape.p.spiral + 0.2, md.pos * 1.5 + A.c.shape.p.round * 0.5 + 0.1,
          md.neg * 0.8 + mo.falling * 0.5 + 0.1, md.neg * 1.3 + mo.spreading + mo.breaking + 0.1]),
        warp: draw([md.neu * 1.5 + 0.3, md.pos + A.c.shape.p.flowing * 0.8 + 0.1, A.s.tension * 0.6 + mo.circling * 0.5 + 0.1, md.neg * 0.7 + 0.1,
          md.neg * 0.6 + mo.falling + 0.05, md.pos * 1.2 + 0.1, md.neg * 0.8 + em.sadness + 0.05]),
        flow: draw([md.neu + mo.still + 0.2, md.neu * 0.8 + md.neg * 0.6 + 0.2, md.pos + mo.circling + 0.2, md.neg * 0.5 + A.c.rhythm.p.pulsing + 0.1]),
      };
      if (!fits(ops)) continue;
      const key = `${ops.echo}${ops.warp}${ops.flow}`;
      if (!recentOps.includes(key)) { recentOps.push(key); recentOps.splice(0, Math.max(0, recentOps.length - 24)); return ops; }
    }
    return { echo: Math.floor(rand() * 6), warp: Math.floor(rand() * 7), flow: Math.floor(rand() * 4) };
  };

  // an ink shot's construction: its current and its light, from the reading, never one just used
  const inkOps = (): Ops => {
    for (let tries = 0; tries < 12; tries++) {
      const ops: Ops = {
        echo: 0,
        flow: draw([0.4 + mo.still + md.neu * 0.6, md.neu * 0.8 + mo.drifting + A.lazy * 0.5 + 0.2, mo.circling + md.pos * 0.6 + 0.2, md.neg * 0.6 + A.s.tension * 0.5 + 0.1]),
        warp: draw([0.5 + md.neu * 0.3, md.pos * 0.8 + A.c.material.p.light + A.c.material.p.glass * 0.5 + 0.2, A.s.hardness + md.neg * 0.6 + 0.1, md.neu + A.c.domain.p.machine * 0.5 + 0.1]),
      };
      const key = `ink${ops.warp}${ops.flow}`;
      if (!recentOps.includes(key)) { recentOps.push(key); recentOps.splice(0, Math.max(0, recentOps.length - 24)); return ops; }
    }
    return { echo: 0, warp: Math.floor(rand() * 4), flow: Math.floor(rand() * 4) };
  };

  // a solids shot's construction: its light (studio, rim, one hard spot, clinical) and its camera move
  // (push in, orbit, crane down, locked), from the reading, never one just used
  const solidsOps = (): Ops => {
    for (let tries = 0; tries < 12; tries++) {
      const ops: Ops = {
        echo: 0,
        warp: draw([0.5 + md.pos * 0.6, md.neg * 1.2 + A.c.material.p.glass * 0.6 + 0.2, A.s.tension * 0.8 + md.neg * 0.5 + 0.1, md.neu * 1.3 + A.s.order * 0.5 + 0.1]),
        flow: draw([0.5 + A.s.intensity * 0.5, mo.circling + md.pos * 0.5 + 0.3, mo.falling + A.s.weight * 0.4 + 0.2, mo.still + md.neu + 0.2]),
      };
      const key = `sol${ops.warp}${ops.flow}`;
      if (!recentOps.includes(key)) { recentOps.push(key); recentOps.splice(0, Math.max(0, recentOps.length - 24)); return ops; }
    }
    return { echo: 0, warp: Math.floor(rand() * 4), flow: Math.floor(rand() * 4) };
  };

  const shots: Shot[] = [];
  t += 0.15;
  // low confidence (outside the misreading itself): a false start — a shot begins, is cut off, and the machine starts again
  if (conf < 0.5 && lazy < 0.7 && drama === 'storm' && species === 'points') {
    const alt = ranked[1 + Math.floor(rand() * 2)];
    const d = lerp(0.35, 0.8, rand());
    shots.push({ clip: alt, start: t, dur: d, seed: (rand() * 2 ** 31) | 0, aborted: true, angles: [WIDE], ops: STILL });
    t += d + lerp(0.25, 0.6, 1 - conf);
  }
  picks.forEach((clip, i) => {
    const dur = ((form.dur - form.gap * (picks.length - 1)) * w[i]) / wsum;
    let cover = angles(dur);
    let seed = (rand() * 2 ** 31) | 0;
    // (the dye is a 1024² field: a closer view than 2.5× would show its grain)
    // and it opens wide, so its first dye is the barcode just seen
    if (clip === 'ink') cover = cover.map((x, k) => (i === 0 && k === 0 ? { ...x, zoom: 1, offX: 0, offY: 0 } : { ...x, zoom: Math.min(x.zoom, 2.5) }));
    // solids open dead frontal, so the spheres stand where the bits just were
    else if (clip === 'solids') { if (i === 0) cover = [{ ...WIDE, seed: -1 }, ...cover.filter((x) => x.at >= 2.5)]; }
    else if (i === 0 && clip === handOff && drama !== 'question') {
      // the reveal: the reading itself, frontal (angle seed −1), with the appraisal's last variant, then into its depth
      cover = [{ ...WIDE, seed: -1 }, ...cover.filter((x) => x.at >= 3)];
      seed = seed - (seed % 1000) + Math.round(lastVariant * 999);
    }
    // a greeting: the field turns to face you (the reveal, reversed)
    if (drama === 'greeting' && i === picks.length - 1) cover = [{ ...WIDE, seed: -2 }];
    shots.push({
      clip, start: t, dur, seed, aborted: false, angles: cover, ops: clip === 'ink' ? inkOps() : clip === 'solids' ? solidsOps() : chooseOps(),
      // the barrage opens on a white beat (one, not a strobe); the misreading's correction lands with one too
      flash: (drama === 'barrage' && i === 0) || (drama === 'misreading' && i === Math.ceil(picks.length / 2)),
      flip: drama === 'misreading' && i < Math.ceil(picks.length / 2),
      hold,
    });
    t += dur + (i < picks.length - 1 ? form.gap : 0);
  });

  if (species === 'points') {
    openers.push(picks[0]);
    openers.splice(0, Math.max(0, openers.length - 3));
    recent.push(...new Set(picks));
    recent.splice(0, Math.max(0, recent.length - 6));
  }
  // the signature: the word, its bytes and the performance's number, small, before the black (every recording
  // carries its own caption)
  cuts.push({ start: t, dur: 1.1, mode: 'word', variant: 2 });
  t += 1.1;
  const blackAt = t;
  return { drama, species, cuts, shots, fade: form.fade, blackAt, end: blackAt + form.tail };
}
