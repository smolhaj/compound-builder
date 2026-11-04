/**
 * Starter compound: the proposal as ghosts (aerial), then laid out finished: aerial + eye-level with a scale figure, on a flat lot and a mountain lot.
 *   flock $SP/render.lock node scripts/starterShots.mjs --out shots/starter [--port 5330]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5330)), outDir = resolve(opt('--out', 'shots/starter'));
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const LOTS = { flat: 'lowrender&clean&seed=7', mountain: 'lowrender&clean&seed=7&region=mountain_west&lot=hillside&lotcut&relief=10&acres=40&lotseed=8&elev=2000' };
try {
  for (const [name, q] of Object.entries(LOTS)) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(300000);
    page.on('pageerror', e => console.error('PAGEERROR', e.message));
    await page.goto(`http://localhost:${port}/?${q}`);
    await page.waitForFunction(() => window.__cb?.qa?.renderNow, null, { timeout: 300000 });
    await page.evaluate(() => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality('low'); store.getState().setTimeOfDay(14); store.getState().setWeatherMode('clear'); store.getState().setSeasonMode('summer'); });
    await page.waitForTimeout(1500);
    const frame = async () => { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(350); };
    const shot = async n => { await frame(); await frame(); const f = `${outDir}/${name}-${n}.png`; await page.screenshot({ path: f }); console.error(f); };
    const info = await page.evaluate(async () => {
      const cb = window.__cb, G = cb.game, S = cb.store;
      const g = structuredClone(G.getState().game); g.structures = []; g.money = 600000; G.setState({ game: g });
      const M = await import('/src/sim/starterCompound.ts');
      const st = S.getState(), plan = M.planStarter(G.getState().game, { query: st.siteQuery, geo: st.siteGeo });
      window.__plan = plan;
      st.setStarterPreview(plan);
      return { line: plan.line, pieces: plan.pieces.map(p => `${p.key}:${p.kind}@${p.x.toFixed(1)},${p.z.toFixed(1)}${p.later ? ' LATER ' + p.laterWhy : ''}`), yard: plan.yard && { kind: plan.yard.kind, m: plan.yard.plan.wallM, later: plan.yard.later } };
    });
    console.error(name, JSON.stringify(info, null, 1));
    const home = info.pieces[0].match(/@([\d.-]+),([\d.-]+)/), hx = Number(home[1]), hz = Number(home[2]);
    const look = (r, pitch, yaw, h = 0.3) => page.evaluate(([hx, hz, r, pitch, yaw, h]) => { const { cam, world } = window.__cb; cam.target.set(hx, world.groundAt(hx, hz) + h, hz); cam.radius = r; cam.pitch = pitch; cam.yaw = yaw; }, [hx, hz, r, pitch, yaw, h]);
    await look(16, 0.9, 0.6); await shot('1-preview-aerial');
    // lay it all (finished, for the picture)
    await page.evaluate(() => {
      const cb = window.__cb, G = cb.game, S = cb.store, plan = window.__plan, st = S.getState();
      const n = G.getState().layStarter(plan.pieces.filter(p => !p.later), plan.yard && !plan.yard.later ? plan.yard.plan : null, st.siteGeo);
      st.setStarterPreview(null);
      const g = structuredClone(G.getState().game);
      for (const s of g.structures) { s.stage = 99; s.supplied = true; s.finishedAt = 0; }
      for (const r of g.perimeter) { r.finishedAt = 0; if ('done' in r) r.done = r.hours ?? r.done; }
      G.setState({ game: g }); window.__n = n;
    });
    await page.waitForTimeout(1500);
    await look(16, 0.9, 0.6); await shot('2-laid-aerial');
    await look(8, 0.5, 2.2); await shot('3-laid-mid');
    // eye level with a figure
    await page.evaluate(([hx, hz]) => {
      const { world, cam } = window.__cb;
      const [fx, fz] = world.openSpotNear(hx + 1.3, hz + 1.5, 0.5);
      world.qaFigure(fx, fz);
      const [px, pz] = world.openSpotNear(fx + 1.4, fz + 1.2, 0.4);
      cam.placeEye(px, pz, hx, hz, 0.3);
    }, [hx, hz]);
    await shot('4-eye');
    await page.close();
  }
} catch (e) { console.error('ERR', e.message); }
await browser.close(); vite.kill();
process.exit(0);
