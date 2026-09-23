/**
 * Test-stage error popup: every Jev/proxy failure is shown, not swallowed.
 * (In the finished piece these become the silent FALLBACK of §5.4.)
 */
import type { JevError } from '../proxy/jev';

const TITLES: Record<JevError['kind'], string> = {
  no_key: 'No Jev API key',
  auth: 'Jev rejected the API key',
  credits: 'Jev account is out of credits',
  rate_limit: 'Rate limit reached',
  overloaded: 'Jev is overloaded',
  validation: 'Jev rejected the request',
  server: 'Jev server error',
  timeout: 'Jev timed out',
  network: 'Network error',
  malformed: 'Unexpected response from Jev',
  bad_input: 'Input refused by the proxy',
  unknown: 'Jev error',
};

const HINTS: Partial<Record<JevError['kind'], string>> = {
  no_key: 'Put TYPESAFE_API_KEY=… in .env.local at the project root, then restart npm run dev.',
  auth: 'Check TYPESAFE_API_KEY in .env.local (console.typesafe.ai/keys), then restart npm run dev.',
  credits: 'Top up the account at console.typesafe.ai.',
  rate_limit: 'Wait a moment and try again.',
  overloaded: 'Wait a moment and try again.',
  validation: 'The question battery needs fixing (src/jev/questions.ts).',
  timeout: 'Hard limit is 1.5 s. Try again.',
  network: 'Check the connection, and that npm run dev is running.',
};

let el: HTMLDivElement | null = null;

export function showError(err: JevError, onClose: () => void) {
  hideError();
  el = document.createElement('div');
  el.id = 'errpop';
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  el.innerHTML = `
    <div class="box">
      <div class="t">${esc(TITLES[err.kind] ?? 'Error')}</div>
      <div class="m">${esc(err.message)}</div>
      ${HINTS[err.kind] ? `<div class="h">${esc(HINTS[err.kind]!)}</div>` : ''}
      <div class="meta">${esc([err.kind, err.status, err.requestId].filter(Boolean).join(' · '))}</div>
      <div class="k">Enter or Esc to dismiss</div>
    </div>`;
  document.body.appendChild(el);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    window.removeEventListener('keydown', onKey, true);
    hideError();
    onClose();
  };
  window.addEventListener('keydown', onKey, true);
}

function hideError() {
  el?.remove();
  el = null;
}
