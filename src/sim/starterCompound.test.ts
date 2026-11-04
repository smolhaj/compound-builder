import { describe, expect, it } from 'vitest';
import { makeLotSite, siteLot } from './lotListing';
import { newGame, type GameState } from './state';
import { planStarter, homeKinds, STARTER_REACH } from './starterCompound';
import { CELL, KIT, footprint, type SiteQuery } from '../game/buildkit/kit';
import { siteProblem } from '../game/buildkit/underground';
import { padClash } from '../game/buildkit/padRules';
import { AUTO_REACH } from './utilities';
import { SAFE_M } from './sanitation';

const flatQuery = (g: GameState): SiteQuery => {
  const h = g.site.home, lot = siteLot(g.site);
  return { height: lot ? lot.field.h : () => 0, owned: (x, z) => x >= h.x0 && x <= h.x1 && z >= h.z0 && z <= h.z1, water: () => false };
};
const geoOf = (g: GameState) => { const h = g.site.home; return { center: [(h.x0 + h.x1) / 2, (h.z0 + h.z1) / 2] as [number, number], drive: [[h.x1, (h.z0 + h.z1) / 2], [(h.x0 + h.x1) / 2 + 3, (h.z0 + h.z1) / 2]] as Array<[number, number]> }; };
const flat = (seed = 7, money?: number) => { const g = newGame(seed); g.structures = []; if (money !== undefined) g.money = money; return g; };
const hill = (seed = 7) => { const g = newGame(seed); g.structures = []; g.site = { ...makeLotSite({ kind: 'hillside', relief: 10, elevM: 1800, seed: 3 }), creek: false }; return g; };

describe('starter compound planner', () => {
  it('sizes the home to the family', () => {
    expect(homeKinds(0)).toEqual([]);
    expect(homeKinds(3)).toEqual(['cottage']);
    expect(homeKinds(4)).toEqual(['timber_cabin']);
    expect(homeKinds(6)).toEqual(['log_house']);
    expect(homeKinds(9)).toEqual(['log_house', 'cottage']);
  });

  it('lays a house, water, privy, power, food on a flat lot, every spot legal by the placement rules', () => {
    const g = flat(); g.money = 600_000;
    const p = planStarter(g, { query: flatQuery(g), geo: geoOf(g) });
    expect(p.problem).toBeNull();
    const keys = p.pieces.filter(x => !x.later).map(x => x.key);
    for (const k of ['home', 'well', 'privy', 'solar', 'battery', 'garden', 'cellar']) expect(keys).toContain(k);
    const q = flatQuery(g), placed: Array<{ id: string; kind: string; x: number; z: number; rot: number }> = [];
    for (const x of p.pieces.filter(y => !y.later)) {
      expect(siteProblem(KIT[x.kind], x.x, x.z, x.rot, q, placed as never)).toBeNull();
      expect(padClash(KIT[x.kind], x.x, x.z, x.rot, q.height, placed as never)).toBeNull();
      placed.push({ id: x.key, kind: x.kind, x: x.x, z: x.z, rot: x.rot });
    }
    expect(p.yard && !p.yard.later).toBe(true);
    expect(p.line).toMatch(/pieces/);
  });

  it('keeps everything within the utilities reach of the house and the privy 30 m from the well', () => {
    const g = flat(); g.money = 600_000;
    const p = planStarter(g, { query: flatQuery(g), geo: geoOf(g) });
    const home = p.pieces.find(x => x.key === 'home')!;
    for (const x of p.pieces.filter(y => !y.later)) expect(Math.hypot(x.x - home.x, x.z - home.z)).toBeLessThanOrEqual(STARTER_REACH + 2);
    expect(STARTER_REACH).toBeLessThan(AUTO_REACH);
    const w = p.pieces.find(x => x.key === 'well')!, pv = p.pieces.find(x => x.key === 'privy')!;
    expect(Math.hypot(w.x - pv.x, w.z - pv.z) * 6).toBeGreaterThanOrEqual(SAFE_M);
  });

  it('pieces keep clear air between their footprints', () => {
    const g = flat(); g.money = 600_000;
    const p = planStarter(g, { query: flatQuery(g), geo: geoOf(g) }), live = p.pieces.filter(x => !x.later);
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = footprint(KIT[live[i].kind], live[i].x, live[i].z, live[i].rot), b = footprint(KIT[live[j].kind], live[j].x, live[j].z, live[j].rot);
      expect(a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0).toBe(false);
    }
  });

  it('is deterministic, and a different seed or lot gives a different layout', () => {
    const a = flat(7); a.money = 600_000;
    const x = planStarter(a, { query: flatQuery(a), geo: geoOf(a) }), y = planStarter(structuredClone(a), { query: flatQuery(a), geo: geoOf(a) });
    expect(y).toEqual(x);
    const h = hill(); h.money = 600_000;
    const z = planStarter(h, { query: flatQuery(h), geo: geoOf(h) });
    expect(z.pieces.map(p => [p.x, p.z])).not.toEqual(x.pieces.map(p => [p.x, p.z]));
  });

  it('on a steep lot pieces land where the pad rules allow, and a slope costs more (graded pads)', () => {
    const h = hill(); h.money = 900_000;
    const p = planStarter(h, { query: flatQuery(h), geo: geoOf(h) });
    const home = p.pieces.find(x => x.key === 'home');
    expect(home && !home.later).toBe(true);
    const q = flatQuery(h), placed: Array<{ id: string; kind: string; x: number; z: number; rot: number }> = [];
    for (const x of p.pieces.filter(y => !y.later)) { expect(siteProblem(KIT[x.kind], x.x, x.z, x.rot, q, placed as never)).toBeNull(); placed.push({ id: x.key, kind: x.kind, x: x.x, z: x.z, rot: x.rot }); }
  });

  it('affordability: a thin purse lists the rest as later, shelter first, never over what can be spared', () => {
    const g = flat(); g.money = 90_000;
    const p = planStarter(g, { query: flatQuery(g), geo: geoOf(g) });
    const now = p.pieces.filter(x => !x.later);
    expect(now.length).toBeGreaterThan(0);
    expect(now.some(x => x.key === 'home')).toBe(true);
    expect(p.pieces.some(x => x.later && x.laterWhy)).toBe(true);
    expect(p.usd).toBeLessThanOrEqual(p.cash - p.reserve);
    const broke = flat(); broke.money = 5_000;
    const b = planStarter(broke, { query: flatQuery(broke), geo: geoOf(broke) });
    expect(b.pieces.every(x => x.later)).toBe(true);
    expect(b.problem).not.toBeNull();
  });

  it('skips what already stands, and what the player drops', () => {
    const g = flat(); g.money = 600_000;
    const h = g.site.home;
    g.structures.push({ id: 'w', kind: 'well_hand', x: (h.x0 + h.x1) / 2 + 4, z: (h.z0 + h.z1) / 2 + 6, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    const p = planStarter(g, { query: flatQuery(g), geo: geoOf(g), skip: ['garden', 'yard'] });
    expect(p.pieces.find(x => x.key === 'well')).toBeUndefined();
    expect(p.pieces.find(x => x.key === 'garden')?.later).toBe(true);
    expect(p.yard).toBeNull();
    expect(CELL).toBe(0.5);
  });

  it('a household with a bed for everyone gets no second home', () => {
    const g = flat(); g.money = 600_000;
    const h = g.site.home;
    g.structures.push({ id: 'h', kind: 'log_house', x: (h.x0 + h.x1) / 2, z: (h.z0 + h.z1) / 2, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    const p = planStarter(g, { query: flatQuery(g), geo: geoOf(g) });
    expect(p.pieces.filter(x => x.role === 'shelter')).toHaveLength(0);
  });
});
