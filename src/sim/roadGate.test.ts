import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { enclosure } from './enclosure';
import { GARAGE_W, GATE_GARAGE } from './garage';
import { layPropertyWall, planPropertyWall, type PropertyGeometry } from './propertyWall';
import { coreRect, layFortress, planFortress } from './fortress';
import { PERIMETER, planRun, upgradeRun, wallLength, type PerimeterKind, type Pt } from './perimeter';
import { DRIVE_HALF, MIN_VEHICLE_GATE, ROAD_GATE_W, VEHICLE_HALF, autoRoadGates, crossings, cutRoadGates, gateTakesDrive, isBarrierKind, roadGateStatus, ungatedCrossings } from './roadGate';
import { defenseReport } from './defenseReport';
import { longTerm } from './guidance';
import { DRIVE_W, planAccess } from '../game/region/access';
import { VEHICLE_SIZE } from '../game/props/vehicleGeometry';
import { PARCEL_SIZE } from '../game/parcel/parcelTerrain';

const game = (): GameState => { const g = newGame(7); g.site = { ...g.site, creek: false }; return g; };
const finishAll = (g: GameState) => { for (const r of g.perimeter) r.finishedAt = 0; };
/** The world's real driveway for a camp (game/region/access.ts), as the canvas hands it to the planners. */
const world = (g: GameState, camp: { x: number; z: number }): PropertyGeometry => {
  const h = g.site.home, a = planAccess(camp, Math.max(4, h.z0 + 3), Math.min(PARCEL_SIZE - 4, h.z1 - 3));
  return { roadGate: [a.gate.x, a.gate.z], drive: a.drive.map(p => [p[0], p[1]] as Pt), center: [camp.x, camp.z] };
};

/** Where the drive meets the line of the run the plan made, along the run, and the gate's reach. */
function gateOffset(plan: ReturnType<typeof planPropertyWall>, drive: readonly Pt[]): { off: number; w: number } {
  const run = plan.runs.find(r => r.gates.length)!;
  const c = crossings(run.pts, drive)[0];
  return { off: Math.abs(run.gates[0].at - c.at), w: run.gates[0].w };
}

describe('constants', () => {
  it('the gate is wider than the widest vehicle and the drive agrees with the world', () => {
    const widest = Math.max(...Object.values(VEHICLE_SIZE).map(v => v.w));
    expect(ROAD_GATE_W).toBeGreaterThan(widest + 0.1);
    expect(VEHICLE_HALF).toBeGreaterThanOrEqual(widest / 2);
    expect(DRIVE_HALF).toBeCloseTo(DRIVE_W / 2);
    expect(MIN_VEHICLE_GATE).toBeGreaterThan(0.2);   // a man-door (0.2) is not a vehicle gate
  });
});

describe('crossings', () => {
  const drive: Pt[] = [[10, 5], [0, 5], [-10, 8]];
  it('finds where a line meets the driveway, once, even at a vertex', () => {
    const c = crossings([[3, 0], [3, 10]], drive);
    expect(c).toHaveLength(1);
    expect(c[0].at).toBeCloseTo(5);
    expect(c[0].sin).toBeCloseTo(1);
    expect(crossings([[3, 0], [3, 5], [3, 10]], drive)).toHaveLength(1);
    expect(crossings([[3, 0], [3, 3]], drive)).toHaveLength(0);
  });
  it('reads the slant', () => {
    const c = crossings([[0, 0], [10, 10]], [[8, 0], [0, 8]]);
    expect(c[0].sin).toBeCloseTo(1);
    const slant = crossings([[0, 0], [10, 2]], [[10, 0], [0, 4]]);
    expect(slant[0].sin).toBeLessThan(1);
  });
});

describe('(a) Wall my property, the full line', () => {
  it('puts the gate where the driveway crosses the line, the drive running through it', () => {
    const g = game(), geo = world(g, { x: 30, z: 35 });
    const plan = planPropertyWall(g, 'chain_link', geo);
    const { off, w } = gateOffset(plan, geo.drive!);
    expect(off).toBeLessThan(0.02);
    expect(w).toBeGreaterThanOrEqual(ROAD_GATE_W);
    expect(plan.gateSpot!.onDrive).toBe(true);
    expect(plan.gateSpot!.x).toBeCloseTo(PARCEL_SIZE);
    layPropertyWall(g, plan, geo);
    expect(roadGateStatus(g, geo.drive)).toMatchObject({ crossing: 1, gated: 1, missing: 0 });
  });
  it.each([5, 20, 40, 80] as const)('does so on a %i-acre lot', acres => {
    const g = game(); g.site = { ...g.site, acres, home: acres === 5 ? { x0: 43.3, z0: 21.6, x1: 67, z1: 45.3 } : acres === 20 ? { x0: 33.5, z0: 0, x1: 67, z1: 67 } : acres === 40 ? { x0: 0, z0: 0, x1: 67, z1: 67 } : { x0: -67, z0: 0, x1: 67, z1: 67 } };
    const h = g.site.home, geo = world(g, { x: (Math.max(h.x0, 0) + h.x1) / 2, z: (h.z0 + h.z1) / 2 });
    const plan = planPropertyWall(g, 'woven_wire', geo);
    expect(gateOffset(plan, geo.drive!).off).toBeLessThan(0.02);
  });
  it('is the weak point: the line holds less at the gate than along the wall, and upgrading keeps the gate', () => {
    const g = game(), geo = world(g, { x: 30, z: 35 });
    layPropertyWall(g, planPropertyWall(g, 'chain_link', geo), geo);
    finishAll(g);
    const run = g.perimeter[0], gate = run.gates[0];
    expect(upgradeRun(g, run.id)).toBeNull();
    const next = g.perimeter.find(r => r.replaces === run.id)!;
    expect(next.kind).toBe(PERIMETER[run.kind] && 'wrought_iron');
    expect(next.gates).toEqual([gate]);
    expect(enclosure(g).openShare).toBe(0);
    expect(enclosure(g).barrier).toBeLessThan(100 * PERIMETER.chain_link.blocks.people);   // the shut gate holds 60 %
  });
});

describe('(b) Fortify my ring, the full line', () => {
  it('puts the gatehouse garage on the driveway with its drive-through gate on the center line', () => {
    const g = game(), geo = world(g, { x: 30, z: 35 });
    const plan = planFortress(g, geo, { scope: 'full', passage: false });
    expect(plan.garage).not.toBeNull();
    const run = plan.wall.runs.find(r => r.gates.some(x => x.garage))!;
    const c = crossings(run.pts, geo.drive!)[0];
    expect(Math.abs(run.gates[0].at - c.at)).toBeLessThan(0.02);
    expect(run.gates[0].w).toBe(GARAGE_W);
    layFortress(g, plan);
    expect(roadGateStatus(g, geo.drive)).toMatchObject({ crossing: 1, missing: 0, garage: true });
    // a garage's door is a drive-through gate: a man-door is not
    expect(gateTakesDrive({ at: 5, w: 0.2 }, 5)).toBe(false);
    expect(gateTakesDrive({ at: 5, w: ROAD_GATE_W }, 5)).toBe(true);
    expect(gateTakesDrive({ at: 5, w: ROAD_GATE_W }, 5.5)).toBe(false);
  });
});

describe('(c) Fortify my ring, the core ring on the home forty', () => {
  it('puts the gate where the driveway crosses the CORE wall, not at the nearest point to the property gate', () => {
    const g = game(), camp = { x: 35, z: 30 }, geo = { ...world(g, camp), center: [35, 19.5] as Pt };   // the family's buildings sit north of the camp: a corner of the core falls on the driveway
    const core = coreRect(g, geo), gz = geo.roadGate![1];
    expect(core.z1).toBeCloseTo(gz, 0);   // the drive meets the core's wall right at its corner
    const plan = planFortress(g, geo, { passage: false });
    const gs = plan.wall.gateSpot!;
    expect(gs.onDrive).toBe(true);
    // the road comes in at a bend of the ring: an ordinary vehicle gate on the driveway, not a garage that the drive would miss
    expect(gs.noGarage).toBe(true);
    expect(plan.garage).toBeNull();
    const run = plan.wall.runs.find(r => r.gates.length)!;
    const c = crossings(run.pts, geo.drive!)[0];
    expect(gateTakesDrive(run.gates[0], c.at, c.sin)).toBe(true);
    // before this change the garage was slid off the corner and the drive missed its drive-through gate
    const before = planFortress(g, { roadGate: geo.roadGate, center: geo.center }, { passage: false });
    const br = before.wall.runs.find(r => r.gates.length)!;
    const bc = crossings(br.pts, geo.drive!)[0];
    expect(gateTakesDrive(br.gates[0], bc.at, bc.sin)).toBe(false);
  });
  it('is a garage across the drive when the road comes in square', () => {
    const g = game(), camp = { x: 30, z: 33 }, geo = world(g, camp);
    const plan = planFortress(g, geo, { passage: false });
    const core = coreRect(g, geo);
    expect(plan.garage).not.toBeNull();
    const run = plan.wall.runs.find(r => r.gates.some(x => x.garage))!;
    const c = crossings(run.pts, geo.drive!)[0];
    expect(Math.abs(run.gates[0].at - c.at)).toBeLessThan(0.02);
    // the gate is on the core wall, inside the property, and the drive carries on to the yard
    expect(c.x).toBeGreaterThan(core.x0);
    expect(c.x).toBeLessThan(PARCEL_SIZE);
    expect(c.x).toBeCloseTo(core.x1, 1);
    layFortress(g, plan);
    expect(roadGateStatus(g, geo.drive).missing).toBe(0);
    // the garage's footprint is on the crossing, door toward the inside (west)
    expect(plan.garage!.rot).toBe(3);
    expect(Math.abs(plan.garage!.z - c.z)).toBeLessThan(0.1);
  });
  it('leaves the drive a gate through the core wall even when the core is slid to the property edge', () => {
    const g = game(), camp = { x: 58, z: 30 }, geo = world(g, camp);
    const plan = planFortress(g, geo, { passage: false });
    layFortress(g, plan);
    expect(roadGateStatus(g, geo.drive)).toMatchObject({ missing: 0 });
    expect(roadGateStatus(g, geo.drive).crossing).toBeGreaterThan(0);
  });
});

describe('(d) walls and fences drawn by hand', () => {
  const geo = (g: GameState) => world(g, { x: 30, z: 35 });
  const kinds: PerimeterKind[] = ['split_rail', 'barbed_wire', 'thorn_hedge', 'log_palisade', 'container_wall', 'chain_link', 'steel_wall', 'concrete_wall', 'earth_berm', 'ditch'];
  it.each(kinds)('gives a %s run a gate where it crosses the driveway', kind => {
    const g = game(), d = geo(g).drive!, gz = d[0][1];
    const pts: Pt[] = [[60, gz - 8], [60, gz + 8]];
    expect(isBarrierKind(kind)).toBe(true);
    const r = autoRoadGates(kind, pts, [], d);
    expect(r.added).toHaveLength(1);
    const c = crossings(pts, d)[0];
    expect(gateTakesDrive(r.gates[0], c.at, c.sin)).toBe(true);
    expect(r.gates[0].w).toBeGreaterThanOrEqual(ROAD_GATE_W);
    // costed without the gap
    expect(wallLength({ pts, gates: r.gates })).toBeCloseTo(16 - r.gates[0].w);
  });
  it('leaves lines that do not meet the driveway, and pipes, decks and bars, alone', () => {
    const g = game(), d = geo(g).drive!, gz = d[0][1];
    expect(autoRoadGates('chain_link', [[10, 5], [10, 20]], [], d).added).toHaveLength(0);
    expect(autoRoadGates('water_pipe', [[60, gz - 8], [60, gz + 8]], [], d).added).toHaveLength(0);
    expect(autoRoadGates('wall_walk', [[60, gz - 8], [60, gz + 8]], [], d).added).toHaveLength(0);
    expect(autoRoadGates('creek_bars', [[60, gz - 8], [60, gz + 8]], [], d).added).toHaveLength(0);
    expect(autoRoadGates('chain_link', [[60, gz - 8], [60, gz + 8]], [], undefined).added).toHaveLength(0);
  });
  it('keeps a gate the player put there, and widens a man-door into a vehicle gate rather than doubling', () => {
    const g = game(), d = geo(g).drive!, gz = d[0][1], pts: Pt[] = [[60, gz - 8], [60, gz + 8]];
    const c = crossings(pts, d)[0];
    const own = autoRoadGates('chain_link', pts, [{ at: c.at, w: ROAD_GATE_W }], d);
    expect(own.added).toHaveLength(0);
    expect(own.gates).toHaveLength(1);
    const door = autoRoadGates('chain_link', pts, [{ at: c.at + 0.05, w: 0.2 }], d);
    expect(door.gates).toHaveLength(1);
    expect(door.gates[0].w).toBeGreaterThanOrEqual(ROAD_GATE_W);
  });
  it('cuts a wider mouth for a slanted crossing and keeps the posts off a bend in the line', () => {
    const d: Pt[] = [[70, 30], [40, 30]];
    const slant = autoRoadGates('chain_link', [[50, 20], [58, 36]], [], d);
    expect(slant.gates[0].w).toBeGreaterThan(ROAD_GATE_W);
    const bent: Pt[] = [[60, 20], [60, 30.1], [66, 36]];
    const b = autoRoadGates('chain_link', bent, [], d);
    const c = crossings(bent, d)[0];
    expect(gateTakesDrive(b.gates[0], c.at, c.sin)).toBe(true);
  });
  it('finds and fixes a wall laid out earlier that crosses the driveway with no gate (one click)', () => {
    const g = game(), d = geo(g).drive!, gz = d[0][1];
    const r = planRun(g, 'chain_link', [[60, gz - 8], [60, gz + 8]]);
    r.finishedAt = 0;
    planRun(g, 'chain_link', [[10, 5], [10, 20]]);
    expect(ungatedCrossings(g, d)).toHaveLength(1);
    expect(roadGateStatus(g, d)).toMatchObject({ crossing: 1, gated: 0, missing: 1 });
    expect(defenseReport(g, d).walls.find(c => c.id === 'roadgate')).toMatchObject({ ok: false });
    expect(cutRoadGates(g, d)).toBe(1);
    expect(ungatedCrossings(g, d)).toHaveLength(0);
    expect(cutRoadGates(g, d)).toBe(0);
    expect(g.perimeter[0].gates).toHaveLength(1);
    expect(defenseReport(g, d).walls.find(c => c.id === 'roadgate')).toMatchObject({ ok: true });
    // an upgrade carries the gate along
    expect(upgradeRun(g, g.perimeter[0].id)).toBeNull();
    expect(g.perimeter.find(x => x.replaces === g.perimeter[0].id)!.gates).toEqual(g.perimeter[0].gates);
  });
  it('laying Wall my property over a wall that is already across the drive cuts it a gate', () => {
    const g = game(), geo2 = geo(g), gz = geo2.drive![0][1];
    const r = planRun(g, 'chain_link', [[67, gz - 20], [67, gz + 20]]);
    r.finishedAt = 0;
    const plan = planPropertyWall(g, 'chain_link', geo2);
    expect(plan.gateNote).toMatch(/cuts a gate|already walled/);
    layPropertyWall(g, plan, geo2);
    expect(roadGateStatus(g, geo2.drive).missing).toBe(0);
  });
  it('the report and the card say so', () => {
    const g = game(), d = geo(g).drive!, gz = d[0][1];
    const r = planRun(g, 'chain_link', [[60, gz - 8], [60, gz + 8]]); r.finishedAt = 0;
    const goal = longTerm(g, d)[0].steps.find(s => s.label === 'Gate at the road')!;
    expect(goal.done).toBe(false);
    expect(goal.detail).toMatch(/no gate/);
    cutRoadGates(g, d);
    expect(longTerm(g, d)[0].steps.find(s => s.label === 'Gate at the road')!.done).toBe(true);
  });
});

describe('(e) odd lots', () => {
  it('an L-shaped lot: the gate is where the drive crosses, on the east piece', () => {
    const g = game(), h = g.site.home;
    g.land.parcels.push({ id: 'pz', name: 'the east piece', rect: { x0: h.x1, z0: h.z0, x1: h.x1 + 30, z1: h.z0 + 25 }, owner: 'you', kind: 'grazing' as never, forSale: false });
    // a road that enters 12 units in on the east piece's far edge
    const drive: Pt[] = [[h.x1 + 36, h.z0 + 12], [h.x1 + 30, h.z0 + 12], [h.x1 + 10, h.z0 + 12], [h.x1 - 8, h.z0 + 20]];
    const plan = planPropertyWall(g, 'chain_link', { drive });
    expect(plan.gateSpot!.x).toBeCloseTo(h.x1 + 30);
    expect(gateOffset(plan, drive).off).toBeLessThan(0.02);
    const f = planFortress(g, { drive }, { scope: 'full', passage: false });
    expect(f.garage).not.toBeNull();
    layFortress(g, f);
    expect(roadGateStatus(g, drive).missing).toBe(0);
  });
  it('a road that enters at a corner gets an ordinary gate on the drive, with no gate garage', () => {
    const g = game(), h = g.site.home;
    const drive: Pt[] = [[h.x1 + 5, h.z0 + 0.1], [h.x1 - 10, h.z0 + 1.6]];
    const f = planFortress(g, { drive }, { scope: 'full', passage: false });
    expect(f.wall.gateSpot).not.toBeNull();
    expect(f.wall.gateSpot!.noGarage).toBe(true);
    expect(f.garage).toBeNull();
    expect(f.notes.join(' ')).toMatch(/bend/);
    layFortress(g, f);
    expect(roadGateStatus(g, drive).missing).toBe(0);
  });
  it('a creek crossing the line right at the road: the gate moves to the nearest wall, off the creek bars', () => {
    const g = newGame(7);
    g.site = { ...g.site, creek: true };
    const h = g.site.home, gz = (h.z0 + h.z1) / 2;
    const drive: Pt[] = [[h.x1 + 5, gz + 0.3], [h.x1 - 10, gz + 0.3]];
    const geo: PropertyGeometry = { creekZ: () => gz, creekHalf: 0.7, drive };
    const plan = planPropertyWall(g, 'chain_link', geo);
    expect(plan.creekCrossings).toBe(2);
    const run = plan.runs.find(r => r.kind === 'chain_link' && r.gates.length)!;
    expect(run).toBeDefined();
    expect(plan.gateSpot!.shift!).toBeGreaterThan(0);
    // the gate stands clear of the bars
    expect(Math.abs(plan.gateSpot!.z - gz)).toBeGreaterThan(0.7 + 0.6 - 0.01);
  });
  it('no drive known: falls back to the nearest point to the farm gate, as before', () => {
    const g = game(), h = g.site.home, z = (h.z0 + h.z1) / 2;
    const plan = planPropertyWall(g, 'chain_link', { roadGate: [h.x1, z + 4] });
    expect(plan.gateSpot!.onDrive).toBeUndefined();
    expect(plan.gateSpot!.z).toBeCloseTo(z + 4);
  });
});

describe('the gate keeps the place working', () => {
  it('a gatehouse garage ring is closed and the road is open: a vehicle fits through every gate we cut', () => {
    const g = game(), geo = world(g, { x: 30, z: 33 });
    layFortress(g, planFortress(g, geo, { passage: false }));
    for (const r of g.perimeter) r.finishedAt = 0;
    for (const st of g.structures) if (st.kind === GATE_GARAGE) { st.stage = 99; st.finishedAt = 0; }
    for (const r of g.perimeter) for (const gate of r.gates) expect(gate.w).toBeGreaterThanOrEqual(ROAD_GATE_W);
    expect(roadGateStatus(g, geo.drive).missing).toBe(0);
  });
});
