import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { step } from './engine';

describe('step: frames shorter than a sub-step', () => {
  it('moves only the clock and shares the rest of the state', () => {
    const g = newGame(3);
    const n = step(g, 0.0005);
    expect(n.clock.t).toBeCloseTo(g.clock.t + 0.0005, 9);
    expect(n.people).toBe(g.people);
    expect(g.clock.t).not.toBe(n.clock.t);
  });
  it('gives the same result however time is chopped', () => {
    const a = newGame(3);
    let b = a;
    for (let i = 0; i < 200; i++) b = step(b, 0.01);
    const c = step(a, 2);
    expect(b.clock.ticks).toBe(c.clock.ticks);
    expect(b.clock.t).toBeCloseTo(c.clock.t, 6);
    expect(JSON.stringify(b.stock)).toBe(JSON.stringify(c.stock));
  });
});
