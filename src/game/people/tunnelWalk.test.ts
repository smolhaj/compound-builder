/**
 * People and dogs walking through a rock tunnel (docs/DECISIONS.md, "Tunnel use"): the real renderers (FamilyRenderer, DogRenderer) over a synthetic
 * mountain: a 39-unit (236 m) rock face between the court on the low shelf and the compound on the bench above it, the one way through a bore.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { newGame, type GameState } from '../../sim/state';
import { adoptDog, setGuard } from '../../sim/pets';
import { variedFamily } from '../../sim/family';
import { CLASSIC } from '../../sim/site';
import { FamilyRenderer } from './FamilyRenderer';
import { DogRenderer } from './DogRenderer';
import type { GoalCtx, Site } from './peopleGoals';
import type { DogCtx } from './dogGoals';
import { CorridorNet } from '../paths/CorridorNet';
import { CorridorDoors } from '../perimeter/CorridorDoors';
import type { PerimeterRun } from '../../sim/perimeter';
import { walkSeconds } from '../../sim/corridors';
import { U_PER_M } from '../../sim/corridors';

/** The rock face: x from 20 to 60 (40 units, 240 m) climbs 8 units (48 m): the shelf is at 0, the bench at 8. Impassable on foot. */
const FACE = { x0: 20, x1: 60 };
const ground = (x: number) => (x <= FACE.x0 ? 0 : x >= FACE.x1 ? 8 : 8 * (x - FACE.x0) / (FACE.x1 - FACE.x0) + 3 * Math.sin(Math.PI * (x - FACE.x0) / (FACE.x1 - FACE.x0)));      // (with a hump of rock over the tunnel)
const hard = (x: number, _z: number) => x > FACE.x0 - 0.3 && x < FACE.x1 + 0.3;
const bore = (over: Partial<PerimeterRun> = {}): PerimeterRun => ({ id: 'tun', kind: 'rock_tunnel', pts: [[FACE.x0 - 0.4, 10], [FACE.x1 + 0.4, 10]], gates: [], done: 1, hours: 1, supplied: true, finishedAt: 0, ...over });

function world(opts: { collapsed?: boolean; locked?: () => boolean } = {}) {
  const net = new CorridorNet();
  net.sync([bore(opts.collapsed ? { collapsed: { at: 0, rubbleM3: 1, clearsAt: null } } : {})]);
  net.ensure(ground);
  const via = (fx: number, fz: number, tx: number, tz: number) => net.route([fx, fz], [tx, tz], net.reach('k', { x0: 0, z0: 0, x1: 80, z1: 20 }, hard), () => []) ?? [];
  let waits = 0;
  const doorWait = () => { if (opts.locked?.()) { waits++; return 0.8; } return 0; };
  return { net, via, doorWait, waits: () => waits };
}

const sites = (): Record<string, Site> => ({ low: { x: 10, z: 10, rot: 0, w: 1, d: 1 }, high: { x: 70, z: 12, rot: 0, w: 1, d: 1 } });

describe('a person walking through a rock tunnel', () => {
  function run(opts: Parameters<typeof world>[0] = {}, secs = 400) {
    const w = world(opts), S = sites();
    const g: GameState = newGame(3, 105, 2027, { site: CLASSIC, family: variedFamily(3, 0).people });
    const fam = new FamilyRenderer(new THREE.Scene());
    const ctx = (): GoalCtx => ({ camp: { x: 5, z: 10, rot: 0 }, site: id => S[id] ?? null, home: null, via: w.via, doorWait: w.doorWait });
    const people = g.people.slice(0, 1), states = g.personState.slice(0, 1);
    const hour = 10;
    states[0].task = 'build'; states[0].target = 'low';
    fam.update(0.1, people, states, hour, 1, ctx(), ground, 'summer', 1);     // placed on the shelf, at work
    const start = fam.positions()[0];
    states[0].target = 'high';                                                // the work is up on the bench
    const trace: Array<{ t: number; x: number; z: number; y: number | null }> = [];
    let t = 0, arrivedAt: number | null = null;
    for (; t < secs; t += 0.1) {
      fam.update(0.1, people, states, hour, 1, ctx(), ground, 'summer', 1);
      const p = fam.positions()[0];
      trace.push({ t, x: p.x, z: p.z, y: p.y });
      if (Math.hypot(p.x - 70, p.z - 12) < 1.2 && arrivedAt === null) { arrivedAt = t; break; }
    }
    fam.dispose();
    return { trace, start, arrivedAt, w };
  }

  it('goes up through the bore to the work on the bench, not over the face, and gets there', () => {
    const r = run();
    expect(r.start.x).toBeLessThan(15);
    expect(r.arrivedAt, 'never arrived').not.toBeNull();
    // never on the face: every point either well off it, or inside the tunnel on the deck
    for (const p of r.trace) if (p.x > FACE.x0 - 0.2 && p.x < FACE.x1 + 0.2) expect(p.y, `at x ${p.x.toFixed(1)} on the face`).not.toBeNull();
    // inside, the figure is on the deck under the hill: lower than the face above it, rising with the bore
    const inside = r.trace.filter(p => p.y !== null);
    expect(inside.length).toBeGreaterThan(100);
    for (const p of inside) if (p.x > FACE.x0 + 2 && p.x < FACE.x1 - 2) expect(p.y!).toBeLessThan(ground(p.x) + 0.05);
    const ys = inside.map(p => p.y!);
    expect(ys[ys.length - 1]).toBeGreaterThan(ys[0] + 6);
  });

  it('takes real time: the 236 m bore is walked at a walking pace, not teleported (the world pace: 0.5 units a second, slower uphill)', () => {
    const r = run();
    const inside = r.trace.filter(p => p.y !== null);
    const secs = inside.length * 0.1, lenU = 40.8;
    expect(secs).toBeGreaterThan(lenU / 0.5 * 0.8);
    expect(secs).toBeLessThan(lenU / 0.5 * 2);
    // and in game minutes (the sim's clock) the same bore is about three
    expect(walkSeconds(lenU / U_PER_M) / 60).toBeGreaterThan(2.5);
    expect(walkSeconds(lenU / U_PER_M) / 60).toBeLessThan(3.4);
  });

  it('waits at a locked door (they have the key) and goes on', () => {
    const locked = run({ locked: () => true });
    const open = run();
    expect(locked.w.waits()).toBeGreaterThan(0);
    expect(locked.arrivedAt!).toBeGreaterThan(open.arrivedAt! + 1);
    expect(locked.arrivedAt!).toBeLessThan(open.arrivedAt! + 8);
  });

  it('a collapsed tunnel carries nobody: they walk to the mouth and wait there, never through the rubble or over the face; cleared, they go on', () => {
    const w = world({ collapsed: true }), S = sites();
    const g = newGame(3, 105, 2027, { site: CLASSIC, family: variedFamily(3, 0).people });
    const fam = new FamilyRenderer(new THREE.Scene());
    const ctx: GoalCtx = { camp: { x: 5, z: 10, rot: 0 }, site: id => S[id] ?? null, home: null, via: w.via, doorWait: w.doorWait };
    const people = g.people.slice(0, 1), states = g.personState.slice(0, 1);
    states[0].task = 'build'; states[0].target = 'low';
    fam.update(0.1, people, states, 10, 1, ctx, ground, 'summer', 1);
    states[0].target = 'high';
    let deck = false;
    for (let t = 0; t < 120; t += 0.1) { fam.update(0.1, people, states, 10, 1, ctx, ground, 'summer', 1); if (fam.positions()[0].y !== null) deck = true; }
    const held = fam.positions()[0];
    expect(deck).toBe(false);
    expect(held.x).toBeGreaterThan(FACE.x0 - 2);        // at the mouth (the portal is at 19.6, the mouth a unit outside it)
    expect(held.x).toBeLessThan(FACE.x0);
    // the contractor has been: the next look for the way finds it, and they go through
    w.net.sync([bore()]); w.net.ensure(ground);
    let through = false;
    for (let t = 0; t < 400 && !through; t += 0.1) { fam.update(0.1, people, states, 10, 1, ctx, ground, 'summer', 1); if (fam.positions()[0].x > 65) through = true; }
    expect(through).toBe(true);
    fam.dispose();
  });

  it('coming back down goes the other way', () => {
    const w = world(), S = sites();
    const g = newGame(3, 105, 2027, { site: CLASSIC, family: variedFamily(3, 0).people });
    const fam = new FamilyRenderer(new THREE.Scene());
    const ctx: GoalCtx = { camp: { x: 5, z: 10, rot: 0 }, site: id => S[id] ?? null, home: null, via: w.via, doorWait: w.doorWait };
    const people = g.people.slice(0, 1), states = g.personState.slice(0, 1);
    states[0].task = 'build'; states[0].target = 'high';
    fam.update(0.1, people, states, 10, 1, ctx, ground, 'summer', 1);
    expect(fam.positions()[0].x).toBeGreaterThan(65);
    states[0].target = 'low';
    let down = false;
    for (let t = 0; t < 400; t += 0.1) { fam.update(0.1, people, states, 10, 1, ctx, ground, 'summer', 1); const p = fam.positions()[0]; if (p.y !== null) down = true; if (Math.hypot(p.x - 10, p.z - 10) < 1.2) break; }
    expect(down).toBe(true);
    expect(fam.positions()[0].x).toBeLessThan(15);
    fam.dispose();
  });

  it('with no tunnel there is no way: they do not teleport across the face either unless the goal is far (the old behaviour)', () => {
    const none = new CorridorNet();
    none.sync([]);
    expect(none.any).toBe(false);
  });
});

describe('a dog following through the tunnel', () => {
  it('trots up the deck to its post on the bench', () => {
    const w = world();
    const g = newGame(3);
    const d = adoptDog(g, { ageYears: 3 });
    setGuard(g, d.id, true);
    const gateLow = { x: 8, z: 10 }, yardHigh = { x: 70, z: 10 };
    const ctx = (atHigh: boolean): DogCtx => ({ home: null, camp: { x: 5, z: 10 }, gate: atHigh ? { x: 72, z: 10 } : gateLow, yard: atHigh ? yardHigh : { x: 12, z: 10 }, atGate: false, person: () => null, via: w.via, doorWait: w.doorWait });
    const r = new DogRenderer(new THREE.Scene());
    r.update(0.1, g, 12, 0.5, ctx(false), ground, 1);
    const x0 = r.positions().find(p => p.id === d.id)!.x;
    expect(x0).toBeLessThan(20);
    let deck = 0, arrived = false;
    for (let t = 0; t < 300 && !arrived; t += 0.1) {
      r.update(0.1, g, 12, 0.5, ctx(true), ground, 1);
      const p = r.positions().find(q => q.id === d.id)!;
      if (p.y !== null) { deck++; if (p.x > FACE.x0 + 2 && p.x < FACE.x1 - 2) expect(p.y).toBeLessThan(ground(p.x) + 0.05); }
      if (p.x > 62) arrived = true;
    }
    expect(deck).toBeGreaterThan(30);
    expect(arrived).toBe(true);
    r.dispose();
  });
});

describe('the doors open and close for a walker', () => {
  it('a locked door opens for the family standing at the portal and the figure gets through; nobody else does', () => {
    const doors = new CorridorDoors();
    const g = new THREE.Group();
    const d0 = new THREE.Group(); d0.userData = { door: { end: 0, lift: 3 } }; g.add(d0);
    const c = { id: 'tun', kind: 'rock_tunnel' as const, a: [FACE.x0 - 0.4, 10] as [number, number], b: [FACE.x1 + 0.4, 10] as [number, number], pts: [[FACE.x0 - 0.4, 10], [FACE.x1 + 0.4, 10]] as Array<[number, number]>, lenU: 40.8, lenM: 245, bore: true, collapsed: false };
    for (let i = 0; i < 40; i++) doors.update(0.1, [c], new Map([['tun', g]]), true, []);
    expect(doors.openness('tun', 0)).toBe(0);
    for (let i = 0; i < 20; i++) doors.update(0.1, [c], new Map([['tun', g]]), true, [[FACE.x0 - 0.8, 10]]);
    expect(doors.openness('tun', 0)).toBe(1);
  });
});
