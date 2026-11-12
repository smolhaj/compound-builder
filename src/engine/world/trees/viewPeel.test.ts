import { describe, expect, it } from 'vitest';
import { peelScale, setViewPeel, getViewPeel, viewPeelEpoch } from './viewPeel';

const person = { x: 0, y: 0.17, z: 0 };
const peel = { targets: [person] };

describe('viewPeel', () => {
  it('shrinks a crown standing between the camera and a person', () => {
    // camera 6 units out on +z, a tree (r 1.2) half way
    expect(peelScale(0, 1, 3, 1.2, 0, 0.3, 6, peel)).toBe(0);
  });
  it('leaves a tree beside the line, behind the person, or far from the lens alone', () => {
    expect(peelScale(4, 1, 3, 1.2, 0, 0.3, 6, peel)).toBe(1);       // off to the side
    expect(peelScale(0, 1, -4, 1.2, 0, 0.3, 6, peel)).toBe(1);      // background
    expect(peelScale(0, 1, -0.2, 1.2, 0, 0.3, 12, peel)).toBeLessThan(1); // a crown reaching back over the person is peeled
  });
  it('clears a crown in the lens\'s face even with nobody behind it', () => {
    expect(peelScale(3, 1, 0.5, 1.0, 3, 0.3, 1.0, { targets: [] })).toBe(0);
  });
  it('fades smoothly as a crown leaves the lane (no pop)', () => {
    const a = peelScale(0.4, 1, 3, 1.2, 0, 0.3, 6, peel), b = peelScale(0.8, 1, 3, 1.2, 0, 0.3, 6, peel), c = peelScale(1.2, 1, 3, 1.2, 0, 0.3, 6, peel);
    expect(a).toBeLessThanOrEqual(b); expect(b).toBeLessThanOrEqual(c); expect(c).toBeGreaterThan(0);
  });
  it('publishes and clears', () => {
    const e = viewPeelEpoch(); setViewPeel(peel); expect(getViewPeel()).toBe(peel); expect(viewPeelEpoch()).toBe(e + 1);
    setViewPeel(null); expect(getViewPeel()).toBeNull();
  });
});
