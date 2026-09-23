/**
 * Boot + state machine. Rest/typing show the room; Enter asks Jev once; the
 * answer becomes an appraisal, the director turns it into a plan, and the
 * plan is performed — image and sound from one clock — until the cut to black
 * and its reverb have passed. Then the room returns.
 */
import './style.css';
import { Renderer, type Layer } from './render/gpu.ts';
import { Frame } from './render/frame.ts';
import { Typing } from './input/typing.ts';
import { Display } from './input/display.ts';
import { AudioEngine } from './audio/audio.ts';
import { Drone } from './audio/drone.ts';
import { Keys } from './audio/keys.ts';
import { playPerformance } from './audio/score.ts';
import { analyze } from './jev/client.ts';
import { buildAppraisal, type Appraisal } from './jev/appraisal.ts';
import type { Answers } from './jev/types.ts';
import { CUT_MODES, DATA_CLIPS, direct, type Plan } from './show/director.ts';
import { momentAt, type Moment } from './show/timeline.ts';
import { seedFromText } from './core/rng.ts';
import { showSupport, hideSupport } from './support.ts';
import { showError } from './errorPopup.ts';
import { plateMode } from './show/chladni.ts';

export type State = 'idle' | 'typing' | 'analyzing' | 'performing' | 'barred' | 'support' | 'error';

const query = new URLSearchParams(location.search);

// grading per layer: neutral bloom, film halation (only the brightest light), flat = data (true black)
const GRADE: Record<Layer, { bloom: number; halation: number; flat: number }> = {
  room: { bloom: 0.06, halation: 0, flat: 0 }, black: { bloom: 0, halation: 0, flat: 0 },
  appraisal: { bloom: 0.02, halation: 0, flat: 1 }, relief: { bloom: 0.02, halation: 0.02, flat: 0 },
  sand: { bloom: 0.05, halation: 0.03, flat: 0 },
  data: { bloom: 0.05, halation: 0.02, flat: 0 },
};

/** White balance from the matter: cold for glass, ice, water; warm for fire, sand, lazy afternoons. */
function whiteBalance(A: Appraisal): [number, number, number] {
  const m = A.c.material.p;
  const cold = Math.min(1, m.glass + m.ice + m.water + m.metal * 0.5);
  const warm = Math.min(1, m.fire + m.sand + m.wood * 0.5 + A.lazy * 0.6);
  const k = warm - cold; // -1 cold … +1 warm
  return [1 + 0.12 * k, 1 + 0.02 * k, 1 - 0.18 * k];
}

/** A performance in flight: its plan, its start on the shared clock. */
export type Show = { A: Appraisal; plan: Plan; t0: number };

export type App = {
  state: () => State;
  /** Perform from Jev answers (harness, tests). */
  perform: (answers: Answers, text: string) => void;
  /** Perform a hand-made plan with an appraisal (harness). */
  performPlan: (A: Appraisal, plan: Plan) => void;
  show: () => Show | null;
  moment: () => Moment | null;
  harnessOpen: boolean;
  frameHooks: Set<(now: number) => void>;
  canvas: HTMLCanvasElement;
  audio: () => AudioEngine | null;
  /** The shared performance clock (tests and capture). */
  audioClock: () => number;
  /** Last GPU frame time in ms (dev, when timestamp queries exist). */
  gpuMs: () => number;
};

async function boot() {
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  if (!(await Renderer.supported())) {
    document.body.insertAdjacentHTML('beforeend', '<div id="nogpu">WebGPU is required.</div>');
    return;
  }
  const renderer = new Renderer(canvas);
  await renderer.init();
  const frame = new Frame();
  frame.set('outX', renderer.width); frame.set('outY', renderer.height); frame.set('outDpr', renderer.dpr);
  frame.set('resX', renderer.lowW); frame.set('resY', renderer.lowH); frame.set('dpr', 1);
  frame.set('wbR', 1); frame.set('wbG', 1); frame.set('wbB', 1); frame.set('zoom', 1);
  renderer.warmUp(frame.f32);
  const display = new Display();

  let audio: AudioEngine | null = null;
  let drone: Drone | null = null;
  let keys: Keys | null = null;
  let state: State = 'idle';
  let show: Show | null = null;
  let moment: Moment | null = null;
  let keysTyped = 0;
  let charge = 0;
  let kick = 0;
  let roomFade = 1;

  const clock = () => (audio ? audio.clock() : performance.now() / 1000);

  function ensureAudio() {
    if (audio) return audio.resume();
    audio = new AudioEngine();
    drone = new Drone(audio);
    keys = new Keys(audio);
    audio.resume();
    drone.fadeIn(5);
  }

  function toIdle() {
    state = 'idle';
    keysTyped = 0;
    display.showCursor();
    typing.focus();
  }

  function performPlan(A: Appraisal, plan: Plan) {
    ensureAudio();
    state = 'performing';
    display.hideCursor();
    void display.fadeText();
    typing.clear();
    keysTyped = 0;
    // the appraisal begins as the word finishes fading
    const t0 = clock() + 0.3;
    show = { A, plan, t0 };
    frame.setAppraisal(A);
    renderer.setTape(A.tape);
    if (audio && drone) playPerformance(audio, drone, A, plan, t0);
  }

  function perform(answers: Answers, text: string) {
    const A = buildAppraisal(answers, text, typing.trace(), seedFromText(text));
    renderer.setWord(text);
    performPlan(A, direct(A));
  }

  async function submit(text: string) {
    state = 'analyzing';
    display.hold();
    const r = await analyze(text);
    if (state !== 'analyzing') return;
    switch (r.kind) {
      case 'react':
        perform(r.answers, text);
        break;
      case 'barred':
        // a refusal reads as a refusal: an instant cut, nothing follows
        state = 'barred';
        display.cutText();
        display.hideCursor();
        typing.clear();
        setTimeout(toIdle, 600);
        break;
      case 'support':
        state = 'support';
        typing.clear();
        display.hideAll(true);
        drone?.fadeOut(2);
        showSupport();
        break;
      case 'error':
      case 'fallback':
        state = 'error';
        display.hideCursor();
        void display.fadeText();
        typing.clear();
        if (r.kind === 'error') showError(r.error, toIdle);
        else setTimeout(toIdle, 300);
        break;
    }
  }

  function exitSupport() {
    hideSupport();
    display.hideAll(false);
    drone?.fadeIn(4);
    toIdle();
  }

  const typing = new Typing({
    onFirstKey: () => {
      ensureAudio();
      if (!import.meta.env.DEV || query.has('fs')) {
        document.documentElement.requestFullscreen?.().then(() => {
          (navigator as Navigator & { keyboard?: { lock?: (k: string[]) => Promise<void> } }).keyboard?.lock?.(['Escape']).catch(() => {});
        }).catch(() => {});
      }
    },
    onKey: (kind, code) => {
      keys?.click(code, kind === 'backspace');
      display.wake();
      keysTyped++;
      kick = 1;
      if (state === 'idle') state = 'typing';
    },
    onLimit: () => keys?.limit(),
    onChange: (text) => {
      display.set(text);
      if (!text && state === 'typing') { state = 'idle'; keysTyped = 0; }
    },
    onSubmit: (text) => void submit(text),
    onEscape: () => { if (state === 'support') exitSupport(); },
    accepting: () => state === 'idle' || state === 'typing',
    suspended: () => app.harnessOpen,
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && state === 'support') exitSupport();
  });

  const app: App = {
    state: () => state,
    perform,
    performPlan,
    show: () => show,
    moment: () => moment,
    harnessOpen: false,
    frameHooks: new Set(),
    canvas,
    audio: () => audio,
    audioClock: () => clock(),
    gpuMs: () => renderer.gpuMs,
  };

  // ---- frame loop
  let last = performance.now();
  let lastKey = '';
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    renderer.resize();
    const f = (k: string, v: number) => frame.set(k, v);
    f('outX', renderer.width); f('outY', renderer.height); f('outDpr', renderer.dpr);
    f('time', (now / 1000) % 4096); f('dt', dt);
    f('exposure', 1); f('grain', 0.045);

    // typing charges the room, gently
    charge += (Math.min(1, keysTyped / 12) - charge) * (1 - Math.exp(-dt * 3));
    kick *= Math.exp(-dt * 5);
    f('charge', state === 'typing' || state === 'analyzing' ? charge : charge * 0.2);
    f('kick', kick);
    drone?.lean(charge);

    let layer: Layer = 'room';
    f('flash', 0); f('invert', 0); f('mode', 0); f('zoom', 1); f('offX', 0); f('offY', 0);
    if (show) {
      const m = momentAt(show.plan, clock() - show.t0, show.A.s.arousal);
      moment = m;
      if (m.done) {
        show = null;
        moment = null;
        roomFade = 0;
        toIdle();
      } else {
        layer = m.layer;
        f('lt', m.lt); f('dur', m.dur); f('u', Math.min(1, m.lt / m.dur));
        f('variant', m.variant); f('aborted', m.aborted ? 1 : 0);
        f('flash', m.flash); f('invert', m.invert ? 1 : 0);
        f('mode', m.mode);
        f('zoom', m.zoom); f('offX', m.offX); f('offY', m.offY);
        f('angle', m.angle);
        f('echoOp', m.ops.echo); f('warpOp', m.ops.warp); f('flowOp', m.ops.flow);
        f('seed', (show.A.seed % 100000) + m.variant * 1000);
        if (m.key !== lastKey && layer === 'sand') f('mode', 1); // lay a fresh layer of sand
        if (m.clip === 'chladni') {
          const [mm, nn] = plateMode(show.A, m.seed, m.lt / m.dur);
          f('modeM', mm); f('modeN', nn);
        }
        lastKey = m.key;
        // variant2: which data formation
        f('variant2', layer === 'data' ? (DATA_CLIPS as readonly string[]).indexOf(m.clip ?? '') : 0);
      }
    }
    if (layer === 'room') {
      roomFade = Math.min(1, roomFade + dt / 1.8);
      f('layerFade', roomFade * roomFade);
    }
    const g = GRADE[layer];
    f('bloom', g.bloom); f('halation', g.halation); f('flat', g.flat);
    const wb = show && layer !== 'appraisal' ? whiteBalance(show.A) : [1, 1, 1];
    f('wbR', wb[0]); f('wbG', wb[1]); f('wbB', wb[2]);
    // text and lines are drawn at native resolution; everything soft (and scatter's dots) at CSS resolution
    const hi = layer === 'appraisal' && moment?.mode !== CUT_MODES.indexOf('scatter');
    f('hiRes', hi ? 1 : 0);
    f('resX', hi ? renderer.width : renderer.lowW); f('resY', hi ? renderer.height : renderer.lowH); f('dpr', hi ? renderer.dpr : 1);
    renderer.render(layer, frame.f32, hi);
    for (const h of app.frameHooks) h(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  if (import.meta.env.DEV) {
    const { mountHarness } = await import('./dev/harness.ts');
    mountHarness(app);
    (window as unknown as { __woc: App }).__woc = app;
  }
}

void boot();
