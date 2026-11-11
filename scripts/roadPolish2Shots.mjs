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
const port = Number(opt('--port', 5731)), outDir = resolve(opt('--out', 'shots/roadpolish2')), only = opt('--only', 'plow,tractor,county,entrance').split(','), q = opt('--q', 'medium');
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
const look = (season, tod = 10) => page.evaluate(([season, tod]) => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality('low'); store.getState().setTimeOfDay(tod); store.getState().setWeatherMode('clear'); store.getState().setSeasonMode(season); store.getState().setDayOfYear(season === 'winter' ? 20 : 200); }, [season, tod]);
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
/** Points along the planned drive from the yard (d = 0) out to the county road. */
const winterPlow = async (kind, drifts) => {
  await page.evaluate(() => { const st = window.__cb.game.getState(), g = structuredClone(st.game); g.stock.plow = 1; window.__cb.game.setState({ game: g }); });
  await look('winter', 11);
  for (let i = 0; i < 40; i++) { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(100); }
  const snow = await page.evaluate(() => window.__cb.world.plow._berms !== null);
  console.error('winter look set; berms mesh', snow);
  const dbg = await page.evaluate(([kind, drifts]) => { const { world } = window.__cb; world.plow.qaPose(world.plow._len * 0.3, kind, drifts); window.__cb.qa.pose = null; const m = world.plow._drifts; return m ? { vis: m.visible, range: m.geometry.drawRange, parent: !!m.parent, pos: m.geometry.attributes.position.array.slice(0, 3), n: m.geometry.index.count } : null; }, [kind, drifts]);
  console.error('drifts', JSON.stringify(dbg));
};
/** Where the drive is at distance d from the yard: x, z, heading (the way toward the county road). */
const along = d => page.evaluate(d => { const R = window.__cb.world.plow._route; let left = d; for (let i = 1; i < R.length; i++) { const l = Math.hypot(R[i][0] - R[i - 1][0], R[i][1] - R[i - 1][1]); if (left <= l || i === R.length - 1) { const t = Math.min(1, left / l); return { x: R[i - 1][0] + (R[i][0] - R[i - 1][0]) * t, z: R[i - 1][1] + (R[i][1] - R[i - 1][1]) * t, dx: (R[i][0] - R[i - 1][0]) / l, dz: (R[i][1] - R[i - 1][1]) / l, len: window.__cb.world.plow._len }; } left -= l; } }, d);
const plowShots = async (kind, tag) => {
  const L = (await along(0)).len;
  // the truck stands at 30 % of the drive going out; the first drift ahead of it lies near 38 %
  const T = await along(L * 0.3), N = await along(L * 0.4);
  // low camera behind and beside the truck, looking at the blade and the drift ahead of it
  await page.evaluate(([T, N]) => { const { world, cam } = window.__cb; window.__cb.qa.pose = null; const mx = (T.x + N.x) / 2, mz = (T.z + N.z) / 2; cam.target.set(mx, world.groundAt(mx, mz) + 0.12, mz); cam.radius = 2.6; cam.pitch = 0.3; cam.yaw = Math.atan2(T.dx, T.dz) + 0.9; }, [T, N]);
  await shot(`${tag}-close`);
  // eye level: a person standing beside the drive between the truck and the drift, the camera behind the truck
  await page.evaluate(([T, N]) => { const { world } = window.__cb; world.qaFigure((T.x + N.x) / 2 + T.dz * 0.4, (T.z + N.z) / 2 - T.dx * 0.4); const ex = T.x - T.dx * 1.9 + T.dz * 0.35, ez = T.z - T.dz * 1.9 - T.dx * 0.35; window.__cb.qa.pose = { x: ex, y: world.groundAt(ex, ez) + 0.4, z: ez, lx: N.x, ly: world.groundAt(N.x, N.z) + 0.12, lz: N.z, fov: 58 }; }, [T, N]);
  await shot(`${tag}-eye`);
};
if (only.includes('plow')) { await winterPlow('pickup', true); await plowShots('1-plow-pickup-drift', 'a'); }
if (only.includes('tractor')) { await winterPlow('tractor', true); await plowShots('2-plow-tractor-drift', 'b'); }
if (only.includes('county')) {
  await look('summer');
  await page.evaluate(() => { window.__cb.qa.pose = null; });
  await orbit(15, 0.55, 0.6, info.p0.x - 1.5, info.p0.z); await shot('4-county-end-aerial');
  await eye(1.0); await shot('4b-county-end-eye');
}
if (only.includes('entrance')) {
  await look('summer');
  const o = await page.evaluate(async () => { const m = await import('/src/sim/roadEntrance.ts'); const w = window.__cb.world, g = window.__cb.game.getState().game; const c = m.entranceChoiceFor(g); const op = c.options.find(x => !x.current) ?? c.options[0]; w.previewEntrance(g.site, op.z); window.__cb.qa.pose = null; return { z: op.z, gateZ: op.gateZ, x: w.county.x(op.gateZ), n: c.options.length }; });
  console.error('entrance preview', JSON.stringify(o));
  await orbit(24, 0.8, 0.7, o.x - 6, o.gateZ); await shot('5-entrance-preview-close');
}
await browser.close(); vite?.kill();
process.exit(0);
