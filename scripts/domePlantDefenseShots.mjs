// Dome plant and defense shots (docs/ux/dome-plant-defense): the hardened yard outside, the service gallery in the arcology's band, the glass dome's plant yard inside,
// a damaged plant (a burning chiller, a dark substation) and the Dome panel's plant section. Based on domePlantShots.mjs.
//   flock /tmp/cb.lock node scripts/domePlantDefenseShots.mjs <outDir> [tier=arcology|glass] [cells] [port] [only=comma,names]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], tier = process.argv[3] || 'arcology', cells = Number(process.argv[4] || (tier === 'arcology' ? 36 : 15)), port = Number(process.argv[5] || 5983), only = process.argv[6] ? process.argv[6].split(',') : null;
const W = Number(process.env.W || 1600), H = Number(process.env.H || 900), PR = process.env.PR || '0.9';
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
const want = n => !only || only.includes(n);
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text().slice(0, 200)); });
  await page.goto(`http://localhost:${port}/?seed=7${process.env.PANEL ? "&layout=a" : "&clean"}&lowrender=${PR}&region=${process.env.REGION ?? 'mountain_west'}&acres=20&relief=${process.env.RELIEF ?? 2}&lotseed=${process.env.LOTSEED ?? 8}`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  const frames = async (n = 1) => { for (let i = 0; i < n; i++) await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(250); };
  const shot = async (name, q = process.env.QUAL || 'high') => { await frames(2); if (q && q !== 'none') await page.evaluate(q => window.__cb.qa.renderFull(q), q); await page.screenshot({ path: `${out}/${tier}-${name}.png` }); lap(name); };
  const set = js => page.evaluate(js => new Function('cb', js)(window.__cb), js);
  const info = await page.evaluate(async ([tier, cells]) => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp; G.getState().setSpeed(0);
    G.setState(s => ({ game: { ...s.game, money: 900_000_000 } }));
    const kind = `dome_${tier}_${cells}`;
    const put = (kind, x, z, rot = 0, r = 8) => { const sp = cb.tool.findSpot(kind, x, z, rot, r); if (!sp) return null; G.getState().plan(kind, sp[0], sp[1], rot); return { id: G.getState().game.structures.at(-1).id, x: sp[0], z: sp[1] }; };
    const R0 = cells * 0.25, rng = (x, z) => { let lo = 1e9, hi = -1e9; for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12, h = cb.world.groundAt(x + R0 * Math.sin(a), z + R0 * Math.cos(a)); lo = Math.min(lo, h); hi = Math.max(hi, h); } return hi - lo; };
    let best = null;
    for (let dx = -16; dx <= 16; dx += 2) for (let dz = -16; dz <= 16; dz += 2) { const x = c.x + dx, z = c.z + dz, r = rng(x, z); if (!best || r < best.r) { const sp = cb.tool.findSpot(kind, x, z, 0, 1.5); if (sp) best = { r, x: sp[0], z: sp[1] }; } }
    const dome = best ? put(kind, best.x, best.z, 0, 1.5) : put(kind, c.x, c.z, 0, 40);
    if (!dome) return { err: 'no dome spot' };
    const R = cells * 0.25;
    for (const [k, fx, fz] of [['log_house', -0.12, 0.10], ['barn', 0.34, -0.30], ['workshop', 0.18, 0.28], ['garden', -0.28, -0.20], ['greenhouse', -0.46, 0.0], ['well_drilled', -0.02, 0.26], ['solar_array', -0.55, 0.22], ['battery_shed', -0.22, 0.38]]) put(k, dome.x + fx * R, dome.z + fz * R, 0, 2.5);
    G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) { st.stage = 99; st.done = 0; st.finishedAt = 0; st.supplied = true; } g.utilities.lit = ['x']; return { game: g }; });
    { const live = await import('/src/sim/dome/live.ts'); G.setState(s => { const g = structuredClone(s.game); const d = live.domeOf(g); if (d) { const o = live.ownState(g, d); o.filtering = 'closed'; o.loop = 'recycle'; o.spares = ['chiller', 'substation']; g.utilities.fittings.push({ building: d.st.id, kind: 'wire', done: 1, hours: 1, supplied: true, finishedAt: 0 }); } return { game: g }; }); }
    cb.store.getState().setHudHidden?.(true);
    const m = await import('/src/game/HomesteadWorld.ts');
    const gnd = (x, z) => cb.world.groundAt(x, z);
    for (const [fx, fz] of [[-0.05, 0.19], [0.2, -0.05], [-0.2, 0.0]]) { const x = dome.x + fx * R, z = dome.z + fz * R; cb.ws.scene.add(m.scaleFigure(x, z, gnd(x, z))); }
    return { dome, R, camp: [c.x, c.z], n: G.getState().game.structures.length, calls: cb.ws.renderer?.info?.render?.calls };
  }, [tier, cells]);
  lap(JSON.stringify(info));
  if (info.err) throw new Error(info.err);
  await frames(3);
  const D = info.dome, R = info.R;
  const ground = await page.evaluate(([x, z]) => window.__cb.world.groundAt(x, z), [D.x, D.z]);
  const pose = (e, l, fov = 60) => page.evaluate(([e, l, fov]) => { window.__cb.qa.pose = { x: e[0], y: e[1], z: e[2], lx: l[0], ly: l[1], lz: l[2], fov }; }, [e, l, fov]);
  await set(`const s = cb.store.getState(); s.setTimeOfDay(16.8); s.setBuildingView('full'); s.setSeasonMode?.('summer'); s.setWeatherMode('clear');`);
  const yphi = tier === 'glass' ? Math.PI / 3 : Math.PI / 6, Y = [Math.sin(yphi), Math.cos(yphi)];
  const span2 = tier === 'glass' ? Math.PI : Math.PI / 2, Z = [Math.sin(span2), Math.cos(span2)];
  const yardC = [D.x + Y[0] * (R + 0.35 + 1.5), D.z + Y[1] * (R + 0.35 + 1.5)];
  if (want('aerial')) { await pose([D.x + Y[0] * R * 1.9 + 3, ground + R * 0.75, D.z + Y[1] * R * 1.9], [D.x + Y[0] * R * 0.7, ground + R * 0.1, D.z + Y[1] * R * 0.7], 48); await shot('plant-aerial-exterior'); }
  if (want('yard-aerial')) { await pose([yardC[0] + Y[0] * 3.2 + Y[1] * 2.2, ground + 3.4, yardC[1] + Y[1] * 3.2 - Y[0] * 2.2], [yardC[0], ground + 0.2, yardC[1]], 50); await shot('yard-aerial'); }
  if (want('eye')) {
    await page.evaluate(async ([x, z]) => { const cb = window.__cb, m = await import('/src/game/HomesteadWorld.ts'); cb.ws.scene.add(m.scaleFigure(x, z, cb.world.groundAt(x, z))); }, [D.x + Y[0] * (R + 2.2) - Y[1] * 0.9 + 0.5, D.z + Y[1] * (R + 2.2) + Y[0] * 0.9]);
    await pose([D.x + Y[0] * (R + 7.5) + Y[1] * 3.2, ground + 0.45, D.z + Y[1] * (R + 7.5) - Y[0] * 3.2], [D.x + Y[0] * (R + 1.2), ground + 0.5, D.z + Y[1] * (R + 1.2)], 52); await shot('yard-eye-outside');
  }
  if (want('inside')) {
    await pose([D.x + Y[0] * R * 0.62 + Y[1] * 1.6, ground + 0.5, D.z + Y[1] * R * 0.62 - Y[0] * 1.6], [D.x + Y[0] * R * 0.95, ground + 0.3, D.z + Y[1] * R * 0.95], 62); await shot('plant-interior-A');
    await pose([D.x + Z[0] * R * 0.35, ground + 0.5, D.z + Z[1] * R * 0.35], [D.x + Z[0] * R * 0.95, ground + 0.3, D.z + Z[1] * R * 0.95], 66); await shot('plant-interior-B');
    await pose([D.x + Y[0] * R * 0.6 - Y[1] * 3, ground + 1.5, D.z + Y[1] * R * 0.6 + Y[0] * 3], [D.x + Y[0] * R * 0.93, ground + 0.3, D.z + Y[1] * R * 0.93], 58); await shot('plant-interior-high');
  }
  if (want('under')) {
    await set(`cb.world.setUnderground(true)`); await frames(2);
    await pose([yardC[0] + Y[0] * 4 + Y[1] * 3, ground + 5, yardC[1] + Y[1] * 4 - Y[0] * 3], [D.x + Y[0] * R * 0.8, ground - 0.1, D.z + Y[1] * R * 0.8], 55); await shot('underground-lines');
    await set(`cb.world.setUnderground(false)`);
  }
  if (want('damaged') || want('panel') || want('dark')) {
    await page.evaluate(async () => {
      const cb = window.__cb, G = cb.game, live = await import('/src/sim/dome/live.ts'), pl = await import('/src/sim/dome/plantLive.ts');
      G.setState(s => { const g = structuredClone(s.game); const d = live.domeOf(g), st = live.stateOf(g, d);
        pl.damagePlant(g, d, st, 'chiller', 'down', 'raid'); pl.damagePlant(g, d, st, 'chiller2', 'damaged', 'raid'); pl.damagePlant(g, d, st, 'air', 'damaged', 'raid');
        pl.damagePlant(g, d, st, 'substation', 'down', 'raid'); pl.damagePlant(g, d, st, 'substation2', 'down', 'raid');
        for (const j of g.raidDamage) if (j.unit?.startsWith('substation')) j.at = g.clock.t - 3;
        return { game: g }; });
    });
    await frames(4);
  }
  if (want('damaged')) {
    await pose([D.x + Y[0] * R * 1.9 + 3, ground + R * 0.75, D.z + Y[1] * R * 1.9], [D.x + Y[0] * R * 0.7, ground + R * 0.1, D.z + Y[1] * R * 0.7], 48); await shot('damaged-aerial');
    await pose([yardC[0] + Y[0] * 3.2 + Y[1] * 2.2, ground + 3.4, yardC[1] + Y[1] * 3.2 - Y[0] * 2.2], [yardC[0], ground + 0.2, yardC[1]], 50); await shot('damaged-yard');
  }
  if (want('dark')) {
    await set(`cb.store.getState().setTimeOfDay(21.5)`);
    await pose([D.x + Y[0] * R * 2.1 + 3, ground + R * 0.5, D.z + Y[1] * R * 2.1], [D.x + Y[0] * R * 0.6, ground + R * 0.15, D.z + Y[1] * R * 0.6], 46); await shot('damaged-night-dark');
    await set(`cb.store.getState().setTimeOfDay(16.8)`);
  }
  if (want('panel')) {
    await set(`cb.store.getState().setHudHidden?.(false)`);
    await page.getByRole('button', { name: 'OK', exact: true }).first().click({ timeout: 3000 }).catch(() => {});
    await page.evaluate(() => window.__cb.game.getState().focusHud({ right: 'utilities' })); await page.waitForTimeout(500);
    const b = page.getByTestId('page-chip-dome'); if (await b.count()) await b.click();
    await page.mouse.move(700, 400); await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelector('[data-testid=plant-units]')?.scrollIntoView({ block: 'start' })); await page.waitForTimeout(400);
    await shot('panel-plant', 'none');
    await page.evaluate(() => document.querySelector('[data-testid=plant-yard]')?.scrollIntoView({ block: 'end' })); await page.waitForTimeout(300);
    await shot('panel-yard', 'none');
  }
  await page.close();
} finally { await browser.close(); vite.kill(); }
