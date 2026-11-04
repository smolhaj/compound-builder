import { describe, expect, it } from 'vitest';
import { stageOf, styleOf } from './settlement';

describe('settlement stage', () => {
  it('grows with heads and needs a wall to be a village', () => {
    expect(stageOf({ heads: 4, homes: 1, rings: 0 })).toBe('homestead');
    expect(stageOf({ heads: 9, homes: 2, rings: 0 })).toBe('compound');
    expect(stageOf({ heads: 20, homes: 4, rings: 0 })).toBe('hamlet');
    expect(stageOf({ heads: 35, homes: 6, rings: 0 })).toBe('hamlet');
    expect(stageOf({ heads: 35, homes: 6, rings: 1 })).toBe('walled_village');
    expect(stageOf({ heads: 90, homes: 14, rings: 2 })).toBe('small_town');
    expect(stageOf({ heads: 90, homes: 3, rings: 2 })).toBe('walled_village');
  });
});
describe('play style', () => {
  const f = { tookIn: 0, turnedAway: 0, strangers: 0, heads: 4, exposure: 20 };
  it('hermit: nobody in, low profile', () => expect(styleOf(f)).toBe('hermit'));
  it('a loud place is no hermit', () => expect(styleOf({ ...f, exposure: 70 })).toBeNull());
  it('clan: relatives and neighbors only', () => expect(styleOf({ ...f, tookIn: 3, heads: 7 })).toBe('clan'));
  it('ark: picked a few, turned away many', () => expect(styleOf({ ...f, tookIn: 3, turnedAway: 9, strangers: 3, heads: 7 })).toBe('ark'));
  it('haven: took everyone', () => expect(styleOf({ ...f, tookIn: 14, turnedAway: 2, strangers: 9, heads: 18 })).toBe('haven'));
  it('mixed otherwise', () => expect(styleOf({ ...f, tookIn: 3, strangers: 2, heads: 7 })).toBeNull());
});
