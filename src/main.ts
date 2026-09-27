/**
 * Boot + state machine. Rest/typing show the room (the empty grid); Enter asks Jev once; the answer becomes an
 * appraisal, the appraisal a score (show/grid.ts), and the score is performed — image and sound from one clock —
 * until the cut to black and its reverb have passed. Then the room returns.
 */
import './style.css';
import { Renderer, type SpaceDraw } from './render/gpu.ts';
import { Frame } from './render/frame.ts';
import { Typing } from './input/typing.ts';
import { Display } from './input/display.ts';
import { AudioEngine } from './audio/audio.ts';
import { Drone } from './audio/drone.ts';
import { Keys } from './audio/keys.ts';
import { playPerformance, TAIL } from './audio/score.ts';
import { analyze } from './jev/client.ts';
import { buildAppraisal, type Appraisal } from './jev/appraisal.ts';
import type { Answers } from './jev/types.ts';
import { grid, layout, pack, stage, VIZ, type Grid } from './show/grid.ts';
import { notes } from './show/notes.ts';
import { showCaptions, type Caption } from './captions.ts';
import { camera, type Geometry, type Space } from './show/space.ts';
import type { Samples } from './audio/render.ts';
import { seedFromText } from './core/rng.ts';
import { showSupport, hideSupport } from './support.ts';
import { showNotice, hideNotice } from './notice.ts';

export type State = 'idle' | 'typing' | 'analyzing' | 'performing' | 'barred' | 'support' | 'error';

const query = new URLSearchParams(location.search);

/** A performance in flight: its score, its start on the shared clock. */
/** (`geo`: the spaces, once the prepare worker has built them.) */
export type Show = { id: number; A: Appraisal; g: Grid; geo: Geometry | null; t0: number };
/** What is on screen (the grid's modes, grid.wgsl). */
export type Phase = 'room' | 'wait' | 'grid' | 'black';

export type App = {
  state: () => State;
  /** Perform from Jev answers (harness, tests). */
  perform: (answers: Answers, text: string) => void;
  show: () => Show | null;
  phase: () => Phase;
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
  const display = new Display();

  let audio: AudioEngine | null = null;
  let drone: Drone | null = null;
  let keys: Keys | null = null;
  let state: State = 'idle';
  let show: Show | null = null;
  let phase: Phase = 'room';
  let shows = 0;
  const prepare = new Worker(new URL('./show/prepare.worker.ts', import.meta.url), { type: 'module' });
  /** The spaces' camera block (space.wgsl Cam): view-projection, palette, point size and viewport, time and unrest. */
  const cam = new Float32Array(60);
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

  function perform(answers: Answers, text: string) {
    const A = buildAppraisal(answers, text, seedFromText(text));
    const g = grid(A);
    renderer.setScore(pack(A, g));
    // the spaces' palette: white, then the marked cells' colours
    cam.fill(0);
    cam.set([0.85, 0.85, 0.85, 1], 16);
    g.colours.forEach((c, i) => cam.set([...c, 1], 20 + i * 4));
    ensureAudio();
    state = 'performing';
    display.hideCursor();
    void display.fadeText();
    typing.clear();
    keysTyped = 0;
    // the grid begins as the word finishes fading
    const t0 = clock() + 0.3;
    const id = ++shows;
    show = { id, A, g, geo: null, t0 };
    const steps = audio && drone ? playPerformance(audio, drone, A, g, t0) : null;
    // the spaces and the steps' sound are built off the main thread, while the grid fills
    prepare.onmessage = (e: MessageEvent<{ id: number; geo: Geometry; steps: Samples }>) => {
      if (!show || e.data.id !== show.id) return;
      renderer.setSpaces(e.data.geo);
      show.geo = e.data.geo;
      steps?.(e.data.steps);
    };
    prepare.postMessage({ id, A, g, sr: audio?.ctx.sampleRate ?? 48000 });
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
        // the word stays; a quiet line under it; Enter asks again, typing edits it, Esc lets it go
        state = 'error';
        display.showCursor();
        showNotice(r.error);
        break;
      case 'fallback':
        state = 'error';
        display.hideCursor();
        void display.fadeText();
        typing.clear();
        setTimeout(toIdle, 300);
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
      if (state === 'error') { hideNotice(); state = text ? 'typing' : 'idle'; }
      display.set(text);
      if (!text && state === 'typing') { state = 'idle'; keysTyped = 0; }
    },
    onSubmit: (text) => { hideNotice(); void submit(text); },
    onEscape: () => {
      if (state === 'support') exitSupport();
      if (state === 'error') { hideNotice(); typing.clear(); display.set(''); toIdle(); }
    },
    accepting: () => state === 'idle' || state === 'typing' || state === 'error',
    suspended: () => app.harnessOpen,
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && state === 'support') exitSupport();
  });

  const app: App = {
    state: () => state,
    perform,
    show: () => show,
    phase: () => phase,
    harnessOpen: false,
    frameHooks: new Set(),
    canvas,
    audio: () => audio,
    audioClock: () => clock(),
    gpuMs: () => renderer.gpuMs,
  };

  // ---- frame loop
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    renderer.resize();
    const f = frame.set.bind(frame);
    f('resX', renderer.width); f('resY', renderer.height); f('dpr', renderer.dpr);
    f('time', (now / 1000) % 4096);
    const L = layout(renderer.width, renderer.height);
    f('gridX', L.x); f('gridY', L.y); f('cs', L.cs);

    // typing charges the room, gently
    charge += (Math.min(1, keysTyped / 12) - charge) * (1 - Math.exp(-dt * 3));
    kick *= Math.exp(-dt * 5);
    f('charge', state === 'typing' || state === 'analyzing' ? charge : charge * 0.2);
    f('kick', kick);
    drone?.lean(charge);

    phase = state === 'analyzing' ? 'wait' : 'room';
    let space: SpaceDraw | null = null;
    let caps: Caption[] = [];
    if (show) {
      const t = clock() - show.t0;
      if (t >= show.g.end + TAIL) {
        show = null;
        roomFade = 0;
        toIdle();
      } else {
        phase = t < 0 ? 'wait' : t < show.g.end ? 'grid' : 'black';
        f('lt', Math.max(0, t));
        const st = show.g.steps.find((x) => t >= x.t && t < x.t + x.dur);
        if (st) {
          f('viz', VIZ.indexOf(st.viz)); f('full', st.full ? 1 : 0);
          // a space: its camera for this moment, in the step's rectangle
          if (VIZ.indexOf(st.viz) >= 2 && phase === 'grid' && show.geo) {
            const rect = st.full ? [0, 0, renderer.width, renderer.height] as [number, number, number, number] : stage(renderer.width, renderer.height);
            cam.set(camera(st.viz as Space, st.cam, t - st.t, rect[2] / rect[3], show.A.mood), 0);
            cam.set([1.5 * renderer.dpr, rect[2], rect[3], 0, t, show.A.mood.neg], 52);
            const r = show.geo.ranges[st.viz as Space];
            space = { cam, rect, points: [r[0], r[1]], lines: [r[2], r[3]] };
          }
        }
        f('beatU', ((t - show.g.seq) / show.g.beat) % 1);
        if (phase === 'grid') caps = notes(show.A, show.g, show.geo, t, renderer.width, renderer.height, renderer.dpr,
          space && st ? { viz: st.viz as Space, vp: cam.subarray(0, 16), rect: space.rect } : null);
      }
    }
    if (phase === 'room') roomFade = Math.min(1, roomFade + dt / 1.8);
    f('fade', roomFade * roomFade);
    f('mode', { grid: 0, room: 1, wait: 2, black: 3 }[phase]);
    renderer.render(frame.f32, space);
    showCaptions(caps);
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
