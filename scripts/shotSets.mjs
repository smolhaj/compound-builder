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
  const w = cb.world, p = w.parcel; let done = cb.game.getState().structures.length > 0;
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
  const s = cb.game.getState().structures[0]; window.__cabin = s;`;
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
