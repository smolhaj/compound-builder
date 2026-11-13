/**
 * Defense payoff table (off by default): survival of the same family at the same wealth behind five defense tiers, by difficulty and crew.
 *   DEFENSE_TIERS=60 DEFENSE_TIERS_OUT=/path/out.json npx vitest run scripts/defenseTiers.test.ts
 * "held" = repelled or fled (the line held or the crew gave up); "kept the house" = not overrun; dead = defenders killed per fight.
 */
import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { DEFENSE_TIERS, TIER_NAMES, TIER_CREWS, tierGame, familyDeaths } from '../src/sim/defenseTierKit';
import { planBattle } from '../src/sim/battle';
import type { Difficulty } from '../src/sim/difficulty';

const N = Number(process.env.DEFENSE_TIERS ?? 0);
describe.skipIf(!N)('defense tiers', () => {
  it('reports', () => {
    const out: Record<string, Record<string, number>> = {};
    for (const diff of ['cozy', 'standard', 'hardcore'] as Difficulty[]) for (const tier of TIER_NAMES) for (const [cn, crew] of Object.entries(TIER_CREWS)) {
      const c: Record<string, number> = { n: 0, repelled: 0, fled: 0, breached: 0, overrun: 0, dead: 0 };
      for (let i = 0; i < N; i++) {
        const g = tierGame(1 + (i % 8), diff, tier);
        const b = planBattle(g, Math.round(crew.n * (diff === 'hardcore' ? 1.3 : diff === 'cozy' ? 0.7 : 1)), 100 + i, crew.o);
        c.n++; c[b.result]++;
        c.dead += familyDeaths(g, b);
      }
      out[`${diff} | ${tier} | ${cn}`] = c;
    }
    void DEFENSE_TIERS;
    writeFileSync(process.env.DEFENSE_TIERS_OUT ?? '/tmp/claude-0/defense_tiers.json', JSON.stringify(out, null, 1));
  }, 900000);
});
