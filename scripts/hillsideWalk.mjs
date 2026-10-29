/**
 * Terraced-compound walk test on the cutbank hillside (the "compound notched into the mountain" lot).
 *   flock $SP/render.lock node scripts/hillsideWalk.mjs --out shots/hillside [--port 5410] [--shots] [--serve] [--look misty|overcast|drizzle|dusk] [--q medium|high]
 * Loads the lot, places a house + garden + tower + coop + well + wall with a gate (+ bunker hatch) on the shelf below the rock face and the
 * terraces under it, then forces each duty (garden, watch tower / wall / gate, water, livestock, pets, cleaning, kitchen, repairs) and steps the real
 * people update (world.updatePeople), recording every step. Reports reachability, the length and steepest grade of every walk, and whether anyone
 * walked through a building, the wall, the creek or a cliff band. Prints JSON; with --shots also writes the screenshots of the example lot
 * (aerial up the slope, top view with the Terrain overlay, eye level on the shelf with a person, people walking the terrace route).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { LOOKS, applyLook } from './lookPresets.mjs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const layoutKind = opt('--layout', 'terrace');   // terrace: the wall takes in the garden terrace below the shelf; shelf: the wall stops at the shelf edge, the garden is outside it
const LOOK = opt('--look', null), TOD = Number(opt('--tod', LOOK ? LOOKS[LOOK]?.tod ?? 10 : 10)), only = opt('--only', 'aerial,top,walk,eye,stair').split(',');   // which shot groups
const port = Number(opt('--port', 5410)), outDir = resolve(opt('--out', 'shots/hillside')), shots = args.includes('--shots');
mkdirSync(outDir, { recursive: true });
let vite = null;
if (args.includes('--serve')) {
  vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
}
const LOT = 'region=pnw&lot=hillside&lotcut&relief=9&acres=40&lotseed=8&elev=600';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(300000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
await page.goto(`http://localhost:${port}/?lowrender=0.75&clean&seed=7&${LOT}`);
await page.waitForFunction(() => window.__cb?.qa?.renderNow);
await page.evaluate(TOD => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality('low'); store.getState().setTimeOfDay(TOD); store.getState().setWeatherMode('clear'); store.getState().setSeasonMode('summer'); });
if (LOOK) await applyLook(page, LOOK);
await page.waitForTimeout(1500);
const lookQ = opt('--q', 'medium');
const frames = async () => { await page.evaluate(([look, q]) => (look ? window.__cb.qa.renderFull(q) : window.__cb.qa.renderNow()), [LOOK, lookQ]); await page.waitForTimeout(250); };
const shot = async name => { await frames(); const f = `${outDir}/${name}.png`; await page.screenshot({ path: f }); console.error('shot', f); };

// ── lay out the compound ────────────────────────────────────────────────────────────────────────────
const layout = await page.evaluate(async (layoutKind) => {
  const cb = window.__cb, G = cb.game, w = cb.world, gr = w.groundAt, lot = w.parcel.lot, c = w.camp;
  const phi = lot.fall, cf = Math.cos(phi), sf = Math.sin(phi);     // downhill unit vector
  const P = (du, db) => [c.x + du * cf - db * sf, c.z + du * sf + db * cf];
  const slopeAt = (x, z) => (Math.abs(gr(x + 0.25, z) - gr(x - 0.25, z)) + Math.abs(gr(x, z + 0.25) - gr(x, z - 0.25))) / 0.5;
  // the rock face: walk uphill from the camp until the ground is a cliff; the shelf's lower edge: downhill until it falls away
  let dFace = 0; for (let d = 0; d > -40; d -= 0.25) { const [x, z] = P(d, 0); if (slopeAt(x, z) > 0.9) { dFace = d; break; } }
  let dEdge = 0; for (let d = 0; d < 40; d += 0.25) { const [x, z] = P(d, 0); if (slopeAt(x, z) > 0.3) { dEdge = d; break; } }
  const g = structuredClone(G.getState().game);
  g.structures = [];
  g.clock.t = 2 * 365 + 120.4; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
  G.setState({ game: g });
  const K = await import('/src/game/buildkit/kit.ts');
  const placed = [];
  const put = (kind, du, db, rot = 0) => {
    const [x0, z0] = P(du, db), cur = structuredClone(G.getState().game);
    const spot = cb.tool.findSpot(kind, x0, z0, rot, 14);
    if (!spot) { placed.push({ kind, ok: false, want: [x0, z0] }); return null; }
    cur.structures.push({ id: 'h' + placed.length + kind, kind, x: spot[0], z: spot[1], rot, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    G.setState({ game: cur });
    placed.push({ kind, ok: true, at: spot.map(v => +v.toFixed(2)), moved: +Math.hypot(spot[0] - x0, spot[1] - z0).toFixed(2), du, db });
    return spot;
  };
  const mid = (dFace + dEdge) / 2;
  put('farmhouse', dFace + 4.2, 0, 0);
  put('well_hand', mid + 0.5, -5);
  put('chicken_coop', mid + 1, 6, 1);
  put('solar_array', dFace + 2.5, 9);
  put('battery_shed', dFace + 2.5, 12.5);
  put('watchtower_wood', dEdge - 1.5, 9);
  put('bunker_hatch', dFace + 3, -6);
  // the garden and greenhouse on the terrace below the shelf
  put('garden', dEdge + 3.5, 0);
  put('greenhouse', dEdge + 3.5, 6);
  // the wall round the shelf: its gate on the downhill side
  const P2 = await import('/src/sim/perimeter.ts');
  const cur = structuredClone(G.getState().game);
  const lo = layoutKind === 'terrace' ? dEdge + 10 : dEdge - 0.4;
  const a = P(dFace + 0.8, -13), b = P(dFace + 0.8, 13), cc = P(lo, 13), d = P(lo, -13);
  const run = P2.planRun(cur, 'container_wall', [a, b, cc, d, a], [{ at: 26 + (lo - dFace - 0.8) + 18, w: 1.0 }]);   // the gate in the downhill wall (toward the road)
  run.done = run.hours; run.supplied = true; run.finishedAt = 0;
  G.setState({ game: cur });
  const pets = await import('/src/sim/pets.ts'); const c2 = structuredClone(G.getState().game); pets.adoptDog(c2); G.setState({ game: c2 });
  window.__lay = { phi, dFace, dEdge };
  const h = (du, db = 0) => +gr(...P(du, db)).toFixed(2);
  return { phi, dFace, dEdge, camp: c, placed, heights: { atFaceTop: h(dFace - 2), shelfBack: h(dFace + 1), shelfMid: h((dFace + dEdge) / 2), shelfEdge: h(dEdge), terrace: h(dEdge + 4), terrace2: h(dEdge + 9) } };
}, layoutKind);
console.error(JSON.stringify(layout));
for (let i = 0; i < 4; i++) await frames();
const settle = await page.evaluate(async () => {
  const cb = window.__cb, w = cb.world;
  for (let i = 0; i < 6; i++) w.updatePeople(0.05, cb.game.getState().game, 14, 1);
  const net = w.paths.network;
  return { nodes: net.nodes.map(n => ({ id: n.id, kind: n.kind, role: n.role, ax: +n.ax.toFixed(2), az: +n.az.toFixed(2) })), edges: net.edges.length, trails: net.trails.length };
});
console.error(JSON.stringify(settle).slice(0, 1500));

// ── walk the duties ─────────────────────────────────────────────────────────────────────────────────
const report = await page.evaluate(async () => {
  const cb = window.__cb, G = cb.game, w = cb.world, gr = w.groundAt;
  const T = await import('/src/sim/terrain.ts');
  const slopeAt = (x, z) => (Math.abs(gr(x + 0.25, z) - gr(x - 0.25, z)) + Math.abs(gr(x, z + 0.25) - gr(x, z - 0.25))) / 0.5;
  const g0 = G.getState().game;
  const n = g0.people.length;
  const posts = [];
  // phase = { name, tasks: [task per person] }; the first three on 'watch' take the tower, the wall and the gate (sim/daily.ts watchNow)
  const base = i => 'sleep';
  const phases = [
    { name: 'garden + watch(tower, wall, gate) + water + livestock', tasks: ['watch', 'watch', 'watch', 'garden', 'water', 'livestock', 'pets', 'cleaning'] },
    { name: 'repairs + kitchen + fields + pets', tasks: ['repairs', 'kitchen', 'garden', 'pets', 'repairs', 'water', 'livestock', 'garden'] },
  ];
  const results = [];
  const setTasks = (tasks) => {
    const g = structuredClone(G.getState().game);
    g.personState.forEach((ps, i) => { ps.task = tasks[i % tasks.length]; ps.target = null; });
    G.setState({ game: g });
  };
  const K = await import('/src/game/buildkit/kit.ts');
  const boxes = g0.structures.filter(st => K.KIT[st.kind].level !== 'underground' && st.kind !== 'bunker_hatch').map(st => K.footprint(K.KIT[st.kind], st.x, st.z, st.rot, false));
  // what a walk may not cross (independent of the game's own tests): a building, the built wall, cliff ground
  const blockedAt = (x, z) => boxes.some(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) || slopeAt(x, z) > 1.0;
  const wallAt = (x, z) => w._perimeterBlocked(x, z, 0.08);
  const step = (dt) => w.updatePeople(dt, G.getState().game, 14, 1);
  for (const ph of phases) {
    // everyone starts at home asleep (indoors), then goes to work
    setTasks(Array(n).fill('sleep'));
    for (let i = 0; i < 40; i++) step(0.05);
    const pos0 = w.family.positions().map(p => ({ ...p }));
    setTasks(ph.tasks);
    const trace = new Map(pos0.map(p => [p.id, [[p.x, p.z]]]));
    let settledAt = null, t = 0;
    const last = new Map();
    for (let i = 0; i < 4000; i++) {
      step(0.1); t += 0.1;
      let moving = 0;
      for (const p of w.family.positions()) {
        const tr = trace.get(p.id), l = tr[tr.length - 1];
        if (Math.hypot(p.x - l[0], p.z - l[1]) > 1e-4) { tr.push([p.x, p.z]); moving++; }
      }
      if (!moving && t > 2) { settledAt = t; break; }
    }
    const people = [];
    g0.people.forEach((p, i) => {
      const tr = trace.get(p.id); if (!tr) return;
      let len = 0, maxGrade = 0, maxSlopeCell = 0, blockedSteps = 0, cliffSteps = 0, climb = 0, wallSteps = 0; const end = tr[tr.length - 1];
      for (let k = 1; k < tr.length; k++) {
        const [ax, az] = tr[k - 1], [bx, bz] = tr[k], d = Math.hypot(bx - ax, bz - az); if (d < 1e-6) continue;
        len += d; const dy = gr(bx, bz) - gr(ax, az); climb += Math.max(0, dy);
        maxGrade = Math.max(maxGrade, Math.abs(dy) / Math.max(d, 0.05));
        const sl = slopeAt(bx, bz); maxSlopeCell = Math.max(maxSlopeCell, sl); if (sl > 1.0) cliffSteps++;
        if (Math.hypot(bx - end[0], bz - end[1]) > 1.3 && Math.hypot(bx - tr[0][0], bz - tr[0][1]) > 1.3) { if (blockedAt(bx, bz)) blockedSteps++; if (wallAt(bx, bz)) wallSteps++; }
      }
      people.push({ person: p.id, task: ph.tasks[i % ph.tasks.length], lenM: Math.round(len * 6), climbM: +(climb * 6).toFixed(1), steps: tr.length, maxStepGrade: +maxGrade.toFixed(2), maxLocalSlope: +maxSlopeCell.toFixed(2), blockedSteps, wallSteps, cliffSteps, from: tr[0].map(v => +v.toFixed(1)), to: tr[tr.length - 1].map(v => +v.toFixed(1)), shown: w.family.shown.has(p.id) });
    });
    results.push({ phase: ph.name, settledAfterS: settledAt, people });
    window['__trace_' + results.length] = [...trace.entries()];
  }
  // the path network: every wanted walk, its length, the steepest grade along it and whether it crosses a cliff band
  const net = w.paths.network;
  const edges = net.edges.map(e => {
    let mg = 0, cliff = 0, climb = 0;
    for (let k = 1; k < e.route.length; k++) { const [ax, az] = e.route[k - 1], [bx, bz] = e.route[k], d = Math.hypot(bx - ax, bz - az) || 1e-6, dy = gr(bx, bz) - gr(ax, az); mg = Math.max(mg, Math.abs(dy) / d); climb += Math.max(0, dy); if (slopeAt(bx, bz) > 0.85) cliff++; }
    return { key: e.key, lenM: e.lenM, trips: +e.trips.toFixed(1), maxGrade: +mg.toFixed(2), climbM: +(climb * 6).toFixed(1), cliffPts: cliff, surface: e.surface };
  });
  const dr = w.access.drive; let dmax = 0; for (let k = 1; k < dr.length; k++) { const d = Math.hypot(dr[k][0] - dr[k - 1][0], dr[k][1] - dr[k - 1][1]) || 1e-6; dmax = Math.max(dmax, Math.abs(gr(dr[k][0], dr[k][1]) - gr(dr[k - 1][0], dr[k - 1][1])) / d); }
  return { results, edges, nodes: net.nodes.map(n => n.id), driveMaxGrade: +dmax.toFixed(2), driveLenM: Math.round(dr.reduce((a, p, k) => k ? a + Math.hypot(p[0] - dr[k - 1][0], p[1] - dr[k - 1][1]) : a, 0) * 6) };
});
writeFileSync(`${outDir}/walk-report.json`, JSON.stringify({ layout, report }, null, 1));
console.log(JSON.stringify(report, null, 1));
// assertions: everyone reached their post (the walk settled), through no building, no cliff band, and at most a graze of the wall at its gate
const fails = [];
for (const ph of report.results) {
  if (ph.settledAfterS === null) fails.push(`${ph.phase}: someone was still walking after 400 s`);
  for (const p of ph.people) {
    if (p.blockedSteps > 0) fails.push(`${p.person} (${p.task}) walked ${p.blockedSteps} steps through a building or cliff band`);
    if (p.cliffSteps > 0) fails.push(`${p.person} (${p.task}) climbed ${p.cliffSteps} steps of cliff ground`);
    if (p.wallSteps > 6) fails.push(`${p.person} (${p.task}) walked through the wall (${p.wallSteps} steps)`);
    if (p.lenM > 0 && p.maxStepGrade > 0.9) fails.push(`${p.person} (${p.task}) took a grade of ${p.maxStepGrade}`);
  }
}
console.error(fails.length ? 'WALK TEST FAILED\n' + fails.join('\n') : 'WALK TEST PASSED: every post reached, no walk through a building, wall or cliff');
if (fails.length) process.exitCode = 1;

if (shots) {
  await page.evaluate(t => { window.__cb.store.getState().setTimeOfDay(t); }, TOD);
  const up = await page.evaluate(() => { const f = window.__cb.world.parcel.lot.fall; return Math.atan2(Math.cos(f), Math.sin(f)); });
  // aerial oblique looking up the slope at the compound (the camera is downhill of it, looking uphill at the rock face)
  const orbit = (r, pitch, yaw, dx = 0, dz = 0, lift = 0.8) => page.evaluate(([r, pitch, yaw, dx, dz, lift]) => { const { world, cam } = window.__cb, c = world.camp; const x = c.x + dx, z = c.z + dz; cam.target.set(x, world.groundAt(x, z) + lift, z); cam.radius = r; cam.pitch = pitch; cam.yaw = yaw; }, [r, pitch, yaw, dx, dz, lift]);
  if (only.includes('aerial')) {
  await orbit(34, 0.5, up + 0.25);
  await shot('1-aerial-up-the-slope');
  await orbit(60, 0.42, up - 0.5);
  await shot('1b-aerial-wide-up-the-slope');
  }
  // top views with the terrain overlay: approach lanes, then high ground
  if (only.includes('top')) for (const [mode, name] of [['lanes', '2-top-terrain-overlay-lanes'], ['high', '2b-top-terrain-overlay-high-ground']]) {
    await page.evaluate(m => window.__cb.store.getState().setTerrainMode(m), mode);
    await orbit(44, 1.5, up, 0, 0, 0);
    await page.waitForTimeout(800);
    await shot(name);
  }
  await page.evaluate(() => window.__cb.store.getState().setTerrainMode('off'));
  // people walking the terrace route: put everyone back in the house, send them to work, and stop at fractions of the gardener's walk
  const walk = await page.evaluate(async () => {
    const cb = window.__cb, G = cb.game, w = cb.world;
    const setTasks = tasks => { const g = structuredClone(G.getState().game); g.personState.forEach((ps, i) => { ps.task = tasks[i % tasks.length]; ps.target = null; }); G.setState({ game: g }); };
    setTasks(Array(4).fill('sleep')); for (let i = 0; i < 40; i++) w.updatePeople(0.05, G.getState().game, 14, 1);
    window.__setTasks = setTasks;
    return w.family.positions().map(p => p.id);
  });
  const stops = only.includes('walk') ? [0.15, 0.4, 0.65, 0.9] : [];
  const ids = walk;
  await page.evaluate(() => window.__setTasks(['garden', 'garden', 'watch', 'pets']));
  let n = 0;
  for (const frac of stops) {
    // step the real people update until the gardener (p1) has walked `frac` of the way to the garden
    const at = await page.evaluate(async frac => {
      const cb = window.__cb, w = cb.world, G = cb.game, id = 'p1';
      const p0 = w.family.positions().find(p => p.id === id);
      window.__w0 = window.__w0 ?? [p0.x, p0.z];
      const goal = (() => { const g = G.getState().game.structures.find(s => s.kind === 'garden'); return [g.x, g.z]; })();
      const total = Math.hypot(goal[0] - window.__w0[0], goal[1] - window.__w0[1]);
      for (let i = 0; i < 3000; i++) {
        w.updatePeople(0.1, G.getState().game, 14, 1);
        const p = w.family.positions().find(q => q.id === id);
        if (Math.hypot(p.x - window.__w0[0], p.z - window.__w0[1]) >= total * frac * 0.95) break;
      }
      const ps = w.family.positions(), p = ps.find(q => q.id === id);
      const f = w.parcel.lot.fall, cf = Math.cos(f), sf = Math.sin(f);
      cb.cam.target.set(p.x, w.groundAt(p.x, p.z) + 0.3, p.z); cb.cam.radius = 5.2; cb.cam.pitch = 0.62; cb.cam.yaw = Math.atan2(cf, sf) + 0.5 + frac * 2;
      return { x: p.x, z: p.z, y: w.groundAt(p.x, p.z) };
    }, frac);
    console.error('walker', JSON.stringify(at));
    await shot(`4-walking-terrace-route-${++n}`);
  }
  // a person on a stair between terraces: find the trail stretches steep enough to carry a stair, then walk the gardener (and a second person) until one stands on it
  if (only.includes('stair')) {
    const info = await page.evaluate(async () => {
      const cb = window.__cb, w = cb.world, G = cb.game, gr = w.groundAt;
      const { stairRuns } = await import('/src/game/paths/walkRoute.ts');
      const runs = [];
      for (const t of w.paths.network.trails) if (t.surface) for (const r of stairRuns(t.pts, gr)) runs.push({ trail: t.id, pts: t.pts.slice(r.a, r.b + 1), lenM: Math.round(r.lenU * 6), riseM: +(r.riseU * 6).toFixed(1) });
      window.__stairs = runs;
      if (!runs.length) return { runs: 0 };
      const setTasks = tasks => { const g = structuredClone(G.getState().game); g.personState.forEach((ps, i) => { ps.task = tasks[i % tasks.length]; ps.target = null; }); G.setState({ game: g }); };
      const near = (p, run) => { const m = run.pts[Math.floor(run.pts.length / 2)]; return Math.hypot(m[0] - p.x, m[1] - p.z) < 0.07; };
      // the tasks that take people up and down the terrace route, one after another, until someone is on a stair
      let hit = null;
      for (const tasks of [['garden', 'sleep', 'sleep', 'sleep'], ['sleep', 'sleep', 'sleep', 'sleep'], ['garden', 'repairs', 'garden', 'pets'], ['kitchen', 'garden', 'kitchen', 'garden'], ['repairs', 'pets', 'repairs', 'pets']]) {
        setTasks(tasks);
        for (let i = 0; i < 2500 && !hit; i++) {
          w.updatePeople(0.05, G.getState().game, 10, 1);
          for (const p of w.family.positions()) for (const run of window.__stairs) if (near(p, run)) { hit = { id: p.id, x: p.x, z: p.z, y: gr(p.x, p.z), run: run.lenM + ' m long, ' + run.riseM + ' m rise' }; break; }
          if (hit) break;
        }
        if (hit) break;
      }
      if (hit) { const f = w.parcel.lot.fall; cb.cam.target.set(hit.x, hit.y + 0.2, hit.z); const r0 = window.__stairs.find(r => r.pts.some(q => Math.hypot(q[0] - hit.x, q[1] - hit.z) < 0.3)); const m = r0.pts[Math.floor(r0.pts.length / 2)], d = Math.atan2(r0.pts[r0.pts.length - 1][0] - r0.pts[0][0], r0.pts[r0.pts.length - 1][1] - r0.pts[0][1]); cb.cam.target.set(m[0], gr(m[0], m[1]) + 0.1, m[1]); cb.cam.radius = 3.0; cb.cam.pitch = 0.4; cb.cam.yaw = d + 2.2; hit.mid = m; }
      return { names: w.paths.renderer.group.children.map(c => c.name + ':' + (c.geometry?.attributes?.position?.count ?? 0)), runs: runs.length, summary: runs.map(r => r.lenM + ' m / ' + r.riseM + ' m'), hit };
    });
    console.error('stairs', JSON.stringify(info));
    if (info.hit) await shot('5-stair-between-terraces-with-person');
  }
  // eye level on the shelf below the rock face, a person in frame (everyone back at the house, the gardener beside the wall)
  await page.evaluate(() => window.__setTasks(['kitchen', 'pets', 'pets', 'pets']));
  await page.evaluate(() => { const cb = window.__cb, w = cb.world, G = cb.game; for (let i = 0; i < 800; i++) w.updatePeople(0.1, G.getState().game, 14, 1); });
  await page.evaluate(() => {
    const { world, cam } = window.__cb, ps = world.family.positions(), f = world.parcel.lot.fall, cf = Math.cos(f), sf = Math.sin(f);
    const p = ps.find(q => q.id === 'p2') ?? ps[0];
    // stand downhill of the person, look uphill past them at the rock face (eye 0.9 units above the ground, a person ≈ 0.28 tall in frame)
    const ex = p.x + cf * 2.6, ez = p.z + sf * 2.6;
    cam.placeEye(ex, ez, p.x - cf * 4, p.z - sf * 4, 0.9);
  });
  if (only.includes('eye')) await shot('3-eye-shelf-below-face');
  await page.evaluate(() => {
    const { world, cam } = window.__cb, ps = world.family.positions(), f = world.parcel.lot.fall, cf = Math.cos(f), sf = Math.sin(f);
    const p = ps.find(q => q.id === 'p2') ?? ps[0];
    const ex = p.x + cf * 1.4 - sf * 1.2, ez = p.z + sf * 1.4 + cf * 1.2;
    cam.placeEye(ex, ez, p.x - cf * 8, p.z - sf * 8, 1.6);
  });
  if (only.includes('eye')) await shot('3b-eye-looking-up-at-the-face');
}
await browser.close(); vite?.kill();
process.exit(0);
