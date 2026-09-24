/**
 * When the machine cannot answer, the piece says so in its own voice: one quiet line under the word, in the
 * same type, never a dialog. Temporary failures invite a retry ("press enter"); everything else reads
 * "unavailable". In development a second, fainter line carries the technical cause and the fix, for the
 * artist — a visitor never sees technical text. Nothing typed is shown here or logged.
 */
import type { JevError } from '../proxy/jev.ts';

/** Failures that may pass on their own: the word is kept and Enter asks again. */
export const TRANSIENT: ReadonlySet<JevError['kind']> = new Set(['timeout', 'network', 'offline', 'overloaded', 'rate_limit', 'server']);

const FIX: Partial<Record<JevError['kind'], string>> = {
  no_key: 'no API key · put TYPESAFE_API_KEY in .env.local, restart npm run dev',
  auth: 'key rejected · check TYPESAFE_API_KEY in .env.local',
  credits: 'out of credits · top up at console.typesafe.ai',
  rate_limit: 'rate limit · wait a moment',
  overloaded: 'Jev overloaded · wait a moment',
  validation: 'request rejected · the question battery needs fixing (src/jev/questions.ts)',
  server: 'Jev server error',
  timeout: 'no answer in time',
  network: 'Jev unreachable · check the internet connection',
  offline: 'cannot reach the dev server · is npm run dev running (and is this its port)?',
  malformed: 'unexpected answer from Jev',
  bad_input: 'input refused by the proxy',
};

const el = document.getElementById('note')!;

export function showNotice(err: JevError) {
  const line = TRANSIENT.has(err.kind) ? 'no answer — press enter to try again' : 'unavailable — press enter to try again';
  const detail = import.meta.env.DEV ? [FIX[err.kind] ?? err.kind, err.status, err.requestId].filter(Boolean).join(' · ') : '';
  el.innerHTML = '';
  const a = document.createElement('div');
  a.textContent = line;
  el.appendChild(a);
  if (detail) {
    const b = document.createElement('div');
    b.className = 'detail';
    b.textContent = detail;
    el.appendChild(b);
  }
  el.hidden = false;
}

export function hideNotice() {
  el.hidden = true;
  el.innerHTML = '';
}
