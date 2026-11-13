/** QA: marginal value of guards / dogs / cameras on top of wall + towers.  DEFENSE_EXTRAS=40 npx vitest run scripts/defenseExtras.test.ts */
import { describe, it } from 'vitest';
import { tierGame, TIER_CREWS, familyDeaths, type Extra } from '../src/sim/defenseTierKit';
import { planBattle } from '../src/sim/battle';
import type { Difficulty } from '../src/sim/difficulty';
const N = Number(process.env.DEFENSE_EXTRAS ?? 0);
const SETS: Array<[string, Extra[]]> = [['towers', []], ['+guards', ['guards']], ['+dogs', ['dogs']], ['+cameras', ['cameras']], ['+all', ['guards', 'dogs', 'cameras']]];
describe.skipIf(!N)('defense extras', () => {
  it('reports', () => {
    const diff = (process.env.DIFF ?? 'standard') as Difficulty;
    for (const [name, ex] of SETS) {
      let n = 0, held = 0, kept = 0, dead = 0;
      for (const [cn, crew] of Object.entries(TIER_CREWS)) { if (cn === 'overwhelming18') continue; for (let i = 0; i < N; i++) {
        const g = tierGame(1 + (i % 8), diff, 'wall_towers', ex);
        const b = planBattle(g, Math.round(crew.n * (diff === 'hardcore' ? 1.3 : diff === 'cozy' ? 0.7 : 1)), 100 + i, crew.o);
        n++; if (b.result === 'repelled' || b.result === 'fled') held++; if (b.result !== 'overrun') kept++; dead += familyDeaths(g, b);
      } }
      console.log(`${diff} ${name.padEnd(10)} held ${(100 * held / n).toFixed(1)}% kept ${(100 * kept / n).toFixed(1)}% dead ${(dead / n).toFixed(2)}`);
    }
  }, 600000);
});
