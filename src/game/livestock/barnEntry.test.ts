import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LivestockRenderer, LOOK } from './LivestockRenderer';
import { entryOf, restSlots, wallDoor, type AnimalGoal, type Home, type StockKind } from './livestockPlan';
import { animalRoute } from '../paths/groundMovers';

/** A barn like the real one: 2 x 3 units, the door at the front (+z when rot is 0), a raised floor, the wall and its pad hard to walk through. */
const BARN: Home = { id: 'b', kind: 'barn', x: 10, z: 0, rot: 0, w: 2, d: 3, depth: 0 };
const FLOOR = 0.03, DOOR_HALF = 0.31;
const house: [number, number] = [8, 6];
const ctxFor = (h: Home) => {
  // the footprint in the home's own frame: lateral l (across the front), s the depth in from the doorway wall (negative: outside)
  const local = (x: number, z: number): { l: number; s: number } => { const w = wallDoor(h); return { l: (x - w.x) * -w.uz + (z - w.z) * w.ux, s: -((x - w.x) * w.ux + (z - w.z) * w.uz) }; };
  const inRect = (x: number, z: number, pad = 0): boolean => { const { l, s } = local(x, z); return Math.abs(l) < h.w / 2 + pad && s > -pad && s < h.d + pad; };
  const hard = (x: number, z: number) => inRect(x, z, 0.14);
  return {
    local, inRect,
    ctx: { ground: () => 0, floor: (x: number, z: number) => (inRect(x, z) ? FLOOR : 0), via: (_k: string, a: [number, number], b: [number, number]) => animalRoute(a, b, hard, undefined, 0.14, 1.3), free: (x: number, z: number) => !hard(x, z) },
  };
};
const at = (hour: number, over = {}) => ({ hour, raided: false, storm: false, house, clock: 5, ...over });
const STOCK = { cow: 5, steer: 3, goat: 4, sheep: 6, pig: 4, rabbit: 3 };

describe('into the barn at dusk, out at dawn', () => {
  it('every animal walks in through the door and rests inside the footprint within a bounded time, never through a wall, never floating', () => {
    const { ctx, local, inRect } = ctxFor(BARN), r = new LivestockRenderer(new THREE.Scene());
    for (let i = 0; i < 1500; i++) r.update(0.1, STOCK, 0, [BARN], at(11), ctx, 1);
    expect(r.animals().every(a => !a.shelter && !a.inside)).toBe(true);
    let through = true, firstAllIn = -1;
    for (let i = 0; i < 2400; i++) {
      r.update(0.1, STOCK, 0, [BARN], at(22.5), ctx, 1);
      for (const a of r.animals()) {
        const { l, s } = local(a.x, a.z);
        // crossing the wall plane: only through the doorway
        if (s > -0.03 && s < 0.08 && Math.abs(l) > DOOR_HALF - LOOK[a.kind].len * 0.12) through = false;
        // inside the footprint but past the doorway lane: never in the side or back wall
        if (s > 0.08 && (Math.abs(l) > BARN.w / 2 - 0.05 || s > BARN.d - 0.05)) through = false;
      }
      if (firstAllIn < 0 && r.animals().every(a => a.inside)) firstAllIn = i;
    }
    expect(through).toBe(true);
    // (240 s of game time at the base pace is more than the longest walk, about 10 units at 0.17 units / s, plus the staggered dusk)
    expect(firstAllIn).toBeGreaterThan(0);
    expect(firstAllIn).toBeLessThan(2400);
    const done = r.animals();
    expect(done).toHaveLength(25);
    for (const a of done) {
      const { l, s } = local(a.x, a.z), half = LOOK[a.kind].len * 0.5;
      expect(inRect(a.x, a.z), `${a.id} inside the footprint`).toBe(true);
      expect(Math.abs(l)).toBeLessThan(BARN.w / 2 - 0.1);
      expect(s).toBeGreaterThan(0.1);
      expect(s).toBeLessThan(BARN.d - half * 0.3);
      expect(a.inside && a.shelter === 'b').toBe(true);
      expect(a.moving).toBe(false);
      expect(a.y).toBeCloseTo(FLOOR, 2);          // on the barn floor, not the yard level and not floating
    }
  });

  it('the door is not a queue: nobody waits outside the wall once the night has long begun', () => {
    const { ctx, local } = ctxFor(BARN), r = new LivestockRenderer(new THREE.Scene());
    for (let i = 0; i < 800; i++) r.update(0.1, STOCK, 0, [BARN], at(11), ctx, 1);
    for (let i = 0; i < 2000; i++) r.update(0.1, STOCK, 0, [BARN], at(23), ctx, 1);
    for (const a of r.animals()) expect(local(a.x, a.z).s, a.id).toBeGreaterThan(0);
  });

  it('they come out again at dawn through the door and are turned out in the paddock', () => {
    const { ctx, local, inRect } = ctxFor(BARN), r = new LivestockRenderer(new THREE.Scene());
    for (let i = 0; i < 1500; i++) r.update(0.1, STOCK, 0, [BARN], at(22.5), ctx, 1);
    expect(r.animals().every(a => a.inside)).toBe(true);
    let through = true;
    for (let i = 0; i < 3000; i++) {
      r.update(0.1, STOCK, 0, [BARN], at(8, { clock: 5 + i * 0.001 }), ctx, 1);
      for (const a of r.animals()) { const { l, s } = local(a.x, a.z); if (s > -0.03 && s < 0.08 && Math.abs(l) > DOOR_HALF - LOOK[a.kind].len * 0.12) through = false; }
    }
    expect(through).toBe(true);
    for (const a of r.animals()) { expect(a.shelter, a.id).toBeNull(); expect(inRect(a.x, a.z), a.id).toBe(false); }
  });

  it('a barn that faces another way works the same (the door and the rest spots turn with it)', () => {
    for (const rot of [1, 2, 3]) {
      const h: Home = { ...BARN, rot }, { ctx, inRect, local } = ctxFor(h), r = new LivestockRenderer(new THREE.Scene());
      for (let i = 0; i < 1000; i++) r.update(0.1, STOCK, 0, [h], at(11), ctx, 1);
      for (let i = 0; i < 2400; i++) r.update(0.1, STOCK, 0, [h], at(22.5), ctx, 1);
      for (const a of r.animals()) { expect(inRect(a.x, a.z), `rot ${rot} ${a.id}`).toBe(true); expect(local(a.x, a.z).s).toBeGreaterThan(0.1); expect(a.inside).toBe(true); }
    }
  });

  it('the hens go into the coop too, and a raid sends everything in at once', () => {
    const coop: Home = { id: 'c', kind: 'chicken_coop', x: 12, z: 6, rot: 0, w: 1, d: 1, depth: 1 }, { ctx, inRect } = ctxFor(coop), r = new LivestockRenderer(new THREE.Scene());
    for (let i = 0; i < 1500; i++) r.update(0.1, {}, 1, [coop], at(23), ctx, 1);
    expect(r.animals().length).toBe(8);
    for (const a of r.animals()) { expect(inRect(a.x, a.z), a.id).toBe(true); expect(a.inside).toBe(true); }
    const { ctx: c2, inRect: in2 } = ctxFor(BARN), r2 = new LivestockRenderer(new THREE.Scene());
    for (let i = 0; i < 600; i++) r2.update(0.1, STOCK, 0, [BARN], at(11), c2, 1);
    for (let i = 0; i < 2000; i++) r2.update(0.1, STOCK, 0, [BARN], at(11, { raided: true }), c2, 1);
    for (const a of r2.animals()) { expect(in2(a.x, a.z), a.id).toBe(true); expect(a.inside).toBe(true); }
  });
});

describe('the rest spots', () => {
  const kinds: StockKind[] = ['cow', 'cow', 'steer', 'goat', 'goat', 'sheep', 'pig'];
  const herd = kinds.map((k, i) => ({ id: `${k}${i}`, kind: k }));
  const goals = (): AnimalGoal[] => herd.map(h => ({ x: 0, z: 0, inside: true, home: 'b', panic: false, across: (herd.indexOf(h) % 5) * 0.1 - 0.2 }));
  it('lie inside the footprint, off the side walls, the front of the barn left clear, no two on the same spot', () => {
    const g = goals();
    restSlots(herd, g, [BARN], k => LOOK[k].len);
    const { local } = ctxFor(BARN);
    for (const [i, x] of g.entries()) {
      const { l, s } = local(x.x, x.z);
      expect(Math.abs(l)).toBeLessThanOrEqual(BARN.w / 2 - 0.12);
      expect(s).toBeGreaterThan(0.3);
      expect(s).toBeLessThan(BARN.d - 0.2);
      for (let j = i + 1; j < g.length; j++) expect(Math.hypot(x.x - g[j].x, x.z - g[j].z)).toBeGreaterThan(0.1);
      expect(x.entry).toEqual(entryOf(BARN, x.across ?? 0, LOOK[herd[i].kind].len));
    }
  });
  it('only the animals that are going in get a spot; the paddock goals are left alone', () => {
    const g = goals(); g[2].inside = false; g[2].x = 3.3; g[2].z = 4.4;
    restSlots(herd, g, [BARN], k => LOOK[k].len);
    expect(g[2]).toMatchObject({ x: 3.3, z: 4.4 });
    expect(g[2].entry).toBeUndefined();
    expect(g[1].entry).toBeDefined();
  });
  it('the door is at the wall, the staging spot clear of it and the inner point inside', () => {
    const w = wallDoor(BARN), en = entryOf(BARN, 0, 0.4);
    expect(Math.hypot(en.door[0] - w.x, en.door[1] - w.z)).toBeLessThan(1e-9);
    expect(Math.hypot(en.stage[0] - w.x, en.stage[1] - w.z)).toBeGreaterThan(0.45);
    expect(Math.hypot(en.inner[0] - BARN.x, en.inner[1] - BARN.z)).toBeLessThan(BARN.d / 2);
  });
});
