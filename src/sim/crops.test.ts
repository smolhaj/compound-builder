import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { REGIONS } from './regions';
import { autoCrop, cropsDay, fertFactor, fieldFactor, keepSeed, lateFactor, offspringVigor, pinField, plotsOf, rotationFactor, seedTarget, sowWindow, troubleOf, VIGOR, setSuccession, gardenFactor, successionDays } from './crops';
import { fieldHarvestSplit } from './needs';
import { dutyWork } from './daily';
import { kitOf } from './tools';

const built = (g: GameState, id: string, kind: string): Structure => {
  const st: Structure = { id, kind, x: 10, z: 10, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: -100 };
  g.structures.push(st);
  return st;
};
const atDoy = (g: GameState, doy: number) => { g.clock.t = doy - g.clock.startDoy + 365 * 0 + 0.3; };

describe('crops', () => {
  it('auto rotation cycles beans, potatoes, wheat; no cellar means no potatoes', () => {
    const g = newGame(1);
    built(g, 'c', 'root_cellar');
    expect(autoCrop(g, null, 0)).toBe('beans');
    expect(autoCrop(g, 'beans', 0)).toBe('potatoes');
    expect(autoCrop(g, 'potatoes', 0)).toBe('wheat');
    expect(autoCrop(g, 'wheat', 0)).toBe('beans');
    expect(autoCrop(g, 'rest', 0)).toBe('potatoes');
    const h = newGame(1);
    expect(autoCrop(h, 'beans', 0)).toBe('wheat');
  });

  it('the same crop twice pays; a legume year before potatoes or wheat is worth more', () => {
    expect(rotationFactor('potatoes', 'potatoes', null)).toBeLessThan(0.8);
    expect(rotationFactor('potatoes', 'potatoes', 'potatoes')).toBeLessThan(rotationFactor('potatoes', 'potatoes', null));
    expect(rotationFactor('potatoes', 'beans', null)).toBeGreaterThan(1);
    expect(rotationFactor('wheat', 'beans', null)).toBeGreaterThan(1);
    expect(rotationFactor('beans', 'beans', null)).toBeLessThan(1);
    expect(rotationFactor('wheat', 'potatoes', null)).toBe(1);
  });

  it('fertility makes the crop; hybrid seed saves badly, heirloom adapts', () => {
    expect(fertFactor(1)).toBe(1);
    expect(fertFactor(0.6)).toBeLessThan(fertFactor(1));
    expect(fertFactor(1.3)).toBeGreaterThan(1);
    expect(offspringVigor({ y: 1, doy: 1, line: 'hybrid', v: VIGOR.hybrid, late: 1 })).toBe(VIGOR.fromHybrid);
    expect(offspringVigor({ y: 1, doy: 1, line: 'heirloom', v: 1, late: 1 })).toBeCloseTo(1.01);
    expect(offspringVigor({ y: 1, doy: 1, line: 'saved', v: 0.8, late: 1 })).toBeCloseTo(0.84);
    expect(offspringVigor({ y: 1, doy: 1, line: 'saved', v: 1.04, late: 1 })).toBe(1.04);
  });

  it('sowing late fades the crop to a catch crop and then nothing', () => {
    const g = newGame(1);
    const [, w1] = sowWindow(g);
    expect(lateFactor(g, w1)).toBe(1);
    expect(lateFactor(g, w1 + 21)).toBeLessThan(1);
    expect(lateFactor(g, w1 + 21)).toBeGreaterThan(0.35);
    expect(lateFactor(g, REGIONS[g.site.region].frost[1] - 40)).toBe(0);
  });

  it('spring sowing draws a unit of seed a field in the player order; none means fallow', () => {
    const g = newGame(1);
    built(g, 'f1', 'field'); built(g, 'f2', 'field');
    plotsOf(g).f1 = { kind: 'field', fert: 1, prev: null, prev2: null, crop: null, loads: 0, cover: false, settled: -1, planted: true };
    plotsOf(g).f2 = { ...plotsOf(g).f1 };
    g.stock.seed = 1; g.stock.seed_saved = 0; g.stock.seed_hybrid = 0;
    atDoy(g, sowWindow(g)[0] + 1);
    const lines = cropsDay(g);
    expect(plotsOf(g).f1.sown?.line).toBe('heirloom');
    expect(plotsOf(g).f2.sown).toBeUndefined();
    expect(g.stock.seed).toBe(0);
    expect(lines.join(' ')).toMatch(/No seed left for 1 field/);
    expect(fieldFactor(g, g.structures.find(s => s.id === 'f2')!).total).toBe(0);
  });

  it('manure and compost raise fertility at sowing; a pinned rest year builds the soil', () => {
    const g = newGame(1);
    built(g, 'f1', 'field');
    plotsOf(g).f1 = { kind: 'field', fert: 1, prev: null, prev2: null, crop: null, loads: 0, cover: false, settled: -1, planted: true };
    g.stock.seed = 3; g.stock.manure = 2; g.stock.compost = 5;
    atDoy(g, sowWindow(g)[0] + 1);
    cropsDay(g);
    const p = plotsOf(g).f1;
    expect(p.loads).toBe(3);
    expect(p.fert).toBeGreaterThan(1.1);
    expect(pinField(g, 'f1', 'rest')).toBeNull();
    expect(plotsOf(g).f1.pin).toBe('rest');
    expect(pinField(g, 'nope', 'rest')).not.toBeNull();
  });

  it('harvest days set next spring\'s seed aside, never more than two fifths of the day', () => {
    const g = newGame(1);
    built(g, 'f1', 'field'); built(g, 'f2', 'field');
    g.stock.seed = 0; g.stock.seed_saved = 0;
    expect(seedTarget(g)).toBe(3);
    const kept = keepSeed(g, 10_000);
    expect(kept).toBe(4000);
    expect(g.stock.seed_saved).toBeCloseTo(4000 / 45_000);
    g.stock.seed = 5;
    expect(keepSeed(g, 10_000)).toBe(0);
  });

  it('trouble is seeded per game and year, and a rotated field takes about half of it', () => {
    let blight: number | null = null;
    for (let y = 2027; y < 2300 && blight === null; y++) if (troubleOf(1, y)?.name === 'late blight') blight = y;
    expect(blight).not.toBeNull();
    expect(troubleOf(1, blight!)).toEqual(troubleOf(1, blight!));
  });

  it('gardens: successions add crop and a little season, and more weeding', () => {
    const g = newGame(1);
    built(g, 'g1', 'garden');
    expect(gardenFactor(g)).toBe(1);
    expect(successionDays(g)).toBe(0);
    setSuccession(g, 'g1', 3);
    expect(gardenFactor(g)).toBeCloseTo(1.14);
    expect(successionDays(g)).toBe(16);
  });

  it('a lone old field with no plot still yields (an old save or a test state)', () => {
    const g = newGame(1, 250);
    built(g, 'f', 'field');
    expect(fieldHarvestSplit(g).total).toBeGreaterThan(0);
  });

  it('working the garden and the fields wears the tools and the hours count', () => {
    const g = newGame(1);
    const before = kitOf(g).hours;
    dutyWork(g, g.people[0], g.personState[0], 'garden', 4);
    expect(kitOf(g).hours).toBeGreaterThan(before);
  });
});
