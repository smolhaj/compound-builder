import { describe, expect, it } from 'vitest';
import { calendarOf, dayIndex, hourOf, newGame } from './state';

describe('clock', () => {
  it('starts at 06:00 and runs through midnight', () => {
    expect(hourOf(0)).toBeCloseTo(6);
    expect(hourOf(0.25)).toBeCloseTo(12);
    expect(hourOf(0.75 - 1e-9)).toBeCloseTo(24, 5);
    expect(hourOf(0.75)).toBeCloseTo(0);
    expect(hourOf(1)).toBeCloseTo(6);
  });

  it('turns the day at midnight and walks the calendar over the new year', () => {
    expect(dayIndex(0)).toBe(0);
    expect(dayIndex(0.74)).toBe(0);
    expect(dayIndex(0.76)).toBe(1);
    const g = newGame(1, 364, 2027);
    expect(calendarOf(g.clock, 0)).toEqual({ doy: 364, year: 2027 });
    expect(calendarOf(g.clock, 1)).toEqual({ doy: 365, year: 2027 });
    expect(calendarOf(g.clock, 2)).toEqual({ doy: 1, year: 2028 });
  });
});
