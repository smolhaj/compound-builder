// Dome yard access and plant realism shots (docs/ux/dome-yard-access), HIGH quality. Several domes in one scene (glass, arcology, geodesic, earthen), the yard with no gate,
// the service airlock and sealed passage, the U and cutaway views, dusk and a damaged yard.  PANEL=1: the Dome panel with the HUD.
//   flock /tmp/cb.lock node scripts/domeYardAccessShots.mjs <outDir> [port] [only=comma,names]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5993), only = process.argv[4] ? process.argv[4].split(',') : null;
const W = Number(process.env.W || 1600), H = Number(process.env.H || 900), PR = process.env.PR || '0.9';
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
const want = n => !only || only.includes(n);
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7${process.env.PANEL ? '&layout=a' : '&clean'}&lowrender=${PR}&region=${process.env.REGION ?? 'mountain_west'}&acres=40&relief=${process.env.RELIEF ?? 0}&lotseed=${process.env.LOTSEED ?? 8}`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  await page.evaluate(() => window.__cb.store.getState().setQuality?.('high', true));
  const frames = async (n = 1) => { for (let i = 0; i < n; i++) await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(250); };
  const shot = async name => { await frames(2); await page.evaluate(() => window.__cb.qa.renderFull('high')); await page.screenshot({ path: `${out}/${name}.png` }); lap(name); };
  const set = js => page.evaluate(js => new Function('cb', js)(window.__cb), js);
  const info = await page.evaluate(async () => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp; G.getState().setSpeed(0);
    G.setState(s => ({ game: { ...s.game, money: 900_000_000 } }));
    const put = (kind, x, z, r = 4) => { const sp = cb.tool.findSpot(kind, x, z, 0, r); if (!sp) return null; G.getState().plan(kind, sp[0], sp[1], 0); return { id: G.getState().game.structures.at(-1).id, x: sp[0], z: sp[1], kind }; };
    const domes = { arc: put('dome_arcology_30', c.x - 7, c.z - 4, 14), glass: put('dome_glass_18', c.x + 8, c.z - 3, 14), geo: put('dome_geodesic_8', c.x - 1, c.z + 9, 12), earth: put('dome_earthen_3', c.x + 10, c.z + 9, 12) };
    const inside = (d, R, list) => { for (const [k, fx, fz] of list) { const sp = cb.tool.findSpot(k, d.x + fx * R, d.z + fz * R, 0, 2); if (sp) G.getState().plan(k, sp[0], sp[1], 0); } };
    if (domes.arc) inside(domes.arc, 7.5, [['log_house', -0.12, 0.1], ['barn', 0.34, -0.3], ['workshop', 0.18, 0.3], ['garden', -0.3, -0.2], ['greenhouse', -0.46, 0.0]]);
    if (domes.glass) inside(domes.glass, 4.5, [['log_house', -0.1, 0.0], ['garden', 0.3, -0.2]]);
    G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) { st.stage = 99; st.done = 0; st.finishedAt = 0; st.supplied = true; } g.utilities.lit = ['x']; return { game: g }; });
    const live = await import('/src/sim/dome/live.ts');
    G.setState(s => { const g = structuredClone(s.game);
      for (const [k, d] of Object.entries(domes)) { if (!d) continue; const ref = live.domeOf(g, d.id); if (!ref) continue; const o = live.ownState(g, ref);
        o.filtering = k === 'geo' ? 'advanced' : k === 'earth' ? 'scrubber' : 'closed'; o.loop = k === 'earth' ? 'none' : 'recycle'; if (k === 'arc' || k === 'glass') o.spares = ['chiller', 'substation'];
        g.utilities.fittings.push({ building: d.id, kind: 'wire', done: 1, hours: 1, supplied: true, finishedAt: 0 }); }
      return { game: g }; });
    cb.store.getState().setHudHidden?.(true);
    const lv = await import('/src/sim/dome/live.ts'), pl = await import('/src/sim/dome/plantYard.ts'), g0 = G.getState().game;
    const geo = {};
    for (const k of ['arc', 'glass']) { const d = domes[k]; if (!d) continue; const ref = lv.domeOf(g0, d.id); geo[k] = { r: ref.r, y: pl.yardGeometry(ref.tier, ref.r, ref.st.rot) }; }
    return { domes, geo, camp: [c.x, c.z] };
  });
  lap(JSON.stringify({ domes: info.domes, camp: info.camp }));
  if (!info.domes.arc || !info.domes.glass) throw new Error('missing domes ' + JSON.stringify(info.domes));
  await frames(3);
  const gd = (x, z) => page.evaluate(([x, z]) => window.__cb.world.groundAt(x, z), [x, z]);
  const pose = async (e, l, fov = 60) => { if (e[1] < 0) { e = [e[0], (await gd(e[0], e[2])) + -e[1], e[2]]; } return poseRaw(e, l, fov); };
  const poseRaw = (e, l, fov = 60) => page.evaluate(([e, l, fov]) => { window.__cb.qa.pose = { x: e[0], y: e[1], z: e[2], lx: l[0], ly: l[1], lz: l[2], fov }; }, [e, l, fov]);
  const person = async (x, z) => page.evaluate(async ([x, z]) => { const m = await import('/src/game/HomesteadWorld.ts'); window.__cb.ws.scene.add(m.scaleFigure(x, z, window.__cb.world.groundAt(x, z))); }, [x, z]);
  await set(`const s = cb.store.getState(); s.setTimeOfDay(16.6); s.setBuildingView('full'); s.setSeasonMode?.('summer'); s.setWeatherMode('clear');`);
  const A = info.domes.arc, G2 = info.domes.glass, ga = info.geo.arc, gg = info.geo.glass;
  const yc = (d, g) => [d.x + g.y.center[0], d.z + g.y.center[1]];
  const ya = yc(A, ga), yg = yc(G2, gg), gA = await gd(A.x, A.z), gG = await gd(G2.x, G2.z);
  const cx = (A.x + G2.x) / 2, cz = (A.z + G2.z) / 2;
  if (want('hero')) { await pose([cx + 3, gA + 11, cz + 32], [cx + 1, gA + 1, cz + 4], 52); await shot('hero-aerial-four-domes'); await pose([cx - 26, gA + 5, cz + 14], [cx + 1, gA + 1.5, cz + 3], 55); await shot('hero-side-four-domes'); }
  if (want('eye')) {
    // eye level on the glass dome's yard (wall continuous, no gate) with a person beside the wall
    const e = gg.y.er, t = gg.y.et;
    await person(yg[0] + e[0] * 1.9 + t[0] * 0.6, yg[1] + e[1] * 1.9 + t[1] * 0.6);
    await pose([yg[0] + e[0] * 5.2 + t[0] * 2.0, gG + 0.45, yg[1] + e[1] * 5.2 + t[1] * 2.0], [yg[0], gG + 0.4, yg[1]], 55); await shot('glass-yard-eye-no-gate');
    const ea = ga.y.er, ta = ga.y.et;
    await person(ya[0] + ea[0] * 3.6 + ta[0] * 1.0, ya[1] + ea[1] * 3.6 + ta[1] * 1.0);
    await pose([ya[0] + ea[0] * 8 + ta[0] * 3, gA + 0.5, ya[1] + ea[1] * 8 + ta[1] * 3], [ya[0], gA + 0.5, ya[1]], 55); await shot('arcology-yard-eye-no-gate');
  }
  if (want('yard')) {
    const e = ga.y.er, t = ga.y.et;
    await pose([ya[0] + e[0] * 3.4 + t[0] * 2.4, gA + 3.6, ya[1] + e[1] * 3.4 + t[1] * 2.4], [ya[0], gA + 0.2, ya[1]], 50); await shot('arcology-yard-closeup-outside');
    await pose([ya[0] + e[0] * 2.2 - t[0] * 2.4, gA + 1.4, ya[1] + e[1] * 2.2 - t[1] * 2.4], [ya[0] - t[0] * 0.3, gA + 0.3, ya[1] - t[1] * 0.3], 55); await shot('arcology-yard-equipment');
  }
  if (want('inside')) {
    const e = ga.y.er, p = ga.y.portal, pc = [A.x + p.chamber[0], A.z + p.chamber[1]];
    await pose([pc[0] - e[0] * 2.6, gA + 0.5, pc[1] - e[1] * 2.6], [pc[0], gA + 0.3, pc[1]], 58); await shot('arcology-interior-service-airlock');
    await pose([pc[0] - e[0] * 3.6 - ga.y.et[0] * 2.4, gA + 0.5, pc[1] - e[1] * 3.6 - ga.y.et[1] * 2.4], [pc[0] - ga.y.et[0] * 1.6, gA + 0.3, pc[1] - ga.y.et[1] * 1.6], 62); await shot('arcology-interior-gallery-bays');
    const eg = gg.y.er, pg = gg.y.portal, pcg = [G2.x + pg.chamber[0], G2.z + pg.chamber[1]];
    await pose([pcg[0] - eg[0] * 2.2 - gg.y.et[0] * 1.4, gG + 0.45, pcg[1] - eg[1] * 2.2 - gg.y.et[1] * 1.4], [pcg[0] - gg.y.et[0] * 1.0, gG + 0.3, pcg[1] - gg.y.et[1] * 1.0], 62); await shot('glass-interior-plant-and-airlock');
  }
  if (want('under')) {
    const e = ga.y.er, p = ga.y.portal, pt = [A.x + (p.from[0] + p.to[0]) / 2, A.z + (p.from[1] + p.to[1]) / 2];
    await set(`cb.world.setUnderground(true)`); await frames(2);
    await pose([pt[0] - e[0] * 3.2 + ga.y.et[0] * 1.2, gA + 2.6, pt[1] - e[1] * 3.2 + ga.y.et[1] * 1.2], [pt[0] + e[0] * 0.8, gA - 0.1, pt[1] + e[1] * 0.8], 55); await shot('arcology-passage-underground-view');
    await set(`cb.world.setUnderground(false)`);
  }
  if (want('cut')) {
    const e = ga.y.er, p = ga.y.portal, pt = [A.x + (p.from[0] + p.to[0]) / 2, A.z + (p.from[1] + p.to[1]) / 2];
    await set(`cb.store.getState().setBuildingView('cutaway')`); await frames(3);
    await pose([pt[0] - e[0] * 3.2 + ga.y.et[0] * 1.6, gA + 2.2, pt[1] - e[1] * 3.2 + ga.y.et[1] * 1.6], [pt[0] + e[0] * 0.6, gA + 0.2, pt[1] + e[1] * 0.6], 55); await shot('arcology-passage-cutaway-view');
    await set(`cb.store.getState().setBuildingView('full')`);
  }
  if (want('dusk')) {
    await set(`cb.store.getState().setTimeOfDay(19.9)`);
    await pose([cx + 4, gA + 7, cz + 22], [cx + 1, gA + 1.5, cz - 1], 50); await shot('dusk-four-domes');
    await set(`cb.store.getState().setTimeOfDay(21.8)`);
    const e = ga.y.er; await pose([ya[0] + e[0] * 5 + ga.y.et[0] * 3, gA + 1.4, ya[1] + e[1] * 5 + ga.y.et[1] * 3], [ya[0], gA + 0.4, ya[1]], 52); await shot('night-yard-arcology');
    await set(`cb.store.getState().setTimeOfDay(16.6)`);
  }
  if (want('damaged') || want('panel')) {
    await page.evaluate(async () => {
      const G = window.__cb.game, live = await import('/src/sim/dome/live.ts'), pl = await import('/src/sim/dome/plantLive.ts'), main = live.domesOf(G.getState().game)[0];
      G.setState(s => { const g = structuredClone(s.game); const d = live.domeOf(g, main.st.id), st = live.stateOf(g, d);
        pl.damagePlant(g, d, st, 'chiller', 'down', 'raid'); pl.damagePlant(g, d, st, 'chiller2', 'damaged', 'raid'); pl.damagePlant(g, d, st, 'air', 'damaged', 'raid'); pl.damagePlant(g, d, st, 'substation', 'down', 'raid');
        return { game: g }; });
    });
    await frames(4);
  }
  if (want('damaged')) {
    const e = ga.y.er, t = ga.y.et;
    await pose([ya[0] + e[0] * 3.4 + t[0] * 2.4, gA + 3.6, ya[1] + e[1] * 3.4 + t[1] * 2.4], [ya[0], gA + 0.2, ya[1]], 50); await shot('damaged-yard-arcology');
  }
  if (want('panel')) {
    await set(`cb.store.getState().setHudHidden?.(false)`);
    await page.getByRole('button', { name: 'OK', exact: true }).first().click({ timeout: 3000 }).catch(() => {});
    await page.evaluate(() => window.__cb.game.getState().focusHud({ right: 'utilities' })); await page.waitForTimeout(500);
    const b = page.getByTestId('page-chip-dome'); if (await b.count()) await b.click();
    await page.mouse.move(700, 400); await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelector('[data-testid=plant-yard]')?.scrollIntoView({ block: 'end' })); await page.waitForTimeout(400);
    await shot('dome-panel-hardened-yard-row');
    await page.evaluate(() => document.querySelector('[data-testid=plant-units]')?.scrollIntoView({ block: 'start' })); await page.waitForTimeout(400);
    await shot('dome-panel-plant-units');
  }
  await page.close();
} finally { await browser.close(); vite.kill(); }
