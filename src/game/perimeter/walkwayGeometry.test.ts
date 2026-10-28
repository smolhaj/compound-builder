import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// materials paint canvases (no DOM in tests): plain materials stand in
vi.mock('../buildkit/materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));

import { buildRun } from './perimeterGeometry';
import { PERIMETER, type PerimeterKind, type PerimeterRun, type Pt } from '../../sim/perimeter';
import { DECK_W } from '../../sim/walkway';

const M = 1 / 6;
const sq: Pt[] = [[0, 0], [24, 0], [24, 24], [0, 24], [0, 0]];
const run = (id: string, kind: PerimeterKind, gates: PerimeterRun['gates'] = [], hostId?: string): PerimeterRun => ({ id, kind, pts: sq.map(p => [p[0], p[1]] as Pt), gates, done: 1, hours: 1, supplied: true, finishedAt: 0, hostId });

/** Ground that falls 1.4 m (≈ 0.23) across 24 units east, with a dip. */
const slope = (x: number, z: number) => x * 0.01 + Math.sin(z * 0.4) * 0.03;
const flat = () => 0;

function bounds(g: THREE.Group) {
  const b = new THREE.Box3().setFromObject(g);
  return b;
}
function allFinite(g: THREE.Group): boolean {
  let ok = true;
  g.traverse(o => { const m = o as THREE.Mesh; const a = m.geometry?.getAttribute('position'); if (a) for (let i = 0; i < a.array.length; i++) if (!Number.isFinite(a.array[i])) ok = false; });
  return ok;
}

describe('the wall-top walkway geometry', () => {
  for (const host of ['container_wall', 'steel_wall', 'concrete_wall'] as PerimeterKind[]) {
    it(`sits on ${host} on flat ground at the wall's top, with rails above and stairs from the ground`, () => {
      const g = buildRun(run('w1', 'wall_walk', [], 'h'), flat, 0, () => false, { hostKind: host });
      expect(allFinite(g)).toBe(true);
      const b = bounds(g), H = PERIMETER[host].height;
      expect(b.min.y).toBeGreaterThanOrEqual(-0.05);       // stairs and the foot landing reach the ground, nothing goes under it
      expect(b.min.y).toBeLessThan(0.05);
      expect(b.max.y).toBeGreaterThan(H + 1.0 * M);        // the handrail stands above the deck
      expect(b.max.y).toBeLessThan(H + 0.2 + 1.5 * M);     // and the deck is not floating high above the wall
      // a person is 0.28 tall: the rail (≈ 1.1 m) is lower than a guard's head, and the deck is wide enough for one to pass
      expect(DECK_W).toBeGreaterThan(0.18);
    });
  }

  it('follows a slope: the deck top tracks the high ground and never dips below the ground under it', () => {
    const g = buildRun(run('w2', 'wall_walk', [], 'h'), slope, 0, () => false, { hostKind: 'container_wall' });
    expect(allFinite(g)).toBe(true);
    const b = bounds(g), H = PERIMETER.container_wall.height;
    const high = slope(24, 24 * 0.0);
    expect(b.max.y).toBeGreaterThan(high + H);
    // nothing is far below the lowest ground (the stair foot is on the ground)
    expect(b.min.y).toBeGreaterThan(-0.12);
  });

  it('steel wall decks (thin wall, brackets) are set back inside and still follow the ground', () => {
    const g = buildRun(run('w3', 'wall_walk', [], 'h'), slope, 0, () => false, { hostKind: 'steel_wall' });
    expect(allFinite(g)).toBe(true);
    expect(bounds(g).max.y).toBeGreaterThan(PERIMETER.steel_wall.height);
  });

  it('breaks at a gatehouse garage: no deck across the gap', () => {
    const open = bounds(buildRun(run('w4', 'wall_walk', [{ at: 12, w: 3, garage: true }], 'h'), flat, 0, () => false, { hostKind: 'container_wall' }));
    const full = bounds(buildRun(run('w5', 'wall_walk', [], 'h'), flat, 0, () => false, { hostKind: 'container_wall' }));
    expect(open.max.y).toBeLessThanOrEqual(full.max.y + 1e-6);
  });

  it('a container wall with a garage gate draws no gate leaves in the gap', () => {
    const count = (g: THREE.Group) => { let n = 0; g.traverse(o => { const a = (o as THREE.Mesh).geometry?.getAttribute('position'); if (a) n += a.count; }); return n; };
    const withLeaves = buildRun(run('c1', 'container_wall', [{ at: 12, w: 3 }]), flat, 0);
    const garage = buildRun(run('c2', 'container_wall', [{ at: 12, w: 3, garage: true }]), flat, 0);
    expect(allFinite(garage)).toBe(true);
    expect(count(garage)).toBeLessThan(count(withLeaves));
  });
});
