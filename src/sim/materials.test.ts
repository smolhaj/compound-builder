import { describe, expect, it } from 'vitest';
import { billText, qtyText, waitingFor } from './materials';

describe('quantities for people', () => {
  it('rounds: whole from 10, one decimal to 1, two below, nothing for a sliver', () => {
    expect(qtyText(0.013801845388343725)).toBe('0.01');
    expect(qtyText(0.5)).toBe('0.5');
    expect(qtyText(2.349)).toBe('2.3');
    expect(qtyText(12.6)).toBe('13');
    expect(qtyText(0.004)).toBeNull();
  });
  it('writes a bill without raw floats and hides what rounds to zero', () => {
    expect(billText({ seed: 0.013801845388343725, lumber: 3 })).toBe('0.01 heirloom field seed, 3 lumber');
    expect(billText({ seed: 0.001 })).toBe('');
  });
  it('says something even when only a sliver is missing', () => {
    expect(waitingFor({ seed: 0.013801845388343725 })).toBe('Waiting for 0.01 heirloom field seed');
    expect(waitingFor({ seed: 0.001 })).toBe('Waiting for a little more material');
  });
});
