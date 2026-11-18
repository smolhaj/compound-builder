// Hero mockups: a giant dome over a whole property with the compound inside (aerial, outside, inside, dusk, weather).
//   flock /tmp/cb.lock node scripts/domeMockShots.mjs <outDir> [tier=arcology|glass] [cells] [port] [only=comma,names]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], tier = process.argv[3] || 'arcology', cells = Number(process.argv[4] || (tier === 'arcology' ? 60 : 24)), port = Number(process.argv[5] || 5981), only = process.argv[6] ? process.argv[6].split(',') : null;
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
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(`http://localhost:${port}/?seed=7&clean&lowrender=${PR}&region=${process.env.REGION ?? "mountain_west"}&acres=20&relief=${process.env.RELIEF ?? 2}&lotseed=${process.env.LOTSEED ?? 8}`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  const frames = async (n = 1) => { for (let i = 0; i < n; i++) await page.evaluate(() => window.__cb.qa.renderNow()); };
  const QUAL = process.env.QUAL || 'high';
  const shot = async (name, q = QUAL) => { await frames(2); if (q && q !== 'none') await page.evaluate(q => window.__cb.qa.renderFull(q), q); await page.screenshot({ path: `${out}/${tier}-${name}.png` }); lap(name); };
  const set = (js) => page.evaluate(js => new Function('cb', js)(window.__cb), js);
  const info = await page.evaluate(async ([tier, cells]) => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp; G.getState().setSpeed(0);
    G.setState(s => ({ game: { ...s.game, money: 900_000_000 } }));
    const kind = `dome_${tier}_${cells}`;
    const put = (kind, x, z, rot = 0, r = 8) => { const sp = cb.tool.findSpot(kind, x, z, rot, r); if (!sp) return null; G.getState().plan(kind, sp[0], sp[1], rot); return { id: G.getState().game.structures.at(-1).id, x: sp[0], z: sp[1] }; };
    // the flattest ground for a ring this wide: a 600 ft dome on a hillside shows a cliff of stem wall (the embankment hides some of it, not all)
    const R0 = cells * 0.25, rng = (x, z) => { let lo = 1e9, hi = -1e9; for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12, h = cb.world.groundAt(x + R0 * Math.sin(a), z + R0 * Math.cos(a)); lo = Math.min(lo, h); hi = Math.max(hi, h); } return hi - lo; };
    let best = null;
    for (let dx = -16; dx <= 16; dx += 2) for (let dz = -16; dz <= 16; dz += 2) { const x = c.x + dx, z = c.z + dz, r = rng(x, z); if (!best || r < best.r) { const sp = cb.tool.findSpot(kind, x, z, 0, 1.5); if (sp) best = { r, x: sp[0], z: sp[1] }; } }
    const dome = best ? put(kind, best.x, best.z, 0, 1.5) : put(kind, c.x, c.z, 0, 40);
    if (!dome) return { err: 'no dome spot', camp: [c.x, c.z] };
    const R = cells * 0.25;
    const placed = [];
    const inside = (k, fx, fz, search = 2.5) => { const p = put(k, dome.x + fx * R, dome.z + fz * R, 0, search); placed.push([k, !!p]); return p; };
    for (const [k, fx, fz] of [
      ['log_house', -0.12, 0.10], ['guest_house', -0.30, 0.18], ['barn', 0.34, -0.30], ['workshop', 0.18, 0.28], ['sheep_barn', 0.46, -0.05], ['chicken_coop', 0.28, -0.12],
      ['garden', -0.28, -0.20], ['garden', -0.10, -0.32], ['greenhouse', -0.46, 0.0], ['orchard', 0.05, -0.55], ['field', 0.38, 0.42], ['pond', -0.35, 0.50],
      ['well_drilled', -0.02, 0.26], ['cistern', 0.04, 0.38], ['solar_array', -0.55, 0.22], ['solar_array', -0.50, 0.38], ['battery_shed', -0.22, 0.38],
      ['root_cellar', -0.40, -0.40], ['wood_oven', -0.18, 0.02], ['apiary', 0.60, 0.20], ['orchard', 0.10, 0.62], ['metal_garage', 0.34, 0.12],
    ]) inside(k, fx, fz);
    const bk = (await import('/src/game/buildkit/kit.ts')).BUNKER_ORDER[0]; inside(bk, -0.06, 0.40);
    G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) { st.stage = 99; st.done = 0; st.finishedAt = 0; st.supplied = true; } g.utilities.lit = ['x']; return { game: g }; });
    cb.store.getState().setHudHidden?.(true);
    const m = await import('/src/game/HomesteadWorld.ts');
    const gnd = (x, z) => cb.world.groundAt(x, z);
    for (const [fx, fz] of [[-0.05, 0.19], [0.0, 0.30], [0.2, -0.05], [-0.2, 0.0], [0.3, 0.0], [-0.1, -0.1], [0.1, 0.4]]) { const x = dome.x + fx * R, z = dome.z + fz * R; cb.ws.scene.add(m.scaleFigure(x, z, gnd(x, z))); }
    const a = (await import('/src/sim/dome/standing.ts')).domesOf(G.getState().game, true).find(x => x.id === dome.id);
    return { dome, R, bestRange: best?.r, camp: [c.x, c.z], placed, airlocks: a?.airlocks?.map(l => [l.x, l.z, l.angle]), n: G.getState().game.structures.length, calls: cb.ws.renderer?.info?.render?.calls };
  }, [tier, cells]);
  lap(JSON.stringify(info));
  if (info.err) throw new Error(info.err);
  await frames(2);
  const D = info.dome, R = info.R;
  const ground = await page.evaluate(([x, z]) => window.__cb.world.groundAt(x, z), [D.x, D.z]);
  const pose = (e, l, fov = 60) => page.evaluate(([e, l, fov]) => { window.__cb.qa.pose = { x: e[0], y: e[1], z: e[2], lx: l[0], ly: l[1], lz: l[2], fov }; }, [e, l, fov]);
  await set(`const s = cb.store.getState(); s.setTimeOfDay(17.4); s.setBuildingView('full'); s.setSeasonMode?.('summer'); s.setWeatherMode('clear');`);
  if (want('hero')) { await pose([D.x + R * 2.4, ground + R * 1.0, D.z + R * 2.7], [D.x, ground + R * 0.16, D.z], 40); await shot('hero-aerial'); }
  if (want('top')) { await pose([D.x, ground + R * 3.2, D.z + 0.01], [D.x, ground, D.z], 45); await shot('topdown'); }
  if (want('outside')) { const a = info.airlocks?.[0]; const ang = a ? a[2] : 0; const ux = Math.sin(ang), uz = Math.cos(ang);
    await set(`window.__cb.__fig = cb.ws.scene.add;`);
    await page.evaluate(async ([x, z]) => { const cb = window.__cb, m = await import('/src/game/HomesteadWorld.ts'); cb.ws.scene.add(m.scaleFigure(x, z, cb.world.groundAt(x, z))); }, [D.x + ux * (R + 4.2) + uz * 0.5, D.z + uz * (R + 4.2) - ux * 0.5]);
    await pose([D.x + ux * (R + 11) + uz * 3, ground + 0.45, D.z + uz * (R + 11) - ux * 3], [D.x + ux * (R + 1.5), ground + 3.2, D.z + uz * (R + 1.5)], 48); await shot('outside-eye'); }
  if (want('inside')) { await pose([D.x - R * 0.55, ground + 0.45, D.z - R * 0.45], [D.x + R * 0.3, ground + R * 0.45, D.z + R * 0.25], 70); await shot('inside-looking-across');
    await pose([D.x - R * 0.25, ground + 0.4, D.z + R * 0.05], [D.x + R * 0.1, ground + R * 0.85, D.z - R * 0.1], 75); await shot('inside-looking-up'); }
  if (want('dusk')) { await set(`cb.store.getState().setTimeOfDay(19.4)`); await pose([D.x + R * 2.1, ground + R * 0.45, D.z + R * 2.4], [D.x, ground + R * 0.2, D.z], 40); await shot('dusk-hero');
    await set(`cb.store.getState().setTimeOfDay(22)`); await pose([D.x + R * 2.1, ground + R * 0.45, D.z + R * 2.4], [D.x, ground + R * 0.2, D.z], 40); await shot('night-hero'); }
  if (want('base')) { const a = info.airlocks?.[0]; await pose([D.x + R * 0.55, ground + 0.5, D.z + R * 1.35], [D.x + R * 0.1, ground + 0.15, D.z + R * 1.0], 55); await shot('base-front'); }
  if (want('weather')) { await set(`window.__cb.qa.weather = true;`); await set(`const s = cb.store.getState(); s.setTimeOfDay(15); s.setWeatherMode('storm')`); await pose([D.x + R * 2.1, ground + R * 0.45, D.z + R * 2.4], [D.x, ground + R * 0.2, D.z], 40); await shot('storm-hero');
    await set(`cb.store.getState().setWeatherMode('rain')`); await pose([D.x - R * 0.4, ground + 0.45, D.z - R * 0.3], [D.x + R * 0.3, ground + R * 0.6, D.z + R * 0.2], 72); await shot('rain-inside'); }
  await page.close();
} finally { await browser.close(); vite.kill(); }
