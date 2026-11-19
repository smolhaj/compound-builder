import { describe, expect, it } from 'vitest';
import { interiorPlan, PATH_W, BENCH, type Obstacle } from './domeInteriorPlan';

const R = 6, angles = [0, 2.094, 4.189];
const clear = (o: readonly Obstacle[], pts: Array<{ x: number; z: number }>, pad: number): boolean => pts.every(p => !o.some(q => Math.hypot(p.x - q.x, p.z - q.z) < q.r + pad));

describe('dome interior plan', () => {
  it('a glass dome gets paths from every airlock, benches, crates, signs, a plaza with planters and lamps', () => {
    const p = interiorPlan('glass', R, angles, []);
    expect(p.segs.length).toBeGreaterThan(15); expect(p.benches.length).toBeGreaterThan(3);
    expect(p.crates.length).toBe(3); expect(p.signs.length).toBe(3);
    expect(p.plaza).not.toBeNull(); expect(p.planters.length).toBeGreaterThan(0); expect(p.lamps.length).toBe(3);
  });
  it('an earthen dome has nothing', () => { const p = interiorPlan('earthen', 1, [0], []); expect(p.segs.length + p.benches.length).toBe(0); });
  it('nothing is put on a building, and everything stays under the shell', () => {
    const obs: Obstacle[] = [{ x: -0.8, z: 0.8, r: 0.9 }, { x: 2, z: -1, r: 1 }, { x: 0, z: 4.3, r: 0.6 }];
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
