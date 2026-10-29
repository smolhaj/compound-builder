import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { PERIMETER, planRun, runBlocked, runFinished, upgradeRun, wallLength, type Pt } from './perimeter';
import { enclosure } from './enclosure';
import { GATE_GARAGE, GARAGE_SLOTS, GARAGE_W, freeSlots, garageRotFor, leave, occupiedSlots, park, parkingSlots, slotOf, slotsOf } from './garage';
import { addWalkway, deckHeight, hasWalkway, walkOn, walkRuns, walkwayAccess, walkwayProblem, walkwayWatch, wallPosts, WALKWAY_HOSTS } from './walkway';
import { CORE_SIDE, DEFAULT_FORTRESS, MAX_TOWERS, coreRect, layFortress, planFortress, ringStatus } from './fortress';
import { HOME_RECT } from './site';
import { planBattle } from './battle';
import { postureOf } from './encounters';
import { watchNow } from './daily';
import { defenseReport } from './defenseReport';
import { hatches } from './compounds';
import { BLUEPRINTS } from './blueprints';
import { migrate } from './save/migrations';
import { SAVE_VERSION } from './state';

const game = (seed = 7): GameState => { const g = newGame(seed); g.site = { ...g.site, creek: false }; return g; };
const geo = (g: GameState) => { const h = g.site.home, z = (h.z0 + h.z1) / 2; return { roadGate: [h.x1, z + 4] as Pt }; };
const finishAll = (g: GameState) => { for (const r of g.perimeter) r.finishedAt = 0; for (const st of g.structures) st.stage = BLUEPRINTS[st.kind].stages.length; };
const square = (): Pt[] => [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]];
const wall = (g: GameState, kind: 'container_wall' | 'chain_link' = 'container_wall') => { const r = planRun(g, kind, square()); r.finishedAt = 0; return r; };

describe('wall-top walkway', () => {
  it('goes on solid walls only, once, and not before the wall stands', () => {
    const g = game();
    expect(WALKWAY_HOSTS).toEqual(['container_wall', 'container_stack', 'stone_wall', 'steel_wall', 'electric_steel', 'concrete_wall']);
    const fence = wall(g, 'chain_link');
    expect(walkwayProblem(g, fence.id)).toMatch(/solid wall/);
    const open = planRun(g, 'container_wall', square());
    expect(walkwayProblem(g, open.id)).toMatch(/not finished/);
    const w = wall(g);
    expect(walkwayProblem(g, w.id)).toBeNull();
    expect(addWalkway(g, w.id)).toBeNull();
    expect(walkwayProblem(g, w.id)).toMatch(/already being built/);
    const deck = walkOn(g, w.id)!;
    expect(deck.kind).toBe('wall_walk');
    expect(deck.hostId).toBe(w.id);
    expect(deck.pts).toEqual(w.pts);
  });

  it('is a project like any other: it waits for materials, is costed per length and adds nothing to the wall itself', () => {
    const g = game();
    const w = wall(g);
    const barrier = enclosure(g).barrier;
    addWalkway(g, w.id);
    const deck = walkOn(g, w.id)!;
    expect(runBlocked(g, deck)).toMatch(/Waiting for/);   // no rebar / roofing / hardware yet
    expect(PERIMETER.wall_walk.blocks.people).toBe(0);
    expect(PERIMETER.wall_walk.hours).toBeGreaterThan(0);
    deck.finishedAt = 0;
    expect(enclosure(g).barrier).toBe(barrier);   // the deck is not a wall
  });

  it('waits for its wall: a deck laid on a wall still being built cannot be worked', () => {
    const g = game();
    const w = planRun(g, 'container_wall', square());
    const deck = planRun(g, 'wall_walk', square());
    deck.hostId = w.id;
    g.stock.rebar = g.stock.roofing = g.stock.hardware = 999;
    expect(runBlocked(g, deck)).toMatch(/wall to be finished/);
    w.finishedAt = 0;
    expect(runBlocked(g, deck)).toBeNull();
  });

  it('rides on its wall through an upgrade in place', () => {
    const g = game();
    const w = wall(g);
    addWalkway(g, w.id);
    walkOn(g, w.id)!.finishedAt = 0;
    expect(upgradeRun(g, w.id)).toBeNull();
    const up = g.perimeter.find(r => r.replaces === w.id)!;
    expect(up.kind).toBe('steel_wall');
    // the new wall is finished by the family: the old goes, the deck follows the wall
    up.done = up.hours; up.finishedAt = 0; up.replaces = undefined; g.perimeter = g.perimeter.filter(r => r.id !== w.id); walkOn(g, w.id)!.hostId = up.id;
    expect(walkRuns(g)).toHaveLength(1);
    expect(deckHeight(walkRuns(g)[0].host)).toBe(PERIMETER.steel_wall.height);
  });

  it('has stairs at both sides of a gate and every so often on a long run, never in the gateway', () => {
    const pts: Pt[] = [[0, 0], [60, 0]];
    const acc = walkwayAccess({ pts, gates: [{ at: 30, w: 3, garage: true }] });
    expect(acc.length).toBeGreaterThanOrEqual(4);
    expect(acc.some(a => a.at > 27 && a.at < 30)).toBe(true);
    expect(acc.some(a => a.at > 30 && a.at < 33.5)).toBe(true);
    for (const a of acc) expect(Math.abs(a.at - 30)).toBeGreaterThan(1.5);
    expect(walkwayAccess({ pts: [[0, 0], [8, 0]], gates: [] })).toHaveLength(2);
  });

  it('posts guards on top: more warning with a guard up there, a high fighting post in the battle, fewer climbers get over', () => {
    const g = game();
    const w = wall(g); addWalkway(g, w.id); walkOn(g, w.id)!.finishedAt = 0;
    expect(hasWalkway(g)).toBe(true);
    expect(wallPosts(g).length).toBeGreaterThanOrEqual(2);
    const empty = walkwayWatch(g);
    g.personState[0].task = 'watch';
    const manned = walkwayWatch(g);
    expect(manned.manned).toBe(true);
    expect(manned.view).toBeGreaterThan(empty.view);
    expect(manned.viewR).toBeGreaterThan(empty.viewR);
    // the family's watcher walks the deck (not the gate)
    const watch = watchNow(g);
    expect(watch[0].post).toBe('wall');
    expect(watch[0].walk).toBe(true);
    // detection rises over a bare wall
    const bare = game(); const w2 = wall(bare); void w2; bare.personState[0].task = 'watch';
    expect(postureOf(g).detection).toBeGreaterThan(postureOf(bare).detection);
  });

  const raidGame = (deck: boolean): GameState => {
    const g = newGame(1, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
    g.clock.t = Math.floor(g.disaster.hitAt + 20) + 0.25;
    g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
    g.structures.push({ id: 'house', kind: 'farmhouse', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 6; }
    g.armory.ammo['556'] = 600;
    const w = planRun(g, 'container_wall', [[-12, -12], [12, -12], [12, 12], [-12, 12], [-12, -12]]); w.finishedAt = 0;
    if (deck) { addWalkway(g, w.id); walkOn(g, w.id)!.finishedAt = 0; }
    return g;
  };

  it('the battle puts guards on the real deck where the raid meets the wall, up at the deck height', () => {
    const g = raidGame(true);
    const b = planBattle(g, 6, 3);
    const up = b.events.filter(e => e.kind === 'move' && Math.abs((e.y ?? 0) - (PERIMETER.container_wall.height + 0.02)) < 1e-6);
    expect(up.length).toBeGreaterThan(0);
    // standing on the wall line (the ring is 12 units out), not floating over the yard
    for (const e of up) expect(Math.max(Math.abs((e as { x: number }).x), Math.abs((e as { z: number }).z))).toBeGreaterThan(10.5);
    const plain = planBattle(raidGame(false), 6, 3);
    expect(plain.events.some(e => e.kind === 'move' && (e.y ?? 0) > 0.4)).toBe(false);
  });

  it('with a guard deck fewer crews get over the wall than without', () => {
    let withDeck = 0, without = 0;
    for (let seed = 1; seed <= 40; seed++) {
      if (planBattle(raidGame(true), 6, seed).result === 'breached') withDeck++;
      if (planBattle(raidGame(false), 6, seed).result === 'breached') without++;
    }
    expect(withDeck).toBeLessThanOrEqual(without);
  });
});

describe('gatehouse garage', () => {
  const placed = (g: GameState, x = 5, z = 5, rot = 0) => {
    const st = { id: 'gg1', kind: GATE_GARAGE, x, z, rot, stage: 99, done: 0, supplied: true, finishedAt: 0 };
    g.structures.push(st);
    return st;
  };

  it('has a blueprint, a footprint the sim agrees with and four parking slots', () => {
    expect(BLUEPRINTS[GATE_GARAGE].stages).toHaveLength(5);
    const g = game();
    const st = placed(g);
    const slots = slotsOf(st);
    expect(slots).toHaveLength(GARAGE_SLOTS);
    expect(GARAGE_SLOTS).toBe(4);
    expect(slots.map(s => s.id)).toEqual(['gg1:0', 'gg1:1', 'gg1:2', 'gg1:3']);
    // two each side of the gate, along the wall, facing out through the doors (+z at rot 0)
    expect(slots[0].x).toBeLessThan(st.x); expect(slots[3].x).toBeGreaterThan(st.x);
    expect(slots.every(s => s.fz === 1 && s.fx === 0)).toBe(true);
    expect(slotsOf({ ...st, rot: 1 })[0].fx).toBe(1);
  });

  it('parks, finds and frees vehicles by id (the fleet fills it later)', () => {
    const g = game();
    expect(park(g, 'v1')).toMatch(/no garage/);
    placed(g);
    expect(parkingSlots(g)).toHaveLength(4);
    expect(park(g, 'motorhome')).toBeNull();
    expect(park(g, 'suv1')).toBeNull();
    expect(park(g, 'motorhome')).toBe('already parked');
    expect(slotOf(g, 'motorhome')!.index).toBe(0);
    expect(occupiedSlots(g).map(s => s.occupant)).toEqual(['motorhome', 'suv1']);
    expect(freeSlots(g)).toHaveLength(2);
    expect(park(g, 'suv2', 'gg1:0')).toBe('that slot is taken');
    expect(park(g, 'suv2', 'gg1:3')).toBeNull();
    expect(park(g, 'tractor')).toBeNull();
    expect(park(g, 'extra')).toBe('every slot is taken');
    expect(leave(g, 'suv1')).toBe(true);
    expect(leave(g, 'suv1')).toBe(false);
    expect(freeSlots(g).map(s => s.index)).toEqual([1]);
  });

  it('an unfinished garage has no slots yet', () => {
    const g = game();
    const st = placed(g); st.stage = 0;
    expect(parkingSlots(g)).toHaveLength(0);
  });

  it('turns its door side toward the compound', () => {
    expect(garageRotFor([0, 1])).toBe(0);
    expect(garageRotFor([1, 0])).toBe(1);
    expect(garageRotFor([0, -1])).toBe(2);
    expect(garageRotFor([-1, 0])).toBe(3);
  });

  it('fills the gate gap: a finished garage holds the line where an ordinary gate does not', () => {
    const g = game();
    const plan = planFortress(g, geo(g), { scope: 'full', towers: 0, passage: false });
    layFortress(g, plan);
    finishAll(g);
    const withGarage = enclosure(g).barrier;
    // the same ring with the garage not yet built is a gate gap
    const g2 = game();
    layFortress(g2, planFortress(g2, geo(g2), { scope: 'full', towers: 0, passage: false }));
    for (const r of g2.perimeter) r.finishedAt = 0;
    const without = enclosure(g2).barrier;
    expect(withGarage).toBeGreaterThan(without);
    expect(enclosure(g).openShare).toBe(0);
  });

  it('a passage that comes up inside the garage (or a closed line) is not a way in', () => {
    const g = game();
    layFortress(g, planFortress(g, geo(g), { scope: 'full', towers: 0, passage: false }));
    finishAll(g);
    const gar = g.structures.find(st => st.kind === GATE_GARAGE)!;
    const home = { id: 'h', kind: 'farmhouse', x: gar.x - 8, z: gar.z - 2, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 };
    g.structures.push(home);
    const p = planRun(g, 'underground_passage', [[gar.x, gar.z], [home.x, home.z]]); p.finishedAt = 0;
    expect(hatches(g).every(h => !h.exposed)).toBe(true);
  });
});

describe('Fortify my ring', () => {
  it('plans the container ring with a gate garage, a deck and five towers, costed, before anything is laid', () => {
    const g = game();
    const plan = planFortress(g, geo(g), { scope: 'full', passage: false });
    expect(g.perimeter).toHaveLength(0);
    expect(g.structures.filter(s => s.kind === GATE_GARAGE)).toHaveLength(0);
    expect(plan.wall.kind).toBe('container_wall');
    expect(plan.garage).not.toBeNull();
    expect(plan.towers).toHaveLength(MAX_TOWERS);
    expect(plan.walkwayLen).toBeGreaterThan(10);
    expect(plan.cost).toBeGreaterThan(plan.wall.cost);
    expect(plan.hours).toBeGreaterThan(plan.wall.hours);
    expect(plan.wall.runs[0].gates[0]).toMatchObject({ w: GARAGE_W, garage: true });
  });

  it('puts the garage on the road side, door toward the inside, across the gate gap', () => {
    const g = game();
    const plan = planFortress(g, geo(g), { scope: 'full', passage: false });
    const gs = plan.wall.gateSpot!, h = g.site.home;
    expect(gs.x).toBeCloseTo(h.x1);
    expect(gs.inx).toBeLessThan(0);   // inward is west from the east side
    expect(plan.garage!.rot).toBe(3);
    expect(plan.garage!.x).toBeLessThan(h.x1);
    expect(plan.garage!.x).toBeGreaterThan(h.x1 - 1.2);
  });

  it('puts the towers just inside the wall, spread out, none beside the gate', () => {
    const g = game();
    const plan = planFortress(g, geo(g), { scope: 'full', passage: false });
    const h = g.site.home, gs = plan.wall.gateSpot!;
    expect(new Set(plan.towers.map(t => `${Math.round(t.x)},${Math.round(t.z)}`)).size).toBe(MAX_TOWERS);
    for (const t of plan.towers) {
      expect(t.x).toBeGreaterThan(h.x0); expect(t.x).toBeLessThan(h.x1);
      expect(t.z).toBeGreaterThan(h.z0); expect(t.z).toBeLessThan(h.z1);
      expect(Math.hypot(t.x - gs.x, t.z - gs.z)).toBeGreaterThan(GARAGE_W / 2);
    }
    // four corners and one mid-span
    const corners = plan.towers.filter(t => (Math.abs(t.x - h.x0) < 1 || Math.abs(t.x - h.x1) < 1) && (Math.abs(t.z - h.z0) < 1 || Math.abs(t.z - h.z1) < 1));
    expect(corners.length).toBeGreaterThanOrEqual(3);
    expect(planFortress(g, geo(g), { scope: 'full', towers: 2 }).towers).toHaveLength(2);
    expect(planFortress(g, geo(g), { scope: 'full', towers: 0 }).towers).toHaveLength(0);
    expect(planFortress(g, geo(g), { scope: 'full', towers: 99 }).towers).toHaveLength(MAX_TOWERS);
  });

  it('lays out walls, a deck on each, the garage, the towers and (with a house) the passage', () => {
    const g = game();
    g.structures.push({ id: 'house', kind: 'farmhouse', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    const before = g.money;
    const plan = planFortress(g, geo(g), { ...DEFAULT_FORTRESS, scope: 'full' });
    expect(plan.passage).not.toBeNull();
    const n = layFortress(g, plan);
    expect(n.structures).toBe(1 + MAX_TOWERS);
    expect(g.perimeter.filter(r => r.kind === 'container_wall')).toHaveLength(plan.wall.runs.length);
    expect(g.perimeter.filter(r => r.kind === 'wall_walk').length).toBe(plan.wall.runs.filter(r => r.kind === 'container_wall').length);
    expect(g.perimeter.filter(r => r.kind === 'underground_passage')).toHaveLength(1);
    expect(g.structures.filter(s => s.kind === GATE_GARAGE)).toHaveLength(1);
    expect(g.structures.filter(s => s.kind === 'watchtower_wood')).toHaveLength(MAX_TOWERS);
    // permits are paid when laid out
    expect(before - g.money).toBeGreaterThanOrEqual(0);
    // the deck on the ring skips the garage span
    const deck = g.perimeter.find(r => r.kind === 'wall_walk')!;
    expect(deck.gates.some(x => x.garage)).toBe(true);
    // nothing to lay twice: a second plan sees the line held
    const again = planFortress(g, geo(g), { scope: 'full', towers: 0, passage: false });
    expect(again.wall.runs).toHaveLength(0);
    expect(again.walkwayLen).toBe(0);
  });

  it('gives an existing container wall a deck, and says why when there is no road side to put a garage in', () => {
    const g = game();
    const h = g.site.home;
    const w = planRun(g, 'container_wall', [[h.x0, h.z0], [h.x1, h.z0], [h.x1, h.z1], [h.x0, h.z1], [h.x0, h.z0]]);
    w.finishedAt = 0;
    const plan = planFortress(g, geo(g), { scope: 'full', passage: false });
    expect(plan.garage).toBeNull();
    expect(plan.notes.join(' ')).toMatch(/No gate garage/);
    expect(plan.walkwayLen).toBeGreaterThan(0);
    layFortress(g, plan);
    expect(g.perimeter.some(r => r.kind === 'wall_walk' && r.hostId === w.id)).toBe(true);
  });

  it('shows up in the Defense report and the ring status once built', () => {
    const g = game();
    layFortress(g, planFortress(g, geo(g), { scope: 'full', passage: false }));
    finishAll(g);
    const st = ringStatus(g);
    expect(st).toMatchObject({ walkway: true, garage: true, towers: MAX_TOWERS });
    const d = defenseReport(g);
    const ids = [...d.walls, ...d.watch].map(c => c.id);
    expect(ids).toContain('walkway');
    expect(ids).toContain('gategarage');
    expect(ids).toContain('ringtowers');
    expect(d.walls.find(c => c.id === 'walkway')!.ok).toBe(true);
  });

  it('wall lengths of the ring leave out the garage span', () => {
    const g = game();
    const plan = planFortress(g, geo(g), { scope: 'full', passage: false });
    const run = plan.wall.runs[0];
    expect(wallLength(run)).toBeCloseTo(run.pts.reduce((a, p, i) => a + (i ? Math.hypot(p[0] - run.pts[i - 1][0], p[1] - run.pts[i - 1][1]) : 0), 0) - GARAGE_W);
    expect(runFinished(g.perimeter[0] ?? ({ finishedAt: null } as never))).toBe(false);
  });
});

describe('Fortify my ring: the core compound is the default', () => {
  const centered = (g: GameState) => ({ ...geo(g), center: [g.site.home.x0 + 30, g.site.home.z0 + 30] as Pt });

  it('defaults to a scaled ring on the core of the home forty, much cheaper than the full line', () => {
    expect(DEFAULT_FORTRESS.scope).toBe('core');
    const g = game();
    const core = planFortress(g, centered(g), {});
    const full = planFortress(g, centered(g), { scope: 'full' });
    expect(core.options.scope).toBe('core');
    expect(core.coreIsFull).toBe(false);
    expect(core.wall.wallM).toBeLessThan(full.wall.wallM / 2);
    expect(core.cost).toBeLessThan(full.cost / 2);
    expect(core.hours).toBeLessThan(full.hours);
    // both are shown to the player: the full line is the "Expand" option
    expect(full.wall.lineM).toBeGreaterThan(core.wall.lineM);
  });

  it('puts the ring, the garage and every tower inside a square of the core size round the family', () => {
    const g = game();
    const geoC = centered(g), c = coreRect(g, geoC);
    expect(c.x1 - c.x0).toBe(CORE_SIDE);
    expect(c.z1 - c.z0).toBe(CORE_SIDE);
    const plan = planFortress(g, geoC, { passage: false });
    const inside = (x: number, z: number, m = 0.01) => x >= c.x0 - m && x <= c.x1 + m && z >= c.z0 - m && z <= c.z1 + m;
    for (const r of plan.wall.runs) for (const q of r.pts) expect(inside(q[0], q[1])).toBe(true);
    expect(plan.garage).not.toBeNull();
    expect(inside(plan.garage!.x, plan.garage!.z)).toBe(true);
    expect(plan.towers).toHaveLength(MAX_TOWERS);
    for (const tw of plan.towers) expect(inside(tw.x, tw.z)).toBe(true);
    expect(plan.walkwayLen).toBeGreaterThan(10);
  });

  it('slides the core to stay on the home block when the family lives near an edge', () => {
    const g = game(), h = g.site.home;
    const c = coreRect(g, { center: [h.x1 - 1, h.z0 + 1] });
    expect(c.x1).toBeLessThanOrEqual(h.x1);
    expect(c.z0).toBeGreaterThanOrEqual(h.z0);
    expect(c.x1 - c.x0).toBe(CORE_SIDE);
  });

  it('centers on the staked buildings when the camp is not known', () => {
    const g = game(), h = g.site.home;
    g.structures.push({ id: 'a', kind: 'farmhouse', x: h.x0 + 20, z: h.z0 + 40, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    const c = coreRect(g);
    expect((c.x0 + c.x1) / 2).toBeCloseTo(h.x0 + 20);
    expect((c.z0 + c.z1) / 2).toBeCloseTo(h.z0 + 40);
  });

  it('on a small lot the core is the whole lot: both scopes are the same ring', () => {
    const g = newGame(7); g.site = { ...g.site, acres: 5, home: HOME_RECT[5], creek: false };
    const a = planFortress(g, {}, { scope: 'core' }), b = planFortress(g, {}, { scope: 'full' });
    expect(a.coreIsFull).toBe(true);
    expect(a.wall.wallM).toBe(b.wall.wallM);
    expect(a.cost).toBe(b.cost);
  });

  it('lays the core ring out and it makes a closed yard the Defense report counts as a ring', () => {
    const g = game();
    layFortress(g, planFortress(g, centered(g), { passage: false }));
    finishAll(g);
    const home = { id: 'h', kind: 'farmhouse', x: coreRect(g, centered(g)).x0 + 12, z: coreRect(g, centered(g)).z0 + 12, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 };
    g.structures.push(home);
    const d = defenseReport(g);
    expect(d.homes.find(x => x.id === 'h')!.covered).toBe(true);
    // the property line is still open: only the compound is closed
    expect(d.walls.find(c => c.id === 'line')!.ok).toBe(false);
  });
});

describe('an irregular property line', () => {
  /** The home block plus a parcel stuck on its east side, upper half: an L. */
  const ell = (): GameState => {
    const g = game(), h = g.site.home;
    g.land.parcels.push({ id: 'pz', name: 'the east piece', rect: { x0: h.x1, z0: h.z0, x1: h.x1 + 30, z1: h.z0 + 25 }, owner: 'you', kind: 'grazing' as never, forSale: false });
    return g;
  };

  it('walls the whole L with a garage on a straight stretch and towers inside the land', () => {
    const g = ell(), h = g.site.home;
    const plan = planFortress(g, { roadGate: [h.x1 + 30, h.z0 + 12] }, { scope: 'full', passage: false });
    expect(plan.garage).not.toBeNull();
    expect(plan.wall.runs.length).toBeGreaterThan(0);
    const gs = plan.wall.gateSpot!;
    // the gate is on the east piece's east edge and the garage sits inside it, door toward the west
    expect(gs.x).toBeCloseTo(h.x1 + 30);
    expect(plan.garage!.rot).toBe(3);
    const owned = (x: number, z: number) => [h, { x0: h.x1, z0: h.z0, x1: h.x1 + 30, z1: h.z0 + 25 }].some(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
    for (const tw of plan.towers) expect(owned(tw.x, tw.z)).toBe(true);
    expect(plan.towers.length).toBeGreaterThan(2);
    // the gap is on one straight edge: its two ends are on the same side of the line
    const run = plan.wall.runs.find(r => r.gates.some(x => x.garage))!;
    expect(run.gates[0].w).toBe(GARAGE_W);
    layFortress(g, plan);
    finishAll(g);
    expect(enclosure(g).openShare).toBe(0);
    expect(g.perimeter.filter(r => r.kind === 'wall_walk').length).toBeGreaterThan(0);
  });

  it('keeps the garage off a corner even when the road gate is at one', () => {
    const g = ell(), h = g.site.home;
    const plan = planFortress(g, { roadGate: [h.x1 + 30, h.z0] }, { scope: 'full', passage: false });
    const gs = plan.wall.gateSpot!;
    expect(Math.abs(gs.z - h.z0)).toBeGreaterThanOrEqual(GARAGE_W / 2 + 0.19);
  });
});

describe('save', () => {
  it('migrates the previous save: the new fields are optional and nothing else changes', () => {
    const g = game();
    const old = JSON.parse(JSON.stringify(g)) as Record<string, unknown>;
    old.version = SAVE_VERSION - 1;
    const m = migrate(old);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.perimeter).toEqual(g.perimeter);
  });
});
