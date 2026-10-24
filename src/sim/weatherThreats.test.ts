import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { CLASSIC } from './site';
import { snowedIn, weatherDay, weatherOf } from './weatherThreats';

const place = (region: typeof CLASSIC.region, doy: number, seed = 5) => {
  const g = newGame(seed, doy, 2027);
  g.site = { ...CLASSIC, region };
  g.structures.push({ id: 'h', kind: 'timber_cabin', x: 30, z: 30, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
  return g;
};
const run = (g: ReturnType<typeof newGame>, days: number) => { const t0 = g.clock.t; const lines: string[] = []; for (let d = 0; d < days; d++) { g.clock.t = t0 + d; lines.push(...weatherDay(g)); } return lines; };

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
    expect(g.structures.find(s => s.id === 'g')!.stage).toBe(4);
    expect(g.stock.fresh).toBe(5);
    const h = place('desert', 200);
    h.people[0].age = 72;
    h.utilities.lit = [];
    h.weather = { active: { kind: 'heat_wave', at: 0, until: 3 }, last: -999 };
    run(h, 4);
    expect(h.personState.find(p => p.id === h.people[0].id)!.needs.health).toBeLessThan(100);
    expect(h.weather.active).toBeNull();
  });
});
