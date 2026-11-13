// Family rituals (docs/DECISIONS.md 2026-11-13): dusk dinner at the table, the fireside evening, the night in real beds, and a breach that
// stops the table (alert) with the family coming back. Cutaway and eye level inside the lit farmhouse of a walled compound.
//   flock /tmp/cb.lock node scripts/ritualShots.mjs <outDir> [port=5961] [only=dinner|fire|night|raid|all]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5961), only = process.argv[4] || 'all';
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
const wait = ms => new Promise(r => setTimeout(r, ms));
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7&lowrender=0.7`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  await page.evaluate(() => window.__cb.store.getState().setQuality('low'));
  const frames = async () => { await page.evaluate(() => window.__cb.qa.renderNow()); };
  await frames(); lap('loaded');
  const shot = async (name) => { await frames(); await page.screenshot({ path: `${out}/${name}.png` }); lap(name); };
  const report = async tag => console.error(tag, JSON.stringify(await page.evaluate(() => {
    const cb = window.__cb, g = cb.game.getState().game, R = g.rituals;
    return { hour: ((g.clock.ticks * 0.25 + 6) % 24).toFixed(2), calm: R && +R.calm.toFixed(2), tasks: g.personState.map(p => p.task), shown: [...cb.world.family.shown].length, who: g.people.map(p => { const q = cb.world.family.poseOf(p.id); return q ? [p.first, +q.x.toFixed(2), +q.z.toFixed(2)] : [p.first]; }), line: cb.store.getState().homeLine?.text };
  })));
  // jump the clock to an hour and let the people be where they should (a jump of more than 0.05 days puts everyone at their goals)
  const stage = async (hour, patch) => {
    await page.evaluate(([h, patch]) => {
      const G = window.__cb.game, g = structuredClone(G.getState().game);
      g.clock.t = Math.floor(g.clock.t) + (h - 6) / 24; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
      if (patch) (new Function('g', patch))(g);
      G.setState({ game: g });
      G.getState().advance(0.0125);
    }, [hour, patch]);
    await wait(500); await frames();
  };
  const tick = async days => { await page.evaluate(d => window.__cb.game.getState().advance(d), days); await wait(1500); await frames(); };

  await page.evaluate(async () => {
    const P = await import('/src/sim/perimeter.ts');
    const cb = window.__cb, G = cb.game; G.getState().setSpeed(0);
    const c = cb.world.camp;
    const g = structuredClone(G.getState().game);
    g.structures = g.structures.filter(x => Math.hypot(x.x - c.x, x.z - c.z) > 16);
    const B = [['farmhouse', -3, -4], ['barn', -9, -7.5], ['well_drilled', 0.5, 4.5], ['garden', -3.5, -9], ['chicken_coop', 3, 2.5]];
    for (const [kind, dx, dz] of B) g.structures.push({ id: 'cb' + kind, kind, x: c.x + dx, z: c.z + dz, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    const R = 12;
    const run = P.planRun(g, 'log_palisade', [[c.x - R, c.z - R], [c.x + R, c.z - R], [c.x + R, c.z + R], [c.x - R, c.z + R], [c.x - R, c.z - R]], [{ at: 50, w: 0.6 }]);
    run.done = run.hours; run.supplied = true; run.finishedAt = 0;
    g.stock.canned = 90; g.stock.staples = 12; g.stock.fuel = 10; g.stock.sleeping_bag = 8; g.stock.dog = 1;
    g.gate.next = 1e9; g.gate.pending = null; g.gate.card = null;
    for (const ps of g.personState) ps.employed = false;
    G.setState({ game: g });
    G.getState().advance(0.02);
    const S = await import('/src/game/atmosphere/homeSafety.ts');
    const g2 = G.getState().game;
    window.__lvl = S.homeSafety(S.homeSafetyInput(g2)).level;
    cb.store.getState().setHudHidden(true);
    cb.store.getState().setBuildingView('cutaway');
    const f = g2.structures.find(s => s.kind === 'farmhouse');
    window.__f = { x: f.x, z: f.z, rot: f.rot };
  });
  console.error('safety level', await page.evaluate(() => window.__lvl));
  await frames(); lap('built');
  const cam = (r, pitch, yaw, dy = 0.12) => page.evaluate(([r, pitch, yaw, dy]) => { const { cam } = window.__cb, f = window.__f; cam.target.set(f.x, dy, f.z); cam.radius = r; cam.pitch = pitch; cam.yaw = yaw; }, [r, pitch, yaw, dy]);
  // eye level at the table: from just inside, looking at the nearest seated person
  const eye = async (back = 0.55, up = 0.2) => page.evaluate(([back, up]) => {
    const cb = window.__cb, g = cb.game.getState().game, f = window.__f;
    const ps = g.people.map(p => cb.world.family.poseOf(p.id)).filter(Boolean);
    const mx = ps.reduce((a, p) => a + p.x, 0) / ps.length, mz = ps.reduce((a, p) => a + p.z, 0) / ps.length;
    const fl = cb.world.tourHeight(mx, mz);
    const dx = mx - f.x, dz = mz - f.z, d = Math.hypot(dx, dz) || 1;
    cb.qa.pose = { x: mx + (dx / d) * back + 0.0, y: fl + up, z: mz + (dz / d) * back, lx: mx, ly: fl + 0.12, lz: mz, fov: 62 };
  }, [back, up]);
  const free = () => page.evaluate(() => { window.__cb.qa.pose = null; });

  if (only === 'all' || only === 'dinner') {
    await page.evaluate(() => window.__cb.store.getState().setTimeOfDay(18.3));
    // 5:30 p.m.: everyone about the yard; then the clock runs on to supper
    await stage(17.5);
    await cam(3.4, 0.9, 0.5); await shot('00-yard-before-supper');
    for (let k = 0; k < 4; k++) { await tick(0.004); await report('walk' + k); await shot('01-supper-walk-' + k); }
    await stage(18.4);
    await wait(9000); await frames(); await report('seated');
    await cam(2.4, 0.95, 0.55); await shot('02-dinner-cutaway-above');
    await cam(1.6, 0.5, 0.55); await shot('03-dinner-cutaway-low');
    await eye(); await shot('04-dinner-eye-level'); await free();
    // a caption line, with the HUD back
    await page.evaluate(() => { const cb = window.__cb; cb.world._lineAcc = 99; cb.store.getState().setHudHidden(false); });
    await cam(2.4, 0.7, 0.55); await frames(); await wait(600); await frames(); await report('line');
    await shot('05-dinner-with-line');
    await page.evaluate(() => window.__cb.store.getState().setHudHidden(true));
  }
  if (only === 'all' || only === 'fire') {
    await page.evaluate(() => window.__cb.store.getState().setTimeOfDay(20.3));
    await stage(20.3); await wait(9000); await frames(); await report('fire');
    await cam(2.4, 0.95, 0.55); await shot('06-fireside-cutaway-above');
    await eye(0.5, 0.18); await shot('07-fireside-eye-level'); await free();
    await cam(1.5, 0.45, -0.7); await shot('08-fireside-low-from-the-hearth');
  }
  if (only === 'all' || only === 'night') {
    await page.evaluate(() => window.__cb.store.getState().setTimeOfDay(23.5));
    await stage(23.5); await wait(3000); await frames(); await report('night');
    await cam(2.4, 1.0, 0.55); await shot('09-night-beds-cutaway-above');
    await cam(1.2, 0.5, 0.7, 0.1); await shot('10-night-beds-low');
  }
  if (only === 'all' || only === 'raid') {
    await page.evaluate(() => window.__cb.store.getState().setTimeOfDay(18.6));
    await stage(18.4); await wait(9000);
    await page.evaluate(() => { window.__cb.world.qaRaid = true; });
    await wait(3000); await frames(); await wait(6000); await frames(); await report('raid');
    await page.evaluate(() => { window.__cb.store.getState().setHudHidden(false); window.__cb.world._lineAcc = 99; });
    await cam(2.4, 0.95, 0.55); await frames(); await wait(700); await shot('11-raid-alert-cutaway');
    await page.evaluate(() => { window.__cb.store.getState().setHudHidden(true); });
    await eye(0.5, 0.18); await shot('12-raid-alert-eye-level'); await free();
    await page.evaluate(() => { window.__cb.world.qaRaid = false; });
    for (let k = 0; k < 4; k++) { await wait(9000); await frames(); await report('recover' + k); await cam(2.4, 0.95, 0.55); await shot('13-recover-' + k); }
  }
} finally { await browser.close(); vite.kill(); }
