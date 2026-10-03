/**
 * Captions: small, factual lines over the image saying what each moment shows — what was measured, what matters,
 * what a space is and where the word stands in it. DOM text (crisp at any size), placed by main.ts each frame; an
 * element is touched only when its text or place changes. Nothing typed is kept: the word appears here only while
 * its performance lasts, and every caption is removed when it ends.
 */
export type Caption = {
  /** Stable per role ("head", "panel", "a3"…): the same element is reused while it lasts. */
  key: string; text: string;
  /** CSS px; `align`: which corner of the text sits there. */
  x: number; y: number; align?: 'tl' | 'bl' | 'br' | 'c';
  /** An anchor on the data (a dot before it). */
  anchor?: boolean;
  colour?: string;
  /** Larger type (the last step). */
  size?: 'big' | 'mid' | 'tiny';
  /** A hairline this wide (CSS px), instead of text; or a vertical one this tall. */
  rule?: number;
  vline?: number;
  /** A larger dot (the word, among the others). */
  me?: boolean;
  /** Font size (CSS px), over the class's. */
  px?: number;
};

const root = document.getElementById('captions')!;
const live = new Map<string, { el: HTMLDivElement; state: string }>();
const SHIFT = { tl: '', bl: ' translateY(-100%)', br: ' translate(-100%, -100%)', c: ' translate(-50%, -50%)' };

export function showCaptions(items: Caption[]) {
  const seen = new Set<string>();
  for (const c of items) {
    seen.add(c.key);
    let e = live.get(c.key);
    if (!e) {
      const el = document.createElement('div');
      root.appendChild(el);
      e = { el, state: '' };
      live.set(c.key, e);
    }
    const state = `${c.text}|${Math.round(c.x)}|${Math.round(c.y)}|${c.align}|${c.anchor}|${c.colour}|${c.size}|${c.rule}|${c.vline}|${c.me}|${c.px}`;
    if (state === e.state) continue;
    e.state = state;
    const el = e.el;
    el.className = ['cap', c.anchor && 'anchor', c.me && 'me', (c.rule || c.vline) && 'rule', c.size].filter(Boolean).join(' ');
    el.textContent = c.text;
    el.style.transform = `translate(${Math.round(c.x)}px, ${Math.round(c.y)}px)${SHIFT[c.align ?? 'tl']}`;
    el.style.color = c.colour ?? '';
    el.style.width = c.rule ? `${Math.round(c.rule)}px` : c.vline ? '1px' : '';
    el.style.height = c.vline ? `${Math.round(c.vline)}px` : '';
    el.style.fontSize = c.px ? `${Math.round(c.px)}px` : '';
  }
  for (const [k, e] of live) if (!seen.has(k)) { e.el.remove(); live.delete(k); }
}
