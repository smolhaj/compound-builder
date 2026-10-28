/** Shot lists for scripts/shots.mjs. Parcel is 0..67 on x/z; center ≈ 33.5. */
const C = 33.5;
const aerial = { x: C, z: C, yaw: 0.8, pitch: 0.55, radius: 95 };
const street = { x: C, z: C, yaw: 0.8, pitch: 0.12, radius: 2.2 };

export const SETS = {
  boundary: [
    { name: 'aerial-boundary-on', time: 12, cam: { ...aerial, yaw: 0.4, pitch: 0.9, radius: 130 }, setup: 'cb.store.getState().setShowBoundary(true)' },
  ],
  basic: [
    { name: 'aerial-noon', time: 12, cam: aerial },
    { name: 'aerial-golden', time: 18.5, cam: { ...aerial, yaw: -1.3, pitch: 0.35 } },
    { name: 'eye-level-morning', time: 9, cam: street },
    { name: 'aerial-night', time: 23, cam: aerial },
  ],
  terrain: [
    { name: 'aerial-parcel-summer', time: 11, season: 'summer', cam: { x: C, z: C, yaw: 0.6, pitch: 0.75, radius: 110 } },
    { name: 'aerial-west-to-range', time: 15, season: 'summer', cam: { x: C, z: C, yaw: Math.PI / 2 + 0.25, pitch: 0.28, radius: 70 } },
    { name: 'eye-level-creek', time: 10, season: 'summer', setup: "const z = cb.world.parcel.creek.zAt(36.5); cb.cam.target.set(36.5, 0, z + 4); cb.cam.yaw = -0.4; cb.cam.pitch = 0.08; cb.cam.radius = 2.4;", cam: { x: C, z: C, yaw: 0, pitch: 0.1, radius: 2.4 } },
    { name: 'aerial-golden-fall', time: 18.4, season: 'fall', cam: { x: C, z: C, yaw: -1.2, pitch: 0.4, radius: 90 } },
    { name: 'aerial-winter', time: 12, season: 'winter', cam: { x: C, z: C, yaw: 2.2, pitch: 0.55, radius: 100 } },
  ],
};

SETS.trees = [
  { name: 'aerial-parcel-summer', time: 11, season: 'summer', cam: { x: C, z: C, yaw: 0.6, pitch: 0.7, radius: 100 } },
  { name: 'eye-level-timber-edge', time: 10, season: 'summer', setup: "const p = cb.world.parcel; let best = null; for (let x = 6; x < 60; x += 2) for (let z = 6; z < 60; z += 2) { const s = p.sample(x, z); if (s.forest > 0.3 && s.forest < 0.5 && Math.abs(z - p.creek.zAt(x)) > 6) { best = [x, z]; break; } } if (best) { cb.cam.target.set(best[0], 0, best[1]); } cb.cam.yaw = 0.9; cb.cam.pitch = 0.1; cb.cam.radius = 3.5;", cam: { x: C, z: C, yaw: 0, pitch: 0.1, radius: 3 } },
  { name: 'eye-level-creek-cottonwoods', time: 16, season: 'summer', setup: "const z = cb.world.parcel.creek.zAt(30); cb.cam.target.set(30, 0, z); cb.cam.yaw = 1.57; cb.cam.pitch = 0.1; cb.cam.radius = 6;", cam: { x: C, z: C, yaw: 0, pitch: 0.1, radius: 6 } },
  { name: 'aerial-fall-aspens', time: 16.5, season: 'fall', cam: { x: C, z: C, yaw: -0.9, pitch: 0.45, radius: 75 } },
  { name: 'aerial-winter', time: 12, season: 'winter', cam: { x: C, z: C, yaw: 2.2, pitch: 0.5, radius: 90 } },
  { name: 'range-golden', time: 18.6, season: 'summer', cam: { x: C, z: C, yaw: Math.PI / 2 + 0.2, pitch: 0.2, radius: 60 } },
];

/** Eye level in the open meadow ~8 units from the timber edge, looking at it. */
const eyeTimber = "const p = cb.world.parcel; let best = null; for (let x = 6; x < 60 && !best; x += 1) for (let z = 6; z < 60; z += 1) { const s = p.sample(x, z); if (s.forest > 0.4 && s.forest < 0.6 && Math.abs(z - p.creek.zAt(x)) > 8) { best = [x, z]; break; } } const [tx, tz] = best ?? [33, 33]; const [ex, ez] = cb.world.openSpotNear(tx + 6, tz + 5, 2); cb.cam.placeEye(ex, ez, tx, tz);";
SETS.weather = [
  { name: 'aerial-late-summer-dry-grass', time: 11, doy: 235, cam: { x: C, z: C, yaw: 0.6, pitch: 0.6, radius: 95 } },
  { name: 'eye-level-rain', time: 14, weather: 'rain', season: 'summer', setup: eyeTimber, cam: { x: C, z: C, yaw: 0, pitch: 0.1, radius: 4 }, frames: 30 },
  { name: 'aerial-storm', time: 17, weather: 'storm', season: 'summer', cam: { x: C, z: C, yaw: Math.PI / 2 + 0.3, pitch: 0.3, radius: 70 }, frames: 30 },
  { name: 'eye-level-snowfall', time: 11, weather: 'snow', season: 'winter', setup: eyeTimber, cam: { x: C, z: C, yaw: 0, pitch: 0.1, radius: 4 }, frames: 30 },
  { name: 'aerial-fog-morning', time: 7.5, weather: 'fog', season: 'fall', cam: { x: C, z: C, yaw: 0.6, pitch: 0.4, radius: 80 }, frames: 30 },
  { name: 'aerial-spring', time: 10, season: 'spring', cam: { x: C, z: C, yaw: -0.6, pitch: 0.5, radius: 85 } },
];

/** Eye level on the creek bank, looking along the water. */
const eyeCreek = (x, side = 1, dir = 1) => `const p = cb.world.parcel; const z = p.creek.zAt(${x}); const [ex, ez] = cb.world.openSpotNear(${x}, z + ${side} * 2.2, 1.2); cb.cam.placeEye(ex, ez, ex + ${dir} * 6, p.creek.zAt(ex + ${dir} * 6), 0.3);`;
SETS.water = [
  { name: 'eye-level-creek-summer', time: 10, season: 'summer', setup: eyeCreek(30), cam: { x: C, z: C, yaw: 0, pitch: 0.1, radius: 4 } },
  { name: 'creek-low-aerial', time: 15, season: 'summer', setup: "const z = cb.world.parcel.creek.zAt(40); cb.cam.target.set(40, 0, z); cb.cam.yaw = 2.6; cb.cam.pitch = 0.45; cb.cam.radius = 14;", cam: { x: C, z: C, yaw: 0, pitch: 0.4, radius: 14 } },
  { name: 'eye-level-creek-golden', time: 18.6, season: 'fall', setup: eyeCreek(20, -1, 1), cam: { x: C, z: C, yaw: 0, pitch: 0.1, radius: 4 } },
  { name: 'creek-winter-ice', time: 12, season: 'winter', setup: "const z = cb.world.parcel.creek.zAt(28); cb.cam.target.set(28, 0, z); cb.cam.yaw = 0.4; cb.cam.pitch = 0.5; cb.cam.radius = 12;", cam: { x: C, z: C, yaw: 0, pitch: 0.5, radius: 12 } },
  { name: 'aerial-reservoir', time: 16, season: 'summer', cam: { x: 250, z: 230, yaw: 2.4, pitch: 0.4, radius: 260 } },
];

/** Aerial / eye-level at the nearest neighbor farm. */
const atFarm = (r, pitch, yaw) => `const f = cb.world.farms[0]; cb.cam.target.set(f.x, 0, f.z); cb.cam.radius = ${r}; cb.cam.pitch = ${pitch}; cb.cam.yaw = ${yaw};`;
SETS.farms = [
  { name: 'farmstead-aerial', time: 10, season: 'summer', setup: atFarm(40, 0.5, 0.8), cam: { x: C, z: C, yaw: 0, pitch: 0.5, radius: 40 } },
  { name: 'farmstead-golden', time: 18.4, season: 'fall', setup: atFarm(30, 0.25, -1.2), cam: { x: C, z: C, yaw: 0, pitch: 0.3, radius: 30 } },
  { name: 'farmstead-winter', time: 12, season: 'winter', setup: atFarm(35, 0.4, 2.2), cam: { x: C, z: C, yaw: 0, pitch: 0.4, radius: 35 } },
  { name: 'eye-level-toward-farm', time: 9, season: 'summer', setup: "const f = cb.world.farms[0]; const dx = f.x - 33.5, dz = f.z - 33.5, d = Math.hypot(dx, dz); const ex = f.x - dx / d * 24, ez = f.z - dz / d * 24; cb.cam.placeEye(ex, ez, f.x, f.z, 0.28);", cam: { x: C, z: C, yaw: 0, pitch: 0.1, radius: 4 } },
  { name: 'aerial-homestead-and-neighbors', time: 15, season: 'summer', cam: { x: 90, z: 60, yaw: 2.0, pitch: 0.55, radius: 230 } },
];

/** Place a cabin on the first valid spot 5–9 units from the creek, near the parcel center (door toward the creek). */
const placeCabin = `
  const w = cb.world, p = w.parcel; let done = cb.game.getState().game.structures.length > 0;
  for (let r = 0; r < 25 && !done; r += 1) for (let a = 0; a < 6.28 && !done; a += 0.5) {
    const x = 33 + Math.cos(a) * r, z0 = p.creek.zAt(x);
    for (const side of [1, -1]) {
      const z = z0 + side * 7;
      const rot = side > 0 ? 2 : 0;
      cb.game.getState().setTool('timber_cabin');
      cb.tool.hoverAt(x, z, rot);
      if (cb.game.getState().toolProblem === null) { cb.tool.placeHere(); done = true; break; }
    }
  }
  cb.game.getState().setTool(null);
  const s = cb.game.getState().game.structures[0]; window.__cabin = s;`;
const atCabin = (r, pitch, yaw) => placeCabin + `cb.cam.target.set(s.x, 0, s.z); cb.cam.radius = ${r}; cb.cam.pitch = ${pitch}; cb.cam.yaw = (s.rot * Math.PI / 2) + ${yaw};`;
const eyeCabin = (d, side) => placeCabin + `const q = s.rot * Math.PI / 2; const fx = Math.sin(q), fz = Math.cos(q); const sx = Math.cos(q), sz = -Math.sin(q); const ex = s.x + fx * ${d} + sx * ${side}, ez = s.z + fz * ${d} + sz * ${side}; const [px, pz] = cb.world.openSpotNear(ex, ez, 0.4); cb.cam.placeEye(px, pz, s.x, s.z, 0.26);`;
SETS.cabin = [
  { name: 'cabin-aerial', time: 10.5, season: 'summer', setup: atCabin(9, 0.45, 0.6), cam: { x: C, z: C, yaw: 0, pitch: 0.4, radius: 9 }, frames: 10 },
  { name: 'cabin-eye-level-porch', time: 9.5, season: 'summer', setup: eyeCabin(3.2, 1.2), cam: { x: C, z: C, yaw: 0, pitch: 0.1, radius: 3 }, frames: 10 },
  { name: 'cabin-golden-fall', time: 18.3, season: 'fall', setup: atCabin(6, 0.18, -0.9), cam: { x: C, z: C, yaw: 0, pitch: 0.2, radius: 6 }, frames: 10 },
  { name: 'cabin-night-windows', time: 21.5, season: 'fall', setup: eyeCabin(4, -1.5), cam: { x: C, z: C, yaw: 0, pitch: 0.1, radius: 4 }, frames: 10 },
  { name: 'cabin-winter', time: 12, season: 'winter', setup: atCabin(8, 0.35, 2.4), cam: { x: C, z: C, yaw: 0, pitch: 0.35, radius: 8 }, frames: 10 },
  { name: 'homestead-overview', time: 16, season: 'summer', setup: atCabin(45, 0.55, 0.7), cam: { x: C, z: C, yaw: 0, pitch: 0.5, radius: 45 }, frames: 10 },
  { name: 'cabin-ghost-red', time: 11, season: 'summer', setup: placeCabin + "cb.game.getState().setTool('timber_cabin'); cb.tool.hoverAt(s.x + 0.3, s.z + 0.3, 1); cb.cam.target.set(s.x, 0, s.z); cb.cam.radius = 7; cb.cam.pitch = 0.5; cb.cam.yaw = 0.5;", cam: { x: C, z: C, yaw: 0, pitch: 0.5, radius: 7 }, frames: 6 },
];

/** Stake out a cabin (placeCabin), order its materials, then run the sim until the given stage / fraction. */
const buildTo = (stage, frac) => placeCabin + `
  const G = cb.game.getState();
  if (!window.__ordered) { window.__ordered = true; G.order([{ material: 'fieldstone', qty: 6 }, { material: 'lumber', qty: 24 }, { material: 'roofing', qty: 8 }, { material: 'hardware', qty: 3 }]); }
  const want = ${stage} + ${frac};
  const at = () => { const st = cb.game.getState().game.structures[0]; const sg = [24, 40, 120, 60, 100]; return st.stage >= 5 ? 5 : st.stage + st.done / sg[st.stage]; };
  for (let i = 0; i < 4000 && at() < want; i++) cb.game.getState().advance(0.25 / 24);`;
const viewCabin = (r, pitch, yaw) => `cb.cam.target.set(s.x, 0, s.z); cb.cam.radius = ${r}; cb.cam.pitch = ${pitch}; cb.cam.yaw = (s.rot * Math.PI / 2) + ${yaw};`;
SETS.construction = [
  { name: 'stage-0-staked-out', time: 10, season: 'spring', setup: buildTo(0, 0.5) + viewCabin(5, 0.5, 0.7), cam: { x: C, z: C, yaw: 0, pitch: 0.5, radius: 5 }, frames: 8 },
  { name: 'stage-1-foundation', time: 10, season: 'spring', setup: buildTo(1, 0.6) + viewCabin(5, 0.45, 0.7), cam: { x: C, z: C, yaw: 0, pitch: 0.5, radius: 5 }, frames: 8 },
  { name: 'stage-2-framing', time: 11, season: 'spring', setup: buildTo(2, 0.55) + viewCabin(4.5, 0.35, 0.7), cam: { x: C, z: C, yaw: 0, pitch: 0.5, radius: 5 }, frames: 8 },
  { name: 'stage-3-roofing', time: 12, season: 'spring', setup: buildTo(3, 0.6) + viewCabin(6, 0.55, 0.7), cam: { x: C, z: C, yaw: 0, pitch: 0.5, radius: 5 }, frames: 8 },
  { name: 'stage-4-siding', time: 15, season: 'spring', setup: buildTo(4, 0.5) + viewCabin(4.5, 0.3, 0.7), cam: { x: C, z: C, yaw: 0, pitch: 0.5, radius: 5 }, frames: 8 },
  { name: 'stage-5-finished', time: 17.5, season: 'spring', setup: buildTo(5, 0) + viewCabin(5, 0.25, 0.7), cam: { x: C, z: C, yaw: 0, pitch: 0.5, radius: 5 }, frames: 8 },
];

/** Run the sim on to the next given hour (people shots: the view clock matches the sim). */
const toHour = (h) => `{ const G = cb.game; const hr = () => { const t = G.getState().game.clock.t; return ((t % 1) * 24 + 6) % 24; }; for (let i = 0; i < 200 && Math.abs(hr() - ${h}) > 0.13; i++) G.getState().advance(0.25 / 24); }`;
const atCamp = (r, pitch, yaw) => `const c = cb.world.camp; cb.cam.target.set(c.x, 0, c.z); cb.cam.radius = ${r}; cb.cam.pitch = ${pitch}; cb.cam.yaw = c.rot + ${yaw};`;
SETS.people = [
  { name: 'camp-morning-school', time: 9.5, season: 'spring', setup: toHour(9.5) + atCamp(3.2, 0.42, 0.5), cam: { x: C, z: C, yaw: 0, pitch: 0.4, radius: 3 }, frames: 40 },
  { name: 'camp-evening-fire', time: 20.5, season: 'spring', setup: toHour(20.5) + atCamp(2.6, 0.3, 0.3), cam: { x: C, z: C, yaw: 0, pitch: 0.3, radius: 3 }, frames: 40 },
  { name: 'builders-framing', time: 10.5, season: 'spring', setup: buildTo(2, 0.3) + toHour(10.5) + viewCabin(3.5, 0.35, 0.8), cam: { x: C, z: C, yaw: 0, pitch: 0.4, radius: 4 }, frames: 60 },
  { name: 'builders-eye-level', time: 14, season: 'spring', setup: buildTo(4, 0.2) + toHour(14) + "const q = s.rot * Math.PI / 2; const ex = s.x + Math.sin(q + 0.5) * 3.6, ez = s.z + Math.cos(q + 0.5) * 3.6; const [px, pz] = cb.world.openSpotNear(ex, ez, 0.5); cb.cam.placeEye(px, pz, s.x, s.z, 0.32);", cam: { x: C, z: C, yaw: 0, pitch: 0.1, radius: 4 }, frames: 60 },
  { name: 'homestead-overview-people', time: 15, season: 'spring', setup: atCamp(14, 0.6, 0.9), cam: { x: C, z: C, yaw: 0, pitch: 0.5, radius: 14 }, frames: 20 },
];

/** Order the cabin's materials and run the sim past delivery (stock lands in the yard). */
const stocked = "{ const G = cb.game; const st = G.getState(); st.order([{ material: 'lumber', qty: 24 }, { material: 'fieldstone', qty: 6 }, { material: 'roofing', qty: 8 }, { material: 'hardware', qty: 3 }]); G.getState().advance(2.2); }";
const load = "[{ material: 'lumber', qty: 8 }, { material: 'roofing', qty: 4 }]";
const atYard = (r, pitch, yaw) => `const y = cb.world.access.yard; cb.cam.target.set(y.x, 0, y.z); cb.cam.radius = ${r}; cb.cam.pitch = ${pitch}; cb.cam.yaw = ${yaw};`;
SETS.access = [
  { name: 'aerial-road-driveway-yard', time: 11, season: 'summer', setup: stocked + `cb.world.truck.qaHold(${load}, -1);` + "const a = cb.world.access; const g = a.gate; cb.cam.target.set((g.x + a.yard.x) / 2, 0, (g.z + a.yard.z) / 2); cb.cam.radius = 32; cb.cam.pitch = 0.65; cb.cam.yaw = 1.2;", cam: { x: C, z: C, yaw: 0, pitch: 0.6, radius: 30 }, frames: 12 },
  { name: 'eye-level-gate-truck-arriving', time: 9.5, season: 'summer', setup: `const T = cb.world.truck; T.qaHold(${load}, T.inLength - T.driveLength - 2.5);` + "const g = cb.world.access.gate; const [ex, ez] = cb.world.openSpotNear(g.x - 2.2, g.z - 1.6, 0.6); cb.cam.placeEye(ex, ez, g.x + 3, g.z - 1.5, 0.3);", cam: { x: C, z: C, yaw: 0, pitch: 0.1, radius: 4 }, frames: 12 },
  { name: 'truck-unloading-at-yard', time: 10.5, season: 'summer', setup: stocked + `cb.world.truck.qaHold(${load}, -1);` + atYard(3.2, 0.3, 2.3), cam: { x: C, z: C, yaw: 0, pitch: 0.3, radius: 3 }, frames: 12 },
  { name: 'stockpile-close', time: 15, season: 'summer', setup: stocked + atYard(2.2, 0.38, -0.6), cam: { x: C, z: C, yaw: 0, pitch: 0.4, radius: 2 }, frames: 12 },
  { name: 'county-road-golden', time: 18.5, season: 'fall', setup: "const g = cb.world.access.gate; cb.cam.target.set(g.x + 3, 0, g.z - 20); cb.cam.radius = 26; cb.cam.pitch = 0.22; cb.cam.yaw = Math.PI + 0.25;", cam: { x: C, z: C, yaw: 0, pitch: 0.2, radius: 26 }, frames: 12 },
];

/**
 * Woods at work near the yard: the 8 nearest parcel trees, marked; then two
 * felled, two bucked, two hauled (stumps), two still marked. Runs the sim to
 * work hours so someone is at a tree.
 */
const woods = (h) => `{ const W = cb.world, G = cb.game, y = W.access.yard;
  const near = W.treeSpecs.filter(t => t.x > 1 && t.z > 1 && t.x < 66 && t.z < 66).map(t => [Math.hypot(t.x - y.x, t.z - y.z), t]).sort((a, b) => a[0] - b[0]).slice(0, 8).map(e => e[1]);
  window.__woods = near;
  for (const t of near) G.getState().toggleMark({ id: t.id, x: t.x, z: t.z, kind: t.kind, scale: t.scale }, Math.hypot(t.x - y.x, t.z - y.z));
  G.setState(s => { const g = structuredClone(s.game); const J = g.forestry.jobs;
    J.slice(2, 4).forEach(j => { j.stage = 'felled'; }); J.slice(4, 6).forEach(j => { j.stage = 'bucked'; });
    for (const j of J.splice(6, 2)) { g.forestry.cleared.push(j.treeId); g.stock.logs += 3; g.stock.firewood += 1; }
    return { game: g }; });
  const hr = () => { const t = G.getState().game.clock.t; return ((t % 1) * 24 + 6) % 24; };
  for (let i = 0; i < 200 && Math.abs(hr() - ${h}) > 0.13; i++) { G.setState(s => ({ game: { ...s.game, forestry: { ...s.game.forestry, jobs: s.game.forestry.jobs.map(j => ({ ...j, done: 0 })) } } })); G.getState().advance(0.25 / 24); } }`;
const atTree = (k, r, pitch, yaw) => `const t = window.__woods[${k}]; cb.cam.target.set(t.x, 0, t.z); cb.cam.radius = ${r}; cb.cam.pitch = ${pitch}; cb.cam.yaw = ${yaw};`;
SETS.woods = [
  { name: 'aerial-woods-at-work', time: 10.5, season: 'summer', setup: woods(10.5) + atTree(2, 9, 0.75, 0.6), cam: { x: C, z: C, yaw: 0, pitch: 0.7, radius: 9 }, frames: 40 },
  { name: 'felling-a-marked-tree', time: 10.5, season: 'summer', setup: woods(10.5) + atTree(0, 4.5, 0.5, 2.2), cam: { x: C, z: C, yaw: 0, pitch: 0.3, radius: 2.6 }, frames: 60 },
  { name: 'felled-and-bucked', time: 14.5, season: 'summer', setup: woods(14.5) + atTree(4, 3.2, 0.42, -0.8), cam: { x: C, z: C, yaw: 0, pitch: 0.4, radius: 3.2 }, frames: 40 },
  { name: 'mark-tool-hover', time: 11, season: 'summer', setup: woods(11) + "cb.game.getState().setTool('fell'); const t0 = window.__woods[0]; cb.marker.hoverTree(cb.world.treeSpecs.filter(s => !window.__woods.includes(s)).sort((a, b) => Math.hypot(a.x - t0.x, a.z - t0.z) - Math.hypot(b.x - t0.x, b.z - t0.z))[0].id);" + atTree(0, 4, 0.5, 1.2), cam: { x: C, z: C, yaw: 0, pitch: 0.5, radius: 4 }, frames: 20 },
  { name: 'stumps-and-yard-logs', time: 16, season: 'fall', setup: woods(16) + "const y = cb.world.access.yard; cb.cam.target.set(y.x, 0, y.z); cb.cam.radius = 6; cb.cam.pitch = 0.5; cb.cam.yaw = 0.4;", cam: { x: C, z: C, yaw: 0, pitch: 0.5, radius: 6 }, frames: 30 },
];

/** Camera at a point inside the first building (local coords, y above the floor), looking at another. */
const inside = (ex, ey, ez, lx, ly, lz, fov = 66) => `{ const id = cb.game.getState().game.structures[0].id; const W = cb.world;
  const e = W.localToWorld(id, ${ex}, ${ey}, ${ez}), l = W.localToWorld(id, ${lx}, ${ly}, ${lz});
  cb.qa.pose = { x: e.x, y: e.y, z: e.z, lx: l.x, ly: l.y, lz: l.z, fov: ${fov} }; }`;
const view = (v) => `cb.store.getState().setBuildingView('${v}');`;
SETS.interiors = [
  { name: 'cabin-front-door-open', time: 10.5, season: 'summer', setup: buildTo(5, 0) + viewCabin(2.6, 0.18, 0.35), cam: { x: C, z: C, yaw: 0, pitch: 0.2, radius: 3 }, frames: 12 },
  { name: 'cutaway-day', time: 11, season: 'summer', setup: buildTo(5, 0) + view('cutaway') + viewCabin(2.6, 0.85, 0.5), cam: { x: C, z: C, yaw: 0, pitch: 0.8, radius: 3 }, frames: 12 },
  { name: 'xray-day', time: 11, season: 'summer', setup: buildTo(5, 0) + view('xray') + viewCabin(2.8, 0.6, -0.6), cam: { x: C, z: C, yaw: 0, pitch: 0.6, radius: 3 }, frames: 12 },
  { name: 'inside-main-room', time: 10, season: 'summer', setup: buildTo(5, 0) + inside(-0.12, 0.27, 0.62, 0.15, 0.12, -0.6), cam: { x: C, z: C, yaw: 0, pitch: 0.2, radius: 3 }, frames: 12 },
  { name: 'inside-kitchen-and-table', time: 16, season: 'summer', setup: buildTo(5, 0) + inside(0.3, 0.27, -0.2, -0.4, 0.13, -0.15), cam: { x: C, z: C, yaw: 0, pitch: 0.2, radius: 3 }, frames: 12 },
  { name: 'inside-bedroom', time: 9, season: 'summer', setup: buildTo(5, 0) + inside(0.09, 0.27, 0.66, 0.32, 0.06, 0.25), cam: { x: C, z: C, yaw: 0, pitch: 0.2, radius: 3 }, frames: 12 },
  { name: 'inside-loft', time: 14, season: 'summer', setup: buildTo(5, 0) + inside(0.02, 0.62, -0.13, 0.0, 0.47, -0.6), cam: { x: C, z: C, yaw: 0, pitch: 0.2, radius: 3 }, frames: 12 },
  { name: 'cutaway-night-lamplight', time: 21, season: 'fall', setup: buildTo(5, 0) + view('cutaway') + viewCabin(2.6, 0.8, 0.9), cam: { x: C, z: C, yaw: 0, pitch: 0.8, radius: 3 }, frames: 12 },
  { name: 'cabin-night-windows', time: 21.5, season: 'fall', setup: buildTo(5, 0) + viewCabin(3.2, 0.2, 0.6), cam: { x: C, z: C, yaw: 0, pitch: 0.2, radius: 3 }, frames: 12 },
];

/**
 * A small compound round the camp, every building finished (placed once per
 * page; each shot then frames one). window.__b[kind] = the placed record.
 */
const compound = `{ if (!window.__b) { window.__b = {};
  const G = cb.game, W = cb.world, c = W.camp;
  const plan = [['log_house', -4, -3, 0], ['timber_cabin', 3, -3.5, 0], ['workshop', 6, 2, 3], ['garden', -2, 4, 0], ['chicken_coop', 1.5, 4.5, 0], ['root_cellar', -6, 1.5, 1], ['outhouse', 4.5, -7, 0], ['field', -12, 6, 0]];
  for (const [kind, dx, dz, rot] of plan) {
    const sp = cb.tool.findSpot(kind, c.x + dx, c.z + dz, rot);
    if (!sp) continue;
    G.getState().plan(kind, sp[0], sp[1], rot);
    const st = G.getState().game.structures.at(-1);
    window.__b[kind] = st;
  }
  G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) { st.stage = 5; st.done = 0; st.finishedAt = 0; } return { game: g }; });
} }`;
const at = (kind, r, pitch, yaw) => `{ const b = window.__b['${kind}']; if (b) { cb.cam.target.set(b.x, 0, b.z); cb.cam.radius = ${r}; cb.cam.pitch = ${pitch}; cb.cam.yaw = b.rot * Math.PI / 2 + ${yaw}; } }`;
const inside2 = (kind, ex, ey, ez, lx, ly, lz, fov = 68) => `{ const b = window.__b['${kind}']; const W = cb.world;
  const e = W.localToWorld(b.id, ${ex}, ${ey}, ${ez}), l = W.localToWorld(b.id, ${lx}, ${ly}, ${lz});
  cb.qa.pose = { x: e.x, y: e.y, z: e.z, lx: l.x, ly: l.y, lz: l.z, fov: ${fov} }; }`;
const cut = "cb.store.getState().setBuildingView('cutaway');";
const D = { x: C, z: C, yaw: 0, pitch: 0.4, radius: 4 };
SETS.buildings = [
  { name: 'compound-aerial', time: 10.5, season: 'summer', setup: compound + "{ const c = cb.world.camp; cb.cam.target.set(c.x, 0, c.z); cb.cam.radius = 16; cb.cam.pitch = 0.75; cb.cam.yaw = 0.6; }", cam: D, frames: 20 },
  { name: 'log-house-glass-gable', time: 17.5, season: 'summer', setup: compound + at('log_house', 4.2, 0.2, 0.45), cam: D, frames: 12 },
  { name: 'log-house-cutaway', time: 12, season: 'summer', setup: compound + cut + at('log_house', 4, 0.9, 0.3), cam: D, frames: 12 },
  { name: 'log-house-great-room', time: 16, season: 'summer', setup: compound + inside2('log_house', 0.3, 0.29, 1.0, -0.45, 0.15, -1.0), cam: D, frames: 12 },
  { name: 'log-house-kitchen', time: 9, season: 'summer', setup: compound + inside2('log_house', -0.45, 0.29, -0.25, -0.3, 0.12, 1.0), cam: D, frames: 12 },
  { name: 'log-house-loft', time: 14, season: 'summer', setup: compound + inside2('log_house', 0.0, 0.85, -0.38, -0.1, 0.62, -1.1), cam: D, frames: 12 },
  { name: 'log-house-bath', time: 11, season: 'summer', setup: compound + inside2('log_house', 0.6, 0.36, 0.1, 0.3, 0.14, -0.32, 74), cam: D, frames: 12 },
  { name: 'workshop-exterior', time: 11, season: 'summer', setup: compound + at('workshop', 3.2, 0.22, 0.4), cam: D, frames: 12 },
  { name: 'workshop-cutaway', time: 13, season: 'summer', setup: compound + cut + at('workshop', 3.2, 0.95, 0.2), cam: D, frames: 12 },
  { name: 'workshop-inside', time: 15, season: 'summer', setup: compound + inside2('workshop', 0.3, 0.27, 0.75, -0.1, 0.12, -0.95), cam: D, frames: 12 },
  { name: 'root-cellar', time: 10, season: 'summer', setup: compound + at('root_cellar', 2.2, 0.25, 0.5), cam: D, frames: 12 },
  { name: 'root-cellar-cutaway', time: 11, season: 'summer', setup: compound + cut + at('root_cellar', 1.6, 0.85, 0.3), cam: D, frames: 12 },
  { name: 'coop-and-run', time: 9.5, season: 'summer', setup: compound + at('chicken_coop', 2.0, 0.4, 0.6), cam: D, frames: 12 },
  { name: 'garden', time: 15.5, season: 'summer', setup: compound + at('garden', 2.6, 0.55, -0.5), cam: D, frames: 12 },
  { name: 'field-plot', time: 16, season: 'summer', setup: compound + at('field', 7.5, 0.5, -0.4), cam: D, frames: 12 },
  { name: 'field-plot-eye', time: 17.5, season: 'summer', setup: compound + at('field', 3.2, 0.12, 0.25), cam: D, frames: 12 },
  { name: 'outhouse', time: 10, season: 'summer', setup: compound + at('outhouse', 1.4, 0.22, 0.5), cam: D, frames: 12 },
  { name: 'compound-night', time: 21.5, season: 'fall', setup: compound + "{ const c = cb.world.camp; cb.cam.target.set(c.x, 0, c.z); cb.cam.radius = 12; cb.cam.pitch = 0.45; cb.cam.yaw = 2.6; }", cam: D, frames: 20 },
];

/**
 * A perimeter round the sample compound: container wall (front), log
 * palisade (west), a grown thorn hedge (back), barbed + game fence (east),
 * a ditch and berm outside the front; gates wherever a line crosses the
 * driveway, plus a front gate. Everything finished; the hedge planted 6
 * years ago.
 */
const perimeter = compound + `{ if (!window.__perim) { window.__perim = true;
  const G = cb.game, W = cb.world, c = W.camp, R = 9.5, drive = W.access.drive;
  const near = (pts) => { const gates = []; let acc = 0; for (let i = 1; i < pts.length; i++) { const [ax, az] = pts[i - 1], [bx, bz] = pts[i], l = Math.hypot(bx - ax, bz - az); for (let s = 0; s < l; s += 0.1) { const x = ax + (bx - ax) * s / l, z = az + (bz - az) * s / l; if (drive.some(p => Math.hypot(p[0] - x, p[1] - z) < 0.35) && !gates.some(g => Math.abs(g.at - (acc + s)) < 1.2)) gates.push({ at: acc + s, w: 0.6 }); } acc += l; } return gates; };
  const x0 = c.x - R, x1 = c.x + R, z0 = c.z - R, z1 = c.z + R;
  const runs = [
    ['container_wall', [[x0, z1], [x1, z1]], [{ at: R, w: 0.6 }]],
    ['log_palisade', [[x0, z0], [x0, z1]], []],
    ['thorn_hedge', [[x0, z0], [x1, z0]], []],
    ['barbed_wire', [[x1, z0], [x1, c.z]], []],
    ['woven_wire', [[x1, c.z], [x1, z1]], []],
    ['ditch', [[x0 - 1.5, z1 + 1.6], [x1 + 1.5, z1 + 1.6]], [{ at: R + 1.5, w: 0.6 }]],
    ['earth_berm', [[x0 - 1.5, z1 + 2.6], [x1 + 1.5, z1 + 2.6]], [{ at: R + 1.5, w: 0.6 }]],
  ];
  for (const [kind, pts, gates] of runs) G.getState().planRun(kind, pts, [...gates, ...near(pts)]);
  G.setState(s => { const g = structuredClone(s.game); for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = g.clock.t - 6 * 365; } return { game: g }; });
} }`;
const sight = (m, eye) => `cb.store.getState().setSightMode('${m}');` + (eye ? `{ const c = cb.world.camp; cb.sight.set('viewshed', { x: c.x + ${eye[0]}, z: c.z + ${eye[1]}, eye: ${eye[2]} }); }` : '') + 'cb.sight.update(600000);';
const atCampV = (r, pitch, yaw) => `{ const c = cb.world.camp; cb.cam.target.set(c.x, 0, c.z); cb.cam.radius = ${r}; cb.cam.pitch = ${pitch}; cb.cam.yaw = ${yaw}; }`;
const eyeAt = (dx, dz, lx, lz, eye = 0.3) => `{ const c = cb.world.camp; cb.cam.placeEye(c.x + ${dx}, c.z + ${dz}, c.x + ${lx}, c.z + ${lz}, ${eye}); }`;
SETS.perimeter = [
  { name: 'aerial-walled-compound', time: 11, season: 'summer', setup: perimeter + atCampV(26, 0.8, 0.4), cam: D, frames: 20 },
  { name: 'container-wall-and-gate-eye-level', time: 10, season: 'summer', setup: perimeter + eyeAt(-3.2, 10.6, 0.3, 9.4), cam: D, frames: 14 },
  { name: 'ditch-and-berm', time: 16, season: 'summer', setup: perimeter + atCampV(7, 0.32, 0.5) + "{ const c = cb.world.camp; cb.cam.target.set(c.x + 4, 0, c.z + 11); }", cam: D, frames: 14 },
  { name: 'thorn-hedge-grown', time: 14, season: 'summer', setup: perimeter + eyeAt(2, -12, 0, -9.5), cam: D, frames: 14 },
  { name: 'palisade-from-inside', time: 15, season: 'fall', setup: perimeter + eyeAt(-6, -2, -9.5, 1.5), cam: D, frames: 14 },
  { name: 'barbed-and-game-fence', time: 9, season: 'summer', setup: perimeter + eyeAt(12, -2, 9.5, 2), cam: D, frames: 14 },
  { name: 'sightlines-from-road', time: 12, season: 'summer', setup: perimeter + sight('road') + atCampV(48, 1.0, 0.0), cam: D, frames: 10 },
  { name: 'sightlines-from-ridge', time: 12, season: 'summer', setup: perimeter + sight('ridge') + atCampV(48, 1.0, 0.0), cam: D, frames: 10 },
  { name: 'sightlines-night-lights', time: 21.5, season: 'summer', setup: perimeter + sight('night') + atCampV(48, 1.0, 0.0), cam: D, frames: 10 },
  { name: 'viewshed-from-tower', time: 12, season: 'summer', setup: perimeter + sight('viewshed', [9.5, 9.5, 1.7]) + atCampV(48, 1.0, 0.0), cam: D, frames: 10 },
];

/**
 * Water and power round the sample compound: drilled well + pump house,
 * cistern, water tower, septic; solar array, battery shed, generator shed;
 * buried lines joining them to the log house and cabin; both houses plumbed
 * and wired; a day of balance run.
 */
const utilities = compound + `{ if (!window.__util) { window.__util = true;
  const G = cb.game, W = cb.world, c = W.camp, lh = window.__b.log_house, cab = window.__b.timber_cabin;
  const place = (kind, dx, dz, rot = 0) => { const sp = cb.tool.findSpot(kind, c.x + dx, c.z + dz, rot); if (!sp) return null; G.getState().plan(kind, sp[0], sp[1], rot); const st = G.getState().game.structures.at(-1); window.__b[kind] = st; return st; };
  const well = place('well_drilled', -8, -1), cis = place('cistern', -7, -5), tower = place('water_tower', -9, 3), sep = place('septic', -2, -8);
  const sol = place('solar_array', 1, 8), bat = place('battery_shed', 4, 7), gen = place('generator_shed', 5, 9), hw = place('well_hand', 7, -2);
  G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) { st.stage = 5; st.done = 0; st.finishedAt = 0; } g.stock.fuel = 10; return { game: g }; });
  const pts = (...a) => a.filter(Boolean).map(st => [st.x, st.z]);
  G.getState().planRun('water_pipe', pts(well, tower, lh, cab), []);
  G.getState().planRun('water_pipe', pts(cis, lh), []);
  G.getState().planRun('water_pipe', pts(lh, sep), []);
  G.getState().planRun('power_cable', pts(sol, bat, gen), []);
  G.getState().planRun('power_cable', pts(bat, cab, lh, well), []);
  G.setState(s => { const g = structuredClone(s.game); for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = g.clock.t - 400; }
    for (const id of [lh.id, cab.id]) for (const kind of ['plumb', 'wire']) g.utilities.fittings.push({ building: id, kind, done: 40, hours: 40, supplied: true, finishedAt: 0 });
    return { game: g }; });
  G.getState().advance(1);
} }`;
SETS.utilities = [
  { name: 'aerial-water-and-power', time: 11, season: 'summer', setup: utilities + atCampV(22, 0.85, 0.3), cam: D, frames: 24 },
  { name: 'solar-array-and-battery-shed', time: 12.5, season: 'summer', setup: utilities + at('solar_array', 3.4, 0.38, 0.75), cam: D, frames: 14 },
  { name: 'battery-shed-cutaway', time: 13, season: 'summer', setup: utilities + cut + at('battery_shed', 1.2, 0.9, 0.3), cam: D, frames: 14 },
  { name: 'generator-shed', time: 15, season: 'summer', setup: utilities + at('generator_shed', 1.5, 0.3, 0.2), cam: D, frames: 14 },
  { name: 'water-tower-and-well-house', time: 10, season: 'summer', setup: utilities + at('water_tower', 3.2, 0.25, 0.6), cam: D, frames: 14 },
  { name: 'cistern', time: 16, season: 'summer', setup: utilities + at('cistern', 1.8, 0.3, 0.4), cam: D, frames: 14 },
  { name: 'pump-house-inside', time: 11, season: 'summer', setup: utilities + inside2('well_drilled', 0.1, 0.25, 0.12, -0.07, 0.1, -0.13, 74), cam: D, frames: 14 },
  { name: 'log-house-wired-kitchen-night', time: 21, season: 'fall', setup: utilities + inside2('log_house', -0.45, 0.29, -0.25, -0.3, 0.12, 1.0), cam: D, frames: 14 },
  { name: 'log-house-plumbed-bath', time: 11, season: 'summer', setup: utilities + inside2('log_house', 0.2, 0.29, 0.1, 0.6, 0.06, -0.35), cam: D, frames: 14 },
  { name: 'compound-night-electric', time: 21.5, season: 'fall', setup: utilities + atCampV(14, 0.45, 2.6), cam: D, frames: 20 },
];

/**
 * A bunker under the compound (hatch → tunnel → rooms → a stairwell out),
 * every room finished; and a second, smaller one being dug (an open pit,
 * walls going up). window.__b[kind] = the placed record.
 */
const bunker = compound + `{ if (!window.__bk) { window.__bk = true;
  const G = cb.game, W = cb.world, c = W.camp;
  const place = (key, kind, dx, dz, rot = 0) => { const sp = cb.tool.findSpot(kind, c.x + dx, c.z + dz, rot, 6); if (!sp) { console.warn('no spot', key); return null; } G.getState().plan(kind, sp[0], sp[1], rot); const st = G.getState().game.structures.at(-1); window.__b[key] = st; return st; };
  place('bunker_hatch', 'bunker_hatch', 0.25, -6.75);
  place('bunker_corridor', 'bunker_corridor', 1.0, -6.75, 1);
  place('bunker_galley', 'bunker_galley', 2.25, -6.5);
  place('bunker_dorm', 'bunker_dorm', 2.25, -7.75);
  place('bunker_stores', 'bunker_stores', 3.25, -6.5);
  place('bunker_plant', 'bunker_plant', 3.25, -7.75);
  place('bunker_medical', 'bunker_medical', 2.25, -5.5);
  place('bunker_comms', 'bunker_comms', 1.0, -5.75, 1);
  place('bunker_stairs', 'bunker_stairs', 4.25, -6.5, 1);
  // a second bunker being dug, out past the outhouse
  const h2 = place('hatch2', 'bunker_hatch', -9.25, -6.75);
  const ct = h2 && place('bunker_container', 'bunker_container', -8.25, -6.75, 1);
  const d2 = h2 && place('dig2', 'bunker_dorm', -9.0, -5.5);
  G.setState(s => { const g = structuredClone(s.game);
    for (const st of g.structures) { st.stage = 5; st.done = 0; st.finishedAt = 0; }
    const set = (rec, stage, f) => { const st = rec && g.structures.find(x => x.id === rec.id); if (st) { st.stage = stage; st.done = f * [6, 40, 140, 90, 60][stage]; st.supplied = true; st.finishedAt = null; } };
    if (ct) set(ct, 1, 0.9);
    if (d2) set(d2, 2, 0.7);
    if (h2) set(h2, 3, 0.2);
    return { game: g }; });
} }`;
const under = "cb.store.getState().setUnderground(true);";
const atB = (kind, r, pitch, yaw) => `{ const b = window.__b['${kind}']; if (b) { cb.cam.target.set(b.x, 0, b.z); cb.cam.radius = ${r}; cb.cam.pitch = ${pitch}; cb.cam.yaw = ${yaw}; } }`;
SETS.bunker = [
  { name: 'underground-view-aerial', time: 11, season: 'summer', setup: bunker + under + atB('bunker_galley', 7, 0.95, 0.5), cam: D, frames: 20 },
  { name: 'underground-view-close', time: 11, season: 'summer', setup: bunker + under + atB('bunker_dorm', 3.2, 0.8, 0.9), cam: D, frames: 14 },
  { name: 'surface-hatch-and-vents', time: 15, season: 'summer', setup: bunker + atB('bunker_hatch', 1.6, 0.3, 0.7), cam: D, frames: 14 },
  { name: 'surface-stairwell-headhouse', time: 16, season: 'summer', setup: bunker + atB('bunker_stairs', 2.2, 0.25, 1.9), cam: D, frames: 14 },
  { name: 'dig-open-and-walls-going-up', time: 13, season: 'summer', setup: bunker + atB('hatch2', 3.4, 0.6, 3.6), cam: D, frames: 16 },
  { name: 'bunkroom', time: 12, season: 'summer', setup: bunker + inside2('bunker_dorm', 0.3, 0.27, 0.3, -0.25, 0.1, -0.3, 74), cam: D, frames: 12 },
  { name: 'galley', time: 12, season: 'summer', setup: bunker + inside2('bunker_galley', 0.3, 0.27, 0.3, -0.25, 0.1, -0.3, 74), cam: D, frames: 12 },
  { name: 'plant-room', time: 12, season: 'summer', setup: bunker + inside2('bunker_plant', 0.3, 0.27, 0.3, -0.25, 0.1, -0.3, 74), cam: D, frames: 12 },
  { name: 'storeroom', time: 12, season: 'summer', setup: bunker + inside2('bunker_stores', -0.3, 0.27, 0.3, 0.25, 0.1, -0.3, 74), cam: D, frames: 12 },
  { name: 'hatch-vestibule-ladder', time: 12, season: 'summer', setup: bunker + inside2('bunker_hatch', 0.12, 0.2, 0.15, -0.02, 0.6, -0.05, 80), cam: D, frames: 12 },
  { name: 'stairwell-from-the-landing', time: 12, season: 'summer', setup: bunker + inside2('bunker_stairs', 0.0, 0.27, -0.66, 0.0, 0.6, 0.6, 74), cam: D, frames: 12 },
  { name: 'comms-and-armory', time: 12, season: 'summer', setup: bunker + inside2('bunker_comms', 0.1, 0.27, 0.35, -0.1, 0.12, -0.35, 80), cam: D, frames: 12 },
];

/**
 * The bunker plus an escape tunnel out of its plant room to a hidden exit:
 * the setup tries headings away from the camp and lays the first route the
 * rules allow (finished), and a second, shorter one from the dig site still
 * being trenched. window.__tun = { pts, exit, dir }.
 */
const tunnel = bunker + `{ if (!window.__tun) {
  const G = cb.game, W = cb.world, c = W.camp, b = window.__b;
  const from = b.bunker_plant ?? b.bunker_stores ?? b.bunker_dorm;
  // every heading and length the rules allow; keep the one whose exit is deepest in the trees
  let best = null;
  for (let k = 0; k < 36; k++) {
    const a = k * Math.PI * 2 / 36;
    const s = W.tunnelStartAt(from.x + Math.cos(a) * 0.45, from.z + Math.sin(a) * 0.45);
    if (!s.pt) continue;
    // a long way out (toward half a mile): straight, or with one bend; it may run on under the neighbors' land
    for (const L1 of [6, 12, 25, 45, 70]) for (const turn of [0, 0.5, -0.5, 0.9, -0.9]) for (const L2 of [6, 12, 20, 40, 65]) {
      const p0 = s.pt, p1 = [p0[0] + Math.cos(a) * 0.6, p0[1] + Math.sin(a) * 0.6], p2 = [p0[0] + Math.cos(a) * L1, p0[1] + Math.sin(a) * L1];
      const p3 = [p2[0] + Math.cos(a + turn) * L2, p2[1] + Math.sin(a + turn) * L2];
      const pts = (turn ? [p0, p1, p2, p3] : [p0, p1, [p0[0] + Math.cos(a) * (L1 + L2), p0[1] + Math.sin(a) * (L1 + L2)]]).map(p => [Math.round(p[0] * 4) / 4, Math.round(p[1] * 4) / 4]); pts[0] = p0;
      if (pts.some(p => p[0] < -60 || p[1] < -60 || p[0] > 127 || p[1] > 127)) continue;
      if (W.tunnelRouteProblem(pts)) continue;
      const e = pts[pts.length - 1], score = W.tunnelExitWoods(e[0], e[1]) * 3 + Math.min(L1 + L2, 135) * 0.01;
      if (!best || score > best.score) best = { pts, dir: Math.atan2(e[1] - pts[pts.length - 2][1], e[0] - pts[pts.length - 2][0]), dir0: a, score };
    }
  }
  if (!best) { console.warn('no tunnel route'); window.__tun = { pts: null }; } else {
    G.getState().planRun('escape_tunnel', best.pts, []);
    G.setState(s => { const g = structuredClone(s.game); for (const r of g.perimeter) if (r.kind === 'escape_tunnel') { r.done = r.hours; r.supplied = true; r.finishedAt = g.clock.t - 30; } return { game: g }; });
    window.__tun = { pts: best.pts, exit: best.pts[best.pts.length - 1], dir: best.dir, dir0: best.dir0 };
  }
} }`;
const atExit = (r, pitch, yaw) => `{ const t = window.__tun; if (t.pts) { cb.cam.target.set(t.exit[0], 0, t.exit[1]); cb.cam.radius = ${r}; cb.cam.pitch = ${pitch}; cb.cam.yaw = -t.dir - Math.PI / 2 + ${yaw}; } }`;
/** Camera along the tunnel: at distance `s` from the start, looking `ahead` further on (y above the tunnel floor). */
const inTunnel = (s, ahead, ey = 0.2, ly = 0.15, fov = 74) => `{ const t = window.__tun; if (t.pts) { const W = cb.world; const [a, b] = [t.pts[1], t.pts[2]]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
  const y = W.tunnelFloorAt(t.pts);
  cb.qa.pose = { x: a[0] + ux * ${s}, y: y + ${ey}, z: a[1] + uz * ${s}, lx: a[0] + ux * (${s} + ${ahead}), ly: y + ${ly}, lz: a[1] + uz * (${s} + ${ahead}), fov: ${fov} }; } }`;
SETS.tunnel = [
  { name: 'underground-view-tunnel', time: 11, season: 'summer', setup: tunnel + under + `{ const t = window.__tun; const m = t.pts ? [(t.pts[0][0] + t.exit[0]) / 2, (t.pts[0][1] + t.exit[1]) / 2] : [cb.world.camp.x, cb.world.camp.z]; const len = t.pts ? Math.hypot(t.exit[0] - t.pts[0][0], t.exit[1] - t.pts[0][1]) : 10; cb.cam.target.set(m[0], 0, m[1]); cb.cam.radius = Math.max(8, len * 0.62); cb.cam.pitch = 1.05; cb.cam.yaw = 0.4; }`, cam: D, frames: 20 },
  { name: 'barred-tunnel-door', time: 12, season: 'summer', setup: tunnel + `{ const t = window.__tun; if (t.pts) { const W = cb.world, [sx, sz] = t.pts[0], a = t.dir0, y = W.tunnelFloorAt(t.pts); cb.qa.pose = { x: sx - Math.cos(a) * 0.38, y: y + 0.27, z: sz - Math.sin(a) * 0.38, lx: sx, ly: y + 0.16, lz: sz, fov: 70 }; } }`, cam: D, frames: 12 },
  { name: 'inside-the-tunnel', time: 12, season: 'summer', setup: tunnel + inTunnel(0.4, 2.0), cam: D, frames: 12 },
  { name: 'exit-shaft-looking-up', time: 12, season: 'summer', setup: tunnel + `{ const t = window.__tun; if (t.pts) { const y = cb.world.tunnelFloorAt(t.pts, 1e9), [ex, ez] = t.exit, a = t.dir; cb.qa.pose = { x: ex - Math.cos(a) * 0.12, y: y + 0.2, z: ez - Math.sin(a) * 0.12, lx: ex + Math.cos(a) * 0.02, ly: y + 1.2, lz: ez + Math.sin(a) * 0.02, fov: 80 }; } }`, cam: D, frames: 12 },
  { name: 'hidden-exit-from-outside', time: 15, season: 'summer', setup: tunnel + atExit(1.1, 0.35, 0.5), cam: D, frames: 14 },
  { name: 'hidden-exit-eye-level', time: 15, season: 'summer', setup: tunnel + `{ const t = window.__tun; if (t.pts) { const [ex, ez] = t.exit, a = t.dir; const [px, pz] = cb.world.openSpotNear(ex + Math.cos(a) * 1.0 + Math.sin(a) * 0.5, ez + Math.sin(a) * 1.0 - Math.cos(a) * 0.5, 0.4); cb.cam.placeEye(px, pz, ex, ez, 0.28); } }`, cam: D, frames: 14 },
  { name: 'bunkroom-warm-light', time: 12, season: 'summer', setup: tunnel + inside2('bunker_dorm', 0.3, 0.27, 0.3, -0.25, 0.1, -0.3, 74), cam: D, frames: 12 },
];

/** The bunker with every room hardened (tier per upgrade; 3 = military / welded / overpressure / hardened shell). */
const hardened = (t) => bunker + `{ if (window.__hd !== ${t}) { window.__hd = ${t}; cb.game.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) if (st.kind.startsWith('bunker_') && st.finishedAt !== null) st.hardening = { fallout: ${t}, faraday: ${t}, nbc: ${t}, blast: ${t} }; return { game: g }; }); } }`;
SETS.hardening = [
  { name: 'bunkroom-tier2', time: 12, season: 'summer', setup: hardened(2) + inside2('bunker_dorm', 0.3, 0.27, 0.3, -0.25, 0.1, -0.3, 74), cam: D, frames: 12 },
  { name: 'bunkroom-tier3', time: 12, season: 'summer', setup: hardened(3) + inside2('bunker_dorm', 0.3, 0.27, 0.3, -0.25, 0.1, -0.3, 74), cam: D, frames: 12 },
  { name: 'galley-tier3-door', time: 12, season: 'summer', setup: hardened(3) + inside2('bunker_galley', -0.3, 0.27, -0.3, 0.25, 0.12, 0.3, 74), cam: D, frames: 12 },
  { name: 'stores-tier3', time: 12, season: 'summer', setup: hardened(3) + inside2('bunker_stores', -0.3, 0.27, 0.3, 0.25, 0.1, -0.3, 74), cam: D, frames: 12 },
  { name: 'cutaway-tier3', time: 11, season: 'summer', setup: hardened(3) + under + "cb.store.getState().setBuildingView('cutaway');" + atB('bunker_dorm', 2.6, 0.85, 0.9), cam: D, frames: 14 },
];

/** Nuclear war: strike the clock to `h` hours after the detonation (variant: distant / nearby / exchange). */
const nuke = (variant, h) => `{ const G = cb.game; G.setState(s => { const g = structuredClone(s.game); const d = g.disaster; d.kind = 'nuclear'; d.variant = '${variant}'; d.mode = 'sandbox'; d.phase = 'survival'; d.warnAt = d.hitAt = g.clock.t - ${h} / 24; d.back = {}; return { game: g }; }); }`;
const horizon = (time, yaw = 0) => `{ const W = cb.world, c = W.camp; cb.cam.placeEye(c.x + 2, c.z + 4, c.x + 2 + Math.sin(${yaw}) * 30, c.z + 4 - Math.cos(${yaw}) * 30, 0.28); }`;
SETS.nuclear = [
  { name: 'nearby-strike-minutes-after', time: 14, season: 'summer', setup: compound + nuke('nearby', 0.12) + horizon(14), cam: D, frames: 14 },
  { name: 'nearby-strike-hour-after', time: 15, season: 'summer', setup: compound + nuke('nearby', 1.2) + horizon(15), cam: D, frames: 14 },
  { name: 'distant-strikes-on-the-skyline', time: 10, season: 'summer', setup: compound + nuke('distant', 0.3) + horizon(10), cam: D, frames: 14 },
  { name: 'fallout-dust-falling', time: 13, season: 'summer', setup: compound + nuke('distant', 9) + horizon(13, 0.8), cam: D, frames: 16 },
  { name: 'sickly-sky-day-five', time: 12, season: 'summer', setup: compound + nuke('distant', 24 * 5) + `{ const c = cb.world.camp; cb.cam.target.set(c.x, 0, c.z); cb.cam.radius = 9; cb.cam.pitch = 0.35; cb.cam.yaw = 0.4; }`, cam: D, frames: 16 },
];

/** Land: the west forty bought (its trees become near, markable ones; survey pins at the corners). */
const buyWest = `{ const G = cb.game; G.setState(s => { const g = structuredClone(s.game); for (const p of g.land.parcels) if (p.rect.x0 < 0 && p.rect.z0 === 0) p.owner = 'you'; return { game: g }; }); }`;
SETS.land = [
  { name: 'home-place-before', time: 11, season: 'summer', setup: compound + `{ cb.cam.target.set(0, 0, 33); cb.cam.radius = 60; cb.cam.pitch = 0.9; cb.cam.yaw = 0.3; }`, cam: D, frames: 16 },
  { name: 'west-forty-bought', time: 11, season: 'summer', setup: compound + buyWest + `{ cb.cam.target.set(0, 0, 33); cb.cam.radius = 60; cb.cam.pitch = 0.9; cb.cam.yaw = 0.3; }`, cam: D, frames: 20 },
  { name: 'corner-pin', time: 15, season: 'summer', setup: compound + buyWest + `{ const W = cb.world; cb.cam.placeEye(-66.6, 2, -67, 0, 0.28); }`, cam: D, frames: 14 },
];

/** Landscape realism: in the timber, out on the open bench, along the creek, from the air. */
const eyeWhere = (pick) => `{ const p = cb.world.parcel; let best = null; for (let x = 6; x < 61 && !best; x += 1) for (let z = 6; z < 61; z += 1) { const s = p.sample(x, z), dz = Math.abs(z - p.creek.zAt(x)); if (${pick}) { best = [x, z]; break; } } const [x, z] = best ?? [33, 33]; const [ex, ez] = cb.world.openSpotNear(x, z, 1.1); cb.cam.placeEye(ex, ez, ex + 6, ez + 3, 0.28); }`;
SETS.landscape = [
  { name: 'in-the-timber', time: 10, season: 'summer', setup: eyeWhere('s.forest > 0.75 && dz > 10'), cam: D, frames: 16 },
  { name: 'open-bench', time: 16, season: 'summer', setup: eyeWhere('s.forest < 0.05 && dz > 18'), cam: D, frames: 16 },
  { name: 'creek-bank', time: 11, season: 'summer', setup: eyeWhere('dz > 2.5 && dz < 3.5 && s.forest > 0.3'), cam: D, frames: 16 },
  { name: 'aerial', time: 11, season: 'summer', setup: `{ cb.cam.target.set(33, 0, 33); cb.cam.radius = 70; cb.cam.pitch = 0.75; cb.cam.yaw = 0.6; }`, cam: D, frames: 20 },
];

/** Fresh plans, nothing started: the lime layout lines should read from the air. */
const planned = `{ if (!window.__p) { window.__p = 1;
  const G = cb.game, c = cb.world.camp;
  for (const [kind, dx, dz] of [['timber_cabin', 3, -3.5], ['garden', -2, 4], ['field', -12, 6], ['root_cellar', -6, 1.5]]) {
    const sp = cb.tool.findSpot(kind, c.x + dx, c.z + dz, 0);
    if (sp) G.getState().plan(kind, sp[0], sp[1], 0);
  }
} }`;
SETS.plans = [
  { name: 'plans-aerial', time: 11, season: 'summer', setup: planned + "{ const c = cb.world.camp; cb.cam.target.set(c.x - 3, 0, c.z + 1); cb.cam.radius = 20; cb.cam.pitch = 1.1; cb.cam.yaw = 0; }", cam: D, frames: 16 },
  { name: 'plans-oblique', time: 16, season: 'summer', setup: planned + "{ const c = cb.world.camp; cb.cam.target.set(c.x - 3, 0, c.z + 1); cb.cam.radius = 12; cb.cam.pitch = 0.5; cb.cam.yaw = 0.5; }", cam: D, frames: 16 },
];

SETS.darkrect = [
  { name: 'aerial-camp', time: 6.2, season: 'spring', setup: "{ const c = cb.world.camp; cb.cam.target.set(c.x, 0, c.z); cb.cam.radius = 22; cb.cam.pitch = 1.1; cb.cam.yaw = 0; }", cam: D, frames: 16 },
  { name: 'aerial-timber', time: 10, season: 'summer', setup: "{ const c = cb.world.camp; cb.cam.target.set(c.x, 0, c.z - 30); cb.cam.radius = 26; cb.cam.pitch = 1.05; cb.cam.yaw = 0; }", cam: D, frames: 16 },
  { name: 'aerial-camp-noon', time: 12, season: 'spring', setup: "{ const c = cb.world.camp; cb.cam.target.set(c.x, 0, c.z); cb.cam.radius = 22; cb.cam.pitch = 1.1; cb.cam.yaw = 0; }", cam: D, frames: 16 },
];

// bathrooms in the houses that have plumbing (farmhouse, manufactured home), seen from above in cutaway
const homes = `{ if (!window.__h) { window.__h = {};
  const G = cb.game, W = cb.world, c = W.camp;
  for (const [kind, dx, dz, rot] of [['farmhouse', -5, -2, 0], ['trailer', 5, -2, 0]]) {
    const sp = cb.tool.findSpot(kind, c.x + dx, c.z + dz, rot);
    if (!sp) continue;
    G.getState().plan(kind, sp[0], sp[1], rot);
    window.__h[kind] = G.getState().game.structures.at(-1);
  }
  G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) { st.stage = 5; st.done = 0; st.finishedAt = 0; } return { game: g }; });
} }`;
const top = kind => `{ const b = window.__h['${kind}']; if (b) { cb.cam.target.set(b.x, 0, b.z); cb.cam.radius = 3.4; cb.cam.pitch = 1.25; cb.cam.yaw = b.rot * Math.PI / 2; } }`;
SETS.baths = [
  { name: 'farmhouse-plan', time: 12, season: 'summer', setup: homes + cut + top('farmhouse'), cam: D, frames: 14 },
  { name: 'trailer-plan', time: 12, season: 'summer', setup: homes + cut + top('trailer'), cam: D, frames: 14 },
];

// the fence and wall upgrade chain, side by side: split-rail > barbed > woven > chain-link > wrought iron > iron + barbed > steel > electrified
const tiersSetup = `{ if (!window.__tiers) { window.__tiers = true;
  const G = cb.game, kinds = ['split_rail', 'barbed_wire', 'woven_wire', 'chain_link', 'wrought_iron', 'iron_barbed', 'steel_wall', 'electric_steel'];
  kinds.forEach((k, i) => G.getState().planRun(k, [[6 + i * 7, 54], [6 + i * 7 + 6, 54]], [], 0));
  G.setState(s => { const g = structuredClone(s.game); for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; } return { game: g }; });
} }`;
SETS.tiers = [
  { name: 'tiers-overview', time: 11, season: 'summer', setup: tiersSetup, cam: { x: 33, z: 54, yaw: 0.0, pitch: 0.3, radius: 42 }, frames: 16 },
  { name: 'tiers-low-1', time: 11, season: 'summer', setup: tiersSetup, cam: { x: 17, z: 54, yaw: 0.35, pitch: 0.14, radius: 7.5 }, frames: 12 },
  { name: 'tiers-low-2', time: 11, season: 'summer', setup: tiersSetup, cam: { x: 47, z: 54, yaw: 0.35, pitch: 0.14, radius: 7.5 }, frames: 12 },
];

// eye level (a person is ~0.28 tall): the fence tiers from the ground, and the creek barred
const eye = (x, z, lx, lz, dy = 0.26, ly = 0.2, fov = 62) => `{ const g = cb.world.groundAt; cb.qa.pose = { x: ${x}, y: g(${x}, ${z}) + ${dy}, z: ${z}, lx: ${lx}, ly: g(${lx}, ${lz}) + ${ly}, lz: ${lz}, fov: ${fov} }; }`;
SETS.defenses = [
  { name: 'eye-tiers-1-split-to-chainlink', time: 11, season: 'summer', setup: tiersSetup + eye(4, 52.2, 30, 54.4), cam: { x: 33, z: 54, yaw: 0, pitch: 0.3, radius: 20 }, frames: 12 },
  { name: 'eye-tiers-2-wrought-to-electric', time: 11, season: 'summer', setup: tiersSetup + eye(26, 52.2, 56, 54.4), cam: { x: 33, z: 54, yaw: 0, pitch: 0.3, radius: 20 }, frames: 12 },
  { name: 'eye-steel-and-electric-close', time: 11, season: 'summer', setup: tiersSetup + eye(42, 52.6, 52, 54.2, 0.22, 0.25, 58), cam: { x: 33, z: 54, yaw: 0, pitch: 0.3, radius: 20 }, frames: 12 },
  { name: 'eye-creek-bars', time: 11, season: 'summer', setup: `{ if (!window.__bars) { window.__bars = true; const G = cb.game, c = cb.world.parcel.creek, x = 20, z = c.zAt(x);
      G.getState().planRun('creek_bars', [[x, z - 2.6], [x, z + 2.6]], [], 0);
      G.setState(s => { const g = structuredClone(s.game); for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; } return { game: g }; }); } const g = cb.world.groundAt, c = cb.world.parcel.creek, z = c.zAt(20);
      cb.qa.pose = { x: 15.5, y: g(15.5, z - 3.2) + 0.3, z: z - 3.2, lx: 20, ly: g(20, z) + 0.15, lz: z + 0.4, fov: 62 }; }`, cam: { x: 33, z: 54, yaw: 0, pitch: 0.3, radius: 20 }, frames: 14 },
  { name: 'aerial-creek-bars', time: 11, season: 'summer', setup: `{ const c = cb.world.parcel.creek; cb.qa.pose = null; cb.cam.target.set(20, 0, c.zAt(20)); cb.cam.radius = 9; cb.cam.pitch = 0.7; cb.cam.yaw = 0.5; }`, cam: { x: 20, z: 40, yaw: 0.5, pitch: 0.7, radius: 9 }, frames: 12 },
];

// linked compounds: two walled yards joined by a covered steel walkway, an underground passage between them, a buried skirt and ground sensors
const linkedSetup = `{ if (!window.__linked) { window.__linked = true;
  const sq = (cx, cz, h) => [[cx - h, cz - h], [cx + h, cz - h], [cx + h, cz + h], [cx - h, cz + h], [cx - h, cz - h]];
  cb.game.setState(s => { const g = structuredClone(s.game);
    const done = (kind, pts) => { cb.__id = (cb.__id || 0) + 1; g.perimeter.push({ id: 'L' + cb.__id, kind, pts, gates: [], done: 1, hours: 1, supplied: true, finishedAt: 0 }); };
    for (const [id, x, z] of [['h1', 22, 40], ['h2', 46, 40]]) g.structures.push({ id, kind: 'farmhouse', x, z, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    done('container_wall', sq(22, 40, 8)); done('container_wall', sq(46, 40, 8));
    g.stock.ground_sensor = 2; g.utilities.lit = ['h1', 'h2'];
    return { game: g }; });
  // the walkway is planned through the sim, which cuts a doorway in each yard wall
  cb.game.getState().planRun('covered_walkway', [[30, 44], [38, 44]], [], 0);
  cb.game.getState().planRun('underground_passage', [[24, 37], [44, 37]], [], 0);
  cb.game.setState(s => { const g = structuredClone(s.game);
    for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; }
    g.perimeter.find(r => r.kind === 'container_wall').skirtAt = 0;
    return { game: g }; }); } cb.qa.pose = null; }`;
SETS.linked = [
  { name: 'linked-aerial-day', time: 12, season: 'summer', setup: linkedSetup + "cb.cam.target.set(34, 0, 41); cb.cam.yaw = 0.5; cb.cam.pitch = 0.6; cb.cam.radius = 34;", cam: { x: 34, z: 41, yaw: 0.5, pitch: 0.6, radius: 34 }, frames: 14 },
  { name: 'linked-walkway-close', time: 11, season: 'summer', setup: linkedSetup + "cb.cam.target.set(34, 0, 44); cb.cam.yaw = 0.6; cb.cam.pitch = 0.2; cb.cam.radius = 7;", cam: { x: 34, z: 44, yaw: 0.6, pitch: 0.2, radius: 7 }, frames: 14 },
  { name: 'linked-eye-inside-walkway', time: 21.5, season: 'summer', setup: linkedSetup + eye(31, 44, 38, 44, 0.22, 0.22, 70), cam: { x: 34, z: 44, yaw: 0, pitch: 0.2, radius: 7 }, frames: 14 },
  { name: 'linked-night-aerial', time: 21, season: 'summer', setup: linkedSetup + "cb.cam.target.set(34, 0, 44); cb.cam.yaw = 0.5; cb.cam.pitch = 0.3; cb.cam.radius = 11;", cam: { x: 34, z: 42, yaw: 0.3, pitch: 0.45, radius: 28 }, frames: 14 },
  { name: 'linked-underground-passage', time: 11, season: 'summer', setup: linkedSetup + under + "const gy = cb.world.groundAt(34, 37); cb.cam.target.set(30, 0, 37); cb.cam.yaw = 0.4; cb.cam.pitch = 0.85; cb.cam.radius = 8;", cam: { x: 34, z: 37, yaw: 0.4, pitch: 0.9, radius: 30 }, frames: 20 },
  { name: 'linked-underground-hatch-close', time: 11, season: 'summer', setup: linkedSetup + under + "cb.cam.target.set(24, 0, 37); cb.cam.yaw = 0.5; cb.cam.pitch = 0.8; cb.cam.radius = 4;", cam: { x: 24, z: 37, yaw: 0.5, pitch: 0.8, radius: 4 }, frames: 20 },
  { name: 'linked-skirt-and-sensor-close', time: 10, season: 'summer', setup: linkedSetup + eye(10, 36, 14, 40, 0.22, 0.1, 58), cam: { x: 14, z: 40, yaw: 0, pitch: 0.2, radius: 5 }, frames: 14 },
  { name: 'linked-doorway-outside', time: 11, season: 'summer', setup: linkedSetup + eye(34, 52, 30, 44, 0.24, 0.22, 64), cam: { x: 34, z: 44, yaw: 0, pitch: 0.2, radius: 7 }, frames: 14 },
  { name: 'linked-doorway-inside', time: 11, season: 'summer', setup: linkedSetup + eye(25, 44, 30, 44, 0.24, 0.22, 64), cam: { x: 30, z: 44, yaw: 0, pitch: 0.2, radius: 7 }, frames: 14 },
];

// a container wall on a slope near the camp, at eye level with the family in view: the plinth closes the gap under it
const wallSlope = `{ if (window.__wslope !== window.__wallKind) { window.__wslope = window.__wallKind; const c = cb.world.camp, g = cb.world.groundAt; let best = null, bd = -1;
    for (let k = 0; k < 8; k++) for (const sd of [-1, 1]) { const a = k * 0.39, cx = c.x + sd * 4 * Math.cos(a + 1.57), cz = c.z + sd * 4 * Math.sin(a + 1.57); const p0 = [cx - Math.cos(a) * 7, cz - Math.sin(a) * 7], p1 = [cx + Math.cos(a) * 7, cz + Math.sin(a) * 7]; let lo = 1e9, hi = -1e9; for (let i = 0; i <= 14; i++) { const h = g(p0[0] + (p1[0] - p0[0]) * i / 14, p0[1] + (p1[1] - p0[1]) * i / 14); lo = Math.min(lo, h); hi = Math.max(hi, h); } if (hi - lo > bd) { bd = hi - lo; best = [p0[0], p0[1], p1[0], p1[1], cx, cz]; } }
    window.__ws = best;
    cb.game.setState(s => { const gm = structuredClone(s.game); gm.perimeter = gm.perimeter.filter(r => !r.id.startsWith('W_')); gm.perimeter.push({ id: 'W_' + window.__wallKind, kind: window.__wallKind || 'container_wall', pts: [[best[0], best[1]], [best[2], best[3]]], gates: [], done: 1, hours: 1, supplied: true, finishedAt: 0 }); return { game: gm }; }); } }`;
// eye level on the camp side of the wall, looking across the camp (the family is between) at the wall
const wallEye = (kind) => `window.__wallKind = '${kind}'; ` + wallSlope + `{ const w = window.__ws, c = cb.world.camp, g = cb.world.groundAt; const dx = c.x - w[4], dz = c.z - w[5], d = Math.hypot(dx, dz) || 1; const ex = c.x + dx / d * 1.8, ez = c.z + dz / d * 1.8; cb.qa.pose = { x: ex, y: g(ex, ez) + 0.24, z: ez, lx: w[4], ly: g(w[4], w[5]) + 0.12, lz: w[5], fov: 66 }; }`;
SETS.walls = [
  { name: 'wall-slope-container-eye-person', time: 10, season: 'summer', setup: toHour(10) + wallEye('container_wall'), cam: { x: C, z: C, yaw: 0, pitch: 0.2, radius: 7 }, frames: 40 },
  { name: 'wall-slope-concrete-eye-person', time: 10, season: 'summer', setup: toHour(10) + wallEye('concrete_wall'), cam: { x: C, z: C, yaw: 0, pitch: 0.2, radius: 7 }, frames: 40 },
  { name: 'wall-slope-steel-eye-person', time: 10, season: 'summer', setup: toHour(10) + wallEye('steel_wall'), cam: { x: C, z: C, yaw: 0, pitch: 0.2, radius: 7 }, frames: 40 },
];
// a container wall being upgraded to steel: the steel rises beside the containers
SETS.upgrade = [
  { name: 'container-to-steel-upgrade', time: 11, season: 'summer', setup: `{ if (!window.__up) { window.__up = true; cb.game.setState(s => { const g = structuredClone(s.game); g.stock.rebar = 99; g.stock.concrete = 99; g.stock.hardware = 30; g.stock.wire = 30; g.perimeter.push({ id: 'C1', kind: 'container_wall', pts: [[20, 36], [48, 36]], gates: [], done: 1, hours: 1, supplied: true, finishedAt: 0 }); return { game: g }; }); cb.game.getState().upgradeRun('C1'); cb.game.setState(s => { const g = structuredClone(s.game); const u = g.perimeter.find(r => r.replaces); u.supplied = true; u.done = u.hours * 0.55; return { game: g }; }); } cb.qa.pose = null; cb.cam.target.set(34, cb.world.groundAt(34, 36), 36); cb.cam.yaw = 0.35; cb.cam.pitch = 0.4; cb.cam.radius = 9; }`, cam: { x: 30, z: 36, yaw: 0.5, pitch: 0.22, radius: 9 }, frames: 14 },
];

// the watch tower upgrade chain, side by side along z = 54: rise + lookout > wooden > concrete & steel > floodlights > manned mount > turret.
// A resident stands at the foot of each pair for scale (a person is ~0.28 tall); the upgrade in progress rises beside the old tier.
const TW = ['rise_lookout', 'watchtower_wood', 'watchtower_concrete', 'watchtower_flood', 'watchtower_mount', 'watchtower_turret'];
const towersSetup = (lit = false, mode = null, alert = false) => `{ if (!window.__tw) { window.__tw = true;
  const G = cb.game, kinds = ${JSON.stringify(TW)};
  G.setState(s => { const g = structuredClone(s.game);
    kinds.forEach((k, i) => g.structures.push({ id: 'tw' + i, kind: k, x: 8 + i * 6, z: 54, rot: 0, stage: 5, done: 0, supplied: false, finishedAt: 0 }));
    // the upgrade in progress: a wooden tower with the concrete one rising beside it, and a chain-link fence being upgraded
    g.structures.push({ id: 'up0', kind: 'watchtower_wood', x: 46, z: 54, rot: 0, stage: 5, done: 0, supplied: false, finishedAt: 0 });
    g.structures.push({ id: 'up1', kind: 'watchtower_concrete', x: 46.7, z: 54, rot: 0, stage: 3, done: 30, supplied: true, finishedAt: null, replaces: 'up0' });
    ${lit ? "g.utilities.lit = ['tw0'];" : ''}
    ${mode ? `g.lights = { mode: '${mode}', per: {}, alertUntil: ${alert ? 99999 : -1} };` : ''}
    return { game: g }; });
  G.getState().planRun('chain_link', [[40, 49], [52, 49]], [], 0);
  G.getState().planRun('wrought_iron', [[40, 49], [52, 49]], [], 0);
  G.setState(s => { const g = structuredClone(s.game); const [a, b] = g.perimeter.slice(-2); a.done = a.hours; a.supplied = true; a.finishedAt = 0; b.replaces = a.id; b.supplied = true; b.done = b.hours * 0.5; return { game: g }; });
} }`;
// someone standing at (x, z): a one-man playback through the battle store (no events), the scale reference
const stander = (x, z) => `{ import('/src/store/battleStore.ts').then(m => m.useBattleStore.getState().playBattle({ night: false, duration: 99999, events: [], units: [{ id: 'h_a', side: 'home', x: ${x}, z: ${z}, post: 'open' }] })); }`;
const noman = `{ import('/src/store/battleStore.ts').then(m => m.useBattleStore.getState().endBattle()); }`;
const cam0 = { x: 33, z: 54, yaw: 0, pitch: 0.3, radius: 20 };
const base = { season: 'summer', cam: cam0 };
SETS.towers = [
  { name: 'towers-aerial-chain', time: 11, ...base, setup: towersSetup() + `{ cb.qa.pose = null; cb.cam.target.set(26, 0, 54); cb.cam.radius = 34; cb.cam.pitch = 0.5; cb.cam.yaw = 0.15; }`, frames: 16 },
  { name: 'towers-aerial-low-tiers', time: 11, ...base, setup: towersSetup() + `{ cb.qa.pose = null; cb.cam.target.set(14, 0, 54); cb.cam.radius = 12; cb.cam.pitch = 0.45; cb.cam.yaw = 0.5; }`, frames: 14 },
  { name: 'towers-aerial-high-tiers', time: 11, ...base, setup: towersSetup() + `{ cb.qa.pose = null; cb.cam.target.set(32, 0, 54); cb.cam.radius = 12; cb.cam.pitch = 0.45; cb.cam.yaw = -0.5; }`, frames: 14 },
  { name: 'towers-eye-row', time: 11, ...base, setup: towersSetup() + stander(6.3, 54.9) + eye(4.2, 55.6, 30, 54, 0.28, 0.5, 70), frames: 14 },
  { name: 'towers-eye-rise-and-wood', time: 11, ...base, setup: towersSetup() + stander(9.3, 55.6) + eye(8.0, 58.2, 11.5, 54, 0.28, 0.45, 64), frames: 14 },
  { name: 'towers-eye-concrete-and-flood', time: 11, ...base, setup: towersSetup() + stander(22.6, 55.6) + eye(21, 58.4, 24, 54, 0.28, 0.7, 64), frames: 14 },
  { name: 'towers-eye-mount', time: 11, ...base, setup: towersSetup() + stander(33.1, 55.4) + eye(31.4, 57.4, 32, 54, 0.28, 1.0, 64), frames: 14 },
  { name: 'towers-eye-turret', time: 11, ...base, setup: towersSetup() + stander(39.1, 55.4) + eye(37.4, 57.4, 38, 54, 0.28, 1.05, 64), frames: 14 },
  { name: 'towers-night-floodlights', time: 22.5, ...base, setup: towersSetup(true) + noman + `{ cb.qa.pose = null; cb.cam.target.set(24, 0, 54); cb.cam.radius = 20; cb.cam.pitch = 0.22; cb.cam.yaw = 0.3; }`, frames: 18 },
  { name: 'towers-night-unpowered', time: 22.5, ...base, setup: towersSetup(false) + noman + `{ cb.qa.pose = null; cb.cam.target.set(24, 0, 54); cb.cam.radius = 20; cb.cam.pitch = 0.22; cb.cam.yaw = 0.3; }`, frames: 18 },
  { name: 'upgrade-beside-old', time: 11, ...base, setup: towersSetup() + noman + `{ cb.qa.pose = null; cb.cam.target.set(46, 0, 52); cb.cam.radius = 14; cb.cam.pitch = 0.5; cb.cam.yaw = 0.2; }`, frames: 14 },
  { name: 'upgrade-beside-old-eye', time: 11, ...base, setup: towersSetup() + stander(45.0, 55.6) + eye(43.6, 58.2, 46.4, 53, 0.28, 0.7, 62), frames: 14 },
];

// floodlight discipline: the same row at night in each mode (the motion sensor dark until a threat trips it, then lit)
const nightCam = `{ cb.qa.pose = null; cb.cam.target.set(34, 0, 54); cb.cam.radius = 14; cb.cam.pitch = 0.2; cb.cam.yaw = 0.3; }`;
SETS.lights = [
  { name: 'lights-day-sensor', time: 11, ...base, setup: towersSetup(true, 'sensor') + noman + nightCam, frames: 12 },
  { name: 'lights-night-always-on', time: 22.5, ...base, setup: towersSetup(true, 'on') + noman + nightCam, frames: 16 },
  { name: 'lights-night-sensor-idle', time: 22.5, ...base, setup: towersSetup(true, 'sensor', false) + noman + nightCam, frames: 16 },
  { name: 'lights-night-sensor-alert', time: 22.5, ...base, setup: towersSetup(true, 'sensor', true) + noman + nightCam, frames: 16 },
  { name: 'lights-night-off', time: 22.5, ...base, setup: towersSetup(true, 'off') + noman + nightCam, frames: 16 },
];

// the mounted gun and the turret: from above, and a staged fight (a gunner on the ring, the turret firing, raiders coming up from +z)
const fight = `{ const units = [{ id: 'h_a', side: 'home', x: 32, z: 54, y: 1.32, post: 'tower' }, { id: 't_x', side: 'home', x: 38, z: 54, y: 1.37, post: 'tower', machine: 'turret' },
  ...[0, 1, 2, 3, 4].map(i => ({ id: 'r' + i, side: 'raider', x: 29 + i * 3, z: 64 + (i % 2) * 2, post: 'open' }))];
  const events = []; for (let t = 0.3; t < 90; t += 0.12) { const r = 'r' + (Math.floor(t * 7) % 5); events.push({ t, kind: 'shot', from: 'h_a', to: r, hit: false, auto: true }); events.push({ t: t + 0.05, kind: 'shot', from: 't_x', to: 'r' + (Math.floor(t * 5) % 5), hit: false, auto: true }); }
  events.sort((a, b) => a.t - b.t);
  import('/src/store/battleStore.ts').then(m => m.useBattleStore.getState().playBattle({ night: false, duration: 99999, units, events })); }`;
SETS.mounts = [
  { name: 'mount-from-above', time: 11, ...base, setup: towersSetup() + noman + eye(32.5, 55.9, 32, 54, 2.7, 1.35, 55), frames: 12 },
  { name: 'turret-from-above', time: 11, ...base, setup: towersSetup() + noman + eye(38.5, 55.9, 38, 54, 2.7, 1.4, 55), frames: 12 },
  { name: 'mount-turret-from-ground', time: 11, ...base, setup: towersSetup() + noman + eye(35, 58.5, 35, 54, 0.28, 1.1, 66), frames: 12 },
  { name: 'mount-turret-fight', time: 11, ...base, setup: towersSetup() + fight + `{ cb.qa.pose = null; cb.cam.target.set(35, 0.6, 58); cb.cam.radius = 9; cb.cam.pitch = 0.3; cb.cam.yaw = 0.2; }`, frames: 20 },
];
