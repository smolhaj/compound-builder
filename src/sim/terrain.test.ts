import { describe, expect, it } from 'vitest';
import { GRAVITY_MIN_HEAD_M, T, advantage, analyzeTerrain, approachLanes, bestLane, creekDropM, findGorge, frostAt, headM, highAt, siteCandidates, sightAt, slopeAt, sunAt, wetAt, type GroundSource } from './terrain';
import { ParcelTerrain } from '../game/parcel/parcelTerrain';
import { REGION_IDS } from './regions';

const LOT = { x0: 0, z0: 0, x1: 67, z1: 67 };
const CAMP: [number, number] = [33, 33];
const an = (src: GroundSource, step = 1) => analyzeTerrain(src, LOT, { step });
const flat: GroundSource = { h: () => 0 };
const hill: GroundSource = { h: (x, z) => 3 * Math.exp(-((x - 20) ** 2 + (z - 20) ** 2) / 60) };

describe('terrain analysis: the ground as numbers', () => {
  it('flat ground has no high ground, no slope, long sight lines and no suggestions', () => {
    const t = an(flat);
    expect(highAt(t, 30, 30)).toBe(0);
    expect(slopeAt(t, 30, 30)).toBe(0);
    expect(sightAt(t, 30, 30)).toBeGreaterThan(0.95);
    expect(siteCandidates(t, { lot: LOT, camp: CAMP }).filter(c => c.kind !== 'tower_hill')).toEqual([]);
    expect(findGorge(t, LOT)).toBeNull();
  });

  it('a hilltop stands above its ring, sees farther than a hollow, and suits a keep', () => {
    const t = an(hill);
    expect(highAt(t, 20, 20)).toBeGreaterThan(0.5);
    const bowl: GroundSource = { h: (x, z) => -3 * Math.exp(-((x - 33) ** 2 + (z - 33) ** 2) / 60) };
    expect(sightAt(t, 20, 20)).toBeGreaterThanOrEqual(sightAt(an(bowl), 33, 33));
    expect(advantage(t, [20, 20], [40, 40])).toBeGreaterThan(2.5);
    const keep = siteCandidates(t, { lot: LOT, camp: CAMP }).find(c => c.kind === 'keep_ridge');
    expect(keep).toBeTruthy();
    expect(Math.hypot(keep!.x - 20, keep!.z - 20)).toBeLessThan(8);
    expect(keep!.reason).toMatch(/terraced keep/);
  });

  it('a hollow hides a watcher: it sees less than the rim', () => {
    const bowl: GroundSource = { h: (x, z) => 3 * (1 - Math.exp(-((x - 33) ** 2 + (z - 33) ** 2) / 40)) };
    const t = an(bowl);
    expect(sightAt(t, 33, 33)).toBeLessThan(sightAt(t, 60, 33) - 0.2);
  });

  it('south-facing ground gets more sun than north-facing', () => {
    const southFace = an({ h: (_x, z) => -0.2 * z }), northFace = an({ h: (_x, z) => 0.2 * z });
    expect(sunAt(southFace, 30, 30)).toBeGreaterThan(1.05);
    expect(sunAt(northFace, 30, 30)).toBeLessThan(0.95);
    expect(sunAt(an(flat), 30, 30)).toBeCloseTo(1);
  });

  it('classes ground by how a crew crosses it: easy, a scramble, a cliff, the creek', () => {
    const t = an({ h: (x) => (x < 30 ? 0 : (x - 30) * 1.2) });
    expect(t.cost[t.idx(10, 33)]).toBeLessThan(1.5);
    expect(t.cost[t.idx(40, 33)]).toBeGreaterThan(T.COST_HARD);
    const c = { h: () => 0, creek: { zAt: () => 33, waterY: () => 0.5, halfWidth: 1.5 } };
    const tc = an(c);
    expect(tc.cost[tc.idx(30, 33)]).toBeGreaterThanOrEqual(T.COST_WATER);
  });
});

describe('approach lanes and chokes', () => {
  // a plateau with cliffs on every side but one: a ramp from the south (z large) through a narrow neck
  const fort: GroundSource = { h: (x, z) => {
    const inNeck = Math.abs(x - 33) < 2 && z > 33;
    const d = Math.hypot(x - 33, z - 33);
    if (d < 14) return 6;
    if (inNeck) return Math.max(0, 6 - (d - 14) * 0.25);
    return Math.max(0, 6 - (d - 14) * 2.5);
  } };

  it('the crew takes the ramp, not the cliffs, and the neck is the choke', () => {
    const t = an(fort);
    const lanes = approachLanes(t, CAMP);
    const best = bestLane(lanes)!;
    expect(best).toBeTruthy();
    // the open way is from the south: direction ≈ +z (π/2)
    expect(Math.abs(best.ang - Math.PI / 2)).toBeLessThan(0.8);
    const others = lanes.filter(l => l !== best);
    expect(others.every(l => l.cost > best.cost)).toBe(true);
    expect(best.choke).toBeTruthy();
    expect(best.choke!.width).toBeLessThanOrEqual(T.CHOKE);
  });

  it('flat open ground has no choke and no lane is much harder than another', () => {
    const t = an(flat);
    const lanes = approachLanes(t, CAMP);
    expect(lanes.length).toBeGreaterThanOrEqual(7);
    expect(lanes.every(l => l.choke === null)).toBe(true);
    const costs = lanes.map(l => l.cost);
    expect(Math.max(...costs) / Math.min(...costs)).toBeLessThan(1.5);
  });

  it('a creek lane has to ford, and the road makes its own side easier', () => {
    const t = an({ h: () => 0, creek: { zAt: () => 15, waterY: () => 0.1, halfWidth: 1.5 } });
    const lanes = approachLanes(t, CAMP);
    const north = lanes.find(l => Math.abs(l.ang + Math.PI / 2) < 0.4)!;
    expect(north.fords).toBe(true);
    const road = bestLane(lanes, { ang: Math.PI / 2, bonus: 0.5 })!;
    expect(Math.abs(road.ang - Math.PI / 2)).toBeLessThan(0.8);
  });
});

describe('water and weather on the ground', () => {
  it('the floodplain by the creek is wet; the rim above it is not', () => {
    const src: GroundSource = { h: (_x, z) => Math.min(4, Math.abs(z - 33) * 0.4), creek: { zAt: () => 33, waterY: () => -0.05, halfWidth: 1 } };
    const t = an(src);
    expect(wetAt(t, 30, 34)).toBe(2);
    expect(wetAt(t, 30, 55)).toBe(0);
  });

  it('a hollow on level ground is a frost pocket and the hill beside it is not', () => {
    const src: GroundSource = { h: (x, z) => 2 * (1 - Math.exp(-((x - 33) ** 2 + (z - 33) ** 2) / 120)) * 1.0 - 0 };
    const t = an(src);
    expect(frostAt(t, 33, 33) || wetAt(t, 33, 33) > 0).toBe(true);
    expect(frostAt(t, 62, 62)).toBe(false);
  });

  it('a bench 12 m above the camp feeds it by gravity; head is measured in metres', () => {
    const src: GroundSource = { h: (x, z) => (Math.hypot(x - 45, z - 33) < 6 ? 2 : Math.hypot(x - 45, z - 33) < 12 ? 2 - (Math.hypot(x - 45, z - 33) - 6) * 0.33 : 0) };
    const t = an(src);
    expect(headM(t, [45, 33], CAMP)).toBeCloseTo(12, 0);
    const r = siteCandidates(t, { lot: LOT, camp: CAMP }).find(c => c.kind === 'reservoir');
    expect(r).toBeTruthy();
    expect(r!.headM!).toBeGreaterThanOrEqual(GRAVITY_MIN_HEAD_M);
  });

  it('the creek\'s fall over a reach is micro-hydro head', () => {
    const t = an({ h: () => 0, creek: { zAt: () => 33, waterY: x => -x * 0.03, halfWidth: 1 } });
    expect(creekDropM(t, 40, 10)).toBeCloseTo(1.8, 1);
  });
});

describe('a gorge', () => {
  const gorge: GroundSource = { h: (_x, z) => Math.min(4, Math.abs(z - 33) * 0.9), creek: { zAt: () => 33, waterY: () => 0.05, halfWidth: 0.6 } };
  it('is found only over real low ground: the span, the rims and the depth', () => {
    const t = an(gorge);
    const g = findGorge(t, LOT)!;
    expect(g).toBeTruthy();
    expect(g.span!.depthM).toBeGreaterThanOrEqual(6);
    expect(g.span!.lengthM).toBeLessThanOrEqual(200);
    expect(g.reason).toMatch(/choke point/);
    const shallow = an({ h: (_x, z) => Math.min(0.4, Math.abs(z - 33) * 0.2), creek: { zAt: () => 33, waterY: () => 0.0, halfWidth: 0.6 } });
    expect(findGorge(shallow, LOT)).toBeNull();
    expect(findGorge(an(flat), LOT)).toBeNull();
  });
});

describe('the real parcels', () => {
  const found: Record<string, boolean> = {};
  for (const region of REGION_IDS) {
    it(`${region}: analysis is quick and every number is finite`, () => {
      const pt = new ParcelTerrain(7, { creek: true, region });
      const t0 = Date.now();
      const t = analyzeTerrain({ h: (x, z) => pt.natural(x, z).h, creek: pt.creek }, LOT, { step: 1 });
      expect(Date.now() - t0).toBeLessThan(15000);
      for (const f of [t.h, t.slope, t.high, t.sight, t.cost, t.flow, t.wind, t.sun]) for (let i = 0; i < f.length; i += 37) expect(Number.isFinite(f[i])).toBe(true);
      const lanes = approachLanes(t, [pt.creek.zAt(33) > 40 ? 20 : 33, 33]);
      expect(lanes.length).toBeGreaterThan(0);
      found[region] = findGorge(t, LOT) !== null;
    });
  }
  it('plains parcels have no gorge', () => {
    expect(found['plains']).toBe(false);
  });
});
