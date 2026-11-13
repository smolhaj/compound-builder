/**
 * Water QA: eye level at the water's edge (with a person) and from above, per time of day / season / weather / quality.
 *   flock /tmp/cb.lock node scripts/waterShots.mjs --out DIR --jobs case:season:weather:q:h1|h2,... [--only aerial|eye]
 *   cases: creek (pnw), creekmw, lake (bluff), river (bench), island
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const CASES = {
  creek: '?lowrender&clean&seed=7&region=pnw',
  creekmw: '?lowrender&clean&seed=7&region=mountain_west',
  lake: '?lowrender&clean&seed=7&lot=bluff&relief=8&acres=40&region=mountain_west&lotseed=4',
  river: '?lowrender&clean&seed=7&lot=bench&relief=6&acres=40&region=appalachia&lotseed=3',
  island: '?lowrender&clean&seed=7&lot=island&relief=6&acres=40&region=midwest&lotseed=3',
};
const port = Number(opt('--port', 5350)), outDir = resolve(opt('--out', 'shots/water')), only = opt('--only', '');
const jobs = opt('--jobs', 'creek:summer:clear:high:13').split(',').map(j => { const [kase, season, weather, q, hs] = j.split(':'); return { kase, season, weather, q, hours: hs.split('|').map(Number) }; });
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
page.setDefaultTimeout(300000);
page.on('crash', () => console.error('PAGE CRASHED'));
page.on('console', m => { if (m.type() === 'error') console.error('console', m.text().slice(0, 300)); });
page.on('pageerror', e => console.error('PAGEERROR', e.message));
const T0 = Date.now();
const frame = async (n = 2) => { for (let i = 0; i < n; i++) { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(150); } };
try {
  let lastCase = null;
  for (const J of jobs) {
    if (J.kase !== lastCase) {
      lastCase = J.kase;
      await page.goto(`http://localhost:${port}/${CASES[J.kase]}`);
      await page.waitForFunction(() => window.__cb?.qa?.renderNow, null, { timeout: 300000 });
    }
    const tag = `${J.kase}-${J.season}-${J.weather}-${J.q}`;
    await page.evaluate(([q, season, weather]) => { const { store, game } = window.__cb; game.getState().setSpeed(0); const s = store.getState(); s.setQuality(q); s.setWeatherMode(weather); s.setSeasonMode(season); }, [J.q, J.season, J.weather]);
    const spot = await page.evaluate(() => {
      const { world: w } = window.__cb, c = w.camp;
      const wet = (x, z) => w.stream.depthAt(x, z) > 0.05 || (w.parcel.lakeY != null && w.groundAt(x, z) < w.parcel.lakeY - 0.3);
      let best = null;
      for (let dx = -80; dx <= 80; dx += 2) for (let dz = -80; dz <= 80; dz += 2) {
        const x = c.x + dx, z = c.z + dz;
        if (!wet(x, z)) continue;
        const d = Math.hypot(dx, dz);
        if (!best || d < best.d) best = { x, z, d };
      }
      return { camp: { x: c.x, z: c.z }, water: best, lakeY: w.parcel.lakeY };
    });
    console.error(tag, JSON.stringify(spot));
    const w = spot.water ?? { x: spot.camp.x + 8, z: spot.camp.z + 8 };
    for (const h of J.hours) {
      await page.evaluate((h) => window.__cb.store.getState().setTimeOfDay(h), h);
      await frame(3);
      if (only !== 'eye') {
        await page.evaluate(([w]) => { const { cam } = window.__cb; cam.target.set(w.x, 0, w.z); cam.radius = 40; cam.pitch = 0.75; cam.yaw = 0.6; }, [w]);
        await frame(); await page.screenshot({ path: `${outDir}/${tag}-h${h}-aerial.png` });
      }
      if (only !== 'aerial') {
        await page.evaluate(([w, c]) => {
          const { cam, world } = window.__cb;
          const dx = c.x - w.x, dz = c.z - w.z, d = Math.hypot(dx, dz) || 1;
          const [fx, fz] = world.openSpotNear(w.x + dx / d * 0.7, w.z + dz / d * 0.7, 0.2); world.qaFigure(fx, fz);
          const [ex, ez] = world.openSpotNear(fx + dx / d * 1.0 + dz / d * 0.55, fz + dz / d * 1.0 - dx / d * 0.55, 0.2);
          cam.placeEye(ex, ez, w.x - dz / d * 0.5, w.z + dx / d * 0.5, 0.3);
        }, [w, spot.camp]);
        await frame(); await page.screenshot({ path: `${outDir}/${tag}-h${h}-eye.png` });
      }
      console.error('done', tag, h, Math.round((Date.now() - T0) / 1000) + 's');
    }
  }
} catch (e) { console.error('ERR', e.message); }
await browser.close(); vite.kill(); process.exit(0);
