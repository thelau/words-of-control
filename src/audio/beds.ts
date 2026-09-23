/**
 * Beds: the ground the verdict's clips play over — a vocabulary of authored
 * synthesis textures (dark and light), drawn per performance from the
 * judgement with some chance. A charged word gets two or three layered; an
 * idle word one, quietly. Violence is heard as pressure, dread and distance
 * (sine clusters, rumble, a falling Shepard tone, metal ringing, a sub floor), not as guns.
 * Beds run under all the shots and die at the cut to black (perfDry), their
 * last moment carried by the hall.
 *
 * Accents: every camera cut inside a shot is heard (director.ts Angle) — a deep
 * impact with a beating tail, a tick or a data blip, from a family chosen per
 * performance, so the cutting is felt as rhythm; a dark word's every shot lands
 * with an impact. Nothing here swooshes: no filtered-noise sweeps.
 */
import type { Appraisal } from '../jev/appraisal.ts';
import type { Plan } from '../show/director.ts';
import { D2, dbToGain, type AudioEngine } from './audio.ts';
import { mulberry32 } from '../core/rng.ts';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

type B = { a: AudioEngine; A: Appraisal; start: number; end: number; out: GainNode; rand: () => number; x: number };

const BEDS = {
  /** a low sine cluster, each pair a fraction of a hertz apart: the air itself presses and beats */
  pressure(b: B) {
    const c = b.a.ctx;
    const g = c.createGain();
    g.gain.value = 0.11;
    g.connect(b.out);
    for (const r of [1, 1.0595, 1.5, 2]) for (const beat of [0, 0.3 + b.rand() * 1.2]) {
      const o = c.createOscillator();
      o.frequency.value = D2 * r + beat;
      o.connect(g);
      o.start(b.start); o.stop(b.end + 0.05);
    }
  },
  /** noise driven through a low filter into a soft clipper, swelling like distant artillery: rumble */
  rumble(b: B) {
    const c = b.a.ctx;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 140; lp.Q.value = 0.8;
    const drive = c.createWaveShaper();
    const k = new Float32Array(1024);
    for (let i = 0; i < k.length; i++) { const v = (i / 511.5 - 1) * 4; k[i] = Math.tanh(v); }
    drive.curve = k;
    const g = c.createGain();
    g.gain.setValueAtTime(0.15, b.start);
    // swells: far-off blows, each a slow bloom
    for (let t = b.start + b.rand() * 0.8; t < b.end - 0.4; t += 0.9 + b.rand() * 2.2) {
      g.gain.setTargetAtTime(lerp(0.5, 1.2, b.rand()), t, 0.05);
      g.gain.setTargetAtTime(0.15, t + 0.2, 0.5);
    }
    const post = c.createBiquadFilter();
    post.type = 'lowpass'; post.frequency.value = 260;
    src(b).connect(lp).connect(g).connect(drive).connect(post).connect(b.out);
  },
  /** six octave-spaced sines forever falling (Shepard): dread */
  dread(b: B) {
    const c = b.a.ctx;
    const n = 6, span = b.end - b.start, rate = lerp(0.08, 0.25, b.x); // octaves per second
    for (let i = 0; i < n; i++) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.connect(g).connect(b.out);
      const steps = Math.ceil(span / 0.1);
      for (let s = 0; s <= steps; s++) {
        const t = b.start + s * 0.1;
        const pos = ((i / n - (s * 0.1 * rate) / n) % 1 + 1) % 1; // 0..1 across the octaves
        const f = D2 * Math.pow(2, pos * n);
        o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.05 * Math.sin(Math.PI * pos) ** 2, t);
      }
      o.start(b.start); o.stop(b.end + 0.05);
    }
  },
  /** noise strikes into tuned feedback combs: industrial metal ringing */
  metal(b: B) {
    const c = b.a.ctx;
    const hits = rendered(b, (L, R, sr) => {
      for (let t = b.rand() * 0.3; t < b.end - b.start; t += lerp(1.4, 0.35, b.x) * (0.5 + b.rand())) {
        const s0 = Math.floor(t * sr);
        let lp = 0; // a soft mallet, not a hit: low-passed excitation
        for (let i = 0; i < 400 && s0 + i < L.length; i++) { lp += 0.15 * ((Math.random() * 2 - 1) - lp); const v = lp * (1 - i / 400) * 0.8; L[s0 + i] += v; R[s0 + i] += v; }
      }
    });
    for (const r of [1, 1.41, 2.13, 2.87]) {
      const d = c.createDelay(0.1);
      d.delayTime.value = 1 / (D2 * 2 * r * (1 + (b.rand() - 0.5) * 0.02));
      const fb = c.createGain();
      fb.gain.value = 0.94;
      const g = c.createGain();
      g.gain.value = 0.05;
      hits.connect(d); d.connect(fb).connect(d); d.connect(g).connect(b.out);
    }
  },
  /** a low double thump, the body's clock: heartbeat */
  heartbeat(b: B) {
    const bpm = lerp(52, 118, b.A.s.arousal);
    const s = rendered(b, (L, R, sr) => {
      for (let t = 0.1; t < b.end - b.start; t += 60 / bpm) {
        for (const [dt, amp] of [[0, 1], [0.16, 0.6]] as const) {
          const s0 = Math.floor((t + dt) * sr);
          let ph = 0;
          for (let i = 0; i < sr * 0.18 && s0 + i < L.length; i++) {
            const u = i / sr;
            ph += (2 * Math.PI * (52 + 30 * Math.exp(-u / 0.02))) / sr;
            const v = Math.sin(ph) * Math.exp(-u / 0.06) * amp * 0.8;
            L[s0 + i] += v; R[s0 + i] += v;
          }
        }
      }
    });
    s.connect(b.out);
  },
  /** crackle and hiss in bursts, band-limited like a far transmitter: static */
  static(b: B) {
    const s = rendered(b, (L, R, sr) => {
      let on = false, hold = 0, lp = 0, hp = 0;
      for (let i = 0; i < L.length; i++) {
        if (--hold <= 0) { on = b.rand() < lerp(0.35, 0.7, b.x); hold = Math.floor(sr * (0.03 + b.rand() * 0.4)); }
        const w = Math.random() * 2 - 1;
        const crack = Math.random() < 0.002 ? (Math.random() * 2 - 1) * 2 : 0;
        lp += 0.35 * (w - lp); hp = lp - hp * 0.97;
        const v = on ? (hp * 0.12 + crack * 0.2) : crack * 0.05;
        L[i] += v; R[i] += v * (0.6 + 0.4 * Math.sin(i / sr * 3));
      }
    });
    s.connect(b.out);
  },
  /** a high chord of sines, each voice doubled a slow beat away: a hymn without singers */
  hymn(b: B) {
    const c = b.a.ctx;
    const minor = b.A.s.valence < 0.5;
    const g = c.createGain();
    g.gain.setValueAtTime(0, b.start);
    g.gain.linearRampToValueAtTime(0.05, b.start + 1.2);
    g.connect(b.out);
    for (const r of [1, minor ? 1.2 : 1.25, 1.5, 2, 3]) for (const beat of [0, 0.3 + b.rand() * 1.2]) {
      const o = c.createOscillator();
      o.frequency.value = D2 * 4 * r + beat;
      o.connect(g);
      o.start(b.start); o.stop(b.end + 0.05);
    }
  },
  /** a warm sine chord on a warbling tape: an afternoon, a memory */
  tape(b: B) {
    const c = b.a.ctx;
    const minor = b.A.s.valence < 0.45;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.4 + b.rand() * 0.5;
    const depth = c.createGain();
    depth.gain.value = 9;
    lfo.connect(depth);
    lfo.start(b.start); lfo.stop(b.end + 0.05);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1800;
    lp.connect(b.out);
    for (const r of [1, minor ? 1.2 : 1.25, 1.5, 3]) {
      const o = c.createOscillator();
      o.frequency.value = D2 * 4 * r;
      depth.connect(o.detune);
      const g = c.createGain();
      g.gain.value = 0.05 / (r > 2 ? 2 : 1);
      o.connect(g).connect(lp);
      o.start(b.start); o.stop(b.end + 0.05);
    }
  },
  /** a gated high sine pulse, crushed: the machine counting */
  pulse(b: B) {
    const bpm = lerp(90, 180, b.A.s.arousal) * (b.rand() < 0.5 ? 1 : 2);
    const f = lerp(1000, 4000, b.A.s.pitch);
    const s = rendered(b, (L, R, sr) => {
      const step = 60 / bpm / 2;
      let k = 0;
      for (let t = 0; t < b.end - b.start; t += step, k++) {
        if (b.rand() < 0.3) continue;
        const s0 = Math.floor(t * sr), n = Math.floor(sr * step * lerp(0.1, 0.5, b.rand()));
        for (let i = 0; i < n && s0 + i < L.length; i++) {
          const v = Math.round(Math.sin((2 * Math.PI * f * i) / sr) * 4) / 4 * 0.12;
          if (k % 2) L[s0 + i] += v; else R[s0 + i] += v;
        }
      }
    });
    s.connect(b.out);
  },
  /** a metal plate struck softly now and then, its inharmonic modes ringing out: awe */
  plates(b: B) {
    const s = rendered(b, (L, R, sr) => {
      const modes = [1, 2.76, 5.4, 8.93];
      for (let t = 0.2 + b.rand(); t < b.end - b.start; t += 0.9 + b.rand() * 2) {
        const f = D2 * 4 * [1, 1.5, 2, 2.25][Math.floor(b.rand() * 4)];
        const s0 = Math.floor(t * sr), pan = b.rand() * 1.4 - 0.7;
        for (let i = 0; i < sr * 3.5 && s0 + i < L.length; i++) {
          const u = i / sr;
          let v = 0;
          modes.forEach((m, k) => { v += Math.sin(2 * Math.PI * f * m * u) * Math.exp(-u * (0.9 + k * 1.1)) / (1 + k); });
          v *= 0.04 * (1 - Math.exp(-u / 0.003));
          L[s0 + i] += v * (1 - pan); R[s0 + i] += v * (1 + pan);
        }
      }
    });
    s.connect(b.out);
  },
  /** pairs of very high sines a few hertz apart, barely there: Ikeda's field of tones */
  sinefield(b: B) {
    const c = b.a.ctx;
    const g = c.createGain();
    g.gain.value = 0.012;
    g.connect(b.out);
    for (let k = 0; k < 3; k++) {
      const f = 14000 + b.rand() * 3000;
      for (const [d, pan] of [[0, -0.8], [2 + b.rand() * 5, 0.8]] as const) {
        const o = c.createOscillator();
        o.frequency.value = f + d;
        const p = c.createStereoPanner();
        p.pan.value = pan;
        o.connect(p).connect(g);
        o.start(b.start); o.stop(b.end + 0.05);
      }
    }
  },
  /** streams of single-sample clicks, dense and sparse in turn: data falling */
  datarain(b: B) {
    const s = rendered(b, (L, R, sr) => {
      let rate = 200;
      for (let i = 0; i < L.length; i++) {
        if (i % 2048 === 0) rate = lerp(40, 2400, b.rand() ** 2) * lerp(0.5, 1.5, b.x);
        if (Math.random() < rate / sr) { const v = (Math.random() < 0.5 ? 1 : -1) * (0.15 + Math.random() * 0.35); if (Math.random() < 0.5) L[i] += v; else R[i] += v; }
      }
    });
    s.connect(b.out);
  },
  /** a sub floor (36–41 Hz) swelling slowly: felt, under everything */
  subfloor(b: B) {
    const c = b.a.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0, b.start);
    for (let t = b.start; t < b.end; t += 2.5 + b.rand() * 2) {
      g.gain.linearRampToValueAtTime(0.18 + 0.15 * b.rand(), t + 1.2);
      g.gain.linearRampToValueAtTime(0.15, t + 2.4);
    }
    g.connect(b.out);
    const f0 = 36 + b.rand() * 5;
    for (const f of [f0, f0 + 0.7]) { // two sines 0.7 Hz apart: the floor breathes
      const o = c.createOscillator();
      o.frequency.value = f;
      o.connect(g);
      o.start(b.start); o.stop(b.end + 0.05);
    }
  },
} satisfies Record<string, (b: B) => void>;

type BedId = keyof typeof BEDS;

function weights(A: Appraisal): Record<BedId, number> {
  const em = A.c.emotion.p, n = A.n, s = A.s, d = A.c.domain.p;
  const dark = clamp01(n.violence + em.anger * 0.6 + em.fear * 0.6);
  return {
    pressure: dark + s.tension * 0.5 + s.weight * 0.3 + em.awe * 0.3,
    rumble: dark * 1.2 + s.loudness * 0.3 + s.scale * 0.3,
    dread: em.fear + em.anxiety * 0.6 + n.violence * 0.5 + (1 - s.valence) * 0.3,
    metal: d.machine * 0.8 + A.c.material.p.metal + dark * 0.4 + s.hardness * 0.3,
    heartbeat: d.body + em.fear * 0.6 + n.closeness * 0.4 + em.tender * 0.3,
    static: s.distance * 0.6 + n.violence * 0.4 + s.strangeness * 0.4 + A.c.act.p.nonsense * 0.6,
    hymn: s.sacred + em.sadness * 0.7 + em.awe * 0.6 + n.loss * 0.5,
    tape: A.lazy + n.nostalgia + em.tender * 0.5 + em.calm * 0.6 + A.c.time.p.past * 0.5,
    pulse: d.machine * 0.6 + d.mind * 0.5 + s.order * 0.4 + s.strangeness * 0.4 + em.playful * 0.5,
    plates: em.awe * 0.7 + em.joy * 0.6 + s.sacred * 0.5 + A.c.material.p.light * 0.5 + A.c.material.p.metal * 0.3,
    sinefield: d.machine * 0.6 + d.mind * 0.5 + s.order * 0.5 + (1 - s.temperature) * 0.4 + em.calm * 0.3 + 0.2,
    datarain: d.machine * 0.7 + s.density * 0.6 + s.strangeness * 0.4 + A.c.act.p.nonsense * 0.8 + em.anxiety * 0.4,
    subfloor: dark * 0.8 + s.weight * 0.5 + s.scale * 0.5 + em.awe * 0.3 + n.loss * 0.3,
  };
}

/** Lay the beds under the verdict and the accents on its camera cuts. */
export function playBeds(a: AudioEngine, A: Appraisal, plan: Plan, t0: number) {
  const first = plan.shots.find((s) => !s.aborted);
  if (!first) return;
  const rand = mulberry32((first.seed ^ 0x6bed) >>> 0);
  const x = clamp01(A.s.loudness * 0.4 + A.s.intensity * 0.4 + A.s.arousal * 0.2);
  const w = weights(A);
  const ids = Object.keys(BEDS) as BedId[];
  const layers = A.lazy > 0.7 ? 1 : A.s.arousal > 0.6 ? 3 : 2;
  const chosen: BedId[] = [];
  for (let k = 0; k < layers; k++) {
    const pool = ids.filter((id) => !chosen.includes(id));
    const ws = pool.map((id) => Math.pow(Math.max(w[id], 0.02), 2));
    let r = rand() * ws.reduce((p, q) => p + q, 0);
    let pick = pool[0];
    for (let i = 0; i < pool.length; i++) { r -= ws[i]; if (r <= 0) { pick = pool[i]; break; } }
    chosen.push(pick);
  }
  const start = t0 + first.start, end = t0 + plan.blackAt;
  const c = a.ctx;
  chosen.forEach((id, k) => {
    const out = c.createGain();
    const level = dbToGain(lerp(-24, -14, x) - k * 3);
    out.gain.setValueAtTime(0, start);
    out.gain.linearRampToValueAtTime(level, start + (A.lazy > 0.6 ? 1.5 : 0.05));
    out.connect(a.perfDry);
    const send = c.createGain();
    send.gain.value = 0.25;
    out.connect(send).connect(a.perfSend);
    BEDS[id]({ a, A, start, end, out, rand, x });
  });
  accents(a, A, plan, t0, rand, x);
}

type AccentId = 'impact' | 'tick' | 'datum';

/** One deep impact rendered into L/R from sample s0: a sine sweeping 90 → ~41 Hz in 70 ms with a partner a
 *  hertz above (the tail beats: vibration), saturated so small speakers hear its harmonics, over a short
 *  150–350 Hz body; it rings for seconds. */
function impact(L: Float32Array, R: Float32Array, sr: number, s0: number, amp: number, rand: () => number) {
  const f1 = 41 + rand() * 6, beat = 0.8 + rand() * 0.8, tau = 2.5 + rand() * 1.5;
  let p1 = 0, p2 = 0, lp = 0;
  for (let i = 0; s0 + i < L.length && i < sr * tau * 3; i++) {
    const u = i / sr;
    const sweep = 1 + (90 / f1 - 1) * Math.exp(-u / 0.025);
    p1 += (2 * Math.PI * f1 * sweep) / sr;
    p2 += (2 * Math.PI * (f1 + beat) * sweep) / sr;
    const env = (1 - Math.exp(-u / 0.003)) * Math.exp(-u / tau);
    lp += 0.03 * ((Math.random() * 2 - 1) - lp);
    const v = Math.tanh(1.2 * (Math.sin(p1) + Math.sin(p2)) * 0.6 * env) + lp * 3 * Math.exp(-u / 0.06);
    L[s0 + i] += v * amp; R[s0 + i] += v * amp;
  }
}

/** Every camera cut inside a shot is heard; for a dark word every shot lands with a deep impact.
 *  The family is chosen per performance: impacts, ticks, or data blips (a short high sine). */
function accents(a: AudioEngine, A: Appraisal, plan: Plan, t0: number, rand: () => number, x: number) {
  const fam: AccentId[] = ['impact', 'tick', 'datum'];
  const main = fam[Math.floor(rand() * fam.length)];
  const em = A.c.emotion.p;
  const dark = clamp01(A.n.violence + em.anger * 0.6 + em.fear * 0.6);
  const c = a.ctx;
  const sr = c.sampleRate;
  const first = plan.shots.find((s) => !s.aborted);
  if (!first) return;
  const span = plan.blackAt - first.start;
  const buf = c.createBuffer(2, Math.ceil((span + 5) * sr), sr);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  for (const shot of plan.shots) {
    if (shot.aborted) continue;
    if (dark > 0.45) impact(L, R, sr, Math.floor((shot.start - first.start) * sr), 0.9, rand);
    for (const ang of shot.angles) {
      if (ang.at <= 0) continue;
      const s0 = Math.floor((shot.start + ang.at - first.start) * sr);
      if (main === 'impact') { impact(L, R, sr, s0, 0.5, rand); continue; }
      const f = main === 'tick' ? 2600 : 6000 + rand() * 6000;
      const len = Math.floor(sr * (main === 'tick' ? 0.02 : 0.004));
      for (let i = 0; i < len && s0 + i < L.length; i++) {
        const v = Math.sin((2 * Math.PI * f * i) / sr) * Math.exp(-i / (sr * (main === 'tick' ? 0.004 : 0.0015))) * 0.5;
        L[s0 + i] += v; R[s0 + i] += v;
      }
    }
  }
  const s = c.createBufferSource();
  s.buffer = buf;
  const out = c.createGain();
  out.gain.value = dbToGain(lerp(-28, -14, x));
  s.connect(out).connect(a.perfDry);
  s.start(t0 + first.start);
}

function src(b: B): AudioBufferSourceNode {
  const n = b.a.ctx.createBufferSource();
  n.buffer = b.a.noise;
  n.loop = true;
  const off = b.rand() * 2;
  n.start(b.start, off);
  n.stop(b.end + 0.05);
  return n;
}

function rendered(b: B, fill: (L: Float32Array, R: Float32Array, sr: number) => void): AudioBufferSourceNode {
  const c = b.a.ctx;
  const buf = c.createBuffer(2, Math.ceil((b.end - b.start) * c.sampleRate), c.sampleRate);
  fill(buf.getChannelData(0), buf.getChannelData(1), c.sampleRate);
  const s = c.createBufferSource();
  s.buffer = buf;
  s.start(b.start);
  return s;
}
