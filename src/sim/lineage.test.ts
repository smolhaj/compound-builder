import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { lineageDay, oldAgeRisk } from './lineage';
import { erasDay } from './eras';
import { nextEraDisaster, tracksAt, type DisasterKind } from './disaster';
import { migrate } from './save/migrations';

const live = (g: GameState, days: number) => { const t0 = Math.floor(g.clock.t); for (let d = 1; d <= days; d++) { g.clock.t = t0 + d; lineageDay(g); } };
const alive = (g: GameState) => g.personState.filter(ps => ps.needs.died == null).length;

describe('the family over the years', () => {
  it('the founders are kin: a couple, and the kids are theirs', () => {
    const g = newGame(3);
    const [a, b, k] = g.people;
    expect(a.partner).toBe(b.id);
    expect(b.partner).toBe(a.id);
    expect(k.parents).toEqual([a.id, b.id]);
    expect(g.people.every(p => p.kin && p.bday! >= 1 && p.bday! <= 365)).toBe(true);
  });

  it('everyone ages a year on their birthday; at 18 a kid is an adult', () => {
    const g = newGame(3);
    const k = g.people.find(p => p.kid)!;
    k.age = 17;
    const ages = g.people.map(p => p.age);
    live(g, 366);
    g.people.forEach((p, i) => { if (g.personState[i].needs.died == null && i < ages.length) expect(p.age).toBe(ages[i] + (p === k ? 0 : 1) + (p === k ? 1 : 0)); });
    expect(k.age).toBe(18);
    expect(k.kid).toBe(false);
    expect(g.lineage.chronicle.some(e => e.kind === 'coming')).toBe(true);
  });

  it('old age: about 1 % a year at 60, 6 % at 80, double with no doctor', () => {
    expect(oldAgeRisk(60, true)).toBeGreaterThan(0.006);
    expect(oldAgeRisk(60, true)).toBeLessThan(0.015);
    expect(oldAgeRisk(80, true)).toBeGreaterThan(0.04);
    expect(oldAgeRisk(80, true)).toBeLessThan(0.1);
    expect(oldAgeRisk(80, false)).toBeCloseTo(2 * oldAgeRisk(80, true));
  });

  it('a couple who can have children has some over twenty years, born on the place, a generation down', () => {
    let born = 0, ofA = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const g = newGame(seed);
      const [a, b] = g.people;
      a.body = 'f'; b.body = 'm'; a.age = 26; b.age = 28;
      live(g, 20 * 365);
      const kids = g.people.filter(p => p.bornHere);
      born += kids.length;
      for (const k of kids) { expect(k.last).toBe(g.lineage.family); expect(k.gen).toBe(k.parents!.includes(a.id) ? 2 : 3); }
      ofA += kids.filter(k => k.parents!.includes(a.id)).length;
    }
    expect(ofA).toBeGreaterThan(4);
    expect(born).toBeGreaterThan(6);
    expect(born).toBeLessThan(6 * 10);
  });

  it('the kids grow up, find partners, and the score and milestones add up', () => {
    const g = newGame(8);
    live(g, 30 * 365);
    expect(g.lineage.chronicle.some(e => e.kind === 'partner')).toBe(true);
    expect(g.lineage.milestones).toContain('decade');
    expect(g.lineage.milestones).toContain('quarter');
    expect(g.lineage.points).toBeGreaterThan(100);
    expect(g.people.length).toBe(g.personState.length);
  });
});

describe('eras', () => {
  const ended = (fate: 'full' | 'partial' | 'never', kind: DisasterKind = 'grid_down') => {
    const g = newGame(5, 105, 2027, { mode: 'surprise', kind });
    g.disaster.kind = kind; g.disaster.hitAt = 0; g.disaster.warnAt = -10; g.disaster.fate = fate; g.disaster.phase = 'survival';
    if (fate === 'never') g.disaster.back = {};
    g.clock.t = 400;
    g.disaster.tracks = tracksAt(g.disaster, 400);
    g.ending = { kind: 'equilibrium', day: 400, continued: true };
    return g;
  };

  it('playing on closes the era, and once the world settles the next one is rolled from where it left things', () => {
    const g = ended('never');
    const before = { ...g.disaster.tracks };
    erasDay(g);
    expect(g.lineage.eras).toHaveLength(1);
    expect(g.lineage.era).toBe(2);
    expect(g.ending).toBeNull();
    const d = g.disaster;
    expect(d.kind).not.toBe('grid_down');
    expect(d.hitAt).toBeGreaterThan(g.clock.t + 150);
    expect(d.phase).toBe('peace');
    expect(d.baseline!.grid).toBeCloseTo(Math.round(before.grid * 100) / 100);
    // the world stays where the last era left it
    expect(tracksAt(d, g.clock.t + 10).grid).toBeLessThan(0.3);
  });

  it('waits for a recovering world to settle before the next era', () => {
    const g = ended('full');
    g.clock.t = 50; g.stats.okSince = -1;
    erasDay(g);
    expect(g.lineage.eras).toHaveLength(1);
    expect(g.lineage.settling).toBe(true);
    expect(g.lineage.era).toBe(1);
    g.stats.okSince = 40;
    erasDay(g);
    expect(g.lineage.era).toBe(2);
  });

  it('a wipe ends the line', () => {
    const g = ended('never');
    g.ending = { kind: 'wipe', day: 400, continued: true };
    erasDay(g);
    expect(g.lineage.era).toBe(1);
  });

  it('nothing to knock down: no grid-down where the grid is gone', () => {
    const g = ended('never');
    for (let era = 2; era < 30; era++) {
      const d = nextEraDisaster({ ...g.disaster, tracks: { ...g.disaster.tracks, grid: 0.05 } }, 400, era * 7, era);
      expect(['grid_down', 'cyberattack', 'solar_flare']).not.toContain(d.kind);
    }
  });

  it('escalates: later eras come sooner and come back less often', () => {
    const g = ended('full');
    g.disaster.tracks = { ...g.disaster.tracks, grid: 1, fuel: 1, stores: 1, deliveries: 1, medical: 1, law: 1, phone: 1, banks: 1 };
    const stats = (era: number) => {
      let never = 0, quiet = 0;
      for (let seed = 0; seed < 300; seed++) { const d = nextEraDisaster(g.disaster, 0, seed, era); if (d.fate === 'never') never++; quiet += d.hitAt; }
      return { never, quiet: quiet / 300 };
    };
    const early = stats(2), late = stats(8);
    expect(late.never).toBeGreaterThan(early.never);
    expect(late.quiet).toBeLessThan(early.quiet);
  });

  it('free build: the next era is quiet until you start one', () => {
    const g = ended('partial');
    g.disaster.mode = 'sandbox';
    g.stats.okSince = 300;
    erasDay(g);
    expect(g.disaster.kind).toBeNull();
    expect(g.disaster.phase).toBe('peace');
  });
});

describe('save v30', () => {
  it('old saves get kinship and an empty chronicle', () => {
    const g = newGame(2) as unknown as Record<string, unknown>;
    const people = (g.people as Array<Record<string, unknown>>).map(p => { const { kin: _k, bday: _b, gen: _g, partner: _p, parents: _q, ...rest } = p; return rest; });
    const old = { ...g, version: 29, people };
    delete (old as Record<string, unknown>).lineage;
    const s = migrate(old);
    expect(s.lineage.era).toBe(1);
    expect(s.people[0].partner).toBe(s.people[1].id);
    expect(alive(s)).toBe(s.people.length);
  });
});
