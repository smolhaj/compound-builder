import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { step } from './engine';
import { BURN_PER_DAY, heatDemand } from './heating';
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

  it('warns once when the woodpile runs out, not every night after (playtest round 3: 1,070 times in an idle run)', () => {
    let g = newGame(1, 1);
    g.stock.firewood = 0;
    g = step(g, 20);
    const warnings = g.log.filter(e => e.text.startsWith('Out of firewood'));
    expect(warnings.length).toBe(1);
    expect(g.stock.firewood).toBe(0);
    // stocked again, then out again: a new warning
    g.stock.firewood = 1;
    g = step(g, 3);
    g = step(g, 10);
    expect(g.log.filter(e => e.text.startsWith('Out of firewood')).length).toBe(2);
  });

  it('says where the cold night was: at camp, or in the house once it is built', () => {
    let g = newGame(1, 1);
    g.stock.firewood = 0;
    g.structures = g.structures.filter(x => !isHome(x.kind));
    g = step(g, 12);
    expect(g.log.some(e => e.text.startsWith('Out of firewood: a cold night at camp'))).toBe(true);
    g.structures.push({ id: 'cab', kind: 'timber_cabin', x: 10, z: 10, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
    g.stock.firewood = 1;   // a rick to get through the move, then out again
    g = step(g, 12);
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
