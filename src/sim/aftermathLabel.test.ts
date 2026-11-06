import { describe, expect, it } from 'vitest';
import { afterLabel } from './aftermathLabel';

describe('afterLabel', () => {
  it('matches the clock', () => {
    expect(afterLabel(3.07)).toBe('Later that night');
    expect(afterLabel(5.5)).toBe('First light');
    expect(afterLabel(9)).toBe('The morning after');
    expect(afterLabel(14)).toBe('The afternoon after');
    expect(afterLabel(19)).toBe('The evening after');
    expect(afterLabel(23)).toBe('Later that night');
    expect(afterLabel(29.5)).toBe('First light');
  });
});
