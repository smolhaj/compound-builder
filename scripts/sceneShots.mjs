/**
 * Whole-scene QA shots (docs/DECISIONS.md, "Scene audit"): a real compound (what came with the land + the starter compound + a hamlet's worth of pieces,
 * the very scene src/sim/sceneAudit.ts audits) laid on a lot and drawn: aerial, mid, and eye level with a person for the worst-placed pieces.
 *   flock /tmp/cb.lock node scripts/sceneShots.mjs --out /tmp/claude-0/audit/scenes/after --set mw-hill,app-hill [--hamlet] [--state stages|damage|snow|night] [--port 5340]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const eyesN = Number(opt('--eyes', 3)), port = Number(opt('--port', 5340)), outDir = resolve(opt('--out', 'shots/scene')), sets = opt('--set', 'mw-hill').split(','), hamlet = args.includes('--hamlet'), state = opt('--state', 'done');
mkdirSync(outDir, { recursive: true });
// name -> URL query (the game seed is the sceneAudit STEEP_LOTS seed it was audited with)
const LOTS = {
  'mw-hill': 'seed=7&region=mountain_west&lot=hillside&lotcreek&relief=14&acres=40&lotseed=3',
  'mw-gorge': 'seed=8&region=mountain_west&lot=gorge&relief=12&acres=40&lotseed=4',
  'mw-ridge': 'seed=9&region=mountain_west&lot=ridge&relief=12&acres=40&lotseed=5',
  'mw-mesa': 'seed=10&region=mountain_west&lot=mesa&relief=12&acres=40&lotseed=6',
  'mw-bluff': 'seed=13&region=mountain_west&lot=bluff&relief=10&acres=40&lotseed=9',
  'app-hill': 'seed=15&region=appalachia&lot=hillside&lotcreek&relief=12&acres=40&lotseed=11',
  'pnw-hill': 'seed=17&region=pnw&lot=hillside&lotcreek&relief=10&acres=40&lotseed=13',
  'nw-island': 'seed=21&region=north_woods&lot=island&relief=6&acres=40&lotseed=16',
  'l-mw4': 'seed=2&listing=mountain_west.4',
  desert: 'seed=7&region=desert', plains: 'seed=7&region=plains', 'north-woods': 'seed=7&region=north_woods', 'upper-mw': 'seed=7&region=upper_midwest',
  pnw: 'seed=7&region=pnw', appalachia: 'seed=7&region=appalachia',
};
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const name of sets) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(240000);
    page.on('pageerror', e => console.error('PAGEERROR', e.message));
    await page.goto(`http://localhost:${port}/?lowrender&clean&${LOTS[name]}`);
    await page.waitForFunction(() => window.__cb?.qa?.renderNow, null, { timeout: 240000 });
    await page.evaluate(() => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality('medium'); store.getState().setTimeOfDay(14); store.getState().setWeatherMode('clear'); store.getState().setSeasonMode('summer'); });
    const frame = async () => { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(300); };
    const shot = async n => { await frame(); await frame(); const f = `${outDir}/${name}-${n}.png`; await page.screenshot({ path: f }); console.error(f); };
    const info = await page.evaluate(async ([hamlet, state]) => {
      const cb = window.__cb, G = cb.game;
      const M = await import('/src/sim/sceneAudit.ts');
      const live = structuredClone(G.getState().game);
      const sc = M.makeScene(live.site, live.seed, 'shots');
      M.layStarterCompound(sc);
      if (hamlet) M.layHamlet(sc);
      const problems = M.sceneProblems(sc).map(p => p.what + ': ' + p.detail);
      live.structures = sc.g.structures; live.perimeter = sc.g.perimeter; live.nextId = sc.g.nextId; live.money = 1e6;
      const { BLUEPRINTS } = await import('/src/sim/blueprints.ts');
      let k = 0;
      for (const s of live.structures) {
        const bp = BLUEPRINTS[s.kind];
        if (state === 'stages' && bp) { s.stage = k++ % (bp.stages.length + 1); s.done = (bp.stages[s.stage]?.hours ?? 0) * 0.5; s.supplied = true; s.finishedAt = s.stage >= bp.stages.length ? 0 : null; continue; }
        s.stage = 99; s.supplied = true; s.finishedAt = 0; s.done = 0; s.permit = 'ok';
      }
      for (const r of live.perimeter) { r.finishedAt = 0; r.done = r.hours; r.supplied = true; }
      if (state === 'damage') {
        const fin = live.structures.filter(s => BLUEPRINTS[s.kind]);
        fin.slice(1, 3).forEach(s => { s.roofLost = true; s.stage = Math.max(0, (BLUEPRINTS[s.kind]?.stages.length ?? 4) - 2); s.finishedAt = null; s.lost = true; });
        const w = live.perimeter.find(r => r.pts.length > 3);
        if (w) { const p = w.pts[1], q = w.pts[2]; live.raidDamage = [{ id: 'd1', kind: 'breach', x: (p[0] + q[0]) / 2, z: (p[1] + q[1]) / 2, runId: w.id, day: 1, hours: 10, done: 0, supplied: false, bill: {} }, { id: 'd2', kind: 'burn', x: fin[3].x + 1.5, z: fin[3].z + 1.5, day: 1, hours: 10, done: 0, supplied: false, bill: {}, what: 'the shed' }]; }
      }
      G.setState({ game: live });
      window.__sc = sc;
      return { problems, kinds: sc.g.structures.map(s => `${s.id}:${s.kind}@${s.x.toFixed(1)},${s.z.toFixed(1)}`), home: sc.g.site.home, camp: sc.camp };
    }, [hamlet, state]);
    console.error(name, JSON.stringify(info.problems.slice(0, 12)));
    await page.waitForTimeout(2500);
    if (state === 'snow') await page.evaluate(() => { const s = window.__cb.store.getState(); window.__cb.qa.weather = true; s.setSeasonMode('winter'); s.setDayOfYear(15); s.setWeatherMode('snow'); });
    if (state === 'night') await page.evaluate(() => { const s = window.__cb.store.getState(); s.setTimeOfDay(22); });
    if (state === 'rain') await page.evaluate(() => { const s = window.__cb.store.getState(); window.__cb.qa.weather = true; s.setWeatherMode('rain'); s.setSeasonMode('fall'); });
    await page.waitForTimeout(1200);
    // centre of the built pieces
    const c = await page.evaluate(() => { const g = window.__cb.game.getState().game, st = g.structures.filter(s => !s.unplaced); let x = 0, z = 0; for (const s of st) { x += s.x; z += s.z; } return { x: x / st.length, z: z / st.length, n: st.length }; });
    const look = (r, pitch, yaw, tx = c.x, tz = c.z, h = 0.3) => page.evaluate(([tx, tz, r, pitch, yaw, h]) => { const { cam, world } = window.__cb; cam.target.set(tx, world.groundAt(tx, tz) + h, tz); cam.radius = r; cam.pitch = pitch; cam.yaw = yaw; }, [tx, tz, r, pitch, yaw, h]);
    await look(34, 0.95, 0.5); await shot('1-aerial');
    await look(16, 0.7, 2.4); await shot('2-mid');
    // eye level at each of the first few homes / worst pieces: a person stands by the door
    const eyes = await page.evaluate(() => { const g = window.__cb.game.getState().game; return g.structures.filter(s => !s.unplaced).map(s => ({ id: s.id, kind: s.kind, x: s.x, z: s.z, rot: s.rot })); });
    const pick = eyes.filter(e => ['timber_cabin', 'cottage', 'farmhouse', 'log_house', 'barn', 'workshop', 'trailer'].includes(e.kind)).slice(0, eyesN);
    for (const e of pick) {
      await page.evaluate(([e]) => {
        const { world, cam } = window.__cb;
        const a = e.rot * Math.PI / 2, fx = e.x + Math.sin(a) * 1.6, fz = e.z + Math.cos(a) * 1.6;
        const [px, pz] = world.openSpotNear(fx, fz, 0.5);
        world.qaFigure(px, pz);
        const [ex, ez] = world.openSpotNear(px + Math.sin(a + 0.7) * 1.8, pz + Math.cos(a + 0.7) * 1.8, 0.4);
        cam.placeEye(ex, ez, e.x, e.z, 0.3);
      }, [e]);
      await shot(`3-eye-${e.kind}-${e.id}`);
    }
    await page.close();
  }
} catch (e) { console.error('ERR', e.message); }
await browser.close(); vite.kill();
process.exit(0);
