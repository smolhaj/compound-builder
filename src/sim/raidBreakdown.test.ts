/** The breakdown is read from the fight's own record: it must agree with the sim's result, in every tier. */
import { describe, expect, it } from 'vitest';
import { TIER_CREWS, TIER_NAMES, tierGame, familyDeaths } from './defenseTierKit';
import { planBattle } from './battle';
import { raidBreakdown } from './raidBreakdown';

describe('raid breakdown matches the sim', () => {
  it('agrees with result, deaths and the wall in every tier and crew', () => {
    let saw = 0, fortressLines = 0;
    for (const tier of TIER_NAMES) for (const [cn, c] of Object.entries(TIER_CREWS)) for (let i = 0; i < 6; i++) {
      const g = tierGame(1 + i, 'standard', tier);
      const b = planBattle(g, c.n, 300 + i, c.o);
      const bd = raidBreakdown(g, b)!;
      const tag = `${tier}/${cn}/${i}`;
      expect(bd, tag).not.toBeNull();
      expect(bd.result, tag).toBe(b.result);
      // every raider who went down is counted once, whoever dropped him
      const raiderDeaths = b.events.filter(e => e.kind === 'death' && e.unit.startsWith('r')).length;
      expect(bd.kills.total, tag).toBe(raiderDeaths);
      expect(bd.kills.towers + bd.kills.turrets + bd.kills.guards + bd.kills.family + bd.kills.dogs + bd.kills.bled, tag).toBe(raiderDeaths);
      // the family's dead are the report's dead; guards are counted apart
      expect(bd.familyKilled, tag).toBe(familyDeaths(g, b));
      expect(bd.familyKilled, tag).toBe(b.raid!.loss.people.killed);
      // the wall line says "held" exactly when the line was never passed (and there was a wall)
      const wall = bd.lines.find(l => l.layer === 'wall')!;
      if (tier === 'none') expect(wall.held, tag).toBe(false);
      else expect(wall.held, tag).toBe(!b.raid!.linePassed);
      // no guards or dogs line without guards or dogs; no tower kills without towers
      if (tier !== 'fortress') expect(bd.lines.some(l => l.layer === 'guards'), tag).toBe(false);
      if (tier === 'none' || tier === 'fence' || tier === 'stone_wall') expect(bd.kills.towers, tag).toBe(0);
      // the headline matches the result
      if (b.result === 'overrun') expect(bd.headline, tag).toMatch(/overran/);
      if (b.result === 'breached') expect(bd.headline, tag).toMatch(/yard/);
      if (b.result === 'repelled' || b.result === 'fled') expect(bd.headline, tag).toMatch(/held|drove|back/);
      expect(bd.lines.length, tag).toBeGreaterThan(2);
      saw++; if (tier === 'fortress') fortressLines += bd.lines.filter(l => l.layer === 'guards' || l.layer === 'cameras').length;
    }
    expect(saw).toBe(TIER_NAMES.length * Object.keys(TIER_CREWS).length * 6);
    expect(fortressLines).toBeGreaterThan(0);
  }, 90_000);

  it('a fortress credits towers or guards for kills somewhere; a bare lot never does', () => {
    let hi = 0, bareHi = 0;
    for (let i = 0; i < 12; i++) {
      const gf = tierGame(1 + (i % 8), 'standard', 'fortress'), bf = planBattle(gf, 8, 500 + i, TIER_CREWS.gang8.o);
      const kf = raidBreakdown(gf, bf)!.kills; hi += kf.towers + kf.guards + kf.turrets;
      const gb = tierGame(1 + (i % 8), 'standard', 'none'), bb = planBattle(gb, 8, 500 + i, TIER_CREWS.gang8.o);
      const kb = raidBreakdown(gb, bb)!.kills; bareHi += kb.towers + kb.guards;
    }
    expect(hi).toBeGreaterThan(0);
    expect(bareHi).toBe(0);
  }, 60_000);
});
