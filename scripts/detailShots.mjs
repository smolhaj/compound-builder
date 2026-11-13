/**
 * Building detail shots: each kind finished on a flat lot, in one condition, from above, at eye level with a figure,
 * and in close-ups of the door, a window and the eave.
 *   (needs a build: npx vite build --outDir /tmp/cb-dist-detail-after; --dist picks another)
 *   flock /tmp/cb.lock node scripts/detailShots.mjs --out /tmp/x [--kinds log_house,timber_cabin,cottage,barn,workshop] [--cond summer|winter|rain|night] [--views aerial,eye,door,window,eave] [--q high] [--age 0]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5330)), outDir = resolve(opt('--out', 'shots/detail'));
const kinds = opt('--kinds', 'log_house,timber_cabin,cottage,barn,workshop').split(',');
const conds = opt('--cond', 'summer').split(','), views = opt('--views', 'aerial,eye,door,window,eave').split(','), qual = opt('--q', 'medium');
const region = opt('--region', 'north_woods'), age = Number(opt('--age', 6));
mkdirSync(outDir, { recursive: true });
const CS = { summer: { s: 'summer', w: 'clear', t: 14, doy: 200 }, winter: { s: 'winter', w: 'snow', t: 13, doy: 20 }, winterclear: { s: 'winter', w: 'clear', t: 9, doy: 20 }, rain: { s: 'fall', w: 'rain', t: 14, doy: 292 }, night: { s: 'summer', w: 'clear', t: 21.5, doy: 200 }, nightwinter: { s: 'winter', w: 'clear', t: 20.5, doy: 20 } };
const dist = opt('--dist', '/tmp/cb-dist-detail-after');
const vite = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 680 } });
page.setDefaultTimeout(300000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('console', m.text().slice(0, 300)); });
try {
  await page.goto(`http://localhost:${port}/?lowrender=1&looktier=${qual}&clean&seed=7&region=${region}&lot=flat`);
  await page.waitForFunction(() => window.__cb?.qa?.renderNow, null, { timeout: 300000 });
  await page.evaluate(q => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality(q); }, qual);
  await page.evaluate(() => { window.__cb.qa.weather = true; });
  await page.waitForTimeout(1500);
  const frame = async (n = 1) => { for (let i = 0; i < n; i++) { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(200); } };
  const full = async () => { await page.evaluate(q => window.__cb.qa.renderFull(q), qual); await page.waitForTimeout(150); };
  for (const kind of kinds) {
    const info = await page.evaluate(async ([kind, age]) => {
      const cb = window.__cb, G = cb.game, w = cb.world, c = w.camp;
      const g = structuredClone(G.getState().game);
      g.structures = [];
      g.clock.t = 2 * 365 + 150.45; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
      G.setState({ game: g });
      const sp = cb.tool.findSpot(kind, c.x, c.z, 0, 24);
      if (!sp) return { ok: false, why: 'no spot' };
      const cur = structuredClone(G.getState().game);
      cur.structures.push({ id: 'q1', kind, x: sp[0], z: sp[1], rot: 0, stage: 99, done: 0, supplied: true, finishedAt: cur.clock.t - age * 365 });
      G.setState({ game: cur });
      return { ok: true, spot: sp };
    }, [kind, age]);
    console.error(kind, JSON.stringify(info));
    if (!info.ok) continue;
    await frame(4);
    await page.evaluate(() => window.__cb.store.getState().setBuildingView('full'));
    const geo = await page.evaluate(() => { const w = window.__cb.world, st = window.__cb.game.getState().game.structures[0]; return { x: st.x, z: st.z, gy: w.groundAt(st.x, st.z) }; });
    const look = (r, pitch, yaw, h = 0.25, dx = 0, dz = 0) => page.evaluate(([x, z, gy, r, pitch, yaw, h, dx, dz]) => { const { cam, world } = window.__cb; world.setEyeView?.(null); cam.target.set(x + dx, gy + h, z + dz); cam.radius = r; cam.pitch = pitch; cam.yaw = yaw; }, [geo.x, geo.z, geo.gy, r, pitch, yaw, h, dx, dz]);
    for (const cond of conds) {
    const C = CS[cond];
    await page.evaluate(C => {
      const cb = window.__cb, s = cb.store.getState();
      cb.qa.weather = true;
      s.setWeatherMode(C.w); s.setSeasonMode(C.s); s.setDayOfYear(C.doy); s.setTimeOfDay(C.t);
      const season = C.doy < 80 ? 'winter' : C.doy < 270 ? 'summer' : 'fall';
      for (let i = 0; i < 16; i++) cb.weather.sim.update(5, season, C.t, C.w);
      cb.valley?.snap?.();
    }, C);
    await page.waitForTimeout(1200);
    const shot = async name => { await page.waitForTimeout(500); await full(); const f = `${outDir}/${kind}-${cond}-${name}.png`; await page.screenshot({ path: f }); console.error(f); };
    if (views.includes('aerial')) { await look(9, 0.85, 0.6, 0.3); await shot('aerial'); }
    if (views.includes('eye')) {
      await page.evaluate(() => {
        const cb = window.__cb, w = cb.world, st = cb.game.getState().game.structures[0];
        const [ex, ez] = w.openSpotNear(st.x + 0.6, st.z + 2.6, 0.5);
        w.qaFigure(ex, ez); window.__fig = [ex, ez];
      });
      await page.evaluate(() => {
        const { cam, world } = window.__cb, [fx, fz] = window.__fig, st = window.__cb.game.getState().game.structures[0];
        const dx = st.x - fx, dz = st.z - fz, d = Math.hypot(dx, dz) || 1;
        const [px, pz] = world.openSpotNear(fx - dx / d * 2.4 + dz / d * 1.1, fz - dz / d * 2.4 - dx / d * 1.1, 0.4);
        cam.placeEye(px, pz, st.x, st.z, 0.3);
      });
      await shot('eye');
    }
    // close-ups: orbit camera low and near the front (local +z) face; pitch ~0.1
    if (views.includes('door')) { await look(1.5, 0.12, 0.0, 0.2, 0, 1.0); await shot('door'); }
    if (views.includes('window')) { await look(1.5, 0.1, 1.57, 0.35, 0.9, 0); await shot('window'); }
    if (views.includes('eave')) { await look(2.2, 0.35, 0.5, 0.8, 0, 0.8); await shot('eave'); }
    if (views.includes('side')) { await look(6, 0.18, 0.9, 0.4); await shot('side'); }
    if (views.includes('roof')) { await look(5, 0.9, 0.2, 0.6); await shot('roof'); }
    }
  }
} catch (e) { console.error('ERR', e.message); }
await browser.close(); vite.kill();
process.exit(0);
