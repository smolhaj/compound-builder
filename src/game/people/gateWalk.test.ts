import { describe, expect, it } from 'vitest';
import { gateRole, leaveGoal } from './gateWalk';
import type { Person } from '../../sim/family';

const P = (origin?: Person['origin']) => ({ id: 'p1', origin } as unknown as Person);
const S = (o: { left?: boolean; died?: number } = {}) => ({ needs: { ...o } } as never);

describe('gateWalk', () => {
  it('a guest taken in today arrives; the family does not', () => {
    expect(gateRole(P({ kind: 'guest', since: 40 }), S(), 40)).toBe('arriving');
    expect(gateRole(P({ kind: 'guest', since: 40 }), S(), 41)).toBeNull();
    expect(gateRole(P(), S(), 40)).toBeNull();
  });
  it('someone who has moved out is leaving, even on the day they came', () => {
    expect(gateRole(P({ kind: 'guest', since: 40 }), S({ left: true, died: 40 }), 40)).toBe('leaving');
    expect(gateRole(P({ kind: 'stranger', since: 3 }), S({ left: true, died: 50 }), 60)).toBe('leaving');
  });
  it('the dead do not arrive', () => {
    expect(gateRole(P({ kind: 'guest', since: 40 }), S({ died: 40 }), 40)).toBeNull();
  });
  it('the leave goal is the road end, hidden', () => {
    const g = leaveGoal({ x: 1, z: 2 });
    expect([g.x, g.z, g.hidden]).toEqual([1, 2, true]);
  });
});
