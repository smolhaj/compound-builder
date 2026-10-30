const mode = m => `cb.qa.pose = null; cb.store.getState().setTerrainMode('${m}'); cb.cam.target.set(33.5, 0, 33.5); cb.cam.radius = 92; cb.cam.pitch = 1.1; cb.cam.yaw = 0.8;`;
export const TERRAIN_SCENARIOS = [
  { name: 'terrain-mw7', seed: 7, setup: 'window.__done = 1;', shots: ['high', 'lanes', 'water', 'sun'].map(m => ({ name: m, cam: mode(m) })) },
];
