/**
 * Shared headless setup for perf and capture scripts: a private Vite dev
 * server on a free port + an isolated headless Chromium (never the user's
 * browser) with WebGPU on the real GPU.
 */
import { createServer, type ViteDevServer } from 'vite';
import { chromium, type Browser, type Page } from 'playwright-core';
import path from 'node:path';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve(import.meta.dirname, '../../.cache/ms-playwright');

export type Session = { server: ViteDevServer; browser: Browser; page: Page; url: string; close: () => Promise<void> };

export async function openSession(opts: { width?: number; height?: number; dpr?: number; uncapped?: boolean } = {}): Promise<Session> {
  const server = await createServer({ root: path.resolve(import.meta.dirname, '../..'), server: { port: 0, strictPort: false }, logLevel: 'silent' });
  await server.listen();
  const addr = server.httpServer!.address();
  const url = `http://localhost:${typeof addr === 'object' && addr ? addr.port : 5199}/`;
  const args = ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--enable-webgpu-developer-features']; // unquantised timestamp queries for the perf check
  if (opts.uncapped) args.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
  const browser = await chromium.launch({ headless: true, args });
  const page = await browser.newPage({ viewport: { width: opts.width ?? 1280, height: opts.height ?? 720 }, deviceScaleFactor: opts.dpr ?? 1 });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });
  return { server, browser, page, url, close: async () => { await browser.close(); await server.close(); } };
}

