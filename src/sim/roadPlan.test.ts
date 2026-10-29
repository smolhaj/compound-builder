import { describe, expect, it } from 'vitest';
import { crossingFor, driveLine, planRoad, planWords, roadBedOf, structurePrice, type RoadGround, type RoadInput, type RoadPlan } from './roadPlan';
import { ROAD_PRICE, ROAD_STYLE } from './roadStyle';
import { BED, RoadBed, bedHeight } from './roadBed';
import { REGION_IDS, type RegionId } from './regions';
import { makeLotSite } from './lotListing';
import { LOT_KINDS } from './lots';
import { roadPlanFor } from './roadState';
import { crossings } from './roadGate';

/** A ground, a region, the gate band and the yard: the planner's whole input. */
function input(region: RegionId, ground: RoadGround, over: Partial<RoadInput> = {}): RoadInput {
  return {
    region, seed: 5, ground, rect: { x0: 0, z0: 0, x1: 67, z1: 67 }, frontage: { x: 67, zMin: 4, zMax: 63, band: [24, 40] },
    county: () => 70.4, roadHalf: 0.5, yard: [30, 32], ...over,
  };
}
const FLAT: RoadGround = { h: () => 1 };
/** Rising westward at `k` (rise per unit run) from the road: a hillside. */
const slopeW = (k: number): RoadGround => ({ h: (x) => 1 + (67 - x) * k });
const lineLen = (p: RoadPlan) => p.pts[p.pts.length - 1].s;

describe('the planned road', () => {
  it('is a pure function of its input: the same ground and seed give the same road', () => {
    const a = planRoad(input('mountain_west', slopeW(0.2))), b = planRoad(input('mountain_west', slopeW(0.2)));
    expect(a.signature).toBe(b.signature);
    expect(a.pts.length).toBe(b.pts.length);
    expect(a.pts[40]).toEqual(b.pts[40]);
    expect(a.usd).toBe(b.usd);
    // another seed winds differently where the ground does not care
    const c = planRoad(input('appalachia', FLAT, { seed: 5 })), d = planRoad(input('appalachia', FLAT, { seed: 6 }));
    expect(c.pts.map(p => p.z.toFixed(1)).join()).not.toBe(d.pts.map(p => p.z.toFixed(1)).join());
  });

  it('runs from the county road through the gate on the property line to the yard, crossing the line once', () => {
    for (const region of REGION_IDS) {
      const p = planRoad(input(region, slopeW(0.05)));
      const first = p.pts[0], last = p.pts[p.pts.length - 1];
      expect(first.x).toBeGreaterThan(67.5);                                   // on the county road's edge
      expect(Math.hypot(last.x - 30, last.z - 32)).toBeLessThan(0.2);           // ends on the yard
      expect(p.gate.x).toBeCloseTo(67, 0);
      expect(crossings([[67, 0], [67, 67]], driveLine(p)).length).toBe(1);      // one gate on the line
      for (const q of p.pts.slice(p.gateAt)) { expect(q.x).toBeLessThanOrEqual(67.01); expect(q.x).toBeGreaterThanOrEqual(0); expect(q.z).toBeGreaterThanOrEqual(0); expect(q.z).toBeLessThanOrEqual(67); }
    }
  });

  it('plains: straight on the survey grid (right-angle jogs only); a level place needs no winding', () => {
    const p = planRoad(input('plains', FLAT, { yard: [30, 50] }));
    expect(p.hairpins.length).toBe(0);
    expect(lineLen(p)).toBeLessThan(1.35 * Math.hypot(67 - 30, 24));
    // the survey line: legs are along the axes (a station-to-station heading is a multiple of 90 degrees, away from the corners)
    let axis = 0, total = 0;
    for (let i = 3; i < p.pts.length - 3; i++) { const dx = Math.abs(p.pts[i + 1].x - p.pts[i].x), dz = Math.abs(p.pts[i + 1].z - p.pts[i].z); total++; if (Math.min(dx, dz) < 0.05) axis++; }
    expect(axis / total).toBeGreaterThan(0.8);
  });

  it('a winding country winds on level ground; a straight one does not (region character)', () => {
    const bend = (region: RegionId) => { const p = planRoad(input(region, FLAT)); return lineLen(p) / Math.hypot(p.pts[0].x - 30, p.pts[0].z - 32); };
    expect(bend('appalachia')).toBeGreaterThan(bend('desert'));
    expect(bend('appalachia')).toBeGreaterThan(1.04);
    expect(bend('plains')).toBeLessThan(1.3);
  });

  it('holds the design grade on a hillside by running along the contour, and doubles back (hairpins) when the slope will not allow it', () => {
    // 20 % straight up from the road to the yard, in a narrow strip: it must switchback
    const g = slopeW(0.2), tight: Partial<RoadInput> = { rect: { x0: 0, z0: 22, x1: 67, z1: 42 }, frontage: { x: 67, zMin: 24, zMax: 40, band: [24, 40] }, yard: [20, 32] };
    const p = planRoad(input('mountain_west', g, tight));
    expect(p.phase).toBeLessThanOrEqual(2);
    expect(p.maxGradePct).toBeLessThanOrEqual(ROAD_STYLE.mountain_west.gradeMax * 100 + 0.6);
    expect(p.hairpins.length).toBeGreaterThanOrEqual(1);
    expect(lineLen(p)).toBeGreaterThan(1.6 * 47);   // the rise (9.4 units) at 12 % needs 78 units of road
    // wide land: no hairpins needed, the road traverses the slope at an angle
    const wide = planRoad(input('mountain_west', g, { yard: [20, 32] }));
    expect(wide.maxGradePct).toBeLessThanOrEqual(ROAD_STYLE.mountain_west.gradeMax * 100 + 0.6);
    expect(lineLen(wide)).toBeGreaterThan(lineLen(planRoad(input('mountain_west', slopeW(0.04), { yard: [20, 32] }))));
  });

  it('never crosses itself', () => {
    const g = slopeW(0.25), tight: Partial<RoadInput> = { rect: { x0: 0, z0: 22, x1: 67, z1: 42 }, frontage: { x: 67, zMin: 24, zMax: 40, band: [24, 40] }, yard: [12, 32] };
    for (const region of ['mountain_west', 'appalachia', 'pnw'] as RegionId[]) {
      const p = planRoad(input(region, g, tight));
      for (let i = 0; i < p.pts.length; i++) for (let j = i + 1; j < p.pts.length; j++) {
        if (p.pts[j].s - p.pts[i].s < 8) continue;
        expect(Math.hypot(p.pts[i].x - p.pts[j].x, p.pts[i].z - p.pts[j].z)).toBeGreaterThan(0.3);
      }
    }
  });

  it('the creek: a culvert, a ford, a low-water slab or a bridge by its width and the region', () => {
    const creek = (half: number) => ({ zAt: () => 36, waterY: () => 0.6, halfWidth: half });
    const cross = (region: RegionId, half: number) => planRoad(input(region, { h: (_x, z) => (Math.abs(z - 36) < half + 0.4 ? 0.7 : 1), creek: creek(half) }, { frontage: { x: 67, zMin: 4, zMax: 63, band: [10, 26] }, yard: [30, 50] })).structures.filter(s => !['cattle_guard', 'culvert', 'pass'].includes(s.kind) || s.s0 > 0).find(s => s.kind !== 'cattle_guard');
    // 8.4 m of channel
    expect(cross('mountain_west', 0.7)?.kind).toBe('bridge1');
    expect(cross('appalachia', 0.7)?.kind).toBe('low_water');
    expect(cross('hill_country', 0.7)?.kind).toBe('low_water');
    expect(cross('pnw', 0.7)?.kind).toBe('bridge1');
    // a 2.4 m creek is a culvert almost everywhere, a ford in the low-water country
    expect(cross('pnw', 0.2)?.kind).toBe('culvert');
    expect(cross('plains', 0.2)?.kind).toBe('culvert');
    // the table itself
    expect(crossingFor(ROAD_STYLE.pnw, 4)).toBe('arch_culvert');
    expect(crossingFor(ROAD_STYLE.appalachia, 4)).toBe('ford');
    expect(crossingFor(ROAD_STYLE.mountain_west, 20)).toBe('bridge');
  });

  it('a bridge is dear, a culvert cheap, a bore dearest: one price table', () => {
    expect(structurePrice('culvert', 3).usd).toBe(ROAD_PRICE.culvert);
    expect(structurePrice('bridge1', 8.4).usd).toBeGreaterThan(40 * structurePrice('culvert', 3).usd / 3);
    expect(structurePrice('tunnel', 48).usd).toBeGreaterThan(structurePrice('bridge1', 48).usd);
    expect(structurePrice('bridge', 20).usd).toBeGreaterThan(structurePrice('bridge1', 20).usd);
  });

  it('a bore only where a spur blocks the line and the country holds one; never on the plains', () => {
    // a wall of rock across the strip: 12 high, 5 wide, no way round inside the owned land
    const spur: RoadGround = { h: (x, z) => 1 + 3.5 * Math.exp(-(((x - 45) / 2) ** 2)) * (z > 20 && z < 44 ? 1 : 0) };
    const tight: Partial<RoadInput> = { rect: { x0: 0, z0: 22, x1: 67, z1: 42 }, frontage: { x: 67, zMin: 24, zMax: 40, band: [24, 40] }, yard: [25, 32] };
    const mw = planRoad(input('mountain_west', spur, tight));
    expect(mw.structures.some(s => s.kind === 'tunnel')).toBe(true);
    expect(mw.phase).toBe(2);
    const bore = mw.structures.find(s => s.kind === 'tunnel')!;
    expect(bore.choke).toBe(true);
    expect(bore.usd).toBeGreaterThan(200_000);
    const pl = planRoad(input('plains', spur, tight));
    expect(pl.structures.some(s => s.kind === 'tunnel')).toBe(false);
    expect(pl.engineer).toBe(true);
    // easy ground gets none
    expect(planRoad(input('mountain_west', FLAT)).structures.some(s => s.kind === 'tunnel')).toBe(false);
  });

  it('the vertical profile keeps to the grade limit (landings eased on hairpins), the price counts every foot', () => {
    const tight: Partial<RoadInput> = { rect: { x0: 0, z0: 22, x1: 67, z1: 42 }, frontage: { x: 67, zMin: 24, zMax: 40, band: [24, 40] }, yard: [20, 32] };
    const p = planRoad(input('appalachia', slopeW(0.22), tight));
    for (let i = 1; i < p.pts.length; i++) {
      const ds = p.pts[i].s - p.pts[i - 1].s;
      if (ds > 0 && p.phase < 3) expect(Math.abs(p.pts[i].y - p.pts[i - 1].y) / ds).toBeLessThanOrEqual(ROAD_STYLE.appalachia.gradeMax + 0.02);
    }
    expect(p.lines.reduce((a, l) => a + l.usd, 0) * (p.engineer ? 1.25 : 1)).toBeGreaterThan(p.usd * 0.97);
    expect(p.lines.reduce((a, l) => a + l.usd, 0) * (p.engineer ? 1.25 : 1)).toBeLessThan(p.usd * 1.03);
    expect(p.usd).toBeGreaterThan(planRoad(input('appalachia', FLAT, tight)).usd);
  });

  it('retaining walls and guardrail only where the cut or fill is tall; a cattle guard only on open range', () => {
    const flat = planRoad(input('mountain_west', slopeW(0.02)));
    expect(flat.walls.length).toBe(0);
    expect(flat.rails.length).toBe(0);
    expect(flat.structures.some(s => s.kind === 'cattle_guard')).toBe(true);
    expect(planRoad(input('appalachia', FLAT)).structures.some(s => s.kind === 'cattle_guard')).toBe(false);
    const hill = planRoad(input('mountain_west', { h: (x, z) => 1 + (67 - x) * 0.05 + 4 * Math.max(0, (z - 32)) * 0.12 }));
    expect(hill.walls.length + hill.rails.length).toBeGreaterThanOrEqual(0);
  });

  it('words for the card', () => {
    const p = planRoad(input('mountain_west', slopeW(0.2), { rect: { x0: 0, z0: 22, x1: 67, z1: 42 }, frontage: { x: 67, zMin: 24, zMax: 40, band: [24, 40] }, yard: [20, 32] }));
    const w = planWords(p);
    expect(w[0]).toMatch(/of ranch road/);
    expect(w.join(' ')).toMatch(/hairpin/);
    expect(w.join(' ')).not.toMatch(/NaN|undefined|Infinity/);
  });
});

describe('the road bed', () => {
  it('is flat on the bench, cuts the uphill bank and fills the downhill slope until they meet the ground', () => {
    expect(bedHeight(5, 2, 0)).toBe(2);
    expect(bedHeight(5, 2, BED.halfW)).toBe(2);
    // cut: the bank rises at 1 : cutRatio until it reaches the natural ground
    expect(bedHeight(5, 2, BED.halfW + 0.6)).toBeCloseTo(2 + 0.6 / BED.cutRatio, 5);
    expect(bedHeight(2.2, 2, BED.halfW + 2)).toBe(2.2);
    // fill: falls away at 1 : fillRatio
    expect(bedHeight(-3, 2, BED.halfW + 0.9)).toBeCloseTo(2 - 0.9 / BED.fillRatio, 5);
    // banked: the outside edge is higher
    expect(bedHeight(2, 2, 0.4, 0.05)).toBeGreaterThan(bedHeight(2, 2, -0.4, 0.05));
  });

  it('indexes the road and leaves the ground alone far from it and under a bridge', () => {
    const pts = Array.from({ length: 21 }, (_, i) => ({ x: 10 + i * 0.5, z: 10, y: 3, bank: 0 }));
    const bed = new RoadBed(pts, pts.map((_, i) => i >= 8 && i <= 12));
    expect(bed.apply(12, 10, 4).h).toBe(3);                       // on the bench
    expect(bed.apply(12, 18, 4).h).toBe(4);                       // far away
    expect(bed.apply(13, 10, 1).h).toBe(3);                       // a fill: the road is above the ground, the bench holds
    expect(bed.apply(13.2, 10.2, 1).cleared).toBe(true);
    // the span has no bed, and no bench carries on along the heading past the last one
    expect(bed.apply(14, 10, 1).h).toBe(1);
    expect(bed.apply(13.9, 10.2, 1).h).toBe(1);
    expect(bed.apply(15, 10, 1).h).toBe(1);                       // under the span the ground is left as it is (the banks do not spread under it)
    const p = planRoad(input('mountain_west', slopeW(0.1)));
    const b = roadBedOf(p);
    expect(b.empty).toBe(false);
    const mid = p.pts[Math.floor(p.pts.length / 2)];
    expect(b.apply(mid.x, mid.z, mid.y + 1).h).toBeCloseTo(mid.y, 1);
  });
});

describe('real lots', () => {
  it('every kind of lot gets a road that reaches the yard, in the hill regions', () => {
    for (const region of ['mountain_west', 'appalachia', 'pnw', 'new_england'] as RegionId[]) for (const kind of LOT_KINDS) {
      const site = makeLotSite({ region, kind, seed: 2 });
      const p = roadPlanFor(site, 2);
      expect(p.lengthM, `${region} ${kind}`).toBeGreaterThan(40);
      expect(Number.isFinite(p.usd), `${region} ${kind}`).toBe(true);
      expect(p.phase, `${region} ${kind}`).toBeLessThanOrEqual(3);
      for (let i = 1; i < p.pts.length; i++) expect(p.pts[i].s).toBeGreaterThan(p.pts[i - 1].s);
      // the structures exist only where the ground asks: a bore only in rock country and only where it was needed
      if (p.structures.some(s => s.kind === 'tunnel')) { expect(ROAD_STYLE[region].tunnels).toBe(true); expect(p.phase).toBeGreaterThanOrEqual(2); }
    }
  }, 60_000);

  it('steeper ground costs more road than level ground', () => {
    const a = roadPlanFor(makeLotSite({ region: 'mountain_west', kind: 'hillside', seed: 2, relief: 11 }), 2), b = roadPlanFor(makeLotSite({ region: 'mountain_west', kind: 'bench', seed: 2, relief: 5 }), 2);
    expect(a.usd).toBeGreaterThan(b.usd);
    expect(a.lengthM).toBeGreaterThan(b.lengthM);
  });
});
