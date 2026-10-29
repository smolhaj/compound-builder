/**
 * Housing styles: an aerial, an eye-level (with a scale figure) and a cutaway shot of each style on a flat lot, or one on the hillside lot.
 *   flock $SP/render.lock node scripts/housingStyleShots.mjs --out shots/housing [--port 5320] [--kinds lodge,stone_house,...] [--lot flat|hill] [--region mountain_west] [--views aerial,eye,cut,side,night]
 * Always ?lowrender (drawn on request). Places each kind finished (stage 99) next to the camp; the lodge needs the hillside lot.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5320)), outDir = resolve(opt('--out', 'shots/housing'));
const kinds = opt('--kinds', 'stone_house,timber_frame,container_house,adobe_house,log_house').split(',');
const lot = opt('--lot', 'flat'), region = opt('--region', ''), views = opt('--views', 'aerial,eye,cut').split(','), tod = Number(opt('--tod', 14));
const hatchAt = opt('--hatch', ''); let rot = Number(opt('--rot', 0)); const yaw = Number(opt('--yaw', 0.6)), shiftX = Number(opt('--sx', 0)), shiftZ = Number(opt('--sz', 0));
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(300000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('console', m.text().slice(0, 300)); });
const HILL = 'region=pnw&lot=hillside&lotcut&relief=9&acres=40&lotseed=8&elev=600';
const q = `lowrender&clean&seed=7${lot === 'hill' ? '&' + HILL : region ? '&region=' + region : ''}`;
try {
  await page.goto(`http://localhost:${port}/?${q}`);
  await page.waitForFunction(() => window.__cb?.qa?.renderNow, null, { timeout: 300000 });
  await page.evaluate(([t]) => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality('low'); store.getState().setTimeOfDay(t); store.getState().setWeatherMode('clear'); store.getState().setSeasonMode('summer'); }, [tod]);
  await page.waitForTimeout(1500);
  const frame = async () => { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(350); };
  for (const kind of kinds) {
    // clear the lot, then place the one house finished, close to the camp
    const info = await page.evaluate(async ([kind, rot, lot, shiftX, shiftZ, hatch]) => {
      const cb = window.__cb, G = cb.game, w = cb.world, c = w.camp;
      const g = structuredClone(G.getState().game);
      g.structures = [];
      g.clock.t = 2 * 365 + 150.45; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
      G.setState({ game: g });
      const K = await import('/src/game/buildkit/kit.ts');
      const def = K.KIT[kind];
      if (!def) return { ok: false, why: 'no such kit piece ' + kind };
      // a walkout lodge needs a slope falling away behind it: try the four turns and keep the spot nearest the camp
      let best = null;
      for (const r of def.walkoutFall ? [0, 1, 2, 3] : [rot]) {
        const sp = cb.tool.findSpot(kind, c.x + shiftX, c.z + shiftZ, r, def.walkoutFall ? 40 : 24);
        if (sp) { const d = Math.hypot(sp[0] - c.x - shiftX, sp[1] - c.z - shiftZ); if (!best || d < best.d) best = { sp, r, d }; }
      }
      if (!best) return { ok: false, why: 'no spot' };
      const spot = best.sp;
      const cur = structuredClone(G.getState().game);
      cur.structures.push({ id: 'q1', kind, x: spot[0], z: spot[1], rot: best.r, stage: 99, done: 0, supplied: true, finishedAt: 0 });
      if (hatch) {
        // a floor hatch inside the body at local (lx, lz) from the middle, turned with the house
        const [lx, lz] = hatch.split(',').map(Number), [wx, wz] = K.rotQ(lx, lz, best.r);
        const sn = K.snapCenter(K.KIT.bunker_floorhatch, spot[0] + wx, spot[1] + wz, 0);
        cur.structures.push({ id: 'q2', kind: 'bunker_floorhatch', x: sn[0], z: sn[1], rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
      }
      G.setState({ game: cur });
      return { ok: true, spot, rot: best.r, cells: [def.cellsX, def.cellsZ], floorY: def.floorY };
    }, [kind, rot, lot, shiftX, shiftZ, hatchAt]);
    console.error(kind, JSON.stringify(info));
    if (!info.ok) continue;
    rot = info.rot;
    for (let i = 0; i < 4; i++) await frame();
    await page.evaluate(() => window.__cb.store.getState().setBuildingView('full'));
    const geo = await page.evaluate(([kind]) => {
      const w = window.__cb.world, st = window.__cb.game.getState().game.structures[0], K = w; void K;
      return { x: st.x, z: st.z, gy: w.groundAt(st.x, st.z) };
    }, [kind]);
    const look = (r, pitch, yawA, h = 0.25, dx = 0, dz = 0) => page.evaluate(([x, z, gy, r, pitch, yawA, h, dx, dz]) => { const { cam } = window.__cb; cam.target.set(x + dx, gy + h, z + dz); cam.radius = r; cam.pitch = pitch; cam.yaw = yawA; }, [geo.x, geo.z, geo.gy, r, pitch, yawA, h, dx, dz]);
    const shot = async name => { await frame(); const f = `${outDir}/${kind}-${name}.png`; await page.screenshot({ path: f }); console.error(f); };
    if (views.includes('aerial')) { await look(9, 0.85, yaw, 0.3); await shot('aerial'); }
    if (views.includes('side')) { await look(7, 0.3, yaw + 1.2, 0.5); await shot('side'); }
    if (views.includes('eye')) {
      // a scale figure on the ground in front, the camera at eye height looking at the house
      await page.evaluate(([kind, rot]) => {
        const cb = window.__cb, w = cb.world, st = cb.game.getState().game.structures[0], K = w;
        void K;
        const a = rot * Math.PI / 2, fx = st.x + Math.sin(a) * 2.2 + Math.cos(a) * 0.6, fz = st.z + Math.cos(a) * 2.2 - Math.sin(a) * 0.6;
        const [ex, ez] = w.openSpotNear(fx, fz, 0.5);
        w.qaFigure(ex, ez);
        window.__fig = [ex, ez];
      }, [kind, rot]);
      await page.evaluate(([yawEye]) => {
        const { cam, world } = window.__cb, [fx, fz] = window.__fig, st = window.__cb.game.getState().game.structures[0];
        const dx = st.x - fx, dz = st.z - fz, d = Math.hypot(dx, dz) || 1;
        // stand back from the figure, on the line from the house through the figure, offset a little to the side
        const ex = fx - dx / d * 2.4 + dz / d * 1.1, ez = fz - dz / d * 2.4 - dx / d * 1.1;
        const [px, pz] = world.openSpotNear(ex, ez, 0.4);
        cam.placeEye(px, pz, st.x, st.z, 0.3);
      }, [yaw]);
      await shot('eye');
    }
    if (views.includes('back')) {
      // from the downhill (back) side at eye height with a figure on the patio: the walkout basement and the piers under the deck
      await page.evaluate(([rot]) => {
        const cb = window.__cb, w = cb.world, st = cb.game.getState().game.structures[0];
        const a = rot * Math.PI / 2, bx = -Math.sin(a), bz = -Math.cos(a);       // local -z in the world
        const fx = st.x + bx * 2.3 + Math.cos(a) * 0.7, fz = st.z + bz * 2.3 - Math.sin(a) * 0.7;
        const [ex, ez] = w.openSpotNear(fx, fz, 0.3);
        w.qaFigure(ex, ez);
        const [px, pz] = w.openSpotNear(st.x + bx * 5.2 + Math.cos(a) * 1.2, st.z + bz * 5.2 - Math.sin(a) * 1.2, 0.3);
        window.__cb.cam.placeEye(px, pz, st.x, st.z, 0.3);
      }, [rot]);
      await shot('back');
    }
    if (views.includes('under')) {
      await page.evaluate(() => window.__cb.store.getState().setUnderground(true));
      await look(5.2, 1.0, yaw + 0.2, 0.1);
      await shot('under');
      await page.evaluate(() => window.__cb.store.getState().setUnderground(false));
    }
    if (views.includes('cut')) {
      await page.evaluate(() => window.__cb.store.getState().setBuildingView('cutaway'));
      await look(5.5, 1.05, yaw + 0.3, 0.2);
      await shot('cut');
      await page.evaluate(() => window.__cb.store.getState().setBuildingView('full'));
    }
    if (views.includes('night')) {
      await page.evaluate(() => window.__cb.store.getState().setTimeOfDay(22));
      await look(8, 0.5, yaw, 0.3); await shot('night');
      await page.evaluate(([t]) => window.__cb.store.getState().setTimeOfDay(t), [tod]);
    }
  }
} catch (e) { console.error('ERR', e.message); }
await browser.close(); vite.kill();
process.exit(0);
