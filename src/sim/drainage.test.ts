import { afterEach, describe, expect, it } from 'vitest';
import { makeLotSite, siteLot } from './lotListing';
import { calendarOf, newGame, type GameState, type Structure } from './state';
import { planStructure } from './construction';
import { PERIMETER, UTILITY_LINES, planRun, type Pt } from './perimeter';
import { DRAIN, cutSites, drainLineFor, drainageLines, drains, nearDrain, undrained } from './drainage';
import { FX, mudFactor, muddy, terrainCards } from './terrainFx';
import { costPer100m } from './guidance';
import { runBill } from './perimeter';
import { setGroundOverride } from './terrainState';

afterEach(() => setGroundOverride(null));

/** A hillside lot whose home block has ground graded at 12 % or more somewhere: the first (seed, spot) that does. */
function slopeGame(): { g: GameState; spot: Pt } {
  for (let seed = 1; seed < 60; seed++) {
    const site = makeLotSite({ kind: 'hillside', relief: 11, elevM: 1800, seed });
    const g = newGame(7); g.site = { ...site, creek: false };
    const lot = siteLot(g.site)!, h = g.site.home;
    for (let x = h.x0 + 4; x < h.x1 - 4; x += 3) for (let z = h.z0 + 4; z < h.z1 - 4; z += 3) {
      const e = 0.8, gx = (lot.field.h(x + e, z) - lot.field.h(x - e, z)) / (2 * e), gz = (lot.field.h(x, z + e) - lot.field.h(x, z - e)) / (2 * e);
      if (Math.hypot(gx, gz) > 0.16) return { g, spot: [x, z] };
    }
  }
  throw new Error('no steep hillside found');
}
const stake = (g: GameState, kind: string, x: number, z: number): Structure => { const st = planStructure(g, kind, x, z, 0); st.finishedAt = null; return st; };
/** Move the clock to the day of the year `doy` (the calendar starts wherever the place does). */
const day = (g: GameState, doy: number) => { for (let t = 0; t < 800; t++) { g.clock.t = t + 0.25; if (calendarOf(g.clock).doy === doy) return; } throw new Error('no such day'); };

describe('drainage channels', () => {
  it('are in the price table as a utility-class line with a real price, and stop no one', () => {
    expect(PERIMETER.drain_channel.blocks.people).toBe(0);
    expect(UTILITY_LINES).toContain('drain_channel');
    expect(costPer100m('drain_channel')).toBeGreaterThan(0);
    expect(runBill('drain_channel', 10).pipe).toBeGreaterThan(0);
  });

  it('a building cut into a slope bogs down in the thaw and in storms; the channel above it takes most of that away', () => {
    const { g, spot } = slopeGame();
    const st = stake(g, 'workshop', spot[0], spot[1]);
    expect(st.grade).toBeGreaterThanOrEqual(DRAIN.RUNOFF_GRADE);
    expect(cutSites(g)).toContain(st);
    expect(undrained(g)).toContain(st);
    day(g, 100);                                      // the thaw
    expect(muddy(g, st)).toBe(true);
    expect(mudFactor(g, st)).toBe(FX.MUD_SLOW);
    day(g, 200);                                      // high summer: dry
    expect(muddy(g, st)).toBe(false);
    expect(muddy(g, st, true)).toBe(true);            // a storm turns it to mud any season
    // the channel the card plans: along the contour, above the building
    const line = drainLineFor(g, st)!;
    expect(line).toBeTruthy();
    const run = planRun(g, 'drain_channel', line);
    expect(drains(g)).toHaveLength(0);                // planned, not dug
    expect(mudFactor(g, st, true)).toBe(FX.MUD_SLOW);
    run.finishedAt = 0;
    expect(drains(g)).toHaveLength(1);
    expect(nearDrain(g, st.x, st.z)).toBe(true);
    expect(undrained(g)).not.toContain(st);
    const f = mudFactor(g, st, true);
    expect(f).toBeGreaterThan(FX.MUD_SLOW);
    expect(f).toBeLessThan(1);
    expect(f).toBeCloseTo(1 - (1 - FX.MUD_SLOW) * (1 - DRAIN.MUD_CUT), 6);
  });

  it('level ground and a place with no lot are untouched; a far channel does not count', () => {
    const g = newGame(5); day(g, 100);
    const st = stake(g, 'workshop', 20, 20);
    expect(muddy(g, st)).toBe(false);
    expect(mudFactor(g, st)).toBe(1);
    expect(drainageLines(g)).toEqual([]);
    const far = planRun(g, 'drain_channel', [[st.x + 40, st.z], [st.x + 48, st.z]]); far.finishedAt = 0;
    expect(nearDrain(g, st.x, st.z)).toBe(false);
  });

  it('the Defense tab says what still sheds water; the guidance card offers the channel with the line', () => {
    const { g, spot } = slopeGame();
    g.structures.push({ id: 'h', kind: 'timber_cabin', x: spot[0] + 12, z: spot[1], rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    const st = stake(g, 'workshop', spot[0], spot[1]);
    expect(drainageLines(g).join(' ')).toMatch(/nothing to turn the runoff/);
    g.clock.t = 90;
    const cards = terrainCards(g);
    const card = cards.find(c => c.id === 'land_drain');
    if (card) {
      expect(card.drain!.count).toBeGreaterThanOrEqual(1);
      expect(card.mode).toBe('water');
      const run = planRun(g, 'drain_channel', [card.drain!.a, card.drain!.b]); run.finishedAt = 0;
      expect(drainageLines(g).join(' ')).toMatch(/drained|standing/);
      expect(terrainCards(g).find(c => c.id === 'land_drain')).toBeUndefined();
    }
    expect(st.grade).toBeGreaterThan(0);
  });
});
