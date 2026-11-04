const mode = m => `cb.qa.pose = null; cb.store.getState().setTerrainMode('${m}'); cb.cam.target.set(33.5, 0, 33.5); cb.cam.radius = 92; cb.cam.pitch = 1.1; cb.cam.yaw = 0.8;`;
export const TERRAIN_SCENARIOS = [
  { name: 'terrain-mw7', seed: 7, setup: 'window.__done = 1;', shots: ['high', 'lanes', 'water', 'sun'].map(m => ({ name: m, cam: mode(m) })) },
];
/** Fire overlay: a cabin, a workshop and a coop finished on the camp, then the Fire mode from above. */
const finishAll = `const G = cb.game, c = cb.world.camp;
  const A = G.getState();
  A.plan('timber_cabin', c.x, c.z, 0); A.plan('workshop', c.x + 7, c.z + 2, 0); A.plan('chicken_coop', c.x - 6, c.z + 3, 0);
  G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) { st.stage = 5; st.supplied = false; st.finishedAt = 0; st.permit = 'ok'; } return { game: g }; });
  window.__done = 1;`;
export const FIRE_SCENARIO = { name: 'fire-mw7', seed: 7, setup: finishAll, shots: [
  { name: 'aerial', cam: `cb.qa.pose = null; cb.store.getState().setTerrainMode('fire'); const c = cb.world.camp; cb.cam.target.set(c.x, 0, c.z); cb.cam.radius = 30; cb.cam.pitch = 1.0; cb.cam.yaw = 0.8;` },
] };
TERRAIN_SCENARIOS.push(FIRE_SCENARIO);
