/**
 * HUD declutter shots: the main panels on a fresh Scenario start with a few things staked.
 *   node scripts/declutterShots.mjs [--port 5251] [--out shots/declutter]
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
const port = Number(opt('--port', 5251));
const outDir = resolve(opt('--out', 'shots/declutter'));
mkdirSync(outDir, { recursive: true });

const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => {
  vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); });
  vite.on('exit', c => fail(new Error(`vite exited ${c}`)));
});
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(240000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?lowrender=0.6&seed=7`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await page.evaluate(() => { window.__cb.store.getState().setQuality('low'); window.__cb.game.getState().setSpeed(0); });
  const frames = async (n) => { const f0 = await page.evaluate(() => window.__cb.qa.frames); await page.waitForFunction(k => window.__cb.qa.frames >= k, f0 + n, { polling: 200 }); };
  const shot = async (name) => { await frames(2); await page.screenshot({ path: `${outDir}/${name}.png` }); console.log(name); };
  const tab = async (name) => { await page.getByRole('button', { name: new RegExp(`^${name}`) }).first().click(); };
  // stake a cabin and a garden near the camp, advance a few days
  await page.evaluate(() => { const cb = window.__cb, c = cb.world.camp, G = cb.game.getState();
    for (const [k, dx, dz] of [['timber_cabin', 0, 0], ['garden', 6, 6], ['outhouse', -6, 4]]) { const sp = cb.tool.findSpot(k, c.x + dx, c.z + dz, 0); if (sp) G.plan(k, sp[0], sp[1], 0); }
    G.advance(3); });
  await frames(3);
  await shot('01-build');
  await tab('Projects'); await shot('02-projects');
  await tab('Build');
  await page.evaluate(() => { document.querySelectorAll('*').forEach(() => 0); });
  for (const t of ['Family', 'Supplies', 'Utilities', 'Land', 'Defense']) { await tab(t); await shot(`03-${t.toLowerCase()}`); }
  await tab('Supplies'); await page.getByRole('button', { name: /^Farm/ }).first().click(); await shot('04-farm');
  await page.getByRole('button', { name: /^Shop & money/ }).click(); await shot('05-shop');
} finally { await browser.close(); vite.kill(); }
