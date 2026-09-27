/**
 * The drone: the plate at rest. D2's harmonics and a few inharmonic plate
 * modes as very slowly beating sine pairs over a whisper of band-limited
 * noise. Nothing periodic faster than ~0.25 Hz. It remembers: each reaction
 * leaves a residue (octaves and fifths only, τ ≈ 35 s), a colour (roughness =
 * more plate modes, brightness; τ ≈ 25 s) and a slow evening drift (τ ≈ 20 min).
 * It ducks at the cut to black and exhales (opens) under the drift.
 */
import { D2, dbToGain, type AudioEngine } from './audio.ts';

const RATIOS = [1, 2, 3, 4, 5, 6, 8, 2.76, 5.4, 8.93];
const GAINS = [0.14, 0.2, 0.15, 0.11, 0.06, 0.05, 0.025, 0.05, 0.03, 0.015]; // the fundamental is implied by its harmonics
const PLATE_MODES = [7, 8, 9]; // indices of the inharmonic modes: roughness raises them
const MAX_BEAT = 0.25; // Hz

export type DroneMemory = { rough: number; bright: number; residue: number[] };

export class Drone {
  private a: AudioEngine;
  private out: GainNode;
  private duckGain: GainNode;
  private filter: BiquadFilterNode;   // memory colour
  private leanFilter: BiquadFilterNode; // typing lean (its own, so it never erases memory)
  private partials: GainNode[] = [];
  private level = 0.022;
  private evening = { rough: 0, bright: 0 };
  private leaning = 0;
  /** What the room sees of the drone (its own waveform: the image is the sound). */
  private scope: AnalyserNode;
  private scopeBuf = new Float32Array(2048);

  constructor(a: AudioEngine) {
    this.a = a;
    const c = a.ctx;
    this.out = c.createGain();
    this.out.gain.value = 0;
    this.duckGain = c.createGain();
    this.filter = c.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 900;
    this.filter.Q.value = 0.5;
    this.leanFilter = c.createBiquadFilter();
    this.leanFilter.type = 'lowpass';
    this.leanFilter.frequency.value = 6000;
    this.leanFilter.Q.value = 0.5;
    const shelf = c.createBiquadFilter();
    shelf.type = 'lowshelf'; shelf.frequency.value = 150; shelf.gain.value = -4;
    this.filter.connect(this.leanFilter).connect(shelf).connect(this.duckGain).connect(this.out);
    this.out.connect(a.bus);
    this.scope = c.createAnalyser();
    this.scope.fftSize = 2048;
    this.out.connect(this.scope);
    const s = c.createGain();
    s.gain.value = 0.5;
    this.out.connect(s).connect(a.send);

    RATIOS.forEach((r, i) => {
      const g = c.createGain();
      g.gain.value = GAINS[i];
      g.connect(this.filter);
      // a detuned pair per partial: beating over tens of seconds
      const beat = 0.02 + 0.09 * ((i * 0.618) % 1);
      [0, 1].forEach((k) => {
        const o = c.createOscillator();
        o.frequency.value = D2 * r + (k ? beat : 0);
        o.connect(g);
        o.start();
      });
      // very slow gain walk per partial
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.004 + 0.007 * ((i * 0.37) % 1);
      const depth = c.createGain();
      depth.gain.value = GAINS[i] * 0.45;
      lfo.connect(depth).connect(g.gain);
      lfo.start();
      this.partials.push(g);
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

  /** The drone's waveform now, into `out`: 1024 samples (≈ 1.5 periods of D2) from a rising zero crossing, so it holds
   *  still, resampled to out.length; −1..1 at full level, fading with the drone. */
  wave(out: Float32Array) {
    const b = this.scopeBuf;
    this.scope.getFloatTimeDomainData(b);
    let i0 = 0;
    for (let i = 1; i < 1024; i++) if (b[i - 1] < 0 && b[i] >= 0) { i0 = i; break; }
    let peak = 1e-9;
    for (let i = i0; i < i0 + 1024; i++) peak = Math.max(peak, Math.abs(b[i]));
    const level = Math.min(1, peak / (this.level * 0.5));
    for (let k = 0; k < out.length; k++) out[k] = (b[i0 + Math.floor((k / out.length) * 1024)] / peak) * level;
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
    const f = this.leanFilter.frequency;
    f.cancelScheduledValues(this.a.now);
    f.setTargetAtTime(charge > 0.05 ? 1200 * (1 + charge * 2) : 6000, this.a.now, 0.3);
  }

  /** The black lands: the room holds its breath (−12 dB in 30 ms), then returns. */
  duck(at: number) {
    const g = this.duckGain.gain;
    g.cancelScheduledValues(at - 0.05);
    g.setValueAtTime(1, at - 0.03);
    g.linearRampToValueAtTime(dbToGain(-12), at);
    g.setTargetAtTime(1, at + 1.2, 0.8);
  }

  /** The room remembers a reaction. */
  remember(m: DroneMemory, at: number) {
    const c = this.a.ctx;
    this.evening.rough = this.evening.rough * 0.92 + m.rough * 0.08;
    this.evening.bright = this.evening.bright * 0.92 + (m.bright - 0.5) * 0.08;
    const cut = 900 * Math.pow(2, (m.bright - 0.5) * 1.6);
    const f = this.filter.frequency;
    f.cancelScheduledValues(at);
    f.setTargetAtTime(cut, at, 1.5);
    f.setTargetAtTime(900 * (1 + this.evening.bright), at + 4, 25);
    // roughness is the plate's inharmonic modes coming up, not faster beating
    for (const i of PLATE_MODES) {
      const g = this.partials[i].gain;
      g.cancelScheduledValues(at);
      g.setTargetAtTime(GAINS[i] * (1 + 4 * m.rough), at, 1.2);
      g.setTargetAtTime(GAINS[i] * (1 + 1.5 * this.evening.rough), at + 4, 25);
    }
    // residue: the reaction's pitches, folded to octaves and fifths of D, keep ringing faintly
    for (const hz of m.residue) {
      const o = c.createOscillator();
      o.frequency.value = foldToD(hz);
      const beat = c.createOscillator();
      beat.frequency.value = foldToD(hz) + Math.min(MAX_BEAT, 0.08);
      const g = c.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.03, at + 3);
      g.gain.setTargetAtTime(0, at + 3, 35);
      o.connect(g);
      beat.connect(g);
      g.connect(this.filter);
      o.start(at); beat.start(at);
      o.stop(at + 180); beat.stop(at + 180);
    }
  }
}

/** The nearest octave or fifth of D to hz (never a third: the room must not drift into a major chord). */
function foldToD(hz: number): number {
  const candidates: number[] = [];
  for (let oct = 0; oct < 7; oct++) candidates.push(D2 * 2 ** oct, D2 * 1.5 * 2 ** oct);
  return candidates.reduce((a, b) => (Math.abs(Math.log2(b / hz)) < Math.abs(Math.log2(a / hz)) ? b : a));
}
