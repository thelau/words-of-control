/**
 * Keyboard input (§3). A hidden textarea receives keystrokes so IME and every
 * script work; we mirror its value into the centred line. The limit counts
 * graphemes, not UTF-16 units.
 */


/** A short sentence, still one line (graphemes, not code units). */
export const LIMIT = 60;

const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const graphemes = (s: string) => [...seg.segment(s)].map((x) => x.segment);

export type TypingEvents = {
  onFirstKey: () => void;
  onKey: (kind: 'char' | 'backspace', code: string) => void;
  onLimit: () => void;
  onChange: (text: string) => void;
  onSubmit: (text: string) => void;
  onEscape: () => void;
  /** return false to swallow input (analyzing, reacting, …) */
  accepting: () => boolean;
  /** true while the dev harness owns the keyboard */
  suspended: () => boolean;
};

export class Typing {
  private sink: HTMLTextAreaElement;
  private value = '';
  private started = false;
  private composing = false;
  /** How this word is being typed — in memory only, cleared with the word. */

  private ev: TypingEvents;

  constructor(ev: TypingEvents) {
    this.ev = ev;
    this.sink = document.getElementById('sink') as HTMLTextAreaElement;
    const s = this.sink;
    s.addEventListener('keydown', (e) => this.keydown(e));
    s.addEventListener('input', () => this.input());
    s.addEventListener('compositionstart', () => (this.composing = true));
    s.addEventListener('compositionend', () => { this.composing = false; this.input(); });
    s.addEventListener('blur', () => { if (!this.ev.suspended()) setTimeout(() => this.focus(), 0); });
    window.addEventListener('keydown', (e) => { if (document.activeElement !== s && !this.ev.suspended()) { this.focus(); this.keydown(e); } });
    this.focus();
  }

  focus() {
    this.sink.focus({ preventScroll: true });
  }

  get text() {
    return this.value;
  }

  clear() {
    this.value = '';
    this.sink.value = '';
    this.ev.onChange('');
  }

  private keydown(e: KeyboardEvent) {
    if (this.ev.suspended()) return;
    if (!this.started) {
      this.started = true;
      this.ev.onFirstKey();
    }
    if (e.key === 'Escape') {
      this.ev.onEscape();
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      // allow paste; block everything else (reload is still available via the browser)
      if (e.key.toLowerCase() !== 'v') e.preventDefault();
      if (!this.ev.accepting()) e.preventDefault();
      return;
    }
    if (!this.ev.accepting()) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (this.composing || e.isComposing) return;
      const t = this.value.trim();
      if (t) this.ev.onSubmit(t);
      return;
    }
    if (e.key === 'Backspace') {
      if (this.value.length) {
        this.ev.onKey('backspace', e.code);
      }
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      return;
    }
    if (e.key.length === 1 || e.isComposing || e.key === 'Process') {
      if (!e.isComposing && e.key !== 'Process' && graphemes(this.value).length >= LIMIT) {
        e.preventDefault();
        this.ev.onLimit();
        return;
      }
      this.ev.onKey('char', e.code || e.key);
    }
  }

  private input() {
    if (!this.ev.accepting()) {
      this.sink.value = this.value;
      return;
    }
    let v = this.sink.value.replace(/[\r\n]+/g, ' ');
    const g = graphemes(v);
    if (g.length > LIMIT && !this.composing) {
      v = g.slice(0, LIMIT).join('');
      this.ev.onLimit();
    }
    if (v !== this.sink.value) this.sink.value = v;
    this.value = v;
    this.ev.onChange(v);
  }
}
