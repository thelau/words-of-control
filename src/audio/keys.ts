/**
 * Keys: a fingertip on the instrument's housing. A sub-millisecond impulse
 * rings three heavily damped inharmonic modes plus a tiny tick; the same key
 * always sounds the same (hashed from the key code), so a word has a rhythm
 * signature but never a melody. Limit beep: a short, foreign 1.8 kHz sine.
 */
import type { AudioEngine } from './audio.ts';

const MODES = [190, 470, 1380];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

export class Keys {
  private impulse: AudioBuffer;

  constructor(private a: AudioEngine) {
    const c = a.ctx;
    this.impulse = c.createBuffer(1, Math.floor(c.sampleRate * 0.002), c.sampleRate);
    const d = this.impulse.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * 0.25));
  }

  click(code: string, soft = false) {
    const c = this.a.ctx;
    const t = this.a.now;
    const h = hash(code);
    const src = c.createBufferSource();
    src.buffer = this.impulse;
    const out = c.createGain();
    out.gain.value = (soft ? 0.56 : 1) * (0.9 + h * 0.2) * 0.9;
    out.connect(this.a.bus);
    MODES.forEach((f, i) => {
      if (soft && i === 2) return;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f * (0.94 + 0.12 * ((h * (i + 3.7)) % 1));
      bp.Q.value = 9 + i * 4;
      const g = c.createGain();
      g.gain.value = [0.9, 0.55, 0.35][i];
      src.connect(bp).connect(g).connect(out);
    });
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5500;
    const tick = c.createGain();
    tick.gain.value = soft ? 0.05 : 0.12;
    src.connect(hp).connect(tick).connect(out);
    src.start(t);
  }

  limit() {
    const c = this.a.ctx;
    const t = this.a.now;
    const o = c.createOscillator();
    o.frequency.value = 1800;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.03, t + 0.002);
    g.gain.setValueAtTime(0.03, t + 0.05);
    g.gain.linearRampToValueAtTime(0, t + 0.052);
    o.connect(g).connect(this.a.bus);
    o.start(t);
    o.stop(t + 0.06);
  }
}
