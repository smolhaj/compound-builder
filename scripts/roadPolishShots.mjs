/**
 * The road polish pass, photographed on the mountain showcase (the real URL, `&lowrender`): the county end and the yard end of the way in (the
 * facing and the edge blending into the ground), the drainage channel, razor wire on the patrol deck, the plow in snow, and the entrance preview.
 *   flock $SP/render.lock node scripts/roadPolishShots.mjs --out shots/roadpolish [--port 5611] [--serve] [--only county,yard,drain,razor,plow,entrance]
 * Opens  /?lowrender=0.75&clean&seed=7&region=pnw&lot=hillside&lotcut&relief=9&acres=40&lotseed=8&elev=600&showcase=mountain  (the user's showcase URL).
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5611)), outDir = resolve(opt('--out', 'shots/roadpolish')), only = opt('--only', 'county,yard,drain,razor,plow,entrance').split(','), q = opt('--q', 'medium');
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
/** An eye-level pose a few units back along the road looking at `s` with a person standing at the road's edge (a street-level shot with scale). */
const eye = (s, back = 3.5, man = 1.4) => page.evaluate(([s, back, man]) => {
  const { world } = window.__cb, P = world.plan.pts;
  const at = ss => { let i = 0; while (i < P.length - 2 && P[i + 1].s < ss) i++; const a = P[i], b = P[i + 1], t = Math.max(0, Math.min(1, (ss - a.s) / Math.max(1e-6, b.s - a.s))); return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t }; };
  const c = at(s), a = at(s - 0.6), b = at(s + 0.6), tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1, nx = tz / tl, nz = -tx / tl;
  const m = at(s + man); world.qaFigure(m.x + nx * 0.2, m.z + nz * 0.2);
  const cx = c.x - tx / tl * back + nx * 0.25, cz = c.z - tz / tl * back + nz * 0.25, look = at(s + 2);
  window.__cb.qa.pose = { x: cx, y: Math.max(world.groundAt(cx, cz), c.y - 0.3) + 0.45, z: cz, lx: look.x, ly: look.y + 0.05, lz: look.z, fov: 62 };
}, [s, back, man]);
const info = await page.evaluate(() => { const w = window.__cb.world, p = w.plan, g = window.__cb.game.getState().game; return { p0: p.pts[0], pN: p.pts[p.pts.length - 1], len: p.pts[p.pts.length - 1].s, drain: g.perimeter.filter(r => r.kind === 'drain_channel').map(r => r.pts), deck: g.perimeter.filter(r => r.kind === 'wall_walk').map(r => ({ id: r.id, host: r.hostId, pts: r.pts })), razor: g.perimeter.filter(r => r.razor).map(r => r.id), camp: w.camp, entrances: null }; });
console.error(JSON.stringify({ p0: info.p0, pN: info.pN, len: info.len, drains: info.drain.length, decks: info.deck.length, razor: info.razor }));
if (only.includes('county')) {
  await orbit(15, 0.55, 0.6, info.p0.x - 1.5, info.p0.z); await shot('1-county-end-aerial');
  await eye(1.0); await shot('1b-county-end-eye');
}
if (only.includes('yard')) {
  await page.evaluate(() => { window.__cb.qa.pose = null; });
  await orbit(15, 0.55, 0.9, info.pN.x + 2, info.pN.z); await shot('2-yard-end-aerial');
  await eye(info.len - 4, 3, 2.2); await shot('2b-yard-end-eye');
}
if (only.includes('drain') && info.drain.length) {
  const d = info.drain[0], mx = (d[0][0] + d.at(-1)[0]) / 2, mz = (d[0][1] + d.at(-1)[1]) / 2;
  await page.evaluate(() => { window.__cb.qa.pose = null; });
  await orbit(14, 0.55, 0.5, mx, mz); await shot('3-drain-aerial');
  await orbit(5, 0.3, 0.5, mx, mz, 0.1); await shot('3b-drain-low');
}
if (only.includes('razor') && info.deck.length) {
  // razor on the walled run that carries the patrol deck
  const hostId = info.deck[0].host;
  const res = await page.evaluate(id => { const st = window.__cb.game.getState(); const g = structuredClone(st.game); g.stock.wire = 500; g.stock.hardware = 500; window.__cb.game.setState({ game: g }); return window.__cb.game.getState().addRazor(id); }, hostId);
  console.error('addRazor ->', res);
  await page.waitForTimeout(500);
  const pts = info.deck[0].pts, k = Math.floor(pts.length / 2);
  await page.evaluate(() => { window.__cb.qa.pose = null; });
  await orbit(7, 0.32, 0.7, pts[k][0], pts[k][1], 0.5); await shot('4-razor-deck');
}
if (only.includes('plow')) {
  await page.evaluate(() => { const st = window.__cb.game.getState(), g = structuredClone(st.game); g.stock.plow = 1; window.__cb.game.setState({ game: g }); });
  await look('winter', 11);
  await page.evaluate(() => { const { world } = window.__cb; world.plow.update(0.1, true, 1); world.plow.qaPose(Math.max(2, world.plow._len * 0.45)); });
  await page.evaluate(() => { window.__cb.qa.pose = null; });
  const mid = await page.evaluate(() => { const P = window.__cb.world.plan.pts, i = Math.floor(P.length * 0.55); return [P[i].x, P[i].z]; });
  await orbit(9, 0.5, 0.4, mid[0], mid[1]); await shot('5-plow-aerial');
  await eye(info.len * 0.5, 3.5, 4.2); await shot('5b-plow-eye');
}
if (only.includes('entrance')) {
  await look('summer');
  await page.evaluate(() => { const w = window.__cb.world, g = window.__cb.game.getState().game; w.previewEntrance(g.site, 20); });
  await orbit(60, 0.9, 0.5, 45, 35, 0.3); await shot('6-entrance-preview');
}
await browser.close(); vite?.kill();
process.exit(0);
