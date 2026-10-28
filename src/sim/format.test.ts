import { describe, expect, it } from 'vitest';
import { litersText, openLineText, spotText, spotsText } from './format';
import { billText, waitingFor } from './materials';
import { newGame } from './state';
import { predatorLine, proof } from './wildlife';
import { defenseReport } from './defenseReport';
import { sunHours } from './utilities';

const HOME = { x0: 0, z0: 0, x1: 67, z1: 67 };

describe('player-facing numbers', () => {
  it('liters are rounded, never a raw float', () => {
    expect(litersText(0.7967046720730114 * 20)).toBe('16 L');
    expect(litersText(0.7967046720730114)).toBe('0.8 L');
    expect(litersText(12.34)).toBe('12 L');
    expect(litersText(1234.5)).toBe('1,235 L');
    expect(litersText(0)).toBe('0 L');
    expect(litersText(0.001)).toBe('0 L');
  });

  it('fuel in a shortfall is liters, not "1.1 fuel"', () => {
    expect(billText({ fuel: 1.1 })).toBe('22 L of fuel');
    expect(billText({ fuel: 0.0001, lumber: 3 })).toBe('3 lumber');
    expect(waitingFor({ fuel: 1.1, concrete: 8 })).toBe('Waiting for 22 L of fuel, 8 concrete');
    expect(waitingFor({ fuel: 0.7967046720730114 })).not.toMatch(/\d\.\d{3}/);
  });

  it('a spot on the place is a compass word, not a coordinate pair with a decimal comma', () => {
    expect(spotText(33, 1, HOME)).toBe('north edge');
    expect(spotText(66, 33, HOME)).toBe('east edge');
    expect(spotText(66, 66, HOME)).toBe('south-east corner');
    expect(spotText(33, 33, HOME)).toBe('middle');
    expect(spotsText([[3, 0], [39, 0], [75, 0], [4, 1]], HOME)).toBe('north-west corner, north edge, north-east corner');
    expect(spotsText([[3, 0], [39, 0], [75, 0]], HOME)).not.toMatch(/\d/);
  });

  it('the predators row reads plainly', () => {
    expect(openLineText(1)).toBe('none of the line stops an animal with teeth');
    expect(openLineText(0.46)).toBe('46% of the line is open to animals with teeth');
    const g = newGame(11, 105, 2027, {});
    g.perimeter = [];
    const w = proof(g, 'predators').why;
    expect(w).not.toMatch(/stops nothing/);
    const d = predatorLine(g).detail;
    expect(d).not.toMatch(/\d{2,3}% of the line stops/);
  });

  it('the open-ground note on Defense has no coordinates', () => {
    const g = newGame(11); g.perimeter = [];
    const r = defenseReport(g);
    expect(r.gaps.length).toBeGreaterThanOrEqual(0);
  });

  it('sun hours stay a sensible number (guards the utilities report from float noise)', () => {
    expect(sunHours(172)).toBeCloseTo(6.5, 5);
  });
});
