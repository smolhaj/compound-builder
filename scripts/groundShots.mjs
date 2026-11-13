// Ground-cover shots: aerial, eye level beside a standing person, and a low camp view, per region and season.
//   flock /tmp/cb.lock node scripts/groundShots.mjs --out /tmp/claude-0/gfx/ground/after --combos plains:flat,desert:flat --seasons summer [--nocover] [--q high] [--shots aerial,eye,camp]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5391)), out = opt('--out', '/tmp/claude-0/gfx/ground/after'); mkdirSync(out, { recursive: true });
const combos = opt('--combos', 'plains:flat').split(',').map(c => c.split(':'));
const seasons = opt('--seasons', 'summer').split(',');
const shots = opt('--shots', 'aerial,eye,camp').split(',');
const qual = opt('--q', 'high'), noCover = args.includes('--nocover');
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 680 } });
page.setDefaultTimeout(300000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text().slice(0, 200)); });
try {
  for (const [region, kind, seed = '3'] of combos) {
    await page.goto(`http://localhost:${port}/?clean&seed=7&region=${region}&lot=${kind}&relief=8&acres=40&lotseed=${seed}&lotcreek&elev=${({ mountain_west: 2000, appalachia: 600, pnw: 500, north_woods: 400 })[region] ?? 300}${noCover ? '&nocover' : ''}`);
    await page.waitForFunction(() => window.__cb?.world, null, { timeout: 300000 });
    await page.evaluate(q => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality(q); store.getState().setTimeOfDay(14); }, qual);
    await page.waitForTimeout(3000);
    for (const season of seasons) {
      await page.evaluate(s => { const st = window.__cb.store.getState(); st.setSeasonMode?.(s); st.setWeatherMode?.('clear'); }, season);
      await page.waitForTimeout(2500);
      const name = `${region}-${kind}-${season}`;
      const shot = async n => {
        // a few frames for the cover to follow the new camera
        await page.waitForTimeout(2500);
        const f = `${out}/${name}-${n}.png`; await page.screenshot({ path: f });
        const c = await page.evaluate(() => window.__cb.world.cover?.counts); console.log(f, JSON.stringify(c));
      };
      if (shots.includes('aerial')) {
        await page.evaluate(() => { const { world, cam } = window.__cb, h = world.home, cx = (h.x0 + h.x1) / 2, cz = (h.z0 + h.z1) / 2; cam.target.set(cx, world.groundAt(cx, cz), cz); cam.radius = 30; cam.pitch = 0.8; cam.yaw = 0.6; });
        await shot('aerial');
      }
      if (shots.includes('eye')) {
        await page.evaluate(() => { const { world, cam } = window.__cb, c = world.camp; const p = world.family.positions()[0] ?? { x: c.x, z: c.z }; const [ex, ez] = world.openSpotNear(p.x - 2.6, p.z + 1.4, 0.8); cam.placeEye(ex, ez, p.x, p.z, 0.45); });
        await shot('eye');
      }
      if (shots.includes('camp')) {
        await page.evaluate(() => { const { world, cam } = window.__cb, c = world.camp; cam.placeEye(c.x + 1.6, c.z + 1.6, c.x, c.z, 0.35); });
        await shot('camp');
      }
      if (shots.includes('grass')) {
        await page.evaluate(() => { const { world, cam } = window.__cb, c = world.camp; const [ex, ez] = world.openSpotNear(c.x + 7, c.z + 5, 1); cam.placeEye(ex, ez, ex - 5, ez - 3, 0.2); });
        await shot('grass');
      }
    }
  }
} catch (e) { console.error('ERR', e.message); }
await browser.close(); vite.kill(); process.exit(0);
