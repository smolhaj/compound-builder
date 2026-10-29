import { afterEach, describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { setGroundOverride } from './terrainState';
import { SPAN, spanProblem, slopeTunnelProblem, type GroundSource } from './terrain';
import { DOOR_DELAY, dropBridge, gorgeSpan, raidAngle, routeProblem, terrainCards, terrainDefense, terrainOff } from './terrainFx';
import { lanesOf, corridorsOf } from './terrainState';
import { PERIMETER, PERIMETER_ORDER, addRunWork, planRun, runBill, runFinished, type Pt } from './perimeter';
import { MATERIALS } from './materials';
import { costPer100m, perimeterOff, perimeterTiers } from './guidance';
import { coveredRoute, links } from './compounds';
import { planBattle } from './battle';
import { enclosure } from './enclosure';

afterEach(() => setGroundOverride(null));

// a gorge running east-west through the lot at z = 40, 24 m deep, rims ~ 11 units apart; the camp is north of it (z = 20), the road to the south
const GORGE: GroundSource = { h: (_x, z) => 4 - 4 * Math.exp(-((z - 40) ** 2) / 8), creek: { zAt: () => 40, waterY: () => 0.1, halfWidth: 0.8 } };
const FLAT: GroundSource = { h: () => 0 };
const SLOPE: GroundSource = { h: (x) => -0.3 * x };
const built = (g: GameState, id: string, kind: string, x: number, z: number): Structure => { const st: Structure = { id, kind, x, z, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 }; g.structures.push(st); return st; };
const game = (): GameState => { const g = newGame(3); g.site = { ...g.site, creek: true, home: { x0: 0, z0: 0, x1: 67, z1: 67 } }; built(g, 'h', 'timber_cabin', 33, 18); return g; };
const finish = (r: { finishedAt: number | null; done: number; hours: number; supplied: boolean }) => { r.finishedAt = 0; r.done = r.hours; r.supplied = true; };

describe('where a tunnel-bridge can go', () => {
  it('needs a real dip under the deck, a sane length and says why not', () => {
    expect(spanProblem(GORGE, [33, 34], [33, 46])).toBeNull();
    expect(spanProblem(FLAT, [33, 34], [33, 46])).toMatch(/nothing to span/);
    expect(spanProblem(GORGE, [33, 38], [33, 40.5])).toMatch(/too short/);
    expect(spanProblem(GORGE, [0, 20], [60, 60])).toMatch(/too long/);
    expect(SPAN.MAX_LEN * 6).toBe(204);
    // a gentle valley that is not 3 m deep is not a gorge
    expect(spanProblem({ h: (_x, z) => 0.3 * Math.exp(-((z - 40) ** 2) / 8) * -1 }, [33, 34], [33, 46])).toMatch(/nothing to span/);
  });

  it('a slope tunnel needs a hillside', () => {
    expect(slopeTunnelProblem(SLOPE, [[10, 30], [20, 30]])).toBeNull();
    expect(slopeTunnelProblem(FLAT, [[10, 30], [20, 30]])).toMatch(/no hillside/);
  });

  it('the Build menu greys the kind out where the land does not suit, with the reason; flat lots never get a bridge', () => {
    const g = game();
    setGroundOverride(GORGE);
    expect(perimeterOff(g, 'tunnel_bridge')).toBeNull();
    expect(gorgeSpan(g)).toBeTruthy();
    setGroundOverride(FLAT);
    expect(perimeterOff(g, 'tunnel_bridge')).toMatch(/no gorge, ravine or deep creek bed/);
    expect(terrainOff(g, 'slope_tunnel')).toMatch(/no hillside/);
    setGroundOverride(SLOPE);
    expect(terrainOff(g, 'slope_tunnel')).toBeNull();
    expect(routeProblem(g, 'tunnel_bridge', [[10, 10], [20, 10]])).toMatch(/nothing to span/);
    expect(routeProblem(g, 'chain_link', [[10, 10], [20, 10]])).toBeNull();
  });

  it('the gorge card offers the span, one click, never unasked', () => {
    setGroundOverride(GORGE);
    const g = game(); g.clock.t = 90;
    const c = terrainCards(g);
    expect(c[0].span).toBeTruthy();
    expect(c[0].title).toMatch(/gorge/);
    // once a bridge is planned the offer goes
    planRun(g, 'tunnel_bridge', [c[0].span!.a, c[0].span!.b]);
    expect(terrainCards(g)[0]?.span).toBeUndefined();
  });
});

describe('the price table', () => {
  it('both tubes are in it with steel doors at each end, real money, and in the tiers', () => {
    for (const k of ['tunnel_bridge', 'slope_tunnel'] as const) {
      expect(PERIMETER_ORDER).toContain(k);
      expect(runBill(k, 10).blast_door).toBe(2);
      expect(costPer100m(k)).toBeGreaterThan(costPer100m('covered_walkway'));
      expect(perimeterTiers().flatMap(t => t.kinds)).toContain(k);
      expect(PERIMETER[k].vehicleWay).toBe(true);
      expect(MATERIALS.blast_door.price).toBeGreaterThan(0);
    }
    expect(PERIMETER.tunnel_bridge.span).toBe(true);
    expect(costPer100m('tunnel_bridge')).toBeGreaterThan(costPer100m('slope_tunnel'));
  });
});

describe('what a crew does about it', () => {
  it('with no bridge the gorge is a barrier: the easy way is round it; with a bridge standing the crew comes at its outer door', () => {
    setGroundOverride(GORGE);
    const g = game(); g.site = { ...g.site, home: { x0: 0, z0: 0, x1: 67, z1: 67 } };
    const before = lanesOf(g);
    const southBefore = before.reduce((a, l) => (Math.abs(l.ang - Math.PI / 2) < Math.abs(a.ang - Math.PI / 2) ? l : a), before[0]);
    expect(southBefore.cliff || southBefore.fords || southBefore.cost > 0).toBe(true);
    const b = planRun(g, 'tunnel_bridge', [[33, 28], [33, 52]]);
    expect(corridorsOf(g)).toHaveLength(0);   // planned, not standing
    finish(b);
    expect(corridorsOf(g)).toHaveLength(1);
    const after = lanesOf(g);
    const southAfter = after.reduce((a, l) => (Math.abs(l.ang - Math.PI / 2) < Math.abs(a.ang - Math.PI / 2) ? l : a), after[0]);
    expect(southAfter.cost).toBeLessThan(southBefore.cost);
    expect(southAfter.via).toBe(b.id);
    expect(southAfter.choke?.width).toBe(1);
  });

  it('a raid by the bridge is held at the door for a few seconds; dropping the bridge puts them back to the ford and the climb', () => {
    setGroundOverride(GORGE);
    const g = game();
    const b = planRun(g, 'tunnel_bridge', [[33, 28], [33, 52]]);
    finish(b);
    const a = raidAngle(g, () => 0.5);
    expect(a?.via).toBe(b.id);
    expect(Math.abs(a!.ang - Math.PI / 2)).toBeLessThan(0.4);
    const raiders = (p: ReturnType<typeof planBattle>) => p.units.filter(u => u.side === 'raider');
    expect(raiders(planBattle(g, 4, 5)).length).toBe(4);
    // dropping it
    const bank = { ...g.stock };
    expect(dropBridge(g, b.id)).toBeNull();
    expect(runFinished(b)).toBe(false);
    expect(b.dropped).toBe(true);
    expect(g.stock.rebar).toBeGreaterThanOrEqual(bank.rebar);
    expect(corridorsOf(g)).toHaveLength(0);
    expect(raidAngle(g, () => 0.5)?.via).toBeUndefined();
    expect(dropBridge(g, b.id)).toMatch(/not standing/);
    // rebuilt, it counts again
    g.stock.rebar = g.stock.roofing = g.stock.hardware = g.stock.concrete = g.stock.cable = g.stock.blast_door = 999;
    addRunWork(g, b, b.hours + 1);
    expect(runFinished(b)).toBe(true);
    expect(corridorsOf(g)).toHaveLength(1);
    expect(DOOR_DELAY).toBeGreaterThan(0);
  });

  it('the ground\'s share of the defense names the bridge', () => {
    setGroundOverride(GORGE);
    const g = game();
    finish(planRun(g, 'tunnel_bridge', [[33, 28], [33, 52]]));
    const d = terrainDefense(g);
    expect(d.lines.join(' ')).toMatch(/tunnel-bridge/);
    expect(d.held).toBe(true);
  });
});

describe('it joins yards like a covered walkway and is not a hole in the line', () => {
  const ring = (g: GameState, x0: number, z0: number): ReturnType<typeof planRun> => { const r = planRun(g, 'container_wall', [[x0, z0], [x0 + 10, z0], [x0 + 10, z0 + 10], [x0, z0 + 10], [x0, z0]]); finish(r); return r; };
  it('two walled yards across the gap are one covered route once the bridge stands', () => {
    setGroundOverride(GORGE);
    const g = game();
    const a = ring(g, 28, 14), b = ring(g, 28, 56);
    expect(coveredRoute(g, a.id, b.id)).toBe(false);
    const br = planRun(g, 'tunnel_bridge', [[33, 24], [33, 56]]);
    finish(br);
    expect(links(g).some(l => l.runId === br.id)).toBe(true);
    expect(coveredRoute(g, a.id, b.id)).toBe(true);
    const e = enclosure(g);
    expect(e.barrier).toBeGreaterThanOrEqual(0);
    void ([] as Pt[]);
  });
});
