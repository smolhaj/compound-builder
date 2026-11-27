import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('./materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));

import { KIT, PROBLEM_TEXT, type Placed, type SiteQuery } from './kit';
import { siteProblem } from './underground';
import { DOME_KIND, TIER, shellFt } from '../../sim/dome/tiers';
import { controlKeepout, rectControlProblem } from '../../sim/dome/controlBlock';
import { portAngleOf } from '../../sim/dome/standing';

const flat: SiteQuery = { height: () => 1, owned: () => true, water: () => false };
const P = (id: string, kind: string, x: number, z: number, rot = 0): Placed => ({ id, kind, x, z, rot });
const R = shellFt('arcology', TIER.arcology.cells) / 2 / 20 - 0.03, X = 30, Z = 30;
const dome = P('d', DOME_KIND.arcology, X, Z);
const keep = controlKeepout('arcology', R, X, Z, 0, portAngleOf('arcology', { rot: 0 }, R))!;
const box = keep.boxes[Math.floor(keep.boxes.length / 2)];
const outAt = (x: number, z: number): Placed => P('o', 'outhouse', x, z);

describe('the arcology control block is protected from placement', () => {
  it('a house-sized piece on the block is refused with the block reason, and the text names it', () => {
    const x = (box.x0 + box.x1) / 2, z = (box.z0 + box.z1) / 2;
    expect(siteProblem(KIT.outhouse, x, z, 0, flat, [dome])).toBe('control_block');
    expect(PROBLEM_TEXT.control_block).toMatch(/control block/);
  });
  it('a piece across the service path to either airlock is refused with the path reason', () => {
    for (const path of keep.paths) {
      const a = path[1], b = path[2], x = (a[0] + b[0]) / 2, z = (a[1] + b[1]) / 2, why = siteProblem(KIT.outhouse, x, z, 0, flat, [dome]);
      expect(['control_path', 'control_block']).toContain(why);
    }
    const a = keep.paths[0][1], b = keep.paths[0][2];
    const reasons = new Set(keep.paths.flatMap(path => path.slice(1).map((q, i) => rectControlProblem(keep, { x0: (q[0] + path[i][0]) / 2 - 0.1, z0: (q[1] + path[i][1]) / 2 - 0.1, x1: (q[0] + path[i][0]) / 2 + 0.1, z1: (q[1] + path[i][1]) / 2 + 0.1 }))));
    expect(reasons.has('control_path') || reasons.has('control_block')).toBe(true); void a; void b;
    expect(PROBLEM_TEXT.control_path).toMatch(/service path/);
  });
  it('the open floor of the dome is still buildable, and so is the ground outside it', () => {
    expect(siteProblem(KIT.outhouse, X, Z, 0, flat, [dome])).toBeNull();
    expect(siteProblem(KIT.outhouse, X + R + 3, Z, 0, flat, [dome])).toBeNull();
  });
  it('an arcology staked over a piece that stands on the block is refused, and over one that does not is fine', () => {
    const x = (box.x0 + box.x1) / 2, z = (box.z0 + box.z1) / 2;
    expect(siteProblem(KIT[DOME_KIND.arcology], X, Z, 0, flat, [outAt(x, z)])).toBe('control_block');
    expect(siteProblem(KIT[DOME_KIND.arcology], X, Z, 0, flat, [outAt(X, Z)])).toBeNull();
  });
  it('other tiers have no block to protect', () => {
    const g = P('d', DOME_KIND.glass, X, Z);
    expect(siteProblem(KIT.outhouse, X + 1, Z + 1, 0, flat, [g])).toBeNull();
  });
});
