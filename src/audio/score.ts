/**
 * The sound of a performance, from the same score as the image (show/grid.ts) on the same clock (t0 = its start,
 * audio time). Every event is rendered sample-exact into one buffer, so the sound lands on the frame:
 *   fill    — each result arriving: a blip at its value (a choice two, a yes/no a click; a doubtful one only noise)
 *   mark    — each cell that matters: a bell, then its tone held (oscillators) under the rest
 *   select  — each cell going out: a dry click, where it was
 *   merge   — the held tones glide into the result's chord over a rising noise; cut on the first step
 *   steps   — a 4/4 at the word's tempo (kick, hats, clap for an intense word, a bass line from the answers), and on
 *             each step a stab in the voice of its drawing; a burst to the full frame, a crash
 * Pitches are the house's D, in a mode from the mood. At the cut to black the hall blooms once (audio.ts).
 */
import type { Appraisal } from '../jev/appraisal.ts';
import type { Grid, Viz } from '../show/grid.ts';
import { COLS } from '../show/grid.ts';
import { mulberry32 } from '../core/rng.ts';
import { D2, dbToGain, type AudioEngine } from './audio.ts';
import type { Drone } from './drone.ts';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function playPerformance(a: AudioEngine, drone: Drone, A: Appraisal, g: Grid, t0: number) {
  const c = a.ctx, sr = c.sampleRate;
  const rand = mulberry32(A.seed ^ 0x51ed);
  // the mode: bright for a positive word, dark for a negative one, open (fourths) for a neutral one
  const m = A.mood;
  const SCALE = m.pos >= m.neg && m.pos >= m.neu ? [0, 2, 4, 7, 9] : m.neg >= m.neu ? [0, 1, 3, 7, 8] : [0, 2, 5, 7, 10];
  const CHORD = m.pos >= m.neg && m.pos >= m.neu ? [0, 4, 7, 12, 16, 19, 24, 28] : m.neg >= m.neu ? [0, 3, 7, 12, 15, 19, 24, 27] : [0, 5, 7, 12, 17, 19, 24, 29];
  const root = D2 * 2;
  /** A value (0..1) as a note of the mode, over two octaves from `oct` octaves above D3. */
  const note = (v: number, oct: number) => { const j = Math.min(9, Math.floor(v * 10)); return root * 2 ** (oct + (SCALE[j % 5] + 12 * Math.floor(j / 5)) / 12); };
  const col = (k: number) => ((k % COLS) / (COLS - 1)) * 1.4 - 0.7; // a cell's column as a pan

  const len = Math.ceil((g.end + 0.05) * sr);
  const buf = c.createBuffer(2, len, sr);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const put = (i: number, x: number, pan: number) => { if (i >= 0 && i < len) { L[i] += x * (1 - pan); R[i] += x * (1 + pan); } };
  /** A sine (optionally sweeping to f1), 2 ms attack, decaying with tau. */
  const tone = (t: number, f: number, dur: number, amp: number, pan = 0, tau = dur / 3, f1 = f) => {
    const s0 = Math.floor(t * sr), n = Math.floor(dur * sr);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const x = i / sr;
      ph += (2 * Math.PI * f * (f1 / f) ** (i / n)) / sr;
      put(s0 + i, Math.sin(ph) * amp * Math.min(1, x / 0.002) * Math.exp(-x / tau), pan);
    }
  };
  /** Noise, high-passed (a first difference) when `hp`, decaying with tau. */
  const noise = (t: number, dur: number, amp: number, pan = 0, tau = dur / 3, hp = true) => {
    const s0 = Math.floor(t * sr), n = Math.floor(dur * sr);
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const w = rand() * 2 - 1;
      put(s0 + i, (hp ? w - prev : w) * amp * Math.exp(-i / sr / tau), pan);
      prev = w;
    }
  };
  const click = (t: number, amp: number, pan = 0) => { const s = Math.floor(t * sr); put(s, amp, pan); put(s + 1, -amp * 0.6, pan); };

  // ---- fill: the grid draws itself (one low touch), then every result as it lands
  tone(0, 60, 0.3, 0.2, 0, 0.1);
  g.cells.forEach((x, k) => {
    const t = x.arrive, pan = col(k);
    if (x.conf < 0.45) { noise(t, 0.02, 0.06, pan, 0.006); return; }
    if (x.kind === 0) tone(t, note(x.value, 2), 0.06, 0.07, pan, 0.012);
    else if (x.kind === 1) { tone(t, note(x.value, 2), 0.05, 0.06, pan, 0.01); tone(t + 0.03, note([...x.probs].sort((p, q) => q - p)[1] ?? 0, 2), 0.05, 0.04, pan, 0.01); }
    else { click(t, 0.25, pan); noise(t, 0.015, 0.05, pan, 0.004); }
  });
  // ---- mark and select
  for (const k of g.keys) {
    const x = g.cells[k], f = note(x.value, 1);
    tone(x.markAt, f, 0.9, 0.1, col(k), 0.3);
    tone(x.markAt, f * 2.76, 0.4, 0.025, col(k), 0.08);
  }
  g.cells.forEach((x, k) => { if (x.key < 0) { click(x.vanish, 0.22, col(k)); noise(x.vanish, 0.004, 0.08, col(k), 0.0015); } });
  // ---- merge: a rising noise, into the first step
  {
    const s0 = Math.floor(g.merge * sr), n = Math.floor(g.mergeDur * sr);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      lp += (0.02 + 0.5 * u * u) * ((rand() * 2 - 1) - lp);
      put(s0 + i, lp * 0.14 * u * u, 0);
    }
  }
  // ---- the steps: the beat
  const aro = A.s.arousal, beat = g.beat;
  const K = g.keys.length;
  for (let b = 0; b < 16; b++) {
    const t = g.seq + b * beat;
    tone(t, 150, 0.35, 0.55, 0, 0.18, 45); // the kick
    click(t, 0.15);
    noise(t + beat / 2, 0.05, 0.07, 0.25, 0.012); // the offbeat hat
    if (aro > 0.55) for (const q of [0.25, 0.75]) noise(t + beat * q, 0.03, 0.03, -0.25, 0.008);
    if (A.s.intensity > 0.45 && b % 2 === 1) for (const d of [0, 0.011, 0.023]) noise(t + d, 0.09, 0.08, 0, 0.03);
    // the bass, on the offbeat: the answers in turn
    const f = note(g.cells[g.keys[b % K]].value, -1);
    {
      const s0 = Math.floor((t + beat / 2) * sr), n = Math.floor(Math.min(0.2, beat / 2) * sr);
      let ph = 0, lp = 0;
      for (let i = 0; i < n; i++) { ph = (ph + f / sr) % 1; lp += 0.12 * (ph * 2 - 1 - lp); put(s0 + i, lp * 0.16 * Math.exp(-i / sr / 0.08), 0); }
    }
  }
  const res = g.result, fr = note(res, 2);
  for (const s of g.steps) {
    stab(s.viz, s.t, s.dur);
    if (s.full) noise(s.t, 0.8, 0.06, 0, 0.25);
  }
  function stab(v: Viz, t: number, dur: number) {
    const keyNote = (i: number, oct: number) => note(g.cells[g.keys[i]].value, oct);
    switch (v) {
      case 'flat': for (const iv of [0, 7, 12]) tone(t, root * 2 ** (1 + iv / 12), 0.3, 0.04, 0, 0.1); break;
      case 'number': [...Math.round(res * 999).toString().padStart(3, '0')].forEach((d, i) => tone(t + (i * dur) / 4, 800 + Number(d) * 120, 0.03, 0.06, (i - 1) * 0.4, 0.01)); break;
      case 'bands': for (let i = 0; i < K; i++) {
        const s0 = Math.floor(t * sr), n = Math.floor(0.16 * sr), f = keyNote(i, 1);
        let ph = 0, lp = 0;
        for (let j = 0; j < n; j++) { ph = (ph + f / sr) % 1; lp += 0.25 * (ph * 2 - 1 - lp); put(s0 + j, lp * 0.025 * Math.exp(-j / sr / 0.05), (i / K) * 1.2 - 0.6); }
      } break;
      case 'rings': {
        const s0 = Math.floor(t * sr), n = Math.floor(0.6 * sr);
        for (let j = 0; j < n; j++) { const x = j / sr, e = Math.exp(-x / 0.18); put(s0 + j, Math.sin(2 * Math.PI * fr * x + 3 * e * Math.sin(2 * Math.PI * fr * 1.4 * x)) * 0.07 * e, 0); }
      } break;
      case 'particles': for (let i = 0; i < 40; i++) tone(t + rand() * dur, 3000 + rand() * 6000, 0.004, 0.03, rand() * 1.6 - 0.8, 0.0015); break;
      case 'bars': for (let i = 0; i < K; i++) {
        const s0 = Math.floor(t * sr), n = Math.floor(0.12 * sr), f = keyNote(i, 1);
        for (let j = 0; j < n; j++) put(s0 + j, (((j * f) / sr) % 1 < 0.5 ? 1 : -1) * 0.018 * Math.exp(-j / sr / 0.04), 0);
      } break;
      case 'waves': tone(t, fr, dur, 0.06, 0, dur * 3); break;
      case 'rays': tone(t, 300, dur * 0.8, 0.05, 0, dur, 3000); break;
      case 'bits': {
        const byte = (Math.round(res * 255) ^ (A.bytes[0] ?? 0)) & 255;
        for (let i = 0; i < 8; i++) if ((byte >> (7 - i)) & 1) click(t + (i * dur) / 8, 0.2, (i / 7) * 1.2 - 0.6);
      } break;
      case 'tiles': for (let i = 0; i < K; i++) tone(t + (i * dur) / K, keyNote(i, 2), 0.05, 0.05, (i / K) * 1.2 - 0.6, 0.015); break;
      case 'disc': tone(t, 90, 0.4, 0.35, 0, 0.15, 40); break;
    }
  }

  // how loud: as Jev heard the word (a positive one never timid)
  const loud = Math.max(A.s.loudness * 0.5 + A.s.intensity * 0.5, m.pos * 0.5);
  const out = c.createGain();
  out.gain.value = dbToGain(lerp(-8, 0, loud));
  out.connect(a.perfDry);
  const send = c.createGain();
  send.gain.value = 0.15;
  out.connect(send).connect(a.perfSend);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(out);
  src.start(t0);

  // the marked cells' tones, held from their mark, gliding into the result's chord through the merge, cut on the
  // first step
  const residue: number[] = [];
  g.keys.forEach((k, r) => {
    const x = g.cells[k], o = c.createOscillator(), gg = c.createGain();
    const to = root * 2 ** (CHORD[r % CHORD.length] / 12);
    o.frequency.setValueAtTime(note(x.value, 1), t0 + g.merge);
    o.frequency.exponentialRampToValueAtTime(to, t0 + g.merge + g.mergeDur * 0.8);
    gg.gain.setValueAtTime(0, t0 + x.markAt);
    gg.gain.linearRampToValueAtTime(0.02, t0 + x.markAt + 0.3);
    gg.gain.linearRampToValueAtTime(0.04, t0 + g.seq - 0.005);
    gg.gain.linearRampToValueAtTime(0, t0 + g.seq);
    o.connect(gg).connect(out);
    o.start(t0 + x.markAt);
    o.stop(t0 + g.seq + 0.01);
    residue.push(to);
  });

  a.cutAt(t0 + g.end, t0 + g.end + TAIL);
  drone.duck(t0 + g.end);
  drone.remember({ rough: Math.min(1, aro * 0.6 + A.s.tension * 0.4), bright: A.s.light, residue: residue.slice(0, 2) }, t0 + g.end);
}

/** After the cut to black: the hall rings, then the room returns (s). */
export const TAIL = 1.6;
