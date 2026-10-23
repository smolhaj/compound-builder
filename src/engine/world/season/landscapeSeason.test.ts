import { describe, expect, it } from 'vitest';
import { dayOfYear, landscapeSeasonFor } from './seasonState';

const termDoy = (term: 'summer' | 'fall' | 'spring', day: number): number =>
  ({ summer: dayOfYear(7, 1), fall: dayOfYear(9, 1), spring: 1 })[term] + day - 1;

describe('landscape season follows the calendar date, not the academic term', () => {
  it('January in the spring term is winter where ponds freeze, a mild fall where they do not', () => {
    // The term alone said "spring" on 1 January: quad flower beds bloomed and
    // fountains ran under snow (bldgLandscape's winter branches never fired).
    expect(landscapeSeasonFor(termDoy('spring', 1), 'new_england')).toBe('winter');
    expect(landscapeSeasonFor(termDoy('spring', 1), 'midwest_plains')).toBe('winter');
    expect(landscapeSeasonFor(termDoy('spring', 1), 'deep_south')).toBe('fall');
    expect(landscapeSeasonFor(termDoy('spring', 1), 'southern_california')).toBe('fall');
    expect(landscapeSeasonFor(termDoy('spring', 100), 'midwest_plains')).toBe('spring');
    expect(landscapeSeasonFor(termDoy('fall', 10), 'midwest_plains')).toBe('fall');
    expect(landscapeSeasonFor(termDoy('summer', 10), 'midwest_plains')).toBe('summer');
  });
});
