/**
 * Boot + state machine (§2).
 */
import './style.css';
import { Renderer } from './render/gpu';
import { Field, FIXED_DT, makeParticles } from './engine/field';
import { defaultTuning } from './engine/tuning';
import type { Params } from './engine/params';
import { Typing } from './input/typing';
import { Display } from './input/display';
import { AudioEngine } from './audio/audio';
import { Drone } from './audio/drone';
import { Keys } from './audio/keys';
import { analyze } from './jev/client';
import { toParams } from './jev/mapping';
import { seedFromText } from './core/rng';
import { showSupport, hideSupport } from './support';
import { showError } from './errorPopup';

export type State = 'idle' | 'typing' | 'analyzing' | 'reacting' | 'returning' | 'barred' | 'support' | 'fallback';

const query = new URLSearchParams(location.search);
const COUNT = Number(query.get('n')) || 1000000;

export type App = {
  field: Field;
  renderer: Renderer;
  state: () => State;
  /** Start a reaction directly from Params (harness, mock). */
  fire: (p: Params) => void;
  /** Force params for the next typed submission (harness). */
  override: { params: Params | null };
  harnessOpen: boolean;
  frozen: boolean;
  stepOnce: boolean;
  /** Called after each drawn frame, in the same task (canvas readable). */
  frameHooks: Set<(now: number) => void>;
  audio: () => AudioEngine | null;
};

async function boot() {
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  if (!(await Renderer.supported())) {
    document.body.insertAdjacentHTML('beforeend', '<div id="nogpu">WebGPU is required.</div>');
    return;
  }
  const sessionSeed = (Math.random() * 2 ** 31) >>> 0;
  const tuning = defaultTuning();
  const field = new Field(tuning, COUNT, sessionSeed);
  const renderer = new Renderer(canvas, COUNT);
  await renderer.init(makeParticles(COUNT, sessionSeed));

  const display = new Display();
  let audio: AudioEngine | null = null;
  let drone: Drone | null = null;
  let keys: Keys | null = null;
  let state: State = 'idle';
  const set = (s: State) => { state = s; };

  const app: App = {
    field, renderer,
    state: () => state,
    fire: (p) => react(p),
    override: { params: null },
    harnessOpen: false,
    frozen: false,
    stepOnce: false,
    frameHooks: new Set(),
    audio: () => audio,
  };

  const accepting = () => state === 'idle' || state === 'typing';

  function ensureAudio() {
    if (audio) return audio.resume();
    audio = new AudioEngine();
    drone = new Drone(audio);
    keys = new Keys(audio);
    audio.resume();
    drone.fadeIn(5);
  }

  function react(p: Params) {
    ensureAudio();
    set('reacting');
    display.hideCursor();
    void display.fadeText();
    typing.clear();
    field.start(p);
    const w = p.weights;
    drone?.remember({
      rough: Math.min(1, 0.5 + (w.anger ?? 0) * 0.5 + (w.anxiety ?? 0) * 0.35 + (w.fear ?? 0) * 0.25),
      width: Math.min(1, 0.5 + (w.awe ?? 0) * 0.5 + (p.scale - 0.5) * 0.4),
      bright: p.light,
    });
  }

  function toIdle() {
    set('idle');
    field.clearCharge();
    field.holdCharge = false;
    display.showCursor();
    typing.focus();
  }

  async function submit(text: string) {
    set('analyzing');
    display.hold();
    field.holdCharge = true;
    const forced = app.override.params;
    const r = forced ? { kind: 'react' as const, answers: null } : await analyze(text);
    if (state !== 'analyzing') return;
    switch (r.kind) {
      case 'react':
        react(forced ? { ...forced, seed: seedFromText(text) } : toParams(r.answers!, seedFromText(text)));
        break;
      case 'barred':
        set('barred');
        display.cutText();
        typing.clear();
        field.clearCharge();
        field.holdCharge = false;
        display.hideCursor();
        setTimeout(toIdle, 600);
        break;
      case 'fallback':
        set('fallback');
        display.hideCursor();
        await display.fadeText();
        typing.clear();
        setTimeout(toIdle, 300);
        break;
      case 'support':
        enterSupport();
        break;
      case 'error':
        // test stage: surface every Jev failure (becomes silent FALLBACK later)
        set('fallback');
        display.hideCursor();
        void display.fadeText();
        typing.clear();
        field.clearCharge();
        field.holdCharge = false;
        showError(r.error, toIdle);
        break;
    }
  }

  function enterSupport() {
    set('support');
    typing.clear();
    display.hideAll(true);
    field.clearCharge();
    field.holdCharge = false;
    field.fadeAllTarget = 1;
    drone?.fadeOut(2);
    showSupport();
  }

  function exitSupport() {
    hideSupport();
    display.hideAll(false);
    field.fadeAllTarget = 0;
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
    onKey: (kind) => {
      keys?.click(kind === 'backspace');
      field.keystroke(kind === 'backspace');
      display.wake();
      if (state === 'idle') {
        set('typing');
        field.holdCharge = true;
      }
    },
    onLimit: () => keys?.limit(),
    onChange: (text) => {
      display.set(text);
      if (!text && state === 'typing') {
        set('idle');
        field.clearCharge();
        field.holdCharge = false;
      }
    },
    onSubmit: (text) => void submit(text),
    onEscape: () => { if (state === 'support') exitSupport(); },
    accepting,
    suspended: () => app.harnessOpen,
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && state === 'support') exitSupport();
  });

  // ---- frame loop: fixed-step simulation, one draw per display frame
  let last = performance.now();
  let acc = 0;
  let lastSnap = field.step(0, { w: renderer.width, h: renderer.height, dpr: renderer.dpr, mw: renderer.matterW, mh: renderer.matterH });
  const loop = (now: number) => {
    const frameDt = Math.min(0.1, (now - last) / 1000);
    last = now;
    renderer.resize();
    renderer.setBloomRadius(tuning.bloomRadius as number);
    renderer.setMatterScale(tuning.matterScale as number);
    const vp = { w: renderer.width, h: renderer.height, dpr: renderer.dpr, mw: renderer.matterW, mh: renderer.matterH };
    const steps: Float32Array[] = [];
    if (!app.frozen) {
      acc += frameDt;
      field.frameDt = frameDt;
    } else if (app.stepOnce) {
      acc = FIXED_DT * 2;
      field.frameDt = FIXED_DT * 2;
      app.stepOnce = false;
    }
    while (acc >= FIXED_DT && steps.length < 4) {
      steps.push(field.step(FIXED_DT, vp, steps.length === 0));
      acc -= FIXED_DT;
    }
    if (acc > FIXED_DT * 4) acc = 0;
    if (steps.length) lastSnap = steps[steps.length - 1];
    renderer.frame(steps, lastSnap, field.decayFor(field.frameDt), steps.length > 0);

    if (state === 'reacting' && field.phase === 'returning') set('returning');
    if ((state === 'reacting' || state === 'returning') && field.phase === 'idle') toIdle();
    for (const h of app.frameHooks) h(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  if (import.meta.env.DEV) {
    const { mountHarness } = await import('./dev/harness');
    mountHarness(app, tuning);
    (window as unknown as { __woc: App }).__woc = app;
  }
}

void boot();
