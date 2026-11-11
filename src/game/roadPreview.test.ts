import { describe, expect, it } from 'vitest';
import { entrancePick, nearestSpot, setEntrancePick } from './roadPreview';

describe('picking the entrance on the map', () => {
  const spots = [{ z: 10, gateZ: 12 }, { z: 30, gateZ: 31 }, { z: 60, gateZ: 58 }];
  it('picks the candidate whose gate is nearest the point on the road', () => {
    expect(nearestSpot(spots, 0)).toBe(10);
    expect(nearestSpot(spots, 25)).toBe(30);
    expect(nearestSpot(spots, 50)).toBe(60);
    expect(nearestSpot([], 5)).toBeNull();
  });
  it('is off until the card registers, and off again after', () => {
    expect(entrancePick()).toBeNull();
    let got = -1;
    setEntrancePick({ spots, apply: z => { got = z; } });
    entrancePick()!.apply(30);
    expect(got).toBe(30);
    setEntrancePick(null);
    expect(entrancePick()).toBeNull();
  });
});
