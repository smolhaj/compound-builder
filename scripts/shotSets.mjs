/** Shot lists for scripts/shots.mjs. Parcel is 0..67 on x/z; centre ≈ 33.5. */
const C = 33.5;
const aerial = { x: C, z: C, yaw: 0.8, pitch: 0.55, radius: 95 };
const street = { x: C, z: C, yaw: 0.8, pitch: 0.12, radius: 2.2 };

export const SETS = {
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

/** Aerial / eye-level at the nearest neighbour farm. */
const atFarm = (r, pitch, yaw) => `const f = cb.world.farms[0]; cb.cam.target.set(f.x, 0, f.z); cb.cam.radius = ${r}; cb.cam.pitch = ${pitch}; cb.cam.yaw = ${yaw};`;
SETS.farms = [
  { name: 'farmstead-aerial', time: 10, season: 'summer', setup: atFarm(40, 0.5, 0.8), cam: { x: C, z: C, yaw: 0, pitch: 0.5, radius: 40 } },
  { name: 'farmstead-golden', time: 18.4, season: 'fall', setup: atFarm(30, 0.25, -1.2), cam: { x: C, z: C, yaw: 0, pitch: 0.3, radius: 30 } },
  { name: 'farmstead-winter', time: 12, season: 'winter', setup: atFarm(35, 0.4, 2.2), cam: { x: C, z: C, yaw: 0, pitch: 0.4, radius: 35 } },
  { name: 'eye-level-toward-farm', time: 9, season: 'summer', setup: "const f = cb.world.farms[0]; const dx = f.x - 33.5, dz = f.z - 33.5, d = Math.hypot(dx, dz); const ex = f.x - dx / d * 24, ez = f.z - dz / d * 24; cb.cam.placeEye(ex, ez, f.x, f.z, 0.28);", cam: { x: C, z: C, yaw: 0, pitch: 0.1, radius: 4 } },
  { name: 'aerial-homestead-and-neighbours', time: 15, season: 'summer', cam: { x: 90, z: 60, yaw: 2.0, pitch: 0.55, radius: 230 } },
];

/** Place a cabin on the first valid spot 5–9 units from the creek, near the parcel centre (door toward the creek). */
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
  const plan = [['log_house', -4, -3, 0], ['timber_cabin', 3, -3.5, 0], ['workshop', 6, 2, 3], ['garden', -2, 4, 0], ['chicken_coop', 1.5, 4.5, 0], ['root_cellar', -6, 1.5, 1], ['outhouse', 4.5, -7, 0]];
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
  { name: 'container-wall-and-gate-eye-level', time: 10, season: 'summer', setup: perimeter + eyeAt(1.5, 13.5, 0, 9.5), cam: D, frames: 14 },
  { name: 'ditch-and-berm', time: 16, season: 'summer', setup: perimeter + atCampV(7, 0.32, 0.5) + "{ const c = cb.world.camp; cb.cam.target.set(c.x + 4, 0, c.z + 11); }", cam: D, frames: 14 },
  { name: 'thorn-hedge-grown', time: 14, season: 'summer', setup: perimeter + eyeAt(2, -12, 0, -9.5), cam: D, frames: 14 },
  { name: 'palisade-from-inside', time: 15, season: 'fall', setup: perimeter + eyeAt(-6, -2, -9.5, 1.5), cam: D, frames: 14 },
  { name: 'barbed-and-game-fence', time: 9, season: 'summer', setup: perimeter + eyeAt(12, -2, 9.5, 2), cam: D, frames: 14 },
  { name: 'sightlines-from-road', time: 12, season: 'summer', setup: perimeter + sight('road') + atCampV(48, 1.0, 0.0), cam: D, frames: 10 },
  { name: 'sightlines-from-ridge', time: 12, season: 'summer', setup: perimeter + sight('ridge') + atCampV(48, 1.0, 0.0), cam: D, frames: 10 },
  { name: 'sightlines-night-lights', time: 12, season: 'summer', setup: perimeter + sight('night') + atCampV(48, 1.0, 0.0), cam: D, frames: 10 },
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
