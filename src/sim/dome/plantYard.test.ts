import { describe, expect, it } from "vitest";

describe('the service lock grows nothing', () => {
  it('the chamber, the passage and the yard slab are excluded, the lawn is not', async () => {
    const { inServiceLock, airlockDims, yardGeometry, yardPoint } = await import('./plantYard');
    const g = yardGeometry('arcology', 8.97, 1)!, d = airlockDims(g), ox = 30, oz = 40;
    const at = (ax: number, az: number): [number, number] => [ox + d.fr.x + ax * Math.cos(d.fr.rot) + az * Math.sin(d.fr.rot), oz + d.fr.z - ax * Math.sin(d.fr.rot) + az * Math.cos(d.fr.rot)];
    for (const [ax, az] of [[0, d.cz], [0.1, d.dzC + 0.1], [-0.1, d.pz], [0, d.cz + 0.2]]) expect(inServiceLock(g, ox, oz, ...at(ax, az))).toBe(true);
    const yc = yardPoint(g, g.portal.u, g.D / 2); expect(inServiceLock(g, ox, oz, ox + yc[0], oz + yc[1])).toBe(true);
    expect(inServiceLock(g, ox, oz, ...at(1.5, d.cz))).toBe(false);      // the lawn beside the chamber
    expect(inServiceLock(g, ox, oz, ...at(0, d.dzC - 1.0))).toBe(false);      // the lawn beyond its dome-side door
  });
});
