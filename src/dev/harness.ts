/**
 * Tuning harness (§12). Dev builds only; toggled with the backtick key.
 * While open, the keyboard and mouse belong to the harness.
 *
 * Keys (panel open): R replay · N next test word · F freeze · . step · S storyboard · C record
 */
import type { App } from '../main';
import { EMOTIONS, KINDS, type Emotion, type Kind } from '../engine/emotions';
import { SCHEMA, defaultTuning, type NumSpec, type Tuning } from '../engine/tuning';
import { neutralParams, type Params } from '../engine/params';
import { mockAnswers } from '../jev/mock';
import { toParams } from '../jev/mapping';
import { route } from '../safety/route';
import { seedFromText } from '../core/rng';
import { captureStoryboard } from './storyboard';
import { startRecording } from './record';

const TEST_WORDS = ['mother', 'knife', 'almost', 'sorry', 'fire', 'goodbye', 'banana', 'lol', 'asdfgh', 'fuck', 'nothing', 'maybe', 'ocean', 'war', 'mmmm'];
const LS_KEY = 'woc.dev.tuning'; // harness convenience only; never visitor input

const CSS = `
#harness { position: fixed; top: 0; right: 0; bottom: 0; width: 360px; overflow-y: auto; z-index: 10;
  background: rgba(14,12,10,0.94); color: #d9d2c8; font: 11px/1.45 'IBM Plex Mono', monospace; cursor: auto;
  border-left: 1px solid #2a2622; padding: 10px 12px 40px; }
#harness[hidden] { display: none; }
#harness h3 { font-size: 11px; font-weight: 400; color: #8f877c; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: .08em; }
#harness .row { display: grid; grid-template-columns: 118px 1fr 44px; gap: 6px; align-items: center; margin: 2px 0; }
#harness input[type=range] { width: 100%; accent-color: #d9d2c8; }
#harness input[type=number] { width: 44px; background: #1c1916; color: inherit; border: 1px solid #2f2a25; font: inherit; }
#harness button, #harness select { background: #1c1916; color: inherit; border: 1px solid #3a342e; font: inherit; padding: 3px 7px; margin: 2px 2px 2px 0; cursor: pointer; }
#harness button.on { background: #d9d2c8; color: #111; }
#harness details { border-top: 1px solid #231f1b; padding-top: 4px; }
#harness summary { cursor: pointer; color: #b3aa9e; padding: 3px 0; }
#harness .emo { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; }
#harness .info { color: #8f877c; white-space: pre-wrap; }
#harness .fps { position: sticky; top: -10px; background: rgba(14,12,10,.97); padding: 4px 0; color: #8f877c; }
`;

export function mountHarness(app: App, tuning: Tuning) {
  // restore last tuning
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null');
    if (saved) Object.assign(tuning, saved);
  } catch { /* ignore */ }

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'harness';
  root.hidden = true;
  document.body.appendChild(root);

  let params: Params = { ...neutralParams(seedFromText('calm')), weights: { anger: 1 } };
  let lastParams: Params | null = null;
  let wordIdx = -1;
  let forceMode = false;
  let info = '';

  const save = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(tuning)); } catch { /* ignore */ } };

  const fire = (p: Params) => {
    lastParams = p;
    app.fire(p);
  };

  const fireWord = (w: string) => {
    const answers = mockAnswers(w);
    const v = route(answers);
    const p = toParams(answers, seedFromText(w));
    const top = Object.entries(p.weights).map(([e, x]) => `${e} ${(x! * 100).toFixed(0)}%`).join(' · ');
    info = `“${w}” → ${v}\n${top}\nconf ${p.confidence.toFixed(2)}  int ${p.intensity.toFixed(2)}  en ${p.energy.toFixed(2)}  hard ${p.hardness.toFixed(2)}`;
    if (v === 'react') fire(p);
    render();
  };

  // ---------- UI
  function slider(label: string, value: number, min: number, max: number, onInput: (v: number) => void, step?: number) {
    const row = document.createElement('div');
    row.className = 'row';
    const st = step ?? (max - min) / 200;
    row.innerHTML = `<span title="${label}">${label}</span><input type="range" min="${min}" max="${max}" step="${st}" value="${value}"><input type="number" step="${st}" value="${+value.toFixed(3)}">`;
    const [r, nb] = row.querySelectorAll('input');
    r.addEventListener('input', () => { nb.value = String(+(+r.value).toFixed(3)); onInput(+r.value); });
    nb.addEventListener('change', () => { r.value = nb.value; onInput(+nb.value); });
    return row;
  }

  function button(label: string, fn: () => void, on = false) {
    const b = document.createElement('button');
    b.textContent = label;
    if (on) b.className = 'on';
    b.addEventListener('click', fn);
    return b;
  }

  function section(title: string) {
    const h = document.createElement('h3');
    h.textContent = title;
    root.appendChild(h);
  }

  const fpsEl = document.createElement('div');

  function render() {
    root.innerHTML = '';
    fpsEl.className = 'fps';
    root.appendChild(fpsEl);

    section('Reaction');
    const bar = document.createElement('div');
    bar.append(
      button('Fire ⏎', () => fire({ ...params, seed: (Math.random() * 1e7) | 0 })),
      button('Replay R', () => lastParams && fire(lastParams)),
      button('Next word N', nextWord),
      button(app.frozen ? 'Frozen F' : 'Freeze F', () => { app.frozen = !app.frozen; render(); }, app.frozen),
      button('Step .', () => { app.stepOnce = true; }),
      button('Storyboard S', storyboard),
      button('Record C', record),
    );
    root.appendChild(bar);
    const ov = document.createElement('div');
    ov.append(button(forceMode ? 'Typed words use these params ✓' : 'Typed words use mock Jev', () => {
      forceMode = !forceMode;
      app.override.params = forceMode ? params : null;
      render();
    }, forceMode));
    root.appendChild(ov);
    if (info) {
      const i = document.createElement('div');
      i.className = 'info';
      i.textContent = info;
      root.appendChild(i);
    }

    section('Emotion (click = pure, shift-click = add)');
    const emo = document.createElement('div');
    emo.className = 'emo';
    for (const e of EMOTIONS) {
      emo.appendChild(button(e, () => {}, (params.weights[e] ?? 0) > 0));
      emo.lastElementChild!.addEventListener('click', (ev) => {
        const me = ev as MouseEvent;
        if (me.shiftKey) params.weights = { ...params.weights, [e]: (params.weights[e] ?? 0) + 0.5 };
        else params.weights = { [e]: 1 } as Partial<Record<Emotion, number>>;
        const sum = Object.values(params.weights).reduce((a, b) => a + (b ?? 0), 0) || 1;
        params.weights = Object.fromEntries(Object.entries(params.weights).map(([k, v]) => [k, (v ?? 0) / sum]));
        if (forceMode) app.override.params = params;
        render();
      });
    }
    root.appendChild(emo);
    for (const e of EMOTIONS) {
      if (!(params.weights[e] ?? 0)) continue;
      root.appendChild(slider(`w.${e}`, params.weights[e] ?? 0, 0, 1, (v) => { params.weights[e] = v; }));
    }

    section('Modifiers');
    for (const k of ['confidence', 'intensity', 'energy', 'hardness', 'weight', 'temperature', 'scale', 'light'] as const) {
      root.appendChild(slider(k, params[k], 0, 1, (v) => { params[k] = v; }));
    }
    for (const k of ['violence', 'loss', 'closeness', 'absurd'] as const) {
      root.appendChild(slider(`accent.${k}`, params.accents[k], 0, 1, (v) => { params.accents[k] = v; }));
    }
    const kindSel = document.createElement('select');
    kindSel.innerHTML = KINDS.map((k) => `<option ${k === params.kind ? 'selected' : ''}>${k}</option>`).join('');
    kindSel.addEventListener('change', () => { params.kind = kindSel.value as Kind; });
    root.appendChild(kindSel);

    section('Tuning');
    const groups = new Map<string, HTMLElement>();
    for (const s of SCHEMA) {
      let g = groups.get(s.group);
      if (!g) {
        const d = document.createElement('details');
        const active = Object.entries(params.weights).filter(([, w]) => (w ?? 0) > 0).map(([e]) => e);
        if (active.some((e) => s.group === e || s.group === `look:${e}`)) d.open = true;
        d.innerHTML = `<summary>${s.group}</summary>`;
        root.appendChild(d);
        groups.set(s.group, d);
        g = d;
      }
      if ('color' in s) {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `<span>${s.key}</span><input type="color" value="${tuning[s.key]}"><span></span>`;
        row.querySelector('input')!.addEventListener('input', (ev) => {
          tuning[s.key] = (ev.target as HTMLInputElement).value;
          app.field.refresh();
          save();
        });
        g.appendChild(row);
      } else {
        const ns = s as NumSpec;
        g.appendChild(slider(ns.key, tuning[ns.key] as number, ns.min, ns.max, (v) => { tuning[ns.key] = v; app.field.refresh(); save(); }, ns.step));
      }
    }

    section('Presets');
    const pr = document.createElement('div');
    pr.append(
      button('Save', savePreset),
      button('Load…', loadPreset),
      button('Reset to defaults', () => { Object.assign(tuning, defaultTuning()); save(); app.field.refresh(); render(); }),
    );
    root.appendChild(pr);
  }

  // ---------- actions
  function nextWord() {
    wordIdx = (wordIdx + 1) % TEST_WORDS.length;
    fireWord(TEST_WORDS[wordIdx]);
  }

  async function storyboard() {
    const p = lastParams ?? params;
    await captureStoryboard(app, () => fire({ ...p }), p);
  }

  function record() {
    const audio = app.audio();
    const p = lastParams ?? params;
    startRecording(app.renderer.canvas, audio?.record.stream ?? null, () => fire({ ...p }), app);
  }

  async function savePreset() {
    const name = prompt('Preset name', 'untitled');
    if (!name) return;
    const body = JSON.stringify({ name, tuning }, null, 2);
    const res = await fetch(`/__presets/${encodeURIComponent(name)}`, { method: 'POST', body }).catch(() => null);
    if (!res?.ok) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
      a.download = `${name}.json`;
      a.click();
    }
  }

  async function loadPreset() {
    const list: string[] = await fetch('/__presets').then((r) => r.json()).catch(() => []);
    const name = prompt(`Preset to load:\n${list.join('\n')}`, list[0] ?? '');
    if (!name) return;
    const data = await fetch(`/presets/${encodeURIComponent(name)}.json`).then((r) => r.json()).catch(() => null);
    if (!data?.tuning) return;
    Object.assign(tuning, defaultTuning(), data.tuning);
    save();
    app.field.refresh();
    render();
  }

  // ---------- keyboard
  window.addEventListener('keydown', (e) => {
    if (e.key === '`') {
      e.preventDefault();
      app.harnessOpen = !app.harnessOpen;
      root.hidden = !app.harnessOpen;
      document.body.style.cursor = app.harnessOpen ? 'auto' : 'none';
      if (app.harnessOpen) {
        (document.activeElement as HTMLElement | null)?.blur();
        render();
      } else {
        document.getElementById('sink')?.focus();
      }
      return;
    }
    if (!app.harnessOpen) return;
    const tgt = e.target as HTMLElement;
    if (tgt.tagName === 'INPUT' && (tgt as HTMLInputElement).type === 'number') return;
    const k = e.key.toLowerCase();
    if (k === 'r') lastParams && fire(lastParams);
    else if (k === 'n') nextWord();
    else if (k === 'f') { app.frozen = !app.frozen; render(); }
    else if (k === '.') app.stepOnce = true;
    else if (k === 's') void storyboard();
    else if (k === 'c') record();
    else if (k === 'enter') fire({ ...params, seed: (Math.random() * 1e7) | 0 });
  }, true);

  // ---------- fps
  let frames = 0;
  let t0 = performance.now();
  app.frameHooks.add((now) => {
    frames++;
    if (now - t0 > 500) {
      const fps = (frames * 1000) / (now - t0);
      fpsEl.textContent = `${fps.toFixed(0)} fps · ${app.field.count.toLocaleString()} grains · ${app.state()}${app.frozen ? ' · frozen' : ''}`;
      frames = 0;
      t0 = now;
    }
  });
}
