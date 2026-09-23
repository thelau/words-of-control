import { defineConfig, loadEnv, type Plugin } from 'vite';
import { askJev } from './proxy/jev.ts';
import fs from 'node:fs';
import path from 'node:path';

/** Dev-only: lets the harness save/list tuning presets in ./presets. */
function presets(): Plugin {
  const dir = path.resolve(import.meta.dirname, 'presets');
  return {
    name: 'woc-presets',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__presets', (req, res) => {
        fs.mkdirSync(dir, { recursive: true });
        if (req.method === 'GET') {
          const list = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(list));
          return;
        }
        if (req.method === 'POST') {
          const name = decodeURIComponent((req.url ?? '').replace(/^\//, '')).replace(/[^\w\- ]/g, '_');
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', () => {
            JSON.parse(body);
            fs.writeFileSync(path.join(dir, `${name}.json`), body);
            res.end('ok');
          });
          return;
        }
        res.statusCode = 405;
        res.end();
      });
      server.middlewares.use('/presets', (req, res, next) => {
        const f = path.join(dir, decodeURIComponent((req.url ?? '').split('?')[0]));
        if (f.startsWith(dir) && fs.existsSync(f)) {
          res.setHeader('content-type', 'application/json');
          res.end(fs.readFileSync(f));
        } else next();
      });
    },
  };
}

/**
 * Dev-only Jev proxy at /api/jev. Reads TYPESAFE_API_KEY from .env.local —
 * server side only (no VITE_ prefix, so it is never bundled into the page).
 * Bodies are never logged.
 */
function jevProxy(apiKey: string | undefined): Plugin {
  const hits = new Map<string, number[]>();
  return {
    name: 'woc-jev-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/jev', (req, res) => {
        res.setHeader('content-type', 'application/json');
        res.setHeader('cache-control', 'no-store');
        if (req.method !== 'POST') { res.statusCode = 405; res.end('{}'); return; }
        // per-IP rate limit, 30/min
        const ip = req.socket.remoteAddress ?? '?';
        const now = Date.now();
        const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
        if (recent.length >= 30) {
          res.end(JSON.stringify({ ok: false, error: { kind: 'rate_limit', message: 'Proxy limit: 30 per minute.' } }));
          return;
        }
        recent.push(now);
        hits.set(ip, recent);
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', async () => {
          let text: unknown;
          try { text = JSON.parse(body).text; } catch { text = undefined; }
          const result = await askJev(text, apiKey);
          if (!result.ok) console.warn(`[jev] ${result.error.kind} ${result.error.status ?? ''} ${result.error.requestId ?? ''}`);
          res.end(JSON.stringify(result));
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [presets(), jevProxy(loadEnv(mode, import.meta.dirname, '').TYPESAFE_API_KEY)],
  server: { port: 5173 },
  build: { target: 'es2022' },
}));
