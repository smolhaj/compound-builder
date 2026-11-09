/**
 * The access road's own bore with a delivery truck and a car driving it (synthetic spur, the real planner, roadWorks and vehicle builders):
 *   flock $SP/render.lock node scripts/boreShots.mjs --out shots/bore [--port 5443] [--serve]
 * Frames: eye level with a person near the portal, the truck in the mouth, a see-through side view showing the bore below the hilltop.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5443)), outDir = resolve(opt('--out', 'shots/bore'));
mkdirSync(outDir, { recursive: true });
let vite = null;
if (args.includes('--serve')) {
  vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
}
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(900000);
await page.addInitScript(([a, b]) => { window.__boreSig = a; window.__boreHt = b; }, [opt('--sig', 4), opt('--ht', 4.5)]);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
await page.goto(`http://localhost:${port}/?lowrender=0.75&clean&seed=7&region=mountain_west`);
await page.waitForFunction(() => window.__cb?.qa?.renderNow, null, { timeout: 900000 });
await page.evaluate(() => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality('low'); store.getState().setTimeOfDay(15); store.getState().setWeatherMode('clear'); });
const info = await page.evaluate(async () => {
  const THREE = await import('/node_modules/three/build/three.module.js').catch(() => import('three'));
  const cb = window.__cb, scene = cb.ws.scene;
  const { planRoad, roadBedOf } = await import('/src/sim/roadPlan.ts');
  const { buildRoadWorks } = await import('/src/game/region/roadWorks.ts');
  const { roadYAlong, surfacePitch } = await import('/src/game/paths/driveHeight.ts');
  const { buildTruck } = await import('/src/game/props/truckGeometry.ts');
  const { buildVehicle } = await import('/src/game/props/vehicleGeometry.ts');
  const { scaleFigure } = await import('/src/game/HomesteadWorld.ts');
  const OX = 3000, OZ = 3000;
  const SIG = Number(window.__boreSig ?? 4), HT = Number(window.__boreHt ?? 4.5);
  const spur = (x, z) => 1 + HT * Math.exp(-(((x - 45) / SIG) ** 2)) * (z > 14 && z < 50 ? 1 : 0);
  const inp = { region: 'mountain_west', seed: 5, ground: { h: spur }, rect: { x0: 0, z0: 22, x1: 67, z1: 42 }, frontage: { x: 67, zMin: 24, zMax: 40, band: [24, 40] }, county: () => 70.4, roadHalf: 0.5, yard: [25, 32] };
  const plan = planRoad(inp), bore = plan.structures.find(s => s.kind === 'tunnel'), bed = roadBedOf(plan), carved = (x, z) => bed.apply(x, z, spur(x, z)).h;
  const g = new THREE.Group(); g.position.set(OX, 0, OZ); scene.add(g);
  // the hill: a mesh of the same ground (kept so it can be made see-through)
  const nx = 220, nz = 140, geo = new THREE.PlaneGeometry(67, 40, nx, nz).rotateX(-Math.PI / 2).translate(33.5, 0, 32);
  const pos = geo.getAttribute('position'); for (let i = 0; i < pos.count; i++) pos.setY(i, carved(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x6f7a55, roughness: 1, transparent: true, opacity: 1, side: THREE.DoubleSide });
  const hill = new THREE.Mesh(geo, hillMat); g.add(hill);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(500, 500).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x66774f, roughness: 1 })); floor.position.set(33, 0.98, 32); g.add(floor);
  // cheap rock face colouring
  const road = buildRoadWorks(plan, carved, { built: true, surface: new THREE.MeshStandardMaterial({ color: 0x6b6862, roughness: 1 }), track: new THREE.MeshStandardMaterial({ color: 0x5a5448 }), driveW: 0.65, natural: spur });
  g.add(road);
  const spans = [bore];
  const mk = (obj, s, off = 0) => { const p = plan.pts.find(q => q.s >= s) ?? plan.pts[plan.pts.length - 1], q = plan.pts[Math.min(plan.pts.length - 1, plan.pts.indexOf(p) + 1)] ?? p, r = plan.pts[Math.max(0, plan.pts.indexOf(p) - 1)];
    const rot = Math.atan2(q.x - r.x, q.z - r.z), y = roadYAlong(plan.pts, spans, p.x, p.z) ?? spur(p.x, p.z);
    obj.position.set(p.x + Math.cos(rot) * off, y, p.z - Math.sin(rot) * off); obj.rotation.order = 'YXZ'; obj.rotation.set(-surfacePitch((x, z) => roadYAlong(plan.pts, spans, x, z) ?? spur(x, z), p.x, p.z, rot), rot, 0); g.add(obj); return { x: p.x, z: p.z, y, rot }; };
  const truck = buildTruck(), car = buildVehicle('suv');
  const ptsAt = s => { const p = plan.pts.find(q => q.s >= s) ?? plan.pts[plan.pts.length - 1]; return new THREE.Vector3(p.x, roadYAlong(plan.pts, spans, p.x, p.z) ?? spur(p.x, p.z), p.z); };
  const sMid = (bore.s0 + bore.s1) / 2;
  const inBore = mk(truck, sMid - 0.3, -0.12), mouth = mk(car, bore.s1 + 0.9, 0.12);
  const a = plan.pts.find(q => q.s >= bore.s0 - 1.8);
  const fig = scaleFigure(a.x + 0.9, a.z, spur(a.x + 0.9, a.z)); fig.position.add(new THREE.Vector3(0, 0, 0)); g.add(fig);
  const truckAt = ss => ptsAt(ss); window.__bore = { THREE, g, OX, OZ, plan, bore, hillMat, a, mouth, inBore, sMid, truck, truckAt: ss => { const v = ptsAt(ss); return v; } };
  return { bore: { s0: bore.s0, s1: bore.s1, lengthM: bore.lengthM }, mouth, inBore, hillTop: spur(inBore.x, inBore.z), roadY: inBore.y };
});
console.error('bore', JSON.stringify(info));
const frames = async () => { await page.evaluate(() => window.__cb.qa.renderFull('medium')); await page.waitForTimeout(300); };
const shot = async name => { await frames(); await frames(); await page.screenshot({ path: `${outDir}/${name}.png` }); console.error('shot', name); };
const B = await page.evaluate(() => { const b = window.__bore; return { OX: b.OX, OZ: b.OZ }; });
const info2 = await page.evaluate(() => { const b = window.__bore, p = b.plan.pts, A = p.find(q => q.s >= b.bore.s0), Bq = p.find(q => q.s >= b.bore.s1); return { A: { x: A.x, y: A.y, z: A.z }, B: { x: Bq.x, y: Bq.y, z: Bq.z } }; });
const A = info2.A, Bp = info2.B, L = Math.hypot(Bp.x - A.x, Bp.z - A.z), dx = (Bp.x - A.x) / L, dz = (Bp.z - A.z) / L, ox = B.OX, oz = B.OZ;
const look = (eye, tgt, fov = 55) => page.evaluate(([e, t, fov]) => { window.__cb.qa.pose = { x: e[0], y: e[1], z: e[2], lx: t[0], ly: t[1], lz: t[2], fov }; }, [eye, tgt, fov]);
const P = (base, along, lat, up) => [ox + base.x + dx * along - dz * lat, base.y + up, oz + base.z + dz * along + dx * lat];
// a person on the verge at each portal (the frames show scale: 0.28 u tall)
await page.evaluate(async ([ox, oz, A, Bp, dx, dz]) => {
  const THREE = window.__bore.THREE, { scaleFigure } = await import('/src/game/HomesteadWorld.ts'); const g = window.__bore.g;
  for (const [base, along] of [[A, -1.6], [Bp, 1.6]]) { const x = base.x + dx * along - dz * 0.7, z = base.z + dz * along + dx * 0.7; g.add(scaleFigure(x, z, base.y)); }
}, [ox, oz, A, Bp, dx, dz]);
// 1. eye level outside portal A, the person on the verge, the face ahead
await look(P(A, -3.2, 0.5, 0.3), P(A, 0.2, 0, 0.45)); await shot('bore-1-eye-level-portal-A-person');
// 2. eye level outside portal B
await look(P(Bp, 3.2, -0.5, 0.3), P(Bp, -0.2, 0, 0.45)); await shot('bore-2-eye-level-portal-B-person');
// 3. inside the bore looking down it to the lit far portal; the truck ahead
await page.evaluate(() => { const b = window.__bore; b.truck.position.copy(b.truckAt(b.bore.s0 + (b.bore.s1 - b.bore.s0) * 0.55)); });
await look(P(A, 2.2, 0, 0.3), P(Bp, 1.5, 0, 0.3), 62); await shot('bore-3-inside-looking-down-the-bore');
// 4. the truck driving out of portal B onto the road beyond
await page.evaluate(() => { const b = window.__bore; b.truck.position.copy(b.truckAt(b.bore.s1 + 0.6)); });
await look(P(Bp, 4.2, 1.2, 0.35), P(Bp, 0.4, 0, 0.3), 55); await shot('bore-4-truck-driving-out-of-portal-B');
// 5. aerial: both portals and the road through the hill
const mid = { x: (A.x + Bp.x) / 2, y: (A.y + Bp.y) / 2, z: (A.z + Bp.z) / 2 };
await look(P(mid, -6, 14, 14), P(mid, 0, 0, 1.2), 50); await shot('bore-5-aerial-both-portals-road-through-the-hill');
// 6. cutaway: the hill see-through, the truck under the hilltop
await page.evaluate(() => { window.__bore.hillMat.opacity = 0.28; window.__bore.hillMat.depthWrite = false; });
await look(P(mid, 0, 15, 3), P(mid, 0, 0, 1.0), 50); await shot('bore-6-cutaway-below-hilltop');
await browser.close(); vite?.kill();
