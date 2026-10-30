import { describe, expect, it } from 'vitest';
import { KIT, snapCenter, placementProblem, type Placed, type SiteQuery } from './kit';
import { LEVEL_APART, padClash, padOf, padSnap, clashText } from './padRules';

/** A hillside that rises 0.5 u for every unit going +x. */
const hill = (x: number, _z: number): number => 0.5 * x;
const flat = (): number => 0;
const at = (id: string, kind: string, x: number, z: number): Placed => ({ id, kind, x, z, rot: 0 });

describe('pad-aware placement', () => {
  it('two houses side by side on a slope would grade overlapping pads at different levels', () => {
    const cabin = KIT.timber_cabin;
    const a = at('a', 'timber_cabin', 0, 0);
    const c = padClash(cabin, 1.8, 0, 0, hill, [a]);
    expect(c).not.toBeNull();
    expect(Math.abs(c!.dy)).toBeGreaterThanOrEqual(LEVEL_APART);
    expect(c!.dy).toBeLessThan(0);   // the new one stands uphill, so the other pad is lower than ours
  });

  it('there is no clash on level ground, far apart on a slope, or when the pads end up at one level', () => {
    const cabin = KIT.timber_cabin;
    expect(padClash(cabin, 1.8, 0, 0, flat, [at('a', 'timber_cabin', 0, 0)])).toBeNull();
    expect(padClash(cabin, 30, 0, 0, hill, [at('a', 'timber_cabin', 0, 0)])).toBeNull();
    // along the contour (same height) the pads can touch freely
    expect(padClash(cabin, 0, 3, 0, hill, [at('a', 'timber_cabin', 0, 0)])).toBeNull();
  });

  it('pieces with no pad of their own are never in a clash: bunker rooms, ring walls, the watchtower', () => {
    const a = at('a', 'timber_cabin', 0, 0);
    expect(padOf(KIT.watchtower_wood, 1.8, 0, 0, hill)).toBeNull();
    expect(padClash(KIT.watchtower_wood, 1.8, 0, 0, hill, [a])).toBeNull();
    expect(padClash(KIT.timber_cabin, 1.8, 0, 0, hill, [at('t', 'watchtower_wood', 0, 0)])).toBeNull();
  });

  it('suggests the nearest clear spot, which is really clear and snapped to the build grid', () => {
    const cabin = KIT.timber_cabin, placed = [at('a', 'timber_cabin', 0, 0)];
    const snap = (px: number, pz: number) => snapCenter(cabin, px, pz, 0);
    const spot = padSnap(cabin, 1.8, 0, 0, hill, placed, snap, () => true);
    expect(spot).not.toBeNull();
    expect(padClash(cabin, spot![0], spot![1], 0, hill, placed)).toBeNull();
    expect(snap(spot![0], spot![1])).toEqual(spot);
    // and the sentence names the neighbour, the height difference and the way to snap
    const c = padClash(cabin, 1.8, 0, 0, hill, placed)!;
    expect(clashText(c, 4)).toMatch(/Press S/);
    expect(clashText(c, 4)).toMatch(/timber cabin|cabin/i);
    expect(clashText(c, null)).toMatch(/Move it clear/);
  });

  it('a spot the other rules refuse is not suggested', () => {
    const cabin = KIT.timber_cabin, placed = [at('a', 'timber_cabin', 0, 0)];
    const snap = (px: number, pz: number) => snapCenter(cabin, px, pz, 0);
    expect(padSnap(cabin, 1.8, 0, 0, hill, placed, snap, () => false, 3)).toBeNull();
  });

  it('the plain placement rules are untouched', () => {
    const site: SiteQuery = { height: hill, owned: () => true, water: () => false };
    expect(placementProblem(KIT.timber_cabin, 0, 0, 0, site, [])).not.toBe('overlaps');
  });
});
