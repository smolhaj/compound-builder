import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { acresOf, buyLand, buyProblem, HOME, landMarketDay, ownsAt, priceOf } from './land';

describe('buying land', () => {
  it('five neighboring forties on the survey grid, each owned by a neighbor; east is the road', () => {
    const g = newGame(1);
    expect(g.land.parcels.filter(p => !p.ring).length).toBe(5);
    for (const p of g.land.parcels.filter(q => !q.ring)) {
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
    expect(creek).toBeGreaterThan(grazing * 1.5);
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

describe('off-lot runs', () => {
  it('refuses a wall plan far off the parcel, accepts one on it, ignores nothing finite-wise', async () => {
    const { offLotProblem } = await import('./land');
    const { routeProblem } = await import('./terrainFx');
    const g = newGame(11);
    const h = g.site.home;
    const mid: [number, number] = [(h.x0 + h.x1) / 2, (h.z0 + h.z1) / 2];
    expect(offLotProblem(g, [mid, [mid[0] + 5, mid[1]]])).toBeNull();
    expect(offLotProblem(g, [mid, [mid[0] + 400, mid[1]]])).toMatch(/off your land/);
    expect(offLotProblem(g, [mid, [NaN, 0]])).toMatch(/not on the map/);
    expect(routeProblem(g, 'moat', [mid, [mid[0] + 400, mid[1]]])).toMatch(/off your land/);
    expect(routeProblem(g, 'moat', [mid, [mid[0] + 5, mid[1]]])).toBeNull();
  });
});

describe('the second ring of land', () => {
  it('sits beyond the first ring, costs 1.5x per acre, and is bought one forty at a time from the edge in', async () => {
    const { RING2_PRICE } = await import('./land');
    const g = newGame(4);
    const ring1 = g.land.parcels.filter(p => !p.ring), ring2 = g.land.parcels.filter(p => p.ring === 2);
    expect(ring1.length).toBe(5); expect(ring2.length).toBeGreaterThan(3);
    expect(new Set(g.land.parcels.map(p => p.id)).size).toBe(g.land.parcels.length);
    g.money = 50_000_000;
    for (const p of g.land.parcels) { p.forSale = true; const o = g.neighbors.find(n => n.id === p.owner); if (o) o.status = 'home'; }
    const far = ring2.find(p => p.name === 'the far north forty')!, near = ring1.find(p => p.name === 'the north forty')!;
    expect(buyProblem(g, far)).toMatch(/between first/);
    near.kind = 'grazing'; far.kind = 'grazing';
    const ratio = priceOf(g, far) / priceOf(g, near);
    expect(ratio).toBeGreaterThan(RING2_PRICE * 0.9); expect(ratio).toBeLessThan(RING2_PRICE * 1.1);
    buyLand(g, near.id); expect(buyProblem(g, far)).toBeNull();
  });
});
