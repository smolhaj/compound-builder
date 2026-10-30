/**
 * Area E shots (docs/DECISIONS.md): micro-hydro and wind, tunnels and aquaponics, the dock and marina with boats, the cabin village,
 * helipad, tower pod and stilted house. Each from the air and at eye level with a person. Always ?lowrender, drawn at the lifted quality.
 *   flock $SP/render.lock node scripts/renewableShots.mjs --out shots/areaE [--port 5440] [--q medium|high] [--only hydro,wind,tunnels,aqua,lake,outposts]
 * Everything is placed finished through the same findSpot / placement rules the build tool uses.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5440)), outDir = resolve(opt('--out', 'shots/areaE')), q = opt('--q', 'medium');
const only = opt('--only', 'hydro,wind,tunnels,aqua,terrace,lake,outposts').split(',');
const HILL = 'region=pnw&lot=hillside&lotcreek&relief=9&acres=40&lotseed=8&elev=600';
const LAKE = 'region=mountain_west&lot=bluff&relief=9&acres=40&lotseed=4&elev=1600';
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(300000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('console', m.text().slice(0, 300)); });
const settle = async (n = 4, ms = 120) => { for (let i = 0; i < n; i++) { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(ms); } };
const shot = async name => { try { await settle(); await page.evaluate(q => window.__cb.qa.renderFull(q), q); await page.waitForTimeout(250); const f = `${outDir}/${name}.png`; await page.screenshot({ path: f }); console.log(f); } catch (e) { console.error('SHOTERR', name, e.message); } };
const orbit = (at, r, pitch, yaw, lift = 0.3) => page.evaluate(([at, r, pitch, yaw, lift]) => { const { world, cam } = window.__cb; cam.target.set(at[0], world.groundAt(at[0], at[1]) + lift, at[1]); cam.radius = r; cam.pitch = pitch; cam.yaw = yaw; }, [at, r, pitch, yaw, lift]);
const load = async query => {
  await page.goto(`http://localhost:${port}/?lowrender=0.75&clean&seed=7&${query}`);
  await page.waitForFunction(() => window.__cb?.qa?.renderNow);
  await page.evaluate(() => { const { game, store } = window.__cb; window.__cb.qa.weather = true; game.getState().setSpeed(0); const s = store.getState(); s.setWeatherMode('clear'); s.setSeasonMode('summer'); s.setTimeOfDay(11); s.setBuildingView?.('full'); });
  await page.waitForTimeout(1200);
};
/** Put finished structures through the real placement rules: [kind, x, z, rot, reach] each; returns where they landed. */
const put = (list, opts = {}) => page.evaluate(async ([list, opts]) => {
  const cb = window.__cb, G = cb.game, g = structuredClone(G.getState().game);
  if (opts.clear) g.structures = [];
  if (opts.stock) Object.assign(g.stock, opts.stock);
  G.setState({ game: g });
  const out = [];
  for (const [kind, x, z, rot = 0, reach = 12] of list) {
    const spot = cb.tool.findSpot(kind, x, z, rot, reach);
    if (!spot) { out.push({ kind, ok: false }); continue; }
    const cur = structuredClone(G.getState().game);
    cur.structures.push({ id: 's' + cur.nextId++, kind, x: spot[0], z: spot[1], rot, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    G.setState({ game: cur });
    out.push({ kind, ok: true, at: spot.map(v => +v.toFixed(2)) });
  }
  return out;
}, [list, opts]).then(async r => { await settle(10, 250); return r; });
/** The family goes to a garden beside the spot, then the camera stands at eye level behind the nearest person, looking at the thing. */
const eyeWithPerson = async (name, at, back = [-3, 2], lift = 0.4, look = null) => {
  await put([['garden', at[0] + 2.4, at[1] + 1.5, 0, 8]]);
  await page.evaluate(() => { const cb = window.__cb, G = cb.game, w = cb.world, g = structuredClone(G.getState().game); g.personState.forEach(ps => { ps.task = 'garden'; ps.target = null; }); G.setState({ game: g }); for (let i = 0; i < 900; i++) w.updatePeople(0.1, G.getState().game, 10, 1); });
  await page.evaluate(([at, back, lift, look]) => {
    const { world, cam } = window.__cb;
    const ps = world.family.positions().filter(p => Math.hypot(p.x - at[0], p.z - at[1]) < 14).sort((a, b) => Math.hypot(a.x - at[0], a.z - at[1]) - Math.hypot(b.x - at[0], b.z - at[1]));
    const p = ps[0] ?? world.family.positions()[0];
    const [cx, cz] = world.openSpotNear(at[0] + back[0], at[1] + back[1], 0.3);
    const tx = look ? look[0] : (at[0] + p.x) / 2, tz = look ? look[1] : (at[1] + p.z) / 2;
    cam.placeEye(cx, cz, tx, tz, lift);
  }, [at, back, lift, look]);
  await shot(name);
  // three more eye positions round it (a tree often stands in the first)
  let k = 0;
  for (const [bx, bz] of [[back[1], -back[0]], [-back[0], -back[1]], [-back[1], back[0]]]) {
    k++;
    await page.evaluate(([at, bx, bz, lift, look]) => {
      const { world, cam } = window.__cb;
      const ps = world.family.positions().filter(p => Math.hypot(p.x - at[0], p.z - at[1]) < 14).sort((a, b) => Math.hypot(a.x - at[0], a.z - at[1]) - Math.hypot(b.x - at[0], b.z - at[1]));
      const p = ps[0] ?? world.family.positions()[0];
      const [cx, cz] = world.openSpotNear(at[0] + bx, at[1] + bz, 0.3);
      cam.placeEye(cx, cz, look ? look[0] : (at[0] + p.x) / 2, look ? look[1] : (at[1] + p.z) / 2, lift);
    }, [at, bx, bz, lift, look]);
    await shot(`${name}-alt${k}`);
  }
};
try {
  if (only.some(o => ['hydro', 'wind', 'tunnels', 'aqua', 'terrace', 'outposts'].includes(o))) {
    await load(HILL);
    const hy = await page.evaluate(async () => {
      const cb = window.__cb, w = cb.world, R = await import('/src/sim/renewables.ts'), g0 = cb.game.getState().game;
      let best = null;
      for (let x = 6; x < 62; x += 1) for (const side of [-1, 1]) for (const off of [3, 5, 7]) { const z = w.parcel.creek.zAt(x) + side * off; if (R.hydroProblem(g0, x, z)) continue; const s = R.hydroSiteAt(g0, x, z); if (!best || s.netM > best.netM) best = { x, z, netM: s.netM }; }
      let wind = null;
      for (let x = 6; x < 62; x += 3) for (let z = 6; z < 62; z += 3) { const e = R.windExposure(g0, x, z); if (!wind || e > wind.e) wind = { x, z, e }; }
      return { best, wind, camp: [w.camp.x, w.camp.z] };
    });
    console.log('layout', JSON.stringify(hy));
    if (only.includes('hydro') && hy.best) {
      const r = await put([['micro_hydro', hy.best.x, hy.best.z, 0, 4]], { clear: true });
      console.log('hydro', JSON.stringify(r));
      if (r[0].ok) {
        const at = r[0].at;
        await orbit(at, 26, 0.62, 0.7, 0.2); await shot('hydro-1-aerial');
        await orbit(at, 7, 0.28, -0.7, 0.3); await shot('hydro-2-house');
        await eyeWithPerson('hydro-3-eye-person', at, [-3.4, 1.8]);
      }
    }
    if (only.includes('wind') && hy.wind) {
      const r = await put([['wind_turbine', hy.wind.x, hy.wind.z, 0, 4]], { clear: true });
      console.log('wind', JSON.stringify(r));
      if (r[0].ok) {
        const at = r[0].at;
        await orbit(at, 16, 0.3, 0.5, 1.4); await shot('wind-1-tower');
        await orbit(at, 46, 0.62, 0.9, 0.5); await shot('wind-2-aerial');
        await eyeWithPerson('wind-3-eye-person', at, [-4, 3], 0.4, [at[0], at[1]]);
      }
    }
    if (only.includes('tunnels')) {
      const c = hy.camp;
      const r = await put([['polytunnel', c[0] - 6, c[1] + 4, 0, 14], ['high_tunnel', c[0] + 8, c[1] + 6, 1, 18]], { clear: true });
      console.log('tunnels', JSON.stringify(r));
      if (r[0].ok && r[1].ok) {
        const mid = [(r[0].at[0] + r[1].at[0]) / 2, (r[0].at[1] + r[1].at[1]) / 2];
        await orbit(mid, 34, 0.6, 0.6, 0.3); await shot('tunnels-1-aerial');
        await orbit(r[1].at, 14, 0.3, 0.5, 0.4); await shot('tunnels-2-high');
        await eyeWithPerson('tunnels-3-eye-person', r[0].at, [-4, 4]);
        await page.evaluate(() => window.__cb.store.getState().setBuildingView?.('cutaway'));
        await orbit(r[1].at, 12, 0.7, 0.4, 0.3); await shot('tunnels-4-cutaway');
        await page.evaluate(() => window.__cb.store.getState().setBuildingView?.('full'));
      }
    }
    if (only.includes('aqua')) {
      const c = hy.camp;
      const r = await put([['aquaponics', c[0] - 4, c[1] + 4, 0, 14]], { clear: true, stock: { fish_feed: 5 } });
      console.log('aqua', JSON.stringify(r));
      if (r[0].ok) {
        await page.evaluate(id => { const G = window.__cb.game, g = structuredClone(G.getState().game); const st = g.structures.find(s => s.kind === 'aquaponics'); g.utilities.lit = [st.id]; (g.farm.aqua ??= {})[st.id] = { fish: 300, fishG: 260, tempC: 26, offDays: 0, fed: 1, lost: 0, dieOffAt: -999, harvestAt: -999 }; G.setState({ game: g }); }, 0);
        await orbit(r[0].at, 18, 0.55, 0.6, 0.3); await shot('aqua-1-aerial');
        await page.evaluate(() => window.__cb.store.getState().setBuildingView?.('cutaway'));
        await orbit(r[0].at, 9, 0.6, 0.3, 0.2); await shot('aqua-2-cutaway');
        await page.evaluate(() => window.__cb.store.getState().setBuildingView?.('full'));
        await eyeWithPerson('aqua-3-eye-person', r[0].at, [-4, 4]);
      }
    }
    if (only.includes('terrace')) {
      const c = hy.camp;
      const r = await put([['orchard_terraced', c[0] + 6, c[1] - 6, 0, 24]], { clear: true });
      console.log('terrace', JSON.stringify(r));
      if (r[0].ok) {
        await page.evaluate(() => { const G = window.__cb.game, g = structuredClone(G.getState().game); g.clock.t = 12 * 365 + 4 / 24; G.setState({ game: g }); });
        await orbit(r[0].at, 18, 0.55, 0.5, 0.3); await shot('terrace-1-aerial');
        await orbit(r[0].at, 7, 0.22, -0.4, 0.4); await shot('terrace-2-benches');
        await eyeWithPerson('terrace-3-eye-person', r[0].at, [-4, 5]);
      }
    }
    if (only.includes('outposts')) {
      const c = hy.camp;
      const r = await put([['cabin_village', c[0] + 10, c[1] - 6, 0, 22], ['helipad', c[0] - 12, c[1] - 4, 0, 22], ['tower_pod', c[0] + 2, c[1] - 14, 0, 12], ['stilted_house', c[0] - 4, c[1] + 12, 0, 22]], { clear: true });
      console.log('outposts', JSON.stringify(r));
      const [cv, hp, tp, sh] = r;
      if (cv.ok) { await orbit(cv.at, 30, 0.6, 0.5, 0.3); await shot('outposts-1-village-aerial'); await eyeWithPerson('outposts-2-village-eye-person', cv.at, [-6, 5]); }
      if (hp.ok) { await orbit(hp.at, 22, 0.55, 0.9, 0.2); await shot('outposts-3-helipad-aerial'); await eyeWithPerson('outposts-4-helipad-eye-person', hp.at, [-5, 4]); }
      if (tp.ok) { await orbit(tp.at, 14, 0.25, 0.4, 1.0); await shot('outposts-5-pod'); await eyeWithPerson('outposts-6-pod-eye-person', tp.at, [-4, 4], 0.4, [tp.at[0], tp.at[1]]); }
      if (sh.ok) { await orbit(sh.at, 12, 0.3, 0.5, 0.6); await shot('outposts-7-stilted'); await eyeWithPerson('outposts-8-stilted-eye-person', sh.at, [-4, 4]); }
      if (r.every(x => x.ok)) { const mid = [(cv.at[0] + sh.at[0]) / 2, (cv.at[1] + sh.at[1]) / 2]; await orbit(mid, 70, 0.7, 0.8, 0.3); await shot('outposts-9-all-aerial'); }
    }
  }
  if (only.includes('lake')) {
    await load(LAKE);
    const shore = await page.evaluate(() => {
      const cb = window.__cb, w = cb.world, p = w.parcel, c = w.camp;
      // a point on the bank (dry, 0.3 above the lake) nearest the camp, found along the 16 bearings
      let best = null;
      for (let q = 0; q < 16; q++) { const a = q * Math.PI / 8; for (let d = 1; d < 30; d += 0.5) { const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d; if (p.isCreek(x, z)) { if (!best || d < best.d) best = { x: x - Math.cos(a) * 1.0, z: z - Math.sin(a) * 1.0, a, d }; break; } } }
      return best;
    });
    console.log('shore', JSON.stringify(shore));
    if (shore) {
      let placed = [];
      for (const rot of [0, 1, 2, 3]) {
        const r = await put([['boat_dock', shore.x, shore.z, rot, 6]], { clear: true, stock: { jon_boat: 2, skiff: 1 } });
        console.log('dock rot', rot, JSON.stringify(r));
        if (r[0].ok) { placed = r; break; }
      }
      if (placed.length) {
        const at = placed[0].at;
        await orbit(at, 20, 0.5, 0.6, 0.1); await shot('lake-1-dock-aerial');
        await orbit(at, 7, 0.22, 0.9, 0.2); await shot('lake-2-dock-boats');
        await eyeWithPerson('lake-3-dock-eye-person', at, [-3, 3]);
        for (const rot of [0, 1, 2, 3]) {
          const r = await put([['marina', shore.x + 4, shore.z + 6, rot, 10]], { stock: { jon_boat: 4, skiff: 2 } });
          if (r[0].ok) { const m = r[0].at; await orbit(m, 26, 0.5, 0.7, 0.1); await shot('lake-4-marina-aerial'); await orbit(m, 9, 0.25, -0.6, 0.3); await shot('lake-5-marina-eye'); break; }
        }
        // winter: the lake skims over and the boats are hauled out
        await page.evaluate(() => { const s = window.__cb.store.getState(); s.setSeasonMode('winter'); s.setDayOfYear?.(20); });
        await orbit(at, 22, 0.5, 0.6, 0.1); await shot('lake-6-winter');
      }
    }
  }
} catch (e) { console.error('ERR', e.message); }
await browser.close(); vite.kill();
process.exit(0);
