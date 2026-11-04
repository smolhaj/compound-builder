/**
 * Visual QA sweep: aerial + eye-level (with a person) for region x lot combos, at medium quality.
 *   node scripts/vqaShots.mjs --out shots/vqa [--port 5321] [--combos mountain_west:ridge,plains:-] [--look clear|dusk|...] [--season winter] [--tod 15]
 * A combo "region:-" is the region's classic ground (no lot). Always ?lowrender, frames lifted with renderFull('medium').
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { applyLook } from './lookPresets.mjs';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5321)), outDir = resolve(opt('--out', 'shots/vqa'));
const combos = opt('--combos', '').split(',').filter(Boolean).map(c => c.split(':'));
const ELEV = { mountain_west: 2000, appalachia: 600, pnw: 500, north_woods: 400 };   // each region's listings sit at their own altitude (sim/lots ALT_RANGE); the 2000 m default is above the tree line of the green regions
const tod = Number(opt('--tod', 14)), look = opt('--look', 'clear'), season = opt('--season', null), relief = opt('--relief', '8'), acres = opt('--acres', '40');
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
page.setDefaultTimeout(300000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
try {
  for (const [region, kind] of combos) {
    const name = `${region}-${kind === '-' ? 'classic' : kind}`;
    const q = `lowrender&clean&seed=7&region=${region}` + (kind === '-' ? '' : `&lot=${kind}&relief=${relief}&acres=${acres}&lotseed=3&elev=${opt('--elev', ELEV[region] ?? 2000)}${kind === 'hillside' ? '&lotcreek' : ''}`);
    await page.goto(`http://localhost:${port}/?${q}`);
    await page.waitForFunction(() => window.__cb?.qa?.renderNow, null, { timeout: 300000 });
    await page.evaluate(() => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality('medium'); });
    await applyLook(page, look, { tod, ...(season ? { season } : {}) });
    await page.waitForTimeout(1200);
    const shot = async n => { await page.evaluate(() => window.__cb.qa.renderFull('medium')); await page.waitForTimeout(200); const f = `${outDir}/${name}-${n}.png`; await page.screenshot({ path: f }); console.log(f); };
    await page.evaluate(() => { const { world, cam } = window.__cb, h = world.home, cx = (h.x0 + h.x1) / 2, cz = (h.z0 + h.z1) / 2; cam.target.set(cx, world.groundAt(cx, cz), cz); cam.radius = Math.max(h.x1 - h.x0, h.z1 - h.z0) * 0.95 + 18; cam.pitch = 0.78; cam.yaw = 0.5; });
    await shot('aerial');
    await page.evaluate(() => { const { world, cam } = window.__cb, c = world.camp; const p = world.family.positions()[0] ?? { x: c.x, z: c.z }; const [ex, ez] = world.openSpotNear(p.x - 2.6, p.z + 1.4, 0.8); cam.placeEye(ex, ez, p.x, p.z, 0.45); });
    await shot('eye');
  }
} catch (e) { console.error('ERR', e.message); }
await browser.close(); vite.kill();
process.exit(0);
