import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { step } from './engine';
import { BURN_PER_DAY, heatDemand } from './heating';

describe('wood stove', () => {
  it('demand peaks in January and is nil in midsummer', () => {
    expect(heatDemand(15)).toBeCloseTo(1);
    expect(heatDemand(196)).toBe(0);
    expect(heatDemand(105)).toBeGreaterThan(0);
    expect(heatDemand(105)).toBeLessThan(heatDemand(30));
  });

  it('burns firewood through the winter', () => {
    let g = newGame(1, 1);
    g.stock.firewood = 20;
    g = step(g, 30);
    const burned = 20 - g.stock.firewood;
    expect(burned).toBeGreaterThanOrEqual(Math.floor(30 * BURN_PER_DAY * 0.85));
    expect(burned).toBeLessThanOrEqual(Math.ceil(30 * BURN_PER_DAY));
  });

  it('warns once a day when the woodpile is empty', () => {
    let g = newGame(1, 1);
    g.stock.firewood = 0;
    g = step(g, 20);
    const warnings = g.log.filter(e => e.text.startsWith('Out of firewood'));
    expect(warnings.length).toBeGreaterThan(0);
    expect(g.stock.firewood).toBe(0);
  });

  it('burns nothing in summer', () => {
    let g = newGame(1, 190);
    const w = g.stock.firewood;
    g = step(g, 10);
    expect(g.stock.firewood).toBe(w);
  });
});
