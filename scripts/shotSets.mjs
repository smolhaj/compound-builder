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
