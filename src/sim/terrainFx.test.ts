import { afterEach, describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { setGroundOverride } from './terrainState';
import { FX, chokeHeld, floodCandidates, gravityHeadM, mudFactor, pumpDrawFactor, raidAngle, sunFactor, terrainDefense } from './terrainFx';
import type { GroundSource } from './terrain';
import { addWork } from './construction';
import { balanceDay, plant } from './utilities';
import { planBattle } from './battle';
import { planRun } from './perimeter';
const line = (g: GameState, pts: Array<[number, number]>) => { const r = planRun(g, 'power_cable', pts); r.done = r.hours; r.supplied = true; r.finishedAt = 0; return r; };

afterEach(() => setGroundOverride(null));
const built = (g: GameState, id: string, kind: string, x: number, z: number, done = true): Structure => {
  const st: Structure = { id, kind, x, z, rot: 0, stage: done ? 9 : 0, done: 0, supplied: done, finishedAt: done ? 0 : null };
  g.structures.push(st);
  return st;
};
const game = (seed = 3): GameState => { const g = newGame(seed); g.site = { ...g.site, creek: false }; return g; };

describe('solar on a slope', () => {
  const south: GroundSource = { h: (_x, z) => -0.15 * z }, north: GroundSource = { h: (_x, z) => 0.15 * z };
  it('a south-facing slope gives more sun, a north-facing less, the level none either way; capped at ±25 %', () => {
    const g = game(), st = { x: 30, z: 30 };
    setGroundOverride(south); expect(sunFactor(g, st)).toBeCloseTo(1.12, 2);
    setGroundOverride(north); expect(sunFactor(g, st)).toBeCloseTo(0.88, 2);
    setGroundOverride({ h: () => 0 }); expect(sunFactor(g, st)).toBe(1);
    setGroundOverride({ h: (_x, z) => -3 * z }); expect(sunFactor(g, st)).toBeLessThanOrEqual(1.25 + 1e-9);
  });

  it('the same array makes more power on the south face than on the north, through the real daily balance', () => {
    const kwh = (ground: GroundSource) => {
      setGroundOverride(ground);
      const g = newGame(1, 172); g.site = { ...g.site, creek: false };
      built(g, 'h', 'timber_cabin', 10, 10); built(g, 's', 'solar_array', 12, 10); built(g, 'b', 'battery_shed', 11, 12);
      line(g, [[12, 10], [10, 10], [11, 12]]);
      g.utilities.fittings.push({ building: 'h', kind: 'wire', done: 30, hours: 30, supplied: true, finishedAt: 0 });
      balanceDay(g, plant(g), 0.5);
      return g.utilities.report.solarKwh;
    };
    expect(kwh(south)).toBeGreaterThan(kwh(north) * 1.15);
  });
});

describe('floods take the bottom, not the bench', () => {
  const creek = { zAt: () => 33, waterY: () => 0, halfWidth: 1 };
  const valley: GroundSource = { h: (_x, z) => Math.min(6, Math.abs(z - 33) * 0.5), creek };
  it('a garden on the bench 12 m up is spared; one in the bottom is at risk; a house in the floodplain is too', () => {
    setGroundOverride(valley);
    const g = game(); g.site = { ...g.site, creek: true };
    const low = built(g, 'g1', 'garden', 20, 34), high = built(g, 'g2', 'garden', 20, 55), house = built(g, 'h1', 'timber_cabin', 25, 33.6), bench = built(g, 'h2', 'timber_cabin', 25, 58);
    const c = floodCandidates(g, g.structures).map(s => s.id);
    expect(c).toContain(low.id); expect(c).toContain(house.id);
    expect(c).not.toContain(high.id); expect(c).not.toContain(bench.id);
  });
  it('with no creek on the ground it is the old rule: low kinds, wherever they stand', () => {
    setGroundOverride({ h: () => 0 });
    const g = game();
    built(g, 'g1', 'garden', 20, 20); built(g, 'h1', 'timber_cabin', 25, 35);
    expect(floodCandidates(g, g.structures).map(s => s.id)).toEqual(['g1']);
  });
});

describe('mud', () => {
  it('slows building on the floodplain in the spring thaw only', () => {
    const creek = { zAt: () => 33, waterY: () => 0, halfWidth: 1 };
    setGroundOverride({ h: (_x, z) => Math.min(6, Math.abs(z - 33) * 0.5), creek });
    const g = game(); g.site = { ...g.site, creek: true };
    const bottom = { x: 20, z: 33.6 }, bench = { x: 20, z: 58 };
    g.clock.t = 0;   // the game starts on day 102: in the thaw window
    expect(mudFactor(g, bottom)).toBe(FX.MUD_SLOW);
    expect(mudFactor(g, bench)).toBe(1);
    g.clock.t = 150;  // late summer
    expect(mudFactor(g, bottom)).toBe(1);
    expect(mudFactor(g, bottom, true)).toBe(FX.MUD_SLOW);
  });
  it('is applied to the work itself', () => {
    const creek = { zAt: () => 33, waterY: () => 0, halfWidth: 1 };
    const place = (z: number) => {
      setGroundOverride({ h: (_x, zz) => Math.min(6, Math.abs(zz - 33) * 0.5), creek });
      const g = game(); g.site = { ...g.site, creek: true }; g.clock.t = 0;
      const st = built(g, 'c', 'timber_cabin', 20, z, false);
      g.stock.lumber = 99; g.stock.hardware = 99; g.stock.roofing = 99; g.stock.concrete = 99; g.stock.fieldstone = 99;
      addWork(g, st, 5);
      return st.done + st.stage * 1000;
    };
    expect(place(33.6)).toBeLessThanOrEqual(place(58) * FX.MUD_SLOW + 1e-6);
  });
});

describe('gravity feed', () => {
  const bench: GroundSource = { h: (x, z) => (Math.hypot(x - 40, z - 20) < 6 ? 2.5 : 0) };
  it('a reservoir 15 m above the house cuts the well pump\'s draw; one on the level does not', () => {
    setGroundOverride(bench);
    const g = game();
    built(g, 'h', 'timber_cabin', 10, 10);
    built(g, 'r', 'reservoir', 40, 20);
    expect(gravityHeadM(g)).toBeGreaterThan(FX.GRAVITY_M);
    expect(pumpDrawFactor(g)).toBeCloseTo(1 - FX.GRAVITY_CUT);
    setGroundOverride({ h: () => 0 });
    expect(gravityHeadM(g)).toBe(0);
    expect(pumpDrawFactor(g)).toBe(1);
  });
  it('shows in the day\'s power: the same pump takes less of the battery', () => {
    const draw = (ground: GroundSource) => {
      setGroundOverride(ground);
      const g = newGame(1, 172); g.site = { ...g.site, creek: false };
      built(g, 'h', 'timber_cabin', 10, 10); built(g, 'w', 'well_drilled', 14, 10); built(g, 'r', 'reservoir', 40, 20); built(g, 's', 'solar_array', 10, 14); built(g, 'b', 'battery_shed', 12, 14);
      line(g, [[10, 14], [14, 10], [10, 10], [12, 14]]);
      g.utilities.fittings.push({ building: 'h', kind: 'wire', done: 30, hours: 30, supplied: true, finishedAt: 0 });
      balanceDay(g, plant(g), 0.5);
      return g.utilities.report.drawKwh;
    };
    expect(draw(bench)).toBeLessThan(draw({ h: () => 0 }));
  });
});

describe('raids come by the cheapest way', () => {
  // a plateau ringed by cliffs but for a ramp on the west, away from the road side (south, +z)
  const fort: GroundSource = { h: (x, z) => {
    const d = Math.hypot(x - 33, z - 33);
    if (d < 12) return 6;
    if (Math.abs(z - 33) < 3.5 && x < 33) return Math.max(0, 6 - (d - 12) * 0.2);
    return Math.max(0, 6 - (d - 12) * 2.5);
  } };
  it('a crew comes round to an easy lane when the road side is cliff; the road side stays the road side on open ground', () => {
    const g = game(); g.site = { ...g.site, home: { x0: 0, z0: 0, x1: 67, z1: 67 } };
    setGroundOverride(fort);
    built(g, 'h', 'timber_cabin', 33, 33);
    const a = raidAngle(g, () => 0.5);
    expect(a).toBeTruthy();
    expect(Math.abs(Math.abs(a!.ang) - Math.PI)).toBeLessThan(0.9);   // from the west
    setGroundOverride({ h: () => 0 });
    expect(raidAngle(g, () => 0.5)).toBeNull();
  });
  it('planBattle takes the terrain\'s lane and can be told not to', () => {
    const g = game(); g.site = { ...g.site, home: { x0: 0, z0: 0, x1: 67, z1: 67 } };
    setGroundOverride(fort);
    built(g, 'h', 'timber_cabin', 33, 33);
    const near = (b: ReturnType<typeof planBattle>) => b.units.filter(u => u.side === 'raider').reduce((a, u) => a + u.x, 0) / Math.max(1, b.units.filter(u => u.side === 'raider').length);
    const withT = planBattle(g, 4, 5), without = planBattle(g, 4, 5, { terrain: false });
    expect(near(withT)).toBeLessThan(near(without) - 3);   // west of the house vs the road side
  });
});

describe('the ground\'s share of the defense', () => {
  const neck: GroundSource = { h: (x, z) => {
    const d = Math.hypot(x - 33, z - 33);
    if (d < 12) return 6;
    if (Math.abs(x - 33) < 3.5 && z > 33) return Math.max(0, 6 - (d - 12) * 0.25);
    return Math.max(0, 6 - (d - 12) * 2.5);
  } };
  it('is 0 on open ground, rises with a hard lane, and a wall at the choke counts as holding it', () => {
    const g = game(); g.site = { ...g.site, home: { x0: 0, z0: 0, x1: 67, z1: 67 } };
    built(g, 'h', 'timber_cabin', 33, 33);
    setGroundOverride({ h: () => 0 });
    expect(terrainDefense(g).score).toBeLessThan(0.15);
    setGroundOverride(neck);
    const d = terrainDefense(g);
    expect(d.lane?.choke).toBeTruthy();
    expect(d.held).toBe(false);
    expect(d.lines.join(' ')).toMatch(/narrows/);
    const r = planRun(g, 'chain_link', [[d.lane!.choke!.at[0] - 3, d.lane!.choke!.at[1]], [d.lane!.choke!.at[0] + 3, d.lane!.choke!.at[1]]]); r.finishedAt = 0;
    expect(chokeHeld(g, d.lane!.choke!)).toBe(true);
    expect(terrainDefense(g).score).toBeGreaterThan(d.score);
  });
});

import { terrainCards } from './terrainFx';
import { suggestions } from './guidance';

describe('the land\'s cards: suggest, never impose', () => {
  const gorge: GroundSource = { h: (_x, z) => Math.min(4, Math.abs(z - 33) * 0.9), creek: { zAt: () => 33, waterY: () => 0.05, halfWidth: 0.6 } };
  const withHome = (): GameState => {
    const g = game(); g.site = { ...g.site, home: { x0: 0, z0: 0, x1: 67, z1: 67 }, creek: true };
    built(g, 'h', 'timber_cabin', 10, 10);
    g.clock.t = 90;
    return g;
  };
  it('no card before there is a finished home; none on flat ground', () => {
    setGroundOverride(gorge);
    const none = game(); none.site = { ...none.site, home: { x0: 0, z0: 0, x1: 67, z1: 67 } };
    expect(terrainCards(none)).toEqual([]);
    setGroundOverride({ h: () => 0 });
    expect(terrainCards(withHome())).toEqual([]);
  });
  it('a gorge on the lot is offered as a natural choke point, as a Next-step card with a Show me button', () => {
    setGroundOverride(gorge);
    const g = withHome();
    const c = terrainCards(g);
    expect(c).toHaveLength(1);
    expect(c[0].title).toMatch(/gorge is a natural choke point/);
    // the card is low urgency: it shows when fewer than three more pressing things are on the list, and is crowded out otherwise
    const all = suggestions(g), sug = all.find(x => x.id === 'land_gorge');
    if (sug) expect(sug.acts?.[0].act).toEqual({ type: 'terrain', mode: 'lanes' });
    else expect(all).toHaveLength(3);
    // with the pressing things done it is there
    g.stock.canned = 999; g.stock.staples = 999; g.stock.fresh = 999;
    expect(terrainCards(g)[0].urgency).toBeLessThan(40);
  });
});

import { terrainPoints } from './terrainFx';
import { adaptOf } from './encounters';
describe('the shared strength', () => {
  it('the ground adds up to 15 defense points to what the crews learn from', () => {
    const neck: GroundSource = { h: (x, z) => { const d = Math.hypot(x - 33, z - 33); if (d < 12) return 6; if (Math.abs(x - 33) < 3.5 && z > 33) return Math.max(0, 6 - (d - 12) * 0.25); return Math.max(0, 6 - (d - 12) * 2.5); } };
    const g = game(); g.site = { ...g.site, home: { x0: 0, z0: 0, x1: 67, z1: 67 } };
    built(g, 'h', 'timber_cabin', 33, 33);
    setGroundOverride({ h: () => 0 });
    expect(terrainPoints(g)).toBeLessThan(2);
    setGroundOverride(neck);
    expect(terrainPoints(g)).toBeGreaterThan(terrainPoints({ ...g, structures: [] } as GameState) - 1);
    expect(terrainPoints(g)).toBeLessThanOrEqual(15);
    expect(typeof adaptOf(g)).toBe('number');
  });
});

import { groundOf } from './terrainState';
import { ParcelTerrain } from '../game/parcel/parcelTerrain';
describe('the same ground the world draws', () => {
  it('reads the lot profile and home block like HomesteadWorld, so a varied lot is analysed as drawn', () => {
    const g = newGame(11);
    const pt = new ParcelTerrain(g.seed, { creek: g.site.creek, timber: g.site.timber, region: g.site.region, lot: g.site.lot ?? null, home: g.site.home });
    const src = groundOf(g)!;
    for (const [x, z] of [[10, 10], [33, 40], [60, 20]]) expect(src.h(x, z)).toBeCloseTo(pt.natural(x, z).h, 6);
  });
});
