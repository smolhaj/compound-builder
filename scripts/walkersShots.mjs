// Wildlife, livestock, trucks and guard dogs on the route network: the herd turned out by day and driven in on a raid, the guard dog's inner post,
// wildlife kept off a wall / cliff, a vehicle's slope limit. Eye level (with a person) and from above.
//   flock $SP/render.lock node scripts/walkersShots.mjs <outDir> [port=5951]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5951);
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7&lowrender=0.7`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  await page.evaluate(() => window.__cb.store.getState().setQuality('low'));
  const frames = async () => { await page.evaluate(() => window.__cb.qa.renderNow()); };
  // run the walkers n steps of 0.1 s without drawing (drawing under swiftshader is slow), at hour h
  const run = (n, h = 11) => page.evaluate(([n, h]) => { const { world, game } = window.__cb, g = game.getState().game; for (let i = 0; i < n; i++) { world.updatePeople(0.1, g, h, 1); world.updateWildlife(0.1, g, 1); world.updateLivestock(0.1, g, h, 1); world.updateFleet(0.1, g, 1); } }, [n, h]);
  const shot = async (name) => { await frames(); await page.screenshot({ path: `${out}/${name}.png` }); lap(name); };

  await page.evaluate(async () => {
    const st = await import('/src/sim/state.ts');
    const pets = await import('/src/sim/pets.ts');
    const cb = window.__cb, G = cb.game; G.getState().setSpeed(0);
    const c = cb.world.camp;
    const g = structuredClone(G.getState().game);
    g.structures = g.structures.filter(x => Math.hypot(x.x - c.x, x.z - c.z) > 16);
    const B = [['farmhouse', -3, -4], ['barn', -10, -7.5], ['sheep_barn', 8, -7], ['chicken_coop', -8, 1.5], ['barnyard', 3, 5]];
    for (const [kind, dx, dz] of B) g.structures.push({ id: 'cb' + kind, kind, x: c.x + dx, z: c.z + dz, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    g.stock.goat = 4; g.stock.cow = 2; g.stock.sheep = 6; g.stock.pig = 3; g.stock.rabbit = 3;
    g.clock.t = Math.floor(g.clock.t) + 0.46;   // about 11 am
    g.gate.next = 1e9; g.gate.pending = null; g.gate.card = null;
    pets.adoptDog(g, { ageYears: 3, guard: true }); pets.adoptDog(g, { ageYears: 3, guard: true });
    G.setState({ game: g });
    G.getState().advance(0.01);
    cb.store.getState().setHudHidden(true);
    cb.store.getState().setTimeOfDay(11);
  });
  await frames(); await run(50); lap('built');

  // 1. turned out by day: eye level beside a barn, with a person in frame if one is near
  const look = async (name, fx, fz, dist, h = 0.34) => {
    await page.evaluate(([fx, fz, dist, h]) => {
      const { cam, world } = window.__cb, c = world.camp;
      const [ex, ez] = world.openSpotNear(c.x + fx + dist, c.z + fz + dist * 0.6, 0.6);
      cam.placeEye(ex, ez, c.x + fx, c.z + fz, h);
    }, [fx, fz, dist, h]);
    await shot(name);
  };
  await run(300);
  const animals = await page.evaluate(() => window.__cb.world.livestock.animals().map(a => `${a.kind}@${a.x.toFixed(1)},${a.z.toFixed(1)}${a.inside ? 'i' : ''}`));
  console.error('day herd', animals.join(' '));
  // a person standing at the paddock fence for scale (QA: put the first of the family there)
  await page.evaluate(() => {
    const { world, game } = window.__cb, g = game.getState().game, b = world.livestock.animals().find(a => a.kind === 'cow');
    const id = g.people.find(p => !p.kid).id, a = world.family._agents.get(id);
    if (b && a) { a.x = b.x - 1.4; a.z = b.z + 0.5; a.via = []; }
  });
  await run(1);
  await look('01-day-paddock-eye', -10, -5, 2.6, 0.3);
  await page.evaluate(() => { const cb = window.__cb, c = cb.world.camp; cb.qa.pose = null; cb.cam.target.set(c.x - 2, cb.world.groundAt(c.x, c.z) + 0.2, c.z - 2); cb.cam.radius = 20; cb.cam.pitch = 1.0; cb.cam.yaw = 0.4; });
  await shot('02-day-aerial');

  // 2. a raid: the animals are driven to the innermost shelter, hurrying
  await page.evaluate(() => { window.__cb.world.qaRaid = true; });
  console.error('dbg', JSON.stringify(await page.evaluate(async () => {
    const P = await import('/src/game/livestock/livestockPlan.ts');
    const { world, game } = window.__cb, g = game.getState().game;
    const homes = world._animalHomes(g);
    return { doorLock: world.doorLock, homes: homes.map(h => [h.id, h.kind, h.x.toFixed(1), h.z.toFixed(1), h.depth]), goal: P.animalGoal({ id: 'goat0', kind: 'goat' }, homes, { hour: 11, raided: true, storm: false, house: [world.camp.x, world.camp.z], clock: g.clock.t }), stock: g.stock.goat };
  })));
  await run(60);
  await shot('03-raid-driven-in-aerial');
  await run(400);
  console.error('raid herd', (await page.evaluate(() => window.__cb.world.livestock.animals().map(a => `${a.kind}@${a.x.toFixed(1)},${a.z.toFixed(1)}${a.inside ? ' in' : ' out'} w${a.wait.toFixed(1)} v${a.legs} g${a.goal}`))).join(' | '));
  await shot('04-raid-sheltered-aerial');
  await page.evaluate(() => { window.__cb.world.qaRaid = false; });

  // 3. the guard dogs' posts: the gate and just inside
  await page.evaluate(() => { const cb = window.__cb; cb.store.getState().setTimeOfDay(15); });
  await run(200, 15);
  const posts = await page.evaluate(() => { const w = window.__cb.world; return w.guardPosts.group.children.map(k => [k.position.x.toFixed(1), k.position.z.toFixed(1)]); });
  console.error('posts', JSON.stringify(posts), JSON.stringify(await page.evaluate(() => window.__cb.world.dogs.positions().map(d => [d.x.toFixed(1), d.z.toFixed(1)]))));
  await page.evaluate(() => {
    const cb = window.__cb, w = cb.world, k = w.guardPosts.group.children[w.guardPosts.group.children.length - 1];
    if (k) { const [ex, ez] = w.openSpotNear(k.position.x + 1.1, k.position.z + 0.7, 0.4); cb.cam.placeEye(ex, ez, k.position.x, k.position.z, 0.2); }
  });
  await shot('05-guard-post-eye');

  // 4. wildlife never ends up on hard ground (walls, buildings, cliffs) over a long run
  const wild = await page.evaluate(async () => {
    const cb = window.__cb, w = cb.world, G = cb.game;
    for (const sp of ['deer', 'rabbit', 'turkey']) for (let i = 0; i < 2; i++) { const [sx, sz] = w.openSpotNear(w.camp.x + 12 + i * 2, w.camp.z + 10, 0.6); w.wildlife.spawnDebug(sp, sx, sz, 0); }
    let bad = 0, n = 0; const seen = {}, start = {};
    const g = G.getState().game;
    for (let f = 0; f < 3000; f++) {
      w.updatePeople(0.1, g, 11, 1); w.updateWildlife(0.1, g, 1);
      if (f % 20 === 0) for (const a of w.wildlife.animals()) { const h = a.sp !== 'waterfowl' && w._animalHard(a.sp)(a.x, a.z); if (start[a.id] === undefined) start[a.id] = h; if (start[a.id]) continue; n++; if (h) { bad++; seen[a.id + ' ' + a.sp + ' ' + a.mood] = (seen[a.id + ' ' + a.sp + ' ' + a.mood] ?? 0) + 1; } }
    }
    return { samples: n, onHardGround: bad, seen };
  });
  console.error('wildlife', JSON.stringify(wild));
  await page.evaluate(() => { const cb = window.__cb, c = cb.world.camp; cb.qa.pose = null; cb.cam.target.set(c.x + 8, cb.world.groundAt(c.x, c.z) + 0.2, c.z + 6); cb.cam.radius = 16; cb.cam.pitch = 0.9; cb.cam.yaw = 0.7; });
  await shot('06-wildlife-aerial');
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
