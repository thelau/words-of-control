/**
 * Drone pad, always on (§9.1). Detuned saws on D2, A2 fifth, sub, filtered
 * noise. It remembers: each reaction nudges its character, relaxing over ~25 s.
 */
import { D2, type AudioEngine } from './audio';

export type DroneColour = { rough: number; width: number; bright: number }; // each 0..1, 0.5 = neutral

export class Drone {
  private out: GainNode;
  private filter: BiquadFilterNode;
  private saws: OscillatorNode[] = [];
  private noiseGain: GainNode;
  private level = 0.055;

  constructor(private a: AudioEngine) {
    const c = a.ctx;
    this.out = c.createGain();
    this.out.gain.value = 0;
    this.filter = c.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 320;
    this.filter.Q.value = 0.8;
    this.filter.connect(this.out);
    this.out.connect(a.bus);
    const sendG = c.createGain();
    sendG.gain.value = 0.6;
    this.out.connect(sendG).connect(a.send);

    const voice = (type: OscillatorType, f: number, detune: number, g: number) => {
      const o = c.createOscillator();
      o.type = type; o.frequency.value = f; o.detune.value = detune;
      const gn = c.createGain(); gn.gain.value = g;
      o.connect(gn).connect(this.filter);
      o.start();
      return o;
    };
    this.saws.push(voice('sawtooth', D2, -6, 0.32), voice('sawtooth', D2, 7, 0.32));
    voice('triangle', D2 * 1.5, -3, 0.28); // A2
    voice('sine', D2 / 2, 0, 0.45);        // D1 sub
    voice('sine', D2 * 2, 4, 0.08);        // D3 air

    // slow LFOs on filter and detune
    const lfo = (freq: number, depth: number, target: AudioParam) => {
      const o = c.createOscillator(); o.frequency.value = freq;
      const g = c.createGain(); g.gain.value = depth;
      o.connect(g).connect(target); o.start();
    };
    lfo(0.043, 90, this.filter.frequency);
    lfo(0.071, 4, this.saws[0].detune);
    lfo(0.057, 5, this.saws[1].detune);

    const n = c.createBufferSource();
    n.buffer = a.noise; n.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.7;
    this.noiseGain = c.createGain(); this.noiseGain.gain.value = 0.03;
    n.connect(bp).connect(this.noiseGain).connect(this.out);
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

  /** The room remembers: push toward a colour, then relax to neutral over ~25 s. */
  remember(col: DroneColour) {
    const t = this.a.now;
    const spread = 6 + (col.rough - 0.5) * 30 + (col.width - 0.5) * 12;
    const cutoff = 320 * Math.pow(2, (col.bright - 0.5) * 2);
    const noise = 0.03 * (1 + (col.rough - 0.5) * 2.5);
    const set = (p: AudioParam, v: number, rest: number) => {
      p.cancelScheduledValues(t);
      p.setTargetAtTime(v, t, 0.6);
      p.setTargetAtTime(rest, t + 3, 8);
    };
    set(this.saws[0].detune, -spread, -6);
    set(this.saws[1].detune, spread, 7);
    set(this.filter.frequency, cutoff, 320);
    set(this.noiseGain.gain, noise, 0.03);
  }
}
