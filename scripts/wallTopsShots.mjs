// Wall tops and weak spots shots (sim/wallTops.ts): electric outriggers, razor coils, brush, the weak-spots overlay, and the Defense tab panel.
//   node scripts/wallTopsShots.mjs <outDir> [port=5961] [only] [full]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5961), only = process.argv[4] && process.argv[4] !== '-' ? process.argv[4] : null, full = process.argv[5] === 'full';
mkdirSync(out, { recursive: true });
const D = { x: 33.5, z: 33.5, yaw: 0, pitch: 0.4, radius: 4 };
/** A walled yard: electric stone wall north, razor on a container wall east, a plain stone wall south with a workshop against it (a weak spot), chain-link west with brush. */
const yard = `{ if (!window.__wt) { window.__wt = true;
  const G = cb.game, W = cb.world, c = W.camp, R = 10, x0 = c.x - R, x1 = c.x + R, z0 = c.z - R, z1 = c.z + R;
  for (const [kind, dx, dz] of [['timber_cabin', -3, -2.5], ['garden', 3, -3]]) { const sp = cb.tool.findSpot(kind, c.x + dx, c.z + dz, 0); if (sp) G.getState().plan(kind, sp[0], sp[1], 0); }
  const sh = cb.tool.findSpot('workshop', c.x + 5, c.z - 6, 0); if (sh) G.getState().plan('workshop', sh[0], sh[1], 0);
  G.getState().planRun('stone_wall', [[x0, z1], [x1, z1]], []);
  G.getState().planRun('container_wall', [[x1, z1], [x1, z0]], []);
  G.getState().planRun('stone_wall', [[x1, z0], [x0, z0]], []);
  G.getState().planRun('chain_link', [[x0, z0], [x0, z1]], []);
  G.setState(s => { const g = structuredClone(s.game);
    for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = g.clock.t - 400; }
    for (const st of g.structures) { st.stage = 5; st.done = 0; st.finishedAt = 0; }
    const w = g.structures.find(x => x.kind === 'workshop'); if (w) { w.z = z0 + 0.95; w.x = c.x + 4; }
    g.stock.wire = 99; g.stock.cable = 99; g.stock.hardware = 99; g.money = 90000; g.utilities.lit = ['x'];
    g.perimeter[3].brush = 0.85; g.perimeter[1].brush = 0.3;
    return { game: g }; });
  const ids = G.getState().game.perimeter.map(r => r.id);
  G.getState().addElectric(ids[0], true); G.getState().addRazor(ids[1]);
} }`;
const fig = (dx, dz) => `{ const W = cb.world, c = W.camp, f = W._root.children.find(o => o.userData.type === 'scale_figure'); if (f) f.position.set(c.x + ${dx}, W.parcel.height(c.x + ${dx}, c.z + ${dz}), c.z + ${dz}); }`;
const eye = (dx, dz, lx, lz, e = 0.26) => `{ const c = cb.world.camp; cb.cam.placeEye(c.x + ${dx}, c.z + ${dz}, c.x + ${lx}, c.z + ${lz}, ${e}); }`;
const air = (r, pitch, yaw) => `{ const c = cb.world.camp; cb.cam.target.set(c.x, 0, c.z); cb.cam.radius = ${r}; cb.cam.pitch = ${pitch}; cb.cam.yaw = ${yaw}; }`;
const SHOTS = [
  { name: 'eye-level-electric-fence-person', time: 10, season: 'summer', setup: yard + fig(-2, 11.4) + eye(-5.5, 13, 3, 10.4, 0.28) },
  { name: 'eye-level-razor-and-brush', time: 15, season: 'summer', setup: yard + fig(8.6, 3) + eye(5.5, 7, 10, 0.5, 0.28) },
  { name: 'aerial-wall-tops', time: 11, season: 'summer', setup: yard + air(30, 0.85, 0.5) },
  { name: 'aerial-weak-spots-overlay', time: 11, season: 'summer', setup: yard + 'cb.store.getState().setWeakView(true);' + air(30, 0.9, 0.5) },
  { name: 'aerial-weak-spot-workshop-close', time: 11, season: 'summer', setup: yard + 'cb.store.getState().setWeakView(true);' + air(13, 0.75, 0.6) },
].filter(s => !only || s.name.includes(only));
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(120000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(`http://localhost:${port}/?clean&lowrender=0.75&seed=7`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await page.evaluate(() => window.__cb.store.getState().setQuality('medium'));
  let n = 0;
  for (const s of SHOTS) {
    await page.evaluate(s => {
      const { store, cam, world } = window.__cb, st = store.getState();
      window.__cb.game.getState().setSpeed(0);
      st.setTimeOfDay(s.time ?? 10); st.setSeasonMode(s.season ?? 'auto'); st.setWeatherMode('clear'); st.setWeakView(false);
      window.__cb.qa.pose = null; st.setBuildingView?.('full');
      world.setEyeView?.(null); cam.target.set(33.5, 0, 33.5); cam.yaw = 0; cam.pitch = 0.4; cam.radius = 4;
    }, s);
    await page.evaluate(s => { new Function('cb', s.setup)(window.__cb); }, s);
    await page.evaluate(async () => { await window.__cb.qa.renderNow(); await window.__cb.qa.renderNow(); await window.__cb.qa.renderNow(); });
    await page.evaluate(s => { new Function('cb', s.setup)(window.__cb); }, s);
    await page.evaluate(f => (f ? window.__cb.qa.renderFull('high') : window.__cb.qa.renderNow()), full);
    const file = `${out}/${String(++n).padStart(2, '0')}-${s.name}${full ? '-full' : ''}.png`;
    await page.screenshot({ path: file });
    console.log(file);
  }
  void D;
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
