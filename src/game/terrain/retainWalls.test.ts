import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RW, planPad, wallAt, type Rect } from '../../sim/retainPlan';
import { RetainWallLayer, wallGeometry } from './RetainWalls';
import { crossesHard, walkRoute } from '../paths/walkRoute';
import { inStair } from '../../sim/retainPlan';

const fp: Rect = { x0: -0.75, z0: -0.75, x1: 0.75, z1: 0.75 };
const natural = (_x: number, z: number) => 10 - 0.25 * z;
const plan = planPad(fp, natural);
/** The terrain as the world draws it: the pad flat inside its rect, the natural ground beyond the short skirt. */
const ground = (x: number, z: number): number => {
  const d = Math.max(plan.rect.x0 - x, x - plan.rect.x1, plan.rect.z0 - z, z - plan.rect.z1, 0);
  if (d >= plan.skirt) return natural(x, z);
  const t = d / plan.skirt, k = 1 - t * t * (3 - 2 * t);
  return natural(x, z) + (plan.y - natural(x, z)) * k;
};
const tris = (g: THREE.BufferGeometry) => g.attributes.position.count / 3;

describe('retaining wall geometry', () => {
  it('has nothing before the foundation work starts, and grows with it', () => {
    expect(wallGeometry(plan, 0, ground, 1, 'near')).toBeNull();
    const half = wallGeometry(plan, 0.5, ground, 1, 'near')!, full = wallGeometry(plan, 1, ground, 1, 'near')!;
    half.computeBoundingBox(); full.computeBoundingBox();
    expect(half.boundingBox!.max.y).toBeLessThan(full.boundingBox!.max.y);
    expect(tris(full)).toBeGreaterThan(tris(half));
  });

  it('stands as high as the plan says: the cut wall tops out at the ground above the pad, the fill wall is footed at the ground below it', () => {
    const g = wallGeometry(plan, 1, ground, 1, 'near')!;
    g.computeBoundingBox();
    const top = g.boundingBox!.max.y, bot = g.boundingBox!.min.y;
    expect(top).toBeGreaterThan(plan.y + plan.maxH * 0.9);
    expect(top).toBeLessThan(plan.y + plan.maxH + 0.06);       // the coping is a hand above the ground
    expect(bot).toBeLessThan(plan.y - plan.maxH * 0.9);
    expect(bot).toBeGreaterThan(plan.y - plan.maxH - 0.14);    // footed a little below the ground, never hanging in the air
  });

  it('has colours and normals, no uvs, and a sane size; the far version is a good deal lighter and keeps the stairs', () => {
    const near = wallGeometry(plan, 1, ground, 1, 'near')!, far = wallGeometry(plan, 1, ground, 1, 'far')!;
    expect(near.getAttribute('color')).toBeTruthy();
    expect(near.getAttribute('normal')).toBeTruthy();
    expect(near.getAttribute('uv')).toBeUndefined();
    expect(tris(near)).toBeGreaterThan(500);
    expect(tris(near)).toBeLessThan(40000);
    expect(tris(far)).toBeLessThan(tris(near) / 2);
    expect(plan.stairs.length).toBeGreaterThan(0);
    // a stair stands only once the wall is whole
    const unfinished = wallGeometry(plan, 0.875, ground, 1, 'far')!;
    expect(tris(far)).toBeGreaterThan(tris(unfinished) - 1);
  });

  it('is the same wall for the same seed and a different heap for another', () => {
    const a = wallGeometry(plan, 1, ground, 5, 'near')!, b = wallGeometry(plan, 1, ground, 5, 'near')!, c = wallGeometry(plan, 1, ground, 6, 'near')!;
    expect(Array.from(a.attributes.position.array.slice(0, 60))).toEqual(Array.from(b.attributes.position.array.slice(0, 60)));
    expect(Array.from(a.attributes.position.array.slice(0, 60))).not.toEqual(Array.from(c.attributes.position.array.slice(0, 60)));
  });
});

describe('the wall layer', () => {
  it('draws one mesh per wall and level of detail, swaps them with the camera, and builds a couple a frame', () => {
    const layer = new RetainWallLayer();
    layer.set('a', plan, 1, 1);
    layer.set('b', planPad({ x0: 4, z0: 4, x1: 5.5, z1: 5.5 }, natural), 1, 2);
    expect(layer.count).toBe(2);
    layer.update(new THREE.Vector3(0, 5, 0), 'high', ground, 0.5);
    const meshes = layer.group.children as THREE.Mesh[];
    expect(meshes.length).toBe(4);
    const vis = (n: string) => meshes.filter(m => m.name.endsWith(n) && m.visible).length;
    expect(vis('_near')).toBeGreaterThan(0);
    layer.update(new THREE.Vector3(200, 5, 200), 'high', ground, 0.5);
    expect(vis('_near')).toBe(0);
    expect(vis('_far')).toBe(2);
    layer.dispose();
  });

  it('stops a walk at a finished wall but not at a stair, and not while the wall is only begun', () => {
    const layer = new RetainWallLayer();
    layer.set('a', plan, 0.25);
    const north = plan.runs[0];
    const [px, pz] = north.pts[Math.floor(north.pts.length / 4)];
    const onWall = (x: number, z: number) => layer.blocks(x, z - RW.SKIRT / 2);
    expect(onWall(px, pz)).toBe(false);
    const v0 = layer.version;
    layer.set('a', plan, 1);
    expect(layer.version).toBe(v0 + 1);
    // somewhere along the cut wall that is not at the stair
    let hit = 0;
    for (const [x, z] of north.pts) if (wallAt(plan, x, z - RW.SKIRT / 2) >= RW.BARRIER_H && onWall(x, z)) hit++;
    expect(hit).toBeGreaterThan(north.pts.length / 2);
    const s = plan.stairs[0];
    expect(layer.atStair(s.x + s.dx * 0.05, s.z + s.dz * 0.05)).toBe(true);
    expect(layer.blocks(s.x + s.dx * 0.05, s.z + s.dz * 0.05)).toBe(false);
    expect(layer.stairs().length).toBe(plan.stairs.length);
    layer.remove('a');
    expect(layer.count).toBe(0);
    expect(layer.blocks(px, pz)).toBe(false);
  });
});

describe('people and the wall', () => {
  it('a walk that would cross a finished wall goes round to its stair and never through the wall', () => {
    const layer = new RetainWallLayer();
    layer.set('a', plan, 1);
    const hard = (x: number, z: number) => layer.blocks(x, z);
    const s = plan.stairs[0], px = -s.dz, pz = s.dx;
    // from beside the stair's top on the high side to beside its foot on the low side: the straight line crosses the wall away from the stair
    const from: [number, number] = [s.x - s.dx * 0.8 + px * 1.3, s.z - s.dz * 0.8 + pz * 1.3], to: [number, number] = [s.x + s.dx * (s.len + 0.8) - px * 1.3, s.z + s.dz * (s.len + 0.8) - pz * 1.3];
    expect(crossesHard(hard, from, to)).toBe(true);
    const route = walkRoute(from, to, { blocked: hard, hard }, () => []);
    expect(route.length).toBeGreaterThan(1);
    const full = [from, ...route];
    expect(crossesHard(hard, full[0], full[full.length - 1], 0)).toBe(true);
    // no leg of the way crosses the wall, and it uses the stair
    for (let i = 1; i < full.length; i++) expect(crossesHard(hard, full[i - 1], full[i], 0.01, 0.125)).toBe(false);   // (the router's own sampling)
    let through = false;
    for (let i = 1; i < full.length; i++) for (let k = 0; k <= 20; k++) { const t = k / 20; if (inStair(plan.stairs, full[i - 1][0] + (full[i][0] - full[i - 1][0]) * t, full[i - 1][1] + (full[i][1] - full[i - 1][1]) * t, 0.01)) through = true; }
    expect(through).toBe(true);
  });

  it('a wall with no way over leaves everything open: nobody is walled into a pad', () => {
    const bowl = (x: number, z: number) => 10 + 0.6 * Math.hypot(x, z);
    const p = planPad({ x0: -0.3, z0: -0.3, x1: 0.3, z1: 0.3 }, bowl);
    const layer = new RetainWallLayer();
    layer.set('b', p, 1);
    if (!p.barrier) for (const run of p.runs) for (const [x, z] of run.pts) expect(layer.blocks(x, z)).toBe(false);
  });
});
