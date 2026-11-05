// Gate alignment shots (src/game/perimeter/gateKitLayout.ts): the drive gate's kit (double gate / sally port, intercom pole and camera, caged motor, armed-response sign,
// open leaves, guard house, guard cars) on lots with different road headings and wall shapes. For each scenario: an aerial, an eye-level view down the approach with a
// person standing by the road, and an eye-level view from inside. The geometric guarantee itself is asserted without WebGL in src/game/perimeter/gateKitLayout.test.ts
// (heading within 3 degrees of the road, centered, flush with the wall, clear for a vehicle, on the ground, right way round, over many seeded lots).
// Also: guard CARS parked at the drive (guards hired, no gate house), the gate house close up (barrier, bollards, camera lens) with a person and a pickup for scale,
// a covered bridge over a moat laid along the drive, a covered bridge over the creek, and a vehicle yard beside the drive. Every eye-level camera is tested against the
// scene (rays from the eye, back faces counted: inside a wall / berm / slope) and moved until it is clear; a shot with no clear camera is named `-INSIDE` and reported.
//   node scripts/gateAlignShots.mjs <outDir> [port=5963] [only] [full]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5963), only = process.argv[4] && process.argv[4] !== '-' ? process.argv[4] : null, full = process.argv[5] === 'full';
mkdirSync(out, { recursive: true });

/** wall: perimeter kind, shape: ring outline for a compound wall (null = the whole property line); guards: the gate house; cars: guards hired with no house, their cars parked at the drive; kind: which extra views (frame: the guard house / cars close up; bridge; yard). */
const SCENARIOS = [
  { name: 'mw-hillside-property', q: 'region=mountain_west&lot=hillside&lotseed=2', wall: 'container_wall', shape: null },
  { name: 'plains-bench-corner-road', q: 'region=plains&lot=bench&lotseed=1', wall: 'container_wall', shape: null },
  { name: 'mw-ridge-octagon-oblique', q: 'region=mountain_west&lot=ridge&lotseed=1', wall: 'stone_wall', shape: 'octagon' },
  { name: 'ne-hillside-rounded', q: 'region=new_england&lot=hillside&lotseed=1', wall: 'stone_wall', shape: 'rounded' },
  { name: 'desert-bench-guards', q: 'region=desert&lot=bench&lotseed=1', wall: 'container_wall', shape: null, guards: true, kind: 'frame' },
  { name: 'plains-mesa-octagon-guards', q: 'region=plains&lot=mesa&lotseed=1', wall: 'stone_wall', shape: 'octagon', guards: true, kind: 'frame' },
  { name: 'desert-bench-cars', q: 'region=desert&lot=bench&lotseed=1', wall: 'container_wall', shape: null, cars: 3, kind: 'frame' },
  { name: 'plains-mesa-octagon-cars', q: 'region=plains&lot=mesa&lotseed=1', wall: 'stone_wall', shape: 'octagon', cars: 3, kind: 'frame' },
  { name: 'mw-hillside-cars-slope', q: 'region=mountain_west&lot=hillside&lotseed=2', wall: 'container_wall', shape: null, cars: 3, kind: 'frame' },
  { name: 'plains-bench-moat-bridge', q: 'region=plains&lot=bench&lotseed=1', wall: 'container_wall', shape: null, kind: 'bridge' },
  { name: 'ne-hillside-moat-bridge', q: 'region=new_england&lot=hillside&lotseed=1', wall: 'stone_wall', shape: 'rounded', kind: 'bridge' },
  { name: 'plains-bench-yard', q: 'region=plains&lot=bench&lotseed=1', wall: 'container_wall', shape: null, kind: 'yard' },
  { name: 'mw-hillside-yard', q: 'region=mountain_west&lot=hillside&lotseed=2', wall: 'container_wall', shape: null, kind: 'yard' },
].filter(s => !only || s.name.includes(only));

const setup = `async (s) => { const cb = window.__cb, G = cb.game, W = cb.world; window.__gm = await import('/src/sim/guards.ts');
  if (!window.__ga) { window.__ga = true;
    G.getState().wallProperty(s.wall, cb.store.getState().siteGeo ?? {}, s.shape ?? undefined);
    G.setState(st => { const g = structuredClone(st.game);
      for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = g.clock.t - 400; for (const gt of r.gates) delete gt.garage; }
      g.stock.sally_gate = 1; g.stock.gate_intercom = 1; g.stock.gate_motor = 1; g.utilities.lit = ['x'];
      g.security = { response: { since: 0, paidDay: 0, missed: 0, downDays: 0, ended: null, calls: 0 } };
      if (s.guards) g.stock.gate_house = 1;
      if (s.cars) { const gm = window.__gm; g.guards = gm.newGuards(); for (let i = 0; i < s.cars; i++) g.guards.staff.push({ id: 'g' + (900 + i), name: 'Guard ' + i, hiredAt: 0, shift: [6, 14, 22][i % 3], local: false, holds: 4, alone: false, person: { id: 'pg' + i, first: 'Guard', last: String(i), age: 35, kid: false, body: 'm', skills: { builder: 1, gardener: 0, medic: 1, mechanic: 2, hunter: 6, negotiator: 1, teacher: 0, radio: 1 }, shirt: 0x39475a }, loyalty: 60 }); }
      return { game: g }; });
  }
  const m = await import('/src/game/perimeter/gateKitLayout.ts');
  const g = G.getState().game, e = m.entryGate(g.perimeter, W.access.drive);
  if (!e) { window.__ent = null; return 'no entry gate'; }
  const run = g.perimeter.find(r => r.id === e.runId), lay = m.gateKitLayout(e.gate, e.crossing, W.access.drive, run.pts);
  const t = m.headingAt(W.access.drive, e.crossing.driveArc);
  window.__m = m; window.__ent = { x: e.crossing.x, z: e.crossing.z, tx: t[0], tz: t[1], sin: e.crossing.sin, w: e.gate.w, kit: !!lay, arc: e.crossing.driveArc, drive: W.access.drive };
  return JSON.stringify({ ...window.__ent, drive: undefined }); }`;
/** Page helpers: the guard frame's local -> world map, a surface-height probe, the eye placer with its fallbacks (`k`: back off, then sideways), and the inside-geometry test. */
const helpers = `(() => { const cb = window.__cb, T = cb.THREE;
  window.__FR = () => { const fr = cb.world._gateFrame, a = fr.rotation.y; return { fr, a, F: (x, z) => [fr.position.x + Math.cos(a) * x + Math.sin(a) * z, fr.position.z - Math.sin(a) * x + Math.cos(a) * z] }; };
  /** Top surface under (x, z), found by a ray down from \`above\` over the ground (the deck of a bridge, a road's crown, a slope). */
  window.__top = (x, z, above = 0.45) => { const rc = new T.Raycaster(new T.Vector3(x, cb.world.groundAt(x, z) + above, z), new T.Vector3(0, -1, 0), 0, 3); rc.camera = cb.ws.camera; const hs = rc.intersectObjects(cb.ws.scene.children, true).filter(h => h.object.isMesh && h.object.visible && !h.object.userData.__mine); return hs.length ? hs[0].point.y : cb.world.groundAt(x, z); };
  window.__eyeK = (k, x, z, lx, lz, e) => { const dx = x - lx, dz = z - lz, dl = Math.hypot(dx, dz) || 1, back = 0.45 * (k % 3), side = [0, 0.4, -0.4][Math.floor(k / 3) % 3]; cb.cam.placeEye(x + dx / dl * back - dz / dl * side, z + dz / dl * back + dx / dl * side, lx, lz, e); };
  window.__chk = () => { const cam = cb.ws.camera; cam.updateMatrixWorld(); const saved = [];
    cb.ws.scene.traverse(o => { if (o.isMesh && o.material) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) { saved.push([m, m.side]); m.side = T.DoubleSide; } });
    const rc = new T.Raycaster(); rc.far = 0.8; rc.camera = cam; let back = 0, near = 0; const names = {};
    for (const v of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0],[0,-1,0],[1,0,1],[1,0,-1],[-1,0,1],[-1,0,-1],[0,1,1],[0,1,-1],[1,1,0],[-1,1,0]]) {
      const d = new T.Vector3(...v).normalize(); rc.set(cam.position, d);
      const h = rc.intersectObjects(cb.ws.scene.children, true).find(h => h.object.isMesh && h.object.visible && h.face);
      if (!h) continue; if (h.distance < 0.2) near++;
      if (h.face.normal.clone().transformDirection(h.object.matrixWorld).dot(d) > 0) { back++; let o = h.object; const nm = [o.name || o.type, o.parent?.name, o.parent?.parent?.name].filter(Boolean).join('<'); names[nm] = (names[nm] || 0) + 1; }
    }
    // the view itself: a 5 x 5 grid of rays through the screen; nothing solid within 0.3 (a wall, berm or slope pressed against the lens)
    let minD = 9, minName = '';
    for (const nx of [-0.9, -0.45, 0, 0.45, 0.9]) for (const ny of [-0.9, -0.45, 0, 0.45, 0.9]) { rc.far = 1.2; rc.setFromCamera(new T.Vector2(nx, ny), cam); const h = rc.intersectObjects(cb.ws.scene.children, true).find(h => h.object.isMesh && h.object.visible && h.face && !h.object.userData.__mine); if (h && h.distance < minD) { minD = h.distance; const o = h.object; minName = [o.name || o.type, o.parent?.name, o.parent?.parent?.name].filter(Boolean).join('<'); } }
    // the world's own tests (the raycast cannot see shader-grown retaining walls): no retaining wall within half a unit, and no bank of ground rising above the eye straight ahead
    const W = cb.world, wf = new T.Vector3(); cam.getWorldDirection(wf); const eyeY = cam.position.y;
    for (const r of [0.15, 0.3, 0.5]) for (let i = 0; i < 12; i++) { const an = i / 12 * 2 * Math.PI; if (W.walls.blocks(cam.position.x + Math.cos(an) * r, cam.position.z + Math.sin(an) * r)) { near++; names['RETAINING WALL within ' + r] = 1; } }
    const fl = Math.hypot(wf.x, wf.z) || 1;
    for (const d of [0.25, 0.5, 0.8, 1.2]) { const bx = cam.position.x + wf.x / fl * d, bz = cam.position.z + wf.z / fl * d; if (W.groundAt(bx, bz) > eyeY - 0.03) { near++; names['BANK above the eye at ' + d] = 1; break; } if (W.walls.blocks(bx, bz) && d < 0.9) { near++; names['RETAINING WALL ahead at ' + d] = 1; break; } }
    if (minD < 0.3) { near++; names['AHEAD ' + minName + ' ' + minD.toFixed(2)] = 1; }
    for (const [m, sd] of saved) m.side = sd;
    return { back, near, names, minD: +minD.toFixed(2), minName, pos: cam.position.toArray().map(v => +v.toFixed(2)) }; };
})()`;
/** A point `du` along the drive from the crossing (inside +) and `v` to its left, following the road's bend. */
const R = (du, v) => `window.__m.offsetAt(q.drive, q.arc + (${du}), (${v}))`;
const place = `const q = window.__ent; if (!q) return;`;
const FIG = `cb.world._root.children.find(o => o.userData.type === 'scale_figure')`;
const fig = (du, v) => `{ ${place} const W = cb.world, f = ${FIG}; if (f) { f.userData.__mine = true; const [x, z] = ${R(du, v)}; f.position.set(x, window.__top(x, z, 0.3), z); } }`;
const eye = (du, v, ldu, lv, e = 0.28) => `{ ${place} const [x, z] = ${R(du, v)}, [lx, lz] = ${R(ldu, lv)}; window.__eyeK(k, x, z, lx, lz, ${e}); }`;
const air = (r, pitch, turn) => `{ ${place} const [x, z] = ${R(0.5, 0)}; cb.cam.target.set(x, 0, z); cb.cam.radius = ${r}; cb.cam.pitch = ${pitch}; cb.cam.yaw = Math.atan2(-q.tx, -q.tz) + ${turn}; }`;
/** Guard-frame views (local +x = out to the road, the house on -z, cars on +z). */
const FR = `const { F, a } = window.__FR();`;
const ffig = (lx, lz) => `{ ${FR} const f = ${FIG}; if (f) { f.userData.__mine = true; const [x, z] = F(${lx}, ${lz}); f.position.set(x, cb.world.walkHeight(x, z), z); } }`;
const feye = (lx, lz, tx, tz, e = 0.28) => `{ ${FR} const [x, z] = F(${lx}, ${lz}), [lx, lz] = F(${tx}, ${tz}); window.__eyeK(k, x, z, lx, lz, ${e}); }`;
const fair = (tx, tz, r, pitch, yawOff) => `{ ${FR} const [x, z] = F(${tx}, ${tz}); cb.cam.target.set(x, 0, z); cb.cam.radius = ${r}; cb.cam.pitch = ${pitch}; cb.cam.yaw = a + ${yawOff}; }`;
/** A vehicle in the frame's lane at local (lx, lz): nose toward the camp (-x local) when dir is -1, toward the road when +1. */
const fveh = (kind, lx, lz, dir) => `{ ${FR} const o = window.__vh?.${kind}; if (!o) return; const [x, z] = F(${lx}, ${lz}); o.visible = true; o.rotation.y = Math.atan2((${dir}) * Math.cos(a), -(${dir}) * Math.sin(a)); o.position.set(x, cb.world.walkHeight(x, z), z); }`;
/** Bridge / yard anchors (set by their setup): world points and unit directions on the drive. */
const B = `const b = window.__bridge; if (!b) return;`;
const bp = (du, v) => `[b.c[0] + b.t[0] * (${du}) + b.n[0] * (${v}), b.c[1] + b.t[1] * (${du}) + b.n[1] * (${v})]`;
const bfig = (du, v) => `{ ${B} const f = ${FIG}; if (f) { f.userData.__mine = true; const [x, z] = ${bp(du, v)}; f.position.set(x, window.__top(x, z, 0.35), z); } }`;
const beye = (du, v, tdu, tv, e = 0.28) => `{ ${B} const [x, z] = ${bp(du, v)}, [lx, lz] = ${bp(tdu, tv)}; window.__eyeK(k, x, z, lx, lz, ${e}); }`;
const bair = (r, pitch, yawOff) => `{ ${B} cb.cam.target.set(b.c[0], 0, b.c[1]); cb.cam.radius = ${r}; cb.cam.pitch = ${pitch}; cb.cam.yaw = Math.atan2(-b.t[0], -b.t[1]) + ${yawOff}; }`;
const bveh = (kind, du, v, dir) => `{ ${B} const o = window.__vh?.${kind}; if (!o) return; const [x, z] = ${bp(du, v)}; o.visible = true; o.rotation.y = Math.atan2((${dir}) * b.t[0], (${dir}) * b.t[1]); o.position.set(x, window.__top(x, z, 0.3), z); }`;

const COMMON = [
  ...(process.env.DBG ? [{ name: 'dbg-where-the-eye-was', time: 10, setup: `{ ${place} const [x, z] = ${R(-3.6, 0.1)}; cb.cam.target.set(x, 0, z); cb.cam.radius = 1.8; cb.cam.pitch = 0.7; cb.cam.yaw = Math.atan2(-q.tx, -q.tz) + 0.9; }` }, { name: 'dbg-where-the-eye-was-wide', time: 10, setup: `{ ${place} const [x, z] = ${R(-3.6, 0.1)}; cb.cam.target.set(x, 0, z); cb.cam.radius = 5, cb.cam.pitch = 0.5; cb.cam.yaw = Math.atan2(-q.tx, -q.tz) + 0.6; }` }] : []),
  { name: 'eye-approach-person', time: 10, n: 9, setup: fig(-1.7, -0.62) + eye(-3.6, 0.1, 0.5, 0) },
  { name: 'eye-inside-person', time: 15, n: 9, setup: fig(2.0, 0.6) + eye(3.8, -0.1, -0.3, 0) },
  { name: 'eye-side-person', time: 12, n: 9, setup: fig(-1.1, -0.9) + eye(0.3, 2.4, 0.4, 0) },
  { name: 'aerial', time: 11, setup: air(8.5, 1.0, 0.35) },
  { name: 'aerial-top', time: 11, setup: air(6, 1.45, 0) },
];
/** The guard house / cars close up. Frame: x toward the road, z toward the cars. */
const FRAME_VIEWS = [
  { name: 'frame-aerial', time: 11, setup: fair(-0.6, 0.1, 4.2, 1.05, 0.5) },
  { name: 'frame-aerial-top', time: 11, setup: fair(-0.6, 0.1, 3.4, 1.5, 0) },
  { name: 'frame-eye-road-side-person-pickup', time: 10, n: 9, setup: fveh('pickup', 1.15, 0, -1) + ffig(0.5, 0.62) + feye(3.4, 0.55, 0.2, -0.05) },
  { name: 'frame-eye-bollards-lens-person-pickup', time: 12, n: 9, setup: fveh('pickup', 2.6, 0, -1) + ffig(0.55, 0.5) + feye(1.55, 0.2, 0.0, -0.33, 0.3) },
  { name: 'frame-eye-lane-person-pickup', time: 14, n: 9, setup: fveh('pickup', 1.4, 0, -1) + ffig(-0.45, 0.0) + feye(-1.6, -0.2, 0.3, 0.2) },
  { name: 'frame-eye-camp-side-person', time: 15, n: 9, setup: fveh('pickup', 1.6, 0, 1) + ffig(0.9, -0.15) + feye(-3.4, 0.0, 0.3, 0.1) },
  { name: 'frame-eye-cross-lane-person', time: 16, n: 9, setup: ffig(-0.2, 0.0) + feye(-0.5, -1.5, -0.7, 0.5) },
];
const BRIDGE_VIEWS = [
  { name: 'bridge-aerial', time: 11, setup: bair(6.5, 0.95, 0.5) },
  { name: 'bridge-aerial-top', time: 11, setup: bair(5, 1.5, 0) },
  { name: 'bridge-eye-approach-person-pickup', time: 10, n: 9, setup: bveh('pickup', -1.9, 0.0, 1) + bfig(-0.6, 0.34) + beye(-4.2, 0.45, 0.4, 0) },
  { name: 'bridge-eye-on-deck-person', time: 15, n: 9, setup: bfig(0.3, 0.0) + beye(-0.9, 0.0, 1.1, 0.0) },
  { name: 'bridge-eye-bank-side', time: 12, n: 9, setup: bfig(-0.2, 0.7) + beye(-0.1, 2.3, 0.0, 0.0) },
  { name: 'bridge-eye-far-side-person', time: 16, n: 9, setup: bfig(-1.5, 0.35) + beye(3.4, -0.3, -1.2, 0.0) },
];
const YARD_VIEWS = [
  { name: 'yard-aerial', time: 11, setup: bair(8, 0.95, 0.5) },
  { name: 'yard-aerial-top', time: 11, setup: bair(7, 1.5, 0) },
  { name: 'yard-eye-front-person-pickup', time: 10, n: 9, setup: bveh('pickup', -0.2, 0.0, 1) + bfig(-0.2, 0.55) + beye(-1.6, -0.1, 0.4, 2.2) },
  { name: 'yard-eye-gate-person', time: 14, n: 9, setup: bfig(0.0, 1.5) + beye(0.0, 0.0, 0.0, 2.1) },
  { name: 'yard-eye-from-road', time: 12, n: 9, setup: bfig(-0.4, 0.5) + beye(-3.0, 0.2, 0.2, 1.8) },
];

/** The base walls and the entry gate; bridge: a moat across the drive outside the wall and a covered bridge laid along the drive over it, then one over the creek; yard: a vehicle yard beside the drive. */
const extra = `async (s) => { const cb = window.__cb, G = cb.game, W = cb.world, q = window.__ent, m = window.__m; if (!q) return 'no entry';
  const drive = W.access.drive, lerpAt = (a, d, v) => m.offsetAt(drive, a + d, v);
  if (s.kind === 'bridge' && !window.__brDone) { window.__brDone = true;
    const A = q.arc > 5 ? q.arc - 3.4 : q.arc + 3.8, c = m.pointAtArc(drive, A), t = m.headingAt(drive, A), n = [t[1], -t[0]], HL = 1.1;
    const moat = [[c[0] - n[0] * 7, c[1] - n[1] * 7], [c[0] + n[0] * 7, c[1] + n[1] * 7]], br = [[c[0] - t[0] * HL, c[1] - t[1] * HL], [c[0] + t[0] * HL, c[1] + t[1] * HL]];
    G.getState().planRun('moat', moat, []); G.getState().planRun('covered_bridge', br, []);
    G.setState(st => { const g = structuredClone(st.game); for (const r of g.perimeter) if (r.kind === 'moat' || r.kind === 'covered_bridge') { r.gates = []; r.done = r.hours; r.supplied = true; r.finishedAt = g.clock.t - 400; } return { game: g }; });
    const inwards = q.arc <= 5;   // the lot's gate is on the road: the moat is inside the wall, so look at it from the camp side (t points out to the road)
    window.__bridge = inwards ? { c, t: [-t[0], -t[1]], n: [-n[0], -n[1]] } : { c, t, n };
    return 'moat+bridge at arc ' + A.toFixed(2) + ' runs ' + G.getState().game.perimeter.map(r => r.kind + ':' + r.gates.length).join(','); }
  if (s.kind === 'yard' && !window.__yDone) { window.__yDone = true;
    const A = q.arc > 6 ? q.arc - 4.2 : q.arc + 4.6, c = m.pointAtArc(drive, A), t = m.headingAt(drive, A), n = [t[1], -t[0]], side = s.side ?? 1;
    const tx = c[0] + n[0] * 2.4 * side, tz = c[1] + n[1] * 2.4 * side;
    // the yard's front (+z local) faces the drive: world dir of rot r is (sin(r pi/2), cos(r pi/2))
    const want = [-n[0] * side, -n[1] * side]; let rot = 0, bd = -9; for (let r = 0; r < 4; r++) { const d = Math.sin(r * Math.PI / 2) * want[0] + Math.cos(r * Math.PI / 2) * want[1]; if (d > bd) { bd = d; rot = r; } }
    const sp = cb.tool.findSpot('vehicle_yard', tx, tz, rot, 6);
    if (!sp) return 'no spot for the yard';
    G.getState().plan('vehicle_yard', sp[0], sp[1], rot);
    G.setState(st => { const g = structuredClone(st.game); const y = g.structures.at(-1); y.stage = 9; y.done = 0; y.finishedAt = 0; g.money = 500000; return { game: g }; });
    const vm = await import('/src/sim/vehicles.ts'); for (const k of ['tractor', 'atv']) G.getState().money(d => vm.buyVehicle(d, k));
    // views anchor on the yard's front gate: center = the gate's mid, t = the drive direction toward the camp, n = left of it
    const inw = q.arc <= 5;
    window.__bridge = { c: [sp[0], sp[1]], t: inw ? [-t[0], -t[1]] : t, n: inw ? [-n[0], -n[1]] : n, rot };
    return 'yard at ' + sp.map(v => v.toFixed(2)).join(',') + ' rot ' + rot + ' (arc ' + A.toFixed(2) + ')'; }
  return ''; }`;

const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let n = 0; const inside = [];
try {
  for (const s of SCENARIOS) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(180000);
    page.on('pageerror', e => console.error('pageerror:', e.message));
    await page.goto(`http://localhost:${port}/?clean&lowrender=0.75&seed=7&drive&${s.q}`);
    await page.waitForFunction(() => window.__cb?.qa?.lowrender);
    await page.evaluate(() => window.__cb.store.getState().setQuality('medium'));
    await page.evaluate(() => { window.__cb.game.getState().setSpeed(0); });
    const info = await page.evaluate(`(${setup})(${JSON.stringify(s)})`);
    console.log(s.name, info);
    await page.evaluate(helpers);
    // let the world draw the gate house / cars / kit before the frame is read
    await page.evaluate(async () => { await window.__cb.qa.renderNow(); await window.__cb.qa.renderNow(); });
    console.log(' extra:', await page.evaluate(`(${extra})(${JSON.stringify(s)})`));
    await page.evaluate(async () => { await window.__cb.qa.renderNow(); await window.__cb.qa.renderNow(); });
    const vk = s.kind === 'bridge' ? 'bridge' : s.kind === 'yard' ? 'yard' : null;
    await page.evaluate(async ks => { window.__vh = {}; const m = await import('/src/game/props/vehicleGeometry.ts'); for (const k of ks) { const o = m.buildVehicle(k); o.userData.__mine = true; o.visible = false; window.__cb.ws.scene.add(o); window.__vh[k] = o; } }, ['pickup']);
    const views = vk === 'bridge' ? BRIDGE_VIEWS : vk === 'yard' ? YARD_VIEWS : s.kind === 'frame' ? [...COMMON, ...FRAME_VIEWS] : COMMON;
    for (const v of views) {
      if (process.env.VIEWONLY && !v.name.includes(process.env.VIEWONLY)) continue;
      await page.evaluate(v => {
        const { store, world } = window.__cb, st = store.getState();
        st.setTimeOfDay(v.time); st.setSeasonMode('summer'); st.setWeatherMode('clear');
        window.__cb.qa.pose = null; st.setBuildingView?.('full'); world.setEyeView?.(null);
        for (const o of Object.values(window.__vh)) o.visible = false;
      }, v);
      const run = k => page.evaluate(([body, k]) => { new Function('cb', 'k', body)(window.__cb, k); }, [v.setup, k]);
      // every candidate camera is tried; the one with the most room (no back faces, the nearest solid straight ahead or at the screen's edges farthest) is kept
      let chosen = 0, verdict = null, bestScore = -1e9;
      for (let k = 0; k < (v.n ?? 1); k++) {
        await run(k);
        await page.evaluate(async () => { await window.__cb.qa.renderNow(); });
        await run(k);
        await page.evaluate(async () => { await window.__cb.qa.renderNow(); });
        const vd = await page.evaluate(() => window.__chk()), score = Math.min(vd.minD, 1.2) - vd.back * 0.5 - vd.near * 0.3;
        if (score > bestScore) { bestScore = score; chosen = k; verdict = vd; }
        if (!v.n || (vd.back === 0 && vd.near === 0 && vd.minD >= 0.6)) break;
      }
      const bad = !!v.n && (verdict.back >= 4 || verdict.minD < 0.3 || verdict.near > 0);
      await run(chosen);
      if (process.env.DBGEVAL) { await page.evaluate(async () => { await window.__cb.qa.renderNow(); }); console.log('DBG', JSON.stringify(await page.evaluate(process.env.DBGEVAL))); }
      await page.evaluate(f => (f ? window.__cb.qa.renderFull('high') : window.__cb.qa.renderNow()), full);
      const file = `${out}/${String(++n).padStart(2, '0')}-${s.name}-${v.name}${full ? '-full' : ''}${bad ? '-INSIDE' : ''}.png`;
      await page.screenshot({ path: file });
      console.log(file, v.n ? `camera try ${chosen} at ${verdict.pos}: back-faces ${verdict.back}, touching ${verdict.near}, nearest ahead ${verdict.minD} ${verdict.minName}${verdict.back ? ' ' + JSON.stringify(verdict.names) : ''}${verdict.near ? ' ' + JSON.stringify(verdict.names) : ''}` : '');
      if (bad) inside.push(file);
    }
    await page.close();
  }
} finally { await browser.close(); vite.kill(); if (inside.length) console.log('CAMERA INSIDE GEOMETRY (no clear spot found):\n' + inside.join('\n')); setTimeout(() => process.exit(0), 200); }
