/**
 * SUPPORT screen (§5.3). Plain text, no animation, stays until Esc.
 * Global: one directory of free, confidential helplines for every country (no single country's number).
 * VERIFY the service before any public showing.
 */
const COPY = `
  <div class="inner">
    <p>It sounds like you might be carrying something heavy right now.<br>
    You don't have to deal with it alone.</p>
    <p><strong>findahelpline.com</strong> lists free, confidential support in your country.</p>
    <p class="esc">Press Esc to go back.</p>
  </div>`;

export function showSupport() {
  const el = document.getElementById('support')!;
  el.innerHTML = COPY;
  el.hidden = false;
}

export function hideSupport() {
  const el = document.getElementById('support')!;
  el.hidden = true;
  el.innerHTML = '';
}
