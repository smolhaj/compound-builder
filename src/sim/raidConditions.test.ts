import { describe, expect, it } from 'vitest';
import { FLARE, SMOKE_ACC, STORM_FX, envOf, stormNow } from './raidConditions';
import { newGame } from './state';
import { dayIndex } from './state';

describe('what the air and the yard do to a fight', () => {
  it('a clear night is a plain night', () => { const e = envOf(newGame(1)); expect(e.acc).toBe(1); expect(e.detect).toBe(1); expect(e.storm).toBeNull(); expect(e.line).toBe(''); });
  it('a storm on the place spoils the aim and deadens the sound; one that has passed or not yet come does nothing', () => {
    const g = newGame(2), day = dayIndex(g.clock.t);
    g.weather = { active: { kind: 'blizzard', at: day, until: day + 1 }, last: -999 };
    const e = envOf(g); expect(e.storm).toBe('blizzard'); expect(e.acc).toBeLessThan(1); expect(e.detect).toBeLessThan(1); expect(e.line).toMatch(/blizzard/i);
    g.weather = { active: { kind: 'blizzard', at: day + 3, until: day + 4 }, last: -999 }; expect(stormNow(g)).toBeNull();
    g.weather = { active: { kind: 'blizzard', at: day - 5, until: day - 4 }, last: -999 }; expect(stormNow(g)).toBeNull();
  });
  it('every storm kind has a table row inside bounds; smoke and flares are sane', () => {
    for (const fx of Object.values(STORM_FX)) { expect(fx.acc).toBeGreaterThan(0.5); expect(fx.acc).toBeLessThanOrEqual(1); expect(fx.detect).toBeGreaterThan(0.5); expect(fx.detect).toBeLessThanOrEqual(1); }
    expect(SMOKE_ACC).toBeLessThan(1); expect(FLARE.secs).toBeGreaterThan(10);
  });
  it('livestock in the yard add to the warning, up to a cap; flares are counted', () => {
    const g = newGame(3); g.stock.goat = 4; g.stock.cow = 2; g.stock.flares = 3;
    const e = envOf(g); expect(e.animalNoise).toBeGreaterThan(0); expect(e.flares).toBe(3);
    g.stock.goat = 500; expect(envOf(g).animalNoise).toBeLessThanOrEqual(6);
  });
});
