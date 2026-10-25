import { describe, expect, it } from 'vitest';
import { calendarOf, newGame, type GameState } from './state';
import { fieldHarvest, produce } from './needs';
import { CLASSIC } from './site';
import { odds, snowedIn, stormOutage, weatherDay, weatherOf } from './weatherThreats';
import { REGION_IDS } from './regions';

const place = (region: typeof CLASSIC.region, doy: number, seed = 5) => {
  const g = newGame(seed, doy, 2027);
  g.site = { ...CLASSIC, region };
  g.structures.push({ id: 'h', kind: 'timber_cabin', x: 30, z: 30, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
  return g;
};
const run = (g: ReturnType<typeof newGame>, days: number) => { const t0 = g.clock.t; const lines: string[] = []; for (let d = 0; d < days; d++) { g.clock.t = t0 + d; lines.push(...weatherDay(g)); } return lines; };

const fieldHarvestAt = (g: GameState, t: number) => { g.clock.t = t; return fieldHarvest(g); };

describe('weather threats', () => {
  it('a few notable storms a year at most', () => {
    for (const region of ['plains', 'mountain_west', 'desert', 'north_woods'] as const) {
      let storms = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const g = place(region, 1, seed);
        storms += run(g, 365).filter(l => /warning|watch/i.test(l)).length;
      }
      expect(storms / 10).toBeLessThan(5);
    }
  });

  it('blizzards come to the cold country in winter and snow the family in', () => {
    let hits = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const g = place('north_woods', 340, seed);
      const lines = run(g, 1);
      for (let d = 1; d < 90 && !weatherOf(g).active; d++) { g.clock.t = d; lines.push(...weatherDay(g)); }
      const a = weatherOf(g).active;
      if (a?.kind === 'blizzard') { hits++; expect(snowedIn(g, a.at)).toBe(true); expect(lines.some(l => /Blizzard warning/.test(l))).toBe(true); }
    }
    expect(hits).toBeGreaterThan(5);
  });

  it('no tornadoes in the desert; the warning reaches the news ticker', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const g = place('desert', 100, seed);
      expect(run(g, 120).some(l => /tornado/i.test(l))).toBe(false);
    }
    const g = place('plains', 100, 3);
    g.weather = { active: { kind: 'tornado', at: 1, until: 1 }, last: -999 };
    g.clock.t = 1; weatherDay(g);
    expect(g.structures[0].stage).toBe(3);
    expect(g.structures[0].finishedAt).toBeNull();
  });

  it('a root cellar keeps people from being hurt in a tornado', () => {
    let hurtOpen = 0, hurtCellar = 0;
    for (let seed = 1; seed <= 200; seed++) {
      for (const cellar of [false, true]) {
        const g = place('plains', 150, seed);
        if (cellar) g.structures.push({ id: 'c', kind: 'root_cellar', x: 10, z: 10, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
        g.weather = { active: { kind: 'tornado', at: 0, until: 0 }, last: -999 };
        g.clock.t = 0; weatherDay(g);
        const n = g.personState.reduce((a, p) => a + p.needs.hurt.length, 0);
        if (cellar) hurtCellar += n; else hurtOpen += n;
      }
    }
    expect(hurtOpen).toBeGreaterThan(0);
    expect(hurtCellar).toBe(0);
  });

  it('hail strips the garden; a heat wave wears on the elderly with no power', () => {
    const g = place('plains', 200);
    g.structures.push({ id: 'g', kind: 'garden', x: 5, z: 5, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
    g.stock.fresh = 10;
    g.weather = { active: { kind: 'hail', at: 0, until: 0 }, last: -999 };
    g.clock.t = 0; weatherDay(g);
    // the beds stay; this season's crop is what's lost
    expect(g.structures.find(s => s.id === 'g')!.stage).toBe(5);
    expect(g.stock.fresh).toBe(5);
    expect(g.weather.hail).toBeTruthy();
    const h = place('desert', 200);
    h.people[0].age = 72;
    h.utilities.lit = [];
    h.weather = { active: { kind: 'heat_wave', at: 0, until: 3 }, last: -999 };
    run(h, 4);
    expect(h.personState.find(p => p.id === h.people[0].id)!.needs.health).toBeLessThan(100);
    expect(h.weather.active).toBeNull();
  });
  it('hail takes the season\'s crop, not the beds: the garden comes back after replanting, the fields come in short', () => {
    const g = place('plains', 200);
    g.structures.push({ id: 'g', kind: 'garden', x: 5, z: 5, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
    g.structures.push({ id: 'f', kind: 'field', x: 9, z: 9, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    const year = (t: number) => { g.clock.t = t; return calendarOf(g.clock); };
    // mid-July, the garden at full summer
    let t = 0; while (year(t).doy !== 195) t++;
    const before = produce(g);
    const c = calendarOf(g.clock);
    g.weather = { active: null, last: -999, hail: { year: c.year, doy: c.doy - 1 } };
    expect(produce(g)).toBeLessThan(before * 0.5);
    g.clock.t = t + 40;
    expect(produce(g)).toBeGreaterThan(0);
    // the field harvest that year is short, the next year back to full
    let h = t; while (fieldHarvestAt(g, h) === 0) h++;
    const short = fieldHarvestAt(g, h);
    g.weather.hail = undefined;
    expect(short).toBeLessThan(fieldHarvestAt(g, h) * 0.8);
    expect(short).toBeGreaterThan(0);
  });

  it('each region gets its own storms: hurricane remnants in the mountains, monsoon flash floods in the desert, Northwest windstorms', () => {
    const year = (region: typeof CLASSIC.region) => { const seen = new Set<string>(); const g = place(region, 1); for (let d = 1; d <= 365; d++) for (const k of Object.keys(odds(g, d))) seen.add(k); return seen; };
    expect(year('appalachia').has('hurricane_remnants')).toBe(true);
    expect(year('appalachia').has('ice_storm')).toBe(true);
    expect(year('desert').has('flash_flood')).toBe(true);
    expect(year('desert').has('blizzard')).toBe(false);
    expect(year('pnw').has('windstorm')).toBe(true);
    expect(year('pnw').has('tornado')).toBe(false);
    expect(year('plains').has('tornado')).toBe(true);
    expect(year('mountain_west').has('hurricane_remnants')).toBe(false);
    // the Northwest floods in winter (atmospheric rivers), not with the spring melt
    const pnw = place('pnw', 1);
    expect(odds(pnw, 10).flood).toBeGreaterThan(0);
    expect(odds(pnw, 120).flood).toBeUndefined();
    // and no region gets more than a few storms a year
    for (const region of REGION_IDS) {
      let storms = 0;
      for (let seed = 1; seed <= 8; seed++) storms += run(place(region, 1, seed), 365).filter(l => /warning|watch/i.test(l)).length;
      expect(storms / 8).toBeLessThan(5);
    }
  });

  it('an ice storm takes the power out and shuts the roads; then it clears', () => {
    const g = place('appalachia', 10);
    g.weather = { active: { kind: 'ice_storm', at: 0, until: 2 }, last: -999 };
    g.clock.t = 0;
    const lines = weatherDay(g);
    expect(lines.some(l => /Ice storm/.test(l))).toBe(true);
    expect(stormOutage(g, 1)).toBe(true);
    expect(snowedIn(g, 1)).toBe(true);
    expect(stormOutage(g, 3)).toBe(false);
    run(g, 3);
    expect(g.weather.active).toBeNull();
  });

  it('the hurricane\'s remnants flood the creek bottom; a flash flood takes the wash', () => {
    let hit = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const g = place('appalachia', 260, seed);
      g.structures.push({ id: 'g', kind: 'garden', x: 5, z: 5, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
      g.weather = { active: { kind: 'hurricane_remnants', at: 0, until: 1 }, last: -999 };
      g.clock.t = 0; weatherDay(g);
      if (g.structures.some(s => s.finishedAt === null)) hit++;
    }
    expect(hit).toBeGreaterThan(5);
    const d = place('desert', 210);
    d.site = { ...d.site, creek: false };
    d.weather = { active: { kind: 'flash_flood', at: 0, until: 0 }, last: -999 };
    d.clock.t = 0;
    expect(weatherDay(d).some(l => /wash/.test(l))).toBe(true);
  });

  it('storms scale with difficulty: Cozy about half and shorter outages, Hardcore a quarter more', () => {
    const at = (d: 'cozy' | 'standard' | 'hardcore') => { const g = place('appalachia', 1); g.disaster.difficulty = d; return odds(g, 10).ice_storm!; };
    expect(at('cozy')).toBeCloseTo(at('standard') * 0.5, 9);
    expect(at('hardcore')).toBeCloseTo(at('standard') * 1.25, 9);
    // count the storm days over many years: Cozy well under Standard
    const days = (d: 'cozy' | 'standard') => {
      let n = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const g = place('north_woods', 1, seed); g.disaster.difficulty = d;
        for (let t = 0; t < 365 * 2; t++) { g.clock.t = t; weatherDay(g); if (g.weather?.active && t >= g.weather.active.at) n++; }
      }
      return n;
    };
    expect(days('cozy')).toBeLessThan(days('standard') * 0.7);
  });

  it('the new regions: Hill Country flash floods, New England hurricane remnants, the Ozarks ice and tornadoes', () => {
    const year = (region: typeof CLASSIC.region) => { const seen = new Set<string>(); const g = place(region, 1); for (let d = 1; d <= 365; d++) for (const k of Object.keys(odds(g, d))) seen.add(k); return seen; };
    expect(year('hill_country').has('flash_flood')).toBe(true);
    expect(year('hill_country').has('blizzard')).toBe(false);
    expect(year('new_england').has('hurricane_remnants')).toBe(true);
    expect(year('ozarks').has('ice_storm') && year('ozarks').has('tornado')).toBe(true);
    expect(year('rust_belt').has('blizzard')).toBe(true);
  });
});
