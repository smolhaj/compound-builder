import { describe, expect, it } from 'vitest';
import { interiorPlan, LANE_W, PATH_W, BENCH, type Obstacle } from './domeInteriorPlan';

const R = 6, angles = [0, 2.094, 4.189];
const clear = (o: readonly Obstacle[], pts: Array<{ x: number; z: number }>, pad: number): boolean => pts.every(p => !o.some(q => Math.abs(p.x - q.x) < q.hx + pad && Math.abs(p.z - q.z) < q.hz + pad));

describe('dome interior plan', () => {
  it('a glass dome gets paths from every airlock, benches, crates, signs, a plaza with planters and lamps', () => {
    const p = interiorPlan('glass', R, angles, []);
    expect(p.segs.length).toBeGreaterThan(15); expect(p.benches.length).toBeGreaterThan(3);
    expect(p.crates.length).toBe(3); expect(p.signs.length).toBe(3);
    expect(p.plaza).not.toBeNull(); expect(p.planters.length).toBeGreaterThan(0); expect(p.lamps.length).toBeGreaterThanOrEqual(3);
  });
  it('houses get a pool of light round them, and a ring path runs round the middle', () => {
    const p = interiorPlan('glass', R, angles, [{ x: 1, z: 1, hx: 0.5, hz: 0.4, home: true }, { x: -2, z: 1, hx: 0.5, hz: 0.4 }]);
    expect(p.glows.length).toBe(1);
    expect(p.segs.filter(s => Math.abs(Math.hypot(s.x, s.z) - R * 0.6) < 0.05).length).toBeGreaterThan(20);
  });
  it('a vehicle port gets a paved lane (wider than a footpath) and nothing is set in it', () => {
    const p = interiorPlan('glass', R, [0, 2.094], [], 1, [4.189]);
    const lane = p.segs.filter(s => (s.w ?? 0) >= LANE_W);
    expect(p.lamps.some(l => Math.abs(l.x * Math.cos(4.189) - l.z * Math.sin(4.189)) < LANE_W / 2 + 0.3 && l.x * Math.sin(4.189) + l.z * Math.cos(4.189) > R * 0.4)).toBe(true);
    expect(lane.length).toBeGreaterThan(6);
    const a = 4.189;
    for (const q of [...p.benches, ...p.crates, ...p.signs, ...p.lamps]) {
      const al = q.x * Math.sin(a) + q.z * Math.cos(a), ac = Math.abs(q.x * Math.cos(a) - q.z * Math.sin(a));
      if (al > R * 0.4) expect(ac).toBeGreaterThan(LANE_W / 2);
    }
  });
  it('an earthen dome has nothing', () => { const p = interiorPlan('earthen', 1, [0], []); expect(p.segs.length + p.benches.length).toBe(0); });
  it('nothing is put on a building, and everything stays under the shell', () => {
    const obs: Obstacle[] = [{ x: -0.8, z: 0.8, hx: 0.9, hz: 0.5 }, { x: 2, z: -1, hx: 1, hz: 1 }, { x: 0, z: 4.3, hx: 0.6, hz: 0.6 }];
    const p = interiorPlan('glass', R, angles, obs);
    const all = [...p.segs, ...p.benches, ...p.crates, ...p.signs, ...p.planters, ...p.lamps];
    expect(clear(obs, p.segs, PATH_W / 2)).toBe(true);
    expect(clear(obs, p.benches, BENCH.len / 2)).toBe(true);
    expect(clear(obs, [...p.crates, ...p.signs, ...p.planters, ...p.lamps], 0)).toBe(true);
    expect(all.every(q => Math.hypot(q.x, q.z) < R * 0.95)).toBe(true);
  });
  it('props stay out of the lane in front of each airlock door', () => {
    const p = interiorPlan('arcology', 15, angles, []);
    for (const a of angles) for (const q of [...p.benches, ...p.crates, ...p.signs]) {
      const along = q.x * Math.sin(a) + q.z * Math.cos(a), across = Math.abs(q.x * Math.cos(a) - q.z * Math.sin(a));
      if (along > 15 * 0.7) expect(across).toBeGreaterThan(PATH_W / 2 + BENCH.dep / 2);
    }
  });
  it('a bench is person scale (seat under a person, back under a doorway)', () => { expect(BENCH.seat).toBeLessThan(0.28 / 2); expect(BENCH.back).toBeLessThan(0.28); });
});
