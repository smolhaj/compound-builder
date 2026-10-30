import { describe, expect, it } from 'vitest';
import { newGame, SAVE_VERSION, type GameState } from './state';
import { CLASSIC } from './site';
import { variedFamily } from './family';
import { migrate } from './save/migrations';
import { step, SUBSTEP } from './engine';
import type { PerimeterRun, Pt } from './perimeter';
import { dropBridge, DOOR_DELAY, DOOR_OPEN_DELAY } from './terrainFx';
import { startingVehicles } from './vehicles';
import { tripVehicles } from './weekender';
import { responseFactor } from './slope';
import { deliverOrders } from './economy';
import { applyBattle, type PlannedBattle } from './battle';
import {
  CLEAR_DAYS, DRIVE_MPS, KEY_S, RUBBLE_M3, SAPPER_P_CAP, WALK_MPS, clearCollapse, clearQuote, collapseCorridor, corridorDay, crossing, crossingMinutes, driveSeconds,
  endNearest, isNightHour, locksNow, outerEnd, sapperBreach, standingCorridors, strandedVehicles, tunnelResponse, walkSeconds, wayCut, wayInBlocked, wayInMinutes,
} from './corridors';

const run = (id: string, kind: PerimeterRun['kind'], pts: Pt[], over: Partial<PerimeterRun> = {}): PerimeterRun => ({ id, kind, pts, gates: [], done: 1, hours: 1, supplied: true, finishedAt: 0, ...over });
const game = (): GameState => newGame(3);
/** A 236 m rock tunnel: 39.33 units. */
const BORE: Pt[] = [[10, 10], [10, 49.33]];
const withBore = (over: Partial<PerimeterRun> = {}): GameState => { const g = game(); g.perimeter.push(run('t1', 'rock_tunnel', BORE, over)); return g; };
const at = (g: GameState, hour: number): GameState => { g.clock.t = 20 + (hour - 6) / 24; return g; };

describe('what is a corridor', () => {
  it('a finished rock tunnel or tunnel-bridge, not a wall and not one that is dropped or still being built', () => {
    const g = game();
    g.perimeter.push(run('w', 'stone_wall', [[0, 0], [10, 0]]), run('b', 'tunnel_bridge', [[0, 5], [12, 5]]), run('r', 'rock_tunnel', BORE, { finishedAt: null }), run('d', 'tunnel_bridge', [[0, 9], [12, 9]], { dropped: true, finishedAt: null }));
    expect(standingCorridors(g).map(c => c.id)).toEqual(['b']);
    g.perimeter[2].finishedAt = 0;
    expect(standingCorridors(g).map(c => c.id)).toEqual(['b', 'r']);
    expect(standingCorridors(g).find(c => c.id === 'r')!.bore).toBe(true);
    expect(standingCorridors(g).find(c => c.id === 'r')!.lenM).toBe(236);
  });
  it('a collapsed one is listed but not usable', () => {
    const g = withBore({ collapsed: { at: 1, rubbleM3: 100, clearsAt: null } });
    expect(standingCorridors(g)[0].collapsed).toBe(true);
    expect(standingCorridors(g, true)).toHaveLength(0);
  });
});

describe('how long it takes', () => {
  it('a 236 m tunnel is about three game minutes on foot and half a minute by vehicle', () => {
    expect(walkSeconds(236)).toBeCloseTo(236 / WALK_MPS, 6);
    expect(walkSeconds(236) / 60).toBeGreaterThan(2.5);
    expect(walkSeconds(236) / 60).toBeLessThan(3.3);
    expect(driveSeconds(236)).toBeCloseTo(236 / DRIVE_MPS, 6);
    expect(driveSeconds(236)).toBeLessThan(40);
  });
  it('the family has keys: nothing to wait for by day, a few seconds at each locked door at night', () => {
    const c = { lenM: 236, collapsed: false };
    expect(crossing(c, 'family', false, 0).doorS).toBe(0);
    expect(crossing(c, 'family', true, 0).doorS).toBe(KEY_S * 2);
    expect(crossing(c, 'family', false, 60).locked).toBe(true);          // the alarm
    expect(crossing(c, 'family', false, 20).locked).toBe(false);
  });
  it('a raid crew is held per doorDelay: briefly by day, the full lock at night, and has to get through both doors', () => {
    const c = { lenM: 236, collapsed: false };
    expect(crossing(c, 'crew', false, 0).doorS).toBe(DOOR_OPEN_DELAY);
    expect(crossing(c, 'crew', true, 0).doorS).toBe(DOOR_DELAY * 2);
    expect(crossing(c, 'crew', true, 0).seconds).toBeGreaterThan(crossing(c, 'family', true, 0).seconds);
  });
  it('a collapsed corridor carries nobody', () => { expect(crossing({ lenM: 236, collapsed: true }, 'family', false, 0).open).toBe(false); });
  it('minutes by the clock, and what the place adds to a trip', () => {
    expect(crossingMinutes({ lenM: 236, collapsed: false }, 'family', 12)).toBeCloseTo(2.9, 1);
    const g = at(withBore(), 12);
    expect(wayInMinutes(g, 'vehicle')).toBeCloseTo(0.6, 1);
    expect(wayInMinutes(at(withBore(), 23), 'vehicle')).toBeGreaterThan(wayInMinutes(g, 'vehicle'));
    expect(wayInMinutes(game())).toBe(0);
  });
});

describe('the doors', () => {
  it('lock from dusk to dawn and on the alarm', () => {
    expect(isNightHour(5.9)).toBe(true); expect(isNightHour(6)).toBe(false); expect(isNightHour(19.9)).toBe(false); expect(isNightHour(20)).toBe(true);
    expect(locksNow(at(game(), 12))).toBe(false);
    expect(locksNow(at(game(), 22))).toBe(true);
    const g = at(game(), 12);
    g.gate.pending = { id: 'e1' } as unknown as typeof g.gate.pending;
    expect(locksNow(g)).toBe(true);
  });
});

describe('sides', () => {
  it('knows the end a place is nearest to', () => {
    const c = standingCorridors(withBore())[0];
    expect(endNearest(c, 10, 5)).toBe(0);
    expect(endNearest(c, 10, 60)).toBe(1);
    expect(outerEnd(c, [12, 2])).toBe(0);
  });
});

describe('a tunnel brought down', () => {
  it('chokes the corridor with rubble; it costs a contractor to clear, and takes days', () => {
    const g = withBore();
    g.money = 1_000_000;
    expect(collapseCorridor(g, 't1', 'sappers')).toBeNull();
    expect(g.perimeter[0].collapsed?.rubbleM3).toBe(RUBBLE_M3);
    expect(standingCorridors(g, true)).toHaveLength(0);
    expect(wayInBlocked(g)?.id).toBe('t1');
    expect(wayCut(g)).toMatch(/rubble/);
    expect(collapseCorridor(g, 't1')).toMatch(/already/);
    const q = clearQuote(g.perimeter[0]);
    expect(q.usd).toBeGreaterThan(10_000);
    expect(q.days).toBe(CLEAR_DAYS);
    const spoil = g.stock.spoil;
    expect(clearCollapse(g, 't1')).toBeNull();
    expect(g.money).toBe(1_000_000 - q.usd);
    expect(g.stock.spoil).toBeGreaterThan(spoil);
    expect(clearCollapse(g, 't1')).toMatch(/already clearing/);
    g.clock.t += CLEAR_DAYS - 1; corridorDay(g);
    expect(g.perimeter[0].collapsed).toBeTruthy();
    g.clock.t += 2; corridorDay(g);
    expect(g.perimeter[0].collapsed).toBeUndefined();
    expect(standingCorridors(g, true)).toHaveLength(1);
    expect(wayCut(g)).toBeNull();
  });
  it('cannot be cleared without the money', () => {
    const g = withBore(); g.money = 100;
    collapseCorridor(g, 't1');
    expect(clearCollapse(g, 't1')).toMatch(/not enough/);
    expect(g.perimeter[0].collapsed?.clearsAt).toBeNull();
  });
  it('a tunnel-bridge is dropped (dropBridge), not collapsed; a rock tunnel is collapsed, not dropped', () => {
    const g = game();
    g.perimeter.push(run('b', 'tunnel_bridge', [[0, 5], [12, 5]]), run('t1', 'rock_tunnel', BORE));
    expect(collapseCorridor(g, 'b')).toMatch(/dropped/);
    expect(dropBridge(g, 't1')).toMatch(/cannot be dropped/);
    expect(dropBridge(g, 'b')).toBeNull();
    expect(wayCut(g)).toMatch(/down/);
  });
  it('is the old save with nothing in it: migration 70 -> 71 needs no fill', () => {
    const raw = JSON.parse(JSON.stringify(withBore())) as Record<string, unknown>;
    raw.version = 70;
    const up = migrate(raw);
    expect(up.version).toBe(SAVE_VERSION);
    expect(up.perimeter[0].collapsed).toBeUndefined();
  });
});

describe('a crew that came by the tunnel', () => {
  it('may blow the portal behind them: more likely with more charges, never past the cap, never a tunnel-bridge', () => {
    const lo = withBore(), hi = withBore();
    expect(sapperBreach(lo, 't1', 0, 'breached', () => 0)).toEqual([]);
    expect(sapperBreach(lo, 't1', 1, 'breached', () => 0.5)).toEqual([]);            // one grenade: a 10 % chance
    expect(sapperBreach(hi, 't1', 3, 'breached', () => 0.2)).toHaveLength(1);        // three: 30 %
    expect(hi.perimeter[0].collapsed).toBeTruthy();
    const capped = withBore();
    expect(sapperBreach(capped, 't1', 99, 'overrun', () => SAPPER_P_CAP + 0.01)).toEqual([]);
    const br = game(); br.perimeter.push(run('b', 'tunnel_bridge', [[0, 5], [12, 5]]));
    expect(sapperBreach(br, 'b', 9, 'overrun', () => 0)).toEqual([]);
  });
  it('applyBattle reads it from a breached raid by the tunnel, and from nothing else', () => {
    const base = { night: false, units: [], events: [{ t: 1, kind: 'end', result: 'breached' }], duration: 1, spent: {}, minesUsed: 0, dropped: { grenades: 0, rpg_rounds: 0 }, result: 'breached' } as unknown as PlannedBattle;
    const g = withBore();
    const out = applyBattle(g, { ...base, via: 't1', charges: 99 } as PlannedBattle);
    // (seeded: with 99 charges the 55 % cap applies; either way the call is safe and the log says what happened)
    expect(out.some(l => /sappers blew/.test(l))).toBe(!!g.perimeter[0].collapsed);
    const g2 = withBore();
    applyBattle(g2, { ...base } as PlannedBattle);
    expect(g2.perimeter[0].collapsed).toBeUndefined();
  });
});

describe('stranded vehicles', () => {
  it('a lost way strands what is outside (away) and traps what is inside', () => {
    const g = game();
    g.vehicles = startingVehicles();
    g.vehicles.push({ ...g.vehicles[0], id: 'v2', away: true });
    expect(strandedVehicles(g, new Set([g.vehicles[0].id]))).toEqual({ trapped: [], waiting: [] });
    g.perimeter.push(run('b', 'tunnel_bridge', [[0, 5], [12, 5]], { dropped: true, finishedAt: null }));
    const s = strandedVehicles(g, new Set([g.vehicles[0].id]));
    expect(s.trapped).toEqual([g.vehicles[0].id]);
    expect(s.waiting).toEqual(['v2']);
  });
  it('the bridge on the way in being down is a cut way, and a delivery is left at the road, as it always was', () => {
    const g = game();
    expect(wayCut(g)).toBeNull();
    g.roadBridge = { down: true, due: null };
    expect(wayCut(g)).toMatch(/bridge on the way in/);
  });
  it('the vehicles cut off outside drive home the day the way opens', () => {
    const g = withBore({ collapsed: { at: 1, rubbleM3: 10, clearsAt: null } });
    g.vehicles = startingVehicles();
    g.vehicles[0].away = true; g.vehicles[0].stranded = true;
    corridorDay(g);
    expect(g.vehicles[0].stranded).toBe(true);
    delete g.perimeter[0].collapsed;
    corridorDay(g);
    expect(g.vehicles[0].stranded).toBeUndefined();
    expect(g.vehicles[0].away).toBeUndefined();
    expect(g.log.some(l => /way in is open again/.test(l.text))).toBe(true);
  });
});

describe('the response time', () => {
  it('a tunnel adds its drive-through and, at night, the wait at the locked door; a fallen one leaves the last stretch on foot', () => {
    const day = at(withBore(), 12), night = at(withBore(), 23);
    expect(tunnelResponse(game())).toBe(0);
    expect(tunnelResponse(day)).toBeGreaterThan(0);
    expect(tunnelResponse(night)).toBeGreaterThan(tunnelResponse(day));
    expect(tunnelResponse(at(withBore({ collapsed: { at: 1, rubbleM3: 1, clearsAt: null } }), 12))).toBeGreaterThan(tunnelResponse(night));
    expect(responseFactor(night)).toBeGreaterThan(responseFactor(game()));
  });
});

describe('the weekend commute', () => {
  const weekender = (): GameState => newGame(3, 105, 2027, { site: CLASSIC, lifestyle: 'weekend', dayJobs: true, family: variedFamily(3, 0).people, mode: 'scenario', kind: 'grid_down', peace: 'short' });
  /** Jump to a day and hour (day 0 is a Monday) and take one step. */
  const jump = (s: GameState, d: number, h: number): GameState => { const g = structuredClone(s); g.clock.t = d + (h - 6) / 24; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24)); return step(g, SUBSTEP); };
  const FRIDAY = 18, SUNDAY = 20;

  it('with the way cut no vehicle can leave: the family walks out to the town car', () => {
    const g = weekender();
    g.vehicles = startingVehicles();
    expect(tripVehicles(g).length).toBeGreaterThan(0);
    g.roadBridge = { down: true, due: null };
    expect(tripVehicles(g)).toEqual([]);
  });

  it('coming up Friday over a lost way: the cars are left outside, stranded, and the family walks in late', () => {
    let g = weekender();
    g.vehicles = startingVehicles();
    g = jump(g, SUNDAY - 7, 17);                           // Sunday evening: they have gone home with the cars
    expect(g.weekend!.here).toBe(false);
    const away = g.vehicles!.filter(v => v.away).map(v => v.id);
    expect(away.length).toBeGreaterThan(0);
    g.roadBridge = { down: true, due: null };               // the bridge comes down while they are in town
    g = jump(g, FRIDAY, 19.5);
    expect(g.vehicles!.filter(v => away.includes(v.id)).every(v => v.stranded && v.away)).toBe(true);
    expect(g.log.some(l => /leave (the car|the cars) at the outer end/.test(l.text))).toBe(true);
    // a few hours later they are on the place on foot, the cars still outside
    g = jump(g, FRIDAY + 1, 12);
    expect(g.weekend!.here).toBe(true);
    expect(g.vehicles!.filter(v => away.includes(v.id)).every(v => v.away)).toBe(true);
    // the bridge is rebuilt; the next dawn the cars drive in
    g.roadBridge = { down: false, due: null };
    corridorDay(g);
    expect(g.vehicles!.some(v => v.stranded)).toBe(false);
    expect(g.vehicles!.filter(v => away.includes(v.id)).every(v => !v.away)).toBe(true);
  });

  it('over an open way the cars come home as before', () => {
    let g = weekender();
    g.vehicles = startingVehicles();
    g = jump(g, SUNDAY - 7, 17);
    g = jump(g, FRIDAY, 21);
    g = jump(g, FRIDAY + 1, 12);
    expect(g.weekend!.here).toBe(true);
    expect(g.vehicles!.some(v => v.away || v.stranded)).toBe(false);
  });
});

describe('the order is left at the road when the way is cut', () => {
  it('a tunnel choked with rubble leaves the load at the portal for the family to carry in', () => {
    const g = withBore({ collapsed: { at: 1, rubbleM3: 10, clearsAt: null } });
    g.site.improvements.drive = true;
    g.orders.push({ id: 'o1', lines: [{ material: 'lumber', qty: 40 }], cost: 1, placedAt: 0, dueAt: 0, status: 'ordered' } as GameState['orders'][number]);
    g.clock.t = 1;
    deliverOrders(g);
    expect(g.roadside?.length ?? 0).toBeGreaterThan(0);
    expect(g.log.some(l => /left .* at the road/.test(l.text))).toBe(true);
  });
});
