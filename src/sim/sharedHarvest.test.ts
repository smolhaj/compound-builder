import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { CLASSIC } from './site';
import { dailyOf } from './daily';
import { seasons } from './regions';
import { regionFor } from './climate';
import { harvestHelpers, harvestShare, helpHands, inWindow, sharedHarvestDay, MAX_SHARE } from './sharedHarvest';
import type { Neighbor } from './encounters';
import { fieldHarvest } from './needs';
import { BLUEPRINTS } from './blueprints';

const inHarvest = (): GameState => {
  const g = newGame(3, 105, 2027, { site: CLASSIC });
  const H = seasons(regionFor(g.site)).harvest;
  g.clock.startDoy = H[0] + 3; g.clock.t = 0.5;
  return g;
};
const pactWith = (g: GameState, n: number): Neighbor[] => {
  const ns = g.neighbors.slice(0, n);
  g.locals = { ...(g.locals ?? { lives: {}, group: null, member: false, invited: false, pact: [], callout: null, workDay: -1, workHost: 'family', duty: null }), pact: ns.map(x => x.id) } as GameState['locals'];
  for (const x of ns) { x.status = 'home'; x.members = 4; x.disposition = 60; }
  return ns;
};

describe('the shared harvest', () => {
  it('nobody comes without a pact or outside the harvest window', () => {
    const g = inHarvest(); expect(inWindow(g)).toBe(true);
    expect(harvestHelpers(g)).toEqual([]); expect(harvestShare(g)).toBe(0);
    pactWith(g, 2);
    g.clock.startDoy = 20; expect(inWindow(g)).toBe(false); expect(harvestHelpers(g)).toEqual([]);
  });
  it('pact households send up to three hands each, and take 8 % apiece up to 16 %', () => {
    const g = inHarvest(); pactWith(g, 3);
    expect(harvestHelpers(g).length).toBe(3);
    expect(helpHands(g)).toBe(9);
    expect(harvestShare(g)).toBe(MAX_SHARE);
    const h = inHarvest(); pactWith(h, 1);
    expect(harvestShare(h)).toBeCloseTo(0.08);
  });
  it('their hours come off the harvest backlog and the neighbors warm to the family', () => {
    const g = inHarvest(); const ns = pactWith(g, 2);
    dailyOf(g).chores.levels.harvest = 90;
    const d0 = ns[0].disposition;
    sharedHarvestDay(g);
    expect(dailyOf(g).chores.levels.harvest).toBeLessThan(90 - 60);
    expect(ns[0].disposition).toBeGreaterThan(d0);
    dailyOf(g).chores.levels.harvest = 5; sharedHarvestDay(g);
    expect(dailyOf(g).chores.levels.harvest).toBe(0);
  });
  it('a hostile or absent household stays home', () => {
    const g = inHarvest(); const ns = pactWith(g, 2);
    ns[0].disposition = -5; ns[1].status = 'gone' as Neighbor['status'];
    expect(harvestHelpers(g)).toEqual([]);
  });
  it('the helpers take their share of the day\'s field crop', () => {
    const mk = () => { const g = inHarvest(); g.structures.push({ id: 'f1', kind: 'field', x: 20, z: 20, rot: 0, stage: BLUEPRINTS.field.stages.length, done: 0, supplied: true, finishedAt: 0 }); return g; };
    const alone = fieldHarvest(mk());
    const g = mk(); pactWith(g, 1);
    expect(alone).toBeGreaterThan(0);
    expect(fieldHarvest(g)).toBeCloseTo(alone * 0.92, 3);
  });
});
