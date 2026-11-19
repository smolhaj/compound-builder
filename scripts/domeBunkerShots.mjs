// Dome bunker shots (docs/ux/dome-bunker): a bunker under a dome, finished (U, V, Skirt section, eye level at the hatch, placing card, Dome page) and going into the open crater with the dome.
//   node scripts/domeBunkerShots.mjs <outDir> [tier=glass] [port] [set: done,crater,cards]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], tier = process.argv[3] || 'glass', port = Number(process.argv[4] || 5991), sets = (process.argv[5] || 'done,crater,cards').split(',');
const cells = tier === 'arcology' ? 36 : tier === 'glass' ? 15 : 7;
const W = Number(process.env.W || 1500), H = Number(process.env.H || 850), PR = process.env.PR || '0.9', QUAL = process.env.QUAL || 'high';
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(`http://localhost:${port}/?seed=7&clean&lowrender=${PR}&region=mountain_west&acres=20&relief=2&lotseed=8`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  const frames = async (n = 1) => { for (let i = 0; i < n; i++) await page.evaluate(() => window.__cb.qa.renderNow()); };
  const shot = async name => { await frames(3); if (QUAL !== 'none') await page.evaluate(q => window.__cb.qa.renderFull(q), QUAL); await page.screenshot({ path: `${out}/${tier}-${name}.png` }); lap(name); };
  const pose = (e, l, fov = 55) => page.evaluate(([e, l, fov]) => { window.__cb.qa.pose = { x: e[0], y: e[1], z: e[2], lx: l[0], ly: l[1], lz: l[2], fov }; }, [e, l, fov]);
  const info = await page.evaluate(async ([tier, cells]) => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp; G.getState().setSpeed(0);
    G.setState(s => ({ game: { ...s.game, money: 900_000_000 } }));
    const kind = `dome_${tier}_${cells}`, R0 = cells * 0.25;
    const rng = (x, z) => { let lo = 1e9, hi = -1e9; for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12, h = cb.world.groundAt(x + R0 * Math.sin(a), z + R0 * Math.cos(a)); lo = Math.min(lo, h); hi = Math.max(hi, h); } return hi - lo; };
    let best = null;
    for (let dx = -16; dx <= 16; dx += 2) for (let dz = -16; dz <= 16; dz += 2) { const x = c.x + dx, z = c.z + dz, r = rng(x, z); if (!best || r < best.r) { const sp = cb.tool.findSpot(kind, x, z, 0, 1.5); if (sp) best = { r, x: sp[0], z: sp[1] }; } }
    const sp = best ?? { x: c.x, z: c.z };
    G.getState().plan(kind, sp.x, sp.z, 0);
    const dome = G.getState().game.structures.at(-1);
    // the bunker: a hatch, a bunkroom, a galley and a plant room, wall to wall, west of the center
    const hx = Math.round(sp.x * 4) / 4 - 0.75, hz = Math.round(sp.z * 4) / 4 - 0.25, bk = await import('/src/sim/dome/bunkerLive.ts');
    const list = [['bunker_hatch', hx, hz], ['bunker_dorm', hx + 0.75, hz + 0.25], ['bunker_galley', hx + 1.75, hz + 0.25], ['bunker_plant', hx + 0.75, hz + 1.25], ['bunker_comms', hx + 1.75, hz + 1.25]];
    const ids = [];
    for (const [k, x, z] of list) {
      const h = (px, pz) => cb.world.groundAt(px, pz);
      const floor = Math.round((h(hx, hz) - (h(hx, hz) - 0.8)) * 20 + 1);
      G.setState(s => { const g = structuredClone(s.game); return { game: g }; });
      G.getState().plan(k, x, z, 0);
      const st = G.getState().game.structures.at(-1);
      G.setState(s => { const g = structuredClone(s.game), p = g.structures.find(q => q.id === st.id); bk.stampUnderDome(g, p, { dome: dome.id, floorFt: floor }, true); return { game: g }; });
      ids.push(st.id);
    }
    cb.store.getState().setHudHidden?.(true);
    return { dome: dome.id, ids, x: dome.x, z: dome.z, hx, hz, R: cells * 0.25 };
  }, [tier, cells]);
  lap(JSON.stringify(info));
  const setP = async (P, piecesP, finish) => page.evaluate(async ([d, ids, P, pp, fin]) => {
    const cb = window.__cb, con = await import('/src/sim/construction.ts');
    cb.game.setState(s => { const g = structuredClone(s.game);
      const apply = (st, f) => { const bp = con.blueprintOf(st).stages, total = bp.reduce((a, x) => a + x.hours, 0);
        if (f >= 1) { st.stage = bp.length; st.done = 0; st.finishedAt = 0; } else { let left = f * total, i = 0; while (i < bp.length - 1 && left >= bp[i].hours) { left -= bp[i].hours; i++; } st.stage = i; st.done = left; st.finishedAt = undefined; } st.supplied = true; };
      apply(g.structures.find(x => x.id === d), P);
      for (const id of ids) apply(g.structures.find(x => x.id === id), fin ? 1 : pp);
      return { game: g }; });
    cb.world.syncProgress(cb.game.getState().game.structures);
  }, [info.dome, info.ids, P, piecesP, finish]);
  await page.evaluate(() => { const s = window.__cb.store.getState(); s.setTimeOfDay(15.5); s.setBuildingView('full'); s.setWeatherMode('clear'); });
  const D = info, R = info.R, ground = await page.evaluate(([x, z]) => window.__cb.world.groundAt(x, z), [D.x, D.z]);
  if (sets.includes('crater')) {
    // the project at 25, 45, 65 and 85 percent: the dome's crater first, the bunker's shell once the crater is deep and before the backfill, its fit-out last
    for (const P of [0.25, 0.45, 0.65, 0.85]) {
      const share = Math.max(0, Math.min(1, (P - 0.2) / 0.5));
      await setP(P, share * 0.8, false); await frames(2);
      const tag = `crater-p${Math.round(P * 100)}`;
      await pose([D.x + R * 1.0, ground + R * 1.7, D.z + R * 1.2], [D.x - R * 0.2, ground - 0.6, D.z], 52); await shot(`${tag}-aerial`);
      await pose([D.x + R * 0.3, ground + R * 0.6, D.z + R * 0.8], [D.x - R * 0.2, ground - 0.8, D.z - R * 0.1], 62); await shot(`${tag}-near`);
    }
  }
  if (sets.includes('done') || sets.includes('cards')) {
    await setP(1, 1, true); await frames(3);
  }
  if (sets.includes('done')) {
    await page.evaluate(() => window.__cb.store.getState().setUnderground(true)); await frames(3);
    await pose([D.x + R * 0.5, ground + R * 0.9, D.z + R * 0.9], [D.x - R * 0.1, ground - 0.5, D.z], 58); await shot('under');
    await pose([D.x - R * 0.15, ground + R * 1.5, D.z + 0.01], [D.x - R * 0.15, ground - 0.5, D.z], 50); await shot('under-top');
    await page.evaluate(() => window.__cb.store.getState().setUnderground(false));
    await page.evaluate(() => window.__cb.store.getState().setBuildingView('cutaway')); await frames(3);
    await pose([D.x + R * 0.5, ground + R * 0.9, D.z + R * 0.9], [D.x - R * 0.1, ground - 0.3, D.z], 58); await shot('cutaway');
    await pose([D.x + R * 1.3, ground + R * 1.0, D.z + R * 1.8], [D.x, ground - R * 0.1, D.z], 55); await shot('cutaway-moat');
    await page.evaluate(() => window.__cb.store.getState().setBuildingView('full'));
    await pose([D.x + 0.3, ground + R * 0.7, D.z + R * 1.2], [D.x, ground - R * 0.1, D.z], 56); await frames(2);
    await page.evaluate(id => window.__cb.store.getState().setDomeSection(id), D.dome); await frames(3); await shot('section');
    await page.evaluate(() => window.__cb.store.getState().setDomeSection(null));
    // eye level in the dome: the hatch with a person beside it
    await page.evaluate(async ([x, z]) => { const cb = window.__cb, m = await import('/src/game/HomesteadWorld.ts'); cb.ws.scene.add(m.scaleFigure(x, z, cb.world.groundAt(x, z))); }, [D.hx + 0.55, D.hz + 0.9]);
    await pose([D.hx + 0.2, ground + 0.34, D.hz + 1.6], [D.hx, ground + 0.1, D.hz], 62); await shot('eye-hatch');
  }
  if (sets.includes('cards')) {
    await setP(1, 1, true);
    await page.evaluate(async ([x, z]) => { const cb = window.__cb, bk = await import('/src/sim/dome/bunkerLive.ts'), g = cb.game.getState().game; const st = cb.store.getState();
      st.setHudHidden?.(false); cb.game.setState({ tool: 'bunker_corridor', bunkerSite: bk.bunkerSite(g, 'bunker_corridor', { x0: x - 0.25, z0: z - 0.5, x1: x + 0.25, z1: z + 0.5 }, 17) }); }, [D.x, D.z - 0.5]);
    await pose([D.x + R * 1.3, ground + R * 1.0, D.z + R * 1.8], [D.x, ground - R * 0.1, D.z], 55); await frames(3); await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/${tier}-placing-card.png` }); lap('placing-card');
    await page.evaluate(() => window.__cb.game.setState({ tool: null, bunkerSite: null }));
    const open = await page.getByRole('button', { name: /Dome/ }).first().click({ timeout: 8000 }).then(() => true).catch(() => false);
    await frames(3); await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/${tier}-dome-panel-${open ? 'open' : 'closed'}.png` }); lap('dome-panel');
  }
  await page.close();
} finally { await browser.close(); vite.kill(); }
