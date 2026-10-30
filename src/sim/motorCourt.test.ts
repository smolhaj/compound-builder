import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { BLUEPRINTS, totalBill, totalHours } from './blueprints';
import { billCost } from './materials';
import { PERIMETER, PERIMETER_ORDER, RAZOR, UPGRADE_NEXT, peopleBlock, planRun, runFinished, type Pt } from './perimeter';
import { costPer100m, perimeterTiers } from './guidance';
import { DEFAULT_FORTRESS, layFortress, planFortress } from './fortress';
import { garageRotFor } from './garage';
import { COURT_CELLS_X, COURT_D, COURT_THEFT_FACTOR, MOTOR_COURT, courtSpot, courts } from './motorCourt';
import { YARD_BAYS, yardBays, yardCapacity } from './farm';
import { buyVehicle, raidTakesVehicles } from './vehicles';
import { parkingPlan } from './parking';
import { layWalkway } from './walkway';
import { addRazor, razorBill, razorMetres, razorProblem } from './razor';
import { KIT } from '../game/buildkit/kit';

const game = (seed = 7): GameState => { const g = newGame(seed); g.site = { ...g.site, creek: false }; return g; };
const geo = (g: GameState) => { const h = g.site.home, z = (h.z0 + h.z1) / 2; return { roadGate: [h.x1, z + 4] as Pt }; };
const finishStruct = (g: GameState, kind: string, x: number, z: number, rot = 0) => {
  const st = { id: `t${g.nextId++}`, kind, x, z, rot, stage: BLUEPRINTS[kind].stages.length, done: 0, supplied: true, finishedAt: 0 };
  g.structures.push(st as GameState['structures'][number]);
  return st as GameState['structures'][number];
};

describe('the motor court', () => {
  it('stands outside the gate, back to the garage, its drive gate facing away; the kit, the blueprint and the bays agree', () => {
    const gs = { x: 40, z: 30, inx: -1, inz: 0 };      // the wall runs north-south at x = 40; inward is west
    const sp = courtSpot(gs);
    expect(sp.x).toBeGreaterThan(gs.x);                // outside: east of the wall
    expect(Math.abs(sp.x - gs.x)).toBeGreaterThanOrEqual(COURT_D / 2);
    expect(sp.z).toBe(gs.z);
    expect((sp.rot + 2) % 4).toBe(garageRotFor([gs.inx, gs.inz]));   // the opposite way to the garage's door side
    expect(KIT[MOTOR_COURT].cellsX).toBe(COURT_CELLS_X);
    expect(BLUEPRINTS[MOTOR_COURT].stages).toHaveLength(5);
    expect(billCost(totalBill(BLUEPRINTS[MOTOR_COURT]))).toBeGreaterThan(0);
    expect(totalHours(BLUEPRINTS[MOTOR_COURT])).toBeGreaterThan(100);
    const g = game();
    expect(yardCapacity(g)).toBe(0);
    finishStruct(g, MOTOR_COURT, 20, 20);
    expect(yardCapacity(g)).toBe(YARD_BAYS);
    expect(courts(g)).toHaveLength(1);
  });

  it('the Fortify plan puts it outside the gate when asked (and says why not when it cannot), and lays it with the rest', () => {
    const g = game();
    const none = planFortress(g, geo(g), { ...DEFAULT_FORTRESS, scope: 'full', towers: 0, passage: false });
    expect(none.court).toBeNull();
    const plan = planFortress(g, geo(g), { ...DEFAULT_FORTRESS, scope: 'full', towers: 0, passage: false, motorCourt: true });
    if (plan.court) {
      expect(plan.court.kind).toBe(MOTOR_COURT);
      expect(plan.cost).toBeGreaterThan(none.cost);
      const before = g.structures.length;
      layFortress(g, plan);
      expect(g.structures.some(st => st.kind === MOTOR_COURT)).toBe(true);
      expect(g.structures.length).toBeGreaterThan(before + 1);
    } else {
      expect(plan.notes.join(' ')).toMatch(/motor court/);
    }
  });

  it('the fleet parks in the court before the open yard, and a raid is a quarter as likely to drive off what stands behind its bars', () => {
    let openTaken = 0, courtTaken = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const a = game(seed); a.money = 500_000; buyVehicle(a, 'suv'); buyVehicle(a, 'atv');
      const b = game(seed); b.money = 500_000; buyVehicle(b, 'suv'); buyVehicle(b, 'atv');
      finishStruct(b, MOTOR_COURT, 20, 20);
      expect(parkingPlan(b).inYard.length).toBeGreaterThan(0);
      openTaken += raidTakesVehicles(a, true).length;
      courtTaken += raidTakesVehicles(b, true).length;
    }
    expect(openTaken).toBeGreaterThan(10);
    expect(courtTaken).toBeLessThan(openTaken * 0.6);
    expect(COURT_THEFT_FACTOR).toBeLessThan(0.5);
    expect(yardBays(game()).length).toBe(0);
  });
});

describe('the black bar fence', () => {
  it('is in the price table, dearer than chain link, tiered, and upgrades into steel', () => {
    expect(PERIMETER_ORDER).toContain('bar_fence');
    expect(costPer100m('bar_fence')).toBeGreaterThan(costPer100m('chain_link'));
    expect(perimeterTiers().flatMap(t => t.kinds)).toContain('bar_fence');
    expect(UPGRADE_NEXT.bar_fence).toBe('steel_wall');
    expect(costPer100m('steel_wall')).toBeGreaterThan(costPer100m('bar_fence'));
    expect(PERIMETER.bar_fence.blocks.people).toBeGreaterThan(PERIMETER.chain_link.blocks.people);
    expect(PERIMETER.bar_fence.sight).toBeLessThan(0.1);
  });
});

describe('razor wire', () => {
  const sq = (): Pt[] => [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]];
  it('is priced from the table, hung from the stockpile on a finished wall, and stops people a little more', () => {
    const g = game();
    const w = planRun(g, 'container_wall', sq());
    expect(razorProblem(g, w)).toMatch(/not finished/);
    w.finishedAt = 0;
    expect(razorProblem(g, w)).toMatch(/waiting for/);
    const bill = razorBill(80);
    expect(bill.wire).toBeGreaterThan(0);
    g.stock.wire = 500; g.stock.hardware = 500;
    const before = peopleBlock(g, w), wire0 = g.stock.wire;
    expect(razorMetres(g)).toBe(0);
    expect(addRazor(g, w.id)).toBeNull();
    expect(g.stock.wire).toBeLessThan(wire0);
    expect(peopleBlock(g, w)).toBeCloseTo(Math.min(RAZOR.CAP, before + RAZOR.PEOPLE), 6);
    expect(razorMetres(g)).toBeGreaterThan(0);
    expect(addRazor(g, w.id)).toMatch(/already/);
    expect(runFinished(w)).toBe(true);
  });
  it('goes on a wall that already has a patrol deck: the coils ride the deck\'s outer rail', () => {
    const g = game(); g.stock.wire = 500; g.stock.hardware = 500; g.stock.rebar = 500; g.stock.roofing = 500;
    const w = planRun(g, 'container_wall', sq());
    w.finishedAt = 0;
    g.perimeter.push(w);
    layWalkway(g, w, true);
    expect(g.perimeter.some(x => x.hostId === w.id)).toBe(true);
    expect(razorProblem(g, w)).toBeNull();
    expect(addRazor(g, w.id)).toBeNull();
    expect(w.razor).toBe(true);
  });
  it('is refused on walls that carry their own wire, on hedges and on unknown runs', () => {
    const g = game(); g.stock.wire = 500; g.stock.hardware = 500;
    for (const k of ['steel_wall', 'electric_steel', 'thorn_hedge', 'split_rail'] as const) { const r = planRun(g, k, sq()); r.finishedAt = 0; expect(razorProblem(g, r)).not.toBeNull(); }
    expect(addRazor(g, 'nope')).toMatch(/no such/);
    for (const k of RAZOR.HOSTS) expect(PERIMETER[k].blocks.people).toBeGreaterThanOrEqual(RAZOR.MIN_BLOCK);
  });
});
