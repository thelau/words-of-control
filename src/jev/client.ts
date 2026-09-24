/**
 * One analysis per submission: blocklist → Jev (via proxy) → safety routing.
 * No caching: every submission asks Jev afresh, and nothing typed is kept.
 * `?mock` in the URL uses the offline mock instead.
 */
import { isBlocked } from '../safety/blocklist.ts';
import { route } from '../safety/route.ts';
import { mockAnswers, MOCK_ERROR } from './mock.ts';
import { normalizeInput } from '../core/rng.ts';
import type { Answers, Route } from './types.ts';
import type { JevError } from '../../proxy/jev.ts';

const ENDPOINT = (import.meta.env.VITE_JEV_PROXY as string | undefined) || '/api/jev';
// generous: a slow connection only lengthens the pause before the appraisal (the proxy gives Jev 8 s)
const CLIENT_TIMEOUT_MS = 9000;
/** Temporary failures are asked again once, quietly, before anything is shown. */
const RETRY: ReadonlySet<string> = new Set(['timeout', 'network', 'offline', 'overloaded', 'server']);
const usingMock = () => new URLSearchParams(location.search).has('mock');

type Fetched = { ok: true; answers: Answers } | { ok: false; error: JevError };

async function fetchAnswers(text: string): Promise<Fetched> {
  if (usingMock()) {
    await new Promise((r) => setTimeout(r, 120 + Math.random() * 300));
    if (normalizeInput(text) === MOCK_ERROR) return { ok: false, error: { kind: 'server', status: 500, message: 'Mock error.' } };
    return { ok: true, answers: await mockAnswers(text) };
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), CLIENT_TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: ctl.signal,
      cache: 'no-store',
    });
    const body = await res.json().catch(() => null);
    if (!body || typeof body.ok !== 'boolean') {
      return { ok: false, error: { kind: 'malformed', status: res.status, message: `Proxy answered ${res.status} without a result.` } };
    }
    return body as Fetched;
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError';
    return { ok: false, error: aborted
      ? { kind: 'timeout', message: `No answer within ${CLIENT_TIMEOUT_MS} ms.` }
      : { kind: 'offline', message: `Could not reach the proxy: ${(e as Error)?.message ?? e}` } };
  } finally {
    clearTimeout(timer);
  }
}

export async function analyze(text: string): Promise<Route> {
  if (isBlocked(text)) return { kind: 'barred' };
  let r = await fetchAnswers(text);
  // one quiet second try on a temporary failure (the first call returned no answer, so this is still the one
  // answer this submission gets)
  if (!r.ok && RETRY.has(r.error.kind)) { await new Promise((ok) => setTimeout(ok, 400)); r = await fetchAnswers(text); }
  if (!r.ok) return { kind: 'error', error: r.error };
  const missing = validate(r.answers);
  if (missing) return { kind: 'error', error: { kind: 'malformed', message: `Answer missing or wrong type: ${missing}` } };
  const v = route(r.answers);
  if (v === 'support') return { kind: 'support' };
  if (v === 'barred') return { kind: 'barred' };
  return { kind: 'react', answers: r.answers };
}

const REQUIRED: Record<string, 'choice' | 'score' | 'noul'> = {
  emotion: 'choice', kind: 'choice',
  hardness: 'score', weight: 'score', temperature: 'score', scale: 'score', energy: 'score', intensity: 'score', light: 'score',
  violence: 'noul', loss: 'noul', closeness: 'noul', absurd: 'noul',
  hate: 'noul', insult: 'noul', sexual: 'noul', real_person: 'noul', distress: 'noul',
  shareable: 'score',
};

function validate(a: Answers): string | null {
  for (const [id, type] of Object.entries(REQUIRED)) {
    if (!a?.[id] || a[id].type !== type) return id;
  }
  return null;
}
