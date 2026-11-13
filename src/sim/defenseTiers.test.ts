/**
 * Defense pays (docs/DECISIONS.md "Defense payoff"): the same family and stores behind five defense tiers, fought on the same seeds. More defense never
 * lowers the family's chance of keeping the house, each step up is worth a visible gap, the full fortress still falls to an overwhelming crew, Hardcore is
 * harsher than Standard and Standard than Cozy, and a bare lot is still survivable.
 */
import { describe, expect, it } from 'vitest';
import { TIER_CREWS, TIER_NAMES, tierGame, familyDeaths, type Tier } from './defenseTierKit';
import { planBattle } from './battle';
import type { Difficulty } from './difficulty';

const SEEDS = 24;
const SCALE: Record<Difficulty, number> = { cozy: 0.7, standard: 1, hardcore: 1.3 };
interface Row { kept: number; held: number; dead: number; n: number }
const cache = new Map<string, Row>();
function run(diff: Difficulty, tier: Tier, crews: readonly string[]): Row {
  const key = `${diff}|${tier}|${crews.join()}`;
  const hit = cache.get(key); if (hit) return hit;
  const row: Row = { kept: 0, held: 0, dead: 0, n: 0 };
  for (const cn of crews) for (let i = 0; i < SEEDS; i++) {
    const g = tierGame(1 + (i % 8), diff, tier), c = TIER_CREWS[cn];
    const b = planBattle(g, Math.round(c.n * SCALE[diff]), 100 + i, c.o);
    row.n++; if (b.result !== 'overrun') row.kept++; if (b.result === 'repelled' || b.result === 'fled') row.held++; row.dead += familyDeaths(g, b);
  }
  cache.set(key, row); return row;
}
const STD = ['looters6', 'gang8', 'militia8', 'savage10'];
const pct = (r: Row) => 100 * r.kept / r.n;

describe('defense payoff', () => {
  for (const diff of ['standard', 'hardcore'] as Difficulty[]) {
    it(`${diff}: each tier up keeps the house more often, by a visible gap`, () => {
      const p = TIER_NAMES.map(t => pct(run(diff, t, STD)));
      for (let i = 1; i < p.length; i++) expect(p[i], `${TIER_NAMES[i]} vs ${TIER_NAMES[i - 1]} (${p.map(x => x.toFixed(0)).join(', ')})`).toBeGreaterThanOrEqual(p[i - 1] + 8);
      expect(p[4] - p[0]).toBeGreaterThanOrEqual(45);
    }, 120_000);
  }
  it('standard: the fortress keeps most standard raids and costs far fewer lives, but an overwhelming crew still beats it half the time', () => {
    const bare = run('standard', 'none', STD), fort = run('standard', 'fortress', STD), over = run('standard', 'fortress', ['overwhelming18']);
    expect(pct(fort)).toBeGreaterThanOrEqual(85);
    expect(fort.dead / fort.n).toBeLessThan(0.6 * bare.dead / bare.n);
    expect(pct(over)).toBeLessThanOrEqual(65);
    expect(pct(over)).toBeGreaterThan(pct(run('standard', 'none', ['overwhelming18'])));
  }, 120_000);
  it('Hardcore is harsher than Standard, and Standard than Cozy, at every tier', () => {
    for (const t of TIER_NAMES) {
      const c = pct(run('cozy', t, STD)), s = pct(run('standard', t, STD)), h = pct(run('hardcore', t, STD));
      expect(c, `${t} cozy vs standard`).toBeGreaterThanOrEqual(s);
      expect(s, `${t} standard vs hardcore`).toBeGreaterThanOrEqual(h);
    }
  }, 120_000);
  it('a bare lot is still survivable (an armed family with nothing built keeps the house a real share of the time)', () => {
    expect(pct(run('standard', 'none', STD))).toBeGreaterThanOrEqual(15);
    expect(pct(run('hardcore', 'none', STD))).toBeGreaterThanOrEqual(10);
  }, 120_000);
});
