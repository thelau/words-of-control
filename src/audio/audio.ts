/**
 * Web Audio engine. Master: bus → 45 Hz high-pass (24 dB/oct) → limiter →
 * trim → hard ceiling (−1 dBFS) → out. Two spaces: a short room keeps the verdict's cuts hard; the long
 * hall is fed only in the last moment before the cut to black, so the tail
 * blooms once, over the black. Performances play through `perfDry` /
 * `perfSend`; at the cut the dry path dies in 5 ms and only the hall rings.
 * Everything tonal is centred on D (just intonation, from D's harmonics).
 */
export const D2 = 73.416;

export const dbToGain = (db: number) => Math.pow(10, db / 20);

export class AudioEngine {
  readonly ctx: AudioContext;
  readonly bus: GainNode;
  /** into the short room (verdict) */
  readonly send: GainNode;
  readonly perfDry: GainNode;
  readonly perfSend: GainNode;
  /** into the long hall: opened only at the cut to black */
  readonly hallSend: GainNode;
  readonly record: MediaStreamAudioDestinationNode;
  readonly noise: AudioBuffer;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    const c = this.ctx;
    this.bus = c.createGain();
    this.send = c.createGain();
    this.perfDry = c.createGain();
    this.perfSend = c.createGain();
    this.hallSend = c.createGain();
    this.hallSend.gain.value = 0;
    const out = c.createGain();

    // two cascaded biquads = 24 dB/oct at 45 Hz: nothing below is intended
    const hp1 = c.createBiquadFilter();
    hp1.type = 'highpass'; hp1.frequency.value = 45; hp1.Q.value = 0.54;
    const hp2 = c.createBiquadFilter();
    hp2.type = 'highpass'; hp2.frequency.value = 45; hp2.Q.value = 1.31;
    const limit = c.createDynamicsCompressor();
    limit.threshold.value = -3; limit.ratio.value = 20; limit.attack.value = 0.0005; limit.release.value = 0.08; limit.knee.value = 0;
    const trim = c.createGain();
    trim.gain.value = 0.9; // true-peak margin after the limiter
    // the Web Audio limiter lets fast transients through: a hard ceiling at −1 dBFS is the last guard
    const ceiling = c.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) { const x = (i / 1023.5 - 1) * 1.2; curve[i] = Math.max(-0.89, Math.min(0.89, x)); }
    ceiling.curve = curve;
    ceiling.oversample = '4x';

    const verb = (seconds: number, wetGain: number, input: AudioNode) => {
      const hp = c.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 200; // the room never booms
      const conv = c.createConvolver();
      conv.buffer = this.impulse(seconds);
      const wet = c.createGain();
      wet.gain.value = wetGain;
      input.connect(hp).connect(conv).connect(wet).connect(out);
    };
    verb(0.9, 0.5, this.send);
    verb(6.5, 0.7, this.hallSend);

    this.perfDry.connect(this.bus);
    this.perfDry.connect(this.hallSend);
    this.perfSend.connect(this.send);
    this.bus.connect(out);
    out.connect(hp1).connect(hp2).connect(limit).connect(trim).connect(ceiling).connect(c.destination);
    this.record = c.createMediaStreamDestination();
    ceiling.connect(this.record);

    this.noise = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  resume() {
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  get now() {
    return this.ctx.currentTime;
  }

  /** Clock shared with the image: audio time, corrected for output latency. */
  clock(): number {
    return this.ctx.currentTime - (this.ctx.outputLatency || 0);
  }

  /** The cut to black at t: the hall opens for the last 250 ms, then the dry dies in 5 ms and only the hall rings. */
  cutAt(t: number, reopenAt: number) {
    const h = this.hallSend.gain;
    h.cancelScheduledValues(t - 0.3);
    h.setValueAtTime(0, t - 0.25);
    h.linearRampToValueAtTime(1, t - 0.02);
    h.setValueAtTime(1, t);
    h.linearRampToValueAtTime(0, t + 0.01);
    for (const g of [this.perfDry.gain, this.perfSend.gain]) {
      g.cancelScheduledValues(t - 0.01);
      g.setValueAtTime(1, t - 0.005);
      g.linearRampToValueAtTime(0, t);
      g.setValueAtTime(1, reopenAt);
    }
  }

  /** Stop everything of the performance now (barred, support, error). */
  silencePerformance() {
    const t = this.now;
    for (const g of [this.perfDry.gain, this.perfSend.gain, this.hallSend.gain]) {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + 0.005);
    }
    this.perfDry.gain.setValueAtTime(1, t + 0.5);
    this.perfSend.gain.setValueAtTime(1, t + 0.5);
  }

  private impulse(seconds: number): AudioBuffer {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const b = c.createBuffer(2, len, c.sampleRate);
    const pre = Math.floor(c.sampleRate * 0.02);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / (len - pre);
        const x = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2);
        const k = 0.6 - 0.3 * t; // darkens as it decays, but stays air, not mud
        lp = lp + k * (x - lp);
        d[i] = lp * (i - pre < 600 ? (i - pre) / 600 : 1);
      }
    }
    return b;
  }
}
