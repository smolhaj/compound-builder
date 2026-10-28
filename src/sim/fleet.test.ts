import { describe, expect, it } from 'vitest';
import { newGame, SAVE_VERSION, dayIndex, type GameState } from './state';
import { BLUEPRINTS } from './blueprints';
import { migrate } from './save/migrations';
import {
  breakdownChance, buyVehicle, cargoKg, empVehicles, fleetCapacity, fleetOf, overdue, repairDays, roadTrouble, runs, serviceVehicle, SERVICE_MILES, startingVehicles, stripForParts,
  tractorBoost, tractorRuns, tripPlan, tripVehicle, vehiclesDay, VEHICLES, type Vehicle, type VehicleKind,
} from './vehicles';
import { bays, GARAGES, garageConnected, garageLinks, isUnderRoof, parkingPlan } from './garage';
import { bugOut, bugOutPlan } from './bugout';
import { reportCard } from './report';
import { goToMarket, MARKET_KM } from './market';
import { efficiency, bestTool, kitOf, toolFor, ctxOf, taskSpeed, wearTools } from './tools';
import { runProblem, scavengeOf, startRun, ensurePlaces } from './scavenge';
import { tripFuel } from './rescue';
import { mulberry32 } from './rng';
import type { PerimeterRun } from './perimeter';

const finish = (s: GameState, kind: string, x = 0, z = 0) => {
  const st = { id: `t${s.nextId++}`, kind, x, z, rot: 0, stage: BLUEPRINTS[kind].stages.length, done: 0, supplied: true, finishedAt: 0 };
  s.structures.push(st as GameState['structures'][number]);
  return st;
};
const rich = (s: GameState) => { s.money = 500_000; return s; };
const after = (seed = 1, days = 30): GameState => {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.clock.t = g.disaster.hitAt + days; g.disaster.phase = 'survival';
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0, fuel: 0, medical: 0 };
  return g;
};
const add = (g: GameState, kind: VehicleKind, o: Partial<Vehicle> = {}): Vehicle => {
  const fleet = fleetOf(g);
  const v: Vehicle = { id: `v${fleet.length + 10}`, kind, mileage: 40_000, condition: 0.9, fuel: VEHICLES[kind].tankL, oilAt: 40_000, serviceAt: 40_000, ...o };
  fleet.push(v);
  return v;
};

describe('the fleet', () => {
  it('has seven kinds with real numbers: seats, cargo, tow, bays, tank', () => {
    for (const [k, d] of Object.entries(VEHICLES)) {
      expect(d.price).toBeGreaterThan(0); expect(d.blurb.length).toBeGreaterThan(20);
      if (k !== 'trailer') { expect(d.tankL).toBeGreaterThan(0); expect(d.seats).toBeGreaterThan(0); }
    }
    expect(VEHICLES.motorhome.bays).toBe(2);
    expect(VEHICLES.suv.seats).toBeGreaterThanOrEqual(7);
    expect(VEHICLES.old_pickup.emp).toBe(false);
    expect(VEHICLES.motorhome.fuelType).toBe('diesel');
  });
  it('buys an SUV (two allowed), a motorhome and a tractor; one of the rest', () => {
    const g = rich(newGame(1));
    expect(buyVehicle(g, 'suv')).toBeNull(); expect(buyVehicle(g, 'suv')).toBeNull();
    expect(buyVehicle(g, 'suv')).toMatch(/2 at most/);
    expect(buyVehicle(g, 'motorhome')).toBeNull();
    expect(buyVehicle(g, 'motorhome')).toMatch(/already/);
    expect(g.vehicles!.map(v => v.id)).toEqual([...new Set(g.vehicles!.map(v => v.id))]);
  });
  it('no dealers once the stores are gone, and not without the money', () => {
    const g = after(); g.money = 1e6;
    expect(buyVehicle(g, 'suv')).toMatch(/dealers/);
    const h = newGame(1); h.money = 100;
    expect(buyVehicle(h, 'suv')).toMatch(/money/);
  });
});

describe('the tractor and the tools system', () => {
  it('comes with implements that work the soil and dig 2-3 times faster, but only while it runs with fuel', () => {
    const g = rich(newGame(1));
    const kit0 = kitOf(g);
    const base = taskSpeed(kit0, toolFor({ kind: 'garden' }), ctxOf(g)).mult;
    buyVehicle(g, 'tractor');
    expect(kitOf(g).items.some(t => t.kind === 'tractor_implements')).toBe(true);
    expect(tractorRuns(g)).toBe(true);
    const fast = taskSpeed(kitOf(g), toolFor({ kind: 'garden' }), ctxOf(g)).mult;
    expect(fast).toBeGreaterThan(base * 1.8);
    const dig = bestTool(kitOf(g), 'dig', ctxOf(g))!;
    expect(dig.tool.kind).toBe('tractor_implements');
    // no fuel: back to hand tools
    fleetOf(g).find(v => v.kind === 'tractor')!.fuel = 0;
    expect(taskSpeed(kitOf(g), toolFor({ kind: 'garden' }), ctxOf(g)).mult).toBeCloseTo(base, 5);
    // an EMP kills it
    fleetOf(g).find(v => v.kind === 'tractor')!.fuel = 20;
    empVehicles(g);
    expect(tractorRuns(g)).toBe(false);
    expect(tractorBoost(g)).toBe(1);
  });
  it('working the implements burns the tractor’s fuel and miles, not the jerry cans', () => {
    const g = rich(newGame(1)); buyVehicle(g, 'tractor');
    const t = fleetOf(g).find(v => v.kind === 'tractor')!;
    const f0 = t.fuel, cans = g.stock.fuel;
    wearTools(g, { kind: 'garden' }, 4);
    expect(t.fuel).toBeLessThan(f0);
    expect(g.stock.fuel).toBe(cans);
    expect(efficiency(kitOf(g).items.find(x => x.kind === 'tractor_implements')!, 'till', { power: false, fuel: 0, tractor: false })).toBe(0);
  });
});

describe('the garage', () => {
  it('a metal garage has three bays, the workshop one, the barn two; nothing built means none', () => {
    const g = newGame(1);
    expect(bays(g)).toHaveLength(0);
    finish(g, 'metal_garage'); expect(bays(g)).toHaveLength(GARAGES.metal_garage.bays);
    finish(g, 'workshop'); finish(g, 'barn');
    expect(bays(g)).toHaveLength(3 + 1 + 2);
  });
  it('an unfinished garage parks nothing', () => {
    const g = newGame(1);
    g.structures.push({ id: 'u', kind: 'metal_garage', x: 0, z: 0, rot: 0, stage: 2, done: 0, supplied: false, finishedAt: null });
    expect(bays(g)).toHaveLength(0);
  });
  it('everything stands in the yard with no garage; vehicles take bays as they are built', () => {
    const g = rich(newGame(1));
    buyVehicle(g, 'suv');
    expect(parkingPlan(g).outside).toHaveLength(2);
    finish(g, 'metal_garage');
    const p = parkingPlan(g);
    expect(p.outside).toHaveLength(0); expect(p.free).toBe(1);
    expect(isUnderRoof(g, 'v1')).toBe(true);
  });
  it('a motorhome takes two bays in one building and the rest go to the yard', () => {
    const g = rich(newGame(1));
    buyVehicle(g, 'motorhome'); buyVehicle(g, 'suv'); buyVehicle(g, 'tractor');
    finish(g, 'metal_garage');                                           // 3 bays: motorhome (2) + one more
    const p = parkingPlan(g);
    const mh = p.parked.find(x => g.vehicles!.find(v => v.id === x.vehicle)!.kind === 'motorhome')!;
    expect(mh.bays).toHaveLength(2);
    expect(mh.bays[0].structure).toBe(mh.bays[1].structure);
    expect(p.outside.length).toBe(g.vehicles!.filter(v => v.kind !== 'trailer').length - 2);
  });
  it('a trailer parks behind its truck, and in the yard with none under a roof', () => {
    const g = rich(newGame(1)); buyVehicle(g, 'trailer');
    expect(parkingPlan(g).outside).toContain(g.vehicles!.find(v => v.kind === 'trailer')!.id);
    finish(g, 'metal_garage');
    expect(parkingPlan(g).outside).toHaveLength(0);
  });
  it('weather wears what stands outside, not what is under a roof', () => {
    const wear = (garage: boolean) => { const g = newGame(1); if (garage) finish(g, 'metal_garage'); const c = g.vehicles ? g.vehicles[0].condition : startingVehicles()[0].condition; vehiclesDay(g); return c - g.vehicles![0].condition; };
    expect(wear(false)).toBeGreaterThan(wear(true));
  });
  it('a hailstorm dents the yard', () => {
    const g = newGame(1); g.weather = { active: { kind: 'hail', at: 0, until: 5 } } as unknown as GameState['weather'];
    const c0 = fleetOf(g)[0].condition; vehiclesDay(g);
    expect(c0 - g.vehicles![0].condition).toBeGreaterThan(0.02);
  });
  it('the garage connects to the house through an underground passage (or a walkway)', () => {
    const g = newGame(1);
    const house = finish(g, 'timber_cabin', 0, 0), gar = finish(g, 'metal_garage', 6, 0);
    expect(garageConnected(g)).toBe(false);
    const run = { id: 'r1', kind: 'underground_passage', pts: [[0.3, 0], [5.8, 0]], gates: [], done: 1, hours: 1, supplied: true, finishedAt: 0 } as unknown as PerimeterRun;
    g.perimeter.push(run);
    const l = garageLinks(g);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ garage: gar.id, home: house.id, kind: 'passage' });
    expect(garageConnected(g)).toBe(true);
    // a passage that stops short of the garage does not connect
    run.pts = [[0.3, 0], [2.5, 0]];
    expect(garageConnected(g)).toBe(false);
  });
});

describe('fuel, service and breakdowns', () => {
  it('service is due every 3,000 miles; the shop does it in peacetime for money', () => {
    const g = newGame(1);
    const v = fleetOf(g)[0]; v.mileage = (v.serviceAt ?? 0) + SERVICE_MILES + 1;
    expect(overdue(v)).toBe(true);
    const m0 = g.money;
    expect(serviceVehicle(g, v.id)).toBeNull();
    expect(g.money).toBeLessThan(m0); expect(overdue(v)).toBe(false);
  });
  it('after the stations close a service needs a parts kit and a mechanic of 2', () => {
    const g = after(); g.people.forEach(p => { p.skills.mechanic = 0; });
    const v = fleetOf(g)[0]; v.mileage += 4000;
    expect(serviceVehicle(g, v.id)).toMatch(/mechanic/);
    g.people[0].skills.mechanic = 4;
    expect(serviceVehicle(g, v.id)).toMatch(/parts/);
    g.stock.vehicle_parts = 2;
    expect(serviceVehicle(g, v.id)).toBeNull();
    expect(g.stock.vehicle_parts).toBe(1);
  });
  it('breakdowns grow with wear and neglect, shrink with a good mechanic, and never touch a trailer or a new truck much', () => {
    const v = (c: number, miles = 0): Vehicle => ({ id: 'v9', kind: 'pickup', mileage: 50_000 + miles, condition: c, fuel: 50, oilAt: 50_000, serviceAt: 50_000 });
    expect(breakdownChance(v(0.3), 0)).toBeGreaterThan(breakdownChance(v(0.9), 0) * 4);
    expect(breakdownChance(v(0.9, 4000), 0)).toBeGreaterThan(breakdownChance(v(0.9), 0));
    expect(breakdownChance(v(0.5), 6)).toBeLessThan(breakdownChance(v(0.5), 0));
    expect(breakdownChance({ ...v(0.1), kind: 'trailer' }, 0)).toBe(0);
    expect(breakdownChance(v(0.9), 0, 3)).toBeGreaterThan(breakdownChance(v(0.9), 0));
    expect(breakdownChance({ ...v(0.5), kind: 'old_pickup' }, 0)).toBeLessThan(breakdownChance(v(0.5), 0));
  });
  it('a broken-down vehicle does not run; with a kit and a mechanic it is mended in a few days', () => {
    const g = after(); g.people[0].skills.mechanic = 6; g.stock.vehicle_parts = 1;
    const v = fleetOf(g)[0]; v.down = { since: 1, part: 'starter' };
    expect(runs(v)).toBe(false);
    let days = 0;
    for (; days < 10 && v.down; days++) { g.clock.t += 1; vehiclesDay(g); }
    expect(v.down).toBeUndefined(); expect(runs(v)).toBe(true);
    expect(days).toBeLessThanOrEqual(repairDays(6) + 1);
    expect(g.stock.vehicle_parts).toBe(0);
  });
  it('with no kit it stays down; stripping a dead one gives two kits', () => {
    const g = after(); g.people[0].skills.mechanic = 6; g.stock.vehicle_parts = 0;
    const v = fleetOf(g)[0]; v.down = { since: 1, part: 'starter' };
    for (let i = 0; i < 10; i++) { g.clock.t += 1; vehiclesDay(g); }
    expect(v.down).toBeTruthy();
    const dead = add(g, 'old_pickup', { condition: 0 });
    expect(stripForParts(g, v.id)).toMatch(/still runs/);
    expect(stripForParts(g, dead.id)).toBeNull();
    expect(g.stock.vehicle_parts).toBe(2);
    expect(fleetOf(g).some(x => x.id === dead.id)).toBe(false);
  });
  it('in town a breakdown is towed to the shop for money', () => {
    const g = newGame(1); const v = fleetOf(g)[0]; v.down = { since: 1, part: 'alternator' }; g.money = 5000;
    const m0 = g.money;
    for (let i = 0; i < 5; i++) { g.clock.t += 1; vehiclesDay(g); }
    expect(v.down).toBeUndefined(); expect(g.money).toBeLessThan(m0);
  });
  it('the old truck breaks down less and needs only a wrench; every modern one dies in an EMP', () => {
    const g = rich(newGame(1)); buyVehicle(g, 'suv'); buyVehicle(g, 'old_pickup'); buyVehicle(g, 'motorhome');
    const lines = empVehicles(g);
    expect(lines[0]).toMatch(/EMP/);
    expect(g.vehicles!.filter(v => v.fried).map(v => v.kind).sort()).toEqual(['motorhome', 'pickup', 'suv']);
    expect(runs(g.vehicles!.find(v => v.kind === 'old_pickup')!)).toBe(true);
    expect(fleetCapacity(g).vehicles).toBe(1);
  });
  it('on a long run a breakdown costs days; a mechanic with a kit fixes it on the road', () => {
    let stranded = 0, fixed = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const g = after(seed); const v = fleetOf(g)[0]; v.condition = 0.15; v.mileage = 90_000; v.serviceAt = 80_000;
      g.people.forEach(p => { p.skills.mechanic = 0; });
      const r = roadTrouble(g, v, 150, seed);
      if (r.extraDays > 0) { stranded++; expect(v.down).toBeTruthy(); }
      const h = after(seed); const w = fleetOf(h)[0]; w.condition = 0.15; w.mileage = 90_000; w.serviceAt = 80_000; h.people[0].skills.mechanic = 5; h.stock.vehicle_parts = 1;
      const r2 = roadTrouble(h, w, 150, seed);
      if (r2.extraDays > 0) { fixed++; expect(w.down).toBeUndefined(); expect(h.stock.vehicle_parts).toBe(0); }
    }
    expect(stranded).toBeGreaterThan(5); expect(fixed).toBeGreaterThan(5);
  });
});

describe('supply runs, trade trips and towing', () => {
  it('the right vehicle for the people: a five-person team needs the SUV, not the pickup', () => {
    const g = rich(newGame(1)); buyVehicle(g, 'suv');
    expect(tripVehicle(g, 20, 2)).toBeTruthy();
    expect(tripVehicle(g, 20, 5)!.kind).toBe('suv');
    expect(tripVehicle(g, 20, 8)).toBeUndefined();
  });
  it('a vehicle with no fuel in it or the cans is the last choice; the run says what it burns', () => {
    const g = after(); g.stock.fuel = 0;
    const a = fleetOf(g)[0]; a.fuel = 0;
    add(g, 'suv', { fuel: 80 });
    expect(tripVehicle(g, 40, 2)!.kind).toBe('suv');
    const plan = tripPlan(g, 40, 2);
    expect(plan.liters).toBe(Math.ceil(2 * 40 / 1.609 / VEHICLES.suv.mpg * 3.785));
    expect(tripFuel(g, 40, 2).liters).toBe(plan.liters);
  });
  it('a trailer adds cargo to a truck that can pull it, and not to an ATV', () => {
    const g = rich(newGame(1));
    const pk = fleetOf(g)[0];
    const solo = cargoKg(g, pk);
    buyVehicle(g, 'trailer');
    expect(cargoKg(g, pk)).toBe(solo + 700);
    expect(cargoKg(g, add(g, 'atv'))).toBe(VEHICLES.atv.cargoKg);
  });
  it('a supply run burns the fuel, wears the truck, and the haul comes home in the vehicle that went', () => {
    const g = after(); g.stock.fuel = 3;
    ensurePlaces(g);
    const team = g.people.filter(p => !p.kid).map(p => p.id).slice(0, 2);
    const v = fleetOf(g)[0]; v.fuel = 60;
    const f0 = v.fuel + g.stock.fuel * 20, c0 = v.condition;
    expect(runProblem(g, 'pl_hardware', team, 'truck')).toBeNull();
    expect(startRun(g, 'pl_hardware', team, 'truck')).toBeNull();
    expect(v.fuel + g.stock.fuel * 20).toBeLessThan(f0);
    expect(v.condition).toBeLessThan(c0);
    expect(v.away).toBe(true);
    expect(scavengeOf(g).run!.vehicle).toBe(v.id);
    expect(runs(v)).toBe(true);
  });
  it('no fuel, no run: it says how many liters it needs', () => {
    const g = after(); g.stock.fuel = 0; fleetOf(g)[0].fuel = 1;
    ensurePlaces(g);
    const team = g.people.filter(p => !p.kid).map(p => p.id).slice(0, 2);
    expect(runProblem(g, 'pl_hardware', team, 'truck')).toMatch(/not enough fuel: \d+ L/);
  });
  it('a vehicle that is away is not available for a second run', () => {
    const g = after(); g.stock.fuel = 5;
    const v = fleetOf(g)[0]; v.away = true;
    expect(tripVehicle(g, 10, 2)).toBeUndefined();
  });
  const marketDay = (): GameState => {
    const g = newGame(1, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
    g.disaster.tracks = { ...g.disaster.tracks, law: 0.6, fuel: 0.2, stores: 0.2, banks: 0.1 };
    g.clock.t = g.disaster.hitAt + 80;
    while (dayIndex(g.clock.t) % 7 !== 5) g.clock.t += 1;
    g.clock.t = Math.floor(g.clock.t) + 0.5;
    g.stock.fuel = 4;
    return g;
  };
  it('driving to the market burns fuel and is recorded on the trip', () => {
    const g = marketDay();
    const v = fleetOf(g)[0]; v.fuel = 60;
    const f0 = v.fuel + g.stock.fuel * 20;
    expect(goToMarket(g, g.people.find(p => !p.kid)!.id, false, true)).toBeNull();
    expect(g.market!.trip!.vehicle).toBe(v.id);
    expect(v.fuel + g.stock.fuel * 20).toBeLessThan(f0);
    expect(MARKET_KM).toBeGreaterThan(5);
  });
  it('riding costs no fuel and records no vehicle', () => {
    const g = marketDay(); const v = fleetOf(g)[0]; v.fuel = 60;
    expect(goToMarket(g, g.people.find(p => !p.kid)!.id, false)).toBeNull();
    expect(g.market!.trip!.vehicle).toBeUndefined();
    expect(v.fuel).toBe(60);
  });
  it('a trade trip needs a running vehicle with fuel', () => {
    const g = marketDay(); fleetOf(g)[0].fried = true;
    expect(goToMarket(g, g.people.find(p => !p.kid)!.id, false, true)).toMatch(/no running vehicle/);
    const h = marketDay(); fleetOf(h)[0].fuel = 0; h.stock.fuel = 0;
    expect(goToMarket(h, h.people.find(p => !p.kid)!.id, false, true)).toMatch(/not enough fuel/);
  });
});

describe('bug out', () => {
  const ready = () => { const g = rich(newGame(1, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' })); return g; };
  it('only when something is wrong, and only with a running vehicle with fuel', () => {
    const free = rich(newGame(1));
    expect(bugOutPlan(free).why).toMatch(/free-build/);
    const g = ready();
    expect(bugOutPlan(g).ok).toBe(true);
    fleetOf(g)[0].fried = true;
    expect(bugOutPlan(g).why).toMatch(/no running vehicle/);
  });
  it('seats decide who goes: the little ones and the old first, the rest stay to hold the place', () => {
    const g = ready();
    const n = g.people.length;
    const p = bugOutPlan(g);
    expect(p.going.length).toBe(Math.min(n, 3));
    expect(p.going.length + p.left.length).toBe(n);
    if (n > 3) expect(p.going.some(x => x.kid)).toBe(true);
    buyVehicle(g, 'motorhome'); g.stock.staples = 600; g.stock.canned = 200;
    const q = bugOutPlan(g);
    expect(q.seats).toBe(3 + 6); expect(q.going.length).toBe(Math.min(n, 9));
    expect(q.rangeKm).toBeGreaterThan(200);
    expect(q.foodDays).toBeGreaterThan(5);
  });
  it('loading under cover (the tunnel from the garage) takes half the time', () => {
    const g = ready();
    const house = finish(g, 'timber_cabin', 0, 0), gar = finish(g, 'metal_garage', 6, 0);
    const open = bugOutPlan(g);
    g.perimeter.push({ id: 'r1', kind: 'underground_passage', pts: [[0.3, 0], [5.8, 0]], gates: [], done: 1, hours: 1, supplied: true, finishedAt: 0 } as unknown as PerimeterRun);
    const cov = bugOutPlan(g);
    expect(house.id).toBeTruthy(); expect(gar.id).toBeTruthy();
    expect(cov.covered).toBe(true); expect(open.covered).toBe(false);
    expect(cov.hours).toBeLessThan(open.hours);
  });
  it('going ends the run with a report that says so', () => {
    const g = ready();
    expect(bugOut(g)).toBeNull();
    expect(g.ending).toMatchObject({ kind: 'bug_out', continued: false });
    expect(g.clock.speed).toBe(0);
    expect(g.stats.bugOut!.going).toBeGreaterThan(0);
    const r = reportCard(g);
    expect(r.headline).toMatch(/bugged out/);
    expect(r.lines.join(' ')).toMatch(/aboard/);
    expect(bugOut(g)).toMatch(/over/);
  });
});

describe('save', () => {
  it('migrates v54 to the fleet: parts in the stock, a service reading on each vehicle', () => {
    const old = structuredClone(newGame(2)) as unknown as Record<string, unknown>;
    old.version = 54; delete (old.stock as Record<string, unknown>).vehicle_parts;
    old.vehicles = [{ id: 'v1', kind: 'pickup', mileage: 100_000, condition: 0.7, fuel: 40, oilAt: 99_000 }];
    const back = migrate(old);
    expect(back.version).toBe(SAVE_VERSION);
    expect(back.stock.vehicle_parts).toBe(0);
    expect(back.vehicles![0].serviceAt).toBe(99_000);
  });
  it('an old save with no vehicles gets the family pickup the way it always did', () => {
    const old = structuredClone(newGame(2)) as unknown as Record<string, unknown>;
    old.version = 54; delete old.vehicles;
    const back = migrate(old);
    vehiclesDay(back);
    expect(back.vehicles).toHaveLength(1);
  });
  it('a daily tick over a year with a full fleet is stable', () => {
    const g = rich(newGame(3)); buyVehicle(g, 'suv'); buyVehicle(g, 'motorhome'); buyVehicle(g, 'tractor'); buyVehicle(g, 'atv'); buyVehicle(g, 'trailer');
    finish(g, 'metal_garage');
    const r = mulberry32(5);
    for (let d = 0; d < 365; d++) { g.clock.t += 1; g.money = Math.max(g.money, 100_000); vehiclesDay(g); void r; }
    for (const v of g.vehicles!) { expect(v.condition).toBeGreaterThanOrEqual(0); expect(v.condition).toBeLessThanOrEqual(1); expect(v.fuel).toBeGreaterThanOrEqual(0); }
    expect(dayIndex(g.clock.t)).toBeGreaterThan(300);
  });
});
