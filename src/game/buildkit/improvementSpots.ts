/**
 * Where the buildings that came with the land stand (the house beside the camp, the well and septic near it, the barn a little way off).
 * Pure: HomesteadWorld.siteImprovements calls it with the camp and what is already built, and the headless scene audit (src/sim/sceneAudit.ts) calls it
 * with the same query, so a placement bug found there is the one the player sees.
 */
import { placementProblem, KIT, type Placed, type SiteQuery } from './kit';
import { padClash } from './padRules';

export function improvementSpots(list: ReadonlyArray<{ id: string; kind: string }>, query: SiteQuery, camp: { x: number; z: number }, placed: Placed[], anchor?: { x: number; z: number }): Record<string, { x: number; z: number; rot: number }> {
  const out: Record<string, { x: number; z: number; rot: number }> = {};
  const order = ['farmhouse', 'trailer', 'timber_cabin', 'log_house', 'well_drilled', 'septic', 'barn'];
  const items = [...list].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  let house: { x: number; z: number } | null = null;
  for (const it of items) {
    const real = KIT[it.kind];
    if (!real) continue;
    // a cell (3 m) of yard all round, so nothing is built hard against anything else
    const def = { ...real, cellsX: real.cellsX + 2, cellsZ: real.cellsZ + 2 };
    // the house beside the camp; the well and septic near the house; the barn a little way off
    const c: { x: number; z: number } = house ?? anchor ?? { x: camp.x - 1.5, z: camp.z - 2.5 };
    const [r0, r1]: [number, number] = it.kind === 'barn' ? [6, 16] : anchor ? [2.5, 14] : house ? [2.5, 8] : [0, 8];
    let best: { x: number; z: number; rot: number } | null = null, bestD = Infinity;
    for (let r: number = r0; r <= r1 && !best; r += 0.5) {
      for (let a = 0; a < 24; a++) {
        const th = a / 24 * Math.PI * 2;
        const x: number = c.x + Math.cos(th) * r, z: number = c.z + Math.sin(th) * r;
        for (const rot of [0, 1]) {
          if (placementProblem(def, x, z, rot, query, placed)) continue;
          // (two graded pads must not cut into each other at different levels: the septic beside a farmhouse once buried its corner 3 m)
          if (padClash(def, x, z, rot, query.height, placed)) continue;
          // septic behind the house, away from the well
          const d = it.kind === 'septic' && house ? -Math.hypot(x - c.x, z - c.z) * 0.1 + (z > c.z ? 2 : 0) : r;
          if (d < bestD) { bestD = d; best = { x, z, rot }; }
        }
      }
    }
    if (!best) continue;
    out[it.id] = best;
    placed.push({ id: it.id, kind: it.kind, x: best.x, z: best.z, rot: best.rot });
    if (!house && ['farmhouse', 'trailer', 'timber_cabin', 'log_house'].includes(it.kind)) house = best;
  }
  return out;
}
