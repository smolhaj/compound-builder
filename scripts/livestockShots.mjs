// In-world livestock shots (docs/DECISIONS.md, "Realistic livestock"): a person beside the herd at eye level (scale), the pasture from above,
// the barn yard at dawn / noon / dusk / night, the chicken coop run. The real game, not the animal viewer.
//   flock /tmp/cb.lock node scripts/livestockShots.mjs <outDir> [port=5961] [quality=high] [only]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5961), quality = process.argv[4] || 'high', only = process.argv[5] || '';
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text().slice(0, 300)); });
  await page.goto(`http://localhost:${port}/?seed=7&lowrender=1&clean`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  await page.evaluate(q => window.__cb.store.getState().setQuality(q), quality);
  const frames = async () => { await page.evaluate(() => window.__cb.qa.renderNow()); };
  const run = (n, h = 11) => page.evaluate(([n, h]) => { const { world, game } = window.__cb, g = game.getState().game; for (let i = 0; i < n; i++) { world.updatePeople(0.1, g, h, 1); world.updateLivestock(0.1, g, h, 1); } }, [n, h]);
  const shot = async (name) => { if (only && !name.includes(only)) return; await frames(); await frames(); await page.screenshot({ path: `${out}/${name}.png` }); lap(name); };
  await page.evaluate(async () => {
    const cb = window.__cb, G = cb.game; G.getState().setSpeed(0);
    const c = cb.world.camp;
    const g = structuredClone(G.getState().game);
    g.structures = g.structures.filter(x => Math.hypot(x.x - c.x, x.z - c.z) > 16);
    const B = [['farmhouse', -3, -4], ['barn', -10, -7.5], ['sheep_barn', 8, -7], ['chicken_coop', -8, 1.5], ['barnyard', 3, 5]];
    for (const [kind, dx, dz] of B) g.structures.push({ id: 'cb' + kind, kind, x: c.x + dx, z: c.z + dz, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    g.stock.goat = 4; g.stock.cow = 5; g.stock.steer = 3; g.stock.sheep = 6; g.stock.pig = 4; g.stock.rabbit = 3;
    g.clock.t = Math.floor(g.clock.t) + 0.46;
    g.gate.next = 1e9; g.gate.pending = null; g.gate.card = null;
    G.setState({ game: g });
    G.getState().advance(0.01);
    const st = cb.store.getState();
    st.setHudHidden(true); st.setTimeOfDay(11); st.setDayOfYear(172); st.setSeasonMode('summer'); st.setWeatherMode('clear');
  });
  await frames(); await run(60);
  await page.evaluate(() => { window.__cb.store.getState().setTimeOfDay(11); });
  await run(400);
  console.error('herd', await page.evaluate(() => window.__cb.world.livestock.animals().map(a => `${a.kind}@${a.x.toFixed(1)},${a.z.toFixed(1)}${a.inside ? 'i' : ''}`).join(' ')));
  // camera helpers. `look(tx, tz, dist, h, pref)`: of 16 bearings (starting with `pref`, alternating either side) the first spot `dist` away on open
  // ground from which the ground does not rise between the eye and the target (no hill in the shot, no wall), and the eye stands there at height `h`
  const look = (tx, tz, dist, h, pref = 0.4, ty = 0.12) => page.evaluate(([tx, tz, dist, h, pref, ty]) => {
    const { cam, world } = window.__cb, G = (x, z) => world.groundAt(x, z);
    let pick = null;
    for (let k = 0; k < 16 && !pick; k++) {
      const b = pref + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 8;
      const [ex, ez] = world.openSpotNear(tx + Math.cos(b) * dist, tz + Math.sin(b) * dist, 0.3);
      if (Math.hypot(ex - tx, ez - tz) < dist * 0.6 || Math.hypot(ex - tx, ez - tz) > dist * 1.5) continue;
      const ey = G(ex, ez) + Math.max(h, 0.25), gy = G(tx, tz) + ty;
      let ok = true;
      for (let i = 1; i < 14; i++) { const t = i / 14, x = ex + (tx - ex) * t, z = ez + (tz - ez) * t; if (G(x, z) > ey + (gy - ey) * t - 0.02) { ok = false; break; } }
      if (ok) pick = [ex, ez];
    }
    if (!pick) pick = world.openSpotNear(tx + Math.cos(pref) * dist, tz + Math.sin(pref) * dist, 0.3);
    window.__cb.qa.pose = null; cam.placeEye(pick[0], pick[1], tx, tz, h);
    return pick;
  }, [tx, tz, dist, h, pref, ty]);
  const centroid = (kinds) => page.evaluate(kinds => {
    const an = window.__cb.world.livestock.animals().filter(a => !a.inside && kinds.includes(a.kind));
    return an.length ? [an.reduce((s, a) => s + a.x, 0) / an.length, an.reduce((s, a) => s + a.z, 0) / an.length] : null;
  }, kinds);
  const eye = async (kinds, dist, bearing, h) => { const c = await centroid(kinds); if (!c) return false; await look(c[0], c[1], dist, h, bearing); return true; };
  const person = (kind, dx, dz) => page.evaluate(([kind, dx, dz]) => {
    const { world, game } = window.__cb, g = game.getState().game, b = world.livestock.animals().find(a => a.kind === kind && !a.inside);
    const id = g.people.find(p => !p.kid).id, a = world.family._agents.get(id);
    if (b && a) { a.x = b.x + dx; a.z = b.z + dz; a.via = []; a.wait = 99; }
    world.updatePeople(0.01, g, 11, 1);
  }, [kind, dx, dz]);
  const aerial = (kinds, radius, pitch, yaw) => page.evaluate(([kinds, radius, pitch, yaw]) => {
    const { cam, world } = window.__cb, an = world.livestock.animals().filter(a => !a.inside && kinds.includes(a.kind));
    const cx = an.length ? an.reduce((s, a) => s + a.x, 0) / an.length : world.camp.x, cz = an.length ? an.reduce((s, a) => s + a.z, 0) / an.length : world.camp.z;
    window.__cb.qa.pose = null; cam.target.set(cx, world.groundAt(cx, cz) + 0.1, cz); cam.radius = radius; cam.pitch = pitch; cam.yaw = yaw;
  }, [kinds, radius, pitch, yaw]);

  // 1. scale: a person beside a cow, eye level

  // the same for each kind: the first free animal of the kind with a person standing beside it, eye level, a little off its side
  // a person standing beside the first free animal of the kind: the camera is chosen first (clear line, eye level), then the person is put
  // `off` to the left of the animal as seen from the camera, so the two always stand side by side and neither hides the other
  const beside = async (kind, off, dist, h, name) => {
    const A = await page.evaluate(kind => { const L = window.__cb.world.livestock, b = L.animals().find(a => a.kind === kind && !a.inside); if (!b) return null; L._agents.get(b.id).wait = 999; L._agents.get(b.id).graze = 0; return [b.x, b.z]; }, kind);
    if (!A) return;
    const E = await look(A[0], A[1], dist, h, 1.3);
    const dx = A[0] - E[0], dz = A[1] - E[1], l = Math.hypot(dx, dz) || 1, P = [A[0] - dz / l * off, A[1] + dx / l * off];
    await page.evaluate(([P, E, A, h]) => {
      const { cam, world, game } = window.__cb, g = game.getState().game, id = g.people.find(p => !p.kid).id, a = world.family._agents.get(id);
      a.x = P[0]; a.z = P[1]; a.via = []; a.wait = 99;
      world.updatePeople(0.01, g, 11, 1);
      cam.placeEye(E[0], E[1], (P[0] + A[0]) / 2, (P[1] + A[1]) / 2, h);
    }, [P, E, A, h]);
    await shot(name);
  };
  await beside('cow', 0.34, 1.5, 0.17, '01-person-beside-cow-eye');
  await beside('steer', 0.34, 1.5, 0.17, '01b-person-beside-steer-eye');
  await beside('sheep', 0.26, 1.2, 0.13, '03a-person-beside-sheep-eye');
  await beside('goat', 0.26, 1.2, 0.13, '03b-person-beside-goat-eye');
  await beside('pig', 0.3, 1.3, 0.13, '04a-person-beside-pig-eye');
  await eye(['cow', 'steer'], 2.0, 0.4, 0.2);
  await shot('02-herd-eye');
  await eye(['sheep'], 1.2, 1.2, 0.12);
  await shot('03-sheep-eye');
  await eye(['goat'], 1.2, 1.2, 0.12);
  await shot('03-goat-eye');
  await eye(['pig'], 1.2, 0.5, 0.14);
  await shot('04-pig-eye');
  // 2. the pasture from above
  await aerial(['cow', 'steer'], 7, 1.0, 0.5);
  await shot('05-pasture-aerial');
  await aerial(['cow', 'steer'], 18, 0.8, 0.5);
  await shot('06-pasture-far');
  // 3. the barn yard at dawn, noon, dusk and night
  for (const [name, h] of [['dawn', 7.2], ['noon', 12], ['dusk', 19.1], ['dusk-queue', 20.2], ['night', 22.5]]) {
    await page.evaluate(h => window.__cb.store.getState().setTimeOfDay(h), h);
    await run(name === 'night' ? 900 : name === 'dusk-queue' ? 90 : 250, h);
    await page.evaluate(() => {
      const cb = window.__cb, w = cb.world;
      // the yard: the middle of the cows, steers and goats by day (remembered for the night shot, when they are inside)
      const an = w.livestock.animals().filter(a => !a.inside && ['cow', 'steer', 'goat'].includes(a.kind));
      if (an.length) window.__yardT = [an.reduce((s, a) => s + a.x, 0) / an.length, an.reduce((s, a) => s + a.z, 0) / an.length];
      const [tx, tz] = window.__yardT ?? [w.camp.x, w.camp.z];
      // by night the barn animals are shut in (hidden at the door): aim at the doorway, from the side it faces
      const ins = w.livestock.animals().filter(a => a.inside && ['cow', 'steer', 'goat'].includes(a.kind)), barn = cb.game.getState().game.structures.find(s => s.kind === 'barn');
      if (ins.length && barn) {
        const r = (barn.rot ?? 0) * Math.PI / 2;
        window.__yardLook = [ins.reduce((s, a) => s + a.x, 0) / ins.length, ins.reduce((s, a) => s + a.z, 0) / ins.length, Math.atan2(Math.cos(r), Math.sin(r)), 2.3];
      } else window.__yardLook = [tx, tz, 0.9, 3.4];
    });
    // eye height, on level ground in front of the barn, the ground never rising into the line of sight
    { const [lx, lz, pb, dd] = await page.evaluate(() => window.__yardLook); await look(lx, lz, dd, 0.32, pb, 0.2); }
    await shot(`07-yard-${name}`);
    if (name === 'night' || name === 'dusk-queue') {
      // the open barn: from the yard at eye level straight through the door at the animals resting inside (the barn is the one the herd sleeps in)
      const T = await page.evaluate(() => {
        const cb = window.__cb, barn = cb.game.getState().game.structures.find(s => s.kind === 'barn'), r = (barn.rot ?? 0) * Math.PI / 2, ux = Math.sin(r), uz = Math.cos(r);
        return [barn.x - ux * 0.7, barn.z - uz * 0.7, Math.atan2(uz, ux)];
      });
      await look(T[0], T[1], 1.6, 0.3, T[2], 0.18);
      await shot(`07c-barn-open-${name}`);
    }
  }
  // 4. the chicken coop run
  await page.evaluate(() => window.__cb.store.getState().setTimeOfDay(10));
  await run(300, 10);
  await eye(['hen'], 0.6, 0.9, 0.06);
  await shot('08-coop-run-eye');
  await beside('hen', 0.2, 0.8, 0.07, '08a-person-beside-hen-eye');
  await aerial(['hen'], 4, 1.1, 0.3);
  await shot('09-coop-run-aerial');
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
