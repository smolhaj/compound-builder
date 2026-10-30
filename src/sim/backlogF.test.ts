import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { CLASSIC } from './site';
import { coldExposure, frostChance } from './cold';
import { closeness, seepageChance, wellFouling, worstWell, wellRisks } from './sanitation';
import { eraPressure } from './eraPressure';
import { raidPressure } from './opsec';
import { inheritSkills } from './lineage';
import { medicalDay, casesOf } from './medical';
import { freshNeeds } from './needs';
import { learningOf } from './skills';
import type { Person } from './family';

const game = (seed = 3): GameState => newGame(seed, 105, 2027, { site: CLASSIC });
const put = (g: GameState, id: string, kind: string, x: number, z: number): Structure => {
  const st: Structure = { id, kind, x, z, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 };
  g.structures.push(st);
  return st;
};
const winterNight = (g: GameState) => { g.clock.startDoy = 15; g.clock.t = 0.5; };

describe('freezing without heat', () => {
  it('no risk while the stove has wood; real risk when the woodpile is bare on a hard night', () => {
    const g = game(); winterNight(g); g.disaster.difficulty = 'hardcore';
    g.heat.burned = 0;
    expect(coldExposure(g)).toBe(0);
    expect(frostChance(g, g.people[0])).toBe(0);
    g.heat.burned = 1;
    expect(coldExposure(g)).toBeGreaterThan(0.2);
    expect(frostChance(g, g.people[0])).toBeGreaterThan(0.01);
  });
  it('the little and the old suffer more; Cozy is spared and Standard is gentler than Hardcore', () => {
    const g = game(); winterNight(g); g.heat.burned = 1;
    const kid = { ...g.people[0], age: 2, kid: true } as Person, adult = { ...g.people[0], age: 35, kid: false, elder: false } as Person;
    g.disaster.difficulty = 'standard';
    expect(frostChance(g, kid)).toBeGreaterThan(frostChance(g, adult) * 2);
    const std = frostChance(g, adult);
    g.disaster.difficulty = 'hardcore'; expect(frostChance(g, adult)).toBeGreaterThan(std);
    g.disaster.difficulty = 'cozy'; expect(frostChance(g, adult)).toBe(0);
  });
  it('a cold house gives frostbite cases over a bad winter; a warm one does not', () => {
    const count = (bare: boolean) => {
      let n = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const g = game(seed); winterNight(g); g.disaster.difficulty = 'hardcore'; g.heat.burned = bare ? 1 : 0;
        for (let d = 0; d < 40; d++) { g.clock.t = 0.5 + d; g.heat.burned = bare ? 1 : 0; medicalDay(g); }
        n += g.people.filter(p => casesOf(g, p.id).some(c => c.med!.kind === 'frostbite')).length + Object.values(g.medical?.lasting ?? {}).flat().length;
      }
      return n;
    };
    expect(count(true)).toBeGreaterThan(count(false));
  });
});

describe('the outhouse and the well', () => {
  it('closeness runs from foul to safe at 30 m', () => {
    expect(closeness(5)).toBe(1); expect(closeness(30)).toBe(0); expect(closeness(21)).toBeCloseTo(0.5, 1);
  });
  it('a hand well next to the privy is fouled; far away it is fine; a drilled well takes a sixth', () => {
    const near = game(); put(near, 'w', 'well_hand', 10, 10); put(near, 'o', 'outhouse', 11, 10);
    const far = game(); put(far, 'w', 'well_hand', 10, 10); put(far, 'o', 'outhouse', 20, 10);
    const drilled = game(); put(drilled, 'w', 'well_drilled', 10, 10); put(drilled, 'o', 'outhouse', 11, 10);
    expect(wellFouling(near)).toBeGreaterThan(0.9);
    expect(wellFouling(far)).toBe(0);
    expect(wellFouling(drilled)).toBeLessThan(wellFouling(near) / 4);
    expect(worstWell(near)!.metres).toBeCloseTo(6, 0);
    expect(worstWell(far)).toBeNull();
  });
  it('one clean well is enough, and treating the water takes most of the risk away', () => {
    const g = game(); put(g, 'w1', 'well_hand', 10, 10); put(g, 'o', 'outhouse', 11, 10); put(g, 'w2', 'well_hand', 40, 40);
    expect(wellRisks(g).length).toBe(2);
    expect(wellFouling(g)).toBe(0);
    const h = game(); put(h, 'w', 'well_hand', 10, 10); put(h, 'o', 'outhouse', 11, 10);
    h.stock.firewood = 0; h.stock.water_filter = 0;
    const raw = seepageChance(h); h.stock.water_filter = 1;
    expect(seepageChance(h)).toBeLessThan(raw * 0.2);
  });
  it('seepage makes the house sick over a year', () => {
    let sick = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const g = game(seed); put(g, 'w', 'well_hand', 10, 10); put(g, 'o', 'outhouse', 11, 10); g.stock.firewood = 0; g.stock.water_filter = 0;
      g.disaster.tracks.stores = 1;
      for (let d = 0; d < 365; d++) { g.clock.t = 0.5 + d; medicalDay(g); if (g.medical?.epidemic?.kind === 'dysentery' || g.personState.some(p => p.needs.hurt.some(h => h.med?.kind === 'dysentery'))) { sick++; break; } }
    }
    expect(sick).toBeGreaterThan(3);
  });
});

describe('the endless sandbox', () => {
  it('era pressure starts at 1, climbs, and caps by difficulty', () => {
    const g = game();
    expect(eraPressure(g)).toBe(1);
    g.lineage.era = 6; g.disaster.difficulty = 'standard'; const std = eraPressure(g);
    g.disaster.difficulty = 'hardcore'; const hard = eraPressure(g);
    g.disaster.difficulty = 'cozy'; const cozy = eraPressure(g);
    expect(cozy).toBeLessThan(std); expect(std).toBeLessThan(hard);
    g.lineage.era = 500; g.disaster.difficulty = 'standard'; expect(eraPressure(g)).toBe(1.6);
    g.disaster.difficulty = 'hardcore'; expect(eraPressure(g)).toBe(2.4);
  });
  it('raid pressure rises with the era and is unchanged in era I', () => {
    const g = game(); const base = raidPressure(g);
    g.lineage.era = 4; expect(raidPressure(g)).toBeGreaterThan(base);
  });
});

describe('heirs inherit full skills', () => {
  it('a parent\'s trades pass whole to the living children, never lowering theirs', () => {
    const g = game();
    const parent = g.people[0]; parent.skills.builder = 9; parent.skills.medic = 6; parent.skills.gardener = 2;
    const kid: Person = { ...structuredClone(g.people[1]), id: 'k1', first: 'Kit', kid: true, age: 12, parents: [parent.id, g.people[1].id], skills: { ...structuredClone(g.people[1].skills), builder: 1, medic: 8, gardener: 0 } };
    g.people.push(kid); g.personState.push({ id: 'k1', task: 'idle', target: null, needs: freshNeeds(), fatigue: 0 });
    learningOf(g).extra[parent.id] = { cooking: 7 };
    const gained = inheritSkills(g, parent);
    expect(gained).toContain('Kit');
    expect(kid.skills.builder).toBe(9);
    expect(kid.skills.medic).toBe(8);
    expect(kid.skills.gardener).toBe(0 + 2);
    expect(learningOf(g).extra['k1']?.cooking).toBe(7);
  });
  it('no children, no heirs', () => {
    const g = game(); for (const p of g.people) delete p.parents; expect(inheritSkills(g, g.people[0])).toEqual([]);
  });
});
