// Dome dig shots (docs/ux/dome-dig): a dome staked on flat ground, then set to a given share of its build, from above and at eye level.
//   flock /tmp/cb.lock node scripts/domeDigShots.mjs <outDir> [tier=arcology] [cells] [port] [progress list e.g. 0.12,0.25,0.45,0.65,0.8,1] [views: aerial,low,eye,under,moat,section]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], tier = process.argv[3] || 'arcology', cells = Number(process.argv[4] || (tier === 'arcology' ? 36 : tier === 'glass' ? 15 : tier === 'geodesic' ? 7 : 2)), port = Number(process.argv[5] || 5990);
const progress = (process.argv[6] || '0.25,0.45,0.65,0.85,1').split(',').map(Number), views = (process.argv[7] || 'aerial,low').split(',');
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
  await page.goto(`http://localhost:${port}/?seed=7&clean&lowrender=${PR}${process.env.LOOK ? '&looktier=' + process.env.LOOK : ''}&region=${process.env.REGION ?? 'mountain_west'}&acres=20&relief=${process.env.RELIEF ?? 2}&lotseed=${process.env.LOTSEED ?? 8}`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  const frames = async (n = 1) => { for (let i = 0; i < n; i++) await page.evaluate(() => window.__cb.qa.renderNow()); };
  // (LOOK=high with QUAL=none holds the high look for every frame: renderFull's quality switch rebuilds the buildings at stage 0 for its one draw)
  const shot = async name => { await frames(3); if (QUAL !== 'none') await page.evaluate(q => window.__cb.qa.renderFull(q), QUAL); await page.screenshot({ path: `${out}/${tier}-${name}.png` }); lap(name); };
  const pose = (e, l, fov = 55) => page.evaluate(([e, l, fov]) => { window.__cb.qa.pose = { x: e[0], y: e[1], z: e[2], lx: l[0], ly: l[1], lz: l[2], fov }; }, [e, l, fov]);
  const info = await page.evaluate(async ([tier, cells]) => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp; G.getState().setSpeed(0);
    G.setState(s => ({ game: { ...s.game, money: 900_000_000 } }));
    const kind = `dome_${tier}_${cells}`;
    const R0 = cells * 0.25, rng = (x, z) => { let lo = 1e9, hi = -1e9; for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12, h = cb.world.groundAt(x + R0 * Math.sin(a), z + R0 * Math.cos(a)); lo = Math.min(lo, h); hi = Math.max(hi, h); } return hi - lo; };
    let best = null;
    for (let dx = -16; dx <= 16; dx += 2) for (let dz = -16; dz <= 16; dz += 2) { const x = c.x + dx, z = c.z + dz, r = rng(x, z); if (!best || r < best.r) { const sp = cb.tool.findSpot(kind, x, z, 0, 1.5); if (sp) best = { r, x: sp[0], z: sp[1] }; } }
    const sp = best ?? { x: c.x, z: c.z };
    G.getState().plan(kind, sp.x, sp.z, 0);
    const st = G.getState().game.structures.at(-1);
    cb.store.getState().setHudHidden?.(true);
    return { id: st.id, x: st.x, z: st.z, kind, range: best?.r };
  }, [tier, cells]);
  lap(JSON.stringify(info));
  const R = cells * 0.25;
  const setP = async P => page.evaluate(async ([id, P]) => {
    const cb = window.__cb, con = await import('/src/sim/construction.ts');
    cb.game.setState(s => { const g = structuredClone(s.game); const st = g.structures.find(x => x.id === id); const bp = con.blueprintOf(st).stages; const total = bp.reduce((a, x) => a + x.hours, 0);
      if (P >= 1) { st.stage = bp.length; st.done = 0; st.finishedAt = 0; } else { let left = P * total, i = 0; while (i < bp.length - 1 && left >= bp[i].hours) { left -= bp[i].hours; i++; } st.stage = i; st.done = left; st.finishedAt = undefined; }
      st.supplied = true; return { game: g }; });
    const g = cb.game.getState().game; cb.world.syncProgress(g.structures);
    return [cb.game.getState().game.structures.find(x => x.id === id).stage];
  }, [info.id, P]);
  await page.evaluate(() => { const s = window.__cb.store.getState(); s.setTimeOfDay(15.5); s.setBuildingView('full'); s.setWeatherMode('clear'); });
  const ground = await page.evaluate(([x, z]) => window.__cb.world.groundAt(x, z), [info.x, info.z]);
  const D = info, rT = R * 1.8;
  // a person for scale at the rim
  await page.evaluate(async ([x, z]) => { const cb = window.__cb, m = await import('/src/game/HomesteadWorld.ts'); cb.ws.scene.add(m.scaleFigure(x, z, cb.world.groundAt(x, z))); }, [D.x + R * 1.55, D.z + R * 0.2]);
  for (const P of progress) {
    const stg = await setP(P); await frames(2);
    if (process.env.DIAG) console.error('DIAG', P, JSON.stringify(await page.evaluate(id => { const w = window.__cb.world, b = w._built.get(id), bg = w._buried.get(id); return { gv: b.group.visible, pos: b.group.position.toArray(), kids: b.group.children.map(c => [c.name, c.visible, c.geometry ? c.geometry.drawRange.count : -1]).slice(0, 14), bgv: bg.visible, bgk: bg.children.map(c => [c.name, c.visible]), key: b.key, fin: b.finished, far: b.far, st: window.__cb.game.getState().game.structures.find(x => x.id === id) }; }, info.id)));
    if (process.env.DIAG) continue;
    const tag = `p${String(Math.round(P * 100)).padStart(3, '0')}`;
    if (views.includes('aerial')) { await pose([D.x + R * 1.5, ground + R * 2.2, D.z + R * 2.3], [D.x, ground - 0.5, D.z], 50); await shot(`${tag}-aerial`); }
    if (views.includes('top')) { await pose([D.x, ground + R * 3.4, D.z + 0.01], [D.x, ground - 0.5, D.z], 50); await shot(`${tag}-top`); }
    if (views.includes('low')) { await pose([D.x + R * 1.9, ground + 0.9, D.z + R * 1.1], [D.x, ground - 0.2, D.z], 60); await shot(`${tag}-low`); }
    if (views.includes('eye')) { await pose([D.x + R * 1.62, ground + 0.5, D.z + R * 0.45], [D.x + R * 0.6, ground - 0.2, D.z - R * 0.1], 62); await shot(`${tag}-eye`); }
    if (views.includes('under') && P >= 1) { await page.evaluate(() => window.__cb.store.getState().setUnderground(true)); await frames(3); await pose([D.x + R * 1.1, ground + R * 1.0, D.z + R * 1.4], [D.x, ground - R * 0.2, D.z], 55); await shot(`${tag}-under`); await page.evaluate(() => window.__cb.store.getState().setUnderground(false)); }
    if (views.includes('moat') && P >= 1) { await page.evaluate(() => window.__cb.store.getState().setBuildingView('cutaway')); await frames(3); await pose([D.x + R * 1.4, ground + R * 1.2, D.z + R * 1.9], [D.x, ground - R * 0.1, D.z], 55); await shot(`${tag}-moat`); await page.evaluate(() => window.__cb.store.getState().setBuildingView('full')); }
    if (views.includes('section') && P >= 1) { await pose([D.x + 0.3, ground + R * 0.55, D.z + R * 2.3], [D.x, ground - R * 0.1, D.z], 52); await frames(2); await page.evaluate(id => window.__cb.store.getState().setDomeSection(id), D.id); await frames(3); await shot(`${tag}-section`); await page.evaluate(() => window.__cb.store.getState().setDomeSection(null)); }
  }
  await page.close();
} finally { await browser.close(); vite.kill(); }
