import { describe, expect, it } from 'vitest';
import { COMFORT_MAX, comfortOf } from './comfort';

describe('comfort and beauty', () => {
  const base = { green: 0, pond: false, home: true, kid: false };
  it('nothing without a home or without anything to enjoy', () => {
    expect(comfortOf({ ...base, green: 3, home: false })).toBe(0);
    expect(comfortOf(base)).toBe(0);
  });
  it('green things and water add up, kids a bit more', () => {
    expect(comfortOf({ ...base, green: 1 })).toBe(1.25);
    expect(comfortOf({ ...base, green: 2, pond: true })).toBe(3.5);
    expect(comfortOf({ ...base, green: 1, kid: true })).toBe(2.25);
  });
  it('is capped', () => expect(comfortOf({ green: 3, pond: true, home: true, kid: true })).toBe(COMFORT_MAX));
});
