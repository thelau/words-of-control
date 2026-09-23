/**
 * Web Audio master chain: bus → compressor → limiter → out, plus a shared
 * reverb send. Everything tonal is centred on D.
 */
export const D2 = 73.416;

export class AudioEngine {
  readonly ctx: AudioContext;
  readonly bus: GainNode;       // dry input
  readonly send: GainNode;      // reverb input
  readonly reverb: ConvolverNode;
  readonly out: GainNode;
  readonly record: MediaStreamAudioDestinationNode;
  readonly noise: AudioBuffer;  // 2 s of white noise, shared

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    const c = this.ctx;
    this.bus = c.createGain();
    this.send = c.createGain();
    this.out = c.createGain();
    this.out.gain.value = 0.9;

    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25; comp.knee.value = 8;
    const limit = c.createDynamicsCompressor();
    limit.threshold.value = -2; limit.ratio.value = 20; limit.attack.value = 0.001; limit.release.value = 0.05; limit.knee.value = 0;

    this.reverb = c.createConvolver();
    this.reverb.buffer = this.impulse(3.8, 2.6);
    const wet = c.createGain();
    wet.gain.value = 0.5;

    this.bus.connect(this.out);
    this.send.connect(this.reverb).connect(wet).connect(this.out);
    this.out.connect(comp).connect(limit).connect(c.destination);
    this.record = c.createMediaStreamDestination();
    limit.connect(this.record);

    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  resume() {
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  get now() {
    return this.ctx.currentTime;
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // darker as it decays
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < 400 ? i / 400 : 1);
      }
      // gentle lowpass by running average
      let acc = 0;
      for (let i = 0; i < len; i++) { acc = acc * 0.6 + d[i] * 0.4; d[i] = acc; }
    }
    return b;
  }
}
