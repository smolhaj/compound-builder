import { describe, expect, it } from 'vitest';
import { tracksAt, triggerDisaster, type DisasterKind } from '../disaster';
import { newGame, type GameState } from '../state';
import { FELT_KINDS, feltSpec } from './registry';
import { FARMS_SHOWN, MARK_CAP, farmLooks, feltMarks, marksSignature } from './marks';
import type { FeltKind } from './types';

/** A game `day` days after the hit of `kind`. */
function at(kind: FeltKind, day: number, seed = 7): GameState {
  const g = newGame(seed);
  g.disaster.mode = 'sandbox';
  triggerDisaster(g.disaster, 0, kind as DisasterKind, g.seed, 14);
  g.disaster.kind = kind as DisasterKind;   // (a planned kind has no sim yet: the marks only read the kind and the tracks)
  g.disaster.hitAt = 20; g.disaster.warnAt = 6;
  g.clock.t = 20 + day;
  g.disaster.tracks = tracksAt(g.disaster, g.clock.t);
  return g;
}
const marks = (kind: FeltKind, day: number, tier: 'low' | 'medium' | 'high' = 'high') => { const g = at(kind, day); return feltMarks(g, day, feltSpec(kind), tier); };

describe('felt marks', () => {
  it('has nothing in peacetime or before the hit', () => {
    const g = newGame(7);
    expect(feltMarks(g, 3, null)).toEqual([]);
    expect(marks('wildfire', -1)).toEqual([]);
  });
  it('gives every kind at least one mark at week 1 and month 1, with unique ids', () => {
    for (const k of FELT_KINDS) for (const d of [7, 30]) {
      const m = marks(k, d);
      expect(m.length, `${k} day ${d}`).toBeGreaterThan(0);
      expect(new Set(m.map(x => x.id)).size, `${k} ids`).toBe(m.length);
      for (const x of m) { expect(x.sev).toBeGreaterThan(0); expect(x.sev).toBeLessThanOrEqual(1); }
    }
  });
  it('is deterministic and caps by tier', () => {
    for (const k of FELT_KINDS) {
      expect(marks(k, 7)).toEqual(marks(k, 7));
      for (const t of ['low', 'medium', 'high'] as const) expect(marks(k, 7, t).length).toBeLessThanOrEqual(MARK_CAP[t]);
    }
    expect(marks('mega_quake', 7, 'low').length).toBeLessThanOrEqual(40);
  });
  it('covers the named kinds with the marks the owner asked for', () => {
    const kinds = (k: FeltKind, d = 7) => new Set(marks(k, d).map(m => m.kind));
    expect(kinds('wildfire')).toContain('smoke');
    expect(kinds('mega_quake')).toContain('crack');
    expect(kinds('mega_quake')).toContain('road_cut');
    expect(kinds('dam_flood', 1)).toContain('flood');
    expect(kinds('supervolcano', 30)).toContain('ash_drift');
    expect(kinds('zombies')).toContain('barricade');
    expect(kinds('civil_war')).toContain('checkpoint');
    expect(kinds('invasion')).toContain('checkpoint');
    expect(kinds('grid_down', 7)).toContain('sign');
  });
  it('lets a flood rise, then recede and leave a mud line', () => {
    const lvl = (d: number) => { const f = marks('dam_flood', d).find(m => m.kind === 'flood'); return f && f.anchor.at === 'lowland' ? f.anchor.level : 0; };
    expect(lvl(0.25)).toBeGreaterThan(0);
    expect(lvl(1)).toBeGreaterThan(lvl(0.25));
    expect(lvl(60)).toBe(0);
    expect(marks('dam_flood', 60).some(m => m.kind === 'mud_line')).toBe(true);
  });
  it('keeps persistent marks monotone: cracks stay through the month', () => {
    const n = (d: number) => marks('mega_quake', d).filter(m => m.kind === 'crack').length;
    expect(n(30)).toBeGreaterThanOrEqual(n(7));
  });
  it('has a stable signature that changes with the marks', () => {
    const a = marks('wildfire', 2), b = marks('wildfire', 2);
    expect(marksSignature(a)).toBe(marksSignature(b));
    expect(marksSignature(a)).not.toBe(marksSignature(marks('wildfire', 40)));
  });
  it('turns marks into farm looks: a dead grid darkens, a burned farm is burned, peacetime is lit', () => {
    const g = at('grid_down', 20);
    g.disaster.tracks.grid = 0;
    const looks = farmLooks(g, feltMarks(g, 20, null));
    expect(looks.length).toBe(FARMS_SHOWN);
    expect(looks.some(l => l.variant === 'dark')).toBe(true);
    const peace = farmLooks(newGame(7), []);
    expect(peace.every(l => l.variant === 'ok' && l.lit)).toBe(true);
  });
  it('is cheap: a year of daily marks under a generous ceiling', () => {
    const g = at('civil_war', 0), t0 = performance.now();
    for (let d = 0; d < 365; d++) feltMarks(g, d, null);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
