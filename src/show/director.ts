/**
 * The director: turns one appraisal into a performance plan. The grammar is
 * fixed (appraisal → verdict clips → black); everything inside it — which
 * clips, their order, lengths, cuts, parameters — is decided here from the
 * judgement, deterministically (seeded by the word + the answers).
 */
import type { Appraisal } from '../jev/appraisal.ts';
import { mulberry32 } from '../core/rng.ts';
import type { Layer } from '../render/gpu.ts';
import { PLUGINS, PLUGIN_NAMES, READY, isPlugin, type PluginName } from './species/index.ts';
import { CYCLE, FILM, FRAME, runs, type FilmSection } from './film.ts';

/** The verdict vocabulary. The appraisal gone 3D — data formations (field.wgsl), each the spatial form of
 *  a 2D reading, and drift, the void — and two matters the data acts on: the relief (data → surface) and
 *  chladni (the word's bytes as sound shaping sand). One language: monochrome, one accent,
 *  every mark from the word's data; each family answers to different dimensions of the reading.
 *  Solids and the plug-ins (src/show/species) are other species: materials the sequence's scenes use. */
export const DATA_CLIPS = ['landscape', 'city', 'lattice', 'cloud', 'tube', 'drift', 'hall', 'curtain'] as const;
export const CLIPS = [...DATA_CLIPS, 'relief', 'chladni', 'solids', 'threads', 'pins', 'strata'] as const;
export type ClipId = (typeof CLIPS)[number];

/** Which renderer layer draws a clip. */
export const layerOf = (c: ClipId): Layer =>
  (DATA_CLIPS as readonly string[]).includes(c) ? 'data' : c === 'chladni' ? 'sand' : (c as Layer);

export const CUT_MODES = ['barcode', 'numbers', 'spectrum', 'bits', 'scatter', 'line', 'word'] as const;
export type CutMode = (typeof CUT_MODES)[number];

/** One flash of the appraisal. */
/** One flash of the appraisal (or, inside the verdict, a flat data shot between the 3D shots). `inv`: drawn as a
 *  white slab, the data black on it. */
export type Cut = { start: number; dur: number; mode: CutMode; variant: number; inv?: boolean };

/** One camera angle inside a shot, from `at` seconds: a cut on the same continuous scene.
 *  zoom 1 = wide, > 1 = close on (offX, offY); `seed` sets the camera (sand: height, direction, roll;
 *  data: side, height, inside or not — and −1 = the frontal reveal of the appraisal's reading). */
export type Angle = { at: number; seed: number; zoom: number; offX: number; offY: number };
export const WIDE: Angle = { at: 0, seed: 0.5, zoom: 1, offX: 0, offY: 0 };

/** How a data shot is built (field.wgsl shape()): echo 0–5, warp 0–6, flow 0–3. Solids and the plug-ins use warp
 *  as their light and flow as their camera move; echo is unused. */
export type Ops = { echo: number; warp: number; flow: number };
export const STILL: Ops = { echo: 0, warp: 0, flow: 0 };

/** One verdict clip, its operators and its coverage (angles, in order). `flash`: it lands with a white beat;
 *  `flip`: it is played in the opposite mood (a misreading, corrected later). */
export type Shot = { clip: ClipId; start: number; dur: number; seed: number; aborted: boolean; angles: Angle[]; ops: Ops; flash?: boolean; flip?: boolean; hold?: boolean };

/** What a performance is made of, seen at a glance: the points (the data formations, the relief, the sand), solids,
 *  or a plug-in. Two performances in a row are never the same species — the second word must not look like the first. */
export type Species = 'points' | 'solids' | PluginName;

/** The performance's form, chosen from the reading (see direct()). */
export type Drama = 'storm' | 'barrage' | 'endless' | 'misreading' | 'bloom' | 'measure' | 'shrug' | 'name' | 'greeting' | 'question' | 'void';

/** One cycle of the sequence (after the film's 3 s cycle): an attack of flashes (the flicker is also the sound's gate),
 *  a hold, and a black tail; `scene`: what it shows (the matter, the word's data, or the break's black); the hold's
 *  `clip`: its matter (null: its data). The music is built on these (audio/music.ts). */
export type Cycle = {
  start: number; dur: number; section: FilmSection; scene: 'matter' | 'data' | 'break';
  flashes: { start: number; dur: number }[]; hold: { start: number; dur: number; clip: ClipId | null };
};

export type Plan = {
  drama: Drama;
  species: Species;
  cuts: Cut[];
  shots: Shot[];
  cycles: Cycle[];
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
    // (straight geometry is preferred — lines, columns, fields — so the organic cloud and tube are weighed down)
    // a cloud of relations: chaos, fear, spreading, smoke and void, the cosmos, wonder
    cloud: 0.7 * ((1 - s.order) * 0.6 + em.fear * 0.7 + em.awe * 0.6 + mo.spreading * 0.6 + mo.breaking * 0.5 + m.smoke * 0.5 + m.void * 0.4
      + d.cosmos * 0.8 + s.strangeness * 0.3 + (1 - A.c.emotion.confidence) * 0.4 + em.joy * 0.3),
    // one line closing on itself: the tone, the circle, love, the sacred, the timeless
    tube: 0.7 * (s.tone * 0.5 + mo.circling * 0.7 + sh.round * 0.5 + sh.spiral * 0.6 + A.c.sense.p.hearing * 0.4 + em.tender * 0.7
      + n.closeness * 0.6 + s.sacred * 0.5 + tm.timeless * 0.3 + d.home * 0.4 + d.body * 0.3),
    // data made surface: matter, body, weight, stone, flesh, wood, the still
    relief: m.stone * 0.8 + m.flesh * 0.7 + m.wood * 0.6 + m.cloth * 0.5 + tx.cracked * 0.5 + tx.soft * 0.4 + tx.fibrous * 0.5
      + mo.still * 0.5 + mo.contracting * 0.4 + s.weight * 0.5 + d.body * 0.4,
    // the word's bytes as a sound shaping sand: heard, tonal, rhythmic, sand itself
    chladni: A.c.sense.p.hearing * 1.1 + m.sand * 0.8 + tx.grainy * 0.4 + rh.pulsing * 0.6 + mo.trembling * 0.6 + s.order * 0.3
      + s.sacred * 0.3 + em.joy * 0.2,
    // an installation you walk through: places, order, scale, the city, awe, distance, the shared ("we"), the steady
    hall: (A.c.kind.p.place ?? 0) * 1.1 + s.order * 0.6 + s.scale * 0.8 + d.city * 0.6 + em.awe * 0.6 + s.distance * 0.4
      + A.c.who.p.we * 0.5 + rh.steady * 0.4 + tm.timeless * 0.3 + m.stone * 0.3 + m.glass * 0.3 + 0.3,
    // the void, the lazy afternoon: a sparse dust drifting
    drift: (m.void * 0.9 + m.smoke * 0.4 + mo.drifting * 0.3) * A.lazy,
    // a falling curtain of grains: falling, water, rain, the steady, the dense, the calm and the sad
    curtain: mo.falling * 0.8 + m.water * 0.7 + s.density * 0.5 + rh.steady * 0.3 + em.calm * 0.3 + em.sadness * 0.3
      + d.nature * 0.3 + A.c.sense.p.hearing * 0.3 + 0.3,
    // (their own species: never mixed into a performance of points)
    solids: 0,
    threads: 0,
    pins: 0,
    strata: 0,
  };
}

/** The clips of the last few performances: the room remembers, and the machine avoids repeating itself. */
const recent: ClipId[] = [];
/** The operator combinations of the last performances: never built the same way twice in a row. */
const recentOps: string[] = [];
const openers: ClipId[] = [];
let lastSpecies: Species | null = null;
/** How much each species suits the reading: solids the
 *  material (objects and bodies, hard and heavy matter, round and jagged forms), points the data (the machine,
 *  order, nonsense, the abstract, the idle). */
function suits(A: Appraisal): Record<Species, number> {
  const plugins = Object.fromEntries(PLUGIN_NAMES.map((n) => [n, PLUGINS[n].suits(A)])) as Record<PluginName, number>;
  const m = A.c.material.p, sh = A.c.shape.p, tx = A.c.texture.p, d = A.c.domain.p, k = A.c.kind.p;
  return {
    solids: (k.object ?? 0) * 1.5 + (k['living being'] ?? 0) + m.metal + m.stone + m.glass + m.wood + m.ice + m.flesh * 0.5
      + A.s.hardness + A.s.weight + sh.round * 0.6 + sh.jagged * 0.6 + sh.point * 0.5 + d.body * 0.5,
    points: d.machine + d.mind * 0.5 + A.s.order + A.c.act.p.nonsense + (k['abstract idea'] ?? 0) + A.s.strangeness
      + d.city * 0.5 + tx.crystalline * 0.5 + A.lazy * 0.5 + (k.sound ?? 0) * 0.5,
    ...plugins,
  };
}

/** `salt` makes every performance of the same answers a little different (the room is live, never a replay);
 *  `force` picks the species (the picker, for testing). */
export function direct(A: Appraisal, salt = (Math.random() * 2 ** 31) | 0, force?: Species): Plan {
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

  // ---- the species (a name too: it is performed as one long held take, see the forms below)
  // among the others, the reading chooses — mostly the one that suits it best, sometimes the next
  // never the last one; among the others, chance — the reading only leans on it (Laurent: the surprise matters
  // more than the fit)
  const fit = suits(A);
  // (a plug-in not yet built is never drawn)
  const pool = (['points', 'solids', ...PLUGIN_NAMES] as Species[]).filter((x) => x !== lastSpecies && (!isPlugin(x) || READY[x]));
  const wsp = pool.map((x) => Math.exp(1.5 * fit[x]));
  let rs = rand() * wsp.reduce((x, y) => x + y, 0);
  let species: Species = pool[pool.length - 1];
  for (let i = 0; i < pool.length; i++) { rs -= wsp[i]; if (rs <= 0) { species = pool[i]; break; } }
  if (force) species = force;
  lastSpecies = species;

  // ---- appraisal: rapid cuts, faster when the word is charged
  const appraisalDur = lerp(0.9, 1.4, clamp01(A.tape.length / 180)) * lerp(1.1, 0.85, aro); // (step 0 of the sequence: fast)
  const cutLen = lerp(0.26, 0.075, aro) * (lazy > 0.6 ? 1.8 : 1);
  // it opens on the word itself and its bytes, held long enough to be read: proof the machine is reading *this*
  const cuts: Cut[] = [{ start: 0, dur: lerp(0.5, 0.32, aro), mode: 'word', variant: 0 }];
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
  // (solids open on the bits: each 1-bit becomes a sphere)
  const handOff = species === 'solids' ? 'lattice' : isPlugin(species) ? PLUGINS[species].handOff : [...shown.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).find((k) => !openers.includes(k));
  // (a barcode hand-off ends on the vertical-bar style — appraisal.wgsl style = ⌊fract(variant·13.7)·4⌋ = 0 —
  // the one the echo rebuilds, so the last flat frame and the first 3D frame are the same image)
  let lastVariant = rand();
  while (handOff === 'city' && Math.floor((lastVariant * 13.7) % 1 * 4) !== 0) lastVariant = rand();
  if (drama === 'question') {
    cuts.push({ start: t, dur: 0.6, mode: 'line', variant: 0 });
    t += 0.6;
  } else if (handOff) {
    cuts.push({ start: t, dur: 0.3, mode: READING_OF[handOff]!, variant: lastVariant });
    t += 0.3;
  }

  // ---- verdict
  const aff = affinity(A);
  // the reading chooses the form: the word's main material leads to its family of forms, and the relief (a
  // slab of matter) only ever answers heavy matter — never love, fire or shame
  const m = A.c.material.p;
  const FAMILY: Record<string, Partial<Record<ClipId, number>>> = {
    stone: { relief: 3, city: 1.5, hall: 1.5 }, metal: { relief: 2, city: 2, lattice: 1.3, hall: 1.3 }, wood: { relief: 2.5, landscape: 1.3 },
    flesh: { relief: 1.8, tube: 1.5 }, cloth: { tube: 1.8, landscape: 1.4 }, water: { landscape: 2.5, tube: 1.3 },
    fire: { cloud: 2, tube: 1.5 }, smoke: { cloud: 2, drift: 1.5 }, void: { drift: 2.5, cloud: 1.3 },
    light: { lattice: 2, hall: 1.8 }, ice: { lattice: 2, city: 1.4 }, glass: { lattice: 2, city: 1.5, hall: 1.4 }, sand: { chladni: 3, landscape: 1.4 },
  };
  const topMat = A.c.material.top;
  for (const [clip, k] of Object.entries(FAMILY[topMat] ?? {})) aff[clip as ClipId] *= 1 + (k - 1) * Math.min(1, m[topMat] * 1.4);
  if (m.stone + m.metal + m.wood + m.flesh < 0.3) aff.relief *= 0.05;
  // the room remembers its last performances and avoids them — except for the idle words, whose clip is their meaning
  if (lazy < 0.6) for (const c of CLIPS) aff[c] *= Math.pow(0.7, recent.filter((r) => r === c).length);
  // rare clips are rationed across the session: the relief and the sand are treats, not staples
  for (const c of ['relief', 'chladni'] as ClipId[]) if (recent.includes(c)) aff[c] *= 0.25;
  const ranked: ClipId[] = [...CLIPS].sort((a, b) => aff[b] - aff[a]);
  const charge = clamp01(aro * 0.75 + A.s.density * 0.25);
  const dark = clamp01(A.n.violence + em.anger * 0.7 + em.fear * 0.6 + em.anxiety * 0.3 + A.s.tension * 0.3);
  // the pace of the edit: fast and sharp in the dark, energetic and flowing in the light, long in the idle
  const pace = clamp01(charge * 0.5 + dark * 0.6 + md.pos * A.s.energy * 0.5 - lazy * 0.5 - em.calm * 0.3);

  // per dramaturgy: duration (s), shot count, angle length, fade, tail
  type Form = { dur: number; count: number; angle: number; fade: number; tail: number };
  const F: Record<Drama, Form> = {
    void: { dur: 5, count: 1, angle: 99, fade: 0, tail: 6 },
    name: { dur: lerp(8, 11, A.s.intensity), count: 1, angle: 99, fade: 2.5, tail: 4 },
    greeting: { dur: lerp(8, 11, A.s.energy), count: 2, angle: 3, fade: 0, tail: 3 },
    question: { dur: lerp(6, 8, aro), count: 2, angle: lerp(2.5, 1, pace), fade: 0, tail: 1.2 },
    barrage: { dur: lerp(9, 12, A.s.intensity), count: 6, angle: 0.85, fade: 0, tail: 3.5 },
    endless: { dur: lerp(13, 17, A.s.intensity), count: 3, angle: 4.5, fade: 5, tail: 8 },
    misreading: { dur: lerp(9, 12, A.s.intensity), count: 4, angle: lerp(3, 1, pace), fade: 0, tail: 3 },
    bloom: { dur: lerp(10, 14, A.s.intensity), count: Math.round(lerp(3, 6, A.s.energy * 0.5 + aro * 0.5)), angle: lerp(3.5, 1.2, pace), fade: 1.5, tail: 3.5 },
    measure: { dur: lerp(9, 12, A.s.duration), count: 5, angle: 2, fade: 0, tail: 2.5 },
    shrug: { dur: lerp(11, 14, lazy), count: 1, angle: 99, fade: 0, tail: 3 },
    storm: { dur: lerp(9, 14, clamp01(A.s.intensity * 0.5 + A.s.duration * 0.3 + (1 - pace) * 0.2)),
      count: Math.max(2, Math.min(6, Math.round(lerp(2, 6, pace)))), angle: lerp(4, 0.55, pace), fade: 0, tail: lerp(2.4, 4, clamp01(A.s.scale * 0.5 + A.s.duration * 0.5)) },
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
    let c: ClipId = drama === 'void' ? 'drift' : i === 0 && handOff && from.includes(handOff) ? handOff : from[0];
    if (i > 0) {
      const wts = from.map((x) => Math.pow(Math.max(aff[x], 1e-3), 2));
      let r = rand() * wts.reduce((a, b) => a + b, 0);
      for (let k = 0; k < from.length; k++) { r -= wts[k]; if (r <= 0) { c = from[k]; break; } }
    }
    picks.push(c);
  }
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

  // a plug-in species' construction: weighted by its own reading of the word, never one just used
  const pluginOps = (name: PluginName): Ops => {
    const wt = PLUGINS[name].ops(A);
    for (let tries = 0; tries < 12; tries++) {
      const ops: Ops = { echo: 0, warp: draw(wt.warp), flow: draw(wt.flow) };
      const key = `${name}${ops.warp}${ops.flow}`;
      if (!recentOps.includes(key)) { recentOps.push(key); recentOps.splice(0, Math.max(0, recentOps.length - 24)); return ops; }
    }
    return { echo: 0, warp: draw(wt.warp), flow: draw(wt.flow) };
  };

  const shots: Shot[] = [];
  t += 0.15;
  // ---- the sequence: the film's own score, replayed frame by frame (show/film.ts — Ikeda, data.matrix, measured
  // from the reference). Its cycles keep their figures and their order: section A (the matter flickering in its code,
  // then held), a break of black, section B (a white slab of data strobing, the matter strobing), the return. The
  // word fills them — its matter in every '#', its readings on every slab ('W') and in every dim flash ('+') — and
  // decides which of the film's cycles it reaches: a charged word goes through the break into B, an idle one stays in
  // A; its own bytes choose which of A's cycles play. The flicker is also the music (audio/music.ts): a cut is a beat.
  const breakHard = clamp01(A.s.tension * 0.6 + em.anger * 0.7 + em.anxiety * 0.6 + dark * 0.5 + aro * 0.3 - lazy * 0.6 - em.calm * 0.4);
  const n = Math.max(4, Math.min(10, Math.round(lerp(5, 9, charge * 0.6 + A.s.intensity * 0.4) - lazy * 2)));
  const pick = <T,>(pool: T[], k: number, salt: number): T[] => {
    // k of the pool, in the film's order, chosen by the word's own bytes
    const key = (i: number) => ((A.bytes[(i + salt) % Math.max(1, A.bytes.length)] ?? i) * 2654435761 + i * 97) % 1000;
    return pool.map((x, i) => ({ x, i, k: key(i) })).sort((a, b) => a.k - b.k).slice(0, k).sort((a, b) => a.i - b.i).map((e) => e.x);
  };
  const filmA = FILM.filter((c) => c.section === 'A'), filmB = FILM.filter((c) => c.section === 'B');
  const filmBreak = FILM.find((c) => c.section === 'break')!, filmR = FILM.filter((c) => c.section === 'R');
  const withB = breakHard > 0.3 && n >= 7;
  const nB = withB ? Math.min(filmB.length, n >= 9 ? 4 : n >= 8 ? 3 : 2) : 0;
  const nR = n >= 6 ? 2 : 1;
  const nA = Math.max(1, n - nR - nB - (withB ? 1 : 0));
  const order = [
    filmA[0], ...pick(filmA.slice(1), nA - 1, 1),
    ...(withB ? [filmBreak, ...filmB.slice(0, nB)] : []),
    ...(nR > 1 ? pick(filmR.slice(0, 2), 1, 3) : []), filmR[2],
  ];
  // the materials: the performance's species, and a second the return turns to
  const matOf = (sp: Species): ClipId => sp === 'points' ? (picks.length ? picks[0] : ranked.find((c) => (DATA_CLIPS as readonly string[]).includes(c) && c !== 'drift') ?? 'landscape') : sp;
  const others = (['points', 'solids', ...PLUGIN_NAMES] as Species[]).filter((x) => x !== species && (!isPlugin(x) || READY[x]));
  const second = matOf(others[Math.floor(rand() * others.length)] ?? species);
  const opsOf = (clip: ClipId): Ops => clip === 'solids' ? solidsOps() : isPlugin(clip) ? pluginOps(clip) : chooseOps();
  const cycles: Cycle[] = [];
  let pointsPick = 0;
  order.forEach((film, c) => {
    const cs = t, u = c / order.length;
    let clip = film.section === 'R' && rand() < 0.5 ? second : matOf(species);
    if (species === 'points' && clip === matOf(species)) clip = picks[Math.floor(pointsPick++ / 2) % picks.length];
    let cover: Angle = { ...(angles(CYCLE)[0] ?? WIDE), at: 0 };
    if (isPlugin(clip)) cover = { ...cover, zoom: Math.min(cover.zoom, PLUGINS[clip].maxZoom) };
    let seed = (rand() * 2 ** 31) | 0;
    if (c === 0) {
      // the hand-off: the reading itself, frontal (angle seed −1), with the appraisal's last variant
      cover = { ...WIDE, seed: -1 };
      seed = seed - (seed % 1000) + Math.round(lastVariant * 999);
    }
    if (drama === 'greeting' && c === order.length - 1) cover = { ...WIDE, seed: -2 };
    const ops = opsOf(clip);
    const slab = drawReading(), dim: CutMode = rand() < 0.5 ? 'numbers' : 'bits';
    const flashes: { start: number; dur: number }[] = [];
    let hold = { start: cs + CYCLE, dur: 0, clip: null as ClipId | null };
    for (const r of runs(film.frames)) {
      if (r.sym === '.') continue;
      const start = cs + r.at * FRAME, dur = r.len * FRAME;
      if (r.sym === '#') shots.push({ clip, start, dur, seed, aborted: false, angles: [cover], ops, flip: drama === 'misreading' && u < 0.5, hold: true });
      else cuts.push({ start, dur, mode: r.sym === 'W' ? slab : dim, variant: rand(), inv: r.sym === 'W' });
      if (r.len <= 3) flashes.push({ start, dur });
      else if (dur > hold.dur) hold = { start, dur, clip: r.sym === '#' ? clip : null };
    }
    cycles.push({ start: cs, dur: CYCLE, section: film.section, scene: film.section === 'break' ? 'break' : hold.clip ? 'matter' : 'data', flashes, hold });
    t = cs + CYCLE;
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
  return { drama, species, cuts, shots, cycles, fade: form.fade, blackAt, end: blackAt + form.tail };
}
