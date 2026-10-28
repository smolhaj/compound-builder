import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { step } from './engine';
import { BURN_PER_DAY, firewoodOutlook, heatDemand } from './heating';
import { isHome } from './blueprints';

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

  it('does not log the empty woodpile every day: once, then a reminder every two weeks', () => {
    let g = newGame(1, 1);
    g.stock.firewood = 0;
    g = step(g, 40);
    const n = g.log.filter(e => e.text.startsWith('Out of firewood')).length;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(4);
  });

  it('reads the woodpile against the next two months of cold', () => {
    const g = newGame(1, 300);
    g.stock.firewood = 0;
    const o = firewoodOutlook(g);
    expect(o.need).toBeGreaterThan(2);
    expect(o.short).toBeCloseTo(o.need, 5);
    g.stock.firewood = 50;
    expect(firewoodOutlook(g).short).toBe(0);
    expect(firewoodOutlook(newGame(1, 190)).need).toBeLessThan(1);
  });

  it('says where the cold night was: at camp, or in the house once it is built', () => {
    let g = newGame(1, 1);
    g.stock.firewood = 0;
    g.structures = g.structures.filter(x => !isHome(x.kind));
    g = step(g, 12);
    expect(g.log.some(e => e.text.startsWith('Out of firewood: a cold night at camp'))).toBe(true);
    g.structures.push({ id: 'cab', kind: 'timber_cabin', x: 10, z: 10, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
    g = step(g, 3);
    const last = g.log.filter(e => e.text.startsWith('Out of firewood')).at(-1)!;
    expect(last.text).toContain('in the timber cabin');
  });

  it('burns nothing in summer', () => {
    let g = newGame(1, 190);
    const w = g.stock.firewood;
    g = step(g, 10);
    expect(g.stock.firewood).toBe(w);
  });
});
