/**
 * Light's voice: one continuous chord of sines over all its shots — the light heard as held tones, never plastic,
 * never new-age. Driven by the same reading and the same verdict clock as its image (light.wgsl):
 *  - the opening: the reading's dots are a few faint high points of sound; then one pure tone opens with the light,
 *    and the chord blooms out of it over the same seconds the dots open into light;
 *  - the mood tunes the chord (k.tune): positive a just major of D, neutral exact test tones, negative free values
 *    from the reading, narrow and low;
 *  - the matter colours it: water, glass, ice, crystal and light shimmer (high partials wandering like caustics),
 *    glass and ice ring inharmonic, metal beats hard and bright, fire is warm and low, smoke breathes (filtered
 *    noise), stone/sand/wood/cloth/flesh are darker and rounder, void is almost nothing;
 *  - the motion: rising glides up, falling glides down and darkens, spreading widens (more partials, wider),
 *    contracting narrows to one pure tone (the slit), circling turns in the stereo field, trembling a slow vibrato,
 *    breaking detunes the partials apart, drifting drifts in the stereo;
 *  - the rhythm: each beat (the same beats as the image's wave of light; a stutter skips some) a soft chime at its
 *    point's pitch, panned where the point is; a pulsing word's tide breathes the chord; swelling/dwindling as the
 *    image; a lazy word moves slower; the strike's blow (k.blow); the shared tick/tide (k.pulse);
 *  - each shot's light (warpOp) revoices it, gliding: frontal as is, the floor an octave lower, the shafts more
 *    breath, dark-field only the highest partials;
 *  - who: "they" are far (darker, quieter), "I" close (fuller, narrower), "we" surrounded (wide, turning).
 */
import type { VoiceKit } from '../clips.ts';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const MOTIONS = ['rising', 'falling', 'spreading', 'contracting', 'circling', 'trembling', 'still', 'breaking', 'drifting'];

export function light(k: VoiceKit): number[] {
  const { A, plan } = k;
  const tape = A.tape;
  const tv = (i: number) => tape[((i % tape.length) + tape.length) % tape.length];
  const n = Math.max(2, Math.min(30, tape.length - 1)); // the points (light.wgsl npts())
  const P = k.beat;
  const rp = A.c.rhythm.p, m = A.c.material.p, tx = A.c.texture.p, who = A.c.who.p;
  const md = A.mood;
  const lazy = A.lazy;
  const span = Math.max(0.1, plan.blackAt - plan.shots[0].start);
  // the motion as the image weighs it: the main gesture, the second turning in during the second half
  const order = MOTIONS.map((x) => [x, A.c.motion.p[x] ?? 0] as const).sort((a, b) => b[1] - a[1]);
  const mw = (name: string, u: number) => (order[0][0] === name ? 1 : 0) + (order[1][0] === name ? order[1][1] * 1.6 * ss(0.35, 0.8, u) : 0);
  const opening = lerp(2.6, 4.0, lazy);

  // the chord, by mood
  const pos = md.pos > md.neg && md.pos > md.neu;
  const neu = !pos && md.neu > md.neg;
  const base = k.f0 * (pos || neu ? 0.5 : 0.25);
  const ratios = pos ? [1, 5 / 4, 3 / 2, 2, 5 / 2, 3]
    : neu ? [1, Math.SQRT2, 2, 2 * Math.SQRT2, 4]
    : [1, 1.5 + (tv(3) - 0.5) * 0.08, 2.01, 2.9 + tv(4) * 0.3];
  const f = ratios.map((r) => k.tune(base * r));
  // matter: shimmer (caustics), an inharmonic ring, warmth, darkness
  const shimmer = Math.min(1, m.water + m.glass + m.ice + m.light * 0.6 + tx.crystalline * 0.5 + tx.liquid * 0.4);
  const ring = Math.min(1, m.glass + m.ice + m.metal);
  const ringRatio = m.metal > m.glass + m.ice ? 2.76 : 2.32;
  const warm = Math.min(1, m.fire + m.flesh * 0.5);
  const dark = Math.min(1, m.stone + m.sand + m.wood + m.cloth * 0.7 + m.flesh * 0.5 + (who.they ?? 0) * 0.6);
  const quiet = 1 - 0.65 * m.void;
  const width = lerp(0.35, 0.9, (who.we ?? 0) * 0.6 + 0.4) * (1 - 0.5 * (who.i ?? 0));
  const lightShots = plan.shots.filter((s) => s.clip === 'light');
  const off0 = k.off;

  const chord = k.rendered((L, R, sr) => {
    const len = L.length;
    const B = 32; // control rate: every 32 samples
    const ph = new Float64Array(f.length + 5);
    // each partial's own slow swell (never to silence) and its place in the stereo field
    const T = f.map((_, i) => lerp(7, 13, tv(i + 30)) * lerp(1, 1.8, lazy));
    const phi = f.map((_, i) => tv(i + 40) * 6.28);
    let lpL = 0, lpR = 0;
    let voicing = [1, 0, 0, 0]; // the shot's light, gliding
    for (let s0 = 0; s0 < len; s0 += B) {
      const t = s0 / sr; // since the voice began
      const vt = off0 + t; // the verdict clock
      const u = Math.min(1, vt / span);
      const o = ss(0.15, opening, vt);
      const tl = vt * lerp(1, 0.4, lazy);
      // the shot now: its light revoices the chord (a glide, never a jump)
      const sh = [...lightShots].reverse().find((x) => x.start - plan.shots[0].start <= vt) ?? lightShots[0];
      const target = [0, 0, 0, 0];
      target[(sh?.ops.warp ?? 0) % 4] = 1;
      voicing = voicing.map((v, i) => v + (target[i] - v) * Math.min(1, B / (sr * 1.5)));
      // gain: swelling/dwindling, falling dims, the tide (as the image), the matter
      const tide = 1 + 0.3 * rp.pulsing * (0.5 - 0.5 * Math.cos((vt * Math.PI) / P)) - 0.15 * rp.pulsing;
      const gain = Math.max(0.15, 1 + 0.5 * rp.swelling * (2 * u - 1) - 0.7 * rp.dwindling * u) * (1 - 0.4 * u * mw('falling', u)) * tide * quiet;
      // pitch: rising glides up, falling down (semitones), trembling a slow vibrato; breaking pulls the partials apart
      const glide = Math.pow(2, ((2 * mw('rising', u) - 3 * mw('falling', u)) * ss(0, 1, u) * o) / 12);
      const vib = 1 + 0.003 * mw('trembling', u) * Math.sin(tl * 2 * Math.PI * 4.5);
      const brk = 0.03 * mw('breaking', u) * ss(0.1, 1, u);
      // how many partials sound: spreading opens more, contracting narrows to one pure tone; the opening blooms
      const narrow = ss(0.05, 0.85, u) * mw('contracting', u);
      const open = 0.85 + 0.15 * mw('spreading', u) * ss(0, 1, u);
      // the brightness: darker matter, falling, "they", the floor's lower voicing
      const cut = lerp(9000, 1400, Math.min(1, dark * 0.7 + mw('falling', u) * u * 0.5)) * (1 - 0.3 * voicing[1]);
      const a = 1 - Math.exp((-2 * Math.PI * cut) / sr);
      const circ = mw('circling', u) + (who.we ?? 0) * 0.5;
      const drift = mw('drifting', u);
      const amps = f.map((_, i) => {
        if (i === 0) return ss(0.0, 0.6, vt); // the pure tone opens with the light
        const bloom = ss(0.15 + i * 0.12, opening, vt);
        const upper = i / (f.length - 1);
        const keep = lerp(1, 0.12, narrow) * (upper > open ? 0.4 : 1);
        const df = voicing[3] > 0 ? lerp(1, upper, voicing[3]) : 1; // dark-field: only the highest
        return bloom * keep * df * (0.55 + 0.45 * Math.sin((tl * 2 * Math.PI) / T[i] + phi[i])) / (1 + i * 0.35);
      });
      const pans = f.map((_, i) => Math.max(-1, Math.min(1, ((i % 2 ? 1 : -1) * 0.4 * (i / f.length)
        + circ * 0.8 * Math.sin(tl * 0.6 + i * 1.7) + drift * 0.6 * Math.sin(tl * 0.12 + i)) * width)));
      // shimmer: four high partials wandering like caustics (smooth, slow — never a tremolo)
      const sh4 = [6, 8, 9.03, 12.1].map((r, j) => ({ r, a: shimmer * o * 0.07 * Math.max(0, Math.sin(tl * (0.31 + j * 0.23) + j * 2.1) * Math.sin(tl * (0.17 + j * 0.11) + j)) }));
      const end = Math.min(len, s0 + B);
      for (let s = s0; s < end; s++) {
        let l = 0, r = 0;
        for (let i = 0; i < f.length; i++) {
          const fi = f[i] * glide * vib * (1 + brk * (i % 2 ? 1 : -1) * (i / f.length));
          ph[i] += (2 * Math.PI * fi) / sr;
          let x = Math.sin(ph[i]) * amps[i];
          if (i === 0) x += (warm * 0.4 + voicing[1] * 0.5) * Math.sin(ph[i] * 0.5) + ring * 0.25 * o * Math.sin(ph[i] * ringRatio) * (0.6 + 0.4 * Math.sin(tl * 0.9));
          l += x * (1 - pans[i]);
          r += x * (1 + pans[i]);
        }
        for (let j = 0; j < 4; j++) {
          ph[f.length + j] += (2 * Math.PI * f[0] * glide * sh4[j].r) / sr;
          const x = Math.sin(ph[f.length + j]) * sh4[j].a;
          l += x * (1 - (j % 2 ? 0.5 : -0.5) * width);
          r += x * (1 + (j % 2 ? 0.5 : -0.5) * width);
        }
        // warmth: fire's chord gently saturates
        if (warm > 0.1) { l = Math.tanh(l * (1 + warm)) / (1 + warm * 0.5); r = Math.tanh(r * (1 + warm)) / (1 + warm * 0.5); }
        lpL += (l - lpL) * a; lpR += (r - lpR) * a;
        const fadeIn = Math.min(1, s / (sr * 0.02));
        L[s] += lpL * gain * 0.07 * fadeIn;
        R[s] += lpR * gain * 0.07 * fadeIn;
      }
    }
    // the dots of the reading, as it hands over: a few faint high points, before the light opens
    for (let j = 0; j < Math.min(n, 8); j++) {
      const s0 = Math.floor((0.05 + j * 0.07 + tv(j) * 0.05 - off0) * sr);
      if (s0 < 0) continue;
      const fr = 5000 + tv(j + 1) * 4000, pan = (tv(j) - 0.5) * 1.4;
      for (let i = 0; i < sr * 0.03 && s0 + i < len; i++) {
        const x = Math.sin((2 * Math.PI * fr * i) / sr) * Math.sin((Math.PI * i) / (sr * 0.03)) * 0.012;
        L[s0 + i] += x * (1 - pan); R[s0 + i] += x * (1 + pan);
      }
    }
    // the beats: a soft chime at the point's pitch, where the point is (light.wgsl setup(): point b mod n flares)
    for (let b = Math.ceil(off0 / P); b * P < off0 + k.dur; b++) {
      if (rp.stuttering > 0.35 && k.skipped(b)) continue;
      const vt = b * P;
      const o = ss(0.15, opening, vt);
      if (o < 0.05) continue;
      const u = Math.min(1, vt / span);
      const pt = b % n;
      const fr = k.tune(k.f0 * Math.pow(2, tv(pt) * 2));
      const pan = (tv(pt) - 0.5) * 1.4 * width;
      const amp = 0.035 * o * (0.35 + rp.steady * 0.4 + rp.stuttering * 0.4 + rp.pulsing * 0.3) * Math.max(0.15, 1 + 0.5 * rp.swelling * (2 * u - 1) - 0.7 * rp.dwindling * u) * quiet;
      const s0 = Math.floor((vt - off0) * sr);
      const r2 = ring > 0.3 ? ringRatio : 2;
      for (let i = 0; i < sr * 2.2 && s0 + i < len; i++) {
        const tt = i / sr;
        const x = (Math.sin(2 * Math.PI * fr * tt) + 0.3 * Math.sin(2 * Math.PI * fr * r2 * tt) * Math.exp(-tt / 0.5)) * (1 - Math.exp(-tt / 0.04)) * Math.exp(-tt / lerp(0.7, 1.4, 1 - dark)) * amp;
        L[s0 + i] += x * (1 - pan); R[s0 + i] += x * (1 + pan);
      }
    }
  });
  chord.connect(k.out);
  // smoke (and the shafts): breath — noise through a narrow band at the chord's root, slowly wandering
  const breath = Math.min(1, m.smoke + (lightShots.some((s) => s.ops.warp % 4 === 2) ? 0.25 : 0));
  if (breath > 0.1) {
    const c = k.a.ctx;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 6;
    bp.frequency.setValueAtTime(f[0] * 4, k.start);
    bp.frequency.linearRampToValueAtTime(f[0] * 6, k.end);
    const g = c.createGain();
    g.gain.setValueAtTime(0, k.start);
    g.gain.linearRampToValueAtTime(0.08 * breath, k.start + opening);
    k.noise().connect(bp).connect(g).connect(k.out);
  }
  k.pulse().connect(k.out);
  if (k.strike) k.blow();
  // the negative's floor: two low sines breathing (never cancelling)
  if (!pos && !neu) {
    const g = k.a.ctx.createGain();
    g.gain.setValueAtTime(0, k.start);
    g.gain.linearRampToValueAtTime(0.06, k.start + 1.2);
    g.connect(k.out);
    k.sines([38 + A.s.weight * 10, 38.6 + A.s.weight * 10], g);
  }
  return [f[0], f[2] ?? f[1]];
}
