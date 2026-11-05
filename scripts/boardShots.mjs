/**
 * Compound board shots: fresh start, mid-game (roof, well, solar, garden, guards), a crisis; at 1280x800 and phone width.
 *   node scripts/boardShots.mjs [--port 5261] [--out shots/board]
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
const outDir = resolve(opt('--out', 'shots/board'));
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
    const board = async (open) => {
      const is = await page.getByRole('dialog', { name: 'Compound board' }).count();
      if (!!is !== open) await page.getByRole('button', { name: /^Board/ }).first().click();
    };
    await board(true); await shot('1-fresh'); await board(false);
    // mid-game: a roof, a well, solar and a garden finished, two guards
    await page.evaluate(() => { const cb = window.__cb, c = cb.world.camp, G = cb.game.getState();
      for (const [k, dx, dz] of [['timber_cabin', 0, 0], ['well_hand', 8, 0], ['solar_array', 0, 8], ['garden', 8, 8]]) { const sp = cb.tool.findSpot(k, c.x + dx, c.z + dz, 0); if (sp) G.plan(k, sp[0], sp[1], 0); }
      const g = cb.game.getState().game; g.money = 80000;
      for (const st of g.structures) { st.finishedAt = g.clock.t; st.stage = 99; }
      cb.game.getState().hireGuard(); cb.game.getState().hireGuard();
      cb.game.setState({ game: { ...cb.game.getState().game } }); });
    await frames(3);
    await board(true); await shot('2-mid'); await board(false);
    // crisis: a warning, the sick and low spirits, dry taps
    await page.evaluate(() => { const cb = window.__cb; cb.game.getState().trigger('grid_down', 7);
      const g = cb.game.getState().game; g.personState[0].needs.health = 20; g.personState.forEach(p => { p.needs.morale = 28; }); g.utilities.report.shortL = 30;
      cb.game.setState({ game: { ...cb.game.getState().game } }); });
    await frames(3);
    await board(true); await shot('3-crisis');
    await page.close();
  }
} finally { await browser.close(); vite.kill(); }
