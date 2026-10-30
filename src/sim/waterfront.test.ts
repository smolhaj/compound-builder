import { afterEach, describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { setGroundOverride } from './terrainState';
import { makeLotSite } from './lotListing';
import { BLUEPRINTS, totalBill } from './blueprints';
import { MATERIALS, type MaterialId } from './materials';
import { BOATS, boatFishK, boatSeats, boatsAtDock, dockProblem, docks, freezeDay, freezeDayBoats, hasBubbler, lakeIce, slipsOf, waterBearing, waterBody, waterLaneCost, waterLevelAt } from './waterfront';
import { raidAngle, terrainDefense, waterLaneOf } from './terrainFx';
import { campOf } from './terrainState';
import { KIT, placementProblem, type SiteQuery } from '../game/buildkit/kit';
import { plantChoreRate } from './renewables';

afterEach(() => setGroundOverride(null));
const lake = (kind: 'bluff' | 'island' | 'hillside' = 'bluff', region: 'mountain_west' | 'hill_country' = 'mountain_west'): GameState => { const g = newGame(21); g.site = makeLotSite({ kind, seed: 4, region }); return g; };
const built = (g: GameState, id: string, kind: string, x: number, z: number): Structure => { const st: Structure = { id, kind, x, z, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 }; g.structures.push(st); return st; };
const at = (g: GameState, doy: number, year = 0) => { g.clock.t = year * 365 + (((doy - g.clock.startDoy) % 365) + 365) % 365 + 0.5; };

describe('the water', () => {
  it('lake lots have a lake, a plain hillside has none, the bluff\'s level is the lake plane', () => {
    expect(waterBody(lake('bluff'))).toBe('lake');
    expect(waterBody(lake('island'))).toBe('lake');
    expect(waterBody(lake('hillside'))).toBeNull();
    expect(waterLevelAt(lake('bluff'), 30)).not.toBeNull();
    expect(dockProblem(lake('hillside'))).toBe('no_water');
    expect(dockProblem(lake('bluff'))).toBeNull();
  });

  it('the lake skims over after a cold fortnight and bears people after a colder one; a mild region never freezes', () => {
    const g = lake('bluff', 'mountain_west'), mild = lake('bluff', 'hill_country');
    at(g, 200); expect(lakeIce(g)).toBe('open');
    at(g, 20); expect(['skim', 'ice']).toContain(lakeIce(g));
    at(mild, 20); expect(lakeIce(mild)).toBe('open');
    // the first morning it skims over is a freeze day
    let found = -1;
    for (let d = 260; d < 365; d++) { at(g, d); if (freezeDay(g)) { found = d; break; } }
    expect(found).toBeGreaterThan(260);
  });

  it('a pier must reach from the bank into the water: the footprint rule', () => {
    const g = lake('bluff');
    const bear = waterBearing(g, campOf(g))!;
    expect(bear).not.toBeNull();
    const dock = KIT.boat_dock;
    const lakeY = waterLevelAt(g, 0)!;
    // a fake shore running along x = 30: water to the west
    const q: SiteQuery = { height: (x) => (x < 30 ? lakeY - 1 : lakeY + 1), owned: () => true, water: (x) => x < 30 };
    expect(placementProblem(dock, 30, 33, 1, q, [])).toBeNull();    // turned east-west, across the shoreline
    expect(placementProblem(dock, 10, 33, 1, q, [])).toBe('not_shore');   // wholly in the lake
    expect(placementProblem(dock, 50, 33, 1, q, [])).toBe('not_shore');   // wholly on land
    expect(placementProblem(KIT.garden, 10, 33, 0, q, [])).toBe('water');   // everything else still refuses water
  });
});

describe('boats', () => {
  it('boats are goods in the stockpile; the slips hold them; skiffs first', () => {
    const g = lake();
    built(g, 'd', 'boat_dock', 10, 10);
    g.stock.jon_boat = 3; g.stock.skiff = 1;
    expect(slipsOf(g)).toBe(2);
    expect(boatsAtDock(g)).toEqual({ skiff: 1, jon_boat: 1 });
    built(g, 'm', 'marina', 20, 10);
    expect(slipsOf(g)).toBe(8);
    expect(boatsAtDock(g)).toEqual({ skiff: 1, jon_boat: 3 });
    at(g, 200);
    expect(boatSeats(g)).toBe(BOATS.skiff.seats + 3 * BOATS.jon_boat.seats);
    at(g, 20);
    expect(boatSeats(g)).toBe(0);
  });

  it('fishing from the dock: three times the creek with a jon boat, more with a skiff, the creek\'s rate on safe ice, nothing on skim ice, nothing without a dock', () => {
    const g = lake(); g.stock.jon_boat = 1;
    at(g, 200); expect(boatFishK(g)).toBe(0);
    built(g, 'd', 'boat_dock', 10, 10);
    expect(boatFishK(g)).toBe(BOATS.jon_boat.fish);
    g.stock.skiff = 1; expect(boatFishK(g)).toBe(BOATS.skiff.fish);
    const cold = lake('bluff', 'mountain_west'); built(cold, 'd', 'boat_dock', 10, 10); cold.stock.jon_boat = 1;
    const kinds = new Set<number>();
    for (let d = 1; d <= 365; d += 5) { at(cold, d); kinds.add(boatFishK(cold)); }
    expect(kinds.has(0)).toBe(true);   // skim ice somewhere in the year
    expect(kinds.has(1)).toBe(true);   // and safe ice
  });

  it('the first hard freeze takes a boat left in the water; hauled out (the chore kept up) or with a powered bubbler it is safe', () => {
    const g = lake('bluff', 'mountain_west'); built(g, 'd', 'boat_dock', 10, 10); g.stock.jon_boat = 2;
    let day = -1;
    for (let d = 260; d < 365; d++) { at(g, d); if (freezeDay(g)) { day = d; break; } }
    at(g, day);
    expect(freezeDayBoats(g, 0.9, 80)[0]).toMatch(/thin/);      // a lucky roll: the ice held off
    expect(g.stock.jon_boat).toBe(2);
    expect(freezeDayBoats(g, 0.1, 80)[0]).toMatch(/crushed/);   // the chore was behind
    expect(g.stock.jon_boat).toBe(1);
    expect(freezeDayBoats(g, 0.1, 10)[0]).toMatch(/hauled/);    // kept up
    expect(g.stock.jon_boat).toBe(1);
    const m = built(g, 'm', 'marina', 20, 10);
    expect(hasBubbler(g)).toBe(false);
    g.utilities.lit = [m.id];
    expect(hasBubbler(g)).toBe(true);
    expect(freezeDayBoats(g, 0.1, 80)).toEqual([]);
    expect(docks(g)).toHaveLength(2);
  });

  it('the dock loads the plant chore at the haul-out and the launch', () => {
    const g = lake(); built(g, 'd', 'boat_dock', 10, 10);
    expect(plantChoreRate(g, 275)).toBeGreaterThan(plantChoreRate(g, 200));
    expect(plantChoreRate(g, 110)).toBeGreaterThan(plantChoreRate(g, 200));
  });
});

describe('raids by water', () => {
  it('a dock makes the landing easy, a bluff\'s face is a cliff, ice is a bridge, skim ice and thin water close the lake side', () => {
    expect(waterLaneCost(6, 'dock', false)).toBeLessThan(waterLaneCost(6, 'shore', false));
    expect(waterLaneCost(6, 'shore', false)).toBeLessThan(waterLaneCost(6, 'cliff', false));
    expect(waterLaneCost(6, 'dock', true)).toBeGreaterThan(waterLaneCost(6, 'dock', false));
    const g = lake('bluff', 'mountain_west');
    at(g, 200);
    const open = waterLaneOf(g);
    expect(open).not.toBeNull();
    expect(open!.landing).toBe('cliff');
    const c = campOf(g), b = waterBearing(g, c)!;
    built(g, 'd', 'boat_dock', c[0] + Math.cos(b.ang) * b.dist, c[1] + Math.sin(b.ang) * b.dist);
    expect(waterLaneOf(g)!.landing).toBe('dock');
    expect(waterLaneOf(g)!.cost).toBeLessThan(open!.cost);
    expect(terrainDefense(g).lines.join(' ')).toMatch(/dock is a landing/);
    let sawIce = false, sawSkim = false;
    for (let d = 1; d <= 365; d += 4) { at(g, d); const w = waterLaneOf(g); const ice = lakeIce(g); if (ice === 'ice') { sawIce = true; expect(w!.ice).toBe('ice'); expect(w!.crews).toBeGreaterThan(0.8); } if (ice === 'skim') { sawSkim = true; expect(w).toBeNull(); } }
    expect(sawIce && sawSkim).toBe(true);
    expect(raidAngle(lake('hillside'), () => 0.5)?.lane.cliff ?? false).toBe(false);
  });
});

describe('priced and staged', () => {
  it('the table has the boats and the piers', () => {
    const cost = (k: string) => Object.entries(totalBill(BLUEPRINTS[k])).reduce((a, [m, n]) => a + (MATERIALS[m as MaterialId].price ?? 0) * n, 0);
    for (const k of ['boat_dock', 'marina']) { expect(BLUEPRINTS[k].stages).toHaveLength(5); for (const m of Object.keys(totalBill(BLUEPRINTS[k]))) expect(MATERIALS[m as MaterialId].price, m).not.toBeNull(); }
    expect(cost('boat_dock')).toBeGreaterThan(4000); expect(cost('boat_dock')).toBeLessThan(9000);
    expect(cost('marina')).toBeGreaterThan(15000); expect(cost('marina')).toBeLessThan(35000);
    expect(MATERIALS.jon_boat.price).toBe(1300); expect(MATERIALS.skiff.price).toBe(9800);
  });
});
