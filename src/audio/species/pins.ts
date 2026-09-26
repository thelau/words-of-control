/** Pins's voice: one continuous voice over all its shots (VoiceKit) — the sound of the pin screen.
 *  A dense rustle of tiny ticks, the pins touching, its density following the wave that runs through the field
 *  (the same speed as pins.wgsl's), ringing through the resonances of the pins' matter (metal rings high and
 *  long, glass and ice glassy, stone and sand dry, wood hollow, water soft); on every beat a cascade of ticks as the
 *  ring of pins is pushed up and runs out (panned where it starts; a stutter skips it); under it a low tone, the
 *  terrain's weight, swelling as it rises and ebbing as it falls; the shared pulse, and the strike's blow. */
import type { VoiceKit } from '../clips.ts';

/** Resonances (× f0) and their Q, per matter: what a tick of the pins rings as. */
const RING: Record<string, { r: number[]; q: number }> = {
  metal: { r: [11, 16.3, 23.7, 31.4], q: 40 },
  glass: { r: [17, 25.2, 37.5], q: 60 },
  ice: { r: [15, 22.4, 33], q: 45 },
  stone: { r: [6.2, 10.9], q: 4 },
  sand: { r: [8, 14], q: 3 },
  wood: { r: [3.1, 5.8], q: 8 },
  water: { r: [4.2, 8.5], q: 6 },
  fire: { r: [9, 19], q: 3 },
};

export function pins(k: VoiceKit): number[] {
  const { A, a } = k;
  const c = a.ctx;
  const rp = A.c.rhythm.p;
  const tv = (i: number) => A.tape[((i % A.tape.length) + A.tape.length) % A.tape.length];
  // the wave through the pins, on the verdict clock (pins.wgsl surface(): its speed, slowed by a lazy word)
  const w = (0.6 + 1.2 * A.s.arousal) * (1 - 0.65 * A.lazy);
  const base = 90 + 380 * (A.s.density * 0.5 + A.s.energy * 0.5);
  const swell = (vu: number) => Math.max(0.4, 1 + 0.2 * rp.swelling * (2 * vu - 1) - 0.35 * rp.dwindling * vu);
  const grains = k.rendered((L, R, sr) => {
    const n = Math.min(L.length, Math.ceil(k.dur * sr));
    const tick = (s0: number, amp: number, pan: number) => {
      const len = Math.floor(sr * 0.0015);
      for (let i = 0; i < len && s0 + i < L.length; i++) {
        const x = (k.rand() * 2 - 1) * amp * Math.exp(-i / (len * 0.25));
        L[s0 + i] += x * (1 - pan); R[s0 + i] += x * (1 + pan);
      }
    };
    // the rustle: ticks at a rate that breathes with the wave
    for (let i = 0; i < n;) {
      const vt = k.off + i / sr;
      const rate = base * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(vt * w))) * swell(i / n);
      i += Math.max(1, Math.floor((-Math.log(1 - k.rand() * 0.999) / rate) * sr));
      tick(i, 0.15 * Math.pow(k.rand(), 2), (k.rand() - 0.5) * 1.4);
    }
    // the beats: a cascade as the ring of pins runs out from its point
    for (let b = Math.ceil(k.off / k.beat); b * k.beat < k.off + k.dur; b++) {
      if (rp.stuttering > 0.35 && k.skipped(b)) continue;
      const s0 = Math.floor((b * k.beat - k.off) * sr);
      const pan = (tv(b * 2 + 11) - 0.5) * 1.2;
      const amp = 0.25 * swell((b * k.beat - k.off) / Math.max(0.1, k.dur));
      for (let u = 0; u < 0.9;) {
        const rate = 2200 * Math.exp(-u / 0.25) + 40;
        u += -Math.log(1 - k.rand() * 0.999) / rate;
        tick(s0 + Math.floor(u * sr), amp * Math.exp(-u / 0.3) * (0.3 + 0.7 * k.rand()), pan * (0.4 + 0.6 * u) + (k.rand() - 0.5) * 0.3 * u);
      }
    }
  });
  // what the ticks ring as: the first matter, a share of the second (the dry click always heard, highpassed)
  const mats = Object.entries(A.c.material.p).sort((x, y) => y[1] - x[1]);
  const ring = c.createGain();
  ring.gain.value = 1;
  ring.connect(k.out);
  const share = mats[1][1] / Math.max(1e-6, mats[0][1] + mats[1][1]);
  [[mats[0][0], 1 - share], [mats[1][0], share]].forEach(([m, g]) => {
    const rg = RING[m as string] ?? RING.stone;
    k.modes(grains, rg.r.map((r) => k.tune(k.f0 * r)), rg.q, rg.r.map((_, i) => (g as number) * 0.5 * Math.sqrt(rg.q) / (1 + i * 0.5)), ring);
  });
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1800;
  const dry = c.createGain();
  dry.gain.value = 1.0 * (1 - 0.6 * (A.c.material.p.water ?? 0)); // water: softer
  grains.connect(hp).connect(dry).connect(k.out);
  // the terrain's weight: a low tone, bowed by slow noise, swelling as it rises, ebbing as it falls
  const mo = A.c.motion.p;
  const hum = c.createGain();
  const g0 = 1 + 1.5 * A.s.weight;
  hum.gain.setValueAtTime(0, k.start);
  hum.gain.linearRampToValueAtTime(g0 * (1 - 0.4 * mo.rising), k.start + 1.2);
  hum.gain.linearRampToValueAtTime(g0 * (1 + 0.5 * mo.rising - 0.6 * mo.falling), k.end);
  hum.connect(k.out);
  k.modes(k.noise(), [k.tune(k.f0 / 2), k.tune(k.f0)], 250, [0.6, 0.2], hum);
  k.pulse().connect(k.out);
  if (k.strike) k.blow();
  if (!k.pos) {
    const g = c.createGain();
    g.gain.setValueAtTime(0, k.start);
    g.gain.linearRampToValueAtTime(0.07, k.start + 0.8);
    g.connect(k.out);
    k.sines([36 + A.s.weight * 10, 36.5 + A.s.weight * 10], g);
  }
  return [k.tune(k.f0 / 2)];
}
