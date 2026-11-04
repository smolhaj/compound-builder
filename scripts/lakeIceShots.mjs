/**
 * Lake ice: the bluff lot's lake in summer (open) and in a hard winter (the sim's lakeIce = 'ice'), aerial and eye level with a figure on the shore.
 *   flock $SP/render.lock node scripts/lakeIceShots.mjs --out shots/lakeice [--port 5340]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5340)), outDir = resolve(opt('--out', 'shots/lakeice'));
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(300000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
try {
  await page.goto(`http://localhost:${port}/?lowrender&clean&seed=7&lot=bluff&relief=8&acres=40&region=mountain_west&lotseed=4`);
  await page.waitForFunction(() => window.__cb?.qa?.renderNow, null, { timeout: 300000 });
  const frame = async () => { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(400); };
  // a shore point: the nearest dry ground to the lake within reach of the camp, and the lake's middle
  const spots = await page.evaluate(() => {
    const { world: w } = window.__cb, c = w.camp, ly = w.parcel.lakeY;
    let best = null;
    for (let dx = -60; dx <= 60; dx += 3) for (let dz = -60; dz <= 60; dz += 3) {
      const x = c.x + dx, z = c.z + dz;
      if (w.groundAt(x, z) < ly - 0.6) { const d = Math.hypot(dx, dz); if (!best || d < best.d) best = { x, z, d }; }
    }
    return { lakeY: ly, camp: c, water: best };
  });
  console.error(JSON.stringify(spots));
  const set = async (doy, season) => {
    await page.evaluate(([doy, season]) => {
      const { game, store } = window.__cb, g = structuredClone(game.getState().game);
      g.clock.t = 2 * 365 + (((doy - g.clock.startDoy) % 365) + 365) % 365 + 0.5; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
      game.setState({ game: g }); game.getState().setSpeed(0);
      store.getState().setQuality('low'); store.getState().setTimeOfDay(13); store.getState().setWeatherMode('clear'); store.getState().setSeasonMode(season);
    }, [doy, season]);
    for (let i = 0; i < 40; i++) { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(120); }   // the ice eases in
  };
  const w = spots.water ?? { x: spots.camp.x + 10, z: spots.camp.z + 10 };
  for (const [name, doy, season] of [['summer', 200, 'summer'], ['winter', 20, 'winter']]) {
    await set(doy, season);
    const ice = await page.evaluate(() => { const { world } = window.__cb; return world.lakes.ice; });
    console.error(name, 'ice uniform', ice);
    await page.evaluate(([w]) => { const { cam, world } = window.__cb; cam.target.set(w.x, world.parcel.lakeY, w.z); cam.radius = 70; cam.pitch = 0.7; cam.yaw = 0.6; }, [w]);
    await frame(); await page.screenshot({ path: `${outDir}/lake-${name}-aerial.png` });
    await page.evaluate(([w, c]) => {
      const { cam, world } = window.__cb;
      const dx = c.x - w.x, dz = c.z - w.z, d = Math.hypot(dx, dz) || 1;
      const [fx, fz] = world.openSpotNear(w.x + dx / d * 3, w.z + dz / d * 3, 0.3); world.qaFigure(fx, fz);
      const [ex, ez] = world.openSpotNear(fx + dx / d * 3.0 + dz / d * 1.2, fz + dz / d * 3.0 - dx / d * 1.2, 0.3);
      cam.placeEye(ex, ez, w.x, w.z, 0.3);
    }, [w, spots.camp]);
    await frame(); await page.screenshot({ path: `${outDir}/lake-${name}-eye.png` });
  }
} catch (e) { console.error('ERR', e.message); }
await browser.close(); vite.kill(); process.exit(0);
