import { describe, expect, it } from 'vitest';
import { pickHomeLine, type LineInput } from './domesticLines';

const base: LineInput = { ritual: 'dinner', stance: 'settled', hour: 18.3, kid: false, elder: false, morale: 70, food: 'plenty', cold: 0.3, snowing: false, seed: 1 };
const all = (f: (seed: number) => LineInput) => Array.from({ length: 40 }, (_, s) => pickHomeLine(f(s))?.text ?? '');

describe('domestic lines', () => {
  it('is deterministic and says nothing outside a ritual', () => {
    expect(pickHomeLine(base)).toEqual(pickHomeLine({ ...base }));
    expect(pickHomeLine({ ...base, ritual: null })).toBeNull();
    expect(pickHomeLine({ ...base, ritual: 'play', kid: false })).toBeNull();
  });
  it('calm lines are whole, warm sentences with no scared fragments', () => {
    for (const r of ['dinner', 'fireside', 'play', 'bed'] as const) for (const kid of [false, true]) for (const t of all(s => ({ ...base, ritual: r, kid, seed: s }))) {
      if (!t) continue;
      expect(t).not.toMatch(/get down|stay low|at the gate|scared|no, no/i);
    }
  });
  it('the table follows the food', () => {
    expect(all(s => ({ ...base, food: 'bare', seed: s })).every(t => /broth|share/i.test(t))).toBe(true);
    expect(all(s => ({ ...base, food: 'lean', seed: s })).some(t => /stretch|easy|slow/i.test(t))).toBe(true);
    expect(all(s => ({ ...base, dish: 'rice', seed: s })).some(t => /^Rice again/.test(t))).toBe(true);
  });
  it('fireside lines read the weather and the age', () => {
    expect(all(s => ({ ...base, ritual: 'fireside', snowing: true, seed: s })).some(t => /snow/i.test(t))).toBe(true);
    expect(all(s => ({ ...base, ritual: 'fireside', cold: 0.9, seed: s })).some(t => /wind|out there|closer/i.test(t))).toBe(true);
    expect(all(s => ({ ...base, ritual: 'fireside', kid: true, seed: s })).some(t => /story|bear|dog/i.test(t))).toBe(true);
    expect(all(s => ({ ...base, ritual: 'fireside', seed: s })).some(t => /lamp|log/i.test(t))).toBe(true);
  });
  it('a tired, low household is quieter', () => {
    expect(all(s => ({ ...base, morale: 20, seed: s })).some(t => /hungry|long day|anyway|sit here/i.test(t))).toBe(true);
  });
  it('under threat civilians speak in short scared fragments, the little ones asking for a parent', () => {
    const a = pickHomeLine({ ...base, stance: 'alert', seed: 2 })!, k = pickHomeLine({ ...base, stance: 'alert', kid: true, seed: 0 })!;
    expect(a.tone).toBe('scared');
    expect(a.text.split(/\s+/).length).toBeLessThanOrEqual(7);
    expect(k.tone).toBe('scared');
    expect(pickHomeLine({ ...base, stance: 'wary', ritual: null })?.tone).toBe('scared');
  });
  it('all text is plain American English with no metric units or odd marks', () => {
    for (const st of ['settled', 'wary', 'alert'] as const) for (const t of all(s => ({ ...base, stance: st, ritual: ['dinner', 'fireside', 'play', 'bed'][s % 4] as 'dinner', kid: s % 2 === 0, elder: s % 5 === 0, seed: s, snowing: s % 3 === 0, cold: 0.9, food: s % 7 === 0 ? 'lean' : 'plenty' }))) {
      expect(t).not.toMatch(/[—–…]|\b(colour|grey|favour|mum)\b|\b\d+\s?(km|kg|cm|m)\b/i);
    }
  });
});
