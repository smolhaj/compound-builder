// Daily life screenshots (adapted from compoundShot.mjs). Run from the worktree: node ../dailyShot.mjs <out> [only]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/');
const { chromium } = require('playwright');
const port = Number(process.env.PORT ?? 5350), out = process.argv[2], only = process.argv[3] ?? '';
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(ok => vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7`);
  await page.waitForFunction(() => window.__cb, null, { timeout: 300000 });
  await page.evaluate(() => window.__cb.store.getState().setQuality('low'));
  const frames = async n => { const f0 = await page.evaluate(() => window.__cb.qa.frames); await page.waitForFunction(k => window.__cb.qa.frames >= k, f0 + n, { polling: 200 }); };
  await frames(3); lap('loaded');
  // the compound: home, garden, coop, field, well, a wall; a family of six (two taken in)
  await page.evaluate(async () => {
    const P = await import('/src/sim/perimeter.ts');
    const cb = window.__cb, G = cb.game; G.getState().setSpeed(0);
    const c = cb.world.camp;
    const g = structuredClone(G.getState().game);
    g.structures = g.structures.filter(x => Math.hypot(x.x - c.x, x.z - c.z) > 13);
    const B = [
      ['farmhouse', -3, -4], ['cottage', 4, -4.5], ['workshop', 6.5, 5], ['well_drilled', 0.5, 4.5],
      ['garden', -3.5, -8], ['garden', -6.2, -8], ['chicken_coop', -4.5, 2.6], ['field', 5, -10], ['water_tower', 7.5, 0.5],
    ];
    for (const [kind, dx, dz] of B) g.structures.push({ id: 'cb' + kind + dx, kind, x: c.x + dx, z: c.z + dz, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    const R = 11;
    const run = P.planRun(g, 'log_palisade', [[c.x - R, c.z - R], [c.x + R, c.z - R], [c.x + R, c.z + R], [c.x - R, c.z + R], [c.x - R, c.z - R]], [{ at: 50, w: 0.6 }]);
    run.done = run.hours; run.supplied = true; run.finishedAt = 0;
    // two people taken in last year
    const base = g.people[0];
    const extra = [{ id: 'px1', first: 'Rosa', last: 'Delgado', age: 34, kid: false, body: 'f', shirt: 0x6a3a6a }, { id: 'px2', first: 'Hank', last: 'Novak', age: 41, kid: false, body: 'm', shirt: 0x5a6e3a }];
    for (const e of extra) { g.people.push({ ...base, ...e, skills: { ...base.skills }, job: undefined, partner: undefined, kin: false }); g.personState.push({ ...structuredClone(g.personState[0]), id: e.id, fatigue: 0, employed: false }); }
    for (const ps of g.personState) ps.employed = false;
    g.armory.guns.push({ id: 'g1', model: 'colt_6920', condition: 1, fired: 0, where: 'house', carrier: null });
    window.__compound = { c, g: structuredClone(g) };
    G.setState({ game: g });
  });
  await frames(4); lap('built');
  const cam = (x, z, r, pitch, yaw, dy = 0.2) => page.evaluate(([x, z, r, pitch, yaw, dy]) => { const cb = window.__cb; cb.cam.target.set(x, cb.world.groundAt(x, z) + dy, z); cb.cam.radius = r; cb.cam.pitch = pitch; cb.cam.yaw = yaw; }, [x, z, r, pitch, yaw, dy]);
  const shot = async name => { await frames(3); await page.screenshot({ path: `${out}/${name}.png` }); lap(name); };
  const c = await page.evaluate(() => window.__compound.c);

  // ── a busy morning: everyone painted onto a chore, then the clock jumps so they're at it ──
  if (!only || only === 'morning') {
    await page.evaluate(async () => {
      const D = await import('/src/sim/daily.ts');
      const G = window.__cb.game;
      const g = structuredClone(window.__compound.g);
      // late June, 08:00
      const day = Math.floor(g.clock.t) + 70; g.clock.t = day + 2 / 24; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
      const duties = ['wood', 'laundry', 'livestock', 'garden', 'wood', 'garden'];
      g.people.forEach((p, i) => { D.setDuty(g, p.id, [6, 7, 8, 9, 10, 11], duties[i] ?? 'garden'); });
      D.dailyOf(g).chores.levels.weeds = 60; D.dailyOf(g).chores.levels.laundry = 70; D.dailyOf(g).chores.levels.woodpile = 70;
      g.upkeep.green.push({ ricks: 4, at: g.clock.t - 10 });
      G.setState({ game: g });
      G.getState().advance(0.08);
      return G.getState().game.personState.map(ps => ps.task);
    }).then(t => console.log('morning tasks', JSON.stringify(t)));
    await frames(4);
    await cam(c.x - 1, c.z - 2.5, 13, 0.62, 2.6); await shot('morning-overview');
    // eye level in the yard: the chopping block, the line
    await cam(c.x - 0.1, c.z + 0.2, 2.6, 0.1, 2.5, 0.12); await shot('morning-yard-eye');
    await cam(c.x + 0.4, c.z - 0.2, 2.4, 0.1, -2.2, 0.12); await shot('morning-laundry-eye');
    // the garden and the coop
    await cam(c.x - 4.5, c.z - 5.5, 4.2, 0.18, 2.9, 0.12); await shot('morning-garden-eye');
  }
  // ── cleaning and pet care at work, mid-morning ──
  if (!only || only === 'cleaning') {
    await page.evaluate(async () => {
      const D = await import('/src/sim/daily.ts');
      const G = window.__cb.game;
      const g = structuredClone(window.__compound.g);
      const day = Math.floor(g.clock.t) + 70; g.clock.t = day + 3 / 24; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
      g.stock.dog = 2;
      const duties = ['cleaning', 'pets', 'cleaning', 'pets', 'kitchen', 'repairs'];
      g.people.forEach((p, i) => { D.setDuty(g, p.id, [6, 7, 8, 9, 10, 11], duties[i] ?? 'cleaning'); });
      G.setState({ game: g });
      G.getState().advance(0.08);
      return G.getState().game.personState.map(ps => ps.task);
    }).then(t => console.log('cleaning tasks', JSON.stringify(t)));
    await frames(4);
    await cam(c.x - 1, c.z - 2.5, 13, 0.62, 2.6); await shot('cleaning-overview');
    await cam(c.x + 0.9, c.z - 0.3, 2.6, 0.1, -2.2, 0.12); await shot('cleaning-eye');
    await cam(c.x - 0.4, c.z + 0.1, 2.6, 0.1, 2.4, 0.12); await shot('pets-eye');
  }
  // ── no house yet: everyone asleep on bedrolls at the tent at 02:15, one on watch ──
  if (!only || only === 'tent') {
    await page.evaluate(async () => {
      const D = await import('/src/sim/daily.ts');
      const G = window.__cb.game;
      const g = structuredClone(window.__compound.g);
      g.structures = g.structures.filter(x => !['farmhouse', 'cottage'].includes(x.kind));
      g.disaster.kind = 'grid_down'; g.disaster.hitAt = -30; g.disaster.warnAt = -40; g.disaster.phase = 'survival';
      g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0, grid: 0 };
      const day = Math.floor(g.clock.t) + 120; g.clock.t = day + (2.25 - 6 + 24) / 24; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
      D.dailyOf(g).plan.day = -1;
      G.setState({ game: g });
      G.getState().advance(0.02);
      return G.getState().game.personState.map(ps => ps.task);
    }).then(t => console.log('tent tasks', JSON.stringify(t)));
    await frames(4);
    await cam(c.x, c.z, 7, 0.5, 2.4, 0.1); await shot('tent-night-above');
    await cam(c.x + 0.2, c.z - 0.2, 2.2, 0.1, 2.0, 0.1); await shot('tent-night-eye');
  }
  // ── the schedule panel ──
  if (!only || only === 'panel') {
    await page.evaluate(async () => {
      const G = window.__cb.game;
      const g = structuredClone(window.__compound.g);
      g.disaster.kind = 'grid_down'; g.disaster.hitAt = -30; g.disaster.warnAt = -40; g.disaster.phase = 'survival';
      g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0, grid: 0 };
      const day = Math.floor(g.clock.t) + 150; g.clock.t = day + 0.15; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
      g.upkeep.green.push({ ricks: 3, at: g.clock.t - 10 });
      G.setState({ game: g });
      G.getState().advance(0.05);
      const D = await import('/src/sim/daily.ts');
      G.getState().daily(s => { D.dailyOf(s).chores.levels.laundry = 72; D.dailyOf(s).chores.levels.fences = 48; return null; });
      G.getState().openSchedule(true);
    });
    await shot('schedule-panel');
    await page.evaluate(() => window.__cb.game.getState().openSchedule(false));
  }
  // ── an evening cookout at the fire pit, string lights on ──
  if (!only || only === 'cookout') {
    await page.evaluate(async () => {
      const Gt = await import('/src/sim/gatherings.ts');
      const D = await import('/src/sim/daily.ts');
      const G = window.__cb.game;
      const g = structuredClone(window.__compound.g);
      const day = Math.floor(g.clock.t) + 80; g.clock.t = day + (19.6 - 6) / 24; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
      g.stock.fresh = 30; g.stock.frozen = 4;
      D.dailyOf(g);
      Gt.callGathering(g, 'cookout');
      G.setState({ game: g });
      G.getState().advance(0.07);
      const s = G.getState().game;
      return { tasks: s.personState.map(ps => ps.task), log: s.log.slice(-4).map(l => l.text) };
    }).then(t => console.log('cookout', JSON.stringify(t)));
    await frames(4);
    await cam(c.x + 0.2, c.z + 0.45, 3.2, 0.2, 2.75, 0.1); await shot('cookout');
    await cam(c.x + 0.3, c.z + 0.5, 2.0, 0.07, 3.3, 0.13); await shot('cookout-eye');
    await cam(c.x, c.z, 8, 0.55, 2.4, 0.1); await shot('cookout-above');
  }
  // ── night watch on the wall (threat high) ──
  if (!only || only === 'watch') {
    const w = await page.evaluate(async () => {
      const D = await import('/src/sim/daily.ts');
      const G = window.__cb.game;
      const g = structuredClone(window.__compound.g);
      g.disaster.kind = 'grid_down'; g.disaster.hitAt = -30; g.disaster.warnAt = -40; g.disaster.phase = 'survival';
      g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0, grid: 0 };
      const day = Math.floor(g.clock.t) + 120; g.clock.t = day + (22.5 - 6) / 24; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
      D.dailyOf(g).plan.day = -1;
      G.setState({ game: g });
      G.getState().advance(0.07);
      return D.watchNow(G.getState().game);
    });
    console.log('watch', JSON.stringify(w));
    await frames(4);
    await cam(c.x + 2, c.z + 9, 6, 0.3, 0.3, 0.2); await shot('night-watch');
  }
} finally { await browser.close(); vite.kill(); }
