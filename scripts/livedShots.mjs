// Lived-in compound shots with ?lowrender (cheap on-demand frames).
//   flock <lock> node scripts/livedShots.mjs <outDir> [port=5961] [only=-] [age=day1|year1|year3|spring3] [season=summer|fall|winter|spring] [full|-] [hour=11]
// One compound laid out round the camp (house, cottage, workshop, barn, coop, garden, greenhouse, outhouse, well, sheds, a container-wall ring),
// the family with kids and dogs, aged by the game clock (finishedAt = 0, clock = age) so props and paths follow the place's age.
// `only` is a comma list of view names. Env: Q=low|medium|high (default medium), SNOW=1 lays snow, MUD=1 forces mud season, DOGS=0 / KIDS=0.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5961), only = process.argv[4] && process.argv[4] !== '-' ? process.argv[4].split(',') : null;
const age = ['year1', 'year3', 'spring3'].includes(process.argv[5]) ? process.argv[5] : 'day1', season = process.argv[6] || 'summer', full = process.argv[7] === 'full', hour = Number(process.argv[8] || 11);
const quality = process.env.Q || 'medium';
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(240000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(`http://localhost:${port}/?clean&lowrender=0.75&seed=7`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await page.evaluate(q => window.__cb.store.getState().setQuality(q), quality);
  const frames = async () => page.evaluate(async () => { await window.__cb.qa.renderNow(); await window.__cb.qa.renderNow(); });
  await frames(); lap('loaded');
  const info = await page.evaluate(async ([age, season, hour, env]) => {
    const cb = window.__cb, G = cb.game, st = cb.store.getState();
    G.getState().setSpeed(0);
    const c = cb.world.camp;
    const g = structuredClone(G.getState().game);
    g.structures = [];
    const B = [
      ['farmhouse', -3, -4, 0], ['cottage', 4.5, -4.5, 0], ['workshop', 7, 4.5, 3], ['barn', -8.5, -7.5, 0], ['chicken_coop', -8, -1.5, 1], ['garden', -3.5, -9, 0],
      ['greenhouse', 1.5, -9, 0], ['outhouse', 8, -2, 3], ['well_hand', 0.5, 4.5, 0], ['generator_shed', 3.5, 5.5, 0], ['solar_array', -2, 8, 0], ['orchard', 5, -10.5, 0], ['field', -9, 3, 0],
    ];
    for (const [kind, dx, dz, rot] of B) g.structures.push({ id: 'cb' + kind + dx, kind, x: c.x + dx, z: c.z + dz + 5, rot, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    const P = await import('/src/sim/perimeter.ts');
    const R = 11.3, zc = c.z + 4.2;
    const run = P.planRun(g, 'container_wall', [[c.x - R, zc - R], [c.x + R, zc - R], [c.x + R, zc + R], [c.x - R, zc + R], [c.x - R, zc - R]], [{ at: 60, w: 0.6 }]);
    run.done = run.hours; run.supplied = true; run.finishedAt = 0;
    g.clock.t = ({ day1: 2, year1: 365 + 120, year3: 3 * 365 + 120, spring3: 3 * 365 + 8 })[age] + 0.4;
    g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
    g.stock.goat = 3; g.stock.hay = 20;
    if (env.kids === '0') g.people = g.people.filter(p => !p.kid), g.personState = g.personState.slice(0, g.people.length);
    if (env.dogs !== '0') { const pets = await import('/src/sim/pets.ts'); pets.adoptDog(g); pets.adoptDog(g); }
    G.setState({ game: g });
    cb.world.lived.qaTier = ({ low: 0, medium: 1, high: 2 })[env.q];
    st.setSeasonMode(season); st.setWeatherMode(env.snow === '1' ? 'snow' : 'clear'); st.setTimeOfDay(hour);
    if (env.mud === '1') { /* mud season shows in spring */ }
    window.__scene = { c, zc };
    return { c, people: g.people.length };
  }, [age, season, hour, { snow: process.env.SNOW, mud: process.env.MUD, kids: process.env.KIDS, dogs: process.env.DOGS, q: quality }]);
  lap('built ' + JSON.stringify(info));
  await frames(); await frames(); await frames();
  // LAY=1: lay a different walk on each of the busiest walks (gravel, stepping stones, duckboards, concrete), to see what each looks like
  if (process.env.LAY) {
    await page.evaluate(async () => {
      const cb = window.__cb, net = cb.world.paths.network, G = cb.game;
      const g = structuredClone(G.getState().game); g.stock.fieldstone = 99; g.stock.lumber = 99; g.stock.concrete = 99; G.setState({ game: g });
      const kinds = ['gravel', 'stones', 'boards', 'paved'];
      net.edges.filter(e => !e.hidden).sort((a, b) => b.trips - a.trips).slice(0, 10).forEach((e, i) => { let k = kinds[i % 4]; if (k === 'paved' && !e.can.paved) k = 'gravel'; G.getState().layPaths([{ a: e.a, b: e.b, lenM: e.lenM }], k); });
    });
    await frames(); await frames(); await frames();
  }
  const VIEWS = [
    { name: 'aerial', at: 'center', mode: 'orbit', radius: 30, pitch: 0.95, yaw: 0.4 },
    { name: 'aerial-low', at: 'center', mode: 'orbit', radius: 19, pitch: 0.55, yaw: 2.2 },
    { name: 'house-front', at: 'farmhouse', mode: 'orbit', radius: 5.2, pitch: 0.3, yawOff: 0.45 },
    { name: 'house-eye', at: 'farmhouse', mode: 'eye', dist: 3.6, lat: 0.9, look: 0.22, person: 1.3 },
    { name: 'house-side', at: 'farmhouse', mode: 'orbit', radius: 5.5, pitch: 0.25, yawOff: 1.6 },
    { name: 'barn', at: 'barn', mode: 'orbit', radius: 6.0, pitch: 0.28, yawOff: -0.5 },
    { name: 'barn-eye', at: 'barn', mode: 'eye', dist: 3.2, lat: -0.8, look: 0.2, person: 1.2 },
    { name: 'shop', at: 'workshop', mode: 'orbit', radius: 5.5, pitch: 0.3, yawOff: 0.5 },
    { name: 'garden', at: 'garden', mode: 'orbit', radius: 6.5, pitch: 0.55, yawOff: 0.6 },
    { name: 'well', at: 'well_hand', mode: 'orbit', radius: 2.6, pitch: 0.3, yawOff: 0.4 },
    { name: 'coop', at: 'chicken_coop', mode: 'orbit', radius: 3.4, pitch: 0.3, yawOff: 0.5 },
    { name: 'gate', at: 'gate', mode: 'orbit', radius: 4.5, pitch: 0.22, yawOff: 0 },
    { name: 'creek', at: 'landing', mode: 'orbit', radius: 4.0, pitch: 0.25, yawOff: 0 },
    { name: 'laid-aerial', at: 'center', mode: 'orbit', radius: 16, pitch: 0.7, yaw: 0.3 },
    { name: 'laid-house', at: 'farmhouse', mode: 'orbit', radius: 4.0, pitch: 0.55, yawOff: 0.6 },
    { name: 'laid-eye', at: 'farmhouse', mode: 'eye', dist: 2.6, lat: 0.6, look: 0.12, person: 1.0 },
    { name: 'yard-eye', at: 'center', mode: 'eye', dist: 5.5, lat: 0, look: 0.3, person: 2, dir: [0.2, 1] },
  ].filter(v => !only || only.includes(v.name));
  let n = 0;
  for (const v of VIEWS) {
    const ok = await page.evaluate(async v => {
      const cb = window.__cb, gr = cb.world.groundAt, g = cb.game.getState().game, { c, zc } = window.__scene;
      const K = await import('/src/game/buildkit/kit.ts');
      let tgt, fd = [0, 1];
      if (v.at === 'center') tgt = { x: c.x, z: zc };
      else if (v.at === 'gate') { const a = cb.world.access.gate; tgt = { x: a.x - 0.8, z: a.z + 0.2 }; fd = [-1, 0.3]; }
      else if (v.at === 'landing') { const e = cb.world.lived ? cb.world.lived.plan.props.find(p => p.kind === 'bench') : null; if (!e) return false; tgt = { x: e.x, z: e.z }; fd = [Math.sin(e.rot), Math.cos(e.rot)]; }
      else {
        const s = g.structures.find(x => x.kind === v.at); if (!s) return false;
        const def = K.KIT[s.kind], [fx, fz] = K.rotQ(0, 1, s.rot);
        fd = [fx, fz];
        tgt = { x: s.x + fx * (def.cellsZ * K.CELL / 2 + def.porch), z: s.z + fz * (def.cellsZ * K.CELL / 2 + def.porch) };
      }
      if (v.dir) fd = v.dir;
      const base = Math.atan2(fd[0], fd[1]);
      const old = window.__fig; if (old) { cb.ws.scene.remove(old); window.__fig = null; }
      if (v.mode === 'orbit') {
        cb.qa.pose = null; cb.cam.target.set(tgt.x, gr(tgt.x, tgt.z) + 0.25, tgt.z); cb.cam.radius = v.radius; cb.cam.pitch = v.pitch; cb.cam.yaw = base + (v.yawOff ?? 0);
      } else {
        const px = -fd[1], pz = fd[0], l = Math.hypot(fd[0], fd[1]) || 1;
        const ex = tgt.x + fd[0] / l * v.dist + px / l * v.lat, ez = tgt.z + fd[1] / l * v.dist + pz / l * v.lat;
        cb.qa.pose = { x: ex, y: gr(ex, ez) + 0.27, z: ez, lx: tgt.x, ly: gr(tgt.x, tgt.z) + v.look, lz: tgt.z, fov: 60 };
        if (v.person) {
          const m = await import('/src/game/HomesteadWorld.ts');
          const fx = tgt.x + fd[0] / l * v.person + px / l * (v.lat * 0.2 + 0.4), fz = tgt.z + fd[1] / l * v.person + pz / l * (v.lat * 0.2 + 0.4);
          const f = m.scaleFigure(fx, fz, gr(fx, fz)); cb.ws.scene.add(f); window.__fig = f;
        }
      }
      return true;
    }, v);
    if (!ok) { lap('skip ' + v.name); continue; }
    await frames();
    await page.evaluate(f => (f ? window.__cb.qa.renderFull('high') : window.__cb.qa.renderNow()), full);
    const file = `${out}/${String(++n).padStart(2, '0')}-${v.name}-${age}-${season}${full ? '-full' : ''}.png`;
    await page.screenshot({ path: file });
    lap(file);
  }
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
