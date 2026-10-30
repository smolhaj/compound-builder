import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { CLASSIC } from './site';
import { addFood, foodUnits } from './pantry';
import { kitchenOf } from './kitchen';
import { makeSoap, SOAP, soapProblem } from './soap';

const game = (): GameState => { const g = newGame(3, 105, 2027, { site: CLASSIC }); g.stock.firewood = 5; for (const p of g.people) p.skills.gardener = 0; return g; };

describe('soap from lard and ash', () => {
  it('needs lard, firewood and someone who can cook', () => {
    const g = game();
    expect(soapProblem(g)).toMatch(/lard/);
    addFood(g, 'lard', 2);
    g.stock.firewood = 0.1;
    expect(soapProblem(g)).toMatch(/firewood/);
  });
  it('a batch uses a pail and half a rick and gives person-months of hygiene supplies', () => {
    const g = game(); addFood(g, 'lard', 2); g.stock.hygiene = 1;
    const lard0 = foodUnits(g, 'lard'), staples0 = g.stock.staples;
    expect(makeSoap(g)).toBeNull();
    expect(foodUnits(g, 'lard')).toBeCloseTo(lard0 - SOAP.lard);
    expect(g.stock.firewood).toBeCloseTo(5 - SOAP.firewood);
    expect(g.stock.hygiene).toBeGreaterThanOrEqual(1 + SOAP.hygiene);
    expect(g.stock.staples).toBeLessThan(staples0 + 1e-9);
    expect(kitchenOf(g).hours).toBeGreaterThanOrEqual(SOAP.hours);
  });
  it('with no more lard the second batch refuses', () => {
    const g = game(); addFood(g, 'lard', 1);
    expect(makeSoap(g)).toBeNull();
    expect(makeSoap(g)).toMatch(/lard/);
  });
});
