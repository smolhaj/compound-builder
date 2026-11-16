/**
 * The physical shocks on the HUD (WP6): a quake hits a staked compound, the panel shows the goal chain, gauges, decision cards and the crews' wait.
 *   node scripts/physicalShots.mjs [--kind mega_quake] [--port 5979] [--out shots/physical]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5979)), kind = opt('--kind', 'mega_quake'), outDir = resolve(opt('--out', 'shots/physical'));
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error(`vite exited ${c}`))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7&lowrender`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  await page.evaluate(async (kind) => {
    const G = window.__cb.game, cb = window.__cb;
    const { FX } = await import('/src/sim/disasterFx.ts'), { effectsDay } = await import('/src/sim/effects.ts');
    const g = structuredClone(G.getState().game);
    g.disaster.kind = kind; g.disaster.hitAt = g.clock.t - 1; g.disaster.warnAt = g.clock.t - 3; g.disaster.phase = 'impact'; g.disaster.variant = g.disaster.variant || '';
    g.money = 40000;
    for (const [i, k] of ['timber_cabin', 'stone_house', 'workshop'].entries()) g.structures.push({ id: 'p' + i, kind: k, x: g.site.home.x0 + 4 + i * 5, z: g.site.home.z0 + 6, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
    FX[kind].onHit?.(g);
    for (let d = 0; d < 3; d++) { g.clock.t = g.disaster.hitAt + d + 0.5; effectsDay(g); }
    G.setState({ game: g });
  }, kind);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/${kind}_hud.png` });
  console.log(`${outDir}/${kind}_hud.png`);
  // the Land tab holds Paperwork and the physical panel
  await page.getByText('Land', { exact: true }).first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outDir}/${kind}_land.png` });
  console.log(`${outDir}/${kind}_land.png`);
} finally { await browser.close(); vite.kill(); }
