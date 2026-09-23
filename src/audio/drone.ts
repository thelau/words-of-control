/**
 * The drone: the plate at rest. D2's harmonics and a few inharmonic plate
 * modes as slowly beating sine pairs over a whisper of band-limited noise.
 * No periodic movement shorter than ~90 s. It remembers: each reaction leaves
 * a residue (lifted partials, τ ≈ 35 s), a colour (roughness/brightness,
 * τ ≈ 25 s) and a slow evening drift (τ ≈ 20 min) — the room keeps the day.
 */
import { D2, type AudioEngine } from './audio.ts';

const RATIOS = [1, 2, 3, 4, 5, 6, 8, 2.76, 5.4, 8.93];
const GAINS = [0.28, 0.2, 0.13, 0.1, 0.05, 0.05, 0.025, 0.05, 0.03, 0.015];

export type DroneMemory = { rough: number; bright: number; residue: number[] };

export class Drone {
  private out: GainNode;
  private filter: BiquadFilterNode;
  private partials: { gain: GainNode; osc: OscillatorNode[] }[] = [];
  private level = 0.022;
  private evening = { rough: 0, bright: 0 };
  private leaning = 0;

  constructor(private a: AudioEngine) {
    const c = a.ctx;
    this.out = c.createGain();
    this.out.gain.value = 0;
    this.filter = c.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 900;
    this.filter.Q.value = 0.5;
    this.filter.connect(this.out);
    this.out.connect(a.bus);
    const s = c.createGain();
    s.gain.value = 0.5;
    this.out.connect(s).connect(a.send);

    RATIOS.forEach((r, i) => {
      const g = c.createGain();
      g.gain.value = GAINS[i];
      g.connect(this.filter);
      // a detuned pair per partial: beating over tens of seconds
      const beat = 0.02 + 0.09 * ((i * 0.618) % 1);
      const osc = [0, 1].map((k) => {
        const o = c.createOscillator();
        o.frequency.value = D2 * r + (k ? beat : 0);
        o.connect(g);
        o.start();
        return o;
      });
      // very slow gain walk per partial
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.004 + 0.007 * ((i * 0.37) % 1);
      const depth = c.createGain();
      depth.gain.value = GAINS[i] * 0.45;
      lfo.connect(depth).connect(g.gain);
      lfo.start();
      this.partials.push({ gain: g, osc });
    });

    const n = c.createBufferSource();
    n.buffer = a.noise;
    n.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 0.6;
    const ng = c.createGain();
    ng.gain.value = 0.06;
    n.connect(bp).connect(ng).connect(this.filter);
    n.start();
  }

  fadeIn(seconds = 5) {
    const g = this.out.gain;
    g.cancelScheduledValues(this.a.now);
    g.setTargetAtTime(this.level, this.a.now, seconds / 3);
  }

  fadeOut(seconds = 2) {
    const g = this.out.gain;
    g.cancelScheduledValues(this.a.now);
    g.setTargetAtTime(0, this.a.now, seconds / 4);
  }

  /** Typing: the drone leans in, a little brighter as the word gathers. */
  lean(charge: number) {
    // only when it actually changes: automation events accumulate otherwise
    if (Math.abs(charge - this.leaning) < 0.02) return;
    this.leaning = charge;
    const f = this.filter.frequency;
    f.cancelScheduledValues(this.a.now);
    f.setTargetAtTime(900 * (1 + charge * 0.6) * (1 + this.evening.bright), this.a.now, 0.3);
  }

  /** The room remembers a reaction. */
  remember(m: DroneMemory, at: number) {
    const c = this.a.ctx;
    this.evening.rough = this.evening.rough * 0.92 + m.rough * 0.08;
    this.evening.bright = this.evening.bright * 0.92 + (m.bright - 0.5) * 0.08;
    const cut = 900 * Math.pow(2, (m.bright - 0.5) * 1.6);
    this.filter.frequency.cancelScheduledValues(at);
    this.filter.frequency.setTargetAtTime(cut, at, 1.5);
    this.filter.frequency.setTargetAtTime(900 * (1 + this.evening.bright), at + 4, 25);
    // roughness: pairs pull apart, then relax toward the evening's roughness
    this.partials.forEach((p, i) => {
      const f = p.osc[1].frequency;
      const base = D2 * RATIOS[i];
      const beat = 0.02 + 0.09 * ((i * 0.618) % 1);
      f.cancelScheduledValues(at);
      f.setTargetAtTime(base + beat * (1 + m.rough * 25), at, 1.2);
      f.setTargetAtTime(base + beat * (1 + this.evening.rough * 8), at + 4, 25);
    });
    // residue: the reaction's last pitches keep ringing faintly in the plate
    for (const hz of m.residue) {
      const o = c.createOscillator();
      o.frequency.value = hz;
      const g = c.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.035, at + 3);
      g.gain.setTargetAtTime(0, at + 3, 35);
      o.connect(g).connect(this.filter);
      o.start(at);
      o.stop(at + 180);
    }
  }
}
