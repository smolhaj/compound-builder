/**
 * Household bonds shots: the Family tab's "Close to each other" rows and the chronicle lines, at 1280x800 and phone width.
 *   node scripts/bondShots.mjs [--port 5262] [--out shots/bonds]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5262));
const outDir = resolve(opt('--out', 'shots/bonds'));
mkdirSync(outDir, { recursive: true });

const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => {
  vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); });
  vite.on('exit', c => fail(new Error(`vite exited ${c}`)));
});
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const [tag, vp] of [['desk', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport: vp });
    page.setDefaultTimeout(240000);
    page.on('pageerror', e => console.error('pageerror:', e.message));
    await page.goto(`http://localhost:${port}/?lowrender=0.6&seed=7`);
    await page.waitForFunction(() => window.__cb?.qa?.lowrender);
    await page.evaluate(() => { window.__cb.store.getState().setQuality('low'); window.__cb.game.getState().setSpeed(0); });
    const frames = async (n) => { const f0 = await page.evaluate(() => window.__cb.qa.frames); await page.waitForFunction(k => window.__cb.qa.frames >= k, f0 + n, { polling: 200 }); };
    const shot = async (name) => { await frames(2); await page.screenshot({ path: `${outDir}/${tag}-${name}.png` }); console.log(tag, name); };
    // two joiners who became friends, a mentor, a rival pair, and their chronicle lines
    await page.evaluate(() => { const cb = window.__cb, g = cb.game.getState().game;
      const [a, b, c, d] = g.people;
      g.bonds = { day: 0, said: { year: 2027, n: 4 }, pairs: {
        [[a.id, c.id].sort().join('|')]: { warm: 62, strife: 0, mentor: 0, tag: 'friend', since: 0 },
        [[b.id, d.id].sort().join('|')]: { warm: 10, strife: 0, mentor: 40, guide: b.id, tag: 'mentor', since: 0 },
        [[a.id, d.id].sort().join('|')]: { warm: 0, strife: 55, mentor: 0, tag: 'rival', since: 0 },
      } };
      for (const text of [`${a.first} and ${c.first} have grown close over the long winter.`, `${b.first} has taken ${d.first} under their wing, showing them the trade.`, `${b.first} took a round holding the line while ${d.first} waited below. ${d.first} asked after ${b.first} every hour.`]) g.lineage.chronicle.push({ t: g.clock.t, year: 2027, kind: 'bond', text });
      cb.game.setState({ game: { ...cb.game.getState().game } }); });
    await frames(3);
    if (tag === 'phone') { await page.getByRole('button', { name: /^Show panels/ }).click(); await page.getByRole('button', { name: /^Family/ }).first().click(); }
    await page.getByText('Close to each other').first().scrollIntoViewIfNeeded();
    await shot('1-family');
    await page.getByRole('button', { name: /^Years/ }).first().click();
    await page.getByText('Chronicle').first().scrollIntoViewIfNeeded();
    await shot('2-years');
    await page.close();
  }
} finally { await browser.close(); vite.kill(); }
