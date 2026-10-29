// Night readability from above: before/after shots of the late-game compound at new / quarter / full moon, aerial and eye level.
//   flock <lock> node scripts/nightAerial.mjs <outDir> [port=5994] [--tier medium|low] [--phases new,quarter,full] [--hour 23] [--which before,after]
// "before" turns the aerial lift off (ws.aerialLiftOn = false). Needs ?lowrender (draws only when asked).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const out = args[0], port = Number(args[1] && !args[1].startsWith('--') ? args[1] : 5994);
const tier = opt('--tier', 'medium'), phases = opt('--phases', 'new,quarter,full').split(','), hour = Number(opt('--hour', 23)), which = opt('--which', 'before,after').split(',');
const gain = Number(opt('--gain', 1)), scene = 'full';
mkdirSync(out, { recursive: true });
// day of the year for each phase (skyState.moonPhase: phase = (doy / 29.53 + 0.37) % 1)
const DOY = { new: 19, quarter: 26, full: 4, gibbous: 1 };
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?clean&lowrender=0.7&seed=7`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  const frames = n => page.evaluate(n => new Promise(ok => { const f0 = window.__cb.qa.frames; const w = () => (window.__cb.qa.frames >= f0 + n ? ok() : setTimeout(w, 30)); w(); }), n);
  await page.evaluate(() => window.__cb.store.getState().setQuality('low'));
  // ── the scene ──
  const built = await page.evaluate(async ([kind]) => {
    const cb = window.__cb, G = cb.game, W = await import('/src/store/worldStore.ts');
    G.getState().setSpeed(0);
    const geo = W.useWorldStore.getState().siteGeo ?? {};
    if (kind === 'full') {
      G.getState().fortifyRing(geo, { towers: 5, towerKind: 'watchtower_wood', passage: false });
    }
    const c = cb.world.camp;
    const P = await import('/src/sim/pets.ts');
    G.setState(s => {
      const g = structuredClone(s.game);
      for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; }
      for (const st of g.structures) if (st.kind === 'gate_garage' || st.kind.startsWith('watchtower')) { st.stage = 5; st.supplied = false; st.finishedAt = 0; st.permit = 'ok'; }
      if (kind === 'full') {
        const B = [
          ['farmhouse', -3, -4, 0], ['cottage', 4.5, -4.5, 0], ['workshop', 7, 4.5, 3], ['barn', -8.5, -7.5, 0], ['chicken_coop', -8, -1.5, 1], ['garden', -3.5, -9, 0],
          ['greenhouse', 1.5, -9, 0], ['outhouse', 8, -2, 3], ['well_hand', 0.5, 4.5, 0], ['generator_shed', 3.5, 5.5, 0], ['solar_array', -2, 8, 0], ['orchard', 5, -10.5, 0], ['field', -9, 3, 0],
          ['greenhouse_heated', 13.5, -8, 0], ['orchard_grove', -13, -12, 0], ['solar_farm', 13, 8, 0], ['battery_bank', 14.8, 8.6, 0], ['pond', -13, 9, 0], ['reservoir', -4, 13, 0],
          ['sheep_barn', -14, -2.5, 0], ['equipment_yard', 12.5, 0.5, 3], ['guest_house', 10.5, -3.5, 0], ['moms_house', 1, 12.5, 2],
        ];
        for (const [k, dx, dz, rot] of B) g.structures.push({ id: 'cb' + k + dx, kind: k, x: c.x + dx, z: c.z + dz + 5, rot, stage: 99, done: 0, supplied: true, finishedAt: 0 });
        g.vehicles = ['pickup', 'suv', 'suv', 'motorhome', 'tractor', 'atv', 'trailer'].map((kd, i) => ({ id: 'pv' + i, kind: kd, mileage: 40000, condition: 0.9, fuel: 40, oilAt: 39000, serviceAt: 39500 }));
        g.stock.goat = 3; g.stock.sheep = 30; g.stock.hay = 40; g.stock.fieldstone = 99; g.stock.lumber = 99; g.stock.concrete = 99;
      }
      // twelve people
      while (g.people.length < 12) { const i = g.people.length, p = structuredClone(g.people[i % 4]); p.id = 'px' + i; p.name = 'Extra ' + i; g.people.push(p); const ps = structuredClone(g.personState[i % 4]); ps.id = p.id; g.personState.push(ps); }
      g.utilities.lit = ['x'];
      g.clock.t = 3 * 365 + 120.4; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
      return { game: g };
    });
    // four dogs
    G.setState(s => { const g = structuredClone(s.game); for (let i = 0; i < 4; i++) P.adoptDog(g); return { game: g }; });
    return { camp: c, people: G.getState().game.people.length, structures: G.getState().game.structures.length, dogs: G.getState().game.dogs?.length, vehicles: G.getState().game.vehicles?.length };
  }, [scene]);
  lap('built ' + JSON.stringify(built));
  await frames(6);
  // footpaths laid on the busiest walks (every kind), like a played-in compound
  await page.evaluate(() => {
    const cb = window.__cb, net = cb.world.paths.network, G = cb.game, kinds = ['gravel', 'stones', 'boards', 'paved'];
    net.edges.filter(e => !e.hidden).sort((a, b) => b.trips - a.trips).slice(0, 14).forEach((e, i) => { let k = kinds[i % 4]; if (k === 'paved' && !e.can.paved) k = 'gravel'; G.getState().layPaths([{ a: e.a, b: e.b, lenM: e.lenM }], k); });
  });
  await frames(6);

  await page.evaluate(() => { const cb = window.__cb; cb.store.getState().setHudHidden(true); cb.store.getState().setSeasonMode('summer'); cb.store.getState().setWeatherMode('clear'); cb.game.getState().setSpeed(0); });
  await page.evaluate(q => window.__cb.store.getState().setQuality(q), tier);
  for (const ph of phases) {
    // the moon phase follows the sim calendar's day of the year
    await page.evaluate(([doy, hour]) => {
      const cb = window.__cb;
      cb.store.getState().setTimeOfDay(hour);
      cb.store.getState().setDayOfYear(doy);
    }, [DOY[ph], hour]);
    for (const w of which) {
      await page.evaluate(([on, g]) => { window.__cb.ws.aerialLiftOn = on; window.__cb.ws.aerialLiftGain = g; }, [w === 'after', gain]);
      for (const [view, pose] of [['aerial', { yaw: 0.4, pitch: 0.75, radius: 34 }], ['high', { yaw: 0.4, pitch: 1.05, radius: 70 }], ['eye', null]]) {
        await page.evaluate(([view, pose]) => {
          const cb = window.__cb, c = cb.world.camp, gr = cb.world.groundAt;
          if (view !== 'eye') { cb.qa.pose = null; cb.cam.target.set(c.x, 0, c.z + 4); cb.cam.yaw = pose.yaw; cb.cam.pitch = pose.pitch; cb.cam.radius = pose.radius; }
          else { const x = c.x + 3.0, z = c.z + 11.5; cb.qa.pose = { x, y: gr(x, z) + 0.27, z, lx: c.x - 2, ly: gr(c.x - 2, c.z + 4) + 0.3, lz: c.z + 4, fov: 62 }; }
        }, [view, pose]);
        await frames(40);
        await page.evaluate(async q => { await window.__cb.qa.renderFull(q); }, tier);
        const info = await page.evaluate(() => ({ doy: window.__cb.store.getState().dayOfYear, camY: window.__cb.ws.camera.position.y, lift: window.__cb.ws._aerialLift }));
        await page.screenshot({ path: `${out}/${ph}-${view}-${w}.png` });
        lap(`${ph}/${view}/${w} ${JSON.stringify(info)}`);
      }
    }
  }
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
