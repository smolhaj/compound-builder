import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { triggerDisaster, tracksAt, type DisasterKind } from './disaster';
import { blackoutOf, collapseLook, darkness, envelope, NO_LOOK } from './collapseLook';
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

  it('the pandemic look is there at impact, not creeping in over days (QA run 6)', () => {
    const day0 = collapseLook(at('pandemic', 0.5)), day1 = collapseLook(at('pandemic', 1)), day14 = collapseLook(at('pandemic', 14));
    expect(day0.k).toBeGreaterThan(0.95);
    expect(day0.sat).toBeLessThan(0.55);
    expect(Math.abs(day1.k - day14.k)).toBeLessThan(0.02);
    // the warning days keep the old, slow hint
    expect(collapseLook(at('pandemic', -10)).k).toBeLessThan(0.3);
  });
  it('pandemic, lawless and cyberattack each have a presence of their own beyond a red ticker', () => {
    const pan = collapseLook(at('pandemic', 20)), law = collapseLook(at('lawless', 20)), cyb = collapseLook(at('cyberattack', 6));
    // a pandemic: cold and drained, fewer town lights, a hazy still air
    expect(pan.sat).toBeLessThan(0.75);
    expect(pan.cast[2]).toBeGreaterThan(pan.cast[0]);
    expect(pan.townGlow).toBeLessThan(0.7);
    expect(pan.haze + pan.fog).toBeGreaterThan(0.3);
    expect(pan.smoke).toBe(0);
    // lawless: warm, smoky, fires on the horizon, dim lights
    expect(law.cast[0]).toBeGreaterThan(law.cast[2]);
    expect(law.fireGlow).toBeGreaterThan(0.4);
    expect(law.smoke).toBeGreaterThan(0.4);
    expect(law.townGlow).toBeLessThan(0.7);
    // a dead grid: no town glow, cold muted day, a lifted dark so the night stays readable
    expect(cyb.townGlow).toBeLessThan(0.3);
    expect(cyb.flicker).toBeGreaterThan(0.5);   // (a rolling attack: the grid is a third of itself, so the lights stutter rather than die)
    expect(cyb.sat).toBeLessThan(0.9);
    expect(cyb.cast[2]).toBeGreaterThan(cyb.cast[0]);
    expect(cyb.nightLift).toBeGreaterThan(0.3);
    expect(cyb.nightLift).toBeLessThanOrEqual(0.5);
  });
  it('the town glow flickers while the grid fails and is steady before and after', () => {
    expect(darkness(0)).toEqual({ townGlow: 1, flicker: 0, nightLift: 0 });
    expect(darkness(1).flicker).toBe(0);
    expect(darkness(1).townGlow).toBe(0);
    expect(darkness(0.5).flicker).toBeCloseTo(1, 5);
  });
  it('eases in on the disaster timeline: nothing at the start of the warning, the full look after the hit', () => {
    expect(collapseLook(at('lawless', -12)).smoke).toBeLessThan(collapseLook(at('lawless', 20)).smoke * 0.35);
    expect(collapseLook(at('lawless', 2000)).smoke).toBeLessThan(0.2);
    expect(collapseLook(at('grid_down', -5, 'substation')).townGlow).toBe(1);
  });
});
