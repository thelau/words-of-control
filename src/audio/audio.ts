/**
 * Web Audio engine. Master: bus → 35 Hz high-pass → gentle compressor → limiter → trim → out.
 * A long dark convolution reverb is shared by everything. Performances play
 * through `perfDry` / `perfSend`: at the cut to black the dry path is cut in
 * 5 ms and the send closes, so only the reverb's tail rings on over the black.
 * Everything tonal is centred on D (just intonation, from D's harmonics).
 */
export const D2 = 73.416;

export class AudioEngine {
  readonly ctx: AudioContext;
  readonly bus: GainNode;
  readonly send: GainNode;
  readonly perfDry: GainNode;
  readonly perfSend: GainNode;
  readonly record: MediaStreamAudioDestinationNode;
  readonly noise: AudioBuffer;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    const c = this.ctx;
    this.bus = c.createGain();
    this.send = c.createGain();
    this.perfDry = c.createGain();
    this.perfSend = c.createGain();
    const out = c.createGain();
    out.gain.value = 0.85;

    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 2.5; comp.attack.value = 0.012; comp.release.value = 0.3; comp.knee.value = 10;
    const limit = c.createDynamicsCompressor();
    limit.threshold.value = -8; limit.ratio.value = 20; limit.attack.value = 0.0005; limit.release.value = 0.08; limit.knee.value = 0;
    // below ~35 Hz nothing is intended: it only excites the room and eats headroom
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 35;
    hp.Q.value = 0.7;
    const trim = c.createGain();
    trim.gain.value = 0.82; // true-peak margin after the limiter

    const reverb = c.createConvolver();
    reverb.buffer = this.impulse(6.5);
    const wet = c.createGain();
    wet.gain.value = 0.55;

    this.perfDry.connect(this.bus);
    this.perfSend.connect(this.send);
    this.bus.connect(out);
    this.send.connect(reverb).connect(wet).connect(out);
    out.connect(hp).connect(comp).connect(limit).connect(trim).connect(c.destination);
    this.record = c.createMediaStreamDestination();
    trim.connect(this.record);

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

  /** Cut the performance to black at time t: dry dies in 5 ms, the reverb tail rings on. */
  cutAt(t: number, reopenAt: number) {
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
    for (const g of [this.perfDry.gain, this.perfSend.gain]) {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + 0.005);
      g.setValueAtTime(1, t + 0.5);
    }
  }

  private impulse(seconds: number): AudioBuffer {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const b = c.createBuffer(2, len, c.sampleRate);
    const pre = Math.floor(c.sampleRate * 0.025);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / (len - pre);
        const x = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2);
        // darker as it decays: the lowpass closes over time
        const k = 0.55 - 0.45 * t;
        lp = lp + k * (x - lp);
        d[i] = lp * (i - pre < 600 ? (i - pre) / 600 : 1);
      }
    }
    return b;
  }
}
