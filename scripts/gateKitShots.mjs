// Gate kit shots (sim/gateSecurity.ts): the double gate (vehicle sally port), the intercom pole and the caged motor at the drive gate.
//   node scripts/gateKitShots.mjs <outDir> [port=5962] [only] [full]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5962), only = process.argv[4] && process.argv[4] !== '-' ? process.argv[4] : null, full = process.argv[5] === 'full';
mkdirSync(out, { recursive: true });
/** A container-wall yard whose gate sits where the drive crosses it; the kit is fitted; window.__gate = the gate's spot and which way is out. */
const yard = `{ if (!window.__gk) { window.__gk = true;
  const G = cb.game, W = cb.world, c = W.camp, R = 10, drive = W.access.drive;
  const near = (pts) => { const gates = []; let acc = 0; for (let i = 1; i < pts.length; i++) { const [ax, az] = pts[i - 1], [bx, bz] = pts[i], l = Math.hypot(bx - ax, bz - az); for (let s = 0; s < l; s += 0.1) { const x = ax + (bx - ax) * s / l, z = az + (bz - az) * s / l; if (drive.some(p => Math.hypot(p[0] - x, p[1] - z) < 0.35) && !gates.some(g => Math.abs(g.at - (acc + s)) < 1.2)) gates.push({ at: acc + s, w: 0.6, x, z }); } acc += l; } return gates; };
  const x0 = c.x - R, x1 = c.x + R, z0 = c.z - R, z1 = c.z + R;
  const sides = [[[x0, z1], [x1, z1]], [[x1, z1], [x1, z0]], [[x1, z0], [x0, z0]], [[x0, z0], [x0, z1]]];
  for (const pts of sides) { const gs = near(pts); G.getState().planRun('container_wall', pts, gs.map(g => ({ at: g.at, w: g.w }))); if (gs.length && !window.__gate) { const g = gs[0]; const dx = c.x - g.x, dz = c.z - g.z, d = Math.hypot(dx, dz) || 1; window.__gate = { x: g.x, z: g.z, ix: dx / d, iz: dz / d }; } }
  G.setState(s => { const g = structuredClone(s.game);
    for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = g.clock.t - 400; }
    g.stock.sally_gate = 1; g.stock.gate_intercom = 1; g.stock.gate_motor = 1; g.utilities.lit = ['x'];
    return { game: g }; });
} }`;
const fig = (o, l) => `{ const W = cb.world, q = window.__gate, f = W._root.children.find(o => o.userData.type === 'scale_figure'); if (q && f) { const x = q.x - q.ix * ${o} - q.iz * ${l}, z = q.z - q.iz * ${o} + q.ix * ${l}; f.position.set(x, W.parcel.height(x, z), z); } }`;
const eye = (o, l, lo, ll, e = 0.28) => `{ const q = window.__gate; if (q) cb.cam.placeEye(q.x - q.ix * ${o} - q.iz * ${l}, q.z - q.iz * ${o} + q.ix * ${l}, q.x - q.ix * ${lo} - q.iz * ${ll}, q.z - q.iz * ${lo} + q.ix * ${ll}, ${e}); }`;
const air = (r, pitch, yaw) => `{ const q = window.__gate; if (q) { cb.cam.target.set(q.x + q.ix * 2, 0, q.z + q.iz * 2); cb.cam.radius = ${r}; cb.cam.pitch = ${pitch}; cb.cam.yaw = ${yaw}; } }`;
const SHOTS = [
  { name: 'eye-level-gate-kit-person', time: 10, season: 'summer', setup: yard + fig(2.2, 0.6) + eye(5.5, -2.2, -1, 0) },
  { name: 'eye-level-gate-from-inside', time: 15, season: 'summer', setup: yard + fig(-3.2, 0.4) + eye(-6.5, -1.2, 1, 0.2) },
  { name: 'aerial-gate-kit', time: 11, season: 'summer', setup: yard + air(14, 0.9, 0.5) },
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
      st.setTimeOfDay(s.time ?? 10); st.setSeasonMode(s.season ?? 'auto'); st.setWeatherMode('clear');
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
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
