/**
 * UI screenshots (HUD included, unlike shots.mjs which reads the canvas):
 *
 *   node scripts/uiShots.mjs [--port 5231] [--out shots/ui]
 *
 * The new-game screen, then a Scenario run (grid-down, short peacetime)
 * advanced into the warning signs and past the hit.
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
const port = Number(opt('--port', 5231));
const outDir = resolve(opt('--out', 'shots/ui'));
const kind = opt('--kind', 'grid_down');
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
  await page.goto(`http://localhost:${port}/?new`);
  await page.waitForFunction(() => window.__cb, null, { timeout: 60000 });
  await page.evaluate(() => window.__cb.store.getState().setQuality('low'));
  const frames = async (n) => { const f0 = await page.evaluate(() => window.__cb.qa.frames); await page.waitForFunction(k => window.__cb.qa.frames >= k, f0 + n, { polling: 200 }); };
  await frames(4);
  await page.screenshot({ path: `${outDir}/01-new-game.png` });
  console.log('01');
  // Scenario: pick it, then start
  await page.getByText('Scenario', { exact: true }).click();
  await page.locator('select').first().selectOption(kind);
  await page.getByText('1 year').click();
  await page.screenshot({ path: `${outDir}/02-new-game-scenario.png` });
  await page.getByText('Start', { exact: true }).click();
  // into the warning signs
  await page.evaluate(() => { const G = window.__cb.game; G.getState().setSpeed(0); const d = G.getState().game.disaster; G.getState().advance(d.hitAt - 3 - G.getState().game.clock.t); });
  await frames(4);
  await page.screenshot({ path: `${outDir}/03-warning-signs.png` });
  console.log('03');
  // past the hit, three weeks on
  await page.evaluate(() => { const G = window.__cb.game; const d = G.getState().game.disaster; G.getState().advance(d.hitAt + 21 - G.getState().game.clock.t); });
  await frames(4);
  await page.screenshot({ path: `${outDir}/04-three-weeks-after.png` });
  console.log('04');
  // on until someone comes to the gate
  await page.evaluate(() => { const G = window.__cb.game; for (let i = 0; i < 200 && !G.getState().game.gate.pending; i++) G.getState().advance(1); });
  await frames(4);
  await page.screenshot({ path: `${outDir}/05-at-the-gate.png` });
  console.log('05');
  await page.evaluate(() => { const G = window.__cb.game; const e = G.getState().game.gate.pending; if (e) G.getState().answer(e.stances[0]); });
  await frames(3);
  await page.screenshot({ path: `${outDir}/06-what-happened.png` });
  console.log('06');
} finally {
  await browser.close();
  vite.kill();
  setTimeout(() => process.exit(0), 200);
}
