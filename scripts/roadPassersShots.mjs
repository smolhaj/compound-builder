// Road warning and passers-by: a checkpoint with a party stopped at the line (a swap offered), a roadblock with a family turned back, and the
// "wave them down" / visitor-warning cards.  node scripts/roadPassersShots.mjs --out shots/roadpassers --region plains [--port 5734] [--only checkpoint,barrier,card]
// (template: encounterLeadShots.mjs) One headless browser, ?lowrender, frames lifted with renderFull('medium').
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5734)), out = resolve(opt('--out', 'shots/roadpassers')), region = opt('--region', 'plains');
const only = opt('--only', '').split(',').filter(Boolean);
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 680 } });
page.setDefaultTimeout(400000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
const clean = process.argv.includes('--hud') ? '' : '&clean';
try {
  await page.goto(`http://localhost:${port}/?lowrender${clean}&seed=7&region=${region}`);
  await page.waitForFunction(() => window.__cb?.qa?.renderNow, null, { timeout: 400000 });
  await page.evaluate(() => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality('medium'); });
  const shot = async n => { await page.evaluate(() => window.__cb.qa.renderFull('medium')); await page.waitForTimeout(150); const f = `${out}/${region}-${n}.png`; await page.screenshot({ path: f }); console.log(f); };
  const look = async (tod, doy) => page.evaluate(([tod, doy]) => { const s = window.__cb.store.getState(); s.setWeatherMode('clear'); s.setSeasonMode('summer'); s.setDayOfYear(doy); s.setTimeOfDay(tod); }, [tod, doy]);
  // a world after the collapse with the road set up by `mode`
  const stage = (mode) => page.evaluate(async mode => {
    const st = await import('/src/sim/state.ts'), dz = await import('/src/sim/disaster.ts'), rp = await import('/src/sim/roadPassers.ts');
    const G = window.__cb.game, g = structuredClone(G.getState().game);
    const tmp = st.newGame(g.seed, 160, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
    g.disaster = tmp.disaster; const d = g.disaster;
    g.clock.t = d.hitAt + 40; d.phase = 'survival'; d.tracks = dz.tracksAt(d, g.clock.t);
    g.gate.next = 1e9; g.gate.pending = null; g.gate.incoming = null; g.gate.card = null;
    g.stock.lumber = 30; g.stock.hardware = 10; g.stock.canned = 30; g.stock.fuel = 10; g.stock.staples = 20;
    const road = rp.roadOf(g); road.passes = []; road.hail = null; road.block = null;
    const M = (kind, gap, lat, tint, riders = 0, loaded = false) => ({ kind, gap, lat, tint, riders, loaded });
    const fam = { id: 'q1', cls: 'wanderers', dir: 1, speed: 0.45, members: [M('cart', 0, 0.42, 0.1, 0, true), M('walker', 0.25, 0.38, 0.2, 0, true), M('walker', 0.45, 0.5, 0.6), M('walker', 0.7, 0.42, 0.9, 0, true)], lights: false, heads: 4 };
    const pick = { id: 'q2', cls: 'traffic', dir: -1, speed: 4.8, members: [M('pickup', 0, 0.17, 0.35, 0, true)], lights: true, heads: 1 };
    if (mode === 'checkpoint') {
      road.block = { kind: 'checkpoint', policy: 'inspect', since: g.clock.t, turned: 2, passed: 5 };
      road.hail = { id: 'h1', pass: 'q2', until: g.clock.t + 0.5, party: pick, by: 'block', text: 'A pickup stopped at the checkpoint and asked if you would swap 4 fuel for 5 canned.', offer: [{ good: 'fuel', qty: 4 }], want: [{ good: 'canned', qty: 5 }], shady: false, begging: false };
    } else if (mode === 'barrier') {
      road.block = { kind: 'barrier', policy: 'turn_back', since: g.clock.t, turned: 1, passed: 0 };
      const p = { id: 'q1', at: g.clock.t - 0.1, party: fam, done: true, fate: 'turned' };
      road.passes = [p];
    } else if (mode === 'wave') {
      road.passes = [{ id: 'q3', at: g.clock.t - 0.01, party: pick, done: true, seen: true, fate: 'went_on' }];
    } else if (mode === 'warn') {
      g.gate.incoming = { e: { id: 'el1', kind: 'refugees', day: 1, title: 'A column of refugees', dossier: [], size: 9, armed: false, strength: 0, stances: ['take_in', 'turn_away'] }, at: g.clock.t + 0.05, from: g.clock.t - 0.05, seen: g.clock.t - 0.04 };
    }
    G.setState({ game: g });
    window.__cb.world.roadLife.qaSet([]);
    if (mode === 'barrier') window.__cb.world.roadLife.qaSet([]);
  }, mode);
  const cams = async (name, aim = 0) => {
    await page.waitForTimeout(1200);
    await page.evaluate(async ([aim]) => { const { world, cam } = window.__cb, gz = world.access.drive[0][1], z = gz + aim, x = world.county.x(z); cam.target.set(x, world.groundAt(x, z), z); cam.radius = 22; cam.pitch = 0.7; cam.yaw = 2.4; }, [aim]);
    await shot(name + '-aerial');
    await page.evaluate(async ([aim]) => { const { world, cam } = window.__cb, gz = world.access.drive[0][1] + aim, xp = world.county.x(gz), ze = gz - 7, xe = world.county.x(ze); world.qaFigure(world.county.x(gz - 2) + 0.9, gz - 2); cam.placeEye(xe + 0.9, ze, xp, gz, 0.3); }, [aim]);
    await shot(name + '-eye');
  };
  const want = n => !only.length || only.includes(n);
  await look(12, 160);
  if (want('checkpoint')) { await stage('checkpoint'); await cams('1-checkpoint'); }
  if (want('barrier')) { await stage('barrier'); await cams('2-barrier'); }
  if (want('wave')) { await stage('wave'); await cams('3-wave'); }
  if (want('card')) { await stage('warn'); await page.waitForTimeout(500); await shot('4-warn-card'); }
} catch (e) { console.error('ERR', e.message); }
await browser.close(); vite.kill();
process.exit(0);
