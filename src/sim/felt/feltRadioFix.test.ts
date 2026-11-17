import { describe, expect, it } from 'vitest';
import { TRACKS } from '../disaster';
import { fxCtxFor } from '../disasterFx';
import { hearToday, isRadioNews, radioDay, radioSet } from '../radio';
import { newGame, type GameState } from '../state';
import { evalClaim } from './claims';
import { eligibleLines } from './feltRadio';
import { feedOf, feltFeed, kindStatus } from './feed';
import { KIND_ROWS } from './radioKinds';
import { FELT_KINDS, feltSpec } from './registry';
import type { FeltKind } from './types';

function after(kind: FeltKind, day = 0, seed = 5): GameState {
  const g = newGame(seed);
  const d = g.disaster;
  d.kind = kind as never; d.phase = 'survival'; d.hitAt = g.clock.t; d.warnAt = g.clock.t - 10; d.fate = 'partial'; d.back = {};
  g.clock.t += day;
  for (const t of TRACKS) d.tracks[t] = 1;
  return g;
}
const feed = (g: GameState) => feltFeed(g, fxCtxFor(g, 3), feltSpec(g.disaster.kind)!);

describe('radio cadence', () => {
  it('a hit-week day is busier than a later one, and a day well after is the plain rate', () => {
    const g = after('drought', 3); g.stock.sw_radio = 1;
    expect(radioSet(g)).toBe('shortwave');
    expect(hearToday(g, 3)).toBeGreaterThan(hearToday(g, 15));
    expect(hearToday(g, 15)).toBeGreaterThan(hearToday(g, 60));
    expect(hearToday(g, 60)).toBeCloseTo(0.35);
    expect(hearToday(g, 3)).toBeLessThanOrEqual(0.95);
  });
  it('with no set a plain line says so, once; after a pulse it says why', () => {
    for (const [kind, why] of [['drought', /no working radio/], ['emp', /pulse burned it out/]] as const) {
      const g = after(kind, 2);
      expect(radioDay(g)[0]).toMatch(why);
      expect(isRadioNews(radioDay(g)[0] ?? 'x')).toBe(false);
      g.clock.t += 1;
      expect(radioDay(g).join(' ')).not.toMatch(/no working radio/);
    }
  });
});

describe('radio lines fit the kind', () => {
  it('"Creek, bad" and "a group raiding farms" are not said where they do not fit', () => {
    for (const k of FELT_KINDS) {
      const g = after(k, 12);
      for (const set of ['ham', 'shortwave', 'none'] as const) for (const want of [true, false]) for (const l of eligibleLines(g, set, want, true)) {
        const txt = l.text(g, () => 0.5);
        if (!['nuclear'].includes(k)) expect(txt, `${k}/${l.id}`).not.toMatch(/Creek, bad\. Water, bad downstream/);
        expect(txt, `${k}/${l.id}`).not.toMatch(/raiding farms/);
      }
    }
  });
  it('every kind has 3 or more kind-specific lines eligible in week 1 and 5 by day 30, true and false', () => {
    for (const k of FELT_KINDS) {
      const early = after(k, 3), later = after(k, 20);
      for (const g of [early, later]) { g.disaster.tracks.grid = 0; g.disaster.tracks.stores = 0.1; g.disaster.tracks.banks = 0.1; g.disaster.tracks.fuel = 0.1; g.disaster.tracks.phone = 0.1; g.disaster.tracks.law = 0.2; }
      // what a shortwave set (official and rumor, a slice of ham) and the fence line (local and rumor) can say
      const own = (g: GameState, want: boolean, set: 'shortwave' | 'none') => eligibleLines(g, set, want, true).filter(l => l.id.includes('.k_')).map(l => l.id);
      for (const set of ['shortwave', 'none'] as const) {
        expect(new Set([...own(early, true, set), ...own(early, false, set)]).size, `${k}/${set} week 1`).toBeGreaterThanOrEqual(3);
        expect(new Set([...own(later, true, set), ...own(later, false, set)]).size, `${k}/${set} day 20`).toBeGreaterThanOrEqual(5);
        expect(own(later, true, set).length, `${k}/${set} true`).toBeGreaterThanOrEqual(2);
        expect(own(later, false, set).length, `${k}/${set} false`).toBeGreaterThanOrEqual(2);
      }
      expect(KIND_ROWS[k].length, k).toBeGreaterThanOrEqual(9);
    }
  });
  it('a false kind line is false in the world it is said in', () => {
    for (const k of FELT_KINDS) {
      const g = after(k, 10);
      for (const l of eligibleLines(g, 'ham', false, true)) expect(l.claim?.(g), `${k}/${l.id}`).toBe(false);
    }
  });
  it('claims read the world: ash depth and the sick share', () => {
    const g = after('ash_winter', 10);
    expect(evalClaim(g, { id: 'ash_ge', n: 99 })).toBe(false);
    expect(evalClaim(g, { id: 'days_ge', n: 10 })).toBe(true);
    expect(evalClaim(g, { id: 'sick_ge', n: 1 })).toBe(false);
    g.disaster.fx = { outbreak: { waves: [{ peak: 10, width: 5, prev: 0.1 }] } };
    expect(evalClaim(g, { id: 'sick_ge', n: 9 })).toBe(true);
  });
});

describe('the feed picks up the kind and the radio', () => {
  it('a kind\'s own standing facts: a front holder, the occupation tier, ash depth, the sick share, the Gathering', () => {
    const cw = after('civil_war', 7);
    cw.disaster.fx = { civil_war: { front: { holder: 'compact', contested: 0, lastRoll: 0, flips: 0 } } };
    expect(kindStatus(cw).map(l => l.text)[0]).toMatch(/holds the town\.$/);
    const inv = after('invasion', 7);
    inv.disaster.fx = { invasion: { tier: 2, front: { holder: 'alliance', contested: 0, lastRoll: 0, flips: 0 } } };
    expect(kindStatus(inv)[0].text).toMatch(/The occupiers hold the town\. Occupation, tier 2/);
    const pan = after('pandemic', 12);
    pan.disaster.fx = { outbreak: { waves: [{ peak: 12, width: 5, prev: 0.06 }], policy: { sealed: true } } };
    expect(kindStatus(pan).map(l => l.id)).toEqual(expect.arrayContaining(['quarantine.sealed']));
    expect(kindStatus(pan)[0].text).toMatch(/About 6 in 100/);
    const cult = after('cult_takeover', 20);
    cult.disaster.fx = { cult_takeover: { converts: ['a', 'b'], due: true } };
    expect(kindStatus(cult).map(l => l.text)).toEqual(['2 households near you now attend the Gathering.', 'The tithe is due. The shepherds have the ledger.']);
  });
  it('a new standing fact is a line; on a quiet day it is repeated as "Still:"', () => {
    const g = after('civil_war', 7);
    g.disaster.fx = { civil_war: { front: { holder: 'alliance', contested: 0, lastRoll: 0, flips: 0 } } };
    feed(g);
    expect(feedOf(g)!.lines.map(l => l.text).some(x => /holds the town\./.test(x))).toBe(true);
    g.clock.t += 1; feed(g);
    const lines = feedOf(g)!.lines.map(l => l.text);
    expect(lines[0]).toMatch(/^Nothing new today/);
    expect(lines.some(x => /^Still: .* holds the town\./.test(x))).toBe(true);
  });
  it('the kind\'s own ticker news is picked up, but not what the radio said', () => {
    const g = after('mega_quake', 3);
    g.disaster.news.push({ t: g.clock.t, text: 'The county bridge dropped into the river overnight.', tone: 2 }, { t: g.clock.t, text: 'On the shortwave: the big one is over, they say.', tone: 0 });
    feed(g);
    const lines = feedOf(g)!.lines.map(l => l.text);
    expect(lines).toContain('The county bridge dropped into the river overnight.');
    expect(lines.some(x => x.includes('the big one is over'))).toBe(false);
  });
  it('a daily radio digest while a set is on, outside the six-line cap', () => {
    const g = after('drought', 4); g.stock.sw_radio = 1;
    feed(g);
    expect(feedOf(g)!.lines.at(-1)!.id).toBe('radio.digest');
    expect(feedOf(g)!.lines.at(-1)!.text).toMatch(/^Radio: only static today/);
    g.radio = { warnedUntil: -1, bonus: 0, truths: 0, rumors: 0, heard: [{ id: 'h4', day: 4, text: 'x', kind: 'service', truth: true, status: 'open' }] };
    g.clock.t += 0; (g.disaster.fx!.feltFeed as { day: number }).day = -1;
    feed(g);
    expect(feedOf(g)!.lines.at(-1)!.text).toMatch(/^Radio: 1 broadcast today, 1 not checked/);
    const none = after('drought', 4);
    feed(none);
    expect(feedOf(none)!.lines.some(l => l.id === 'radio.digest')).toBe(false);
  });
});
