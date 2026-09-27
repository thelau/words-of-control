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
  x: number; y: number; align?: 'tl' | 'bl' | 'br';
  /** A panel wraps at this width (CSS px). */
  width?: number;
  /** An anchor on the data: a dot before it, in this colour. */
  anchor?: string;
};

const root = document.getElementById('captions')!;
const live = new Map<string, { el: HTMLDivElement; state: string }>();
const SHIFT = { tl: '', bl: ' translateY(-100%)', br: ' translate(-100%, -100%)' };

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
    const state = `${c.text}|${Math.round(c.x)}|${Math.round(c.y)}|${c.align}|${c.width}|${c.anchor}`;
    if (state === e.state) continue;
    e.state = state;
    const el = e.el;
    el.className = c.anchor ? 'cap anchor' : c.width ? 'cap panel' : 'cap';
    el.textContent = c.text;
    el.style.transform = `translate(${Math.round(c.x)}px, ${Math.round(c.y)}px)${SHIFT[c.align ?? 'tl']}`;
    el.style.width = c.width ? `${Math.round(c.width)}px` : '';
    el.style.color = c.anchor ?? '';
  }
  for (const [k, e] of live) if (!seen.has(k)) { e.el.remove(); live.delete(k); }
}
