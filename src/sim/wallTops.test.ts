import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { BLUEPRINTS } from './blueprints';
import { PERIMETER, peopleBlock, planRun, type Pt } from './perimeter';
import { addRazor, razorProblem } from './razor';
import { postureOf } from './encounters';
import { gearPosture } from './gear';
import {
  WALL_TOP, addBackup, addElectric, electricMetres, electricProblem, growthSeason, liveMetres, topBonus, topClimb, topLive, trimAll, trimRun, wallTopPosture, wallTopsDay,
  weakPenalty, weakSpots, climbPenaltyK, brushOf,
} from './wallTops';
import { migrate } from './save/migrations';
import { SAVE_VERSION } from './state';

const game = (seed = 7): GameState => { const g = newGame(seed); g.site = { ...g.site, creek: false }; return g; };
const wall = (g: GameState, kind: 'container_wall' | 'stone_wall' | 'chain_link' | 'steel_wall' = 'stone_wall', pts: Pt[] = [[20, 20], [40, 20]]) => {
  const r = planRun(g, kind, pts, [], 0, true);
  r.finishedAt = 0; r.done = r.hours; r.supplied = true;
  return r;
};
const stock = (g: GameState) => { g.stock.wire = 99; g.stock.cable = 99; g.stock.hardware = 99; g.money = 50000; };
const built = (g: GameState, kind: string, x: number, z: number): Structure => { const st = { id: `s${g.nextId++}`, kind, x, z, rot: 0, stage: BLUEPRINTS[kind]?.stages.length ?? 5, done: 0, supplied: true, finishedAt: 0 } as Structure; g.structures.push(st); return st; };
/** Power: the county grid is up. */
const gridOn = (g: GameState) => { g.utilities.grid = true; g.disaster.tracks.grid = 1; g.utilities.lit = []; };
const gridOff = (g: GameState) => { g.utilities.grid = true; g.disaster.tracks.grid = 0; g.utilities.lit = []; };

describe('the electric fence on the wall top', () => {
  it('needs a finished wall that can carry it, the materials and the cash', () => {
    const g = game(); stock(g);
    const r = planRun(g, 'stone_wall', [[20, 20], [40, 20]], [], 0, true);
    expect(electricProblem(g, r)).toMatch(/not finished/);
    r.finishedAt = 0;
    g.stock.wire = 0;
    expect(electricProblem(g, r)).toMatch(/waiting for/);
    g.stock.wire = 99; g.money = 10;
    expect(electricProblem(g, r)).toMatch(/\$/);
    g.money = 5000;
    expect(electricProblem(g, r)).toBeNull();
    const h = wall(g, 'steel_wall');
    expect(electricProblem(g, h)).toMatch(/own wire/);
  });

  it('is never on the same run as razor wire, in either order', () => {
    const g = game(); stock(g); g.stock.wire = 99;
    const a = wall(g, 'container_wall', [[20, 22], [40, 22]]), b = wall(g, 'container_wall', [[20, 30], [40, 30]]);
    expect(addElectric(g, a.id, false)).toBeNull();
    expect(razorProblem(g, a)).toMatch(/electric fence/);
    expect(addRazor(g, b.id)).toBeNull();
    expect(electricProblem(g, b)).toMatch(/razor/);
  });

  it('is live on mains, dark in an outage, and the battery backup rides out BACKUP_DAYS of it', () => {
    const g = game(); stock(g);
    const a = wall(g, 'stone_wall', [[20, 22], [40, 22]]), b = wall(g, 'stone_wall', [[20, 30], [40, 30]]);
    addElectric(g, a.id, false); addElectric(g, b.id, true);
    gridOn(g);
    wallTopsDay(g);
    expect(topLive(g, a)).toBe(true); expect(topLive(g, b)).toBe(true);
    gridOff(g);
    g.clock.t += 1; wallTopsDay(g);
    expect(a.darkSince).toBeDefined();
    expect(topLive(g, a)).toBe(false);
    expect(topLive(g, b)).toBe(true);                      // on its battery
    g.clock.t += WALL_TOP.ELECTRIC.BACKUP_DAYS + 0.5; wallTopsDay(g);
    expect(topLive(g, b)).toBe(false);                      // flat
    gridOn(g); g.clock.t += 1; wallTopsDay(g);
    expect(b.darkSince).toBeUndefined(); expect(topLive(g, b)).toBe(true);
  });

  it('adds to what the run stops only while live, a little while dark, and never takes away', () => {
    const g = game(); stock(g);
    const r = wall(g, 'stone_wall');
    const base = peopleBlock(g, r);
    addElectric(g, r.id, false);
    gridOn(g);
    const live = peopleBlock(g, r);
    gridOff(g);
    const dark = peopleBlock(g, r);
    expect(live).toBeGreaterThan(base);
    expect(dark).toBeGreaterThanOrEqual(base);
    expect(dark).toBeLessThan(live);
    expect(live).toBeLessThanOrEqual(WALL_TOP.ELECTRIC.CAP);
  });

  it('a live fence in brush loses part of its stop and its shock; a trim gives it back', () => {
    const g = game(); stock(g); gridOn(g);
    const r = wall(g, 'stone_wall');
    addElectric(g, r.id, false);
    const clean = topBonus(g, r, 0.94), cleanHaz = topClimb(g, r).hazards[0].p;
    r.brush = 1;
    expect(topBonus(g, r, 0.94)).toBeLessThan(clean);
    expect(topClimb(g, r).hazards[0].p).toBeLessThan(cleanHaz);
    expect(trimRun(g, r.id)).toBeNull();
    expect(topBonus(g, r, 0.94)).toBe(clean);
  });

  it('shocks and slows a climber only while live; razor snags and slows; a plain wall does neither', () => {
    const g = game(); stock(g);
    const e = wall(g, 'stone_wall', [[20, 22], [40, 22]]), z = wall(g, 'stone_wall', [[20, 30], [40, 30]]), p = wall(g, 'stone_wall', [[20, 36], [40, 36]]);
    addElectric(g, e.id, false); addRazor(g, z.id);
    gridOn(g);
    expect(topClimb(g, e).hazards.length).toBe(1); expect(topClimb(g, e).climb).toBeLessThan(1);
    expect(topClimb(g, z).hazards.length).toBe(1); expect(topClimb(g, z).climb).toBeLessThan(1);
    expect(topClimb(g, p)).toEqual({ climb: 1, hazards: [] });
    gridOff(g);
    expect(topClimb(g, e).hazards.length).toBe(0);
    expect(topClimb(g, e).climb).toBeLessThan(1);             // dark wires are still a nuisance, a little
    expect(topClimb(g, e).climb).toBeGreaterThan(topClimb(g, z).climb - 0.2);
  });

  it('a live fence of 30 m or more is an alarm and its signs deter opportunists; dark, it is neither', () => {
    const g = game(); stock(g);
    const r = wall(g, 'stone_wall', [[20, 20], [40, 20]]);
    addElectric(g, r.id, false);
    gridOn(g);
    expect(liveMetres(g)).toBeGreaterThanOrEqual(WALL_TOP.ELECTRIC.MIN_M);
    const live = wallTopPosture(g);
    expect(live.detection).toBe(WALL_TOP.ELECTRIC.DETECT);
    expect(live.signsDeter).toBeGreaterThan(0);
    gridOff(g);
    expect(wallTopPosture(g).detection).toBe(0);
    expect(electricMetres(g)).toBeGreaterThan(0);
  });

  it('the gate sees the alarm in `detection` and the signs in `signs` (never in `deter`, which the organized crews read)', () => {
    const g = game(); stock(g); gridOn(g);
    const none = gearPosture(g, 2);
    const r = wall(g, 'stone_wall', [[20, 20], [60, 20]]);
    addElectric(g, r.id, false);
    const withFence = gearPosture(g, 2);
    expect(withFence.detection).toBeGreaterThan(none.detection);
    expect(withFence.signs).toBeGreaterThan(0);
    expect(withFence.deter).toBe(none.deter);
    expect(postureOf(g).signs).toBe(withFence.signs);
  });

  it('a home install without the county is uncertified, and a certified one costs more than an uncertified one', () => {
    const g = game(); stock(g);
    const a = wall(g, 'stone_wall', [[20, 22], [40, 22]]);
    const m0 = g.money; addElectric(g, a.id, false);
    const certified = m0 - g.money;
    const h = game(); stock(h); h.disaster.tracks.law = 0; h.disaster.tracks.banks = 0;
    const b = wall(h, 'stone_wall', [[20, 22], [40, 22]]);
    const m1 = h.money; addElectric(h, b.id, false);
    expect(b.noCert).toBe(true);
    expect(m1 - h.money).toBeLessThan(certified);
  });

  it('a backup can be added later, once', () => {
    const g = game(); stock(g);
    const r = wall(g);
    addElectric(g, r.id, false);
    expect(addBackup(g, r.id)).toBeNull();
    expect(r.backup).toBe(true);
    expect(addBackup(g, r.id)).toMatch(/already/);
  });
});

describe('weak spots and brush', () => {
  it('a house within a step of a wall is a weak spot; towers, the yard and a far barn are not', () => {
    const g = game();
    const r = wall(g, 'stone_wall', [[20, 20], [40, 20]]);
    built(g, 'timber_cabin', 30, 20.6);           // against the wall
    built(g, 'timber_cabin', 30, 33);             // far
    built(g, 'watchtower_wood', 25, 20.5);        // a defense, not a way over
    const spots = weakSpots(g);
    expect(spots.filter(s => s.kind === 'building').length).toBe(1);
    expect(weakPenalty(g, r)).toBeGreaterThan(0);
    expect(weakPenalty(g, r)).toBeLessThanOrEqual(WALL_TOP.WEAK.MAX);
    expect(climbPenaltyK(g, r)).toBeGreaterThan(1);
  });

  it('a ground-level fence has no weak spots; a lot with none has no penalty', () => {
    const g = game();
    const r = planRun(g, 'split_rail', [[20, 20], [40, 20]], [], 0, true); r.finishedAt = 0;
    built(g, 'timber_cabin', 30, 20.5);
    expect(weakPenalty(g, r)).toBe(0);
    const w = wall(g, 'stone_wall', [[20, 50], [40, 50]]);
    expect(weakPenalty(g, w)).toBe(0);
  });

  it('trees within reach of a wall are weak spots; felled trees are not', () => {
    const g = game();
    wall(g, 'stone_wall', [[20, 20], [40, 20]]);
    const trees = [{ id: 1, x: 30, z: 20.3, scale: 1 }, { id: 2, x: 30, z: 26, scale: 1 }, { id: 3, x: 32, z: 20.2, scale: 1 }];
    expect(weakSpots(g, trees).filter(s => s.kind === 'tree').map(s => s.id)).toEqual([1, 3]);
    g.forestry.cleared.push(1);
    expect(weakSpots(g, trees).filter(s => s.kind === 'tree').map(s => s.id)).toEqual([3]);
  });

  it('brush grows in the growing season, not in winter, and past OVERGROWN it is a weak spot and a warning', () => {
    const g = game();
    const r = wall(g);
    g.clock.startDoy = 1; g.clock.t = 10;                      // January
    for (let i = 0; i < 20; i++) { g.clock.t += 1; wallTopsDay(g); }
    expect(brushOf(r)).toBe(0);
    g.clock.t = 119; let said = 0;                              // end of April on
    for (let i = 0; i < 200; i++) { g.clock.t += 1; said += wallTopsDay(g).filter(l => /Brush has grown/.test(l)).length; }
    expect(brushOf(r)).toBeGreaterThan(WALL_TOP.BRUSH.OVERGROWN);
    expect(said).toBe(1);
    expect(weakSpots(g).some(s => s.kind === 'brush')).toBe(true);
    expect(growthSeason(1)).toBe(0); expect(growthSeason(190)).toBeGreaterThan(0.9);
  });

  it('brush shades the cameras (and only the cameras); a trim gives the detection back', () => {
    const g = game(); gridOn(g); g.stock.cameras = 1;
    const r = wall(g);
    const clean = gearPosture(g, 2).detection;
    r.brush = 1;
    expect(gearPosture(g, 2).detection).toBeLessThan(clean);
    trimAll(g);
    expect(gearPosture(g, 2).detection).toBe(clean);
    g.stock.cameras = 0; r.brush = 1;
    expect(gearPosture(g, 2).detection).toBe(gearPosture({ ...g, perimeter: [] } as GameState, 2).detection);
  });

  it('weak spots cost the compound ring some barrier, and a trim or a felled tree gives it back', () => {
    const g = game();
    for (const [a, b] of [[[20, 20], [60, 20]], [[60, 20], [60, 60]], [[60, 60], [20, 60]], [[20, 60], [20, 20]]] as Pt[][]) wall(g, 'stone_wall', [a, b]);
    const clean = postureOf(g).barrier;
    built(g, 'timber_cabin', 40, 20.6);
    const weak = postureOf(g).barrier;
    expect(weak).toBeLessThan(clean);
  });
});

describe('peacetime law', () => {
  it('razor wire in a strict county while the law works is ordered down once, with a fine; then it cannot be hung again until the law is gone', () => {
    const g = game(); stock(g);
    g.site = { ...g.site, region: 'pnw' };
    const r = wall(g, 'stone_wall');
    addRazor(g, r.id);
    let said = '';
    for (let i = 0; i < 4000 && !r.razorOrdered; i++) { g.clock.t += 1; said += wallTopsDay(g).join(' '); }
    expect(r.razorOrdered).toBe(true);
    expect(r.razor).toBeUndefined();
    expect(said).toMatch(/razor/);
    expect(razorProblem(g, r)).toMatch(/county ordered/);
    g.disaster.tracks.law = 0;
    expect(razorProblem(g, r) ?? '').not.toMatch(/county ordered/);
  });
});

describe('old saves', () => {
  it('a run with none of the new fields behaves as before, and the migration chain still ends at the current version', () => {
    const g = game();
    const r = wall(g, 'stone_wall');
    expect(r.electric).toBeUndefined(); expect(brushOf(r)).toBe(0);
    expect(peopleBlock(g, r)).toBe(PERIMETER.stone_wall.blocks.people);
    expect(migrate(JSON.parse(JSON.stringify({ ...g })) as unknown).version).toBe(SAVE_VERSION);
  });
});
