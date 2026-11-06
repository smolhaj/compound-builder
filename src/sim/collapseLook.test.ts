import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { triggerDisaster, tracksAt, type DisasterKind } from './disaster';
import { blackoutOf, collapseLook, envelope, NO_LOOK } from './collapseLook';
import { dayCard } from './dayCard';
import { collapseChip } from './collapseChip';

function at(kind: DisasterKind, days: number, variant?: string): GameState {
  const g = newGame(7);
  triggerDisaster(g.disaster, 100, kind, 7, 14, variant);
  g.disaster.phase = days < 0 ? 'warning' : 'impact';
  g.clock.t = g.disaster.hitAt + days;
  g.disaster.tracks = tracksAt(g.disaster, g.clock.t);
  return g;
}

describe('collapse look', () => {
  it('is nothing before the warning and in peace', () => {
    const g = newGame(7);
    expect(collapseLook(g)).toBe(NO_LOOK);
    const w = at('ash_winter', -20);
    expect(collapseLook(w).stage).toBe('none');
  });
  it('a hint grows through the warning and the full look arrives at impact', () => {
    const early = collapseLook(at('ash_winter', -12)), late = collapseLook(at('ash_winter', -1)), hit = collapseLook(at('ash_winter', 5));
    expect(early.stage).toBe('warning');
    expect(late.skyAmt).toBeGreaterThan(early.skyAmt);
    expect(late.skyAmt).toBeLessThan(hit.skyAmt * 0.5);
    expect(hit.stage).toBe('survival');
    expect(hit.dim).toBeLessThan(0.6);
    expect(hit.ash).toBeGreaterThan(0.3);
  });
  it('eases on the disaster\'s own timeline: a fire clears in weeks, an ash winter lasts over a year', () => {
    expect(collapseLook(at('wildfire', 60)).k).toBeLessThan(0.05);
    expect(collapseLook(at('wildfire', 2)).k).toBeGreaterThan(0.9);
    expect(collapseLook(at('ash_winter', 300)).k).toBeGreaterThan(0.9);
    expect(collapseLook(at('ash_winter', 1500)).k).toBeLessThan(0.2);
  });
  it('each kind looks different', () => {
    const kinds: DisasterKind[] = ['ash_winter', 'wildfire', 'drought', 'pandemic', 'cyberattack', 'financial'];
    const sig = kinds.map(k => { const l = collapseLook(at(k, 4)); return [l.skyTint.map(x => x.toFixed(2)).join(), l.cast.map(x => x.toFixed(2)).join(), l.dim.toFixed(2)].join('|'); });
    expect(new Set(sig).size).toBe(kinds.length);
    expect(collapseLook(at('wildfire', 2)).skyTint[0]).toBeGreaterThan(collapseLook(at('wildfire', 2)).skyTint[2]);
  });
  it('the lights go out with the grid and come back with it', () => {
    expect(collapseLook(at('grid_down', -5, 'substation')).blackout).toBe(0);
    expect(collapseLook(at('grid_down', 1, 'substation')).blackout).toBeGreaterThan(0.95);
    expect(collapseLook(at('cyberattack', 400)).blackout).toBe(0);
    expect(blackoutOf(1)).toBe(0);
    expect(blackoutOf(0)).toBe(1);
  });
  it('is deterministic and the envelope never leaves 0-1', () => {
    expect(collapseLook(at('ash_winter', 9))).toEqual(collapseLook(at('ash_winter', 9)));
    for (const d of [-30, -1, 0, 1, 5, 100, 500, 2000]) { const k = envelope({ warn: 0.3, rise: 3, hold: 100, fade: 100, floor: 0.1 }, d, 0.7); expect(k).toBeGreaterThanOrEqual(0); expect(k).toBeLessThanOrEqual(1); }
  });
  it('nuclear keeps its flash and haze', () => {
    expect(collapseLook(at('nuclear', 0.001, 'distant')).flash).toBeGreaterThan(0);
  });
});

describe('the day-it-happened card and the chip', () => {
  it('has a headline and what falls in three days', () => {
    const c = dayCard(at('ash_winter', 0))!;
    expect(c.headline).toMatch(/Yellowstone/);
    expect(c.lines.join(' ')).toMatch(/gone or going/);
    expect(c.look).toMatch(/ash/i);
    expect(dayCard(newGame(7))).toBeNull();
  });
  it('counts down through the warning and counts days after', () => {
    expect(collapseChip(newGame(7))).toBeNull();
    const w = collapseChip(at('grid_down', -10))!;
    expect(w.chip).toBe('Impact in 10 days');
    expect(collapseChip(at('grid_down', -2))!.tone).toBe('bad');
    expect(collapseChip(at('grid_down', 12))!.chip).toBe('Day 13');
  });
});
