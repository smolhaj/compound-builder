import { describe, expect, it } from 'vitest';
import { MAX_STORIES, addStory, makeStory, motiveLine, raiderName, storyDay, type RaiderStory } from './raiderStory';
import { newGame } from './state';
import { dayIndex } from './state';

const story = (o: Partial<RaiderStory> = {}): RaiderStory => ({ id: 'rs1', name: 'Dale Hobbs', crew: 'gang', motive: 'hunger', treated: 'released', day: 0, returns: 0, plan: 'warn', ...o });

describe('a raider with a story', () => {
  it('names are stable and have two parts', () => { expect(raiderName(5)).toBe(raiderName(5)); expect(raiderName(5).split(' ').length).toBe(2); });
  it('a man you let go often comes back to warn or repay; one left on the road sometimes for revenge; a leader who got away usually does', () => {
    const tally = (treated: 'released' | 'left' | 'escaped') => { const t: Record<string, number> = {}; for (let salt = 0; salt < 400; salt++) { const g = newGame(1 + salt); const st = makeStory(g, { treated, crew: 'gang', men: 6 }, salt); const k = st?.plan ?? 'nothing'; t[k] = (t[k] ?? 0) + 1; } return t; };
    const rel = tally('released'), left = tally('left'), esc = tally('escaped');
    expect((rel.warn ?? 0) + (rel.gift ?? 0)).toBeGreaterThan(200); expect(rel.revenge ?? 0).toBe(0);
    expect(left.revenge).toBeGreaterThan(80); expect(left.warn ?? 0).toBe(0);
    expect(esc.revenge).toBeGreaterThan((left.revenge ?? 0));
  });
  it('comes back on his day, not before; warn forewarns the gate, gift leaves cans, revenge brings a bigger crew', () => {
    const g = newGame(2), day = dayIndex(g.clock.t);
    addStory(g, story({ returns: day + 5, plan: 'warn' }));
    expect(storyDay(g)).toEqual([]); expect(g.gate.forewarned).toBeFalsy();
    g.clock.t += 6;
    expect(storyDay(g).join(' ')).toMatch(/told the gate/); expect(g.gate.forewarned).toBe(true);
    const h = newGame(3), canned = h.stock.canned;
    addStory(h, story({ returns: dayIndex(h.clock.t), plan: 'gift' })); storyDay(h); expect(h.stock.canned).toBe(canned + 3);
    const k = newGame(4);
    addStory(k, story({ returns: dayIndex(k.clock.t), plan: 'revenge', men: 9 }));
    expect(storyDay(k).join(' ')).toMatch(/is back, with 9 men/); expect(k.gate.comeBack?.size).toBe(9);
  });
  it('the list is bounded and a finished story is dropped first; an empty list ticks to nothing; no story adds nothing', () => {
    const g = newGame(5);
    for (let i = 0; i < 30; i++) addStory(g, story({ id: `s${i}`, returns: 9999, done: i % 2 === 0 }));
    expect(g.raiderStories!.length).toBeLessThanOrEqual(MAX_STORIES);
    addStory(g, null); expect(g.raiderStories!.length).toBeLessThanOrEqual(MAX_STORIES);
    expect(storyDay(newGame(6))).toEqual([]);
  });
  it('gives him a reason', () => { for (const m of ['hunger', 'debt', 'loyalty', 'fear'] as const) expect(motiveLine(m).length).toBeGreaterThan(10); });
});
