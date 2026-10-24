/**
 * UI tour: the three new-game steps, then the HUD's tabs (left: build,
 * projects, log; right: family, supplies, utilities, land, outside).
 *   node scripts/uiTour.mjs [--port 5261] [--out shots/uitour]
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
const port = Number(opt('--port', 5261));
const outDir = resolve(opt('--out', 'shots/uitour'));
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => {
  vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); });
  vite.on('exit', c => fail(new Error(`vite exited ${c}`)));
});
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let n = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.setDefaultTimeout(240000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('console error:', m.text()); });
  await page.goto(`http://localhost:${port}/?new&seed=7`);
  await page.waitForFunction(() => window.__cb, null, { timeout: 120000 });
  await page.evaluate(() => window.__cb.store.getState().setQuality('low'));
  const frames = async (k) => { const f0 = await page.evaluate(() => window.__cb.qa.frames); await page.waitForFunction(x => window.__cb.qa.frames >= x, f0 + k, { polling: 200 }); };
  const shot = async (name) => { await frames(3); const f = `${outDir}/${String(++n).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: f }); console.log(f); };
  await shot('setup-region');
  await page.getByRole('button', { name: 'Next' }).click();
  await shot('setup-land');
  await page.getByRole('button', { name: 'Creek', exact: true }).click();
  await shot('setup-land-filtered');
  await page.getByRole('button', { name: 'Next' }).click();
  await shot('setup-play');
  await page.getByRole('button', { name: 'Buy it and start' }).click();
  await page.waitForFunction(() => window.__cb, null, { timeout: 120000 });
  await frames(8);
  await page.evaluate(() => window.__cb.game.getState().setSpeed(0));
  await shot('hud-build-family');
  for (const t of ['Supplies', 'Utilities', 'Land', 'Outside']) {
    await page.getByRole('button', { name: new RegExp(`^${t}`) }).click();
    await shot(`hud-${t.toLowerCase()}`);
  }
  await page.getByRole('button', { name: /^Projects/ }).click();
  await shot('hud-projects');
  await page.getByRole('button', { name: /^Log/ }).click();
  await shot('hud-log');
} finally {
  await browser.close();
  vite.kill();
  setTimeout(() => process.exit(0), 200);
}
