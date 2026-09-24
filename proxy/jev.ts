/**
 * Proxy core, shared by the Vite dev middleware and the production function.
 * Holds the API key server-side; never logs request or response bodies (§1.8).
 */
import { buildRequest } from '../src/jev/questions.ts';

export const JEV_URL = 'https://api.typesafe.ai/v1/systemone';
export const UPSTREAM_TIMEOUT_MS = 8000;

export type JevErrorKind =
  | 'no_key' | 'auth' | 'credits' | 'rate_limit' | 'overloaded' | 'validation'
  // network: the proxy could not reach Jev · offline: the page could not reach the proxy
  | 'server' | 'timeout' | 'network' | 'offline' | 'malformed' | 'bad_input' | 'unknown';

export type JevError = { kind: JevErrorKind; status?: number; message: string; requestId?: string };
export type ProxyResult = { ok: true; answers: unknown; model: string } | { ok: false; error: JevError };

const MAX_CHARS = 256; // input is ≤ 60 graphemes (an emoji can be several code units); this just refuses abuse

function classify(status: number, detail: unknown): JevErrorKind {
  const text = JSON.stringify(detail ?? '').toLowerCase();
  if (/credit|billing|balance|quota|payment|insufficient|funds|top.?up/.test(text) || status === 402) return 'credits';
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status === 529 || status === 503) return 'overloaded';
  if (status === 400 || status === 404 || status === 422) return 'validation';
  if (status >= 500) return 'server';
  return 'unknown';
}

function messageOf(detail: unknown): string | undefined {
  if (!detail) return undefined;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((d) => `${(d?.loc ?? []).join('.')}: ${d?.msg ?? ''}`).join('; ');
  if (typeof detail === 'object') {
    const d = detail as { message?: string; error_type?: string };
    return [d.error_type, d.message].filter(Boolean).join(': ') || JSON.stringify(detail);
  }
  return String(detail);
}

export async function askJev(text: unknown, apiKey: string | undefined): Promise<ProxyResult> {
  if (!apiKey) return { ok: false, error: { kind: 'no_key', message: 'TYPESAFE_API_KEY is not set on the server.' } };
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_CHARS) {
    return { ok: false, error: { kind: 'bad_input', message: 'Text missing or too long.' } };
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), UPSTREAM_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(JEV_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(buildRequest(text.trim())),
      signal: ctl.signal,
    });
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError';
    return { ok: false, error: aborted
      ? { kind: 'timeout', message: `No answer from Jev within ${UPSTREAM_TIMEOUT_MS} ms.` }
      : { kind: 'network', message: `Could not reach Jev: ${(e as Error)?.message ?? e}` } };
  } finally {
    clearTimeout(timer);
  }
  const requestId = res.headers.get('x-typesafe-request-id') ?? undefined;
  let body: { answers?: unknown; model?: string; detail?: unknown } | null = null;
  let raw = '';
  try {
    raw = await res.text();
    body = JSON.parse(raw);
  } catch { /* non-JSON body */ }

  if (!res.ok) {
    const detail = body?.detail ?? raw.slice(0, 300);
    return { ok: false, error: { kind: classify(res.status, detail), status: res.status, message: messageOf(detail) ?? res.statusText, requestId } };
  }
  if (!body?.answers || typeof body.answers !== 'object') {
    return { ok: false, error: { kind: 'malformed', status: res.status, message: 'Response had no answers.', requestId } };
  }
  return { ok: true, answers: body.answers, model: body.model ?? '' };
}
