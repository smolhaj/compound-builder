// The dome's diameter handle and the airlock chamber (docs/DOME_COMPOUND.md, "geometry and sizing slice").
//   mode=ghost  the circle ghost at three diameters (valid, over a building, over the property line) with the placing card, HUD up
//   mode=tiers  each tier's airlock from outside and inside, above and at eye level, a tunnel through the first airlock, one breached panel
// Software GL is slow: one browser, ?lowrender. Run under the render lock:
//   flock /tmp/cb.lock node scripts/domeGeoShots.mjs <outDir> [mode=ghost|tiers] [tiers=geodesic,glass] [port=5991]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], mode = process.argv[3] || 'ghost', tiers = (process.argv[4] || 'geodesic,glass,arcology').split(','), port = Number(process.argv[5] || 5991), cellsArg = process.argv[6] ? Number(process.argv[6]) : null;   // cellsArg: a size in cells (10 ft each) for every tier of the run
const BERM = { geodesic: 5 }, DEFAULT_CELLS = { earthen: 2, geodesic: 7, glass: 15, arcology: 36 };
// the radius the builder lays the airlocks on: a quarter unit per cell, less the berm and a hair
const radiusOf = tier => (cellsArg ?? DEFAULT_CELLS[tier]) * 0.25 - 0.03 - (BERM[tier] ?? 0) / 20;
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
const region = 'mountain_west';
try {
  if (mode === 'ghost') {
    const page = await browser.newPage({ viewport: { width: 1512, height: 860 } });
    page.setDefaultTimeout(900000);
    page.on('pageerror', e => console.error('pageerror:', e.message));
    await page.goto(`http://localhost:${port}/?seed=7&lowrender=0.75&layout=a&region=${region}&acres=40&lotseed=8`);
    await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
    const shot = async (name) => { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(400); await page.evaluate(() => window.__cb.qa.renderNow()); await page.screenshot({ path: `${out}/${name}.png` }); lap(name); };
    const info = await page.evaluate(async () => {
      const cb = window.__cb, G = cb.game, c = cb.world.camp; G.getState().setSpeed(0); G.getState().setWelcome?.(false);
      G.setState(s => ({ game: { ...s.game, money: 80_000_000 } }));
      const land = await import('/src/sim/land.ts');
      // a cabin and a garden for the dome to straddle / cover; the property line: walk west from the camp until the land ends
      const put = (kind, x, z) => { const sp = cb.tool.findSpot(kind, x, z, 0, 8); if (!sp) return null; G.getState().plan(kind, sp[0], sp[1], 0); return { x: sp[0], z: sp[1] }; };
      const cabin = put('timber_cabin', c.x + 6, c.z + 4);
      const garden = put('garden', c.x + 4, c.z - 6);
      let edge = null; for (let d = 0; d < 80; d += 0.5) { const x = c.x - d; if (!land.ownsAt(G.getState().game, x, c.z)) { edge = [x + 0.5, c.z]; break; } }
      G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) { st.stage = 99; st.done = 0; st.finishedAt = 0; st.supplied = true; } return { game: g }; });
      const cam = cb.cam; cam.target.set(c.x + 2, 0, c.z); cam.radius = 13; cam.pitch = 1.0;
      return { camp: [c.x, c.z], cabin, garden, edge };
    });
    lap(JSON.stringify(info));
    const set = async (tier, cells, x, z) => { await page.evaluate(([tier, cells, x, z]) => { const cb = window.__cb; cb.game.getState().setTool(null); cb.tool.setKind(`dome_${tier}`); cb.game.getState().setDomeCells(tier, cells); cb.tool.hoverAt(x, z); }, [tier, cells, x, z]); await page.waitForTimeout(300); };
    const [cx, cz] = info.camp;
    // valid: open ground, three diameters
    for (const c of [5, 7, 10]) { await page.evaluate(([x, z]) => { const cam = window.__cb.cam; cam.target.set(x, 0, z); cam.radius = 13; cam.pitch = 1.0; }, [cx - 8, cz - 8]); await set('geodesic', c, cx - 8, cz - 8); await shot(`ghost-geodesic-${c * 10 - 10}ft-valid`); }
    // invalid: the wall through the cabin
    await page.evaluate(([x, z]) => { const cam = window.__cb.cam; cam.target.set(x, 0, z); cam.radius = 13; cam.pitch = 1.0; }, [info.cabin.x, info.cabin.z]);
    await set('geodesic', 7, info.cabin.x + 1.2, info.cabin.z); await shot('ghost-straddles-building');
    // valid and covering: the same dome moved so the cabin is wholly inside
    await set('geodesic', 10, info.cabin.x, info.cabin.z); await shot('ghost-covers-building');
    // invalid: over the property line
    if (info.edge) { await page.evaluate(([x, z]) => { const cam = window.__cb.cam; cam.target.set(x, 0, z); cam.radius = 22; cam.pitch = 0.95; }, info.edge); await set('geodesic', 9, info.edge[0] + 1, info.edge[1]); await shot('ghost-over-property-line'); }
    // the glass and arcology ghosts, wide
    const spot = (k) => page.evaluate(([k, x, z]) => window.__cb.tool.findSpot(k, x, z, 0, 40), [k, cx - 8, cz - 8]);
    const g = await spot('dome_glass'), ar = await spot('dome_arcology_30');
    await page.evaluate(([x, z]) => { const cam = window.__cb.cam; cam.target.set(x, 0, z); cam.radius = 48; cam.pitch = 0.9; }, g);
    await set('glass', 15, g[0], g[1]); await shot('ghost-glass-150ft');
    await page.evaluate(([x, z]) => { const cam = window.__cb.cam; cam.target.set(x, 0, z); cam.radius = 90; cam.pitch = 0.9; }, ar);
    await set('arcology', 30, ar[0], ar[1]); await shot('ghost-arcology-300ft');
  } else {
    for (const tier of tiers) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      page.setDefaultTimeout(900000);
      page.on('pageerror', e => console.error('pageerror:', e.message));
      await page.goto(`http://localhost:${port}/?seed=7&clean&lowrender=0.75&region=${region}&acres=40&lotseed=8`);
      await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
      const frames = async (n = 1) => { for (let i = 0; i < n; i++) await page.evaluate(() => window.__cb.qa.renderNow()); };
      const shot = async (name) => { await frames(3); await page.screenshot({ path: `${out}/${tier}${cellsArg ? '-' + cellsArg : ''}-${name}.png` }); lap(`${tier} ${name}`); };
      const info = await page.evaluate(async ([tier, cellsArg, R]) => {
        const cb = window.__cb, G = cb.game, c = cb.world.camp; G.getState().setSpeed(0);
        G.setState(s => ({ game: { ...s.game, money: 500_000_000 } }));
        const kinds = { earthen: 'dome_earthen', geodesic: 'dome_geodesic', glass: 'dome_glass', arcology: 'dome_arcology' };
        const put = (kind, x, z, rot = 0, r = 8) => { const sp = cb.tool.findSpot(kind, x, z, rot, r); if (!sp) return null; G.getState().plan(kind, sp[0], sp[1], rot); return { id: G.getState().game.structures.at(-1).id, x: sp[0], z: sp[1] }; };
        const big = tier === 'arcology' || tier === 'glass';
        const kind = cellsArg ? `${kinds[tier]}_${cellsArg}` : kinds[tier];
        const dome = put(kind, c.x - 1, c.z - 1, 0, big ? 30 : 12);
        G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) { st.stage = 99; st.done = 0; st.finishedAt = 0; st.supplied = true; } g.utilities.lit = ['x']; return { game: g }; });
        let dmg = null;
        if (dome && tier !== 'earthen') {
          const sim = await import('/src/sim/dome/standing.ts'), siege = await import('/src/sim/dome/siege.ts');
          const d = sim.domesOf(G.getState().game, true).find(x => x.id === dome.id), a = d.airlocks[0];
          G.getState().planRun('underground_passage', [[a.outX + Math.sin(a.angle) * 6, a.outZ + Math.cos(a.angle) * 6], [d.x, d.z]], [], 0);
          const spot = siege.panelSpot(d, 0);
          G.setState(s => { const g = structuredClone(s.game); for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; } g.raidDamage = [{ id: 'dmg1', kind: 'panel', x: spot.x, z: spot.z, structure: d.id, panels: 5, day: 1, hours: 20, done: 0, supplied: false, bill: {}, readyDay: 99 }]; return { game: g }; });
          dmg = { x: spot.x, z: spot.z };
        }
        cb.store.getState().setHudHidden?.(true);
        const m = await import('/src/game/HomesteadWorld.ts');
        if (dome) { for (const [dx, dz] of [[0.0, R * 0.55], [0.0, R * 1.18]]) { const f = m.scaleFigure(dome.x + dx, dome.z + dz, cb.world.groundAt(dome.x + dx, dome.z + dz)); cb.ws.scene.add(f); } }
        return { dome, dmg };
      }, [tier, cellsArg, radiusOf(tier)]);
      lap(JSON.stringify(info));
      if (!info.dome) { await page.close(); continue; }
      await frames(2);
      const R = radiusOf(tier);
      const pose = (e, l, fov = 60) => page.evaluate(([e, l, fov]) => { window.__cb.qa.pose = { x: e[0], y: e[1], z: e[2], lx: l[0], ly: l[1], lz: l[2], fov }; }, [e, l, fov]);
      const D = info.dome, ground = await page.evaluate(([x, z]) => window.__cb.world.groundAt(x, z), [D.x, D.z]);
      await page.evaluate(() => { const s = window.__cb.store.getState(); s.setTimeOfDay(12); s.setBuildingView('full'); });
      await pose([D.x + R * 0.5, ground + R * 0.9 + 0.8, D.z + R * 1.5], [D.x, ground, D.z + R * 0.9], 60); await shot('airlock-above-outside');
      await pose([D.x + R * 0.12, ground + R * 0.7 + 0.9, D.z + R * 0.35], [D.x, ground, D.z + R * 0.9], 60); await shot('airlock-above-inside');
      await pose([D.x + R * 0.18, ground + 0.3, D.z + R + Math.min(2.0, R * 0.5 + 0.5)], [D.x, ground + 0.15, D.z + R * 0.9], 62); await shot('airlock-eye-outside');
      await pose([D.x + R * 0.12, ground + 0.4, D.z + R * 0.55], [D.x, ground + 0.15, D.z + R * 1.05], 70); await shot('airlock-eye-inside');
      // inside the chamber on its axis, looking out through the outer door (the room is the width between its side walls)
      const LEN = Math.min({ geodesic: 0.5, glass: 0.7, arcology: 1.4 }[tier] ?? 0.2, R * 0.34), rin = R - LEN * 0.7;
      await pose([D.x, ground + 0.22, D.z + rin], [D.x, ground + 0.18, D.z + R + 1.5], 68); await shot('chamber-eye-looking-out');
      await pose([D.x, ground + 0.22, D.z + R + 0.9], [D.x, ground + 0.12, D.z + R - LEN], 62); await shot('chamber-eye-looking-in');
      await pose([D.x + R * 0.9 + 1.2, ground + R * 0.5 + 0.7, D.z + R * 0.2 + 3 ], [D.x, ground, D.z + R * 0.85], 50); await shot('tunnel-line-above');
      if (info.dmg) { const hx = info.dmg.x, hz = info.dmg.z, ux = (hx - D.x) / R, uz = (hz - D.z) / R;
        await pose([hx + ux * 1.6 - uz * 0.6, ground + 0.3, hz + uz * 1.6 + ux * 0.6], [hx, ground + 0.15, hz], 62); await shot('breached-panel-eye');
        await pose([D.x + ux * R * 1.7, ground + R * 1.5 + 1, D.z + uz * R * 1.7], [hx, ground, hz], 55); await shot('breached-panel-above'); }
      await page.close();
    }
  }
} finally { await browser.close(); vite.kill(); }
