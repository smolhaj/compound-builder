import { describe, expect, it } from 'vitest';
import { GENERIC_NEWS, peacePool, pickPeaceNews, seasonOf, seasonReviewLine, SEASON_NEWS, WORLD_NEWS, isSeasonStart } from './newsPool';
import { REGION_IDS } from './regions';
import { mulberry32 } from './rng';
import { newGame } from './state';
import { step } from './engine';

describe('the ticker pool', () => {
  it('every region has its own lines, every season too', () => {
    for (const id of REGION_IDS) expect(peacePool('summer', id).length).toBeGreaterThan(GENERIC_NEWS.length + WORLD_NEWS.length);
    for (const s of ['spring', 'summer', 'fall', 'winter'] as const) expect(SEASON_NEWS[s].length).toBeGreaterThanOrEqual(8);
    expect(peacePool('winter', 'plains').length).toBeGreaterThan(50);
  });

  it('never repeats a line that is still on the ticker, over two years of days', () => {
    const r = mulberry32(7);
    const feed: string[] = [];
    let immediate = 0;
    for (let i = 0; i < 180; i++) {
      const doy = (i * 4) % 365 + 1;
      const line = pickPeaceNews(r, seasonOf(doy), 'appalachia', feed.slice(-30));
      if (feed.slice(-30).includes(line)) immediate++;
      feed.push(line);
    }
    expect(immediate).toBe(0);
    expect(new Set(feed).size).toBeGreaterThan(70);
  });

  it('the seasons and the regions turn over at the right days', () => {
    expect(seasonOf(100)).toBe('spring'); expect(seasonOf(200)).toBe('summer'); expect(seasonOf(300)).toBe('fall'); expect(seasonOf(10)).toBe('winter'); expect(seasonOf(340)).toBe('winter');
    expect(isSeasonStart(60)).toBe('spring'); expect(isSeasonStart(61)).toBeNull();
  });

  it('a long peace puts many different headlines on the ticker', () => {
    let g = newGame(3);
    g.disaster.kind = null as never;
    g = step(g, 365 * 2);
    const texts = g.disaster.news.map(n => n.text);
    expect(texts.length).toBeGreaterThan(0);
    for (let i = 1; i < texts.length; i++) expect(texts[i]).not.toBe(texts[i - 1]);
  });
});

describe('years in review', () => {
  const facts = { season: 'fall' as const, year: 2029, years: 2, buildings: 7, people: 5, dogs: 2, daysOfFood: 140.4321, openShare: 0.46, firewood: 6.77, money: 12345.678, deaths: 0 };
  it('is one line per season with no raw floats', () => {
    for (const season of ['spring', 'summer', 'fall', 'winter'] as const) {
      const t = seasonReviewLine({ ...facts, season });
      expect(t.startsWith(season[0].toUpperCase() + season.slice(1))).toBe(true);
      expect(t).not.toMatch(/\d\.\d{2,}/);
      expect(t.length).toBeLessThan(220);
    }
    expect(seasonReviewLine(facts)).toContain('the wall is 54% closed');
    expect(seasonReviewLine(facts)).toContain('6 ricks');
  });

  it('lands in the log at each season start', () => {
    let g = newGame(3, 330);
    g = step(g, 40);
    expect(g.log.some(e => /^Winter 2027, in review/.test(e.text))).toBe(true);
  });
});
