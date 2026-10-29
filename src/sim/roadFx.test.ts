import { describe, expect, it } from 'vitest';
import { DROPPED_SCORE, RFX, bridgeDown, chokesOf, crossingOutFor, dropRoadBridge, easeOf, rebuildQuote, rebuildRoadBridge, responseOf, roadBridgeDay, roadBridgeOf, roadChokes, roadEase, roadStart, startOf, structureDelay, structureDelayOf, winterOf } from './roadFx';
import { planRoad, type RoadGround, type RoadInput } from './roadPlan';
import { roadPlanFor } from './roadState';
import { makeLotSite } from './lotListing';
import { CLASSIC, RAW, type Site } from './site';
import { newGame, type GameState, type Structure } from './state';
import { driveQuote, hookupProblem, orderHookup } from './improvements';
import { terrainDefense, FX } from './terrainFx';
import { weatherDelay } from './upkeep';
import { deliverOrders, placeOrder } from './economy';
import { responseFactor } from './slope';
import type { RegionId } from './regions';

const input = (region: RegionId, ground: RoadGround, over: Partial<RoadInput> = {}): RoadInput => ({
  region, seed: 5, ground, rect: { x0: 0, z0: 0, x1: 67, z1: 67 }, frontage: { x: 67, zMin: 4, zMax: 63, band: [24, 40] }, county: () => 70.4, roadHalf: 0.5, yard: [30, 32], ...over,
});
const FLAT: RoadGround = { h: () => 1 };
const TIGHT: Partial<RoadInput> = { rect: { x0: 0, z0: 22, x1: 67, z1: 42 }, frontage: { x: 67, zMin: 24, zMax: 40, band: [24, 40] }, yard: [18, 32] };
const hill = planRoad(input('mountain_west', { h: x => 1 + (67 - x) * 0.2 }, TIGHT));
const flat = planRoad(input('mountain_west', FLAT));
/** A creek across the way, 8.4 m wide: a bridge (Mountain West) or a low-water slab (Appalachia). */
const creek = { zAt: () => 36, waterY: () => 0.6, halfWidth: 0.7 };
const wet: RoadGround = { h: (_x, z) => (Math.abs(z - 36) < 1.2 ? 0.7 : 1), creek };
const cross = (region: RegionId) => planRoad(input(region, wet, { frontage: { x: 67, zMin: 4, zMax: 63, band: [10, 26] }, yard: [30, 50] }));

describe('the road in the sim', () => {
  it('winter: grade, hairpins, length and a bridge or ford add up; level and short adds nothing', () => {
    expect(winterOf(hill)).toBeGreaterThan(winterOf(flat) + 0.3);
    expect(winterOf(flat)).toBeLessThan(0.3);
    expect(winterOf(cross('mountain_west'))).toBeGreaterThan(winterOf(flat) + RFX.ICE - 0.2);
  });

  it('response time: long, winding, steep and single-file roads are slower; a short level drive is 1', () => {
    expect(responseOf(flat)).toBeLessThan(1.15);
    expect(responseOf(hill)).toBeGreaterThan(responseOf(flat) + 0.1);
    expect(responseOf(cross('mountain_west'))).toBeGreaterThan(responseOf(flat));
  });

  it('a one-lane bridge, a bore, a ford and a chain of hairpins are chokes; the crew\'s start distance grows with them, capped', () => {
    const b = cross('mountain_west'), f = cross('appalachia');
    expect(b.structures.some(s => s.kind === 'bridge1')).toBe(true);
    expect(chokesOf(b).map(c => c.kind)).toContain('bridge1');
    expect(chokesOf(f).map(c => c.kind)).toContain('low_water');
    expect(chokesOf(flat).length).toBe(0);
    expect(startOf(flat)).toBe(0);
    expect(startOf(b)).toBeGreaterThanOrEqual(RFX.CHOKE_START);
    expect(startOf(b)).toBeLessThanOrEqual(RFX.START_CAP);
    expect(startOf(hill)).toBe(Math.min(RFX.START_CAP, hill.hairpins.length * RFX.HAIRPIN_START));
  });

  it('a slow road is less of an easy way in for a crew; a short straight one is not', () => {
    expect(easeOf(flat, 0.75)).toBeLessThanOrEqual(1);
    expect(easeOf(flat, 0.75)).toBeLessThan(0.85);
    expect(easeOf(hill, 0.75)).toBeGreaterThan(easeOf(flat, 0.75));
    expect(easeOf(hill, 0.95)).toBeLessThanOrEqual(1);
  });

  it('heavy loads are shuttled across a one-lane bridge: two more days; lumber and a bridge-less road are not held', () => {
    const b = cross('mountain_west');
    expect(structureDelayOf(b, ['concrete'])).toMatchObject({ days: 2 });
    expect(structureDelayOf(b, ['concrete']).why).toMatch(/one-lane bridge is posted/);
    expect(structureDelayOf(b, ['lumber']).days).toBe(0);
    expect(structureDelayOf(flat, ['concrete']).days).toBe(0);
    expect(structureDelayOf(cross('appalachia'), ['concrete']).days).toBe(0);   // a low-water slab carries the truck
  });
});

describe('what a game reads', () => {
  const lotGame = (seed = 7) => newGame(seed, 105, 2027, { site: makeLotSite({ region: 'mountain_west', kind: 'hillside', seed: 1, relief: 9, elevM: 2500 }) });

  it('the classic ground is untouched by the raid and delivery effects (and never pays for the plan there)', () => {
    const g = newGame(3);
    expect(roadChokes(g)).toEqual([]);
    expect(roadStart(g)).toBe(0);
    expect(roadEase(g, FX.ROAD_EASE)).toBe(FX.ROAD_EASE);
    expect(structureDelay(g, ['concrete']).days).toBe(0);
    expect(responseFactor(g)).toBe(1);
  });

  it('a hill lot\'s switchbacks are a choke on the road: the defense says so, a tower or wall at it counts, the raid starts further out', () => {
    const g = lotGame(), p = roadPlanFor(g.site, g.seed);
    expect(p.hairpins.length).toBeGreaterThanOrEqual(2);
    const chokes = roadChokes(g);
    expect(chokes.map(c => c.kind)).toContain('hairpins');
    expect(roadStart(g)).toBeGreaterThanOrEqual(RFX.HAIRPIN_START * 2);
    const before = terrainDefense(g);
    expect(before.lines.join(' ')).toMatch(/single file at 3 hairpins/);
    expect(before.lines.join(' ')).toMatch(/would matter/);
    const at = chokes[0].at, tw: Structure = { id: 'tw', kind: 'watchtower_wood', x: at[0] + 1, z: at[1], rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 };
    g.structures.push(tw);
    const after = terrainDefense(g);
    expect(after.lines.join(' ')).toMatch(/You hold the choke on the road/);
    expect(after.score).toBeGreaterThan(before.score);
    // small: at most a quarter of the terrain's share
    expect(after.score - before.score).toBeLessThanOrEqual(RFX.DEFENSE_SHARE + 0.3 + 1e-9);
  });

  it('a hill lot\'s road slows the deputy (length, hairpins) and gives a driveway quote from the planned road', () => {
    const g = lotGame();
    expect(responseFactor(g)).toBeGreaterThan(1.1);
    const q = driveQuote(g.site.improvements, g.site, g.seed);
    expect(q.plan).toBeTruthy();
    expect(q.usd).toBe(q.plan!.usd);
    expect(q.days).toBe(q.plan!.days);
  });

  it('a low-water crossing is under the creek for the days of a flood, and holds the truck; a bridge is not', () => {
    const app: Site = { ...CLASSIC, region: 'appalachia', creek: true, improvements: { ...RAW, power: true } };
    const g = newGame(6, 130, 2027, { site: app });
    expect(roadPlanFor(g.site, g.seed).structures.some(s => s.kind === 'low_water' || s.kind === 'ford')).toBe(true);
    expect(crossingOutFor(g)).toBe(0);
    expect(weatherDelay(g, ['lumber']).days).toBe(0);
    const day = Math.floor(g.clock.t);
    g.weather = { active: { kind: 'flood', at: day, until: day + 2 }, last: -999 };
    expect(crossingOutFor(g)).toBeGreaterThan(0);
    const w = weatherDelay(g, ['lumber']);
    expect(w.days).toBeGreaterThan(0);
    expect(w.why).toMatch(/low-water crossing is under the creek/);
    // a storm that is not a flood leaves it open
    g.weather = { active: { kind: 'blizzard', at: day, until: day + 2 }, last: -999 };
    expect(crossingOutFor(g)).toBe(0);
    // on the Plains the creek is crossed on a bridge: a flood does not close the road
    const pl: Site = { ...CLASSIC, region: 'plains', creek: true, improvements: { ...RAW, power: true } };
    const g2 = newGame(6, 130, 2027, { site: pl });
    g2.weather = { active: { kind: 'flood', at: day, until: day + 2 }, last: -999 };
    expect(crossingOutFor(g2)).toBe(0);
  });

  it('ordering the drive pays the planned price and the log names what is in it', () => {
    const app: Site = { ...CLASSIC, region: 'appalachia', creek: true, improvements: { ...RAW, power: true } };
    const g = newGame(6, 130, 2027, { site: app });
    g.money = 500_000;
    const q = driveQuote(g.site.improvements, g.site, g.seed);
    expect(hookupProblem(g, 'drive')).toBeNull();
    const before = g.money;
    expect(orderHookup(g, 'drive')).toBeNull();
    expect(before - g.money).toBe(q.usd);
    expect(g.log.slice(-3).map(l => l.text).join(' ')).toMatch(/low-water crossing/);
  });
});

describe('the bridge on the way in', () => {
  const plains = (seed = 6): GameState => newGame(seed, 130, 2027, { site: { ...CLASSIC, region: 'plains', creek: true, improvements: { ...RAW, power: true, drive: true } } });

  it('can be brought down on purpose and rebuilt for its price: trucks stop at the creek, the choke goes, the defense counts it', () => {
    const g = plains(), b = roadBridgeOf(g)!;
    expect(b).toBeTruthy();
    expect(b.droppable).toBe(true);
    expect(bridgeDown(g)).toBe(false);
    const before = terrainDefense(g).score;
    // a delivery crosses while it stands
    g.money = 500_000;
    placeOrder(g, [{ material: 'lumber', qty: 5 }]);
    g.clock.t = g.orders[0].dueAt + 0.1; deliverOrders(g);
    expect(g.roadside.length).toBe(0);
    expect(dropRoadBridge(g)).toBeNull();
    expect(bridgeDown(g)).toBe(true);
    expect(dropRoadBridge(g)).toMatch(/already down/);
    // now the truck leaves it at the creek and it is carried in
    placeOrder(g, [{ material: 'lumber', qty: 5 }]);
    g.clock.t = g.orders[1].dueAt + 0.1; deliverOrders(g);
    expect(g.roadside.length).toBe(1);
    // the defense counts it like a held choke
    const after = terrainDefense(g);
    expect(after.lines.join(' ')).toMatch(/bridge on the way in is down/);
    expect(after.score).toBeGreaterThan(before);
    expect(after.score - before).toBeLessThanOrEqual(RFX.DEFENSE_SHARE * DROPPED_SCORE + 0.01);
  });

  it('rebuilding costs the structure\'s price and its days, and the bridge stands again when they are up', () => {
    const g = plains();
    g.money = 500_000;
    expect(rebuildRoadBridge(g)).toMatch(/standing/);
    dropRoadBridge(g);
    const q = rebuildQuote(g)!;
    expect(q.usd).toBe(roadBridgeOf(g)!.usd);
    g.money = q.usd - 1;
    expect(rebuildRoadBridge(g)).toMatch(/not enough money/);
    g.money = q.usd + 50;
    expect(rebuildRoadBridge(g)).toBeNull();
    expect(g.money).toBe(50);
    expect(rebuildRoadBridge(g)).toMatch(/already being rebuilt/);
    expect(bridgeDown(g)).toBe(true);
    roadBridgeDay(g);
    expect(bridgeDown(g)).toBe(true);                                        // not yet
    g.clock.t = g.roadBridge.due! + 0.01;
    roadBridgeDay(g);
    expect(g.roadBridge).toEqual({ down: false, due: null });
  });

  it('a road with no bridge has nothing to drop, and a place with no drive has no road to cut', () => {
    const noBridge = plains(1);
    expect(roadBridgeOf(noBridge)).toBeNull();
    expect(dropRoadBridge(noBridge)).toMatch(/no bridge/);
    const g = newGame(6, 130, 2027, { site: { ...CLASSIC, region: 'plains', creek: true, improvements: { ...RAW, power: true } } });
    expect(dropRoadBridge(g)).toMatch(/no drive/);
  });

  it('a bridge that is down is not a choke on the road and adds nothing to a crew\'s start', () => {
    const p = cross('mountain_west');
    expect(chokesOf(p).map(c => c.kind)).toContain('bridge1');
    expect(chokesOf(p, true).map(c => c.kind)).not.toContain('bridge1');
    expect(startOf(p, true)).toBeLessThan(startOf(p));
  });
});

export type { GameState };
