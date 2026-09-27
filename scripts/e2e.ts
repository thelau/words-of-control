/**
 * End-to-end check through the real keyboard flow (headless, isolated):
 *   node scripts/e2e.ts [--live]
 * Mock Jev by default (recorded answers); --live makes one real call through
 * the dev proxy (uses TYPESAFE_API_KEY from .env.local, on the server side).
 */
import { openSession } from './lib/headless.ts';

const live = process.argv.includes('--live');
const s = await openSession({ width: 1280, height: 720, dpr: 1 });
const { page } = s;
const errors: string[] = [];
page.on('console', (m) => { if (m.type() === 'error' || /invalid|validation/i.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
const requests: string[] = [];
page.on('request', (r) => { if (!r.url().includes('/@') && !r.url().includes('/src/') && !r.url().includes('node_modules')) requests.push(`${r.method()} ${new URL(r.url()).pathname} ${r.postData() ?? ''}`); });

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};
const W = () => page.evaluate(() => (window as any).__woc.state());
const waitState = (st: string, timeout = 20000) => page.waitForFunction((st) => (window as any).__woc.state() === st, st, { timeout, polling: 50 }).then(() => true, () => false);
const text = () => page.evaluate(() => document.getElementById('text')!.textContent);
const cursorShown = () => page.evaluate(() => getComputedStyle(document.getElementById('cursor')!).display !== 'none');
const typeWord = async (w: string) => { for (const ch of w) await page.keyboard.type(ch, { delay: 60 }); };

await page.goto(`${s.url}${live ? '' : '?mock'}`);
await page.waitForFunction(() => (window as any).__woc, null, { timeout: 30000 });
await page.waitForTimeout(800);
check('boots into the room', (await W()) === 'idle' && (await cursorShown()));

// ---- a word, performed
await typeWord('ocean');
check('typing shows the word', (await text()) === 'ocean' && (await W()) === 'typing');
await page.keyboard.press('Backspace');
await typeWord('n');
check('backspace edits', (await text()) === 'ocean');
await page.keyboard.press('Enter');
check('Enter performs', await waitState('performing', 5000));
const g = await page.evaluate(() => (window as any).__woc.show()?.g);
check('the score has its cells, what matters and its steps', !!g && g.cells.length === 45 && g.keys.length >= 4 && g.steps.length === 25 && g.steps[24].viz === 'stand', g ? `${g.keys.length} matter, ${g.bpm} bpm` : '');
await page.waitForFunction(() => { const w = (window as any).__woc; (window as any).__seen = ((window as any).__seen ?? new Set()).add(w.phase()); return w.state() !== 'performing'; }, null, { timeout: 40000, polling: 40 }).catch(() => {});
const phases = new Set<string>(await page.evaluate(() => [...((window as any).__seen ?? [])]));
check('it passes through the grid and black', phases.has('grid') && phases.has('black'), [...phases].join(', '));
check('then returns to the room with the cursor', (await W()) === 'idle' && (await cursorShown()) && (await text()) === '');

// ---- limit
await typeWord('abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz');
check('60-character limit', ((await text()) ?? '').length === 60);
for (let i = 0; i < 60; i++) await page.keyboard.press('Backspace');
check('backspace to empty returns to idle', (await W()) === 'idle');

// ---- blocklist: instant cut, no Jev request
requests.length = 0;
await typeWord('n1gger');
await page.keyboard.press('Enter');
check('a slur is barred instantly', await waitState('barred', 1000));
check('…without asking Jev', !requests.some((r) => r.includes('/api/jev')));
check('…and the room returns', await waitState('idle', 3000));

if (!live) {
  // ---- routed by Jev's answers (recorded)
  await typeWord('fuck you');
  await page.keyboard.press('Enter');
  check('an insult is barred by the routing', await waitState('barred', 3000));
  await waitState('idle', 3000);

  await typeWord('want to die');
  await page.keyboard.press('Enter');
  check('distress shows support', await waitState('support', 3000) && await page.evaluate(() => !document.getElementById('support')!.hidden));
  check('…with no cursor over it', !(await cursorShown()));
  await page.keyboard.press('Escape');
  check('Esc leaves support', await waitState('idle', 3000));

  await typeWord('errortest');
  await page.keyboard.press('Enter');
  check('an error shows a quiet note under the word', await waitState('error', 3000) && await page.evaluate(() => !document.getElementById('note')!.hidden && (document.getElementById('text')!.textContent ?? '') !== ''));
  await page.keyboard.press('Escape');
  check('Esc lets it go', await waitState('idle', 3000) && await page.evaluate(() => document.getElementById('note')!.hidden));

  await typeWord('fuck');
  await page.keyboard.press('Enter');
  check('profanity alone performs (anger)', await waitState('performing', 8000));
  await waitState('idle', 40000);
} else {
  await typeWord('rain');
  await page.keyboard.press('Enter');
  check('live Jev call performs', await waitState('performing', 5000));
  check('…through the proxy', requests.some((r) => r.startsWith('POST /api/jev')));
  await waitState('idle', 40000);
}

// ---- nothing typed is kept
const stored = await page.evaluate(async () => ({
  local: localStorage.length, session: sessionStorage.length,
  idb: (await (indexedDB.databases?.() ?? Promise.resolve([]))).length, cookies: document.cookie.length,
}));
check('nothing is stored in the browser', stored.local === 0 && stored.session === 0 && stored.idb === 0 && stored.cookies === 0, JSON.stringify(stored));
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await s.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
