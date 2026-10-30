import { describe, expect, it } from 'vitest';
import { HOUSING_STYLES, STYLE_ORDER, cellarHouses, fitOf, hasBasement } from './housingStyles';
import { BLUEPRINTS, HOMES, HOME_BEDS, totalBill, totalHours } from './blueprints';
import { newGame } from './state';
import { KIT } from '../game/buildkit/kit';
import { placementProblem, type SiteQuery } from '../game/buildkit/kit';

describe('the lodge on a stone plinth (flat ground)', () => {
  it('is a housing style with a blueprint, beds and a kit piece, listed after the lodge', () => {
    expect(STYLE_ORDER.indexOf('lodge_plinth')).toBe(STYLE_ORDER.indexOf('lodge') + 1);
    expect(HOMES).toContain('lodge_plinth');
    expect(HOME_BEDS.lodge_plinth).toBe(10);
    expect(BLUEPRINTS.lodge_plinth.stages.length).toBe(5);
    expect(KIT.lodge_plinth.sleeps).toBe(10);
    expect(KIT.lodge_plinth.walkoutFall).toBeUndefined();
  });
  it('is cheaper and quicker than the walkout lodge, and has no excavator', () => {
    const a = totalBill(BLUEPRINTS.lodge), b = totalBill(BLUEPRINTS.lodge_plinth);
    expect(b.excavator ?? 0).toBe(0);
    expect(b.concrete!).toBeLessThan(a.concrete!);
    expect(totalHours(BLUEPRINTS.lodge_plinth)).toBeLessThan(totalHours(BLUEPRINTS.lodge));
  });
  it('has no basement: no cold cellar, little fallout protection', () => {
    expect(hasBasement('lodge_plinth')).toBe(false);
    expect(hasBasement('lodge')).toBe(true);
    expect(HOUSING_STYLES.lodge_plinth.pf).toBeLessThan(HOUSING_STYLES.lodge.pf);
    const g = newGame(1);
    g.structures.push({ id: 'p', kind: 'lodge_plinth', x: 0, z: 0, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
    expect(cellarHouses(g)).toEqual([]);
  });
  it('can be built on level land where the walkout lodge is ruled out, and still needs timber', () => {
    const site = { region: 'mountain_west', timber: 1, lot: null, home: { x0: 0, z0: 0, x1: 10, z1: 10 } } as Parameters<typeof fitOf>[0];
    expect(fitOf(site, 'lodge_plinth').off).toBeNull();
    expect(fitOf({ ...site, timber: 0.1 }, 'lodge_plinth').off).toMatch(/timber/);
  });
  it('is placeable on flat ground while the walkout lodge is refused there', () => {
    const flat: SiteQuery = { height: () => 0, owned: () => true, water: () => false };
    expect(placementProblem(KIT.lodge, 0, 0, 0, flat, [])).toBe('needs_slope');
    expect(placementProblem(KIT.lodge_plinth, 0, 0, 0, flat, [])).toBeNull();
  });
});
