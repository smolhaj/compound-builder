/**
 * Road polish part 2, photographed on the mountain showcase (`&lowrender`): the plow on a real vehicle with drifts across the drive, deer
 * crossing the county road with a car stopped for them, the county-road end (cobble facing blended into the ground), and the entrance preview.
 *   flock /tmp/cb.lock node scripts/roadPolish2Shots.mjs --out /tmp/x [--port 5731] [--serve] [--only plow,tractor,deer,county,entrance]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5731)), outDir = resolve(opt('--out', 'shots/roadpolish2')), only = opt('--only', 'plow,tractor,deer,county,entrance').split(','), q = opt('--q', 'medium');
mkdirSync(outDir, { recursive: true });
let vite = null;
if (args.includes('--serve')) {
  vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
}
const LOT = 'region=pnw&lot=hillside&lotcut&relief=9&acres=40&lotseed=8&elev=600';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(900000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
await page.goto(`http://localhost:${port}/?lowrender=0.75&clean&seed=7&${LOT}&showcase=mountain`);
await page.waitForFunction(() => window.__cb?.qa?.renderNow && window.__showcase, null, { timeout: 900000 });
const look = (season, tod = 10) => page.evaluate(([season, tod]) => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality('low'); store.getState().setTimeOfDay(tod); store.getState().setWeatherMode('clear'); store.getState().setSeasonMode(season); }, [season, tod]);
await look('summer');
for (let i = 0; i < 14; i++) { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(120); }
const frames = async () => { await page.evaluate(q => window.__cb.qa.renderFull(q), q); await page.waitForTimeout(250); };
const shot = async name => { await frames(); await frames(); await page.screenshot({ path: `${outDir}/${name}.png` }); console.error('shot', name); };
const orbit = (r, pitch, yaw, x, z, lift = 0.3) => page.evaluate(([r, pitch, yaw, x, z, lift]) => { const { world, cam } = window.__cb; window.__cb.qa.pose = null; cam.target.set(x, world.groundAt(x, z) + lift, z); cam.radius = r; cam.pitch = pitch; cam.yaw = yaw; }, [r, pitch, yaw, x, z, lift]);
/** Eye pose a few units back along the planned drive looking at `s`, with a person standing at its edge. */
const eye = (s, back = 3.5, man = 1.4) => page.evaluate(([s, back, man]) => {
  const { world } = window.__cb, P = world.plan.pts;
  const at = ss => { let i = 0; while (i < P.length - 2 && P[i + 1].s < ss) i++; const a = P[i], b = P[i + 1], t = Math.max(0, Math.min(1, (ss - a.s) / Math.max(1e-6, b.s - a.s))); return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t }; };
  const c = at(s), a = at(s - 0.6), b = at(s + 0.6), tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1, nx = tz / tl, nz = -tx / tl;
  const m = at(s + man); world.qaFigure(m.x + nx * 0.2, m.z + nz * 0.2);
  const cx = c.x - tx / tl * back + nx * 0.25, cz = c.z - tz / tl * back + nz * 0.25, look = at(s + 2);
  window.__cb.qa.pose = { x: cx, y: Math.max(world.groundAt(cx, cz), c.y - 0.3) + 0.45, z: cz, lx: look.x, ly: look.y + 0.05, lz: look.z, fov: 62 };
}, [s, back, man]);
const info = await page.evaluate(() => { const w = window.__cb.world, p = w.plan; return { p0: p.pts[0], pN: p.pts[p.pts.length - 1], len: p.pts[p.pts.length - 1].s, gz: w.access.gate.z, gx: w.access.gate.x }; });
console.error(JSON.stringify(info));
const winterPlow = async (kind, drifts) => {
  await page.evaluate(() => { const st = window.__cb.game.getState(), g = structuredClone(st.game); g.stock.plow = 1; window.__cb.game.setState({ game: g }); });
  await look('winter', 11);
  await page.evaluate(([kind, drifts]) => { const { world } = window.__cb; world.plow.update(0.1, { rig: kind, snow: 1, closed: drifts ? 1 : 0, day: 3, hour: 6, speedK: 1 }); world.plow.qaPose(Math.max(2, world.plow._len * 0.45), kind, drifts); window.__cb.qa.pose = null; }, [kind, drifts]);
};
if (only.includes('plow')) {
  await winterPlow('pickup', true);
  const mid = await page.evaluate(() => { const P = window.__cb.world.plan.pts, i = Math.floor(P.length * 0.55); return [P[i].x, P[i].z]; });
  await orbit(9, 0.5, 0.4, mid[0], mid[1]); await shot('1-plow-pickup-drifts-aerial');
  await eye(info.len * 0.3, 3.5, 4.2); await shot('1b-plow-pickup-drifts-eye');
}
if (only.includes('tractor')) {
  await winterPlow('tractor', false);
  const mid = await page.evaluate(() => { const P = window.__cb.world.plan.pts, i = Math.floor(P.length * 0.55); return [P[i].x, P[i].z]; });
  await orbit(8, 0.5, 0.4, mid[0], mid[1]); await shot('2-plow-tractor-aerial');
  await eye(info.len * 0.5, 3.0, 3.5); await shot('2b-plow-tractor-eye');
}
if (only.includes('deer')) {
  await look('summer', 6.3);
  // advance the road and the animals by hand: a file of deer steps out at the gate; a pickup comes up the road behind them
  const run = async (n, dt = 0.1) => { for (let i = 0; i < n; i++) await page.evaluate(dt => { const { world, game } = window.__cb; const g = game.getState().game; world.updateWildlife(dt, g, 1); world.updateRoadLife(dt, g, 1); }, dt); };
  await run(2);
  const ok = await page.evaluate(gz => { const { world } = window.__cb; world.roadLife.qaDrive('pickup', gz - 9, 1, 1.4); return world.wildlife.qaCross('deer', 3, gz, 1); }, info.gz);
  console.error('qaCross', ok);
  const where = () => page.evaluate(() => { const { world } = window.__cb; return { crossers: world.wildlife.roadCrossers().length, held: world.roadLife.held, live: world.roadLife._live.map(l => ({ z: +l.z.toFixed(2), v: +l.speed.toFixed(2) })) }; });
  await run(150);
  console.error('mid', JSON.stringify(await where()));
  await page.evaluate(gz => { const { world } = window.__cb; const x = world.county.x(gz); window.__cb.qa.pose = { x: x - 5, y: world.groundAt(x - 5, gz - 5) + 0.45, z: gz - 5, lx: x, ly: world.groundAt(x, gz) + 0.1, lz: gz + 0.5, fov: 55 }; world.qaFigure(x - 1.5, gz - 3); }, info.gz);
  await shot('3-deer-crossing-eye');
  const gx = info.gx;
  await orbit(14, 0.7, 1.2, await page.evaluate(gz => window.__cb.world.county.x(gz), info.gz), info.gz); await shot('3b-deer-crossing-aerial');
  await run(250);
  console.error('after', JSON.stringify(await where()));
  void gx;
}
if (only.includes('county')) {
  await look('summer');
  await page.evaluate(() => { window.__cb.qa.pose = null; });
  await orbit(15, 0.55, 0.6, info.p0.x - 1.5, info.p0.z); await shot('4-county-end-aerial');
  await eye(1.0); await shot('4b-county-end-eye');
}
if (only.includes('entrance')) {
  await look('summer');
  await page.evaluate(() => { window.__cb.qa.pose = null; const w = window.__cb.world, g = window.__cb.game.getState().game; w.previewEntrance(g.site, 20); });
  await orbit(60, 0.9, 0.5, 45, 35, 0.3); await shot('5-entrance-preview');
}
await browser.close(); vite?.kill();
process.exit(0);
