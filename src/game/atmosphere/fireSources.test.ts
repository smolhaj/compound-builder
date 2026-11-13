import { describe, expect, it } from 'vitest';
import { fireSources, SMOLDER_DAYS } from './fireSources';

const ground = () => 1;
const box = { cx: 5, cz: 6, w: 1, d: 2, y0: 1, h: 0.8 };
describe('fireSources', () => {
  it('draws nothing on a quiet place', () => { expect(fireSources({ clock: { t: 10 } }, () => box, ground)).toEqual([]); });
  it('puts flames on the burning building, hottest first, from its box', () => {
    const s = fireSources({ clock: { t: 10 }, raidFires: [{ structure: 'a', x: 0, z: 0, intensity: 0.3 }, { structure: 'b', x: 0, z: 0, intensity: 0.9 }] }, () => box, ground);
    expect(s.map(x => x.intensity)).toEqual([0.3, 0.9].reverse());
    expect(s[0].x).toBe(5); expect(s[0].smolder).toBe(0); expect(s[0].y).toBeGreaterThan(box.y0);
  });
  it('falls back to the fire point when the building is not in the scene', () => {
    const s = fireSources({ clock: { t: 10 }, raidFires: [{ structure: 'a', x: 3, z: 4, intensity: 2 }] }, () => undefined, ground);
    expect(s[0].x).toBe(3); expect(s[0].intensity).toBe(1);
  });
  it('smolders a fresh uncleared burn scar and lets an old or cleared one go', () => {
    const g = { clock: { t: 20.5 }, raidDamage: [
      { kind: 'burn', x: 1, z: 1, day: 20, done: 0, hours: 5 }, { kind: 'burn', x: 2, z: 2, day: 20 - SMOLDER_DAYS, done: 0, hours: 5 },
      { kind: 'burn', x: 3, z: 3, day: 20, done: 5, hours: 5 }, { kind: 'breach', x: 4, z: 4, day: 20, done: 0, hours: 5 }] };
    const s = fireSources(g, () => box, ground);
    expect(s).toHaveLength(1); expect(s[0].smolder).toBeGreaterThan(0.7); expect(s[0].intensity).toBe(0);
  });
  it('caps at eight', () => {
    const fires = Array.from({ length: 12 }, (_, i) => ({ structure: 's' + i, x: i, z: 0, intensity: 0.5 }));
    expect(fireSources({ clock: { t: 1 }, raidFires: fires }, () => box, ground)).toHaveLength(8);
  });
});
