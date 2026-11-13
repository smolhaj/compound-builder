/**
 * Warm lit interiors (oasis): per home kind, at dusk and at night, an exterior eye-level shot with a person for scale,
 * a close shot through the front window, a cutaway from above, and a view from inside, plus the same home with the
 * compound's sense of safety low (lamps dim, the fire sunk).
 *   flock /tmp/cb.lock node scripts/oasisInteriorShots.mjs --out /tmp/claude-0/oasis/interiors [--port 5330] [--kinds cottage,timber_cabin,log_house,stone_house,farmhouse] [--views dusk,night,win,cut,in,low] [--days 900]
 * Always ?lowrender (drawn on request). Each home is placed finished next to the camp; its lamps are forced on (qa.lamp) so the
 * shot does not depend on who is awake; `--days` sets how long the family has lived there (sets the decor tier).
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5330)), outDir = resolve(opt('--out', '/tmp/claude-0/oasis/interiors'));
const kinds = opt('--kinds', 'cottage,timber_cabin,log_house,stone_house,farmhouse').split(',');
const views = opt('--views', 'dusk,night,win,cut,in,low').split(',');
const days = Number(opt('--days', 900)), season = opt('--season', 'autumn'), lamp = opt('--lamp', 'oil');
mkdirSync(outDir, { recursive: true });
// where to stand inside and what to look at, per kind (the home's own frame, x across, z toward the front)
const INSIDE = {
  cottage: { eye: [0.32, 0.62], at: [-0.2, 0.1] }, guest_house: { eye: [0.3, 0.3], at: [-0.2, 0.05] },
  timber_cabin: { eye: [-0.1, 0.5], at: [0.26, -0.45] },
  farmhouse: { eye: [0.35, 0.55], at: [-0.4, -0.05] },
  log_house: { eye: [0.3, 0.45], at: [-0.4, -0.7] },
  stone_house: { eye: [0.0, 0.55], at: [-0.4, -0.2] },
  timber_frame: { eye: [0.3, 0.3], at: [-0.3, -0.5] },
};
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(300000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('console', m.text().slice(0, 300)); });
const frame = async (n = 1) => { for (let i = 0; i < n; i++) { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(350); } };
try {
  await page.goto(`http://localhost:${port}/?lowrender&clean&seed=7`);
  await page.waitForFunction(() => window.__cb?.qa?.renderNow, null, { timeout: 300000 });
  await page.evaluate(([season, lamp]) => { const { game, store, world } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality('low'); store.getState().setTimeOfDay(19); store.getState().setWeatherMode('clear'); store.getState().setSeasonMode(season); world.atmos.qa.lamp = lamp; }, [season, lamp]);
  await page.waitForTimeout(1500);
  for (const kind of kinds) {
    const info = await page.evaluate(async ([kind, days]) => {
      const cb = window.__cb, G = cb.game, w = cb.world, c = w.camp;
      const g = structuredClone(G.getState().game);
      g.structures = [];
      g.clock.t = days + 150.45; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
      G.setState({ game: g });
      const K = await import('/src/game/buildkit/kit.ts');
      const sp = cb.tool.findSpot(kind, c.x, c.z, 0, 24);
      if (!sp) return { ok: false, why: 'no spot' };
      const cur = structuredClone(G.getState().game);
      cur.structures.push({ id: 'q1', kind, x: sp[0], z: sp[1], rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
      G.setState({ game: cur });
      return { ok: true, spot: sp, cells: [K.KIT[kind].cellsX, K.KIT[kind].cellsZ] };
    }, [kind, days]);
    console.error(kind, JSON.stringify(info));
    if (!info.ok) continue;
    await frame(4);
    await page.evaluate(() => window.__cb.store.getState().setBuildingView('full'));
    const geo = await page.evaluate(() => { const w = window.__cb.world, st = window.__cb.game.getState().game.structures[0]; return { x: st.x, z: st.z, gy: w.groundAt(st.x, st.z) }; });
    const tod = t => page.evaluate(([t]) => window.__cb.store.getState().setTimeOfDay(t), [t]);
    const warm = k => page.evaluate(([k]) => { window.__cb.world.atmos.warmth = k; }, [k]);
    const shot = async name => { await frame(2); const f = `${outDir}/${kind}-${name}.png`; await page.screenshot({ path: f }); console.error(f); };
    const look = (r, pitch, yawA, h = 0.25, dx = 0, dz = 0) => page.evaluate(([x, z, gy, r, pitch, yawA, h, dx, dz]) => { const { cam } = window.__cb; cam.target.set(x + dx, gy + h, z + dz); cam.radius = r; cam.pitch = pitch; cam.yaw = yawA; }, [geo.x, geo.z, geo.gy, r, pitch, yawA, h, dx, dz]);
    // a person for scale on the lawn in front, the eye behind them
    const eye = async (dist, side, h, towardY = 0) => page.evaluate(([dist, side, h]) => {
      const cb = window.__cb, w = cb.world, st = cb.game.getState().game.structures[0];
      const [fx, fz] = w.openSpotNear(st.x + side * 0.5, st.z + 2.3, 0.4);
      w.qaFigure(fx, fz);
      const [px, pz] = w.openSpotNear(st.x + side * 1.4, st.z + 2.3 + dist, 0.4);
      cb.cam.placeEye(px, pz, st.x + side * 0.2, st.z, h);
    }, [dist, side, h]);
    await warm(1);
    if (views.includes('dusk')) { await tod(19.3); await eye(2.2, -1, 0.26); await shot('dusk'); }
    if (views.includes('night')) { await tod(22); await eye(2.2, -1, 0.26); await shot('night'); }
    if (views.includes('win')) {
      await tod(22);
      await page.evaluate(() => { const cb = window.__cb, w = cb.world, st = cb.game.getState().game.structures[0]; const [px, pz] = w.openSpotNear(st.x + 0.9, st.z + 1.7, 0.2); cb.cam.placeEye(px, pz, st.x - 0.1, st.z, 0.3); });
      await shot('window');
    }
    if (views.includes('cut')) {
      await tod(22);
      await page.evaluate(() => window.__cb.store.getState().setBuildingView('cutaway'));
      await look(5.2, 1.05, 0.5, 0.2); await shot('cut');
      await page.evaluate(() => window.__cb.store.getState().setBuildingView('full'));
    }
    if (views.includes('in')) {
      await tod(22);
      await page.evaluate(() => window.__cb.store.getState().setBuildingView('cutaway'));
      const p = INSIDE[kind] ?? INSIDE.cottage;
      await page.evaluate(async ([p, floorEye]) => {
        const cb = window.__cb, K = await import('/src/game/buildkit/kit.ts'), st = cb.game.getState().game.structures[0];
        const [ex, ez] = K.rotQ(p.eye[0], p.eye[1], st.rot), [tx, tz] = K.rotQ(p.at[0], p.at[1], st.rot);
        cb.cam.placeEye(st.x + ex, st.z + ez, st.x + tx, st.z + tz, floorEye);
      }, [p, 0.3]);
      await shot('inside');
      await page.evaluate(() => window.__cb.store.getState().setBuildingView('full'));
    }
    if (views.includes('low')) {
      await tod(22);
      await warm(0.15);
      await eye(2.2, -1, 0.26); await shot('low-out');
      const p = INSIDE[kind] ?? INSIDE.cottage;
      await page.evaluate(async ([p, floorEye]) => {
        const cb = window.__cb, K = await import('/src/game/buildkit/kit.ts'), st = cb.game.getState().game.structures[0];
        const [ex, ez] = K.rotQ(p.eye[0], p.eye[1], st.rot), [tx, tz] = K.rotQ(p.at[0], p.at[1], st.rot);
        cb.cam.placeEye(st.x + ex, st.z + ez, st.x + tx, st.z + tz, floorEye);
      }, [p, 0.36]);
      await shot('low-in');
      await warm(1);
    }
  }
} catch (e) { console.error('ERR', e.message); }
await browser.close(); vite.kill();
process.exit(0);
