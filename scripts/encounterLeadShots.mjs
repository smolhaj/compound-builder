// Encounter lead time: the real party (refugees on foot, a trader's pickup, a stranger in a rig) seen walking / driving up the road before its card.
//   node scripts/encounterLeadShots.mjs --out shots/encounterlead --region plains [--port 5733] [--only refugees-day,...]
// (template: roadLifeShots.mjs) Life on the county road: peacetime, night (headlights), warning, aftermath (stalled cars, wanderers, roving crew), and the real
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
const port = Number(opt('--port', 5733)), out = resolve(opt('--out', 'shots/encounterlead')), region = opt('--region', 'plains'), lot = opt('--lot', '');
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
  // the party is `d` units short of the gate on the side it comes from: aim the aerial at its midpoint, the eye camera down the road at it
  const cams = async (name, wide = 40) => {
    await page.waitForTimeout(900);
    const info = () => page.evaluate(async () => {
      const rt = await import('/src/sim/roadTraffic.ts'), { world, game } = window.__cb, g = game.getState().game, inc = g.gate.incoming;
      const gz = world.access.drive[0][1], dir = rt.partyForEncounter(inc.e, g.seed).dir, d = rt.approachDistance(g.clock.t, inc.from, inc.at);
      return { gz, dir, d };
    });
    const { gz, dir, d } = await info();
    await page.evaluate(([gz, dir, d, r]) => { const { world, cam } = window.__cb, z = gz - dir * d * 0.5, x = world.county.x(z); cam.target.set(x, world.groundAt(x, z), z); cam.radius = r; cam.pitch = 0.6; cam.yaw = 2.4; }, [gz, dir, d, wide]);
    await shot(name + '-aerial');
    await page.evaluate(([gz, dir, d]) => { const { world, cam } = window.__cb, zp = gz - dir * d, xp = world.county.x(zp), ze = zp + dir * 9, xe = world.county.x(ze); world.qaFigure(world.county.x(zp + dir * 6) + 0.9, zp + dir * 6); cam.placeEye(xe + 1.0, ze, xp, zp, 0.3); }, [gz, dir, d]);
    await shot(name + '-eye');
  };
  const want = n => !only.length || only.includes(n);
  // an approach in progress: sighted at `from`, at the gate at `at`; the clock stands `frac` of the way along it
  const approach = (e, minutes, frac) => page.evaluate(([e, minutes, frac]) => {
    const G = window.__cb.game, g = structuredClone(G.getState().game);
    const day = Math.floor(g.clock.t + 0.25);
    const from = day - 0.25 + 0.5 / 24;
    e.day = day;
    g.clock.t = from + frac * minutes / 1440;
    g.gate.pending = null; g.gate.card = null; g.gate.next = 1e9;
    g.gate.incoming = { e, at: from + minutes / 1440, from };
    G.setState({ game: g });
    window.__cb.world.roadLife.qaSet([]);
  }, [e, minutes, frac]);
  const refugees = { id: 'el1', kind: 'refugees', day: 1, title: 'A column of refugees', dossier: [], size: 9, armed: false, strength: 0, stances: ['take_in', 'turn_away'] };
  const trader = { id: 'el2', kind: 'trader', day: 1, title: 'A trader', dossier: [], size: 1, armed: false, strength: 0, stances: ['trade', 'turn_away'] };
  const rig = { id: 'el3', kind: 'arrival', day: 1, title: 'A stranger in a rig', dossier: [], size: 3, armed: false, strength: 0, stances: ['take_in', 'turn_away'], extras: { rig: true } };
  const kin = { id: 'el4', kind: 'kin', day: 1, title: 'Your brother and his family', dossier: [], size: 4, armed: false, strength: 0, stances: ['take_in', 'turn_away'] };
  await world('grid_down', 'after', 40);
  if (want('refugees-day')) { await look(11, 160); await approach(refugees, 150, 0.45); await cams('1-refugees-day', 40); }
  if (want('refugees-night')) { await look(1.5, 160); await approach(refugees, 150, 0.45); await cams('2-refugees-night', 40); }
  if (want('trader-day')) { await look(14, 160); await approach(trader, 75, 0.45); await cams('3-trader-day', 40); }
  if (want('trader-night')) { await look(23, 160); await approach(trader, 75, 0.45); await cams('4-trader-night', 40); }
  if (want('rig-day')) { await look(9, 160); await approach(rig, 60, 0.4); await cams('5-rig-day', 40); }
  if (want('rig-night')) { await look(2.5, 160); await approach(rig, 60, 0.4); await cams('6-rig-night', 40); }
  if (want('kin-day')) { await look(16, 160); await approach(kin, 120, 0.5); await cams('7-kin-day', 40); }
} catch (e) { console.error('ERR', e.message); }
await browser.close(); vite.kill();
process.exit(0);
