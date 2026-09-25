/**
 * Contours's voice: the land heard as the camera crosses it — one continuous voice over all its shots
 * (contours.wgsl). A slow cluster of sines is the land's profile: each partial one of the spectrum rows passing
 * under the camera, loud where its ridge is high, gliding a little with it (never to silence: the valleys are quiet,
 * not empty). On each beat of the verdict clock (the one that lights a comb of rows) a contour is heard passing: a
 * soft tone pitched by its row, panned across. Under it the wind over the land, coloured by its matter (sand hisses
 * finely, water rolls, stone is dry and low, smoke breathes, fire crackles faintly). The mood tunes it all (k.tune):
 * positive in the just major of D, neutral on exact test frequencies, negative free, with a sub floor.
 */
import type { VoiceKit } from '../clips.ts';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** The cluster's partials (ratios to its root): a root, fifth, octave, tenth, twelfth. */
const PARTIALS = [1, 1.5, 2, 2.5, 3];

export function contours(k: VoiceKit): number[] {
  const { A, a } = k;
  const c = a.ctx;
  const tape = A.tape;
  const tv = (i: number) => tape[((i % tape.length) + tape.length) % tape.length];
  const rp = A.c.rhythm.p, mo = A.c.motion.p, m = A.c.material.p;
  const slow = lerp(1, 0.35, A.lazy);
  // rows crossed per second (the camera's flight; drifting land flows past faster)
  const rate = lerp(0.8, 3, A.s.arousal) * slow * (1 + 1.5 * mo.drifting);
  const root = k.tune(k.f0 / 2) * (A.mood.neg > 0.5 ? 0.5 : 1);
  const freqs = PARTIALS.map((r) => k.tune(root * r));
  const span = Math.max(0.1, k.dur);
  const level = (u: number) => Math.max(0.3, 1 + 0.35 * rp.swelling * (2 * u - 1) - 0.6 * rp.dwindling * u);
  const land = k.rendered((L, R, sr) => {
    const n = L.length;
    const ph = freqs.map(() => k.rand() * 6.28);
    // each partial reads its own row, smoothly interpolated (a ridge rising under the camera)
    const height = (i: number, t: number) => {
      const x = (k.off + t) * rate + i * 7;
      const f = x - Math.floor(x);
      const s = f * f * (3 - 2 * f);
      return tv(Math.floor(x) + 3) * (1 - s) + tv(Math.floor(x) + 4) * s;
    };
    for (let j = 0; j < n; j++) {
      const t = j / sr;
      const u = Math.min(1, (k.off + t) / span);
      let l = 0, r = 0;
      for (let i = 0; i < freqs.length; i++) {
        const h = height(i, t);
        // (the higher the ridge, the louder and a hair higher: the land's profile as a slowly moving chord)
        ph[i] += (2 * Math.PI * freqs[i] * (1 + (h - 0.5) * 0.006)) / sr;
        const g = (0.25 + 0.75 * h * h) * (i ? 0.55 / i : 1);
        const x = Math.sin(ph[i]) * g;
        const pan = ((i % 2 ? 1 : -1) * i) / 8;
        l += x * (1 - pan); r += x * (1 + pan);
      }
      const e = 0.045 * level(u) * Math.min(1, t / 1.2); // (swells in; the gate carries it out)
      L[j] += l * e; R[j] += r * e;
    }
    // the contours passing: one soft tone per beat (a stutter skips the ones the image skips)
    for (let b = Math.ceil(k.off / k.beat); b * k.beat < k.off + k.dur; b++) {
      if (rp.stuttering > 0.35 && k.skipped(b)) continue;
      const s0 = Math.floor((b * k.beat - k.off) * sr);
      const f = k.tune(root * 2 * Math.pow(2, tv(b * 7 + 3) * 1.5));
      const pan = Math.sin(b * 1.7) * 0.6;
      const amp = 0.05 * level((b * k.beat) / span) * (0.6 + rp.steady + rp.stuttering * 0.8);
      const len = Math.floor(sr * lerp(1.4, 0.6, A.s.arousal));
      let p = 0;
      for (let j = 0; j < len && s0 + j < n; j++) {
        const u = j / sr;
        p += (2 * Math.PI * f) / sr;
        const x = (Math.sin(p) + 0.25 * Math.sin(2 * p)) * amp * (1 - Math.exp(-u / 0.012)) * Math.exp(-u / 0.35);
        L[s0 + j] += x * (1 - pan); R[s0 + j] += x * (1 + pan);
      }
    }
  });
  land.connect(k.out);
  // the wind over the land, its matter's colour: a band of noise drifting slowly (sand fine and high, water low and
  // rolling, stone dry, smoke breathing)
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  const centre = 250 + 2600 * m.sand + 900 * m.smoke + 500 * m.fire + 200 * m.stone - 120 * m.water;
  bp.frequency.value = Math.max(120, centre);
  bp.Q.value = lerp(0.7, 2.5, m.water + m.stone * 0.5);
  const lfo = c.createOscillator();
  lfo.frequency.value = lerp(0.05, 0.2, A.s.arousal) * slow;
  const depth = c.createGain();
  depth.gain.value = Math.max(80, centre * 0.4);
  lfo.connect(depth).connect(bp.frequency);
  lfo.start(k.start); lfo.stop(k.end + 1);
  const wind = c.createGain();
  wind.gain.setValueAtTime(0, k.start);
  wind.gain.linearRampToValueAtTime(lerp(0.06, 0.16, A.s.arousal * 0.5 + m.sand * 0.5 + m.water * 0.3), k.start + 1.5);
  k.noise().connect(bp).connect(wind).connect(k.out);
  k.pulse().connect(k.out);
  if (k.strike) k.blow();
  if (!k.pos) {
    const g = c.createGain();
    g.gain.setValueAtTime(0, k.start);
    g.gain.linearRampToValueAtTime(0.09, k.start + 0.8);
    g.connect(k.out);
    const fs = 37 + A.s.weight * 10;
    k.sines([fs, fs + 0.6], g);
  }
  return [root, freqs[1]];
}
