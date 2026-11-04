import { describe, expect, it } from 'vitest';
import { addFix, crackGlass, pendingFixes, type Fix } from './improvements';
import type { Structure } from './state';

const house = (fixes?: Fix[]) => ({ id: 's1', kind: 'timber_cabin', fixes } as unknown as Structure);
const burst = (done = 0): Fix => ({ part: 'plumbing', cond: 'fair', done, hours: 20, supplied: false });

describe('repair jobs: one row per part', () => {
  it('a second break after the repair replaces the finished row instead of adding a twin (duplicate keys in the Projects tab)', () => {
    const st = house([burst(20)]);
    expect(addFix(st, burst())).toBe(true);
    expect(st.fixes!.filter(f => f.part === 'plumbing')).toHaveLength(1);
    expect(pendingFixes(st)).toHaveLength(1);
  });
  it('a part that is still broken is not broken twice', () => {
    const st = house([burst(5)]);
    expect(addFix(st, burst())).toBe(false);
    expect(st.fixes).toHaveLength(1);
    expect(st.fixes![0].done).toBe(5);
  });
  it('other parts are left alone', () => {
    const st = house([{ part: 'roof', cond: 'poor', done: 0, hours: 40, supplied: false }]);
    addFix(st, burst());
    expect(st.fixes!.map(f => f.part).sort()).toEqual(['plumbing', 'roof']);
  });
  it('hail twice on a greenhouse leaves one glass row', () => {
    const st = house();
    expect(crackGlass(st, 'fair')).toBe(true);
    st.fixes![0].done = st.fixes![0].hours;
    expect(crackGlass(st, 'poor')).toBe(true);
    expect(st.fixes!.filter(f => f.part === 'glass')).toHaveLength(1);
    expect(st.fixes![0].cond).toBe('poor');
  });
});
