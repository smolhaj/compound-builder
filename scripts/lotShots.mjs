/**
 * Lot archetypes: an aerial and an eye-level shot (with a person) for each kind.
 *   flock $SP/render.lock node scripts/lotShots.mjs --out shots/lots [--port 5301] [--kinds ridge,bench,...] [--region mountain_west] [--acres 40] [--relief 8] [--outlier] [--look misty|overcast|drizzle|dusk]
 * (--look: a lighting / weather preset, scripts/lookPresets.mjs; the frames are then drawn at --q medium|high, since Low has no fog)
 * Always ?lowrender (drawn on request).
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
const port = Number(opt('--port', 5301)), outDir = resolve(opt('--out', 'shots/lots'));
const kinds = opt('--kinds', 'ridge,hillside,bench,gorge,mesa,saddle,bluff,island').split(',');
const region = opt('--region', 'mountain_west'), acres = opt('--acres', '40'), relief = opt('--relief', '8'), lotseed = opt('--lotseed', '3');
const outlier = args.includes('--outlier'), tod = Number(opt('--tod', 15)), look = opt('--look', null), lookQ = opt('--q', 'medium');
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(240000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('console', m.text().slice(0, 200)); });
try {
  for (const kind of kinds) {
    const q = `lowrender&clean&seed=7&lot=${kind}&relief=${relief}&acres=${acres}&region=${region}&lotseed=${lotseed}${outlier ? '&outlier' : ''}${kind === 'hillside' ? '&lotcreek' : ''}`;
    await page.goto(`http://localhost:${port}/?${q}`);
    await page.waitForFunction(() => window.__cb?.qa?.renderNow, null, { timeout: 240000 });
    await page.evaluate(([t]) => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality('low'); store.getState().setTimeOfDay(t); }, [tod]);
    if (look) await applyLook(page, look);
    await page.waitForTimeout(1500);
    const shot = async name => { await page.evaluate(([look, q]) => (look ? window.__cb.qa.renderFull(q) : window.__cb.qa.renderNow()), [look, lookQ]); await page.waitForTimeout(300); const f = `${outDir}/${kind}-${name}.png`; await page.screenshot({ path: f }); console.log(f); };
    const info = await page.evaluate(() => { const { world, cam } = window.__cb, h = world.home, s = world.parcel.lot; return { camp: world.camp, home: h, hasLot: !!s }; });
    console.log(kind, JSON.stringify(info));
    // aerial: over the home rect
    await page.evaluate(() => { const { world, cam } = window.__cb, h = world.home, cx = (h.x0 + h.x1) / 2, cz = (h.z0 + h.z1) / 2; cam.target.set(cx, world.groundAt(cx, cz), cz); cam.radius = Math.max(h.x1 - h.x0, h.z1 - h.z0) * 0.95 + 18; cam.pitch = 0.78; cam.yaw = 0.5; });
    await shot('aerial');
    // eye level at the camp with a person
    await page.evaluate(() => {
      const { world, cam } = window.__cb, c = world.camp;
      const ps = world.family.positions(); const p = ps[0] ?? { x: c.x, z: c.z };
      const lx = p.x, lz = p.z;
      const [ex, ez] = world.openSpotNear(lx - 2.6, lz + 1.4, 0.8);
      cam.placeEye(ex, ez, lx, lz, 0.45);
    });
    await shot('eye');
    // a side view from the low side (the cross-section)
    await page.evaluate(() => { const { world, cam } = window.__cb, h = world.home, cx = (h.x0 + h.x1) / 2, cz = (h.z0 + h.z1) / 2; cam.target.set(cx, world.groundAt(cx, cz), cz); cam.radius = Math.max(h.x1 - h.x0, h.z1 - h.z0) * 0.9 + 14; cam.pitch = 0.28; cam.yaw = 0.9; });
    await shot('side');
  }
} catch (e) { console.error('ERR', e.message); }
await browser.close(); vite.kill();
process.exit(0);
