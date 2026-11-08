import { describe, expect, it } from 'vitest';
import { nervesAim, woundFx } from './lingering';

describe('what lasts into the next fight', () => {
  it('no wounds, no penalty', () => { expect(woundFx([])).toEqual({ acc: 1, limp: 1, speed: 1 }); expect(woundFx(undefined).acc).toBe(1); });
  it('an arm in a sling shoots worse, a leg wound limps, a head wound dulls, worse wounds worse', () => {
    const arm = woundFx([{ what: 'shot in the arm', sev: 50 }]), leg = woundFx([{ what: 'shot in the leg', sev: 60 }]), head = woundFx([{ what: 'head wound', sev: 60 }]);
    expect(arm.acc).toBeLessThan(1); expect(arm.limp).toBe(1); expect(leg.limp).toBeGreaterThan(1.5); expect(leg.speed).toBeLessThan(0.7); expect(leg.acc).toBe(1); expect(head.acc).toBeLessThan(1);
    expect(woundFx([{ what: 'shot in the arm', sev: 80 }]).acc).toBeLessThan(arm.acc);
  });
  it('stacks, but never past a floor, and a healed wound (gone from the list) costs nothing', () => {
    const many = woundFx(Array.from({ length: 12 }, () => ({ what: 'shot in the arm', sev: 90 })));
    expect(many.acc).toBeGreaterThanOrEqual(0.5); expect(woundFx(Array.from({ length: 12 }, () => ({ what: 'shot in the leg', sev: 90 }))).limp).toBeLessThanOrEqual(3);
  });
  it('shaken nerves spoil the aim, within a bound', () => {
    expect(nervesAim(undefined)).toBe(0); expect(nervesAim({ trauma: 0, stress: 20 })).toBe(0);
    expect(nervesAim({ trauma: 80, stress: 90 })).toBeGreaterThan(nervesAim({ trauma: 20, stress: 30 })); expect(nervesAim({ trauma: 100, stress: 100 })).toBeLessThanOrEqual(1.4);
  });
});
