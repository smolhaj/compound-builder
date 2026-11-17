import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { KIT } from '../game/buildkit/kit';
import { UTILITY_LINES } from './perimeter';
import { perimeterTiers } from './guidance';
import { billFor, billLines, cardState, catalogEntries, CATS, filterCatalog, matchScore, moveIndex, priceText, queryWords, recommendedKeys, shortGives } from './buildCatalog';

const all = catalogEntries();
const keys = (f: Parameters<typeof filterCatalog>[1]) => filterCatalog(all, f).map(e => e.key);

describe('buildCatalog', () => {
  it('lists every piece the Build tab lists, once, each in a known category', () => {
    expect(new Set(all.map(e => e.key)).size).toBe(all.length);
    const cats = new Set(CATS.map(c => c.id));
    for (const e of all) expect(cats.has(e.cat)).toBe(true);
    for (const e of all.filter(x => !x.run)) expect(KIT[e.key]).toBeTruthy();
    for (const t of perimeterTiers()) for (const k of t.kinds) expect(all.some(e => e.key === `fence:${k}`)).toBe(true);
    for (const k of UTILITY_LINES) expect(all.some(e => e.key === `fence:${k}`)).toBe(true);
    for (const k of ['well_hand', 'timber_cabin', 'garden', 'rise_lookout', 'bunker_hatch', 'solar_array', 'fence:escape_tunnel', 'fence:underground_passage']) expect(all.some(e => e.key === k)).toBe(true);
  });
  it('every category has something in it', () => { for (const c of CATS) expect(keys({ query: '', cat: c.id }).length).toBeGreaterThan(0); });
  it('search matches name, category and keywords; a name hit ranks first', () => {
    expect(keys({ query: 'well', cat: null })[0]).toMatch(/^well_/);
    expect(keys({ query: 'solar', cat: null })).toContain('solar_array');
    expect(keys({ query: 'power', cat: null })).toContain('solar_array');   // category
    expect(keys({ query: 'sleep', cat: null })).toContain('timber_cabin');   // keyword of Shelter
    expect(keys({ query: 'underground', cat: null })).toContain('bunker_hatch');
    expect(keys({ query: 'zzzzqq', cat: null })).toEqual([]);
    expect(keys({ query: 'water tank', cat: null }).length).toBeGreaterThan(0);
    // a whole-word name hit beats a part-of-a-word hit
    const k = keys({ query: 'well', cat: null });
    expect(k.indexOf('well_hand')).toBeLessThan(k.indexOf('bunker_stairs'));
  });
  it('a chip narrows the list and a search inside it narrows further', () => {
    const food = keys({ query: '', cat: 'food' });
    expect(food).toContain('garden');
    expect(food).not.toContain('well_hand');
    expect(keys({ query: 'garden', cat: 'power' })).toEqual([]);
  });
  it('queryWords and matchScore are case and punctuation blind', () => {
    expect(queryWords('  Hand-DUG, well ')).toEqual(['hand', 'dug', 'well']);
    const e = all.find(x => x.key === 'well_hand')!;
    expect(matchScore(e, queryWords('HAND well'))).toBeGreaterThan(0);
    expect(matchScore(e, [])).toBe(1);
  });
  it('a dim card carries the reason and a stakeable one has a price', () => {
    const g = newGame(3);
    const tunnel = cardState(g, all.find(e => e.key === 'fence:escape_tunnel')!);
    expect(tunnel.kind).toBe('off');
    expect(tunnel.reason).toMatch(/bunker/);
    expect(cardState(g, all.find(e => e.key === 'bunker_dorm')!).kind).toBe('off');
    const cabin = cardState(g, all.find(e => e.key === 'timber_cabin')!);
    expect(['ok', 'next', 'permit']).toContain(cabin.kind);
    expect(cabin.price).toBeGreaterThan(0);
    expect(priceText(cabin)).toMatch(/^\$/);
  });
  it('a county permit is a state of its own when the county enforces them', () => {
    const g = newGame(3);
    g.paper.permits = true; g.disaster.tracks.banks = 1; g.disaster.tracks.law = 1;
    expect(all.filter(e => !e.run).map(e => cardState(g, e)).some(c => c.badge?.startsWith('Permit'))).toBe(true);
    g.paper.permits = false;
    expect(all.filter(e => !e.run).map(e => cardState(g, e)).some(c => c.badge?.startsWith('Permit'))).toBe(false);
  });
  it('the Recommended chip shows exactly the suggested pieces', () => {
    const g = newGame(3), rec = recommendedKeys(g, all);
    for (const k of rec) expect(cardState(g, all.find(e => e.key === k)!).kind).toBe('next');
    expect(keys({ query: '', cat: null, only: rec }).sort()).toEqual([...rec].sort());
  });
  it('the bill adds up: materials plus other cash is the owner cost, a crew adds wages', () => {
    const g = newGame(3);
    for (const k of ['timber_cabin', 'well_hand', 'fence:split_rail']) {
      const b = billFor(g, all.find(e => e.key === k)!);
      expect(b.ownerUsd).toBe([...b.materials, ...b.other].reduce((a, l) => a + l.usd, 0));
      expect(b.crewUsd).toBe(b.ownerUsd + b.crewLaborUsd);
      expect(b.hours).toBeGreaterThan(0);
      expect(b.crewWeeks).toBeGreaterThanOrEqual(1);
      expect(billLines(b).join(' ')).toContain('Time:');
    }
    const cabin = billFor(g, all.find(e => e.key === 'timber_cabin')!);
    expect(cabin.materials.length).toBeGreaterThan(1);
    expect(cabin.facts.some(f => f.startsWith('Footprint'))).toBe(true);
  });
  it('the owner cost of a piece equals the price on its card', () => {
    const g = newGame(3);
    g.paper.permits = false;
    for (const k of ['timber_cabin', 'garden', 'solar_array']) { const e = all.find(x => x.key === k)!; expect(billFor(g, e).ownerUsd).toBe(cardState(g, e).price); }
  });
  it('shortGives cuts at a sentence and never mid-word', () => {
    expect(shortGives('A short one.')).toBe('A short one.');
    const cut = shortGives('First sentence here that is fairly long and sits well. ' + 'word '.repeat(60), 80);
    expect(cut.length).toBeLessThanOrEqual(84);
    expect(cut.endsWith('.') || cut.endsWith('...')).toBe(true);
  });
  it('moveIndex moves in a grid and stays in range', () => {
    expect(moveIndex(-1, 'ArrowDown', 6, 2)).toBe(0);
    expect(moveIndex(0, 'ArrowDown', 6, 2)).toBe(2);
    expect(moveIndex(5, 'ArrowDown', 6, 2)).toBe(5);
    expect(moveIndex(0, 'ArrowLeft', 6, 2)).toBe(0);
    expect(moveIndex(2, 'ArrowRight', 6, 2)).toBe(3);
    expect(moveIndex(2, 'End', 6, 2)).toBe(5);
    expect(moveIndex(2, 'ArrowDown', 0, 2)).toBe(-1);
  });
});
