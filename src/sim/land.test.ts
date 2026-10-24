import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { acresOf, buyLand, buyProblem, HOME, landMarketDay, ownsAt, priceOf } from './land';

describe('buying land', () => {
  it('five neighboring forties on the survey grid, each owned by a neighbor; east is the road', () => {
    const g = newGame(1);
    expect(g.land.parcels.length).toBe(5);
    for (const p of g.land.parcels) {
      expect(acresOf(p.rect)).toBe(40);
      expect(g.neighbors.some(n => n.id === p.owner)).toBe(true);
      expect(p.rect.x0).toBeLessThan(HOME);                 // nothing east of the road
    }
  });

  it('owners sell when they like you or the land is up for sale; corners need the forty beside them first', () => {
    const g = newGame(2);
    g.money = 10_000_000;
    const west = g.land.parcels.find(p => p.name.includes('west forty') && !p.name.includes('north') && !p.name.includes('south'))!;
    const nw = g.land.parcels.find(p => p.name.includes('northwest'))!;
    const owner = g.neighbors.find(n => n.id === west.owner)!;
    owner.disposition = -40;
    expect(buyProblem(g, west)).toMatch(/won't sell/);
    west.forSale = true;
    expect(buyProblem(g, nw)).toMatch(/between first/);
    expect(buyLand(g, west.id)).toBeNull();
    expect(ownsAt(g, -10, 30)).toBe(true);
    nw.forSale = true;
    expect(buyProblem(g, nw)).toBeNull();
  });

  it('land is priced by what it is, dearer when the owner is sore, and spikes in the warning signs', () => {
    const g = newGame(3, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
    const p = g.land.parcels[0];
    p.kind = 'grazing'; const grazing = priceOf(g, p);
    p.kind = 'creek_bottom'; const creek = priceOf(g, p);
    expect(creek).toBeGreaterThan(grazing * 3);
    g.clock.t = g.disaster.hitAt - 1;
    expect(priceOf(g, p)).toBeGreaterThan(creek * 1.8);
  });

  it('every so often in peacetime a parcel comes up for sale', () => {
    const g = newGame(4);
    let up = 0;
    for (let d = 0; d < 3 * 365; d++) if (landMarketDay(g, d)) up++;
    expect(up).toBeGreaterThan(0);
    expect(up).toBeLessThan(10);
  });
});
