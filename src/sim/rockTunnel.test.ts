import { afterEach, describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { setGroundOverride, corridorsOf, lanesOf } from './terrainState';
import { BORE, boreProblem, boreStats, findBore, hasRockFace, type GroundSource } from './terrain';
import { DOOR_ALARM_DETECTION, DOOR_DELAY, boreSite, boreText, doorDelay, dropBridge, raidAngle, routeProblem, terrainCards, terrainOff, wayInLine } from './terrainFx';
import { PERIMETER, PERIMETER_ORDER, addRunWork, planRun, runBill, runFinished, wallLength, type Pt } from './perimeter';
import { costPer100m, perimeterOff, perimeterTiers } from './guidance';
import { coveredRoute, links } from './compounds';
import { planBattle } from './battle';
import { makeLotSite } from './lotListing';
import { terrainOf } from './terrainState';
import { MATERIALS } from './materials';
import { enclosure } from './enclosure';
import { underground } from './perimeter';

afterEach(() => setGroundOverride(null));

/** A spur across the line z = 20 that a bore along x goes through: 4 units (24 m) high at x = 20, 6 wide each way, the ground level at 0 either side. */
const SPUR: GroundSource = { h: (x, _z) => 4 * Math.exp(-(((x - 20) / 6) ** 2)) };
const FLAT: GroundSource = { h: () => 0 };
/** A hillside rising 20 % with a rock shoulder: a straight line along the slope has no cover. */
const SLOPE: GroundSource = { h: x => 0.2 * x };

const built = (g: GameState, id: string, kind: string, x: number, z: number): Structure => { const st: Structure = { id, kind, x, z, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 }; g.structures.push(st); return st; };
const game = (): GameState => { const g = newGame(3); g.site = { ...g.site, home: { x0: 0, z0: 0, x1: 67, z1: 67 } }; built(g, 'h', 'timber_cabin', 20, 36); return g; };
const finish = (r: { finishedAt: number | null; done: number; hours: number; supplied: boolean }) => { r.finishedAt = 0; r.done = r.hours; r.supplied = true; };
const THROUGH: Pt[] = [[12, 20], [28, 20]];

describe('where a rock tunnel can go', () => {
  it('through a spur: straight at one grade with rock over the crown, and says why not otherwise', () => {
    expect(boreProblem(SPUR, THROUGH[0], THROUGH[1])).toBeNull();
    const s = boreStats(SPUR.h, THROUGH[0], THROUGH[1]);
    expect(s.peakCover).toBeGreaterThan(BORE.MIN_PEAK);
    expect(s.grade).toBeLessThan(0.01);
    expect(s.openA).toBeLessThanOrEqual(BORE.MAX_OPEN); expect(s.openB).toBeLessThanOrEqual(BORE.MAX_OPEN);
    expect(boreProblem(FLAT, THROUGH[0], THROUGH[1])).toMatch(/no rock over it/);
    expect(boreProblem(SPUR, [20, 20], [22, 20])).toMatch(/too short/);
    expect(boreProblem({ h: () => 5 }, [0, 0], [60, 0])).toMatch(/too long/);
    expect(BORE.MAX_LEN * 6).toBe(240);
  });

  it('a deck steeper than a truck can climb is refused, a shallow spur leaves a cutting that is too long, a notch in the hill is daylight in the middle', () => {
    expect(boreProblem(SLOPE, [0, 0], [10, 0])).toMatch(/too steep/);
    // a low, wide bump: the ends would lie in cuttings far longer than a mound can shelter
    expect(boreProblem({ h: x => 1.6 * Math.exp(-(((x - 20) / 14) ** 2)) }, [4, 20], [36, 20])).toMatch(/does not close over it|no rock over it/);
    const notch: GroundSource = { h: x => 4 * Math.exp(-(((x - 20) / 8) ** 2)) - 3.9 * Math.exp(-(((x - 20) / 1.2) ** 2)) };
    expect(boreProblem(notch, [4, 20], [36, 20])).toMatch(/daylight in the middle|does not close over it|no rock over it/);
  });

  it('the Build menu greys the kind out with the reason where the land has no rock to bore, and offers it where it has', () => {
    const g = game();
    setGroundOverride(FLAT);
    expect(perimeterOff(g, 'rock_tunnel')).toMatch(/no rock face or spur/);
    expect(terrainOff(g, 'rock_tunnel')).toMatch(/hill over it/);
    expect(routeProblem(g, 'rock_tunnel', THROUGH)).toMatch(/no rock over it/);
    expect(routeProblem(g, 'container_wall', THROUGH)).toBeNull();
    setGroundOverride(SPUR);
    expect(routeProblem(g, 'rock_tunnel', THROUGH)).toBeNull();
    expect(perimeterOff(g, 'rock_tunnel')).toBeNull();
  });

  it('findBore finds a line through a spur on the analysed grid, and none on level ground', () => {
    const hill = (x: number, z: number) => 4 * Math.exp(-(((x - 30) / 6) ** 2)) * Math.exp(-(((z - 30) / 18) ** 2));
    const f = findBore(hill, { x0: 0, z0: 0, x1: 60, z1: 60 }, [14, 30]);
    expect(f).not.toBeNull();
    expect(boreProblem({ h: hill }, f!.a, f!.b)).toBeNull();
    expect(findBore(() => 0, { x0: 0, z0: 0, x1: 60, z1: 60 }, [30, 30])).toBeNull();
  });
});

describe('on the cutbank hillside lot', () => {
  it('the rock face has a bore the land allows, from the foot of the face up to the bench, and a card offers it, never imposing it', () => {
    const site = makeLotSite({ kind: 'hillside', region: 'pnw', relief: 9, acres: 40, seed: 8, cutbank: true, elevM: 600 });
    const g = newGame(7, undefined, undefined, { site });
    built(g, 'h', 'timber_cabin', 39, 36); g.clock.t = 90;
    expect(hasRockFace(terrainOf(g)!, g.site.home)).toBe(true);
    const b = boreSite(g);
    expect(b).not.toBeNull();
    expect(routeProblem(g, 'rock_tunnel', [b!.a, b!.b])).toBeNull();
    expect(b!.stats.grade).toBeLessThanOrEqual(BORE.MAX_GRADE);
    expect(b!.stats.peakCover * 6).toBeGreaterThan(6);
    expect(boreText(b!.stats)).toMatch(/m at \d+ %, \d+ m of rock/);
    expect(perimeterOff(g, 'rock_tunnel')).toBeNull();
    // (the card shares the one-card slot with the gorge and keep cards: on this lot it is the best one)
    const card = terrainCards(g).find(c => c.id === 'land_bore');
    expect(card, 'the Next-step card').toBeDefined();
    expect(card!.bore!.lengthM).toBeGreaterThan(30);
    expect(card!.why).toMatch(/steel door at each end/);
    expect(g.perimeter).toHaveLength(0);                 // offered, never laid unasked
    planRun(g, 'rock_tunnel', [card!.bore!.a, card!.bore!.b]);
    expect(terrainCards(g).find(c => c.id === 'land_bore')).toBeUndefined();
  });
});

describe('the price table', () => {
  it('is in it with a steel door at each end, a stone portal each, real money, in the tiers and a permit', () => {
    expect(PERIMETER_ORDER).toContain('rock_tunnel');
    const bill = runBill('rock_tunnel', 25);
    expect(bill.blast_door).toBe(2);
    expect(bill.fieldstone).toBe(12);
    expect(bill.concrete).toBeGreaterThan(400);
    expect(PERIMETER.rock_tunnel.vehicleWay && PERIMETER.rock_tunnel.walkway && PERIMETER.rock_tunnel.bore).toBe(true);
    expect(PERIMETER.rock_tunnel.hours).toBeGreaterThan(PERIMETER.slope_tunnel.hours * 2);
    expect(costPer100m('rock_tunnel')).toBeGreaterThan(costPer100m('slope_tunnel'));
    expect(perimeterTiers().flatMap(t => t.kinds)).toContain('rock_tunnel');
    expect(MATERIALS.blast_door.price).toBeGreaterThan(0);
  });

  it('finishing it leaves the rock on the spoil pile', () => {
    setGroundOverride(SPUR);
    const g = game();
    const r = planRun(g, 'rock_tunnel', THROUGH);
    g.stock.rebar = g.stock.concrete = g.stock.hardware = g.stock.cable = g.stock.excavator = g.stock.blast_door = g.stock.fieldstone = 9999;
    const before = g.stock.spoil;
    addRunWork(g, r, r.hours + 1);
    expect(runFinished(r)).toBe(true);
    expect(g.stock.spoil - before).toBe(Math.round(BORE.M3 * wallLength(r)));
  });
});

describe('it is no wall on the surface', () => {
  it('stops no walk, blocks no view, holds no line: the rock is its wall, only the two doors count', () => {
    expect(underground('rock_tunnel')).toBe(true);
    expect(underground('escape_tunnel') && underground('underground_passage')).toBe(true);
    expect(underground('tunnel_bridge') || underground('slope_tunnel') || underground('stone_wall')).toBe(false);
    const d = PERIMETER.rock_tunnel;
    expect(d.blocks).toEqual({ people: 0, animals: 0, vehicles: 0 });
    expect(d.sight).toBe(0);
    expect(d.height).toBe(0);
    // a finished bore 40 units long across the land changes nothing about the property line: not a wall, not a gap
    setGroundOverride(SPUR);
    const g = game();
    const before = enclosure(g);
    finish(planRun(g, 'rock_tunnel', THROUGH));
    const after = enclosure(g);
    expect(after.barrier).toBe(before.barrier);
    expect(after.openShare).toBe(before.openShare);
  });
});

describe('a raid and the doors', () => {
  it('a standing bore is the corridor a crew comes by: held at its outer door, and the defense lines say rock, not gorge', () => {
    setGroundOverride(SPUR);
    const g = game();
    const b = planRun(g, 'rock_tunnel', THROUGH);
    expect(corridorsOf(g)).toHaveLength(0);
    finish(b);
    expect(corridorsOf(g)).toHaveLength(1);
    const lanes = lanesOf(g);
    expect(lanes.some(l => l.via === b.id)).toBe(true);
    expect(wayInLine(b.kind)).toMatch(/rock tunnel/);
    expect(wayInLine(b.kind)).toMatch(/cannot be dropped/);
    expect(wayInLine('tunnel_bridge')).toMatch(/tunnel-bridge.*Drop it/);
    expect(wayInLine('slope_tunnel')).toMatch(/slope tunnel/);
    const a = raidAngle(g, () => 0.5);
    if (a?.via) expect(a.via).toBe(b.id);
    for (const t of [0.25, 0.8]) { g.clock.t = t; expect(planBattle(g, 4, 5).units.filter(u => u.side === 'raider').length).toBe(4); }
  });

  it('the doors lock at night and on the alarm like the tunnel-bridge', () => {
    expect(doorDelay(true, 0)).toBe(DOOR_DELAY);
    expect(doorDelay(false, DOOR_ALARM_DETECTION)).toBe(DOOR_DELAY);
    expect(doorDelay(false, 10)).toBeLessThan(DOOR_DELAY);
  });

  it('it cannot be dropped: a bore is solid rock; the bridges still can', () => {
    setGroundOverride(SPUR);
    const g = game();
    const b = planRun(g, 'rock_tunnel', THROUGH); finish(b);
    expect(dropBridge(g, b.id)).toMatch(/cannot be dropped/);
    expect(runFinished(b)).toBe(true);
    expect(b.dropped).toBeUndefined();
  });
});

describe('it joins the court and the compound like a covered walkway', () => {
  it('two yards, one at each portal, are one covered route once the bore stands, and it is not a hole in the line', () => {
    setGroundOverride(SPUR);
    const g = game();
    const ring = (x0: number, z0: number) => { const r = planRun(g, 'container_wall', [[x0, z0], [x0 + 10, z0], [x0 + 10, z0 + 10], [x0, z0 + 10], [x0, z0]]); finish(r); return r; };
    const a = ring(3, 15), b = ring(27, 15);
    expect(coveredRoute(g, a.id, b.id)).toBe(false);
    const br = planRun(g, 'rock_tunnel', THROUGH);
    finish(br);
    expect(links(g).some(l => l.runId === br.id)).toBe(true);
    expect(coveredRoute(g, a.id, b.id)).toBe(true);
  });
});
