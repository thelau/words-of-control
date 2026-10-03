/**
 * Dev harness (dev builds only; backtick toggles). While open, the keyboard
 * and mouse belong to the harness.
 *   click a word = perform its recorded Jev answers
 *   N next word · R replay · C record one performance to WebM
 */
import type { App } from '../main.ts';
import type { Answers } from '../jev/types.ts';
import { startRecording } from './record.ts';

const CSS = `
#harness { position: fixed; top: 0; right: 0; bottom: 0; width: 300px; overflow-y: auto; z-index: 10; cursor: auto;
  background: rgba(12,10,8,.94); color: #d9d2c8; font: 11px/1.5 'IBM Plex Mono', monospace; padding: 10px 12px 40px;
  border-left: 1px solid #2a2622; }
#harness[hidden] { display: none; }
#harness h3 { font-size: 11px; font-weight: 400; color: #8f877c; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: .08em; }
#harness button { background: #1c1916; color: inherit; border: 1px solid #3a342e; font: inherit; padding: 3px 7px; margin: 2px 2px 2px 0; cursor: pointer; }
#harness .info { color: #8f877c; white-space: pre-wrap; margin-top: 8px; }
`;

export async function mountHarness(app: App) {
  const fixtures = (await import('../jev/fixtures.json')).default as unknown as Record<string, Answers>;
  const words = Object.keys(fixtures);
  let idx = -1;
  let lastWord = '';

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'harness';
  root.hidden = true;
  document.body.appendChild(root);
  const info = document.createElement('div');
  info.className = 'info';

  const play = (w: string) => {
    lastWord = w;
    app.perform(fixtures[w], w);
    const s = app.show();
    if (!s) return;
    const { g } = s;
    info.textContent = `“${w}” ${g.bpm} bpm\nmatters: ${g.keys.map((k) => g.cells[k].id).join(', ')}\nsteps: ${g.steps.map((x) => x.viz).join(' ')}\nblack at ${g.end.toFixed(1)}s`;
  };

  const btn = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = fn;
    return b;
  };
  const h = (t: string) => { const e = document.createElement('h3'); e.textContent = t; root.appendChild(e); };
  h('Words (recorded Jev answers)');
  const wl = document.createElement('div');
  words.forEach((w) => wl.appendChild(btn(w, () => play(w))));
  root.appendChild(wl);
  h('Performance');
  root.append(btn('N next', next), btn('R replay', () => lastWord && play(lastWord)), btn('C record', record), info);

  function next() {
    idx = (idx + 1) % words.length;
    play(words[idx]);
  }
  function record() {
    startRecording(app, () => play(lastWord || words[0]));
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === '`') {
      e.preventDefault();
      app.harnessOpen = !app.harnessOpen;
      root.hidden = !app.harnessOpen;
      document.body.style.cursor = app.harnessOpen ? 'auto' : 'none';
      if (!app.harnessOpen) document.getElementById('sink')?.focus();
      return;
    }
    if (!app.harnessOpen) return;
    const k = e.key.toLowerCase();
    if (k === 'n') next();
    else if (k === 'r' && lastWord) play(lastWord);
    else if (k === 'c') record();
  }, true);
}

