import type { DomeTier } from './tiers';
import { place, opts } from '../raidTestKit';
import { planBattle } from '../battle';
const KIND: Record<DomeTier, string> = { earthen: 'dome_earthen', geodesic: 'dome_geodesic', glass: 'dome_glass', arcology: 'dome_arcology' };
/** Share of `seeds` Hardcore fights in which a crew of `n` with `means`, `lateDays` after the collapse, passes the shell of a dome of `tier` over the farmhouse. */
export function rate(tier: DomeTier, n: number, means: { truck: boolean; satchels: number }, lateDays: number, seeds = 40): number {
  let pass = 0;
  for (let i = 0; i < seeds; i++) {
    const g = place(1 + (i % 9), 'hardcore', 'armed'); g.structures.push({ id: 'dm', kind: KIND[tier], x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 }); g.perimeter = [];
    g.clock.t = Math.floor(g.disaster.hitAt + lateDays) + 0.5;
    const b = planBattle(g, n, 300 + i, { ...opts({ kind: 'gang', temper: 'hard', n }), means });
    if (b.raid?.linePassed) pass++;
  }
  return pass / seeds;
}
