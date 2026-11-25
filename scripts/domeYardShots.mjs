// Arcology plant yard and its service airlock shots (docs/ux/dome-yard): HIGH quality.
//   ROT=1 flock /tmp/cb.lock node scripts/domeYardShots.mjs <outDir> [port] [names]
// names: y1..y12
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5994);
// SCENES='glass:dome_glass:1:aerial,closeup,eye,inside,night;arc:dome_arcology:1:aerial,eye,inside;...' (name:kind:rot:shots), or KIND/ROT for one
const TAG = process.env.TAG || '';
const SCENES = (process.env.SCENES || `${process.env.KIND || 'dome_arcology'}:${process.env.KIND || 'dome_arcology'}:${process.env.ROT ?? 1}:${process.argv[4] || 'ops,opsclose,power,water,air,doors,sec,pipes,fromport,fromyard,aerial,cutaway,long,nightops,nightlong'}`).split(';').map(x => { const [name, kind, rot, shots, doors] = x.split(':'); return { name, kind, rot: Number(rot), shots: shots.split(','), doors }; });
const W = Number(process.env.W || 1600), H = Number(process.env.H || 900), PR = process.env.PR || '0.9';
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
try {
  for (const SC of SCENES) {
  const KIND = SC.kind, ROT = SC.rot, want = n => SC.shots.includes(n), PFX = `${TAG}${SC.name}-`;
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7&clean&lowrender=${PR}&region=${process.env.REGION ?? 'mountain_west'}&acres=40&relief=${process.env.RELIEF ?? 0}&lotseed=${process.env.LOTSEED ?? 8}`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  await page.evaluate(() => window.__cb.store.getState().setQuality?.('high', true));
  const frames = async (n = 1) => { for (let i = 0; i < n; i++) await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(250); };
  const shot = async name => { await frames(2); await page.evaluate(() => window.__cb.qa.renderFull('high')); await page.screenshot({ path: `${out}/${PFX}${name}.png` }); lap(name); };
  const set = js => page.evaluate(js => new Function('cb', js)(window.__cb), js);
  const info = await page.evaluate(async ([KIND, ROT, DOORS]) => {
    const cb = window.__cb, G = cb.game, w = cb.world; G.getState().setSpeed(0);
    G.setState(s => ({ game: { ...s.game, money: 900_000_000 } }));
    const y = w.access.yard, drive = w.access.drive, end = drive[drive.length - 1];
    // the dome stands over the end of the drive, as in the owner's scene: its centre a little way back from the yard toward the house
    (await import('/src/game/buildkit/domeBuildings.ts')).setDoorLook(DOORS);
    const sp = cb.tool.findSpot(KIND, y.x - 2.5, y.z - 1.5, ROT, 14);
    if (!sp) return null;
    G.getState().plan(KIND, sp[0], sp[1], ROT);
    const st = G.getState().game.structures.at(-1);
    G.setState(s => { const g = structuredClone(s.game); for (const q of g.structures) { q.stage = 99; q.done = 0; q.finishedAt = 0; q.supplied = true; } return { game: g }; });   // (no lit lamps by day: their warm point lights tinted every frame; the night shots switch them on)
    // clean air: the inner haze of a dust or CO2 reading tints everything near the shell (the gates) tan, which hid the new look
    { const live = await import('/src/sim/dome/live.ts'); G.setState(s => { const g = structuredClone(s.game); const ref = live.domeOf(g, st.id); if (ref) { const o = live.ownState(g, ref); o.dust = 0; o.co2ppm = 500; } return { game: g }; }); }
    cb.store.getState().setHudHidden?.(true);
    return { id: st.id, x: st.x, z: st.z, rot: ROT, port: st.portAngle ?? null, yard: [y.x, y.z], end };
  }, [KIND, ROT, SC.doors || 'open']);
  if (!info) { console.error('no spot for ' + KIND); await page.close(); continue; }
  lap(JSON.stringify(info));
  await frames(4);
  const dm = await page.evaluate(async id => { const s = await import('/src/sim/dome/standing.ts'); const d = s.domesOf(window.__cb.game.getState().game).find(x => x.id === id); const a = d.airlocks.find(l => l.role === 'vehicle'); return { r: d.r, x: d.x, z: d.z, a: a ? { angle: a.angle, x: a.x, z: a.z, inX: a.inX, inZ: a.inZ } : null, persons: d.airlocks.filter(l => !l.role).map(l => ({ angle: l.angle, x: l.x, z: l.z })), tier: d.tier }; }, info.id);
  dm.half = await page.evaluate(async c => c * (await import('/src/game/buildkit/kit.ts')).CELL / 2 - 0.03, (KIND.match(/_(\d+)$/) || [0, ({ dome_glass: 15, dome_arcology: 30, dome_geodesic: 7 })[KIND] ])[1]);
  lap(JSON.stringify(dm));
  const gd = (x, z) => page.evaluate(([x, z]) => window.__cb.world.groundAt(x, z), [x, z]);
  const poseRaw = (e, l, fov = 60) => page.evaluate(([e, l, fov]) => { window.__cb.qa.pose = { x: e[0], y: e[1], z: e[2], lx: l[0], ly: l[1], lz: l[2], fov }; }, [e, l, fov]);
  const pr = async (e, l, fov = 55) => poseRaw([e[0], (await gd(e[0], e[2])) + e[1], e[2]], [l[0], (await gd(l[0], l[2])) + l[1], l[2]], fov);
  const person = async (x, z) => page.evaluate(async ([x, z]) => { const m = await import('/src/game/HomesteadWorld.ts'); window.__cb.ws.scene.add(m.scaleFigure(x, z, window.__cb.world.groundAt(x, z))); }, [x, z]);
  await set(`const s = cb.store.getState(); s.setTimeOfDay(${process.env.NIGHT ? 21.5 : (process.env.TOD || 15.5)}); s.setBuildingView('full'); s.setSeasonMode?.('summer'); s.setWeatherMode('clear');`);
  const a = dm.a, u = a ? [Math.sin(a.angle), Math.cos(a.angle)] : [1, 0], n = [u[1], -u[0]], R = dm.r;
  const WP = q => [dm.x + q[0], dm.z + q[1]];
  const poseRaw2 = (e, l, fov = 60) => page.evaluate(([e, l, fov]) => { window.__cb.qa.pose = { x: e[0], y: e[1], z: e[2], lx: l[0], ly: l[1], lz: l[2], fov }; }, [e, l, fov]);
  const yg = await page.evaluate(async ([t, r, rot]) => { const m = await import('/src/sim/dome/plantYard.ts'); const g = m.yardGeometry(t, r, rot); const P = (u, v) => m.yardPoint(g, u, v); return { phi: g.phi, W: g.W, D: g.D, er: g.er, et: g.et, from: g.portal.from, to: g.portal.to, u: g.portal.u, center: g.center, P0: P(0, 0), pIn: P(g.portal.u, 0.9), corners: g.corners, camera: g.camera }; }, [dm.tier, dm.r, ROT]);
  const y0 = await page.evaluate(id => { const w = window.__cb.world; return [...w._built.values()].find(x => x.placed.id === id).group.position.y; }, info.id);
  lap(JSON.stringify(yg).slice(0, 300));
  const gdy = (x, z) => page.evaluate(([x, z]) => window.__cb.world.groundAt(x, z), [x, z]);
  const yTop = await page.evaluate(async ([g, dr]) => { const m = await import('/src/sim/dome/plantYard.ts'); let mx = -1e9; for (let i = 0; i <= 8; i++) for (let j = 0; j <= 4; j++) { const p = m.yardPoint(g, -g.W / 2 + g.W * i / 8, g.D * j / 4); mx = Math.max(mx, window.__cb.world.groundAt(dr.x + p[0], dr.z + p[1])); } return mx; }, [{ phi: yg.phi, r: dm.r, er: yg.er, et: yg.et, W: yg.W, D: yg.D }, { x: dm.x, z: dm.z }]);
  const Y = async (u, v, h) => { const p = await page.evaluate(async ([g, u, v]) => (await import('/src/sim/dome/plantYard.ts')).yardPoint(g, u, v), [{ phi: yg.phi, r: dm.r, er: yg.er, et: yg.et }, u, v]); const q = WP(p); return [q[0], (await gdy(q[0], q[1])) + h, q[1]]; };   // a point of the yard (u along the shell, v out from its inner wall) at height h over the yard's ground
  const setRoof = s => page.evaluate(s => window.__cb.world.setYardRoofLook(s), s);
  const lightsOn = () => page.evaluate(() => window.__cb.game.setState(st => { const g = structuredClone(st.game); g.utilities.lit = ['x']; return { game: g }; }));
  const inw = (q, k) => { const d = Math.hypot(q[0], q[1]); return [q[0] * (1 - k / d), q[1] * (1 - k / d)]; };
  const dome = (q, h) => { const w = WP(q); return [w[0], y0 + h, w[1]]; };
  const D = yg.D, Wd = yg.W, pu = yg.u;
  const back = k => dome([yg.from[0] - yg.er[0] * k, yg.from[1] - yg.er[1] * k], 0);
  const backH = (k, h) => { const q = back(k); return [q[0], y0 + h, q[2]]; };
  const airlock = s => page.evaluate(s => window.__cb.world.setYardAirlockLook(s), s);
  if (want('y13')) { await airlock('both'); await setRoof('closed'); await poseRaw2(backH(1.3, 0.22), await Y(pu, D * 0.6, 0.2), 54); await shot('y13-looking-through-open-airlock-from-dome-into-yard'); }
  if (want('y14')) { await airlock('both'); await poseRaw2(await Y(pu, D * 0.55, 0.22), backH(4.5, 0.25), 56); await shot('y14-looking-through-open-airlock-from-yard-into-dome'); }
  if (want('y15')) { await airlock('both'); const cz = -0.45; await poseRaw2(await Y(pu, -0.55, 0.2), await Y(pu, 1.5, 0.2), 70); await shot('y15-inside-airlock-looking-toward-yard'); }
  if (want('y16')) { await airlock('both'); await poseRaw2(await Y(pu, -0.35, 0.2), backH(3, 0.25), 70); await shot('y16-inside-airlock-looking-toward-dome'); }
  if (want('y17')) { await airlock('dome'); await poseRaw2(dome(inw(yg.from, 0.9), 0.24), dome(yg.from, 0.2), 58); await shot('y17-dome-side-door-open-inner-shut'); }
  if (want('y18')) { await airlock('yard'); await poseRaw2(await Y(pu, 1.0, 0.24), await Y(pu, 0.0, 0.2), 58); await shot('y18-yard-side-door-open-dome-shut'); }
  if (want('y19')) { await airlock('both'); await poseRaw2(await Y(pu, -1.0, 0.2), backH(3, 0.25), 70); await shot('y19-chamber-near-dome-door-looking-out'); await poseRaw2(await Y(pu, -0.5, 0.35), backH(3, 0.05), 80); await shot('y19b-chamber-looking-out-lower'); }
  if (want('yray')) { await airlock('both'); await poseRaw2(await Y(pu, -0.35, 0.2), backH(3, 0.25), 70); await frames(3);
    const hits = await page.evaluate(async () => { const THREE = await import('/node_modules/three/build/three.module.js'); const cb = window.__cb, cam = cb.ws.camera, rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(0, -0.25), cam); return rc.intersectObjects(cb.ws.scene.children, true).slice(0, 5).map(h => ({ n: h.object.name, d: +h.distance.toFixed(2), p: h.object.parent?.name, mat: h.object.material?.name })); });
    console.error('RAY ' + JSON.stringify(hits)); }
  if (want('y1')) { await poseRaw2(dome(inw(yg.from, 0.8), 0.24), dome(yg.from, 0.2), 58); await shot('y01-dome-side-door-closed'); }
  if (want('y2')) { await poseRaw2(dome(inw(yg.from, 0.35), 0.2), dome(yg.from, 0.2), 55); await shot('y02-dome-side-door-closeup'); }
  if (want('y3')) { await poseRaw2(dome(inw(yg.from, 1.6), 0.3), dome(yg.from, 0.2), 62); await shot('y03-dome-side-approach'); }
  if (want('y4')) { await poseRaw2(await Y(pu, 1.3, 0.34), await Y(pu, 0.0, 0.22), 60); await shot('y04-yard-side-inner-door'); }
  if (want('y5')) { await poseRaw2(await Y(pu - 0.5, 0.4, 0.22), await Y(pu, 0.02, 0.2), 62); await shot('y05-yard-side-door-oblique'); }
  if (want('y6')) { await poseRaw2(await Y(pu - 0.3, 0.45, 0.36), await Y(-Wd * 0.3, D * 0.6, 0.22), 66); await shot('y06-yard-machinery-wide'); }
  if (want('y7')) { await poseRaw2(await Y(-Wd * 0.4, D * 0.85, 0.25), await Y(Wd * 0.3, D * 0.3, 0.15), 64); await shot('y07-yard-machinery-from-far-corner'); }
  if (want('y8')) { await poseRaw2(await Y(Wd * 0.2, D * 0.45, 0.34), await Y(-Wd * 0.45, D * 0.15, 0.25), 68); await shot('y08-yard-walls-and-ground'); }
  if (want('y9')) { await setRoof('closed'); await poseRaw2(await Y(0, D * 0.5, 0.25), await Y(0, D * 0.5, 2.0), 70); await shot('y09a-looking-up-roof-closed'); await setRoof('open'); await poseRaw2(await Y(0, D * 0.5, 0.25), await Y(0, D * 0.5, 2.0), 70); await shot('y09b-looking-up-roof-open'); await setRoof('closed'); }
  if (want('y10')) { await setRoof('open'); await poseRaw2(await Y(-Wd * 0.2, D + 3.2, 3.6), await Y(0, D * 0.5, 0.2), 60); await shot('y10-high-oblique-from-outside-roof-open'); await setRoof('closed'); }
  if (want('y11')) { await lightsOn(); await set(`cb.store.getState().setTimeOfDay(21.5)`); await setRoof('open'); await poseRaw2(await Y(pu - 0.3, 0.45, 0.36), await Y(-Wd * 0.3, D * 0.6, 0.22), 66); await shot('y11-night-inside-yard-roof-open'); }
  if (want('y12')) { await set(`cb.store.getState().setTimeOfDay(15.5)`); await page.evaluate(() => window.__cb.world.setUnderground(true)); await poseRaw2(await Y(pu, -0.8, 1.2), await Y(pu, 0.4, -0.2), 60); await shot('y12-buried-passage-underground-view'); await page.evaluate(() => window.__cb.world.setUnderground(false)); }
  await page.close();
  }
} finally { await browser.close(); vite.kill(); }
