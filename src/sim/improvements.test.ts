import { describe, expect, it } from 'vitest';
import { CLASSIC, listings, RAW, rollImprovements, sitePrice, type Site } from './site';
import { REGION_IDS } from './regions';
import { newGame } from './state';
import { step } from './engine';
import { placeOrder } from './economy';
import { driveQuote, hookupProblem, orderHookup, placeImprovements, powerQuote, roofLoss, sound, type Improvements } from './improvements';
import { fitProblem, plant, serviceOf } from './utilities';
import { mulberry32 } from './rng';
import { hireCrew } from './crews';

const improved = (imp: Partial<Improvements>): Site => ({ ...CLASSIC, improvements: { ...RAW, power: true, drive: true, driveFt: 400, ...imp } });
const farmhouse = (roof: 'good' | 'fair' | 'poor', wiring: 'good' | 'fair' | 'poor', plumbing: 'good' | 'fair' | 'poor') =>
  improved({ house: { kind: 'farmhouse', built: 1948, roof, wiring, plumbing }, well: { pump: 'good' }, septic: { field: 'good' } });
const placed = (site: Site, seed = 3) => {
  const g = newGame(seed, 105, 2027, { site, grid: true });
  const spots: Record<string, { x: number; z: number; rot: number }> = {};
  g.structures.filter(x => x.unplaced).forEach((st, i) => { spots[st.id] = { x: 30 + i * 6, z: 30, rot: 0 }; });
  placeImprovements(g, spots);
  return g;
};

describe('what comes with the land', () => {
  it('about two in five listings come with a house; raw land has nothing but a quote for the line and the drive', () => {
    let withHouse = 0, n = 0;
    for (const region of REGION_IDS) for (let seed = 1; seed < 40; seed++) for (const l of listings(seed, region)) {
      n++;
      const i = l.improvements;
      if (i.house) { withHouse++; expect(i.power && i.drive).toBe(true); }
      else { expect(i.power || i.drive || i.well || i.septic || i.barn).toBeFalsy(); expect(i.poleFt).toBeGreaterThan(0); expect(i.driveFt).toBeGreaterThan(0); }
    }
    expect(withHouse / n).toBeGreaterThan(0.3);
    expect(withHouse / n).toBeLessThan(0.6);
    // the filter
    for (const l of listings(9, 'plains', { acres: 'any', water: 'any', timber: 'any', town: 'any', built: 'raw' })) expect(l.improvements.house).toBeNull();
    for (const l of listings(9, 'plains', { acres: 'any', water: 'any', timber: 'any', town: 'any', built: 'house' })) expect(l.improvements.house).not.toBeNull();
  });

  it('a house adds to the price, and a sound one more than a run-down one', () => {
    const r = mulberry32(5);
    const imp = rollImprovements(r, 40, 10, 30, 'house');
    const { price: _p, id: _i, name: _n, ...base } = CLASSIC;
    void _p; void _i; void _n;
    const raw = sitePrice({ ...base, improvements: RAW });
    expect(sitePrice({ ...base, improvements: imp })).toBeGreaterThan(raw + 30_000);
    const good = sitePrice({ ...base, improvements: farmhouse('good', 'good', 'good').improvements });
    const poor = sitePrice({ ...base, improvements: farmhouse('poor', 'poor', 'poor').improvements });
    expect(good - poor).toBeGreaterThan(80_000);
  });

  it('a sound farmhouse is lived in from day one: plumbed to the well, wired, septic working', () => {
    const g = placed(farmhouse('good', 'good', 'good'));
    const house = g.structures.find(x => x.kind === 'farmhouse')!;
    expect(house.unplaced).toBeUndefined();
    const sv = serviceOf(g, plant(g), house.id);
    expect(sv.plumbed && sv.wired && sv.septic).toBe(true);
    expect(roofLoss(g)).toBe(1);
  });

  it('a run-down one leaks heat, isn\'t wired or plumbed until it\'s fixed, and the family (or a crew) fixes it', () => {
    const g = placed(farmhouse('poor', 'poor', 'poor'));
    const house = g.structures.find(x => x.kind === 'farmhouse')!;
    expect(roofLoss(g)).toBeGreaterThan(1.2);
    expect(sound(house, 'wiring')).toBe(false);
    let sv = serviceOf(g, plant(g), house.id);
    expect(sv.wired || sv.plumbed).toBe(false);
    expect(fitProblem(g, plant(g), house, 'wire')).toMatch(/rewire/);
    g.money = 200_000;
    placeOrder(g, [{ material: 'roofing', qty: 14 }, { material: 'lumber', qty: 3 }, { material: 'hardware', qty: 3 }, { material: 'cable', qty: 5 }, { material: 'pipe', qty: 5 }, { material: 'fixtures', qty: 1 }]);
    expect(hireCrew(g, house.id)).toBeNull();
    const s = step(g, 40);
    const h2 = s.structures.find(x => x.id === house.id)!;
    expect(h2.fixes!.every(f => f.done >= f.hours)).toBe(true);
    sv = serviceOf(s, plant(s), house.id);
    expect(sv.wired && sv.plumbed).toBe(true);
    expect(roofLoss(s)).toBe(1);
  });

  it('raw land: off the grid until the co-op runs the line; the drive by the foot', () => {
    const site: Site = { ...CLASSIC, improvements: { ...RAW, poleFt: 1200, driveFt: 600 } };
    let g = newGame(4, 105, 2027, { site, grid: true });
    expect(g.utilities.grid).toBe(false);
    expect(powerQuote(site.improvements).usd).toBe(Math.round((1200 * 28 + 3500) / 100) * 100);
    expect(driveQuote(site.improvements).usd).toBe(Math.round((600 * 20 + 1200) / 100) * 100);
    g.money = 100_000;
    expect(orderHookup(g, 'power')).toBeNull();
    expect(hookupProblem(g, 'power')).toBe('on the books');
    expect(orderHookup(g, 'drive')).toBeNull();
    g = step(g, 20);
    expect(g.site.improvements.drive).toBe(true);
    expect(g.utilities.grid).toBe(false);
    g = step(g, 60);
    expect(g.site.improvements.power).toBe(true);
    expect(g.utilities.grid).toBe(true);
  });

  it('with no drive the truck leaves it at the road, and it reaches the stockpile only once carried in', () => {
    const site: Site = { ...CLASSIC, improvements: { ...RAW, poleFt: 300, driveFt: 600 } };
    let g = newGame(4, 105, 2027, { site });
    g.money = 100_000;
    placeOrder(g, [{ material: 'lumber', qty: 10 }]);
    g = step(g, 2.03);
    expect(g.roadside.length).toBe(1);
    expect(g.stock.lumber).toBe(0);
    g = step(g, 10);
    expect(g.roadside.length).toBe(0);
    expect(g.stock.lumber).toBe(10);
  });
});
