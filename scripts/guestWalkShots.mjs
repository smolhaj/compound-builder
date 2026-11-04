// Guests walking in from the road and out again (QA; derived from newcomersShots.mjs). Neighbors and strangers who join: the gate card (stranger + "how many can we carry"), the neighbor request card,
// the Family tab, and the compound with newcomers housed. Run from the repo root under the render lock:
//   flock $SP/render.lock node scripts/newcomersShots.mjs <outDir> [port=5941]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5941);
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7&lowrender=0.8`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  await page.evaluate(() => window.__cb.store.getState().setQuality('low'));
  const frames = async () => { await page.evaluate(() => window.__cb.qa.renderNow()); };
  await frames(); lap('loaded');
  const shot = async (name, o = {}) => { await frames(); await page.screenshot({ path: `${out}/${name}.png`, ...o }); lap(name); };

  // the compound: a house, a guest house, a cottage, the barn, the garden; the hit three weeks ago
  await page.evaluate(async () => {
    const st = await import('/src/sim/state.ts');
    const cb = window.__cb, G = cb.game; G.getState().setSpeed(0);
    const c = cb.world.camp;
    const g = structuredClone(G.getState().game);
    g.structures = g.structures.filter(x => Math.hypot(x.x - c.x, x.z - c.z) > 16);
    const B = [['farmhouse', -3, -4], ['guest_house', 0.9, -8.2], ['cottage', 5.2, -4.4], ['barn', -9, -7.5], ['metal_garage', 6.8, 2.4], ['well_drilled', 0.5, 4.5], ['garden', -3.5, -9], ['workshop', -6, 3]];
    for (const [kind, dx, dz] of B) g.structures.push({ id: 'cb' + kind, kind, x: c.x + dx, z: c.z + dz, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    const tmp = st.newGame(g.seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
    g.disaster = tmp.disaster;
    g.clock.t = Math.floor(g.disaster.hitAt + 24) + 0.4; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
    g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
    g.stock.canned = 90; g.stock.staples = 12; g.stock.fuel = 10; g.stock.meds = 4; g.stock.sleeping_bag = 8; g.stock.tent = 1;
    g.gate.next = 1e9; g.gate.pending = null; g.gate.card = null;
    for (const ps of g.personState) ps.employed = false;
    G.setState({ game: g });
    G.getState().advance(0.02);
  });
  await frames(); lap('built');


  const cam = (x, z, r, pitch, yaw) => page.evaluate(([x, z, r, pitch, yaw]) => { const cb = window.__cb; cb.qa.pose = null; cb.cam.target.set(x, cb.world.groundAt(x, z) + 0.3, z); cb.cam.radius = r; cb.cam.pitch = pitch; cb.cam.yaw = yaw; }, [x, z, r, pitch, yaw]);
  const follow = (r = 6) => page.evaluate((r) => { const cb = window.__cb, w = cb.world; const ids = Object.values(cb.game.getState().game.newcomers.bonds).filter(b => b.kind === 'guest').map(b => b.id); const p = w.family.positions().find(q => ids.includes(q.id) && w.family.shown.has(q.id)); if (!p) return; cb.qa.pose = null; cb.cam.target.set(p.x, w.groundAt(p.x, p.z) + 0.2, p.z); cb.cam.radius = r; cb.cam.pitch = 0.45; cb.cam.yaw = 0.6; }, r);
  const info = () => page.evaluate(() => {
    const cb = window.__cb, g = cb.game.getState().game, w = cb.world;
    const ids = Object.values(g.newcomers.bonds).filter(b => b.kind === 'guest').map(b => b.id);
    const pos = w.family.positions().filter(p => ids.includes(p.id)).map(p => ({ id: p.id, x: +p.x.toFixed(2), z: +p.z.toFixed(2), shown: w.family.shown.has(p.id) }));
    return { entry: w.access.drive[0], gate: w.access.gate, camp: w.camp, pos };
  });
  await page.keyboard.press('h');
  // a neighbor household in a storm, taken in
  await page.evaluate(async () => {
    const nc = await import('/src/sim/newcomers.ts'); const E = await import('/src/sim/encounters.ts');
    const { mulberry32 } = await import('/src/sim/rng.ts');
    const G = window.__cb.game; const g = structuredClone(G.getState().game);
    g.clock.t = Math.floor(g.clock.t) + (11 - 6) / 24; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
    const n = g.neighbors.find(x => x.kind === 'young_family' || x.kind === 'old_farmer') ?? g.neighbors[0];
    n.disposition = 40; n.status = 'home'; n.members = Math.max(3, n.members);
    const day = Math.floor(g.clock.t); window.__disp0 = n.disposition; window.__nid = n.id;
    g.weather = { active: { kind: 'blizzard', at: day, until: day + 1 }, last: -999 };
    nc.requestShelter(g, n, 'storm', mulberry32(3));
    G.setState({ game: g });
  });
  await page.evaluate(() => window.__cb.game.getState().advance(0.001));
  await frames();
  const c0 = await info(); console.log('before', JSON.stringify(c0.entry), JSON.stringify(c0.gate));
  const mid = [(c0.entry[0] + c0.camp.x) / 2, (c0.entry[1] + c0.camp.z) / 2];
  await cam(mid[0], mid[1], 22, 1.0, 0.4);
  await page.evaluate(async () => { const E = await import('/src/sim/encounters.ts'); const G = window.__cb.game; const g = structuredClone(G.getState().game); E.resolve(g, 'take_in'); g.gate.card = null; G.setState({ game: g }); });
  // arrival: sample positions in real time
  for (let k = 0; k < 6; k++) {
    await page.waitForTimeout(7000); await follow(); await frames();
    const i = await info(); console.log('arrive', k, JSON.stringify(i.pos.slice(0, 3)));
    await shot(`arrive-${k}`);
  }
  // eye level beside a guest on the drive
  await page.evaluate(() => { const cb = window.__cb, w = cb.world; const ids = Object.values(cb.game.getState().game.newcomers.bonds).filter(b => b.kind === 'guest').map(b => b.id); const p = w.family.positions().find(q => ids.includes(q.id) && w.family.shown.has(q.id)); if (p) { const x = p.x + 1.2, z = p.z + 0.3; cb.qa.pose = { x, y: w.groundAt(x, z) + 0.28, z, lx: p.x, ly: w.groundAt(p.x, p.z) + 0.2, lz: p.z, fov: 52 }; } });
  await shot('arrive-eye');
  // let them settle in, then the day is up: advance small steps (a big jump would teleport them)
  await page.evaluate(() => { const G = window.__cb.game; const g = structuredClone(G.getState().game); const N = g.newcomers; for (const p of Object.values(N.guests)) p.until = Math.floor(g.clock.t); for (const b of Object.values(N.bonds)) if (b.guestUntil != null) b.guestUntil = Math.floor(g.clock.t); g.weather = { active: null, last: Math.floor(g.clock.t) }; g.clock.t = Math.floor(g.clock.t) + 0.9; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24)); G.setState({ game: g }); G.getState().advance(0.001); });
  await cam(mid[0], mid[1], 22, 1.0, 0.4);
  let left = false;
  for (let k = 0; k < 60 && !left; k++) { await page.evaluate(() => window.__cb.game.getState().advance(0.03)); left = await page.evaluate(() => Object.values(window.__cb.game.getState().game.newcomers.bonds).some(b => b.guestUntil != null) && window.__cb.game.getState().game.personState.some(p => p.needs.left)); await page.evaluate(() => { const G = window.__cb.game; const g = G.getState().game; if (g.gate.pending) { const s = structuredClone(g); s.gate.pending = null; G.setState({ game: s }); } }); }
  console.log('left', left);
  for (let k = 0; k < 6; k++) {
    await page.waitForTimeout(7000); await follow(); await frames();
    const i = await info(); console.log('leave', k, JSON.stringify(i.pos.slice(0, 3)));
    await shot(`leave-${k}`);
  }
  console.log(await page.evaluate(() => { const g = window.__cb.game.getState().game; const n = g.neighbors.find(x => x.id === window.__nid); return { disp0: window.__disp0, disp: n.disposition, log: g.log.slice(-6) }; }));
} finally { await browser.close(); vite.kill(); }
