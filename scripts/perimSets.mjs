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
  { name: 'mat-berm-ditch', setup: around('earth_berm', 'rounded', `G.getState().wallProperty('ditch', geo, 'rounded');`), shots: [aerial(38, 0.6, 2.4), eyeWallPerson] },
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
    spanCam('eye-end-with-person', `const x = sp.a[0] - ux * 5, z = sp.a[1] - uz * 5; ${figure('(sp.a[0] - ux * 2.2)', '(sp.a[1] - uz * 2.2)')} cb.qa.pose = { x, y: gr(x, z) + 0.3, z, lx: sp.a[0], ly: gr(sp.a[0], sp.a[1]) + 0.3, lz: sp.a[1], fov: 62 };`),
    spanCam('eye-from-gorge-bed', `const x = mx - uz * 6, z = mz + ux * 6; cb.qa.pose = { x, y: gr(x, z) + 0.3, z, lx: mx, ly: gr(mx, mz) + 0.9, lz: mz, fov: 70 };`),
    spanCam('eye-door', `const x = sp.b[0] + ux * 4, z = sp.b[1] + uz * 4; cb.qa.pose = { x, y: gr(x, z) + 0.3, z, lx: sp.b[0], ly: gr(sp.b[0], sp.b[1]) + 0.35, lz: sp.b[1], fov: 62 };`),
  ] },
];

export const RING_SCENARIOS = [
  { name: 'rings-3-rounded', setup: ring({ shape: 'rounded', rings: 3, ringWall: 'stone_wall', towers: 3 }), shots: [aerial(46, 1.15), aerial(38, 0.5, 2.2), eyeWallPerson] },
  { name: 'rings-4-octagon', setup: ring({ shape: 'octagon', rings: 4, ringWall: 'container_stack', towers: 2 }), shots: [aerial(46, 1.15), aerial(38, 0.5, 2.2)] },
];
