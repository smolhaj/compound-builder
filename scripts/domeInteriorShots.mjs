// Ground-level interiors of a dome complex and of bunkers, day and night pairs (docs/ux/dome-interiors). Based on domePlantShots.mjs.
//   flock /tmp/cb.lock node scripts/domeInteriorShots.mjs <outDir> [scene=glass|geodesic|earthen|arcology] [cells] [port] [only=comma,names]
// ENV: QUAL=high|medium PR=0.9 W H  NIGHT=21.5 DAY=13.5.  Poses are in dome-local fractions of the shell radius R (x = sin phi, z = cos phi, phi from +z toward +x).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], tier = process.argv[3] || 'glass', cells = Number(process.argv[4] || (tier === 'arcology' ? 60 : tier === 'glass' ? 24 : tier === 'geodesic' ? 12 : 4)), port = Number(process.argv[5] || 5983), only = process.argv[6] ? process.argv[6].split(',') : null;
const W = Number(process.env.W || 1400), H = Number(process.env.H || 800), PR = process.env.PR || '0.9', QUAL = process.env.QUAL || 'high', DAY = Number(process.env.DAY || 13.5), NIGHT = Number(process.env.NIGHT || 21.5);
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
const want = n => !only || only.some(o => n.startsWith(o));
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(`http://localhost:${port}/?seed=7&clean&lowrender=${PR}&region=${process.env.REGION ?? 'mountain_west'}&acres=20&relief=${process.env.RELIEF ?? 2}&lotseed=${process.env.LOTSEED ?? 8}`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  const frames = async (n = 1) => { for (let i = 0; i < n; i++) await page.evaluate(() => window.__cb.qa.renderNow()); };
  const shotRaw = async name => { await frames(3); await page.evaluate(q => window.__cb.qa.renderFull(q), QUAL); await page.screenshot({ path: `${out}/${tier}-${name}.png` }); lap(name); };
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
    if (!dome) return { err: 'no dome spot', camp: [c.x, c.z] };
    const R = cells * 0.25, placed = [], ids = {};
    const inside = (k, fx, fz, search = 2.5) => { const p = put(k, dome.x + fx * R, dome.z + fz * R, 0, search); placed.push([k, !!p, p && +((p.x - dome.x) / R).toFixed(2), p && +((p.z - dome.z) / R).toFixed(2)]); if (p) (ids[k] ??= []).push(p); return p; };
    const big = tier === 'glass' || tier === 'arcology';
    const list = big ? [
      ['log_house', -0.12, 0.10], ['guest_house', -0.30, 0.18], ['barn', 0.34, -0.30], ['workshop', 0.18, 0.28], ['sheep_barn', 0.46, -0.05], ['chicken_coop', 0.28, -0.12],
      ['garden', -0.28, -0.20], ['garden', -0.10, -0.32], ['greenhouse', -0.46, 0.0], ['orchard', 0.05, -0.55], ['field', 0.38, 0.42], ['pond', -0.35, 0.50],
      ['well_drilled', -0.02, 0.26], ['cistern', 0.04, 0.38], ['solar_array', -0.55, 0.22], ['battery_shed', -0.22, 0.38], ['root_cellar', -0.40, -0.40], ['wood_oven', -0.18, 0.02], ['metal_garage', 0.34, 0.12],
    ] : tier === 'geodesic' ? [['timber_cabin', -0.2, 0.1], ['garden', 0.2, -0.3], ['chicken_coop', 0.3, 0.2], ['well_drilled', 0.0, 0.4]] : [];
    for (const [k, fx, fz] of list) inside(k, fx, fz);
    G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) { st.stage = 99; st.done = 0; st.finishedAt = 0; st.supplied = true; } g.utilities.lit = ['x']; return { game: g }; });
    { const live = await import('/src/sim/dome/live.ts'); G.setState(s => { const g = structuredClone(s.game); const d = live.domeOf(g); if (d) g.domes = { ...(g.domes ?? {}), [d.st.id]: { ...live.stateOf(g, d), filtering: 'closed' } }; return { game: g }; }); }
    cb.store.getState().setHudHidden?.(true);
    const a = (await import('/src/sim/dome/standing.ts')).domesOf(G.getState().game, true).find(x => x.id === dome.id);
    const Y = big ? (await import('/src/sim/dome/plantYard.ts')).yardGeometry(tier, R) : null;
    return { dome, R, camp: [c.x, c.z], placed, airlocks: a?.airlocks?.map(l => [+l.x.toFixed(2), +l.z.toFixed(2), +l.angle.toFixed(2)]), yard: Y && { phi: Y.phi, chamber: Y.portal.chamber, from: Y.portal.from, to: Y.portal.to, center: Y.center } };
  }, [tier, cells]);
  lap(JSON.stringify(info));
  if (info.err) throw new Error(info.err);
  await frames(2);
  const D = info.dome, R = info.R;
  const ground = await page.evaluate(([x, z]) => window.__cb.world.groundAt(x, z), [D.x, D.z]);
  // a point in dome-local fractions of R; the eye is `h` above the local ground (a person is 0.28 tall, the eye 0.26)
  const L = (fx, fz, h = 0) => [D.x + fx * R, ground + h, D.z + fz * R];
  const P = async (eye, look, fov = 62) => page.evaluate(([e, l, fov]) => { window.__cb.qa.pose = { x: e[0], y: e[1], z: e[2], lx: l[0], ly: l[1], lz: l[2], fov }; }, [eye, look, fov]);
  const figs = async pts => page.evaluate(async pts => { const cb = window.__cb, m = await import('/src/game/HomesteadWorld.ts'); cb.__figs ??= []; for (const f of cb.__figs) cb.ws.scene.remove(f); cb.__figs = pts.map(([x, z]) => { const f = m.scaleFigure(x, z, cb.world.groundAt(x, z)); cb.ws.scene.add(f); return f; }); }, pts);
  const pair = async (name, eye, look, fov = 62, people = []) => {
    if (!want(name)) return;
    await figs(people.map(([fx, fz]) => [D.x + fx * R, D.z + fz * R]));
    await set(`cb.store.getState().setTimeOfDay(${DAY}); cb.store.getState().setBuildingView('full'); cb.store.getState().setWeatherMode('clear');`);
    await P(eye, look, fov); await shotRaw(`${name}-day`);
    await set(`cb.store.getState().setTimeOfDay(${NIGHT})`); await shotRaw(`${name}-night`);
  };
  await set(`const s = cb.store.getState(); s.setBuildingView('full'); s.setSeasonMode?.('summer');`);
  const h = 0.3;
  // the standing views (dome-local R fractions)
  const [gx, gz] = [0, 0];
  await pair('01-lawn-homes', L(0.12, -0.12, h), L(-0.2, 0.15, 0.18), 70, [[-0.02, 0.0], [-0.12, 0.28]]);
  await pair('02-path-between', L(0.02, 0.5, h), L(-0.12, 0.08, 0.2), 60, [[-0.04, 0.3]]);
  await pair('03-house-door', L(-0.12, 0.32, h), L(-0.12, 0.10, 0.2), 62, [[-0.1, 0.24]]);
  await pair('05-airlock-person-out', L(0, 0.62, h), L(0, 1.15, 0.25), 64, [[0.06, 0.78]]);
  await pair('06-glass-ceiling', L(0, 0, 0.3), L(0.05, 0.1, 5), 80, []);
  if (info.yard) {
    const [yx, yz] = info.yard.chamber, ph = info.yard.phi;
    await pair('04-plant-yard-airlock', L(Math.sin(ph) * 0.35, Math.cos(ph) * 0.35, h), [D.x + yx, ground + 0.25, D.z + yz], 64, [[Math.sin(ph) * 0.7 + 0.04, Math.cos(ph) * 0.7]]);
  }
  await page.close();
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
