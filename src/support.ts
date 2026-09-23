/**
 * SUPPORT screen (§5.3). Plain text, no animation, stays until Esc.
 * VERIFY every number and service before any public showing, and localise
 * to where the piece is shown.
 */
const COPY = `
  <div class="inner">
    <p>It sounds like you might be carrying something heavy right now.<br>
    You don't have to deal with it alone.</p>
    <p>Singapore: Samaritans of Singapore (SOS), 24 hours — call <strong>1767</strong><br>
    Elsewhere: <strong>findahelpline.com</strong> lists free, confidential support in your country</p>
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
