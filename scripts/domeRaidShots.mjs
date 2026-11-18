// Dome tunnel airlock and a breached panel (docs/DOME_COMPOUND.md, raids slice): a tunnel through the first airlock, a breach on the shell, and an untouched arcology.
// (copy of domeShots.mjs)
// Software GL is slow: one browser, ?lowrender. Run under the render lock:
//   flock /tmp/cb.lock node scripts/domeShots.mjs <outDir> [region=mountain_west] [tiers=geodesic,glass] [port=5971]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], region = process.argv[3] || 'mountain_west', tiers = (process.argv[4] || 'earthen,geodesic,glass,arcology').split(','), port = Number(process.argv[5] || 5971);
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
try {
  for (const tier of tiers) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(900000);
    page.on('pageerror', e => console.error('pageerror:', e.message));
    page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
    await page.goto(`http://localhost:${port}/?seed=7&clean&lowrender=0.75&region=${region}&acres=40&lotseed=8`);
    await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
    const frames = async (n = 1) => { for (let i = 0; i < n; i++) await page.evaluate(() => window.__cb.qa.renderNow()); };
    const shot = async (name) => { await frames(3); await page.screenshot({ path: `${out}/${region}-${tier}-${name}.png` }); lap(`${tier} ${name}`); };
    const set = (js) => page.evaluate(js => new Function('cb', js)(window.__cb), js);
    const info = await page.evaluate(async ([tier]) => {
      const cb = window.__cb, G = cb.game, c = cb.world.camp; G.getState().setSpeed(0);
      G.setState(s => ({ game: { ...s.game, money: 500_000_000 } }));
      const kinds = { earthen: 'dome_earthen', geodesic: 'dome_geodesic', glass: 'dome_glass', arcology: 'dome_arcology' };
      const put = (kind, x, z, rot = 0, r = 8) => { const sp = cb.tool.findSpot(kind, x, z, rot, r); if (!sp) return null; G.getState().plan(kind, sp[0], sp[1], rot); return { id: G.getState().game.structures.at(-1).id, x: sp[0], z: sp[1] }; };
      const big = tier === 'arcology' || tier === 'glass';
      // the dome first, over open ground near the camp; then the family's things inside it
      const dome = put(kinds[tier], c.x - 1, c.z - 1, 0, big ? 30 : 12);
      const inside = (kind, dx, dz) => dome ? put(kind, dome.x + dx, dome.z + dz, 0, 0.5) : null;
      const R = { earthen: 0.5, geodesic: 1.25, glass: 3.75, arcology: 9 }[tier];
      const house = tier === 'earthen' ? null : inside('timber_cabin', -R * 0.25, -R * 0.15);
      const garden = tier === 'earthen' || tier === 'geodesic' ? null : inside('garden', R * 0.3, R * 0.25);
      const shed = tier === 'arcology' ? inside('workshop', -R * 0.4, R * 0.35) : null;
      const barn = tier === 'arcology' ? inside('barn', R * 0.35, -R * 0.4) : null;
      G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) { st.stage = 99; st.done = 0; st.finishedAt = 0; st.supplied = true; } g.utilities.lit = ['x']; return { game: g }; });
      if (dome && tier !== 'earthen') {
        const sim = await import('/src/sim/dome/standing.ts');
        const d = sim.domesOf(G.getState().game, true).find(x => x.id === dome.id), a = d.airlocks[0];
        G.getState().planRun('underground_passage', [[a.outX + Math.sin(a.angle) * 6, a.outZ + Math.cos(a.angle) * 6], [d.x, d.z]], [], 0);
        G.setState(s => { const g = structuredClone(s.game); for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; } if (tier === 'glass') { const ang = 1.9; g.raidDamage = [{ id: 'dmg1', kind: 'panel', x: d.x + Math.sin(ang) * d.r, z: d.z + Math.cos(ang) * d.r, structure: d.id, panels: 5, day: 1, hours: 20, done: 0, supplied: false, bill: { dome_glass_kit: 1 }, readyDay: 99 }]; } return { game: g }; });
      }
      cb.store.getState().setHudHidden?.(true);
      // a person for scale (0.28 tall), inside by the first airlock and outside by the front door of the dome
      const m = await import('/src/game/HomesteadWorld.ts');
      const gnd = (x, z) => cb.world.groundAt(x, z);
      if (dome) { for (const [dx, dz] of [[0.0, R * 0.55], [0.0, R * 1.18]]) { const f = m.scaleFigure(dome.x + dx, dome.z + dz, gnd(dome.x + dx, dome.z + dz)); cb.ws.scene.add(f); } }
      return { camp: [c.x, c.z], house, garden, dome, n: G.getState().game.structures.length, why: dome ? null : 'no spot' };
    }, [tier]);
    lap(JSON.stringify(info));
    if (!info.dome) { await page.close(); continue; }
    await frames(2);
    const R = { earthen: 0.5, geodesic: 1.25, glass: 3.75, arcology: 9 }[tier];
    const pose = (e, l, fov = 60) => page.evaluate(([e, l, fov]) => { window.__cb.qa.pose = { x: e[0], y: e[1], z: e[2], lx: l[0], ly: l[1], lz: l[2], fov }; }, [e, l, fov]);
    const D = info.dome;
    const ground = await page.evaluate(([x, z]) => window.__cb.world.groundAt(x, z), [D.x, D.z]);
    await set(`cb.store.getState().setTimeOfDay(12); cb.store.getState().setBuildingView('full');`);
    const g0 = await page.evaluate(() => { const g = window.__cb.game.getState().game; return g.raidDamage?.[0] ?? null; });
    await pose([D.x + R * 1.1, ground + R * 2.2 + 1.2, D.z + R * 1.3], [D.x, ground, D.z], 55); await shot('above');
    // the tunnel airlock (front, +z): from above and at eye level, a person for scale stands by it
    await pose([D.x + R * 0.5, ground + R * 0.9 + 0.8, D.z + R * 1.5], [D.x, ground, D.z + R * 0.9], 60); await shot('tunnel-airlock-above');
    await pose([D.x + R * 0.18, ground + 0.3, D.z + R + Math.min(2.0, R * 0.5 + 0.5)], [D.x, ground + 0.15, D.z + R * 0.9], 62); await shot('tunnel-airlock-eye');
    await pose([D.x + R * 0.12, ground + 0.4, D.z + R * 0.55], [D.x, ground + 0.15, D.z + R * 1.05], 70); await shot('tunnel-airlock-inside');
    if (g0) { const hx = g0.x, hz = g0.z, ux = (hx - D.x) / R, uz = (hz - D.z) / R;
      await pose([hx + ux * 1.6 - uz * 0.6, ground + 0.3, hz + uz * 1.6 + ux * 0.6], [hx, ground + 0.15, hz], 62); await shot('breached-panel-eye');
      await pose([D.x + R * 1.7, ground + R * 1.6 + 1, D.z + R * 0.2], [hx, ground, hz], 55); await shot('breached-panel-above'); }
    await page.close();
  }
} finally { await browser.close(); vite.kill(); }
