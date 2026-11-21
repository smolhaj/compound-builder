// Dome vehicle sally port shots (docs/ux/dome-road): the road ends at the port, apron, gates, lane inside. HIGH quality, one dome per page load.
//   KIND=dome_glass ROT=1 flock /tmp/cb.lock node scripts/domePortShots.mjs <outDir> [port] [names]
// names: aerial, eye, inside, night, closeup (default: all)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5994);
// SCENES='glass:dome_glass:1:aerial,closeup,eye,inside,night;arc:dome_arcology:1:aerial,eye,inside;...' (name:kind:rot:shots), or KIND/ROT for one
const TAG = process.env.TAG || '';
const SCENES = (process.env.SCENES || `${process.env.KIND || 'dome_glass'}:${process.env.KIND || 'dome_glass'}:${process.env.ROT ?? 1}:${process.argv[4] || 'aerial,closeup,eye,inside,night'}`).split(';').map(x => { const [name, kind, rot, shots, doors] = x.split(':'); return { name, kind, rot: Number(rot), shots: shots.split(','), doors }; });
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
  await set(`const s = cb.store.getState(); s.setTimeOfDay(${process.env.NIGHT ? 21.5 : 15.5}); s.setBuildingView('full'); s.setSeasonMode?.('summer'); s.setWeatherMode('clear');`);
  const a = dm.a, u = a ? [Math.sin(a.angle), Math.cos(a.angle)] : [1, 0], n = [u[1], -u[0]], R = dm.r;
  const E = (rho, lam, h) => [dm.x + u[0] * rho + n[0] * lam, h, dm.z + u[1] * rho + n[1] * lam];   // a point on the port's frame: rho out along its axis, lam across, h above the ground
  const Rd = await page.evaluate(async ([t, r]) => (await import('/src/sim/dome/vehiclePort.ts')).entryR(t, r), [dm.tier, R]);      // (the module's door plane)
  const gate = [dm.x + u[0] * Rd, 0.3, dm.z + u[1] * Rd];
  const len = await page.evaluate(async ([t, r]) => (await import('/src/sim/dome/vehiclePort.ts')).portVestibule(t, r)?.len ?? 0.3, [dm.tier, R]), S = Math.max(1, R / 3.7);
  if (want('aerial')) {
    await pr(E(R + 12, -8, 9), E(R - 1, 0, 0), 55); await shot('aerial-from-port-side');
    await pr([dm.x - u[0] * R * 0.2 + n[0] * 3, R * 3.4, dm.z - u[1] * R * 0.2 + n[1] * 3], E(R + 3, 0, 0), 60); await shot('aerial-high');
  }
  const lightsOn = () => page.evaluate(() => window.__cb.game.setState(st => { const g = structuredClone(st.game); g.utilities.lit = ['x']; return { game: g }; }));
  if (want('yardintake') || want('yardduct') || want('yardwide')) {
    const Y = await page.evaluate(async ([t, r, rot]) => { const m = await import('/src/sim/dome/plantYard.ts'); const g = m.yardGeometry(t, r, rot); const P = (u, v) => m.yardPoint(g, u, v); return { W: g.W, D: g.D, pts: { stack: P(0.24 * g.W, 0.72 * g.D), eye: P(0.24 * g.W + 0.5, 0.72 * g.D + 1.0), eye2: P(0.24 * g.W + 0.25, 0.72 * g.D + 0.05), wall: P(0.24 * g.W, 0.07), mid: P(0.24 * g.W - 0.9, 0.55 * g.D + 0.7) } }; }, [dm.tier, R, ROT]);
    const w = q => [dm.x + q[0], dm.z + q[1]];
    if (want('yardintake')) { const e = w(Y.pts.eye), l = w(Y.pts.stack); await pr([e[0], 0.28, e[1]], [l[0], 0.2, l[1]], 58); await shot('yard-intake-eye'); }
    if (want('yardduct')) { const e = w(Y.pts.eye2), l = w(Y.pts.wall); await pr([e[0], 0.3, e[1]], [l[0], 0.2, l[1]], 62); await shot('yard-intake-duct'); }
    if (want('yardwide')) { const e = w(Y.pts.mid), l = w(Y.pts.stack); await pr([e[0], 0.45, e[1]], [l[0], 0.15, l[1]], 70); await shot('yard-wide'); }
  }
  if (want('shellclean')) { for (const [k, nm] of [[Math.PI, 'a'], [2.2, 'b']]) { const ia = a.angle + k, iu = [Math.sin(ia), Math.cos(ia)], inn = [iu[1], -iu[0]]; await pr([dm.x + iu[0] * (R + 2.2) + inn[0] * 1.1, 0.5, dm.z + iu[1] * (R + 2.2) + inn[1] * 1.1], [dm.x + iu[0] * R, 0.3, dm.z + iu[1] * R], 55); await shot('shell-base-clean-' + nm); } }
  if (want('closeup')) { await pr(E(R + 6.5 * S, -3.5 * S, 2.2 * S), gate, 52); await shot('port-closeup'); }
  if (want('second')) { await pr(E(-(R + 9 * S), 3 * S, 3), E(-R, 0.5 * S, 0), 58); await shot('second-entrance-opposite'); }
  if (want('eye')) {
    // (the delivery truck stops short on this lot's county road whatever a dome does, so the shot stands a truck on the apron by hand)
    await page.evaluate(async ([x, z, heading]) => { const m = await import('/src/game/props/truckGeometry.ts'); const t = m.buildTruck(); const THREE = await import('/node_modules/three/build/three.module.js'); const rc = new THREE.Raycaster(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0)); const hits = (window.__cb.ws.scene.getObjectByName('vehicle_ports') ? rc.intersectObject(window.__cb.ws.scene.getObjectByName('vehicle_ports'), true) : []); t.position.set(x, hits.length ? hits[0].point.y : window.__cb.world.groundAt(x, z), z); t.rotation.y = heading; window.__cb.ws.scene.add(t); window.__truckProp = t; }, [E(R + 1.1 * S, 0.25 * S, 0)[0], E(R + 1.1 * S, 0.25 * S, 0)[2], (a ? a.angle : 0) + Math.PI]);
    await person(...[E(R + 2.6 * S, 0.9 * S, 0)].map(p => [p[0], p[2]])[0]);
    await frames(2);
    await pr(E(R + 5.2 * S, -1.9 * S, 0.5), [gate[0], 0.3 * S, gate[2]], 58); await shot('eye-at-port-truck-person');
    await page.evaluate(() => { window.__truckProp?.removeFromParent(); });
  }
  if (want('inside')) {
    await person(...[E(R - len - 1.4, 0.9 * S, 0)].map(p => [p[0], p[2]])[0]);
    await pr(E(Rd - len - 1.0 * S, 0.1, 0.5), E(R + 1.5, 0, 0.4), 62); await shot('inside-looking-out');
  }
  const pa = dm.persons[0], pu = pa ? [Math.sin(pa.angle), Math.cos(pa.angle)] : u, pn = [pu[1], -pu[0]];
  const EP = (rho, lam, h) => [dm.x + pu[0] * rho + pn[0] * lam, h, dm.z + pu[1] * rho + pn[1] * lam];   // a point on the person airlock's frame
  if (want('seam')) { const sa = (dm.persons[1] ? dm.persons[1].angle : a.angle + 1.57) + 0.9, su = [Math.sin(sa), Math.cos(sa)]; const sx = dm.x + su[0] * (R + 1.2), sz = dm.z + su[1] * (R + 1.2); await pr([sx, 0.5, sz], [dm.x + su[0] * R, 0.45, dm.z + su[1] * R], 60); await shot('seam-base-ring-low'); await pr([dm.x + su[0] * (R + 6), 3.5, dm.z + su[1] * (R + 6)], [dm.x + su[0] * R, 0.8, dm.z + su[1] * R], 55); await shot('seam-aerial'); }
  if (want('cycling')) { await set(`cb.world.setPortState('cycling')`); await pr(EP(R + 0.8 * S, 0.0, 0.3 * S), EP(R - 0.2, 0, 0.22 * S), 55); await shot('chamber-person-cycling'); }
  if (want('sealed-lamp')) { await set(`cb.world.setPortState('sealed')`); await pr(E(R + 1.5 * S, 0.1, 0.32 * S), E(R - 0.6, 0, 0.25 * S), 58); await shot('chamber-port-sealed'); }
  if (want('chamber-person')) { await pr(EP(R + 0.8 * S, 0.0, 0.3 * S), EP(R - 0.2, 0, 0.22 * S), 55); await shot('chamber-person-eye'); }
  if (want('chamber-port')) { await pr(E(R + 1.5 * S, 0.1, 0.32 * S), E(R - 0.6, 0, 0.25 * S), 58); await shot('chamber-port-eye'); }
  if (want('diag')) {
    await pr(E(R - len - 1.0 * S, 0.1, 0.5), E(R + 1.5, 0, 0.4), 62);
    await page.evaluate(() => { let n = 0; window.__cb.ws.scene.traverse(o => { const m = o.material; if (o.isMesh && m && m.side === 1 && m.transparent && m.depthWrite === false && m.type === 'MeshBasicMaterial') { o.visible = false; n++; } }); window.__hazeHidden = n; });
    lap('haze meshes hidden ' + await page.evaluate(() => window.__hazeHidden)); await shot('diag-nohaze');
    await page.evaluate(() => { let n = 0; window.__cb.ws.scene.traverse(o => { if (o.isPointLight || o.isSpotLight) { o.visible = false; n++; } }); window.__nl = n; }); lap('lights off ' + await page.evaluate(() => window.__nl)); await shot('diag-nolights');
  }
  if (want('gateclose')) { await pr(E(R + 1.5 * S, -0.55 * S, 0.3), E(R - 0.1, 0.15 * S, 0.3), 62); await shot('gate-close-eye'); }
  if (want('gatelow')) { await pr(E(R + 1.0 * S, 0.5 * S, 0.1), E(R - 0.1, -0.1, 0.35), 70); await shot('gate-low-angle'); }
  if (want('airlockclose')) { await pr(EP(R + 0.9 * S, -0.3 * S, 0.3), EP(R - 0.1, 0.05, 0.28), 62); await shot('person-airlock-close'); }
  if (want('insideperson') || want('hatchclose')) {
    const lenP = await page.evaluate(async ([t, r]) => (await import('/src/sim/dome/vestibule.ts')).vestibuleOf(t, r).len, [dm.tier, R]);
    if (want('insideperson')) { await pr(EP(R - lenP - 1.4 * S, 0.15 * S, 0.45), EP(R - lenP + 0.1, 0, 0.33), 62); await shot('inside-person-hatch-wide'); }
    if (want('hatchclose')) { await pr(EP(R - lenP - 0.55 * S, 0.1 * S, 0.3), EP(R - lenP + 0.1, 0, 0.3), 58); await shot('inside-person-hatch-close'); }
  }
  if (want('roofabove')) { await pr(E(R + 2.2 * S, -1.2 * S, 2.6 * S), E(R - 0.3, 0.1, 0.4), 55); await shot('entrance-roof-from-above'); }
  if (want('pick')) {
    await pr(E(R - len - 1.0 * S, 0.1, 0.5), E(R + 1.5, 0, 0.4), 62); await frames(2);
    lap(JSON.stringify(await page.evaluate(async ([W, H]) => { const T = await import('/node_modules/three/build/three.module.js'); const ws = window.__cb.ws, cam = ws.camera, rc = new T.Raycaster(), out = [];
      for (const [px, py] of [[575, 470], [575, 300], [1420, 600]]) { rc.setFromCamera(new T.Vector2(px / W * 2 - 1, 1 - py / H * 2), cam); const hs = rc.intersectObjects(ws.scene.children, true).filter(q => q.object.isMesh && q.object.visible && q.object.material?.type !== 'MeshBasicMaterial' || false).slice(0, 3);
        out.push(hs.map(h => { let o = h.object, chain = []; while (o && chain.length < 5) { chain.push(o.name || o.type); o = o.parent; } const g = h.object.geometry, col = g.attributes.color, fi = h.faceIndex * 3; return [chain.join('<'), +h.distance.toFixed(2), h.point.toArray().map(v => +v.toFixed(2)), 'ground', +window.__cb.world.groundAt(h.point.x, h.point.z).toFixed(3), col ? [col.getX(fi), col.getY(fi), col.getZ(fi)].map(v => +v.toFixed(2)) : null, h.object.geometry.index ? 'idx' : 'nonidx', g.attributes.position.count]; })); } return out; }, [W, H])));
  }
  if (want('inside-night')) { await lightsOn(); await set(`cb.store.getState().setTimeOfDay(21.5)`); await pr(E(R - len - 1.0 * S, 0.1, 0.5), E(R + 1.5, 0, 0.4), 62); await shot('inside-looking-out-night'); }
  if (want('night')) {
    await lightsOn(); await set(`cb.store.getState().setTimeOfDay(21.5)`);
    await pr(E(R + 6.5, -3.5, 2.2), gate, 55); await shot('night-port');
  }
  await page.close();
  }
} finally { await browser.close(); vite.kill(); }
