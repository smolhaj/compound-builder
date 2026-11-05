// Gate alignment shots (src/game/perimeter/gateKitLayout.ts): the drive gate's kit (double gate / sally port, intercom pole and camera, caged motor, armed-response sign,
// open leaves, guard house, guard cars) on lots with different road headings and wall shapes. For each scenario: an aerial, an eye-level view down the approach with a
// person standing by the road, and an eye-level view from inside. The geometric guarantee itself is asserted without WebGL in src/game/perimeter/gateKitLayout.test.ts
// (heading within 3 degrees of the road, centered, flush with the wall, clear for a vehicle, on the ground, right way round, over many seeded lots).
//   node scripts/gateAlignShots.mjs <outDir> [port=5963] [only] [full]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5963), only = process.argv[4] && process.argv[4] !== '-' ? process.argv[4] : null, full = process.argv[5] === 'full';
mkdirSync(out, { recursive: true });

/** wall: perimeter kind, shape: ring outline for a compound wall (null = the whole property line); guards: the gate house and a guard car. */
const SCENARIOS = [
  { name: 'mw-hillside-property', q: 'region=mountain_west&lot=hillside&lotseed=2', wall: 'container_wall', shape: null },
  { name: 'plains-bench-corner-road', q: 'region=plains&lot=bench&lotseed=1', wall: 'container_wall', shape: null },
  { name: 'mw-ridge-octagon-oblique', q: 'region=mountain_west&lot=ridge&lotseed=1', wall: 'stone_wall', shape: 'octagon' },
  { name: 'ne-hillside-rounded', q: 'region=new_england&lot=hillside&lotseed=1', wall: 'stone_wall', shape: 'rounded' },
  { name: 'desert-bench-guards', q: 'region=desert&lot=bench&lotseed=1', wall: 'container_wall', shape: null, guards: true },
  { name: 'plains-mesa-octagon-guards', q: 'region=plains&lot=mesa&lotseed=1', wall: 'stone_wall', shape: 'octagon', guards: true },
].filter(s => !only || s.name.includes(only));

const setup = `async (s) => { const cb = window.__cb, G = cb.game, W = cb.world;
  if (!window.__ga) { window.__ga = true;
    G.getState().wallProperty(s.wall, cb.store.getState().siteGeo ?? {}, s.shape ?? undefined);
    G.setState(st => { const g = structuredClone(st.game);
      for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = g.clock.t - 400; for (const gt of r.gates) delete gt.garage; }
      g.stock.sally_gate = 1; g.stock.gate_intercom = 1; g.stock.gate_motor = 1; g.utilities.lit = ['x'];
      g.security = { response: { since: 0, paidDay: 0, missed: 0, downDays: 0, ended: null, calls: 0 } };
      if (s.guards) g.stock.gate_house = 1;
      return { game: g }; });
  }
  const m = await import('/src/game/perimeter/gateKitLayout.ts');
  const g = G.getState().game, e = m.entryGate(g.perimeter, W.access.drive);
  if (!e) { window.__ent = null; return 'no entry gate'; }
  const run = g.perimeter.find(r => r.id === e.runId), lay = m.gateKitLayout(e.gate, e.crossing, W.access.drive, run.pts);
  const t = m.headingAt(W.access.drive, e.crossing.driveArc);
  window.__m = m; window.__ent = { x: e.crossing.x, z: e.crossing.z, tx: t[0], tz: t[1], sin: e.crossing.sin, w: e.gate.w, kit: !!lay, arc: e.crossing.driveArc, drive: W.access.drive };
  return JSON.stringify({ ...window.__ent, drive: undefined }); }`;
/** A point `du` along the drive from the crossing (inside +) and `v` to its left, following the road's bend. */
const R = (du, v) => `window.__m.offsetAt(q.drive, q.arc + (${du}), (${v}))`;
const place = `const q = window.__ent; if (!q) return;`;
const fig = (du, v) => `{ ${place} const W = cb.world, f = W._root.children.find(o => o.userData.type === 'scale_figure'); if (f) { const [x, z] = ${R(du, v)}; f.position.set(x, W.groundAt(x, z), z); } }`;
const eye = (du, v, ldu, lv, e = 0.28) => `{ ${place} const [x, z] = ${R(du, v)}, [lx, lz] = ${R(ldu, lv)}; cb.cam.placeEye(x, z, lx, lz, ${e}); }`;
const air = (r, pitch, turn) => `{ ${place} const [x, z] = ${R(0.5, 0)}; cb.cam.target.set(x, 0, z); cb.cam.radius = ${r}; cb.cam.pitch = ${pitch}; cb.cam.yaw = Math.atan2(-q.tx, -q.tz) + ${turn}; }`;
const VIEWS = [
  { name: 'eye-approach-person', time: 10, setup: fig(-1.7, -0.62) + eye(-3.6, 0.1, 0.5, 0) },
  { name: 'eye-inside-person', time: 15, setup: fig(2.0, 0.6) + eye(3.8, -0.1, -0.3, 0) },
  { name: 'eye-side-person', time: 12, setup: fig(-1.1, -0.9) + eye(0.3, 2.4, 0.4, 0) },
  { name: 'aerial', time: 11, setup: air(8.5, 1.0, 0.35) },
  { name: 'aerial-top', time: 11, setup: air(6, 1.45, 0) },
];

const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let n = 0;
try {
  for (const s of SCENARIOS) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(180000);
    page.on('pageerror', e => console.error('pageerror:', e.message));
    await page.goto(`http://localhost:${port}/?clean&lowrender=0.75&seed=7&drive&${s.q}`);
    await page.waitForFunction(() => window.__cb?.qa?.lowrender);
    await page.evaluate(() => window.__cb.store.getState().setQuality('medium'));
    await page.evaluate(() => { window.__cb.game.getState().setSpeed(0); });
    const info = await page.evaluate(`(${setup})(${JSON.stringify(s)})`);
    console.log(s.name, info);
    for (const v of VIEWS) {
      await page.evaluate(v => {
        const { store, cam, world } = window.__cb, st = store.getState();
        st.setTimeOfDay(v.time); st.setSeasonMode('summer'); st.setWeatherMode('clear');
        window.__cb.qa.pose = null; st.setBuildingView?.('full'); world.setEyeView?.(null);
      }, v);
      const run = () => page.evaluate(v => { new Function('cb', v.setup)(window.__cb); }, v);
      await run();
      await page.evaluate(async () => { await window.__cb.qa.renderNow(); await window.__cb.qa.renderNow(); await window.__cb.qa.renderNow(); });
      await run();
      await page.evaluate(f => (f ? window.__cb.qa.renderFull('high') : window.__cb.qa.renderNow()), full);
      const file = `${out}/${String(++n).padStart(2, '0')}-${s.name}-${v.name}${full ? '-full' : ''}.png`;
      await page.screenshot({ path: file });
      console.log(file);
    }
    await page.close();
  }
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
