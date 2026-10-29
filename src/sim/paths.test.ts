import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { migrate } from './save/migrations';
import { MATERIALS } from './materials';
import {
  HIDDEN_WEAR, LAID_KINDS, PATH_WIDTH, billPrice, canLay, doorOf, edgeKey, householdOf, laidBill, layPaths, layProblem, newPaths, pathNodes, pathsOf, pickUpPath, roleOf,
  surfaceOfWear, tripsBetween, tripsToHub, walkFactor, wearOf, type PathNode,
} from './paths';

const finished = (kind: string, x: number, z: number, rot = 0, at = 0) => ({ id: 's_' + kind + x, kind, x, z, rot, stage: 99, done: 0, supplied: true, finishedAt: at as number | null });

describe('what each stop is for', () => {
  it('knows the pieces, and sorts new ones by category', () => {
    expect(roleOf('farmhouse')).toBe('home');
    expect(roleOf('cottage')).toBe('guest');
    expect(roleOf('outhouse')).toBe('privy');
    expect(roleOf('well_hand')).toBe('water');
    expect(roleOf('chicken_coop')).toBe('coop');
    expect(roleOf('watchtower_wood')).toBe('tower');
    expect(roleOf('bunker_hatch')).toBe('hatch');
    expect(roleOf('some_new_shop')).toBe('other');
  });
  it('the door is out the front (+z) of the footprint, turned with the building', () => {
    const [x0, z0] = doorOf({ kind: 'farmhouse', x: 10, z: 10, rot: 0 });
    expect(x0).toBeCloseTo(10); expect(z0).toBeGreaterThan(10 + 1);
    const [x1, z1] = doorOf({ kind: 'farmhouse', x: 10, z: 10, rot: 1 });
    expect(x1).toBeGreaterThan(10 + 1); expect(z1).toBeCloseTo(10);
    const [x2, z2] = doorOf({ kind: 'farmhouse', x: 10, z: 10, rot: 2 });
    expect(x2).toBeCloseTo(10); expect(z2).toBeLessThan(10 - 1);
  });
});

describe('the stops of a place', () => {
  it('lists finished structures with their doors and ages, plus the camp, yard and creek; skips what is unfinished, unplaced or below ground', () => {
    const g = newGame(3, 105, 2027, {});
    g.structures = [finished('farmhouse', 20, 20), { ...finished('barn', 30, 20), stage: 0, finishedAt: null }, { ...finished('well_hand', 25, 25), unplaced: true }, finished('bunker_dorm', 22, 22), finished('bunker_hatch', 24, 18)];
    g.clock.t = 100;
    const nodes = pathNodes(g, { camp: { x: 15, z: 15 }, yard: { x: 17, z: 17 }, creek: { x: 5, z: 5 } });
    expect(nodes.map(n => n.id).sort()).toEqual(['camp', 's_bunker_hatch24', 's_farmhouse20', 'yard', 'creek'].sort());
    expect(nodes.find(n => n.role === 'hatch')!.hidden).toBe(true);
    expect(nodes.find(n => n.id === 'camp')!.ring).toBeGreaterThan(1);
  });
  it('what came with the land is older than the game', () => {
    const g = newGame(3, 105, 2027, {});
    g.structures = [{ ...finished('farmhouse', 20, 20), pre: true }];
    g.site.improvements.house = { kind: 'farmhouse', built: 1960, roof: 'good', wiring: 'good', plumbing: 'good' };
    expect(pathNodes(g)[0].since).toBeLessThan(-365 * 30);
  });
});

describe('who walks', () => {
  const base = () => householdOf(newGame(3, 105, 2027, {}));
  it('the household is counted from the people', () => {
    const h = base();
    expect(h.people).toBeGreaterThanOrEqual(3);
    expect(h.adults + h.kids).toBe(h.people);
  });
  it('more people mean more trips to the well and the privy; a flush toilet empties the path to the privy', () => {
    const h = base();
    const big = { ...h, people: h.people * 2 };
    expect(tripsToHub('water', big)).toBeGreaterThan(tripsToHub('water', h));
    expect(tripsToHub('privy', { ...h, plumbed: true })).toBeLessThan(tripsToHub('privy', { ...h, plumbed: false }) / 3);
  });
  it('the garden is walked daily in the growing season and a trip or two out of it', () => {
    const h = base();
    expect(tripsToHub('garden', { ...h, growing: true })).toBeGreaterThan(tripsToHub('garden', { ...h, growing: false }) * 3);
  });
  it('animals draw the family to the barn; the hub has no walk to itself', () => {
    const h = base();
    expect(tripsToHub('barn', { ...h, animals: 6 })).toBeGreaterThan(tripsToHub('barn', { ...h, animals: 0 }));
    expect(tripsToHub('home', h)).toBe(0);
    expect(tripsBetween('barn', 'coop', h)).toBeGreaterThan(0);
    expect(tripsBetween('barn', 'barn', h)).toBe(0);
  });
});

describe('wear', () => {
  it('grows with trips and with days, and never past one', () => {
    let prev = 0;
    for (let d = 0; d <= 3000; d += 30) { const w = wearOf(6, d); expect(w).toBeGreaterThanOrEqual(prev); expect(w).toBeLessThanOrEqual(1); prev = w; }
    expect(wearOf(0, 500)).toBe(0);
    expect(wearOf(6, 0)).toBe(0);
    expect(wearOf(12, 100)).toBeGreaterThan(wearOf(2, 100));
  });
  it('a busy walk shows as a trampled line in a few weeks and is a bare track within a season; a rare one takes years', () => {
    expect(surfaceOfWear(wearOf(12, 2))).toBe('none');
    expect(surfaceOfWear(wearOf(12, 21))).toBe('desire');
    expect(surfaceOfWear(wearOf(12, 120))).toBe('dirt');
    expect(surfaceOfWear(wearOf(0.5, 120))).toBe('none');
    expect(surfaceOfWear(wearOf(0.5, 3 * 365))).not.toBe('none');
  });
});

describe('underfoot', () => {
  const dry = { mud: 0, snow: 0, rain: 0 }, mud = { mud: 1, snow: 0, rain: 0.3 }, snow = { mud: 0, snow: 1, rain: 0 };
  it('is a little quicker on a path, and the better the surface the quicker', () => {
    expect(walkFactor(null, dry)).toBe(1);
    for (const s of ['desire', 'dirt', 'gravel', 'stones', 'boards', 'paved'] as const) expect(walkFactor(s, dry)).toBeGreaterThan(1);
    expect(walkFactor('paved', dry)).toBeGreaterThan(walkFactor('dirt', dry));
    expect(walkFactor('dirt', dry)).toBeGreaterThan(walkFactor('desire', dry));
  });
  it('mud and snow slow the way off the paths, and a laid walk keeps its pace', () => {
    expect(walkFactor(null, mud)).toBeLessThan(0.9);
    expect(walkFactor(null, snow)).toBeLessThan(0.95);
    expect(walkFactor('dirt', mud)).toBeLessThan(walkFactor('dirt', dry));
    expect(walkFactor('boards', mud)).toBeGreaterThan(walkFactor(null, mud) * 1.15);
    expect(walkFactor('gravel', mud)).toBeGreaterThan(1);
  });
  it('is a small effect: always within 0.8 and 1.12', () => {
    for (const s of [null, 'desire', 'dirt', 'gravel', 'stones', 'boards', 'paved'] as const) for (const mu of [0, 0.5, 1, 3]) for (const sn of [0, 1]) for (const r of [0, 1, 5]) {
      const f = walkFactor(s, { mud: mu, snow: sn, rain: r });
      expect(f).toBeGreaterThanOrEqual(0.8); expect(f).toBeLessThanOrEqual(1.12);
    }
  });
  it('a path is wider the better it is', () => {
    expect(PATH_WIDTH.paved).toBeGreaterThan(PATH_WIDTH.gravel);
    expect(PATH_WIDTH.gravel).toBeGreaterThan(PATH_WIDTH.dirt);
    expect(PATH_WIDTH.dirt).toBeGreaterThan(PATH_WIDTH.desire);
  });
});

describe('laying a walk', () => {
  const game = () => { const g = newGame(3, 105, 2027, {}); g.stock.fieldstone = 10; g.stock.lumber = 10; g.stock.concrete = 10; return g; };
  it('costs real materials that grow with the length, and something for even a short walk', () => {
    for (const k of LAID_KINDS) {
      const short = laidBill(k, 1), long = laidBill(k, 200);
      for (const m of Object.keys(long) as Array<keyof typeof long>) { expect(long[m]!).toBeGreaterThan(short[m]!); expect(short[m]!).toBeGreaterThanOrEqual(0.25); }
    }
    expect(Object.keys(laidBill('boards', 30))).toEqual(['lumber']);
    expect(billPrice(laidBill('gravel', 60))).toBeGreaterThan(0);
    // modest: a 60 m gravel walk is a few hundred dollars, not thousands
    expect(billPrice(laidBill('gravel', 60))).toBeLessThan(2500);
    expect(MATERIALS.fieldstone.price).not.toBeNull();
  });
  it('takes the materials from the stock, records the walk and replaces one laid before', () => {
    const g = game();
    expect(layPaths(g, [{ a: 'x', b: 'y', lenM: 40 }], 'gravel')).toBeNull();
    expect(g.stock.fieldstone).toBeLessThan(10);
    expect(pathsOf(g).laid).toHaveLength(1);
    expect(layPaths(g, [{ a: 'y', b: 'x', lenM: 40 }], 'stones')).toBeNull();
    expect(pathsOf(g).laid).toHaveLength(1);
    expect(pathsOf(g).laid[0].kind).toBe('stones');
    pickUpPath(g, 'x', 'y');
    expect(pathsOf(g).laid).toHaveLength(0);
  });
  it('says what is missing and changes nothing when the stock is short', () => {
    const g = game(); g.stock.lumber = 0;
    expect(layProblem(g, [{ a: 'x', b: 'y', lenM: 40 }], 'boards')).toMatch(/Waiting for .*lumber/i);
    const before = JSON.stringify(g.stock);
    expect(layPaths(g, [{ a: 'x', b: 'y', lenM: 40 }], 'boards')).not.toBeNull();
    expect(JSON.stringify(g.stock)).toBe(before);
    expect(pathsOf(g).laid).toHaveLength(0);
    expect(layProblem(g, [], 'gravel')).toBe('nothing to lay');
  });
  it('concrete only joins the main buildings, and nothing is laid to a hidden hatch', () => {
    const n = (role: PathNode['role'], hidden = false): PathNode => ({ id: role, kind: 'x', role, x: 0, z: 0, ax: 0, az: 0, since: 0, ...(hidden ? { hidden } : {}) });
    expect(canLay('paved', n('home'), n('work'))).toBe(true);
    expect(canLay('paved', n('home'), n('garden'))).toBe(false);
    expect(canLay('gravel', n('home'), n('garden'))).toBe(true);
    expect(canLay('gravel', n('home'), n('hatch', true))).toBe(false);
    expect(HIDDEN_WEAR).toBeLessThan(0.5);
  });
  it('edge keys do not care about order', () => { expect(edgeKey('b', 'a')).toBe(edgeKey('a', 'b')); });
});

describe('saves', () => {
  it('a version 54 save loads with no laid walks, and a new game has none', () => {
    const g = newGame(1);
    const old = JSON.parse(JSON.stringify(g)) as Record<string, unknown>;
    old.version = 54; delete old.paths;
    const back = migrate(old);
    expect(back.paths).toEqual(newPaths());
    expect(pathsOf(newGame(2)).laid).toEqual([]);
  });
});
