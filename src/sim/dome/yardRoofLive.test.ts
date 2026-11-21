import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from '../state';
import { BLUEPRINTS } from '../blueprints';
import { DOME_KIND, type DomeTier } from './tiers';
import { setLockdown, setYardRoof, stepDome, yardRoofOf } from './live';

const dome = (tier: DomeTier): GameState => {
  const g = newGame(5); g.money = 1e9;
  g.structures.push({ id: 'd0', kind: DOME_KIND[tier], x: 0, z: 0, rot: 0, stage: BLUEPRINTS[DOME_KIND[tier]].stages.length, done: 0, supplied: true, finishedAt: 0 });
  return g;
};

describe('the arcology plant yard roof in the live sim', () => {
  it('defaults closed, opens and vents when calm, and only on the arcology', () => {
    const g = dome('arcology');
    expect(yardRoofOf(g)).toBe('closed');
    expect(setYardRoof(g, 'vent')).toBeNull(); expect(yardRoofOf(g)).toBe('vent');
    expect(setYardRoof(g, 'open')).toBeNull(); expect(yardRoofOf(g)).toBe('open');
    expect(setYardRoof(g, 'closed')).toBeNull(); expect(yardRoofOf(g)).toBe('closed');
    expect(setYardRoof(dome('glass'), 'open')).toMatch(/arcology/);
  });
  it('refuses to open in lockdown, in fallout and in a flood, and closes itself when one begins', () => {
    const g = dome('arcology');
    expect(setLockdown(g, true)).toBeNull();
    expect(setYardRoof(g, 'open')).toMatch(/lockdown/);
    expect(setLockdown(g, false)).toBeNull();
    expect(setYardRoof(g, 'open')).toBeNull();
    setLockdown(g, true);
    stepDome(g, 0.25 / 24);
    expect(yardRoofOf(g)).toBe('closed');
    setLockdown(g, false); g.domes = g.domes ?? {}; 
    expect(setYardRoof(g, 'open')).toBeNull();
    g.disaster.kind = 'nuclear'; g.disaster.hitAt = -1; g.clock.t = 0.5; g.disaster.variant = 'distant';
    expect(yardRoofOf(g)).toBe('closed');
    expect(setYardRoof(g, 'vent')).toMatch(/Fallout|ash|smoke/i);
    const out = stepDome(g, 0.25 / 24).join(' ');
    expect(out).toMatch(/closed itself|roof/i);
    g.disaster.kind = 'dam_flood'; g.disaster.hitAt = 0; g.clock.t = 1;
    expect(setYardRoof(g, 'open')).toMatch(/flood|hazard/i);
  });
});
