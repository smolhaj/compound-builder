/**
 * Orchard shots on the terraced hillside lot: the plot in blossom (aerial, eye level with a person), then in fruit.
 *   flock $SP/render.lock node scripts/orchardShots.mjs --out shots/orchard [--port 5430] [--q medium|high] [--only bloom,fruit] [--pocket]
 * Lays out a farmhouse on the shelf below the rock face, an orchard, raised beds and an apiary on the terraces under it, ages the trees (12 years),
 * and sets the clock to the days the kinds are in blossom (or in fruit). Always ?lowrender, drawn at the lifted quality.
 * --pocket: put the orchard in the lot's lowest hollow instead (a cold-air pocket: late frosts take its blossom).
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5430)), outDir = resolve(opt('--out', 'shots/orchard')), q = opt('--q', 'medium'), only = opt('--only', 'bloom,fruit').split(',');
const LOT = opt('--lot', 'region=pnw&lot=hillside&lotcut&relief=9&acres=40&lotseed=8&elev=600');
const tag = opt('--tag', 'orchard');
mkdirSync(outDir, { recursive: true });
let vite = null;
if (!args.includes('--no-serve')) {
  vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
}
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(300000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('console', m.text().slice(0, 300)); });
try {
  await page.goto(`http://localhost:${port}/?lowrender=0.75&clean&seed=7&${LOT}`);
  await page.waitForFunction(() => window.__cb?.qa?.renderNow);
  await page.evaluate(() => { const { game, store } = window.__cb; window.__cb.qa.weather = true; game.getState().setSpeed(0); store.getState().setWeatherMode('clear'); store.getState().setSeasonMode('auto'); });
  await page.waitForTimeout(1200);
  const pocket = args.includes('--pocket');
  const layout = await page.evaluate(async pocket => {
    const cb = window.__cb, G = cb.game, w = cb.world, gr = w.groundAt, lot = w.parcel.lot, c = w.camp;
    const phi = lot.fall, cf = Math.cos(phi), sf = Math.sin(phi);
    const P = (du, db) => [c.x + du * cf - db * sf, c.z + du * sf + db * cf];
    const slopeAt = (x, z) => (Math.abs(gr(x + 0.25, z) - gr(x - 0.25, z)) + Math.abs(gr(x, z + 0.25) - gr(x, z - 0.25))) / 0.5;
    let dFace = 0; for (let d = 0; d > -40; d -= 0.25) { const [x, z] = P(d, 0); if (slopeAt(x, z) > 0.9) { dFace = d; break; } }
    let dEdge = 0; for (let d = 0; d < 40; d += 0.25) { const [x, z] = P(d, 0); if (slopeAt(x, z) > 0.3) { dEdge = d; break; } }
    const g = structuredClone(G.getState().game);
    g.structures = [];
    // twelve years on: the trees planted at t = 0 are mature
    const O = await import('/src/sim/orchard.ts');
    g.clock.t = 12 * 365 + 4 / 24;
    G.setState({ game: g });
    const placed = [];
    const put = (kind, du, db, rot = 0, near = 14) => {
      const [x0, z0] = P(du, db), cur = structuredClone(G.getState().game);
      const spot = cb.tool.findSpot(kind, x0, z0, rot, near);
      if (!spot) { placed.push({ kind, ok: false, want: [x0, z0] }); return null; }
      cur.structures.push({ id: 'h' + placed.length + kind, kind, x: spot[0], z: spot[1], rot, stage: 99, done: 0, supplied: true, finishedAt: 0 });
      G.setState({ game: cur });
      placed.push({ kind, ok: true, at: spot.map(v => +v.toFixed(2)), moved: +Math.hypot(spot[0] - x0, spot[1] - z0).toFixed(2), grade: +slopeAt(spot[0], spot[1]).toFixed(2) });
      return spot;
    };
    const mid = (dFace + dEdge) / 2;
    put('farmhouse', dFace + 4.2, 0, 0);
    put('chicken_coop', mid + 1, 6, 1);
    put('apiary', mid + 1, -6.5, 0);
    put('greenhouse', dEdge + 3.2, -6);
    put('garden', dEdge + 3.4, -1.2);
    put('garden', dEdge + 3.4, 2.4);
    if (pocket) {
      // the lowest ground within the lot
      let best = null;
      for (let x = 6; x < 62; x += 2) for (let z = 6; z < 62; z += 2) { const s = O.plotSite(G.getState().game, { x, z }); if (s.pocket) { const h = gr(x, z); if (!best || h < best.h) best = { x, z, h }; } }
      if (best) { const cur = structuredClone(G.getState().game); const spot = cb.tool.findSpot('orchard', best.x, best.z, 0, 10) ?? [best.x, best.z]; cur.structures.push({ id: 'ho', kind: 'orchard', x: spot[0], z: spot[1], rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 }); G.setState({ game: cur }); placed.push({ kind: 'orchard', pocket: true, at: spot }); }
    } else {
      put('orchard', dEdge + 8.5, 3.5, 0, 20);
      put('orchard', dEdge + 8.5, -3, 0, 20);
    }
    const pets = await import('/src/sim/pets.ts'); const c2 = structuredClone(G.getState().game); pets.adoptDog(c2); G.setState({ game: c2 });
    const gs = G.getState().game, orch = gs.structures.filter(s => s.kind === 'orchard');
    return { phi, dFace, dEdge, camp: c, placed, orchard: orch.map(o => ({ at: [o.x, o.z], site: O.plotSite(gs, o) })) };
  }, pocket);
  console.log(JSON.stringify(layout));
  for (let i = 0; i < 3; i++) { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(250); }
  const ost = layout.orchard[0];
  const settle = async () => { for (let i = 0; i < 4; i++) { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(150); } };
  const shot = async name => { await settle(); await page.evaluate(q => window.__cb.qa.renderFull(q), q); await page.waitForTimeout(300); const f = `${outDir}/${tag}-${name}.png`; await page.screenshot({ path: f }); console.log(f); };
  // set the sim clock to a day of the year (the view follows it) in a year the late frost spared the blossom (or, with --pocket, in a year it did not)
  const setDay = (which, frost) => page.evaluate(async ([which, frost]) => {
    const cb = window.__cb, G = cb.game, O = await import('/src/sim/orchard.ts');
    const g = structuredClone(G.getState().game), st = g.structures.find(s => s.kind === 'orchard');
    const m = O.medianFrost(g);
    const doy = which === 'bloom' ? m + 1 : O.calendarOfFruit(m, 'apple').pick[0] + 6;
    // the year: scan for one where the cherries and apples keep their blossom (no frost) or lose it (a frost)
    let chosen = null;
    for (let k = 10; k < 60 && chosen === null; k++) {
      const year = g.clock.startYear + k;
      const loss = ['cherry', 'plum', 'apple', 'pear'].map(f => O.blossomLoss(O.hardFrostDay(g.seed, year, m) + O.plotSite(g, st).shift, f, m));
      const ok = frost ? loss[0] >= 0.5 : loss.every(l => l < 0.05);
      if (ok) chosen = k;
    }
    if (chosen === null) chosen = 12;
    const days = g.startDoy ?? g.clock.startDoy;
    const base = chosen * 365 + ((doy - g.clock.startDoy) % 365 + 365) % 365;
    g.clock.t = base + 4 / 24;
    G.setState({ game: g });
    return { year: g.clock.startYear + chosen, doy, median: m, loss: ['cherry', 'plum', 'apple', 'pear'].map(f => +O.frostLoss(g, st, f, g.clock.startYear + chosen).toFixed(2)) };
  }, [which, frost]);
  const orbit = (r, pitch, yaw, dx = 0, dz = 0, lift = 0.3, at = null) => page.evaluate(([r, pitch, yaw, dx, dz, lift, at]) => { const { world, cam } = window.__cb; const x = at[0] + dx, z = at[1] + dz; cam.target.set(x, world.groundAt(x, z) + lift, z); cam.radius = r; cam.pitch = pitch; cam.yaw = yaw; }, [r, pitch, yaw, dx, dz, lift, at]);
  const up = await page.evaluate(() => { const f = window.__cb.world.parcel.lot.fall; return Math.atan2(Math.cos(f), Math.sin(f)); });
  for (const which of only) {
    const info = await setDay(which, pocket);
    console.log(which, JSON.stringify(info));
    await page.evaluate(() => { const { store } = window.__cb; const s = store.getState(); s.setSeasonMode('auto'); });
    await page.waitForTimeout(800);
    // let the season settle (the visual season eases in)
    await page.evaluate(() => { const { world } = window.__cb; for (let i = 0; i < 80; i++) world.tick?.(0.1, window.__cb.store.getState().dayOfYear, window.__cb.store.getState().totalDays, 'auto'); });
    await orbit(14, 0.62, up + 0.3, 0, 0, 0.3, ost.at);
    await shot(`${which}-1-aerial`);
    await orbit(5.2, 0.28, up + 0.9, 0, 0, 0.5, ost.at);
    await shot(`${which}-2-rows`);
    // eye level with a person: send the family to the garden beside the plot and stand behind the nearest of them, looking at the rows
    await page.evaluate(() => {
      const cb = window.__cb, G = cb.game, w = cb.world;
      const g = structuredClone(G.getState().game);
      g.personState.forEach((ps, i) => { ps.task = 'garden'; ps.target = null; });
      G.setState({ game: g });
      for (let i = 0; i < 900; i++) w.updatePeople(0.1, G.getState().game, 10, 1);
    });
    await page.evaluate(([ox, oz]) => {
      const { world, cam } = window.__cb;
      const ps = world.family.positions().filter(p => Math.hypot(p.x - ox, p.z - oz) < 9);
      ps.sort((a, b) => Math.hypot(a.x - ox, a.z - oz) - Math.hypot(b.x - ox, b.z - oz));
      const p = ps[0] ?? world.family.positions()[0];
      // from the far side of the rows (away from the garden fence), looking across the trees at the person
      const [cx, cz] = world.openSpotNear(ox - 0.6, oz + 2.7, 0.3);
      cam.placeEye(cx, cz, (ox + p.x) / 2, (oz + p.z) / 2, 0.4);
      window.__eyePerson = { x: p.x, z: p.z, dist: Math.hypot(p.x - ox, p.z - oz) };
    }, ost.at);
    console.log('person', JSON.stringify(await page.evaluate(() => window.__eyePerson)));
    await shot(`${which}-3-eye`);
  }
} catch (e) { console.error('ERR', e.message); }
await browser.close(); if (vite) vite.kill();
process.exit(0);
