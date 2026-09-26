/**
 * The music of the sequence (after the film: Ikeda, data.matrix / illusor). The picture's cuts are its beats: every
 * flash of a cycle's attack is a burst of broadband noise over a sub — the flicker gates the sound, as in the film —
 * and every flash lands with a click. Common elements run through the whole verdict: two thin high tones, and a soft
 * line under the holds. Each hold has its own sound: its material's voice (clips.ts playShot), or, for a data hold,
 * its data's clicks (score.ts renderAppraisal). A break is near silence: the high tones alone.
 */
import type { Appraisal } from '../jev/appraisal.ts';
import type { Cycle, Plan } from '../show/director.ts';
import { D2, dbToGain, type AudioEngine } from './audio.ts';
import type { Drone } from './drone.ts';
import { playShot } from './clips.ts';
import { loud } from './score.ts';
import { mulberry32 } from '../core/rng.ts';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function playMusic(a: AudioEngine, drone: Drone, A: Appraisal, plan: Plan, t0: number): number[] {
  const c = a.ctx;
  const sr = c.sampleRate;
  // (a hand-made plan without cycles — the harness — plays each shot as a hold)
  const cycles: Cycle[] = plan.cycles.length ? plan.cycles
    : plan.shots.map((s) => ({ start: s.start, dur: s.dur, section: 'A', scene: 'matter', flashes: [], hold: { start: s.start, dur: s.dur, clip: s.clip } }));
  if (!cycles.length) return [];
  const residue: number[] = [];

  // each hold: its material's voice (the first carries the strike)
  let strikeGiven = false;
  for (const cy of cycles) {
    if (!cy.hold.clip || cy.hold.dur <= 0) continue;
    const shot = plan.shots.find((s) => Math.abs(s.start - cy.hold.start) < 1e-6 && s.clip === cy.hold.clip)
      ?? { clip: cy.hold.clip, start: cy.hold.start, dur: cy.hold.dur, seed: 1, aborted: false, angles: [], ops: { echo: 0, warp: 0, flow: 0 } };
    residue.push(...playShot(a, drone, A, plan, shot, t0, !strikeGiven));
    strikeGiven = true;
  }

  // the flicker, heard: a burst of noise over a sub for every flash, a click at every cut — one buffer, sample-exact
  const v0 = cycles[0].start, span = plan.blackAt - v0 + 0.5;
  const buf = c.createBuffer(2, Math.ceil(span * sr), sr);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const rand = mulberry32((A.seed ^ 0x1c0de) >>> 0);
  const fSub = 44 + A.s.weight * 12;
  // the noise's colour from the word's sound: a round word darker, a spiky one brighter
  const bright = lerp(0.35, 0.9, A.s.phonetics);
  const amp = dbToGain(lerp(-14, -6, loud(A)));
  for (const cy of cycles) {
    const strobe = cy.section === 'B';
    for (const f of cy.flashes) {
      const s0 = Math.floor((f.start - v0) * sr), n = Math.floor((f.dur + 0.012) * sr);
      let lp = 0, ph = 0;
      const pan = (rand() - 0.5) * 0.3;
      for (let i = 0; i < n && s0 + i < L.length; i++) {
        const u = i / sr;
        const env = Math.min(1, u / 0.002) * (u < f.dur ? 1 : Math.exp(-(u - f.dur) / 0.004));
        const x = rand() * 2 - 1;
        lp += (x - lp) * bright;
        ph += (2 * Math.PI * fSub) / sr;
        const y = (lp * 0.7 + Math.sin(ph) * (strobe ? 0.5 : 0.9)) * env * amp * (strobe ? 0.8 : 1);
        L[s0 + i] += y * (1 - pan); R[s0 + i] += y * (1 + pan);
      }
      // the cut's click (one sample, both edges)
      if (s0 < L.length) { L[s0] += 0.5 * amp; R[s0] += 0.5 * amp; }
    }
    // the hold lands with a click too
    const h0 = Math.floor((cy.hold.start - v0) * sr);
    if (cy.hold.dur > 0 && h0 < L.length) { L[h0] += 0.4 * amp; R[h0] += 0.4 * amp; }
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(a.perfDry);
  src.start(t0 + v0);

  // common: two thin high tones through the whole verdict (the film's lines at the top of the spectrum), and a soft
  // line under the holds (1 kHz, or D's harmonic near it for a positive word)
  const start = t0 + v0, end = t0 + plan.blackAt;
  const hi = c.createGain();
  hi.gain.value = dbToGain(-44);
  hi.connect(a.perfDry);
  for (const f of [D2 * 128 * 1.5, D2 * 128 * 2]) { const o = c.createOscillator(); o.frequency.value = Math.min(f, 16000); o.connect(hi); o.start(start); o.stop(end + 0.05); }
  const pos = A.mood.pos > A.mood.neg && A.mood.pos > A.mood.neu;
  const line = c.createOscillator();
  line.frequency.value = (pos ? D2 * 14 : 1000) * Math.pow(2, Math.round((A.s.pitch - 0.5) * 4) / 12);
  const lg = c.createGain();
  lg.gain.value = 0;
  line.connect(lg).connect(a.perfDry);
  line.start(start);
  line.stop(end + 0.05);
  const level = dbToGain(-34);
  for (const cy of cycles) {
    if (cy.hold.dur <= 0) continue;
    const h0 = t0 + cy.hold.start, h1 = h0 + cy.hold.dur;
    lg.gain.setValueAtTime(0, h0);
    lg.gain.linearRampToValueAtTime(level, h0 + 0.01);
    lg.gain.setValueAtTime(level, h1 - 0.01);
    lg.gain.linearRampToValueAtTime(0, h1);
  }
  return residue;
}
