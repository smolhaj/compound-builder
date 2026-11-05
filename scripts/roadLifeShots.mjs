// Life on the county road: peacetime, night (headlights), warning, aftermath (stalled cars, wanderers, roving crew), and the real
// encounter seen coming (a raid's convoy) and standing at the gate. Aerial + road-side eye level with a person for scale.
//   node scripts/roadLifeShots.mjs --out shots/roadlife --region plains [--lot gorge --relief 9 --elev 600] [--port 5731] [--only peace-day,night]
// One headless browser, ?lowrender, frames lifted with renderFull('medium').
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5731)), out = resolve(opt('--out', 'shots/roadlife')), region = opt('--region', 'plains'), lot = opt('--lot', '');
const only = opt('--only', '').split(',').filter(Boolean), tag = opt('--tag', lot ? `${region}-${lot}` : region);
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 680 } });
page.setDefaultTimeout(400000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
const q = `lowrender&clean&seed=7&region=${region}` + (lot ? `&lot=${lot}&relief=${opt('--relief', '9')}&acres=40&lotseed=3&elev=${opt('--elev', '600')}` : '');
try {
  await page.goto(`http://localhost:${port}/?${q}`);
  await page.waitForFunction(() => window.__cb?.qa?.renderNow, null, { timeout: 400000 });
  await page.evaluate(() => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality('medium'); });
  const shot = async n => { await page.evaluate(() => window.__cb.qa.renderFull('medium')); await page.waitForTimeout(150); const f = `${out}/${tag}-${n}.png`; await page.screenshot({ path: f }); console.log(f); };
  const look = async (tod, doy) => page.evaluate(([tod, doy]) => { const s = window.__cb.store.getState(); s.setWeatherMode('clear'); s.setSeasonMode('summer'); s.setDayOfYear(doy); s.setTimeOfDay(tod); }, [tod, doy]);
  // a world in a given phase of a given disaster
  const world = (kind, phase, days) => page.evaluate(async ([kind, phase, days]) => {
    const st = await import('/src/sim/state.ts'), dz = await import('/src/sim/disaster.ts');
    const G = window.__cb.game, g = structuredClone(G.getState().game);
    const tmp = st.newGame(g.seed, 160, 2027, { mode: 'scenario', peace: 'short', kind });
    g.disaster = tmp.disaster; const d = g.disaster;
    g.clock.t = phase === 'peace' ? d.warnAt - 3 : phase === 'warning' ? d.hitAt - 1 : d.hitAt + days;
    d.phase = phase === 'after' ? 'survival' : phase;
    d.tracks = dz.tracksAt(d, g.clock.t);
    g.gate.next = 1e9; g.gate.pending = null; g.gate.incoming = null; g.gate.card = null;
    G.setState({ game: g });
  }, [kind, phase, days]);
  const parties = (list) => page.evaluate(async list => {
    const rt = await import('/src/sim/roadTraffic.ts'), w = window.__cb.world;
    const gz = w.access.drive[0][1];
    const M = (kind, gap = 0, lat = 0, tint = 0.3, riders = 0, loaded = false) => ({ kind, gap, lat, tint, riders, loaded });
    const mk = (cls, dir, members, lights = true) => ({ id: 'q' + Math.random(), cls, dir, speed: 0, members, lights, heads: members.length });
    const L = -0.17;
    const defs = {
      sedan: (dir, z) => [mk('traffic', dir, [M('sedan', 0, -dir * 0.17, 0.1)]), z],
      pickup: (dir, z) => [mk('traffic', dir, [M('pickup', 0, -dir * 0.17, 0.35)]), z],
      suv: (dir, z) => [mk('traffic', dir, [M('suv', 0, -dir * 0.17, 0.6)]), z],
      van: (dir, z) => [mk('traffic', dir, [M('van', 0, -dir * 0.17, 0.2)]), z],
      bus: (dir, z) => [mk('bus', dir, [M('bus', 0, -dir * 0.17)]), z],
      semi: (dir, z) => [mk('traffic', dir, [M('semi', 0, -dir * 0.17)]), z],
      tractor: (dir, z) => [mk('farm', dir, [M('tractor', 0, dir * 0.33, 0.5)]), z],
      moto: (dir, z) => [mk('traffic', dir, [M('motorcycle', 0, -dir * 0.17, 0.5)]), z],
      bike: (dir, z) => [mk('cycle', dir, [M('bicycle', 0, dir * 0.4, 0.5)]), z],
      loaded: (dir, z) => [mk('traffic', dir, [M('suv', 0, -dir * 0.17, 0.3, 0, true), M('sedan', 1.3, -dir * 0.17, 0.7, 0, true)]), z],
      mil: (dir, z) => [mk('convoy', dir, [M('suv', 0, -dir * 0.17, 0.5), M('military', 1.9, -dir * 0.17), M('military', 3.8, -dir * 0.17)]), z],
      walkers: (dir, z) => [mk('wanderers', dir, [M('walker', 0, dir * 0.42, 0.1, 0, true), M('walker', 0.22, dir * 0.5, 0.5, 0, true), M('walker', 0.4, dir * 0.42, 0.8)], false), z],
      cartfam: (dir, z) => [mk('refugees', dir, [M('cart', 0, dir * 0.42, 0.1, 0, true), M('walker', 0.25, dir * 0.38, 0.2, 0, true), M('walker', 0.45, dir * 0.5, 0.6), M('walker', 0.7, dir * 0.42, 0.9, 0, true)], false), z],
      lone: (dir, z) => [mk('wanderers', dir, [M('walker', 0, dir * 0.42, 0.6, 0, true)], false), z],
      raiders: (dir, z) => [mk('raiders', dir, [M('raider', 0, -dir * 0.17, 0.1, 2), M('raider', 1.7, -dir * 0.17, 0.5, 3)], false), z],
    };
    rt; // (module is loaded so the page shares the sim code)
    w.roadLife.qaSet(list.map(([name, dir, dz]) => { const [spec, z] = defs[name](dir, gz + dz); return { spec, z }; }));
  }, list);
  const cams = async (name, wide = 17) => {
    await page.waitForTimeout(600);
    await page.evaluate(r => { const { world, cam } = window.__cb, gz0 = world.access.drive[0][1], st = world.roadLife.stalledAt()[0], gz = st ? st.z : gz0, x = world.county.x(gz), y = world.groundAt(x, gz); cam.target.set(x, y, gz); cam.radius = r; cam.pitch = 0.55; cam.yaw = 2.4; }, wide);
    await shot(name + '-aerial');
    await page.evaluate(() => { const { world, cam } = window.__cb, gz = world.access.drive[0][1], x = world.county.x(gz); const st = world.roadLife.stalledAt()[0]; const ez0 = st ? st.z : gz, ex0 = world.county.x(ez0); world.qaFigure(ex0 + 0.8, ez0 + 0.5); cam.placeEye(ex0 + 1.0, ez0 - 3.2, ex0, ez0 + 6, 0.3); });
    await shot(name + '-eye');
  };
  const want = n => !only.length || only.includes(n);
  if (want('peace-day')) { await world('grid_down', 'peace', 0); await look(8, 160); await parties([['sedan', 1, -1.5], ['pickup', -1, 6], ['bus', 1, 3], ['semi', -1, 12], ['tractor', 1, -9], ['moto', -1, 1.5], ['bike', 1, 1], ['van', 1, -5], ['suv', -1, 9]]); await cams('1-peace-day'); }
  if (want('peace-night')) { await look(22.5, 160); await parties([['sedan', 1, -3], ['pickup', -1, 8], ['semi', -1, 22], ['suv', 1, -12], ['van', -1, -1]]); await cams('2-peace-night'); }
  if (want('warning')) { await world('nuclear', 'warning', 0); await look(15, 160); await parties([['loaded', 1, -3], ['mil', -1, 8], ['loaded', -1, 22], ['sedan', 1, -14]]); await cams('3-warning'); }
  if (want('after-flare')) { await world('solar_flare', 'after', 4); await look(12, 160); await parties([['walkers', 1, -5], ['cartfam', -1, 9], ['lone', -1, 22]]); await cams('4-after-solar-flare', 12); }
  if (want('after-raiders')) { await world('lawless', 'after', 60); await look(17.5, 160); await parties([['raiders', 1, -7], ['cartfam', -1, 10], ['walkers', 1, 2]]); await cams('5-after-lawless'); }
  if (want('after-night')) { await world('grid_down', 'after', 40); await look(21.5, 160); await parties([['raiders', -1, 6], ['lone', 1, -2]]); await cams('6-after-night'); }
  if (want('precursor')) {
    await world('grid_down', 'after', 30); await look(3, 160);
    await page.evaluate(async () => {
      const G = window.__cb.game, g = structuredClone(G.getState().game);
      const day = Math.floor(g.clock.t + 0.25);
      g.clock.t = day - 0.25 + 3.2 / 24;
      const e = { id: 'eq1', kind: 'gang', day, title: 'An armed crew', dossier: [], size: 9, armed: true, strength: 100, stances: ['defend'] };
      g.gate.incoming = { e, at: day - 0.25 + 3.45 / 24 };
      G.setState({ game: g });
      window.__cb.world.roadLife.qaSet([]);
    });
    await cams('7-precursor-gang-9');
    await page.evaluate(async () => { const G = window.__cb.game, g = structuredClone(G.getState().game); g.gate.incoming = null; g.gate.pending = { id: 'eq2', kind: 'refugees', day: 1, title: 'A column of refugees', dossier: [], size: 11, armed: false, strength: 0, stances: ['take_in', 'turn_away'] }; G.setState({ game: g }); });
    await look(11, 160);
    await cams('8-gate-refugees-11');
  }
} catch (e) { console.error('ERR', e.message); }
await browser.close(); vite.kill();
process.exit(0);
