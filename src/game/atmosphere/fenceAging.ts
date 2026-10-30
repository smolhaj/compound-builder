/**
 * Old fences: lean the posts and sag the rails of a built run in place
 * (aging.leanAt), by height above the ground so the feet stay put. Done
 * once when the run is (re)built for its age bucket; no per-frame cost.
 */
import type * as THREE from 'three';
import type { PerimeterKind } from '../../sim/perimeter';
import { leanAt } from './aging';

/** Runs whose posts lean with the years (a wall of containers or a berm doesn't). */
export const LEANS: ReadonlySet<PerimeterKind> = new Set<PerimeterKind>(['split_rail', 'barbed_wire', 'woven_wire', 'log_palisade']);

export function leanRun(group: THREE.Group, k: number, seed: number, ground: (x: number, z: number) => number): void {
  if (k <= 0.01) return;
  group.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const p = m.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const h = y - ground(x, z);
      if (h <= 0.004) continue;
      const l = leanAt(x, z, seed, k);
      p.setXYZ(i, x + l.dx * h, y - l.sag * h, z + l.dz * h);
    }
    p.needsUpdate = true;
    m.geometry.computeBoundingSphere();
  });
}
