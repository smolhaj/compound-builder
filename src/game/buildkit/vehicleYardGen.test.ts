import { describe, expect, it } from 'vitest';
import { spurGeometry } from './vehicleYardGen';

/** The spur's top-surface vertices (the bottom ones are buried 0.25 under) with the ground's height under each. */
function top(ground: (lx: number, lz: number) => number, spur = 0.8) {
  const g = spurGeometry(0.6, spur, 0.8, ground), p = g.attributes.position, out: { x: number; y: number; z: number; gy: number }[] = [];
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), gy = ground(x, z); if (y > gy - 0.1) out.push({ x, y, z, gy }); }
  return out;
}

describe('vehicle yard spur', () => {
  const planes: Array<[string, (lx: number, lz: number) => number]> = [
    ['a plain 8 % fall to the road with a crossfall', (lx, lz) => -0.08 * lz + 0.04 * lx],
    ['level ground', () => 0.1],
    ['a shallow trough (a road cut shoulder)', (lx, lz) => -0.05 * lz + 0.12 * lx * lx],
  ];
  for (const [name, ground] of planes) {
    it(`lies on the ground like a driveway apron over ${name}`, () => {
      const vs = top(ground);
      expect(vs.length).toBeGreaterThan(20);
      // the crown stands at most a hand over the ground (the drape reaches round each point for the coarse terrain mesh), never more
      for (const v of vs) expect(v.y - v.gy).toBeLessThan(0.07);
      // the far end is flush with the road: 6 mm over the ground at every point of it
      const zFar = Math.max(...vs.map(v => v.z)), far = vs.filter(v => v.z > zFar - 1e-6);
      expect(far.length).toBeGreaterThan(8);
      for (const v of far) expect(v.y - v.gy).toBeCloseTo(0.006, 3);
      // the outer columns are tucked into the ground along the sides (no edge standing proud of it)
      const xmax = Math.max(...vs.map(v => Math.abs(v.x))), sides = vs.filter(v => Math.abs(Math.abs(v.x) - xmax) < 0.05 && v.z < zFar - 1e-6);
      expect(sides.length).toBeGreaterThan(8);
      for (const v of sides) expect(v.y - v.gy).toBeLessThanOrEqual(-0.019);
    });
  }
});
