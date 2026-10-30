/**
 * Micro-hydro and wind turbine shots (docs/DECISIONS.md "Micro-hydro and wind"): the turbine house on the creek bank with its penstock and intake weir,
 * and the 5 kW turbine on its tower, each from the air and at eye level with a person.
 *   flock $SP/render.lock node scripts/renewableShots.mjs --out shots/renewables [--port 5440] [--lot 'region=...'] [--probe] [--q medium|high]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5440)), outDir = resolve(opt('--out', 'shots/renewables')), q = opt('--q', 'medium');
const LOT = opt('--lot', 'region=mountain_west&lot=gorge&relief=9&acres=40&lotseed=2&elev=1600');
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(300000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('console', m.text().slice(0, 300)); });
try {
  await page.goto(`http://localhost:${port}/?lowrender=0.75&clean&seed=7&${LOT}`);
  await page.waitForFunction(() => window.__cb?.qa?.renderNow);
  await page.evaluate(() => { const { game, store } = window.__cb; window.__cb.qa.weather = true; game.getState().setSpeed(0); store.getState().setWeatherMode('clear'); store.getState().setSeasonMode('summer'); });
  await page.waitForTimeout(1200);
  const layout = await page.evaluate(async () => {
    const cb = window.__cb, G = cb.game, w = cb.world, R = await import('/src/sim/renewables.ts');
    const g0 = G.getState().game, home = g0.site.home;
    // the best turbine-house spot: on the bank, enough head, buildable
    let best = null;
    for (let x = home.x0 + 4; x < home.x1; x += 1) for (const side of [-1, 1]) for (const off of [3, 5, 7]) {
      const z = w.parcel.creek.zAt(x) + side * off;
      if (R.hydroProblem(g0, x, z)) continue;
      const site = R.hydroSiteAt(g0, x, z);
      const spot = cb.tool.findSpot('micro_hydro', x, z, 0, 3);
      if (!spot) continue;
      if (!best || site.netM > best.netM) best = { x: spot[0], z: spot[1], netM: site.netM, side };
    }
    // the most exposed buildable ground for the turbine
    let wind = null;
    for (let x = home.x0 + 4; x < home.x1 - 4; x += 3) for (let z = home.z0 + 4; z < home.z1 - 4; z += 3) {
      const spot = cb.tool.findSpot('wind_turbine', x, z, 0, 1.5);
      if (!spot) continue;
      const e = R.windExposure(g0, spot[0], spot[1]);
      if (!wind || e > wind.e) wind = { x: spot[0], z: spot[1], e };
    }
    return { best, wind, creek: g0.site.creek };
  });
  console.log(JSON.stringify(layout));
  if (args.includes('--probe') || !layout.best) { await browser.close(); vite.kill(); process.exit(0); }
  await page.evaluate(({ best, wind }) => {
    const cb = window.__cb, G = cb.game, g = structuredClone(G.getState().game);
    g.structures = [];
    const fin = (id, kind, x, z, rot = 0) => g.structures.push({ id, kind, x, z, rot, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    fin('hy', 'micro_hydro', best.x, best.z, best.side > 0 ? 2 : 0);
    fin('gd', 'garden', best.x + 2.2, best.z + best.side * 1.6);
    if (wind) fin('wt', 'wind_turbine', wind.x, wind.z);
    G.setState({ game: g });
  }, layout);
  for (let i = 0; i < 3; i++) { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(300); }
  const settle = async () => { for (let i = 0; i < 4; i++) { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(150); } };
  const shot = async name => { await settle(); await page.evaluate(q => window.__cb.qa.renderFull(q), q); await page.waitForTimeout(300); const f = `${outDir}/${name}.png`; await page.screenshot({ path: f }); console.log(f); };
  const orbit = (at, r, pitch, yaw, lift = 0.3) => page.evaluate(([at, r, pitch, yaw, lift]) => { const { world, cam } = window.__cb; cam.target.set(at[0], world.groundAt(at[0], at[1]) + lift, at[1]); cam.radius = r; cam.pitch = pitch; cam.yaw = yaw; }, [at, r, pitch, yaw, lift]);
  const hy = [layout.best.x, layout.best.z];
  await orbit(hy, 22, 0.6, 0.6, 0.2);
  await shot('hydro-1-aerial');
  await orbit(hy, 6, 0.3, -0.7, 0.3);
  await shot('hydro-2-house');
  // eye level with a person: the family works the garden beside the house
  await page.evaluate(() => {
    const cb = window.__cb, G = cb.game, w = cb.world, g = structuredClone(G.getState().game);
    g.personState.forEach(ps => { ps.task = 'garden'; ps.target = null; });
    G.setState({ game: g });
    for (let i = 0; i < 900; i++) w.updatePeople(0.1, G.getState().game, 10, 1);
  });
  await page.evaluate(([ox, oz]) => {
    const { world, cam } = window.__cb;
    const ps = world.family.positions().filter(p => Math.hypot(p.x - ox, p.z - oz) < 12);
    ps.sort((a, b) => Math.hypot(a.x - ox, a.z - oz) - Math.hypot(b.x - ox, b.z - oz));
    const p = ps[0] ?? world.family.positions()[0];
    const [cx, cz] = world.openSpotNear(ox - 3.2, oz + 1.5, 0.3);
    cam.placeEye(cx, cz, (ox + p.x) / 2, (oz + p.z) / 2, 0.4);
  }, hy);
  await shot('hydro-3-eye-person');
  if (layout.wind) {
    const wt = [layout.wind.x, layout.wind.z];
    await orbit(wt, 16, 0.35, 0.5, 1.2);
    await shot('wind-1-tower');
    await orbit(wt, 40, 0.7, 0.9, 0.5);
    await shot('wind-2-aerial');
    await page.evaluate(([ox, oz]) => {
      const { world, cam } = window.__cb, G = window.__cb.game;
      const g = structuredClone(G.getState().game);
      g.personState.forEach(ps => { ps.task = 'garden'; ps.target = null; });
      G.setState({ game: g });
      const [cx, cz] = world.openSpotNear(ox - 4, oz + 3, 0.3);
      cam.placeEye(cx, cz, ox, oz, 2.6);
    }, wt);
    await shot('wind-3-eye');
  }
} catch (e) { console.error('ERR', e.message); }
await browser.close(); vite.kill();
process.exit(0);
