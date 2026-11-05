// Joiners bring their own things and choose where they stay: the gate card (brings line, stay options), a travel trailer and an RV on pads,
// a modular home delivered and set, a cabin built by the newcomers, eye level beside a person and from above.
//   flock $SP/render.lock node scripts/joinerShots.mjs <outDir> [port=5961]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5961);
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

  // the compound: a farmhouse, a cottage, a barn, a well, a garden, the hit three weeks ago, the banks still open
  await page.evaluate(async () => {
    const st = await import('/src/sim/state.ts');
    const cb = window.__cb, G = cb.game; G.getState().setSpeed(0);
    const c = cb.world.camp;
    const g = structuredClone(G.getState().game);
    g.structures = g.structures.filter(x => Math.hypot(x.x - c.x, x.z - c.z) > 16);
    const B = [['farmhouse', -3, -4], ['cottage', 5.2, -4.4], ['barn', -9, -7.5], ['well_drilled', 0.5, 4.5], ['garden', -3.5, -9], ['workshop', -6, 3]];
    for (const [kind, dx, dz] of B) g.structures.push({ id: 'cb' + kind, kind, x: c.x + dx, z: c.z + dz, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    const tmp = st.newGame(g.seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
    g.disaster = tmp.disaster;
    g.clock.t = 30.4; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
    g.stock.canned = 90; g.stock.staples = 12; g.stock.fuel = 10; g.stock.meds = 4; g.stock.sleeping_bag = 8; g.stock.tent = 1;
    g.money = 40000; g.utilities.grid = true;
    g.gate.next = 1e9; g.gate.pending = null; g.gate.card = null;
    for (const ps of g.personState) ps.employed = false;
    G.setState({ game: g });
    G.getState().advance(0.02);
  });
  await frames(); lap('built');

  const arrive = (arche, extras, stay, kin) => page.evaluate(async ([arche, extras, stay, kin]) => {
    const nc = await import('/src/sim/newcomers.ts');
    const kn = await import('/src/sim/kin.ts');
    const { mulberry32 } = await import('/src/sim/rng.ts');
    const G = window.__cb.game; const g = structuredClone(G.getState().game);
    let e;
    if (kin) {
      const fam = g.people.filter(p => !p.kid);
      const pool = kn.kinPool(g.seed, 0, g.people);
      e = kn.makeKinRequest(g, pool.slice(0, 2), false, mulberry32(4), 'k1');
      Object.assign(e.extras ??= {}, extras);
      void fam;
    } else {
      for (let i = 1; i < 800; i++) { e = nc.strangerArrival(g, mulberry32(i), `e${i}`, Math.floor(g.clock.t)); if (e.arche === arche && e.people.length >= 2) break; }
      e.secret = 'solid'; e.extras = { ...e.extras, ...extras }; e.dossier = e.dossier.map(l => l.startsWith('Brings: ') ? 'Brings: x.' : l);
    }
    if (stay) e.stay = stay;
    g.gate.pending = e;
    G.setState({ game: g });
  }, [arche, extras, stay, kin]);
  const take = () => page.evaluate(async () => {
    const E = await import('/src/sim/encounters.ts');
    const G = window.__cb.game; const g = structuredClone(G.getState().game);
    E.resolve(g, 'take_in'); g.gate.card = null; G.setState({ game: g }); G.getState().advance(0.02);
  });
  const setStay = (stay, placeRig = false) => page.evaluate(([stay, placeRig]) => window.__cb.store.getState().setStay(stay, placeRig), [stay, placeRig]);

  // 1. a couple with a trailer, a pickup and a tool kit at the gate: the stay options
  await arrive('couple', { cash: 22000, rig: 'travel_trailer', vehicle: 'pickup', tools: ['hammer', 'circular_saw', 'cordless_drill', 'wrench_set'] });
  await shot('01-gate-brings-and-stay');
  await page.getByText('more', { exact: true }).first().click().catch(() => {});
  await shot('02-gate-brings-more');
  await take();
  await frames();

  // 2. the same, a modular home bought with their own money
  await arrive('family', { cash: 90000 }, 'modular');
  await shot('03-gate-modular-option');
  await take();

  // 3. relatives: build them a place first
  await arrive('couple', {}, 'player_build', true);
  await shot('04-gate-kin-options');
  await page.evaluate(() => { const G = window.__cb.game; const g = structuredClone(G.getState().game); g.gate.pending = null; G.setState({ game: g }); });

  // 4. a trailer, an RV, a modular home delivered and set
  await page.evaluate(async () => {
    const jh = await import('/src/sim/joinerHome.ts');
    const cons = await import('/src/sim/construction.ts');
    const G = window.__cb.game; const g = structuredClone(G.getState().game);
    const st = g.structures.find(x => x.kind === 'modular_home');
    g.stock.modular_unit += 1; g.stock.concrete += 10; g.stock.hardware += 10; g.stock.roofing += 5; g.stock.lumber += 10;
    if (st) { st.permit = 'ok'; cons.addWork(g, st, 500); }
    const a = jh.anchorOf(g);
    const tail = g.people.at(-1);
    jh.parkRig(g, 'rv_camper', [tail.id]);
    G.setState({ game: g }); G.getState().advance(0.05);
    void a;
  });
  await frames();
  // re-spot against the terrain once, as the world would (the subscription in GameCanvas does it on its own)
  await page.waitForTimeout(500);
  const c = await page.evaluate(() => window.__cb.world.camp);
  await page.keyboard.press('h');
  const spots = await page.evaluate(() => window.__cb.game.getState().game.structures.filter(x => x.rig || x.joiner).map(x => ({ k: x.kind, x: x.x, z: x.z, sp: x.joiner?.spotted })));
  console.log('joiner structures', JSON.stringify(spots));
  const cx = spots.length ? spots.reduce((a, s) => a + s.x, 0) / spots.length : c.x, cz = spots.length ? spots.reduce((a, s) => a + s.z, 0) / spots.length : c.z;
  await page.evaluate(([x, z]) => { const cb = window.__cb; cb.qa.pose = null; cb.cam.target.set(x, cb.world.groundAt(x, z) + 0.3, z); cb.cam.radius = 13; cb.cam.pitch = 0.8; cb.cam.yaw = 0.7; }, [cx, cz]);
  await shot('05-aerial-rigs-and-modular');
  for (const [i, s] of spots.entries()) {
    await page.evaluate(([x, z]) => { const cb = window.__cb; cb.qa.pose = null; cb.cam.target.set(x, cb.world.groundAt(x, z) + 0.3, z); cb.cam.radius = 3.2; cb.cam.pitch = 0.45; cb.cam.yaw = 0.9; }, [s.x, s.z]);
    await shot(`06-close-${i}-${s.k}`);
  }
  // eye level beside a person next to the nearest joiner structure
  for (const [i, s] of spots.entries()) {
    const r = await page.evaluate(([tx, tz]) => {
      const cb = window.__cb, w = cb.world;
      const all = w.family.positions().filter(p => w.family.shown.has(p.id));
      let best = null, bd = Infinity;
      for (const p of all) { const d = Math.hypot(p.x - tx, p.z - tz); if (d < bd) { bd = d; best = p; } }
      if (!best) return { ok: false };
      // stand 2.3 out from the structure on the side away from the camp, eye height, looking at its door side; the person nearest it is in frame when close enough
      const c = w.camp, ux = tx - c.x, uz = tz - c.z, L = Math.hypot(ux, uz) || 1;
      const [ex, ez] = w.openSpotNear(tx + ux / L * 2.3 + uz / L * 1.0, tz + uz / L * 2.3 - ux / L * 1.0, 0.7);
      cb.qa.pose = { x: ex, y: w.groundAt(ex, ez) + 0.28, z: ez, lx: tx, ly: w.groundAt(tx, tz) + 0.2, lz: tz, fov: 58 };
      return { ok: true, d: bd };
    }, [s.x, s.z]);
    console.log('eye', s.k, JSON.stringify(r));
    await shot(`07-eye-${i}-${s.k}`);
  }
  console.error('done');
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
