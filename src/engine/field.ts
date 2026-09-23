/**
 * The field: CPU-side state of the particle instrument. Produces one uniform
 * snapshot per fixed simulation step; the GPU does the rest.
 */
import { mulberry32 } from '../core/rng';
import { EMOTIONS } from './emotions';
import { deriveReaction, kindIndex, type Params, type Reaction } from './params';
import { GPU_TUNING_KEYS, num, type Tuning } from './tuning';
import { UniformData } from './uniforms';

export const FIXED_DT = 1 / 120;

export function makeParticles(count: number, sessionSeed: number): Float32Array {
  const rand = mulberry32(sessionSeed);
  const data = new Float32Array(count * 16);
  for (let i = 0; i < count; i++) {
    // Full frame (covers up to ~2.3:1), mild density bias toward the centre.
    let x = 0, y = 0;
    for (;;) {
      x = (rand() * 2 - 1) * 2.3;
      y = (rand() * 2 - 1) * 1.08;
      const r2 = x * x + y * y;
      if (rand() < 0.3 + 0.7 * Math.exp(-r2 / 0.9)) break;
    }
    const o = i * 16;
    data[o] = x; data[o + 1] = y; // pos
    data[o + 4] = x; data[o + 5] = y; // home
    data[o + 6] = rand(); // pseed
    data[o + 7] = 1; // restLum multiplier
    data[o + 9] = 1; // size
    data[o + 14] = x; data[o + 15] = y; // frame-start position
  }
  return data;
}

export class Field {
  readonly u = new UniformData();
  tuning: Tuning;
  reaction: Reaction | null = null;
  rt = 0;
  time = 0;
  frame = 0;
  // typing / tension state
  keys = 0;
  tension = 0;
  tensionTarget = 0;
  tremor = 0;
  private kickPending = 0;
  private kickSeed = 1;
  holdCharge = false; // typing or analyzing: home spring loosens
  fadeAll = 0;
  fadeAllTarget = 0;
  persistNow = 0.85;
  frameDt = 1 / 60;
  lightNow = 0;

  constructor(tuning: Tuning, readonly count: number, readonly sessionSeed: number) {
    this.tuning = tuning;
  }

  keystroke(soft = false) {
    this.keys++;
    this.kickPending = num(this.tuning, 'kickAmt') * (soft ? 0.5 : 1);
    this.kickSeed = (this.kickSeed * 1664525 + 1013904223) % 16777216;
    this.tremor = num(this.tuning, 'tremorAmt') * (soft ? 0.5 : 1);
    this.tensionTarget = Math.min(1, this.keys / 10);
  }

  clearCharge() {
    this.keys = 0;
    this.tensionTarget = 0;
  }

  start(params: Params) {
    this.reaction = deriveReaction(params, this.tuning);
    this.rt = 0;
    this.clearCharge();
    this.holdCharge = false;
  }

  /** Re-derive look/colour from current tuning without restarting (live harness edits). */
  refresh() {
    if (this.reaction) this.reaction = deriveReaction(this.reaction.params, this.tuning);
  }

  get phase(): 'idle' | 'reacting' | 'returning' {
    const r = this.reaction;
    if (!r) return 'idle';
    if (this.rt < r.duration) return 'reacting';
    if (this.rt < r.duration + r.returnTime) return 'returning';
    return 'idle';
  }

  step(dt: number, viewport: { w: number; h: number; dpr: number; mw: number; mh: number }, frameStart = false): Float32Array {
    const t = this.tuning;
    const u = this.u;
    this.time += dt;
    this.frame = (this.frame + 1) % 1048576;

    const k = 1 - Math.exp(-dt * 3);
    this.tension += (this.tensionTarget - this.tension) * k;
    this.tremor *= Math.exp(-dt * 10);
    this.fadeAll += (this.fadeAllTarget - this.fadeAll) * (1 - Math.exp(-dt * 4));

    u.set('resX', viewport.w);
    u.set('resY', viewport.h);
    u.set('pxPerUnit', Math.min(viewport.w, viewport.h) / 2);
    u.set('dpr', viewport.dpr);
    u.set('matterW', viewport.mw);
    u.set('matterH', viewport.mh);
    u.set('time', this.time % 8192);
    u.set('dt', dt);
    u.set('frameDt', this.frameDt);
    u.set('frameStart', frameStart ? 1 : 0);
    u.set('count', this.count);
    u.set('frame', this.frame);
    u.set('sessionSeed', this.sessionSeed % 16777216);

    u.set('homeK', num(t, 'homeW') * (this.holdCharge ? 0.22 : 1));
    u.set('charge', Math.min(0.25, this.keys * num(t, 'liftPerKey')));
    u.set('kickSeed', this.kickSeed);
    u.set('kickAmtNow', this.kickPending);
    u.set('kickFrac', num(t, 'kickCount') / this.count);
    this.kickPending = 0;
    u.set('tremor', this.tremor);
    u.set('tension', this.tension);
    u.set('fadeAll', this.fadeAll);

    for (const key of GPU_TUNING_KEYS) u.set(key, num(t, key));

    // central light: off at rest, a faint glow gathers while typing
    const typeLight = Math.min(1, this.keys / 12) * num(t, 'typeLight');
    this.lightNow += (typeLight + num(t, 'restLight') - this.lightNow) * (1 - Math.exp(-dt * 4));
    let lightI = this.lightNow;
    let lightR = 0.5, starI = 0;
    let lc: [number, number, number] = [0.846, 0.791, 0.723];
    for (const k of ['mShock', 'mShockSpeed', 'mSwirl', 'mRing', 'mCollapse', 'mSink', 'mNoise', 'mLazy'] as const) u.set(k, 0);
    u.set('mRingK', 10);

    let persistTarget = 0.85;
    const r = this.reaction;
    if (r && this.phase !== 'idle') {
      this.rt += dt;
      const p = r.params;
      const ss = (a: number, b: number, x: number) => {
        const q = Math.min(1, Math.max(0, (x - a) / (b - a)));
        return q * q * (3 - 2 * q);
      };
      u.set('reacting', 1);
      u.set('rt', this.rt);
      u.set('dur', r.duration);
      u.set('rSeed', p.seed % 16777216);
      u.set('ret', ss(r.duration, r.duration + 0.5, this.rt));
      u.set('retLate', ss(r.duration, r.duration + r.returnTime, this.rt));
      u.set('litFrac', Math.min(1, r.litFrac / this.count)); // litFrac is a grain count
      u.set('confidence', p.confidence);
      EMOTIONS.forEach((_, i) => u.set(`w${i}`, r.weightsArr[i]));
      for (const m of ['intensity', 'energy', 'hardness', 'weight', 'temperature', 'scale', 'light'] as const) u.set(m, p[m]);
      for (const a of ['violence', 'loss', 'closeness', 'absurd'] as const) u.set(a, p.accents[a]);
      u.set('kindId', kindIndex(p.kind));
      u.set('colR', r.color[0]); u.set('colG', r.color[1]); u.set('colB', r.color[2]);
      u.set('col2R', r.color2[0]); u.set('col2G', r.color2[1]); u.set('col2B', r.color2[2]);
      const L = r.look;
      u.set('streak', L.streak);
      u.set('sizeMul', L.sizeMul);
      u.set('lumMul', L.lumMul);
      u.set('retW', L.retW);
      u.set('retZ', L.retZ);
      u.set('sparkle', L.sparkle);
      const inReact = 1 - ss(r.duration, r.duration + r.returnTime, this.rt);
      u.set('expoMul', 1 + (L.expoMul - 1) * inReact);
      persistTarget = 0.85 + (L.persist - 0.85) * inReact;
      const M = r.matter;
      u.set('mShock', M.shock); u.set('mShockSpeed', M.shockSpeed); u.set('mSwirl', M.swirl);
      u.set('mRing', M.ring); u.set('mRingK', M.ringK); u.set('mCollapse', M.collapse);
      u.set('mSink', M.sink); u.set('mNoise', M.noise); u.set('mLazy', M.lazy);
      u.set('retTime', r.returnTime);
      // light: ignition flash, then a sustained glow that fades through decay and return
      const rt = this.rt;
      const sustain = ss(0.1, 0.9, rt) * (1 - ss(0.55 * r.duration, r.duration + 0.8, rt));
      const flash = M.flash * Math.exp(-Math.max(0, rt - 0.25) / 0.22) * ss(0, 0.25, rt);
      lightI = Math.max(lightI, M.light * sustain + flash);
      lightR = M.lightR * (0.3 + 0.7 * sustain); // the flash is local; the glow spreads as it settles
      starI = (M.star * sustain + flash * 0.5) * num(t, 'starAmt');
      lc = r.color;
      if (this.rt >= r.duration + r.returnTime) this.reaction = null;
    } else {
      u.set('reacting', 0);
      u.set('ret', 1);
      u.set('retLate', 1);
      u.set('streak', 0);
      u.set('sparkle', 0);
      u.set('expoMul', 1);
    }
    u.set('lightI', lightI);
    u.set('lightR', lightR);
    u.set('starI', starI);
    u.set('lightColR', lc[0]); u.set('lightColG', lc[1]); u.set('lightColB', lc[2]);
    this.persistNow = persistTarget;
    return u.f32.slice();
  }

  /** Persistence multiplier for a displayed frame of length frameDt. */
  decayFor(frameDt: number): number {
    return Math.pow(this.persistNow, frameDt * 60);
  }
}
