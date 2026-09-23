/**
 * The robot voices: a tiny Klatt-style formant speech synth (no AI, no
 * samples) that reads the digits the appraisal shows. Pulse-train glottis →
 * cascade of formant resonators; fricatives and bursts from noise; formants
 * glide 35 ms. The machine is in the post-processing: monotone pitch (a
 * Speak & Spell drop at the end of each group), sample-rate and bit reduction.
 *
 * The arc follows the cuts: one voice reads the word's own bytes; each cut
 * doubles the voices (1 → 16), crushing them further, until the chorus is a
 * wall of consonants that stops dead on the closing line. Pure function —
 * runs in a worker (voice.worker.ts) so the page never stalls.
 */

export type VoiceCut = { start: number; dur: number; mode: string };
export type VoiceSpec = {
  sr: number;
  digits: number[][];    // per voice: the digit sequence it reads
  cuts: VoiceCut[];
  end: number;           // seconds
  f0: number;            // Hz (monotone)
  formantScale: number;  // voice size (age)
  rate: number;          // digits per second (arousal)
  crush: number;         // 0..1 how far the chorus degrades (tension)
  lead: number;          // 0..1 how dominant the first voice stays (dominance)
  whisper: number;       // 0..1 noise instead of pulses (smoke, void)
  tin: number;           // 0..1 short comb (metal, glass)
  drive: number;         // 0..1 saturation (fire)
  spread: number;        // 0..1 stereo width of the chorus (the lead stays centred)
  seed: number;
};

type Ph = { f: [number, number, number]; voiced: number; noise: number; nf: number; dur: number; burst?: boolean; to?: [number, number, number] };
const V = (f: [number, number, number], dur = 0.09, to?: [number, number, number]): Ph => ({ f, voiced: 1, noise: 0, nf: 0, dur, to });
const PH: Record<string, Ph> = {
  IH: V([400, 1900, 2550]), AH: V([640, 1190, 2390]), UW: V([300, 870, 2240]), IY: V([270, 2290, 3010]),
  AO: V([590, 880, 2540]), EH: V([530, 1840, 2480]), OW: V([500, 900, 2400], 0.1, [320, 870, 2240]),
  AY: V([730, 1090, 2440], 0.12, [300, 2200, 2950]), EY: V([480, 1720, 2520], 0.1, [300, 2250, 2950]),
  OY: V([570, 840, 2410], 0.12, [300, 2200, 2950]),
  R: V([490, 1350, 1690], 0.05), W: V([300, 610, 2150], 0.05), N: { f: [250, 1700, 2500], voiced: 0.5, noise: 0, nf: 0, dur: 0.06 },
  Z: { f: [300, 1600, 2600], voiced: 0.4, noise: 0.7, nf: 5200, dur: 0.07 }, V: { f: [300, 1200, 2400], voiced: 0.4, noise: 0.4, nf: 4000, dur: 0.06 },
  S: { f: [400, 1600, 2600], voiced: 0, noise: 1, nf: 5500, dur: 0.08 }, F: { f: [400, 1200, 2400], voiced: 0, noise: 0.5, nf: 6500, dur: 0.07 },
  TH: { f: [400, 1400, 2400], voiced: 0, noise: 0.35, nf: 7000, dur: 0.06 },
  T: { f: [400, 1700, 2600], voiced: 0, noise: 1, nf: 4200, dur: 0.045, burst: true },
  K: { f: [400, 1500, 2400], voiced: 0, noise: 1, nf: 2200, dur: 0.05, burst: true },
  P: { f: [400, 900, 2400], voiced: 0, noise: 1, nf: 1200, dur: 0.045, burst: true },
};
const DIGITS: string[][] = [
  ['Z', 'IH', 'R', 'OW'], ['W', 'AH', 'N'], ['T', 'UW'], ['TH', 'R', 'IY'], ['F', 'AO', 'R'],
  ['F', 'AY', 'V'], ['S', 'IH', 'K', 'S'], ['S', 'EH', 'V', 'AH', 'N'], ['EY', 'T'], ['N', 'AY', 'N'],
];

/** Two-pole resonator (Klatt): y = A·x + B·y1 + C·y2. */
class Res {
  private y1 = 0;
  private y2 = 0;
  private a = 0; private b = 0; private c = 0;
  private sr: number;
  constructor(sr: number) { this.sr = sr; }
  set(f: number, bw: number) {
    const r = Math.exp((-Math.PI * bw) / this.sr);
    this.c = -r * r;
    this.b = 2 * r * Math.cos((2 * Math.PI * f) / this.sr);
    this.a = 1 - this.b - this.c;
  }
  run(x: number) {
    const y = this.a * x + this.b * this.y1 + this.c * this.y2;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Render all voices to interleaved stereo at spec.sr. */
export function renderVoices(spec: VoiceSpec): Float32Array {
  const { sr } = spec;
  const n = Math.ceil(spec.end * sr);
  const out = new Float32Array(n * 2);
  const rand = mulberry(spec.seed);
  const cutAt = (t: number) => spec.cuts.find((c) => t >= c.start && t < c.start + c.dur);
  const lineAt = spec.cuts.find((c) => c.mode === 'line')?.start ?? spec.end;
  const voices = spec.digits.length;

  for (let v = 0; v < voices; v++) {
    // voices enter by doubling: 1 on the first cut, 2 on the second, 4, 8, 16…
    const entryCut = Math.min(spec.cuts.length - 1, Math.floor(Math.log2(v + 1)));
    let t = (spec.cuts[entryCut]?.start ?? 0) + (v ? rand() * 0.2 : 0);
    const pan = v === 0 ? 0 : (rand() * 2 - 1) * spec.spread;
    const gain = v === 0 ? 0.5 + 0.5 * spec.lead : (0.55 / Math.sqrt(voices)) * (1 - 0.4 * spec.lead);
    const scale = spec.formantScale * (1 + (rand() - 0.5) * 0.08);
    const r1 = new Res(sr), r2 = new Res(sr), r3 = new Res(sr), r4 = new Res(sr), rn = new Res(sr);
    r4.set(3500, 250);
    const tin = new Float32Array(Math.max(1, Math.floor(sr * 0.003)));
    let tinI = 0;
    let phase = 0;
    let hold = 0, held = 0;
    let prevF: [number, number, number] = [500, 1500, 2500];
    const seq = spec.digits[v];
    let di = 0;

    while (t < lineAt && di < seq.length * 4) {
      const digit = seq[di % seq.length];
      const endOfGroup = di % 4 === 3;
      const f0 = spec.f0 * (endOfGroup ? 0.84 : 1); // Speak & Spell: the last digit of a group drops 3 semitones
      const stretch = 1 / Math.max(0.6, spec.rate / 4);
      for (const name of DIGITS[digit]) {
        const ph = PH[name];
        const d = ph.dur * stretch;
        const s0 = Math.floor(t * sr), s1 = Math.min(n, Math.floor((t + d) * sr));
        for (let s = s0; s < s1; s++) {
          const time = s / sr;
          const cut = cutAt(time);
          const mode = cut?.mode ?? 'gap';
          if (mode === 'line' || mode === 'gap' || mode === 'barcode' || mode === 'bits') continue; // silence is material
          const k = (s - s0) / Math.max(1, s1 - s0);
          const glide = Math.min(1, (time - t) / 0.035);
          const tgt = ph.to ? ph.f.map((f, i) => f + (ph.to![i] - f) * k) as [number, number, number] : ph.f;
          const fr = prevF.map((f, i) => (f + (tgt[i] - f) * glide) * scale);
          r1.set(fr[0], 70); r2.set(fr[1], 100); r3.set(fr[2], 160);
          // source: a 1-sample pulse train (harsh, machine) or breath
          phase += f0 / sr;
          let pulse = 0;
          if (phase >= 1) { phase -= 1; pulse = 1; }
          const noise = rand() * 2 - 1;
          const voiced = mode === 'scatter' ? 0 : ph.voiced * (1 - spec.whisper);
          const breath = spec.whisper * ph.voiced * noise * 0.25;
          let x = (pulse * 6 * voiced + breath);
          x = r4.run(r3.run(r2.run(r1.run(x))));
          // fricatives and bursts
          if (ph.noise > 0) {
            rn.set(ph.nf, ph.nf * 0.35);
            const burst = ph.burst ? (k < 0.4 ? 0 : k < 0.5 ? 3 : 0.3) : 1;
            x += rn.run(noise) * ph.noise * 0.6 * burst;
          }
          // spectrum cuts freeze the voice on one vowel (the bars' formants)
          const env = Math.min(1, k * 20, (1 - k) * 20);
          let y = x * env * gain;
          if (spec.drive > 0.3) y = Math.tanh(y * (1 + spec.drive * 4)) / (1 + spec.drive);
          if (spec.tin > 0.3) { const fb = tin[tinI]; tin[tinI] = y + fb * 0.6 * spec.tin; tinI = (tinI + 1) % tin.length; y += fb * 0.5; }
          // the machine: sample-rate and bit reduction grow as the chorus doubles
          const progress = Math.min(1, (entryCut + 1) / Math.max(2, spec.cuts.length * 0.6));
          const hk = Math.max(1, Math.round(1 + progress * (2 + 6 * spec.crush)));
          if (hold <= 0) { held = y; hold = hk; }
          hold--;
          const bits = Math.max(3, Math.round(8 - progress * 5 * spec.crush));
          const q = Math.pow(2, bits - 1);
          const z = Math.round(held * q) / q;
          out[s * 2] += z * (1 - pan) * 0.5;
          out[s * 2 + 1] += z * (1 + pan) * 0.5;
        }
        prevF = ph.to ?? ph.f;
        t += d + (ph.burst ? 0.03 : 0);
      }
      t += 0.035 * stretch; // between digits
      di++;
    }
  }
  return out;
}
