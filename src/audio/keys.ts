/**
 * Key clicks: unpitched, dry, wooden (§9.2). Limit beep: a short high sine (§9.3).
 * Typing is never melodic — pitch belongs to the reaction.
 */
import type { AudioEngine } from './audio';

export class Keys {
  constructor(private a: AudioEngine) {}

  click(soft = false) {
    const c = this.a.ctx;
    const t = this.a.now;
    const lvl = (soft ? 0.55 : 1) * (0.85 + Math.random() * 0.3);
    const offset = Math.random() * 1.8;

    // tick: bandpassed noise, very short
    const src = c.createBufferSource();
    src.buffer = this.a.noise;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = (soft ? 1500 : 2100) * (0.8 + Math.random() * 0.5);
    bp.Q.value = 1.4;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22 * lvl, t + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.035);
    src.connect(bp).connect(g).connect(this.a.bus);

    // body: low wooden thock
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 280 + Math.random() * 120;
    lp.Q.value = 3;
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(0.3 * lvl, t + 0.002);
    g2.gain.exponentialRampToValueAtTime(0.0005, t + 0.05);
    src.connect(lp).connect(g2).connect(this.a.bus);

    src.start(t, offset, 0.08);
  }

  limit() {
    const c = this.a.ctx;
    const t = this.a.now;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = 1800;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.004);
    g.gain.setValueAtTime(0.06, t + 0.05);
    g.gain.linearRampToValueAtTime(0, t + 0.06);
    o.connect(g).connect(this.a.bus);
    o.start(t);
    o.stop(t + 0.08);
  }
}
