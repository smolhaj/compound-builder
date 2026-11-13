/**
 * Cutscene scene prep (movement router) and the breach clip regression.
 *  - prep cost: a heavy raid (savage gang of ten, log palisade, a climbed or rammed wall) is routed without flooding the whole compound: the search effort has a ceiling
 *    far under what the unaided grid search needed (about 6 million cell expansions, 5 to 10 seconds in the game);
 *  - the router's opening graph, its shared lattice and its flood memory give the same kind of answers as before (a way through the gate, none through a wall);
 *  - clips: no raider crosses a wall cell beside a breach, with the renderer's own nudge (a push out of a bush) applied to every raider target.
 */
import { describe, expect, it } from 'vitest';
import { blockedAt, boxWorld, findClips, findPath, keepPush, navStats, type NavWorld } from './cutNav';
import { navFor } from './cutLive';
import { game, scenes, prepared, yardSolid, HOUSE } from './cutFixtures';
import type { Battle } from './battleTypes';

describe('cutNav: the opening graph, the lattice and the flood memory', () => {
  // a long wall at z = 0 with a gate (x 9.8..10.2) and a second wall behind it: a yard
  const wall = [{ x0: -30, z0: -0.1, x1: 9.8, z1: 0.1 }, { x0: 10.2, z0: -0.1, x1: 40, z1: 0.1 }];
  const w = (): NavWorld => boxWorld(wall);
  it('a leg through the gate is routed once by search, and the next ones ride the graph without a flood', () => {
    const world = w();
    const g0 = navStats.grids;
    const first = findPath(world, { x: 0, z: 5 }, { x: 0.5, z: -5 }, 0);
    expect(first).not.toBeNull();
    expect(first!.some(p => Math.abs(p.x - 10) < 0.5 && Math.abs(p.z) < 0.5)).toBe(true);   // through the gate
    const floods = navStats.grids - g0;
    expect(floods).toBeGreaterThan(0);
    const second = findPath(world, { x: 0.3, z: 5.2 }, { x: 0.9, z: -5.3 }, 0);
    expect(second).not.toBeNull();
    expect(navStats.grids - g0, 'the second leg needed another grid search').toBe(floods);
    // the graph's answer is clear all the way
    let p = { x: 0.3, z: 5.2 };
    for (const q of second!) { for (let i = 1; i <= 100; i++) expect(world.solid(p.x + (q.x - p.x) * i / 100, p.z + (q.z - p.z) * i / 100)).toBe(false); p = q; }
  });
  it('a goal on the far side of a wall with no way is refused, and the neighbours of that leg cost no new flood', () => {
    // a closed box: the goal is inside four walls
    const box = boxWorld([{ x0: 4, z0: 4, x1: 8, z1: 4.1 }, { x0: 4, z0: 7.9, x1: 8, z1: 8 }, { x0: 4, z0: 4, x1: 4.1, z1: 8 }, { x0: 7.9, z0: 4, x1: 8, z1: 8 }]);
    expect(findPath(box, { x: 0, z: 0 }, { x: 6, z: 6 }, 0)).toBeNull();
    const e0 = navStats.expanded;
    expect(findPath(box, { x: 0.1, z: 0.05 }, { x: 6.1, z: 5.9 }, 0)).toBeNull();
    expect(navStats.expanded - e0, 'a near-identical leg flooded again').toBeLessThan(2000);
  });
  it('a gap narrower than the grid pitch is still found (the second grid phase)', () => {
    // two walls with a 0.1 gap (0.02 after the body's clearance in a real world; here the boxes are the clearance)
    const world = boxWorld([{ x0: -5, z0: -0.1, x1: 4.97, z1: 0.1 }, { x0: 5.03, z0: -0.1, x1: 15, z1: 0.1 }]);
    const p = findPath(world, { x: 5, z: 2 }, { x: 5.01, z: -2 }, 0);
    expect(p).not.toBeNull();
  });
});

describe('cutNav: a push out of a bush never hops a wall', () => {
  const world = boxWorld([{ x0: -5, z0: -0.05, x1: 5, z1: 0.05 }]);
  it('keeps the plan\'s spot when the push lands across a wall, takes it when it stays on the same side', () => {
    expect(keepPush(world.solid, { x: 0, z: 0.2 }, { x: 0, z: -0.2 })).toEqual({ x: 0, z: 0.2 });
    expect(keepPush(world.solid, { x: 0, z: 0.2 }, { x: 0.15, z: 0.35 })).toEqual({ x: 0.15, z: 0.35 });
    expect(keepPush(world.solid, { x: 0, z: 0.2 }, { x: 0, z: 0.03 })).toEqual({ x: 0, z: 0.2 });   // ends in the wall
  });
});

/** Every raider move / cover target pushed 0.35 to either side of the planned spot, as a bush beside the breach would push it (unless `keepPush` refuses). */
function pushed(b: Battle, solid: (x: number, z: number) => boolean, guard: boolean): Battle {
  const nav = navFor(b, solid);
  const raider = new Set(b.units.filter(u => u.side === 'raider').map(u => u.id));
  const evs = b.events;
  let k = 0;
  const at = new Map(b.units.map(u => [u.id, { x: u.x, z: u.z }]));   // (where each stands: the spot of the leg before)
  return { ...b, events: evs.map((e, i) => {
    if ((e.kind !== 'move' && e.kind !== 'cover') || !raider.has(e.unit)) return e;
    const prev = at.get(e.unit);
    at.set(e.unit, { x: e.x, z: e.z });
    // (a bush pushes one waypoint in three, as a bush beside a breach would; two in a row would be pushed legs between pushed spots)
    if (k++ % 3 !== 0) return e;
    const a = (k * 2.399) % (Math.PI * 2), to = { x: e.x + Math.cos(a) * 0.35, z: e.z + Math.sin(a) * 0.35 };
    const nx = evs.slice(i + 1).find(f => (f.kind === 'move' || f.kind === 'cover') && f.unit === e.unit);
    const p = guard ? keepPush((x, z) => blockedAt(nav, x, z, e.t), { x: e.x, z: e.z }, to, prev, nx && (nx.kind === 'move' || nx.kind === 'cover') ? { at: { x: nx.x, z: nx.z }, solid: (x, z) => blockedAt(nav, x, z, nx.t) } : undefined) : to;
    return { ...e, x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 };
  }) };
}

describe('breach clips: raiders only go through real openings, also with the renderer\'s own nudges', () => {
  const WALLS = ['log_palisade', 'container_wall'];
  for (const wall of WALLS) for (const seed of [3, 8, 12]) {
    it(`${wall}, savage gang, seed ${seed}: zero clipped steps through the breach, and no carve frees a wall cell outside its own gap`, () => {
      const { g, battles } = scenes(seed, 2.25, 'gang', 10, 'savage', wall);
      const solid = yardSolid(g, [HOUSE], 0.012);
      let carves = 0, pushRaw = 0, pushGuarded = 0;
      for (const b of battles) {
        const out = prepared(b, g, seed * 17);
        const nav = navFor(out, solid);
        expect(findClips(out, nav), `${wall} s${seed}`).toEqual([]);
        // every carve is centred on the wall it opens (a breach that does not sit on the wall would free the wrong cells)
        for (const c of nav.carves) {
          carves++;
          const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
          let near = false;
          for (let dx = -0.4; dx <= 0.4 && !near; dx += 0.05) for (let dz = -0.4; dz <= 0.4 && !near; dz += 0.05) if (solid(cx + dx, cz + dz)) near = true;
          expect(near, `a carve at ${cx.toFixed(2)}, ${cz.toFixed(2)} is not on a wall`).toBe(true);
        }
        // the same plan with every raider target nudged 0.35 across the wall clips; with the renderer's guard it does not
        const raiderClips = (x: Battle) => findClips(x, navFor(x, solid)).filter(c => out.units.find(u => u.id === c.unit)?.side === 'raider').length;
        const raw = raiderClips(pushed(out, solid, false)), guarded = raiderClips(pushed(out, solid, true));
        pushRaw += raw; pushGuarded += guarded;
      }
      void carves;
      expect(pushGuarded, `raiders' own nudges: ${pushRaw} clips unguarded, ${pushGuarded} guarded`).toBeLessThanOrEqual(Math.floor(pushRaw / 4));
    }, 120000);
  }
});

describe('scene prep cost (generous: the unaided search took ~6M expansions and 5 to 10 s in the game)', () => {
  it('a savage gang of ten at a log palisade is routed within a bounded search', () => {
    const { g, battles } = scenes(3, 2.25, 'gang', 10, 'savage', 'log_palisade');
    const e0 = navStats.expanded, t0 = performance.now();
    for (const b of battles) prepared(b, g, 3 * 17);
    const ms = performance.now() - t0, exp = navStats.expanded - e0;
    expect(exp, `expansions ${exp}`).toBeLessThan(3_000_000);
    expect(ms, `prep ${Math.round(ms)} ms`).toBeLessThan(25_000);
  }, 120000);
  it('the fixture game still builds (smoke)', () => { expect(game(1, 2.25).perimeter.length).toBeGreaterThan(0); });
});
