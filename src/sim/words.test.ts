import { describe, expect, it } from 'vitest';
import { listText, materialCount, nounFor, pluralize, pluralOf } from './words';
import { billText, MATERIAL_IDS, MATERIALS, emptyStock } from './materials';
import { epidemicCountText } from './medical';

describe('pluralize', () => {
  it('counts one and many', () => {
    expect(pluralize(1, 'day')).toBe('1 day');
    expect(pluralize(0, 'day')).toBe('0 days');
    expect(pluralize(2, 'door')).toBe('2 doors');
    expect(pluralize(1.5, 'week')).toBe('1.5 weeks');
    expect(pluralize('1.0', 'year')).toBe('1.0 year');
    expect(pluralize(12000, 'hour')).toBe('12,000 hours');
  });
  it('knows the regular and irregular plurals', () => {
    expect(pluralOf('pantry')).toBe('pantries');
    expect(pluralOf('box')).toBe('boxes');
    expect(pluralOf('key')).toBe('keys');
    expect(pluralize(1, 'person')).toBe('1 person');
    expect(pluralize(3, 'person')).toBe('3 people');
    expect(pluralize(2, 'case', 'cases')).toBe('2 cases');
    expect(nounFor(1, 'bed')).toBe('bed');
  });
  it('lists', () => {
    expect(listText([])).toBe('');
    expect(listText(['a'])).toBe('a');
    expect(listText(['a', 'b'])).toBe('a and b');
    expect(listText(['a', 'b', 'c'])).toBe('a, b and c');
  });
});

describe('material counts read right', () => {
  it('uses the singular for one of a material named in the plural', () => {
    expect(billText({ hardware: 1 })).toBe('1 door and window kit');
    expect(billText({ hardware: 3 })).toBe('3 door and window kits');
    expect(billText({ snares: 1 })).toBe('1 dozen snares');
    expect(billText({ crocks: 1 })).toBe('1 fermenting crock');
    expect(billText({ pipe: 1 })).toBe('1 coil of PEX pipe');
    expect(billText({ pipe: 5, roofing: 3 })).toBe('5 coils of PEX pipe, 3 metal roofing');
  });
  it('never prints "1 <plural noun>" for any material', () => {
    for (const id of MATERIAL_IDS) {
      const t = materialCount(id, 1, MATERIALS[id].name);
      expect(t, id).not.toMatch(/^1 (doors|snares|crocks|panels|batteries|trees|whips|fixtures)\b/i);
      expect(t, id).not.toMatch(/pex/);   // (the acronym keeps its capitals)
    }
    expect(Object.keys(emptyStock()).length).toBeGreaterThan(0);
  });
});

describe('the epidemic count', () => {
  it('counts people sick now, and shows the running tally only when it says more', () => {
    expect(epidemicCountText(3, 3)).toBe('3 sick now');
    expect(epidemicCountText(2, 43)).toBe('2 sick now (43 cases since it started)');
    expect(epidemicCountText(0, 1)).toBe('nobody sick right now (1 case since it started)');
  });
});

describe('family names', () => {
  it('names ending in s, x, z, ch or sh take -es; the rest take -s', async () => {
    const { pluralSurname, singularSurname, familyLabel } = await import('./words');
    expect(pluralSurname('Ortiz')).toBe('Ortizes');
    expect(pluralSurname('Cross')).toBe('Crosses');
    expect(pluralSurname('Marsh')).toBe('Marshes');
    expect(pluralSurname('Birch')).toBe('Birches');
    expect(pluralSurname('Knox')).toBe('Knoxes');
    expect(pluralSurname('Bauer')).toBe('Bauers');
    expect(pluralSurname('Running Horse')).toBe('Running Horses');
    // stored plurals, including the "Ortizs" that older games saved
    expect(singularSurname('the Ortizes')).toBe('Ortiz');
    expect(singularSurname('the Ortizs')).toBe('Ortiz');
    expect(singularSurname('the Hendersons')).toBe('Henderson');
    expect(singularSurname('the Running Horses')).toBe('Running Horse');
    expect(familyLabel('the Ortizs')).toBe('the Ortizes');
    expect(familyLabel('the Ortizes')).toBe('the Ortizes');
    expect(familyLabel('the Bauers')).toBe('the Bauers');
  });
  it('every generated neighbor household reads right (the Ortiz family was "the Ortizs")', async () => {
    const { generateNeighbors } = await import('./encounters');
    const names = new Set<string>();
    for (let seed = 1; seed <= 80; seed++) for (const n of generateNeighbors(seed)) names.add(n.name);
    expect([...names]).toContain('the Ortizes');
    for (const n of names) expect(n).not.toMatch(/(z|x|ch|sh)s$/);
  });
});
