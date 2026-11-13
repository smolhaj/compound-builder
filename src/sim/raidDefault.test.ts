import { describe, expect, it } from 'vitest';
import { defaultStance, WALLED_BARRIER } from './raidDefault';

const ST = ['hide', 'parley', 'defend', 'trade', 'warn'] as const;
describe('the stance lit when a raid prompt opens', () => {
  it('Defend when the family is armed behind a closed wall line', () => {
    expect(defaultStance(ST, { armed: true, barrier: WALLED_BARRIER })).toBe('defend');
    expect(defaultStance(ST, { armed: true, barrier: 71 })).toBe('defend');
  });
  it('Hide otherwise: unarmed, or no wall to speak of', () => {
    expect(defaultStance(ST, { armed: false, barrier: 90 })).toBe('hide');
    expect(defaultStance(ST, { armed: true, barrier: WALLED_BARRIER - 1 })).toBe('hide');
  });
  it('never picks a stance the card does not offer', () => {
    expect(defaultStance(['hide', 'parley'], { armed: true, barrier: 90 })).toBe('hide');
  });
});
