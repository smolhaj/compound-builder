// Arcology control block shots (docs/ux/dome-control): eye-level close-ups of each wing and the operations room, from the port, the yard airlock, above, day and night. HIGH quality.
//   ROT=1 flock /tmp/cb.lock node scripts/domeControlShots.mjs <outDir> [port] [names]
// names: ops, opsclose, power, water, air, doors, sec, pipes, fromport, fromyard, aerial, cutaway, long, nightops, nightlong
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
  // ── the control block: its plan (the world's own, in the dome's frame) and helpers to stand the camera in the block's frame ──
  const cbp = await page.evaluate(id => { const w = window.__cb.world; const b = [...w._built.values()].find(x => x.placed.id === id); const c = w._interiorCache.get(id)?.plan.control; return c ? { angle: c.angle, rho: c.rho, cx: c.cx, cz: c.cz, yaw: c.yaw, w: c.w, d: c.d, s: c.yardSide, y0: b.group.position.y, yardDoor: c.yardDoor, manifold: c.manifold, gateDoor: c.gateDoor, landing: c.landing } : null; }, info.id);
  if (!cbp) { console.error('no control block plan'); await page.close(); continue; }
  lap(JSON.stringify(cbp));
  const L = (lx, h, lz) => { const rr = cbp.rho - lz, th = cbp.angle - lx / cbp.rho; return [dm.x + rr * Math.sin(th), cbp.y0 + 0.02 + h, dm.z + rr * Math.cos(th)]; };   // a point of the curved block's frame (x along the arc, h up from the floor, z in toward the dome's centre)
  const WP = q => [dm.x + q[0], dm.z + q[1]];
  const at = (e, l, fov = 55) => poseRaw(e, l, fov);
  const lightsOn = () => page.evaluate(() => window.__cb.game.setState(st => { const g = structuredClone(st.game); g.utilities.lit = ['x']; return { game: g }; }));
  const s = cbp.s, hw = cbp.w / 2, hd = cbp.d / 2;
  if (want('ops')) { await at(L(0.25, 0.26, hd + 1.5), L(0, 0.2, 0.4), 58); await shot('ops-front-eye'); }
  if (want('opsclose')) { await at(L(0.1, 0.22, hd + 0.5), L(0, 0.22, 0), 62); await shot('ops-through-glass-close'); }
  if (want('power')) { await at(L(s * (hw + 1.1), 0.25, -0.6 + 1.3), L(s * hw, 0.3, -0.5), 58); await shot('wing-power-yard-side'); }
  if (want('water')) { await at(L(s * (hw + 1.0), 0.25, hd + 1.0), L(s * hw, 0.3, 0.4), 58); await shot('wing-water-yard-side'); }
  if (want('air')) { await at(L(0.3, 0.9, hd + 1.8), L(0, 0.55, -0.4), 52); await shot('wing-climate-roof'); }
  if (want('doors')) { await at(L(-s * (hw + 0.9), 0.24, 0.95), L(-s * hw, 0.2, 0.45), 56); await shot('wing-doors-gate-side'); }
  if (want('sec')) { await at(L(-s * (hw + 1.0), 0.28, -1.5), L(-s * hw, 0.35, -0.45), 58); await shot('wing-security-gate-side'); }
  if (want('pipes')) { const m = WP(cbp.manifold), k = 0.84, e = [dm.x + (m[0] - dm.x) * k, cbp.y0 + 0.2, dm.z + (m[1] - dm.z) * k]; await at(e, L(s * hw, 0.08, -0.2), 62); await shot('pipes-from-yard-manifold'); }
  if (want('fromport')) { const gd = cbp.gateDoor, k = 4.6 / Math.hypot(gd[0], gd[1]), g = WP([gd[0] * k, gd[1] * k]); await at([g[0], cbp.y0 + 0.24, g[1]], L(0, 0.2, hd), 58); await shot('from-sally-port-looking-in'); }
  if (want('fromyard')) { const yd = cbp.yardDoor, k = 1 - 0.9 / Math.hypot(yd[0], yd[1]), g = WP([yd[0] * k, yd[1] * k]); await at([g[0], cbp.y0 + 0.24, g[1]], L(0, 0.2, hd), 62); await shot('from-plant-yard-airlock'); }
  if (want('aerial')) { await at(L(0.4, 2.2, hd + 2.6), L(0, 0.1, -0.1), 58); await shot('aerial-above'); }
  if (want('cutaway')) { await set(`cb.store.getState().setBuildingView('cutaway')`); await at(L(0.3, 1.9, hd + 1.8), L(0, 0.1, 0.1), 58); await shot('aerial-cutaway'); await set(`cb.store.getState().setBuildingView('full')`); }
  if (want('long')) { await at(L(2.5, 2.4, hd + 6.2), L(0, 0.3, 0), 66); await shot('long-interior'); }
  if (want('nightops')) { await lightsOn(); await set(`cb.store.getState().setTimeOfDay(21.5)`); await at(L(0.25, 0.26, hd + 1.5), L(0, 0.2, 0.4), 58); await shot('night-ops-front'); }
  if (want('nightlong')) { await lightsOn(); await set(`cb.store.getState().setTimeOfDay(21.5)`); await at(L(0.4, 1.4, hd + 3.2), L(0, 0.2, 0), 62); await shot('night-block-wide'); }
  // ── broad frames of the whole dome, inside and out ──
  const Rd = await page.evaluate(async ([t, r]) => (await import('/src/sim/dome/vehiclePort.ts')).entryR(t, r), [dm.tier, R]);
  const gate = [dm.x + u[0] * Rd, cbp.y0 + 0.3, dm.z + u[1] * Rd];
  const E = (rho, lam, h) => [dm.x + u[0] * rho + n[0] * lam, h, dm.z + u[1] * rho + n[1] * lam];
  const E2 = (rho, lam, h) => { const q = E(rho, lam, h); q[1] += cbp.y0; return q; };
  const C = [dm.x, dm.z], up = (ang, rho, h) => [dm.x + Math.sin(ang) * rho, cbp.y0 + h, dm.z + Math.cos(ang) * rho];
  if (want('exaerial')) { await at(up(a ? a.angle + 0.9 : 0.9, R * 2.2, R * 1.5), [C[0], cbp.y0 + 1.2, C[1]], 55); await shot('ex-aerial'); }
  if (want('exroad')) { await at(E2(R + 9, -3, 0.45), [dm.x, cbp.y0 + 1.6, dm.z], 62); await shot('ex-eye-from-road'); }
  if (want('export')) { await at(E2(R + 3.2, -2.2, 0.4), gate, 58); await shot('ex-sally-port-side'); }
  if (want('exyard')) { const yy = WP(cbp.yardDoor), ya = Math.atan2(cbp.yardDoor[0], cbp.yardDoor[1]); await at(up(ya + 0.35, R + 5, 1.2), [yy[0], cbp.y0 + 0.5, yy[1]], 58); await shot('ex-plant-yard-side'); }
  if (want('inlong1')) { await at(up(a ? a.angle + Math.PI : 0, R * 0.55, 0.5), L(0, 0.25, 0), 44); await shot('in-long-toward-block-a'); }
  if (want('inlong2')) { await at(up(Math.atan2(cbp.cx, cbp.cz) + 2.6, R * 0.5, 0.6), L(0, 0.3, 0), 46); await shot('in-long-toward-block-b'); }
  if (want('inairlock')) { const gd = cbp.gateDoor, k = 1 - 0.9 / Math.hypot(gd[0], gd[1]), g = WP([gd[0] * k, gd[1] * k]); await at([g[0], cbp.y0 + 0.24, g[1]], [dm.x, cbp.y0 + 0.4, dm.z], 66); await shot('in-from-airlock-center'); }
  if (want('nightbroad')) { await lightsOn(); await set(`cb.store.getState().setTimeOfDay(21.5)`); await at(up(Math.atan2(cbp.cx, cbp.cz) + 2.4, R * 0.7, 1.2), L(0, 0.3, 0), 64); await shot('night-in-long'); }
  if (want('exnight')) { await lightsOn(); await set(`cb.store.getState().setTimeOfDay(21.5)`); await at(up(a ? a.angle + 0.9 : 0.9, R * 2.2, R * 1.5), [C[0], cbp.y0 + 1.2, C[1]], 55); await shot('ex-night-aerial'); }
  if (want('cutbroad')) { await set(`cb.store.getState().setBuildingView('cutaway')`); await at(up(Math.atan2(cbp.cx, cbp.cz) + 0.7, R * 0.95, 2.6), L(0, 0.1, 0.2), 62); await shot('cutaway-whole'); await set(`cb.store.getState().setBuildingView('full')`); }
  // ── the plan view: straight down over the dome, the yard airlock, the block and the entrance module together ──
  const planAt = async (h, fov, nm) => { await at([dm.x + 0.05, cbp.y0 + h, dm.z + 0.05], [dm.x, cbp.y0, dm.z], fov); await shot(nm); };
  if (want('plan')) await planAt(R * 2.1, 62, 'plan-view-overhead');
  if (want('plancut')) { await set(`cb.store.getState().setBuildingView('cutaway')`); await planAt(R * 2.1, 62, 'plan-view-cutaway'); await set(`cb.store.getState().setBuildingView('full')`); }
  if (want('plan2') || want('plan3')) {
    const m = [(cbp.cx * 0.8), (cbp.cz * 0.8)], c = WP(m), toC = [-m[0] / Math.hypot(...m), -m[1] / Math.hypot(...m)];
    if (want('plan2')) { await at([c[0], cbp.y0 + 3.6, c[1]], [c[0] + toC[0] * 0.5, cbp.y0, c[1] + toC[1] * 0.5], 100); await shot('plan-view-inside-over-gap'); }
    if (want('plan3')) { await set(`cb.store.getState().setBuildingView('cutaway')`); await at([c[0], cbp.y0 + 3.6, c[1]], [c[0] + toC[0] * 0.5, cbp.y0, c[1] + toC[1] * 0.5], 100); await shot('plan-view-inside-over-gap-cutaway'); await set(`cb.store.getState().setBuildingView('full')`); }
  }
  if (want('gap1')) { const yd = cbp.yardDoor, k = 1 - 1.0 / Math.hypot(yd[0], yd[1]), g = WP([yd[0] * k, yd[1] * k]); await at([g[0], cbp.y0 + 0.26, g[1]], L(0, 0.25, hd), 66); await shot('gap-from-yard-airlock'); }
  if (want('gap2')) { const gd = cbp.gateDoor, k = 4.9 / Math.hypot(gd[0], gd[1]), g = WP([gd[0] * k, gd[1] * k]); await at([g[0], cbp.y0 + 0.26, g[1]], L(0, 0.25, 0), 62); await shot('gap-from-sally-port-person-airlock'); }
  if (want('gap3')) { const yd = cbp.yardDoor, gd = cbp.gateDoor, m = [(yd[0] + gd[0]) / 2, (yd[1] + gd[1]) / 2], k = 0.55, g = WP([m[0] * k, m[1] * k]); await at([g[0], cbp.y0 + 0.5, g[1]], L(0, 0.25, 0), 80); await shot('gap-wide-from-inside-both-ends'); }
  await page.close();
  }
} finally { await browser.close(); vite.kill(); }
