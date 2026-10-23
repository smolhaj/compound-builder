import { describe, expect, it } from 'vitest';
import { solidSpans } from './perimeterGeometry';

describe('perimeter spans', () => {
  const run = { pts: [[0, 0], [10, 0]] as Array<[number, number]>, gates: [{ at: 4, w: 1 }] };
  it('leaves the gate open and builds from the start', () => {
    expect(solidSpans(run, 9)).toEqual([[0, 3.5], [4.5, 10]]);
    expect(solidSpans(run, 2)).toEqual([[0, 2]]);
    expect(solidSpans(run, 5)).toEqual([[0, 3.5], [4.5, 6]]);
  });
});
