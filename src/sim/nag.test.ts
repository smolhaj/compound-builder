import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { logGate } from './nag';

describe('logGate', () => {
  it('lets a subject through once per window, and subjects are independent', () => {
    const g = newGame(1);
    g.clock.t = 100;
    expect(logGate(g, 'vet:a', 14)).toBe(true);
    g.clock.t = 105;
    expect(logGate(g, 'vet:a', 14)).toBe(false);
    expect(logGate(g, 'vet:b', 14)).toBe(true);
    g.clock.t = 114.5;
    expect(logGate(g, 'vet:a', 14)).toBe(true);
  });
  it('drops stale keys when the table grows', () => {
    const g = newGame(1);
    g.clock.t = 1;
    for (let i = 0; i < 210; i++) logGate(g, `k${i}`, 5);
    g.clock.t = 200;
    logGate(g, 'fresh', 5);
    expect(Object.keys(g.nagged!)).toEqual(['fresh']);
  });
});
