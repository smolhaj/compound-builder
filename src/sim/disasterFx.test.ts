import { describe, it, expect } from 'vitest';
import { FX, fxEncounterWeights, fxMedical, fxOnHit, fxPriceMod, fxSupplyMods, fxApplyServiceMods, columnsOf } from './disasterFx';
import { DISASTERS, SURPRISE_POOL, SURPRISE_BASE, surpriseKind, surpriseWeight, type DisasterKind } from './disaster';
import { REGIONS } from './regions';
import { newGame } from './state';
import type { EncounterKind } from './encounters';

const KINDS = Object.keys(DISASTERS) as DisasterKind[];
const hit = (kind: DisasterKind) => { const g = newGame(1, 105, 2027, { mode: 'scenario', peace: 'short', kind }); g.clock.t = g.disaster.hitAt + 1; return g; };

describe('the per-kind hook seam', () => {
  it('has a module for every kind, and every kind has a ruleset', () => {
    expect(KINDS.length).toBe(22);
    for (const k of KINDS) expect(FX[k], k).toBeDefined();
    expect(Object.keys(FX).sort()).toEqual([...KINDS].sort());
  });

  it('a stub kind changes nothing: price, service, climate and contagion are the identity', () => {
    for (const k of [] as DisasterKind[]) {   // (every kind now has its own behavior; the loop stays for a future placeholder)
      const g = hit(k), before = { ...g.disaster.tracks };
      expect(fxPriceMod(g)).toBe(1);
      expect(fxSupplyMods(g)).toEqual({ grow: 1, cold: 0 });
      expect(fxMedical(g)).toEqual({ contact: 0, spread: 0 });
      fxApplyServiceMods(g);
      expect(g.disaster.tracks).toEqual(before);
    }
  });

  it('the encounter mix moved behind the hooks, unchanged', () => {
    const p = { visibility: 50, fortress: 40 } as never;
    const mix = (k: DisasterKind) => { const g = hit(k); const w: Array<[EncounterKind, number]> = [['arrival', 30], ['refugees', 12], ['looters', 10], ['requisition', 10], ['trader', 10]]; fxEncounterWeights(g, w, p); return Object.fromEntries(w); };
    expect(mix('zombies')).toMatchObject({ horde: expect.closeTo(70, -2), trader: 2, refugees: 6, requisition: 0 });   // (WP4: 60 plus the crowd at the wall and the compound's light and noise)
    expect(mix('invasion')).toMatchObject({ patrol: 20 * (0.5 + 50 / 100), requisition: 0 });   // (WP3: the occupation's patrol weight)
    expect(mix('civil_war').militia).toBeCloseTo(25 * (0.4 + 0.4 + 50 / 150), 0);   // 25 at the hit, falling to 10 by month 6
    expect(mix('drought')).toMatchObject({ refugees: 12 * 1.6, looters: 13 });
    expect(mix('grid_down')).toMatchObject({ arrival: 30, trader: 10 });
  });

  it('contagion keeps its numbers; nuclear strikes through onHit', () => {
    expect(fxMedical(hit('bioweapon')).contact).toBeGreaterThan(0.2);   // (WP4: scaled by the wave clock and what the family does)
    expect(fxMedical(hit('pandemic')).contact).toBeGreaterThan(0.02);
    expect(fxOnHit(hit('mega_quake')).length).toBeGreaterThan(0);   // (the quake's own hit, sim/disasters/mega_quake.ts)
    expect(fxOnHit(hit('nuclear')).length).toBeGreaterThan(0);
  });
});

describe('the Surprise pool and regional odds', () => {
  it('holds the six pulpy kinds at rare base odds; none of the placeholders yet', () => {
    for (const k of ['zombies', 'invasion', 'civil_war', 'bioweapon', 'asteroid', 'unknown'] as DisasterKind[]) { expect(SURPRISE_POOL).toContain(k); expect(SURPRISE_BASE[k]!).toBeLessThan(0.25); }
    for (const k of ['emp', 'mega_quake', 'crop_blight', 'dam_flood', 'supervolcano'] as DisasterKind[]) expect(SURPRISE_POOL).not.toContain(k);
  });

  it('regions scale them: invasion likelier on coasts and borders, wildfire in the West', () => {
    expect(surpriseWeight('invasion', REGIONS.pnw.odds)).toBeGreaterThan(surpriseWeight('invasion', REGIONS.ozarks.odds) * 2);
    expect(surpriseWeight('invasion', REGIONS.desert.odds)).toBeGreaterThan(surpriseWeight('invasion', REGIONS.plains.odds));
    expect(surpriseWeight('wildfire', REGIONS.mountain_west.odds)).toBeGreaterThan(surpriseWeight('wildfire', REGIONS.new_england.odds));
  });

  it('rolling many Surprise runs reaches pulpy kinds, but rarely', () => {
    let n = 0, pulpy = 0;
    for (let i = 0; i < 4000; i++) { const k = surpriseKind((i + 0.5) / 4000); n++; if (DISASTERS[k]!.pulpy) pulpy++; }
    expect(pulpy / n).toBeGreaterThan(0.02);
    expect(pulpy / n).toBeLessThan(0.12);
  });

  it('every kind is selectable and its columns are known', () => {
    for (const k of KINDS) expect(columnsOf(k).length).toBeLessThanOrEqual(9);
  });
});
