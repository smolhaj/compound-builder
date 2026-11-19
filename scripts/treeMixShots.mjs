/**
 * Regional tree mix: eye level with a person and an oblique from above, for each region given.
 *   node scripts/treeMixShots.mjs --out docs/ux/followups/trees [--regions desert,hill_country,plains] [--port 5351] [--q medium] [--creek 0|1]
 * Always ?lowrender (frames drawn on request).
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const out = resolve(opt('--out', 'shots/trees')), regions = opt('--regions', 'desert').split(','), port = Number(opt('--port', 5351)), q = opt('--q', 'medium');
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => /localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, '')) && ok()); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const region of regions) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } }); page.setDefaultTimeout(300000);
    page.on('pageerror', e => console.error('PAGEERROR', e.message));
    await page.goto(`http://localhost:${port}/?lowrender&clean&seed=7&region=${region}`);
    await page.waitForFunction(() => window.__cb?.qa?.renderNow);
    await page.evaluate(q => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setWeatherMode('clear'); store.getState().setSeasonMode('summer'); store.getState().setTimeOfDay(14); store.getState().setQuality(q); }, q);
    const frame = async () => { for (let i = 0; i < 3; i++) { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(250); } };
    await frame();
    const cnt = await page.evaluate(() => { const m = {}; for (const t of window.__cb.world.treeSpecs) m[t.kind] = (m[t.kind] || 0) + 1; return m; });
    console.error(region, JSON.stringify(cnt));
    await page.evaluate(() => { const cb = window.__cb, c = cb.world.camp; cb.world.qaFigure(c.x + 2.2, c.z + 1.2); cb.cam.target.set(c.x, cb.world.groundAt(c.x, c.z) + 0.25, c.z); cb.cam.radius = 5; cb.cam.yaw = 0.6; cb.cam.pitch = 0.12; });
    await frame(); await page.screenshot({ path: `${out}/${region}-eye.png` });
    await page.evaluate(() => { const cb = window.__cb, c = cb.world.camp; cb.cam.radius = 40; cb.cam.pitch = 0.75; cb.cam.target.set(c.x, cb.world.groundAt(c.x, c.z), c.z); });
    await frame(); await page.screenshot({ path: `${out}/${region}-oblique.png` });
    await page.close();
  }
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
