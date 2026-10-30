/**
 * The mountainside showcase: the north-star compound assembled on the hillside + rock-face lot with the real build actions (src/game/showcase.ts),
 * checked, and photographed.
 *   flock $SP/render.lock node scripts/showcase.mjs --out shots/showcase [--port 5440] [--serve] [--rings 1|2] [--only checks,aerial,top,court,terrace,mist,night] [--q medium|high]
 * To look at it yourself:  npm run dev  then open  /?clean&seed=7&region=pnw&lot=hillside&lotcut&relief=9&acres=40&lotseed=8&elev=600&showcase=mountain
 * (add &rings=2 for a keep ring round the lodge, &lowrender for the QA harness). The report (JSON) lists every step the preset asked of the game,
 * whether it was allowed, and why not; `checks` walks the family between the posts (gate, house, garden, tower, hatch) and looks for clashes.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyLook } from './lookPresets.mjs';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5440)), outDir = resolve(opt('--out', 'shots/showcase')), only = opt('--only', 'checks,aerial,top,court,terrace,mist,night').split(','), q = opt('--q', 'medium'), rings = Number(opt('--rings', 1));
mkdirSync(outDir, { recursive: true });
let vite = null;
if (args.includes('--serve')) {
  vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
}
const LOT = 'region=pnw&lot=hillside&lotcut&relief=9&acres=40&lotseed=8&elev=600';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(900000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('console', m.text().slice(0, 300)); });
await page.goto(`http://localhost:${port}/?lowrender=0.75&clean&seed=7&${LOT}&showcase=mountain&rings=${rings}`);
await page.waitForFunction(() => window.__cb?.qa?.renderNow && window.__showcase, null, { timeout: 900000 });
const report = await page.evaluate(() => window.__showcase);
if (report.error) { console.error(report.error); process.exit(2); }
console.error(JSON.stringify(report.steps.map(s => `${s.ok ? 'ok  ' : 'NO  '}${s.step}${s.note ? ' (' + s.note + ')' : ''}`), null, 1));
console.error(JSON.stringify({ frame: report.frame, notes: report.notes, problems: report.problems }));
writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 1));
await page.evaluate(() => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality('low'); store.getState().setTimeOfDay(10); store.getState().setWeatherMode('clear'); store.getState().setSeasonMode('summer'); });
await page.waitForTimeout(1500);
let LOOK = 'clear';
const frames = async () => { await page.evaluate(q => window.__cb.qa.renderFull(q), q); await page.waitForTimeout(250); };
// the woods are planted a few chunks a frame: draw cheap frames until they are all in before the first photograph
for (let i = 0; i < 14; i++) { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(120); }
const shot = async name => { await frames(); await frames(); const f = `${outDir}/${name}.png`; await page.screenshot({ path: f }); console.error('shot', f); };
const orbit = (r, pitch, yaw, x, z, lift = 0.8) => page.evaluate(([r, pitch, yaw, x, z, lift]) => { const { world, cam } = window.__cb; cam.target.set(x, world.groundAt(x, z) + lift, z); cam.radius = r; cam.pitch = pitch; cam.yaw = yaw; }, [r, pitch, yaw, x, z, lift]);


// an eye-level camera that is not inside anything: try spots round the thing looked at (nearest the wanted bearing first), keep the first with a clear view
// (nothing within 0.35 of the eye, nothing between the eye and the target) and put the camera there. Returns the spot, or null.
const eyeAt = (look, bearing, radii, eyeH, lookH = 0.25) => page.evaluate(([look, bearing, radii, eyeH, lookH]) => {
  const cb = window.__cb, T = cb.THREE, w = cb.world, scene = cb.ws.scene, rc = new T.Raycaster();
  const cands = [];
  for (const r of radii) for (let k = 0; k < 16; k++) { const a = bearing + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 9); cands.push([look[0] + Math.cos(a) * r, look[1] + Math.sin(a) * r]); }
  const meshes = [];
  scene.traverse(o => { if (o.isMesh && o.visible && o.geometry) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); if (o.geometry.boundingSphere.radius * Math.max(o.scale.x, o.scale.y, o.scale.z) < 80) meshes.push(o); } });
  const solid = h => h.object.material && !Array.isArray(h.object.material) ? h.object.material.opacity > 0.5 || h.object.material.opacity === undefined : true;
  for (const [x, z] of cands) {
    const eye = new T.Vector3(x, w.groundAt(x, z) + eyeH, z), tgt = new T.Vector3(look[0], w.groundAt(look[0], look[1]) + lookH, look[1]);
    const d = tgt.clone().sub(eye), dist = d.length(); d.normalize();
    let ok = true;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) { rc.set(eye, new T.Vector3(dx, dy, dz)); rc.far = 0.35; if (rc.intersectObjects(meshes, false).some(solid)) { ok = false; break; } }
    if (!ok) continue;
    rc.set(eye, d); rc.far = dist;
    const hits = rc.intersectObjects(meshes, false).filter(solid);
    if (hits.length && hits[0].distance < dist * 0.8) continue;
    cb.cam.placeEye(x, z, look[0], look[1], eyeH);
    return [x, z];
  }
  return null;
}, [look, bearing, radii, eyeH, lookH]);

// ── where things are ────────────────────────────────────────────────────────────────────────────
const L = await page.evaluate(() => {
  const cb = window.__cb, g = cb.game.getState().game, w = cb.world, f = w.parcel.lot.fall;
  const of = k => g.structures.filter(s => s.kind === k).map(s => ({ id: s.id, x: s.x, z: s.z, rot: s.rot }));
  const ring = g.perimeter.filter(r => r.kind === 'stone_wall').sort((a, b) => b.pts.length - a.pts.length)[0];
  const pts = ring ? ring.pts : [[w.camp.x, w.camp.z]];
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return { fall: f, up: Math.atan2(Math.cos(f), Math.sin(f)), camp: [w.camp.x, w.camp.z], center: [cx, cz], lodge: of('lodge')[0], garage: of('gate_garage')[0], court: of('motor_court')[0], greenhouse: of('greenhouse_heated')[0], gardens: of('garden'), orchard: of('orchard')[0], solar: of('solar_farm')[0], battery: of('battery_bank')[0], hatch: of('bunker_hatch')[0], towers: g.structures.filter(s => s.kind.startsWith('watchtower')).map(s => ({ id: s.id, x: s.x, z: s.z })), vehicles: (g.vehicles ?? []).length };
});
console.error(JSON.stringify(L));

// ── checks: the family walks between the posts; vehicles are parked; the frame budget ──────────────
if (only.includes('checks')) {
  await frames(); await frames();
  const walk = await page.evaluate(async () => {
    const cb = window.__cb, G = cb.game, w = cb.world, gr = w.groundAt;
    const K = await import('/src/game/buildkit/kit.ts');
    const slopeAt = (x, z) => (Math.abs(gr(x + 0.25, z) - gr(x - 0.25, z)) + Math.abs(gr(x, z + 0.25) - gr(x, z - 0.25))) / 0.5;
    const g0 = G.getState().game, n = g0.people.length;
    const phases = [
      { name: 'watch (tower, wall, gate) + garden + water + livestock', tasks: ['watch', 'watch', 'watch', 'garden', 'water', 'livestock', 'pets', 'cleaning'] },
      { name: 'repairs + kitchen + garden + pets', tasks: ['repairs', 'kitchen', 'garden', 'pets', 'repairs', 'water', 'livestock', 'garden'] },
    ];
    const setTasks = tasks => { const g = structuredClone(G.getState().game); g.personState.forEach((ps, i) => { ps.task = tasks[i % tasks.length]; ps.target = null; }); G.setState({ game: g }); };
    // what a walk may not cross: a building (the gate garage has its drive-through, the court its open bays), a cliff band; the wall, but at its gates
    const boxes = g0.structures.filter(st => K.KIT[st.kind].level !== 'underground' && !['bunker_hatch', 'gate_garage', 'motor_court'].includes(st.kind)).map(st => K.footprint(K.KIT[st.kind], st.x, st.z, st.rot, false));
    const blockedAt = (x, z) => boxes.some(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) || slopeAt(x, z) > 1.0;
    const wallAt = (x, z) => w._perimeterBlocked(x, z, 0.08) || w.walls.blocks(x, z);
    const step = dt => w.updatePeople(dt, G.getState().game, 14, 1);
    const results = [];
    for (const ph of phases) {
      setTasks(Array(n).fill('sleep'));
      for (let i = 0; i < 40; i++) step(0.05);
      const pos0 = w.family.positions().map(p => ({ ...p }));
      setTasks(ph.tasks);
      const trace = new Map(pos0.map(p => [p.id, [[p.x, p.z]]]));
      let settledAt = null, t = 0;
      for (let i = 0; i < 4000; i++) {
        step(0.1); t += 0.1;
        let moving = 0;
        for (const p of w.family.positions()) { const tr = trace.get(p.id), l = tr[tr.length - 1]; if (Math.hypot(p.x - l[0], p.z - l[1]) > 1e-4) { tr.push([p.x, p.z]); moving++; } }
        if (!moving && t > 2) { settledAt = t; break; }
      }
      const people = [];
      g0.people.forEach((p, i) => {
        const tr = trace.get(p.id); if (!tr) return;
        let len = 0, maxGrade = 0, blockedSteps = 0, cliffSteps = 0, wallSteps = 0; const end = tr[tr.length - 1];
        for (let k = 1; k < tr.length; k++) {
          const [ax, az] = tr[k - 1], [bx, bz] = tr[k], d = Math.hypot(bx - ax, bz - az); if (d < 1e-6) continue;
          len += d; maxGrade = Math.max(maxGrade, Math.abs(gr(bx, bz) - gr(ax, az)) / Math.max(d, 0.05));
          if (slopeAt(bx, bz) > 1.0) cliffSteps++;
          if (Math.hypot(bx - end[0], bz - end[1]) > 1.3 && Math.hypot(bx - tr[0][0], bz - tr[0][1]) > 1.3) { if (blockedAt(bx, bz)) blockedSteps++; if (wallAt(bx, bz)) wallSteps++; }
        }
        people.push({ person: p.id, task: ph.tasks[i % ph.tasks.length], lenM: Math.round(len * 6), maxStepGrade: +maxGrade.toFixed(2), blockedSteps, wallSteps, cliffSteps, from: tr[0].map(v => +v.toFixed(1)), to: end.map(v => +v.toFixed(1)) });
      });
      results.push({ phase: ph.name, settledAfterS: settledAt, people });
    }
    // vehicles: where the fleet stands (the court's and the garage's rectangles)
    const court = g0.structures.find(s => s.kind === 'motor_court'), garage = g0.structures.find(s => s.kind === 'gate_garage');
    const inR = (v, st, def) => { if (!st) return false; const r = K.footprint(K.KIT[st.kind], st.x, st.z, st.rot, false); return v.x > r.x0 - 0.3 && v.x < r.x1 + 0.3 && v.z > r.z0 - 0.3 && v.z < r.z1 + 0.3; };
    const cars = [];
    w.fleet?.group.children.forEach(c => { if (c.visible) cars.push({ x: +c.position.x.toFixed(1), z: +c.position.z.toFixed(1), inCourt: inR(c.position, court), inGarage: inR(c.position, garage) }); });
    const info = cb.ws?.renderer?.info?.render;
    return { results, cars, calls: info?.calls, triangles: info?.triangles };
  });
  writeFileSync(`${outDir}/walk-report.json`, JSON.stringify(walk, null, 1));
  const fails = [];
  for (const ph of walk.results) {
    if (ph.settledAfterS === null) fails.push(`${ph.phase}: someone was still walking after 400 s`);
    for (const p of ph.people) {
      if (p.blockedSteps > 0) fails.push(`${p.person} (${p.task}) walked ${p.blockedSteps} steps through a building or cliff band`);
      if (p.cliffSteps > 0) fails.push(`${p.person} (${p.task}) climbed ${p.cliffSteps} steps of cliff ground`);
      if (p.wallSteps > 6) fails.push(`${p.person} (${p.task}) walked through the wall (${p.wallSteps} steps)`);
      if (p.lenM > 0 && p.maxStepGrade > 0.9) fails.push(`${p.person} (${p.task}) took a grade of ${p.maxStepGrade}`);
    }
  }
  console.error(fails.length ? 'WALK CHECK FAILED\n' + fails.join('\n') : 'WALK CHECK PASSED: every post reached, no walk through a building, wall or cliff');
  console.error('vehicles drawn: ' + JSON.stringify(walk.cars) + ` | draw calls ${walk.calls} triangles ${walk.triangles}`);
}

// ── the pictures ────────────────────────────────────────────────────────────────────────────────
const [cx, cz] = L.center;
if (only.includes('aerial')) {
  // like image 28: from downhill, looking up the mountain at the whole compound
  await orbit(46, 0.55, L.up + 0.3, cx, cz, 0.6); await shot('1-aerial-up-the-mountain');
  await orbit(80, 0.42, L.up - 0.55, cx, cz, 0.6); await shot('1b-aerial-wide');
}
if (only.includes('top')) {
  for (const [mode, name] of [['off', '2-top'], ['high', '2b-top-terrain-overlay-high-ground'], ['lanes', '2c-top-terrain-overlay-lanes'], ['water', '2d-top-terrain-overlay-water']]) {
    await page.evaluate(m => window.__cb.store.getState().setTerrainMode(m), mode); await orbit(54, 1.5, L.up, cx, cz, 0); await page.waitForTimeout(500); await shot(name);
  }
  await page.evaluate(() => window.__cb.store.getState().setTerrainMode('off'));
}
// the family: send everyone to work so someone stands at the gate and in the garden, then pose at eye level beside them
const posePerson = async (taskSet, near) => page.evaluate(async ([tasks, near]) => {
  const cb = window.__cb, G = cb.game, w = cb.world;
  const setTasks = ts => { const g = structuredClone(G.getState().game); g.personState.forEach((ps, i) => { ps.task = ts[i % ts.length]; ps.target = null; }); G.setState({ game: g }); };
  setTasks(Array(4).fill('sleep')); for (let i = 0; i < 40; i++) w.updatePeople(0.05, G.getState().game, 14, 1);
  setTasks(tasks);
  let best = null;
  for (let i = 0; i < 3000; i++) {
    w.updatePeople(0.1, G.getState().game, 14, 1);
    if (i % 20 === 0) { const ps = w.family.positions().filter(p => w.family.shown.has(p.id)); for (const p of ps) { const d = Math.hypot(p.x - near[0], p.z - near[1]); if (!best || d < best.d) best = { id: p.id, x: p.x, z: p.z, d }; } if (best && best.d < 3) break; }
  }
  const p = best ? w.family.positions().find(q => q.id === best.id) : null;
  return p ? { id: p.id, x: p.x, z: p.z, d: best.d } : null;
}, [taskSet, near]);
if (only.includes('court')) {
  const c = L.court;
  if (c) {
    const who = await posePerson(['watch', 'watch', 'watch', 'pets'], [c.x, c.z]);
    console.error('court person', JSON.stringify(who));
    // stand in the court, eye level, looking at the garage face with the vehicles in their bays (the bearing from the garage out over the court)
    const out = Math.atan2(c.z - L.garage.z, c.x - L.garage.x);
    const spot = await eyeAt([(c.x + L.garage.x) / 2 + (c.x - L.garage.x) * 0.3, (c.z + L.garage.z) / 2 + (c.z - L.garage.z) * 0.3], out + 0.4, [3.4, 2.8, 4.2], 0.3);
    console.error('court eye', JSON.stringify(spot));
    if (spot) await shot('3-eye-motor-court');
    if (who) { const sp = await eyeAt([who.x, who.z], out + 1.6, [1.8, 2.4, 3], 0.3, 0.15); if (sp) await shot('3b-eye-person-at-the-gate'); }
    // from the road looking up at the gate, the court and the wall
    await orbit(14, 0.35, L.up + 0.1, c.x, c.z, 0.4); await shot('3c-court-from-the-road');
  }
}
if (only.includes('terrace')) {
  const t = L.gardens[0] ?? L.greenhouse ?? L.lodge;
  const who = await posePerson(['garden', 'garden', 'garden', 'garden'], [t.x, t.z]);
  console.error('terrace person', JSON.stringify(who));
  if (who) { const sp = await eyeAt([who.x, who.z], L.fall + 0.6, [1.6, 2.2, 3], 0.3, 0.15); if (sp) await shot('4-eye-terrace-with-person'); }
  { const sp = await eyeAt([L.lodge.x, L.lodge.z], L.fall + 0.5, [5, 4, 6, 7], 0.4, 0.4); console.error('lodge eye', JSON.stringify(sp)); if (sp) await shot('4b-eye-lodge-from-the-garden'); }
  await orbit(18, 0.5, L.up + 2.4, L.lodge.x, L.lodge.z, 0.5); await shot('4c-lodge-and-terraces-from-above');
}
if (only.includes('mist')) {
  await applyLook(page, 'misty'); await page.waitForTimeout(500);
  await orbit(54, 0.5, L.up + 0.3, cx, cz, 0.6); await shot('5-misty-aerial-up-the-mountain');
  // the valley fog bank from above the compound, looking down the fall line
  await orbit(70, 0.36, L.up + Math.PI + 0.25, cx, cz, 2.2); await shot('5b-misty-valley-from-the-mountain');
  await applyLook(page, 'overcast'); await orbit(46, 0.55, L.up + 0.3, cx, cz, 0.6); await shot('5c-overcast-aerial');
}
if (only.includes('night')) {
  await page.evaluate(() => { const s = window.__cb.store.getState(); s.setWeatherMode('clear'); s.setSeasonMode('summer'); s.setTimeOfDay(22); });
  await orbit(46, 0.5, L.up + 0.3, cx, cz, 0.6); await shot('6-night-aerial');
  if (L.lodge) { const sp = await eyeAt([L.lodge.x, L.lodge.z], L.fall + 0.5, [5, 4, 6, 7], 0.4, 0.4); if (sp) await shot('6b-night-eye-lodge'); }
}
await browser.close(); vite?.kill();
process.exit(0);
