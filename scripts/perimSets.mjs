/** Scenarios for scripts/perimShots.mjs: a finished compound per scenario, then camera shots (`cam` runs in the page with `cb`, `g0` = the game, `gr` = ground height). */
const finish = `G.setState(s => { const g = structuredClone(s.game);
      for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; }
      for (const st of g.structures) { st.stage = 5; st.supplied = false; st.finishedAt = 0; st.permit = 'ok'; }
      g.utilities.lit = ['x'];
      g.personState.slice(0, 3).forEach(ps => { ps.task = 'watch'; ps.target = null; });
      g.clock.t += 0.07;
      return { game: g }; });`;
/** Build the ring through the real action: `opts` are the fortify options; `extra` runs after the finish (page code). */
export const ring = (opts, extra = '') => `import('/src/store/worldStore.ts').then(m => {
    const G = cb.game, geo = m.useWorldStore.getState().siteGeo ?? {};
    G.getState().fortifyRing(geo, ${JSON.stringify({ towers: 5, towerKind: 'watchtower_wood', passage: false, ...opts })});
    ${finish}
    ${extra}
    window.__done = 1; });`;
const pre = `const g0 = cb.game.getState().game, gr = cb.world.groundAt, c = cb.world.camp; cb.qa.pose = null;`;
export const aerial = (r = 42, pitch = 1.0, yaw = 0.8) => ({ name: `aerial-${pitch > 0.8 ? 'top' : 'oblique'}`, cam: `${pre} cb.cam.target.set(c.x, 0, c.z); cb.cam.radius = ${r}; cb.cam.pitch = ${pitch}; cb.cam.yaw = ${yaw};` });
/** Eye level at the gate looking in, with a person (the family stands about the camp). */
export const eyeGate = { name: 'eye-gate', cam: `${pre} const gar = g0.structures.find(s => s.kind === 'gate_garage'); if (!gar) return; const inw = [[0, 1], [1, 0], [0, -1], [-1, 0]][gar.rot]; const x = gar.x - inw[0] * 6.5, z = gar.z - inw[1] * 6.5; cb.qa.pose = { x, y: gr(x, z) + 0.28, z, lx: gar.x, ly: gr(gar.x, gar.z) + 0.3, lz: gar.z, fov: 62 };` };
export const eyeGuard = { name: 'eye-person-on-deck', cam: `${pre} const ps = cb.world.family.positions().filter(p => g0.personState.slice(1, 3).some(q => q.id === p.id)); const gd = ps[0]; if (!gd) return; const d = Math.hypot(c.x - gd.x, c.z - gd.z) || 1; const x = gd.x + (c.x - gd.x) / d * 5, z = gd.z + (c.z - gd.z) / d * 5; cb.qa.pose = { x, y: gr(x, z) + 0.3, z, lx: gd.x, ly: gr(gd.x, gd.z) + 0.55, lz: gd.z, fov: 60 };` };

/** A person with the wall behind them: the camera stands behind the first family member looking out at the nearest wall point. */
export const eyeWallPerson = { name: 'eye-person-at-wall', cam: `${pre} const ps = cb.world.family.positions(); const p = ps[0]; if (!p) return; let best = null; for (const r of g0.perimeter) for (const q of r.pts) { const d = Math.hypot(q[0] - p.x, q[1] - p.z); if (!best || d < best.d) best = { d, x: q[0], z: q[1] }; } if (!best) return; const dx = (best.x - p.x) / (best.d || 1), dz = (best.z - p.z) / (best.d || 1); const x = p.x - dx * 3.2, z = p.z - dz * 3.2; cb.qa.pose = { x, y: gr(x, z) + 0.3, z, lx: p.x + dx * 4, ly: gr(best.x, best.z) + 0.3, lz: p.z + dz * 4, fov: 62 };` };
/** Wall my property round a compound of a shape, any kind (done through the real action). */
export const around = (kind, shape, extra = '') => `import('/src/store/worldStore.ts').then(m => {
    const G = cb.game, geo = m.useWorldStore.getState().siteGeo ?? {};
    G.getState().wallProperty('${kind}', geo, '${shape}');
    ${extra}
    ${finish}
    window.__done = 1; });`;

export const SCENARIOS = [
  ...['square', 'rounded', 'octagon', 'irregular'].map(shape => ({ name: `ring-${shape}`, setup: ring({ shape }), shots: [aerial(42, 1.1), aerial(40, 0.5, 2.2), eyeGate, eyeGuard] })),
  { name: 'mat-stone', setup: ring({ wall: 'stone_wall', shape: 'octagon' }), shots: [aerial(38, 0.6, 2.4), eyeWallPerson, eyeGuard] },
  { name: 'mat-stack-rust', setup: ring({ wall: 'container_stack', look: 'rust', shape: 'rounded' }), shots: [aerial(38, 0.6, 2.4), eyeWallPerson, eyeGate] },
  { name: 'mat-stack-mixed', setup: ring({ wall: 'container_stack', look: 'mixed' }), shots: [aerial(38, 0.6, 2.4), eyeWallPerson] },
  { name: 'mat-red', setup: ring({ wall: 'container_wall', look: 'red', shape: 'octagon' }), shots: [aerial(38, 0.6, 2.4), eyeWallPerson] },
  { name: 'mat-concrete', setup: ring({ wall: 'concrete_wall', shape: 'rounded' }), shots: [aerial(38, 0.6, 2.4), eyeWallPerson] },
  { name: 'mat-palisade', setup: around('log_palisade', 'rounded'), shots: [aerial(38, 0.6, 2.4), eyeWallPerson] },
  { name: 'mat-chainlink', setup: around('chain_link', 'octagon'), shots: [aerial(38, 0.6, 2.4), eyeWallPerson] },
  { name: 'mat-berm-ditch', settle: 6000, setup: around('earth_berm', 'rounded', `G.getState().wallProperty('ditch', geo, 'rounded');`), shots: [aerial(38, 0.6, 2.4), eyeWallPerson] },
];

/** The QA scale figure (a 1.7 m person) stood at a point. */
const figure = (x, z) => `{ const W = cb.world; const f = W._root.children.find(o => o.userData.type === 'scale_figure'); if (f) f.position.set(${x}, W.groundAt(${x}, ${z}), ${z}); }`;
/** A tunnel-bridge across the lot's gorge (the sim finds it) and, beside the camp, the ring. */
const bridgeSetup = (extra = '') => `Promise.all([import('/src/sim/terrainFx.ts'), import('/src/sim/terrainState.ts')]).then(([m, st]) => {
    const G = cb.game, g0 = G.getState().game, sp = m.gorgeSpan(g0);
    if (!sp) { console.error('NO GORGE'); window.__done = 1; return; }
    console.error('span', JSON.stringify(sp), 'problem', G.getState().planSpan('tunnel_bridge', sp.a, sp.b));
    ${extra}
    ${finish}
    window.__span = sp; window.__done = 1; });`;
const spanCam = (name, f) => ({ name, cam: `${pre} const sp = window.__span; if (!sp) return; const mx = (sp.a[0] + sp.b[0]) / 2, mz = (sp.a[1] + sp.b[1]) / 2, dx = sp.b[0] - sp.a[0], dz = sp.b[1] - sp.a[1], l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l; ${f}` });
export const BRIDGE_SCENARIOS = [
  { name: 'bridge', setup: bridgeSetup(), shots: [
    spanCam('aerial-top', `cb.cam.target.set(mx, 0, mz); cb.cam.radius = 34; cb.cam.pitch = 1.2; cb.cam.yaw = 0.8;`),
    spanCam('aerial-oblique', `cb.cam.target.set(mx, 0, mz); cb.cam.radius = 26; cb.cam.pitch = 0.45; cb.cam.yaw = Math.atan2(ux, uz) + 1.2;`),
    spanCam('eye-end-with-person', `const sx = -uz, sz = ux, x = sp.a[0] + sx * 6 - ux * 3, z = sp.a[1] + sz * 6 - uz * 3; ${figure('(sp.a[0] + sx * 1.8 - ux * 1.5)', '(sp.a[1] + sz * 1.8 - uz * 1.5)')} cb.qa.pose = { x, y: gr(x, z) + 0.3, z, lx: sp.a[0] + ux * 1.5, ly: gr(sp.a[0], sp.a[1]) + 0.5, lz: sp.a[1] + uz * 1.5, fov: 66 };`),
    spanCam('eye-from-gorge-bed', `const x = mx - uz * 6, z = mz + ux * 6; cb.qa.pose = { x, y: gr(x, z) + 0.3, z, lx: mx, ly: gr(mx, mz) + 0.9, lz: mz, fov: 70 };`),
    spanCam('eye-door', `const x = sp.b[0] + ux * 4, z = sp.b[1] + uz * 4; cb.qa.pose = { x, y: gr(x, z) + 0.3, z, lx: sp.b[0], ly: gr(sp.b[0], sp.b[1]) + 0.35, lz: sp.b[1], fov: 62 };`),
  ] },
];

/**
 * Tunnel use on the tunnel-bridge: the family sent across the gorge (every walk is routed to the far end for the shot, the way the people's route finding goes
 * through the bridge's doors), frozen with a person in the doorway and one inside the tube; and a car driven across, frozen in the open door. `use` runs in the page.
 */
const bridgeUseSetup = `Promise.all([import('/src/sim/terrainFx.ts')]).then(async ([m]) => {
    const G = cb.game, g0 = G.getState().game, sp = m.gorgeSpan(g0);
    if (!sp) { console.error('NO GORGE'); window.__done = 1; return; }
    console.error('span', JSON.stringify(sp), 'problem', G.getState().planSpan('tunnel_bridge', sp.a, sp.b));
    ${finish}
    window.__span = sp;
    const w = cb.world;
    await new Promise(r => setTimeout(r, 1200));
    w.corridors.sync(G.getState().game.perimeter); w.corridors.ensure(w.groundAt);
    const far = sp.b, near = sp.a;
    const orig = w._walkVia.bind(w);
    w._walkVia = (fx, fz, tx, tz) => orig(fx, fz, far[0], far[1]);
    const g = structuredClone(G.getState().game); g.personState.forEach((ps, i) => { ps.task = i % 2 ? 'watch' : 'garden'; ps.target = null; }); G.setState({ game: g });
    w.updatePeople(0.1, G.getState().game, 14, 1);
    for (const [id, a] of w.family._agents) { a.x = near[0] - (near[0] - far[0]) * 0.02 + 0.3 * Math.random(); a.z = near[1] - (near[1] - far[1]) * 0.02; a.via = []; a.viaFor = null; }
    const trace = [];
    let door = null, mid = null;
    const L = Math.hypot(far[0] - near[0], far[1] - near[1]);
    for (let i = 0; i < 6000 && !(door && mid); i++) {
      w.updatePeople(0.1, G.getState().game, 14, 1);
      for (const p of w.family.positions()) {
        if (p.y === null) continue;
        const d = Math.hypot(p.x - near[0], p.z - near[1]);
        if (!door && d > 0.8 && d < 1.6) door = { id: p.id, x: p.x, z: p.z, y: p.y };
        if (!mid && Math.abs(d - L / 2) < 0.8) mid = { id: p.id, x: p.x, z: p.z, y: p.y };
      }
      if (door && !mid) { /* keep walking to the middle */ }
      if (door && mid) break;
    }
    window.__use = { door, mid, steps: trace.length, span: sp, doors: w.corridors.corridors.map(c => c.id) };
    console.error('use', JSON.stringify(window.__use));
    window.__done = 1; });`;
const useCam = (name, f) => ({ name, cam: `${pre} const sp = window.__span; if (!sp) return; const u = window.__use || {}; const dx = sp.b[0] - sp.a[0], dz = sp.b[1] - sp.a[1], l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l; ${f}` });
export const BRIDGE_USE_SCENARIOS = [
  { name: 'bridge-use', setup: bridgeUseSetup, shots: [
    useCam('eye-person-in-the-door', `const p = u.door; if (!p) return; const x = p.x - ux * 3.2 - uz * 0.8, z = p.z - uz * 3.2 + ux * 0.8; cb.qa.pose = { x, y: gr(x, z) + 0.32, z, lx: p.x, ly: p.y + 0.18, lz: p.z, fov: 58 };`),
    useCam('aerial-bridge-doors-open', `cb.cam.target.set((sp.a[0] + sp.b[0]) / 2, 0, (sp.a[1] + sp.b[1]) / 2); cb.cam.radius = 22; cb.cam.pitch = 0.45; cb.cam.yaw = Math.atan2(ux, uz) + 1.2;`),
    useCam('eye-through-the-door', `const x = sp.a[0] - ux * 3.2 - uz * 0.5, z = sp.a[1] - uz * 3.2 + ux * 0.5; cb.qa.pose = { x, y: gr(x, z) + 0.3, z, lx: sp.a[0] + ux * 3, ly: gr(sp.a[0], sp.a[1]) + 0.5, lz: sp.a[1] + uz * 3, fov: 60 };`),
  ] },
];

/** Camera at a gate (the first matching `pick`) of a finished run: `back` units off its outside/inside, looking at the gate, a QA person beside it. */
const gateCam = (name, pick, back, side, fov = 62) => ({ name, cam: `${pre} let G0 = null; for (const r of g0.perimeter) { if (!r.finishedAt && r.finishedAt !== 0) continue; for (const g of r.gates) if (${pick}) { G0 = { r, g }; break; } if (G0) break; } if (!G0) return; let s = 0, pt = r0pt(G0.r, G0.g.at); function r0pt(r, at) { let d = 0; for (let i = 1; i < r.pts.length; i++) { const a = r.pts[i - 1], b = r.pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d + l >= at) { const f = (at - d) / l; return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, dx: (b[0] - a[0]) / l, dz: (b[1] - a[1]) / l }; } d += l; } const a = r.pts[r.pts.length - 1]; return { x: a[0], z: a[1], dx: 1, dz: 0 }; } const nx = -pt.dz * ${side}, nz = pt.dx * ${side}; const x = pt.x + nx * ${back}, z = pt.z + nz * ${back}; ${figure('(pt.x + nx * 1.4 + pt.dx * 1.0)', '(pt.z + nz * 1.4 + pt.dz * 1.0)')} cb.qa.pose = { x, y: gr(x, z) + 0.3, z, lx: pt.x, ly: gr(pt.x, pt.z) + 0.3, lz: pt.z, fov: ${fov} };` });
const towerCam = (name, kind, back, yawOff = 0.6) => ({ name, cam: `${pre} const t = g0.structures.find(s => s.kind === '${kind}'); if (!t) return; const x = t.x + Math.sin(${yawOff}) * ${back} * 0.3, z = t.z + Math.cos(${yawOff}) * ${back} * 0.3; ${figure('(t.x + Math.sin(' + yawOff + ' + 0.5) * 0.8)', '(t.z + Math.cos(' + yawOff + ' + 0.5) * 0.8)')} cb.qa.pose = { x, y: gr(x, z) + 0.3, z, lx: t.x, ly: gr(t.x, t.z) + 0.6, lz: t.z, fov: 62 };` });
export const GATE_SCENARIOS = [
  { name: 'gate-stone', setup: ring({ shape: 'rounded', wall: 'stone_wall', rings: 2, ringWall: 'stone_wall', ringSally: true, towers: 4, towerKind: 'watchtower_octagon' }), shots: [
    aerial(40, 1.1), aerial(32, 0.5, 2.2),
    gateCam('eye-gatehouse-with-person', '!g.sally && g.w >= 0.35', 7, 1),
    gateCam('eye-sally-with-person', 'g.sally', 5.5, 1, 58),
    towerCam('tower-octagon', 'watchtower_octagon', 9),
  ] },
  { name: 'gate-hex', setup: ring({ shape: 'octagon', wall: 'concrete_wall', rings: 2, ringWall: 'concrete_wall', ringSally: true, towers: 4, towerKind: 'watchtower_hex' }), shots: [
    gateCam('eye-sally-concrete', 'g.sally', 5.5, 1, 58), towerCam('tower-hex', 'watchtower_hex', 9),
  ] },
];

export const RING_SCENARIOS = [
  { name: 'rings-3-rounded', setup: ring({ shape: 'rounded', rings: 3, ringWall: 'stone_wall', towers: 3 }), shots: [aerial(46, 1.15), aerial(38, 0.5, 2.2), eyeWallPerson] },
  { name: 'rings-4-octagon', setup: ring({ shape: 'octagon', rings: 4, ringWall: 'container_stack', towers: 2 }), shots: [aerial(46, 1.15), aerial(38, 0.5, 2.2)] },
];

/** The motor court in front of the gate: a camera outside the gate looking in over the court, a QA person in it. */
const courtCam = (name, back, side, fov = 64, lift = 0.3) => ({ name, cam: `${pre} const ct = g0.structures.find(s => s.kind === 'motor_court'), ga = g0.structures.find(s => s.kind === 'gate_garage'); if (!ct) return; let dx = ct.x - (ga ? ga.x : c.x), dz = ct.z - (ga ? ga.z : c.z); const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; const nx = -dz, nz = dx; const x = ct.x + dx * ${back} + nx * ${side}, z = ct.z + dz * ${back} + nz * ${side}; ${figure('(ct.x + nx * 0.7 - dx * 0.1)', '(ct.z + nz * 0.7 - dz * 0.1)')} cb.qa.pose = { x, y: gr(x, z) + ${lift}, z, lx: ct.x, ly: gr(ct.x, ct.z) + 0.3, lz: ct.z, fov: ${fov} };` });
const courtAerial = (name, r, pitch, yaw) => ({ name, cam: `${pre} const ct = g0.structures.find(s => s.kind === 'motor_court'); if (!ct) return; cb.cam.target.set(ct.x, 0, ct.z); cb.cam.radius = ${r}; cb.cam.pitch = ${pitch}; cb.cam.yaw = ${yaw};` });
const courtExtra = `import('/src/sim/vehicles.ts').then(v => { cb.game.setState(s => { const g = structuredClone(s.game); g.money = 1e6; for (const k of ['suv', 'suv', 'atv', 'tractor', 'pickup', 'motorhome']) v.buyVehicle(g, k); return { game: g }; }); });
    import('/src/sim/razor.ts').then(r => { cb.game.setState(s => { const g = structuredClone(s.game); g.stock.wire = 9999; g.stock.hardware = 9999; for (const run of g.perimeter) if (!run.hostId) r.addRazor(g, run.id); return { game: g }; }); });`;
const razorOnly = `import('/src/sim/razor.ts').then(r => { cb.game.setState(s => { const g = structuredClone(s.game); g.stock.wire = 9999; g.stock.hardware = 9999; for (const run of g.perimeter) r.addRazor(g, run.id); return { game: g }; }); });`;
export const COURT_SCENARIOS = [
  { name: 'razor-stone', settle: 3500, setup: around('stone_wall', 'rounded', razorOnly), shots: [aerial(36, 0.6, 2.4), eyeWallPerson] },
  { name: 'razor-bar', settle: 3500, setup: around('bar_fence', 'rounded', razorOnly), shots: [aerial(36, 0.6, 2.4), eyeWallPerson] },
  { name: 'court-stone', settle: 5000, setup: ring({ shape: 'rounded', wall: 'stone_wall', motorCourt: true, towers: 3, passage: false }, courtExtra), shots: [
    courtAerial('aerial-top', 22, 1.2, 0.8), courtAerial('aerial-oblique', 18, 0.5, 2.4),
    courtCam('eye-court-with-person', 5.4, 1.2), courtCam('eye-court-inside', -0.2, 0.4, 70),
    eyeWallPerson,
  ] },
];

/** A workshop cut into a steep spot of a hillside lot with a drainage channel above it (the sim finds the spot and the line). */
const drainSetup = `Promise.all([import('/src/sim/lotListing.ts'), import('/src/sim/construction.ts'), import('/src/sim/drainage.ts'), import('/src/sim/perimeter.ts')]).then(([ll, cons, dr, per]) => {
    const G = cb.game;
    G.setState(s => { const g = structuredClone(s.game); const lot = ll.siteLot(g.site), h = g.site.home; let spot = null;
      if (lot) for (let x = h.x0 + 4; x < h.x1 - 4 && !spot; x += 2) for (let z = h.z0 + 4; z < h.z1 - 4 && !spot; z += 2) { const e = 0.8, gx = (lot.field.h(x + e, z) - lot.field.h(x - e, z)) / (2 * e), gz = (lot.field.h(x, z + e) - lot.field.h(x, z - e)) / (2 * e); if (Math.hypot(gx, gz) > 0.17) spot = [x, z]; }
      if (!spot) { console.error('NO STEEP SPOT'); return { game: g }; }
      const st = cons.planStructure(g, 'workshop', spot[0], spot[1], 0), line = dr.drainLineFor(g, st);
      if (line) per.planRun(g, 'drain_channel', line);
      window.__drain = { spot, line };
      return { game: g }; });
    ${finish}
    window.__done = 1; });`;
const drainCam = (name, f) => ({ name, cam: `${pre} const d = window.__drain; if (!d || !d.line) return; const mx = (d.line[0][0] + d.line[1][0]) / 2, mz = (d.line[0][1] + d.line[1][1]) / 2, sx = d.spot[0] - mx, sz = d.spot[1] - mz, sl = Math.hypot(sx, sz) || 1, ux = sx / sl, uz = sz / sl; ${f}` });
export const DRAIN_SCENARIOS = [
  { name: 'drain-hill', extra: '&lot=hillside&relief=11', settle: 4000, setup: drainSetup, shots: [
    drainCam('aerial-top', `cb.cam.target.set(d.spot[0], 0, d.spot[1]); cb.cam.radius = 16; cb.cam.pitch = 1.2; cb.cam.yaw = 0.8;`),
    drainCam('aerial-oblique', `cb.cam.target.set(d.spot[0], gr(d.spot[0], d.spot[1]), d.spot[1]); cb.cam.radius = 14; cb.cam.pitch = 0.4; cb.cam.yaw = Math.atan2(ux, uz) + 0.7;`),
    drainCam('eye-channel-with-person', `const x = mx + ux * 2.2 + (-uz) * 3.0, z = mz + uz * 2.2 + ux * 3.0; ${figure('(mx + (-uz) * 0.4)', '(mz + ux * 0.4)')} cb.qa.pose = { x, y: gr(x, z) + 0.3, z, lx: mx, ly: gr(mx, mz) + 0.1, lz: mz, fov: 64 };`),
  ] },
];
