/**
 * Sand: one material, five behaviours — the verdict's main vocabulary.
 *   chladni — a thin layer on a plate shaken into the figure of a sound (modes from the word's bytes)
 *   dunes   — a deep bed under wind: ripples form and march
 *   crater  — strikes: each impact blasts a crater with a rim and ejecta rays
 *   furrow  — a blade drawn through the bed, ridges thrown up either side
 *   drain   — the bed pours into a hole: a funnel opens and deepens
 * Everything that happens is decided here, once per shot, and shared by the
 * simulation (sand.wgsl), the camera (sand_draw.wgsl) and the sound (clips.ts).
 * Coordinates are the bed's uv (0..1, periodic); times are seconds into the shot.
 */
import type { Appraisal } from '../jev/appraisal.ts';
import { mulberry32 } from '../core/rng.ts';

export const SAND_CLIPS = ['chladni', 'dunes', 'crater', 'furrow', 'drain'] as const;
export type SandClip = (typeof SAND_CLIPS)[number];
export const isSand = (c: string): c is SandClip => (SAND_CLIPS as readonly string[]).includes(c);

export type Impact = { x: number; y: number; t: number; r: number };
/** What the terrain is made of, as the camera sees it: sand; dark pins (pin-art); a dust of coloured light;
 *  dotted contour lines in colour (references: video-f, video-h, video-i, the pin-art image). */
export const SAND_MATERIALS = ['sand', 'pins', 'glitter', 'lines'] as const;

export type SandEvents = {
  behaviour: number;
  material: number;
  /** where the camera looks */
  focus: [number, number];
  wind: { angle: number; strength: number };
  impacts: Impact[];
  blades: { x0: number; y0: number; x1: number; y1: number; t0: number; t1: number; width: number }[];
  drain: { x: number; y: number; r: number; rate: number } | null;
};

/** vec4 slots in the GPU table (see sand.wgsl) */
export const SAND_VEC4 = 16;
export const MAX_IMPACTS = 6;

export function sandEvents(A: Appraisal, clip: SandClip, seed: number, dur: number): SandEvents {
  const rand = mulberry32(seed ^ 0x51a7d00d);
  const ev: SandEvents = {
    behaviour: SAND_CLIPS.indexOf(clip), material: sandMaterial(A, clip, seed), focus: [0.5, 0.5], wind: { angle: rand() * Math.PI * 2, strength: 0 },
    impacts: [], blades: [], drain: null,
  };
  const aro = A.s.arousal;
  if (clip === 'dunes') {
    ev.wind.strength = 0.25 + 0.75 * Math.min(1, A.s.energy * 0.6 + aro * 0.4) * (1 - A.lazy * 0.6);
  } else if (clip === 'crater') {
    const count = 1 + Math.round(aro * 3 + A.s.intensity);
    const n = Math.min(MAX_IMPACTS, count);
    const R = 0.035 + 0.05 * A.s.scale + 0.02 * A.s.intensity;
    let t = 0.12 + rand() * 0.1;
    const cx = 0.35 + rand() * 0.3, cy = 0.35 + rand() * 0.3;
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, d = i === 0 ? 0 : 0.06 + rand() * 0.16;
      ev.impacts.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, t, r: R * (i === 0 ? 1 : 0.5 + rand() * 0.5) });
      // strikes come in a rhythm: a stutter for a charged word, spaced otherwise
      t += (dur * 0.7) / n * (0.4 + rand() * 0.9);
    }
    ev.focus = [cx, cy];
  } else if (clip === 'furrow') {
    // one slow cut for a cold word; two or three slashes for a charged one
    const n = aro > 0.65 ? 3 : aro > 0.4 ? 2 : 1;
    const cx = 0.4 + rand() * 0.2, cy = 0.4 + rand() * 0.2;
    let t = 0.15;
    const draw = Math.min(dur * 0.8 / n, 0.5 + (1 - aro) * 2.2);
    let a = rand() * Math.PI;
    for (let i = 0; i < n; i++) {
      const L = (0.3 + 0.2 * A.s.scale) * (0.7 + 0.3 * rand());
      // cuts cross off-centre (never a sign): each is shifted across its own line
      const sh = (rand() - 0.5) * 0.2;
      const ox = cx - Math.sin(a) * sh, oy = cy + Math.cos(a) * sh;
      const flip = rand() < 0.5 ? 1 : -1;
      ev.blades.push({
        x0: ox - flip * Math.cos(a) * L * 0.5, y0: oy - flip * Math.sin(a) * L * 0.5, x1: ox + flip * Math.cos(a) * L * 0.5, y1: oy + flip * Math.sin(a) * L * 0.5,
        t0: t, t1: t + draw * 0.8, width: 0.012 + 0.014 * A.s.weight,
      });
      t += draw;
      a += (rand() < 0.5 ? 1 : -1) * (0.25 + rand() * 0.6); // the next cut crosses the last at a shallow angle
    }
    ev.focus = [cx, cy];
  } else if (clip === 'drain') {
    ev.drain = { x: 0.5 + (rand() - 0.5) * 0.1, y: 0.5 + (rand() - 0.5) * 0.1, r: 0.018 + 0.012 * A.s.scale, rate: 0.3 + 0.3 * A.s.intensity };
    ev.focus = [ev.drain.x, ev.drain.y];
  }
  return ev;
}

/** Drawn per shot, weighted by different dimensions of the reading: sand for earth, sand, water, flesh and
 *  idle words; pins for machines, metal, stone, order; glitter for light, night, the mind, wonder, joy;
 *  lines for sound, music, rhythm, flow and time. The Chladni plate is always sand on metal. */
function sandMaterial(A: Appraisal, clip: SandClip, seed: number): number {
  if (clip === 'chladni') return 0;
  const m = A.c.material.p, d = A.c.domain.p, em = A.c.emotion.p, rh = A.c.rhythm.p;
  const w = [
    m.sand + m.water * 0.4 + m.flesh * 0.3 + m.wood * 0.3 + A.lazy * 0.7 + em.sadness * 0.3 + 0.3,
    m.metal + m.stone * 0.6 + d.machine + A.s.order * 0.5 + m.glass * 0.3 + em.fear * 0.3 + 0.15,
    m.light + m.void * 0.4 + A.c.daytime.p.night + d.mind * 0.5 + em.awe + em.joy * 0.6 + A.c.time.p.future * 0.4 + 0.2,
    A.c.sense.p.hearing + rh.pulsing * 0.5 + rh.steady * 0.3 + A.c.shape.p.flowing * 0.6 + A.s.duration * 0.4 + em.calm * 0.3 + 0.2,
  ];
  let r = mulberry32(seed ^ 0x3a7e)() * w.reduce((x, y) => x + y, 0);
  for (let k = 0; k < w.length; k++) { r -= w[k]; if (r <= 0) return k; }
  return 0;
}

/** The GPU table: [0] behaviour, impact or blade count, wind angle, wind strength; [1] focus, material;
 *  [2..7] impacts (x, y, t, r); [8..13] blades as pairs (ends; t0, t1, width); [14] drain x, y, r, rate. */
export function packSand(ev: SandEvents): Float32Array {
  const d = new Float32Array(SAND_VEC4 * 4);
  d.set([ev.behaviour, ev.impacts.length || ev.blades.length, ev.wind.angle, ev.wind.strength, ev.focus[0], ev.focus[1], ev.material], 0);
  ev.impacts.forEach((m, i) => d.set([m.x, m.y, m.t, m.r], (2 + i) * 4));
  ev.blades.forEach((b, i) => d.set([b.x0, b.y0, b.x1, b.y1, b.t0, b.t1, b.width], (8 + i * 2) * 4));
  if (ev.drain) d.set([ev.drain.x, ev.drain.y, ev.drain.r, ev.drain.rate], 14 * 4);
  return d;
}

/** Chladni: the plate's modes over a shot — pairs (m, n) from the word's own bytes, changing a few times. */
export function plateModes(A: Appraisal, seed: number): [number, number][] {
  const b = A.bytes.length ? [...A.bytes] : [seed & 255];
  const count = A.s.arousal > 0.6 ? 3 : A.lazy > 0.6 ? 1 : 2;
  const modes: [number, number][] = [];
  for (let k = 0; k < count; k++) {
    const x = b[(k * 2 + (seed & 7)) % b.length], y = b[(k * 2 + 1 + (seed & 7)) % b.length];
    let m = 2 + (x % 6), n = 2 + (y % 6);
    if (m === n) n = n === 7 ? 3 : n + 1; // degenerate modes make no figure
    modes.push([m, n]);
  }
  return modes;
}

/** The mode sounding at fraction u of the shot. */
export function plateMode(A: Appraisal, seed: number, u: number): [number, number] {
  const modes = plateModes(A, seed);
  return modes[Math.min(modes.length - 1, Math.floor(Math.max(0, u) * modes.length))];
}
