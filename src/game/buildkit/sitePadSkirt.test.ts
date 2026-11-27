/**
 * A dome that no retaining wall may surround (a drive reaches it) is cut into the hill with a plain skirt. That skirt used to be a fixed 0.9 u whatever the cut: on a slope the
 * bank was a 35 degree face (10 ft in 18 ft) that the terrain shader painted as dark rock, a square outline round the pad. The skirt now widens with the drop.
 */
import { describe, expect, it } from 'vitest';
import { ParcelTerrain } from '../parcel/parcelTerrain';
import { KIT, type Placed } from './kit';
import { GENTLE_SKIRT, GENTLE_SKIRT_MAX, edgeDrop, gentleSkirt, sitePad, skirtFor } from './sitePad';

/** The steepest grade (rise over run) of the drawn ground along 4 lines crossing the pad's edges, out to the end of the skirt. */
function steepest(t: ParcelTerrain, pad: { x0: number; z0: number; x1: number; z1: number; skirt: number }, cx: number, cz: number): number {
  let m = 0;
  const lines: Array<(d: number) => [number, number]> = [d => [pad.x0 - d, cz], d => [pad.x1 + d, cz], d => [cx, pad.z0 - d], d => [cx, pad.z1 + d]];
  for (const ln of lines) for (let d = 0; d < pad.skirt + 1; d += 0.05) m = Math.max(m, Math.abs(t.height(...ln(d + 0.05)) - t.height(...ln(d))) / 0.05);
  return m;
}

describe('a dome pad with no wall', () => {
  it('the skirt grows with the drop and never falls below the old 0.9 u or past its cap', () => {
    expect(gentleSkirt(0)).toBe(GENTLE_SKIRT);
    expect(gentleSkirt(0.05)).toBe(GENTLE_SKIRT);
    expect(gentleSkirt(0.5)).toBeGreaterThan(2.5);
    expect(gentleSkirt(10)).toBe(GENTLE_SKIRT_MAX);
    for (let d = 0; d < 1; d += 0.02) expect(gentleSkirt(d + 0.02)).toBeGreaterThanOrEqual(gentleSkirt(d));
  });

  it('skirtFor reads the drop at the bank\'s outer edge: a hill that keeps falling gets a wider skirt than the pad edge alone asks for', () => {
    const r = { x0: 0, z0: 0, x1: 4, z1: 4 }, fall = (x: number): number => 1 - x * 0.2;   // falls 0.2 a unit past the pad's west edge (x = 0)
    expect(skirtFor(r, 1, x => 1 + Math.min(0, x) * 0.2)).toBeGreaterThan(gentleSkirt(edgeDrop(r, 1, x => 1 + Math.min(0, x) * 0.2)));
    void fall;
    expect(skirtFor(r, 1, () => 1)).toBe(GENTLE_SKIRT);
  });

  it('edgeDrop reads the biggest step between the level and the ground on the rect edge', () => {
    expect(edgeDrop({ x0: 0, z0: 0, x1: 4, z1: 4 }, 1, x => x * 0.1)).toBeCloseTo(1, 5);
    expect(edgeDrop({ x0: 0, z0: 0, x1: 4, z1: 4 }, 1, () => 1)).toBe(0);
  });

  // a plain hill (a plane falling `g` per unit east): the bank is the pad's level eased to the ground over the skirt (parcelTerrain's own blend), so its grade is exact
  for (const kind of ['dome_glass', 'dome_arcology'] as const) for (const g of [0.02, 0.035, 0.05]) it(`${kind} on a ${(g * 100).toFixed(1)} percent hill: the bank is no steeper than about 1 : 3.5 (the old 0.9 u skirt was)`, () => {
    const def = KIT[kind], nat = (x: number, _z: number): number => 3 + g * x;
    const p: Placed = { id: 's', kind, x: 40, z: 40, rot: 1 } as Placed;
    const { pad } = sitePad(def, p, { natural: nat, seen: nat, padHeight: (a, _b, c) => (nat(a, 0) + nat(c, 0)) / 2, isLot: false, touchesAccess: () => true, waterLevel: () => -9, near: [] });
    expect(pad).not.toBeNull();
    const bankGrade = (skirt: number): number => {
      let m = 0;
      const h = (x: number): number => { const d = Math.max(pad!.x0 - x, x - pad!.x1, 0), k = d >= skirt ? 0 : 1 - ((d / skirt) ** 2) * (3 - 2 * d / skirt); return nat(x, 0) + (pad!.y - nat(x, 0)) * k; };
      for (let x = pad!.x0 - skirt - 0.5; x < pad!.x1 + skirt; x += 0.02) m = Math.max(m, Math.abs(h(x + 0.02) - h(x)) / 0.02);
      return m;
    };
    const was = bankGrade(GENTLE_SKIRT), now = bankGrade(pad!.skirt);
    expect(now).toBeLessThan(0.32);
    expect(now).toBeLessThanOrEqual(was);
    if (g * (pad!.x1 - pad!.x0) / 2 > 0.3) expect(was, 'the old skirt carried a steep face').toBeGreaterThan(0.45);
  });

  // on the real (lumpy) hill the skirt is never narrower than the old one, and on the whole the banks are gentler
  for (const kind of ['dome_glass', 'dome_arcology'] as const) it(`${kind} on the generated hill: across the lot the banks are gentler than the old fixed skirt made them`, () => {
    const t = new ParcelTerrain(7), def = KIT[kind];
    let wider = 0, sumWas = 0, sumNow = 0, n = 0;
    for (let cx = 20; cx <= 60; cx += 4) for (let cz = 20; cz <= 60; cz += 4) {
      const p: Placed = { id: 's', kind, x: cx, z: cz, rot: 1 } as Placed;
      const { pad } = sitePad(def, p, { natural: (x, z) => t.natural(x, z).h, seen: t.height, padHeight: (a, b, c, d) => t.padHeight(a, b, c, d), isLot: false, touchesAccess: () => true, waterLevel: () => -9, near: [] });
      const old = { ...pad!, skirt: GENTLE_SKIRT };
      t.setPads([old]); const was = steepest(t, old, cx, cz);
      t.setPads([pad!]); const now = steepest(t, pad!, cx, cz);
      expect(pad!.skirt).toBeGreaterThanOrEqual(GENTLE_SKIRT);
      sumWas += was; sumNow += now; n++;
      if (pad!.skirt > GENTLE_SKIRT) wider++;
    }
    expect(wider).toBeGreaterThan(0);
    expect(sumNow / n, 'mean steepest bank grade').toBeLessThan(sumWas / n * 0.9);
  });
});
