/**
 * Geometry audit for every wall, fence, gate and run kind (owner: "make sure all buildings and structures look sound, and no incorrect procedural
 * generations"). It builds the real geometry (no rendering) for each kind across straight runs, corners at 45 / 90 / odd angles, a closed ring,
 * flat and sloped lumpy ground, and checks what a wrong generation shows up as: NaN vertices, degenerate or mirrored triangles, parts hovering with
 * no chain of contact to the ground, parts buried whole, a wall that cuts a corner or leaves it open, a gate that is sealed, a piece count over the
 * draw-call budget. Helpers: ./auditKit.ts. Kit pieces (towers, bunkers, wells...) are audited in ../buildkit/kitGeometryAudit.test.ts.
 */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('../buildkit/materials', () => ({ kitMaterial: (id: string) => { const m = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }); m.name = id; return m; }, setWindowGlow: () => {} }));

import { buildRun } from './perimeterGeometry';
import { PERIMETER, type PerimeterKind, type PerimeterRun, type Pt } from '../../sim/perimeter';
import { audit, buried, floating } from './auditKit';

type Ground = (x: number, z: number) => number;
/** Kinds drawn as a standing wall or fence along their line (the earthworks, pipes and tunnels are audited below). */
const WALLS: PerimeterKind[] = ['split_rail', 'barbed_wire', 'woven_wire', 'thorn_hedge', 'log_palisade', 'container_wall', 'container_stack', 'chain_link', 'wrought_iron', 'iron_barbed', 'bar_fence', 'steel_wall', 'electric_steel', 'concrete_wall', 'stone_wall', 'creek_bars', 'covered_walkway'];
const SHAPES: Record<string, Pt[]> = {
  straight: [[0, 0], [7.3, 0]],
  corner90: [[0, 0], [7.3, 0], [7.3, 5.1]],
  corner45: [[0, 0], [7.3, 0], [11.2, 3.9]],
  odd: [[0, 0], [6.1, 1.3], [9.4, 6.2], [3.3, 8.8]],
  ring: [[0, 0], [10.3, 0], [10.3, 7.7], [0, 7.7], [0, 0]],
};
const GROUNDS: Record<string, Ground> = { flat: () => 0, slope: (x, z) => x * 0.03 + Math.sin(z * 0.5) * 0.04 };
const mk = (kind: PerimeterKind, pts: Pt[], over: Partial<PerimeterRun> = {}): PerimeterRun => ({ id: 'r', kind, pts: pts.map(p => [p[0], p[1]] as Pt), gates: [], done: 1, hours: 1, supplied: true, finishedAt: 0, ...over });

describe('walls and fences are sound geometry', () => {
  for (const kind of WALLS) for (const [sn, pts] of Object.entries(SHAPES)) for (const [gn, ground] of Object.entries(GROUNDS)) {
    it(`${kind}: ${sn} on ${gn} ground`, () => {
      const g = buildRun(mk(kind, pts), ground, 1e9);
      const a = audit(g);
      expect(a.nanVerts).toBe(0);
      expect(a.degenerate).toBe(0);
      expect(a.mirrored).toBe(0);
      expect(floating(a.parts, ground).map(p => p.mat + '@' + p.minX.toFixed(2) + ',' + p.minZ.toFixed(2))).toEqual([]);
      expect(buried(a.parts, ground).length).toBe(0);
      expect(g.children.length).toBeLessThanOrEqual(12);       // merged per material: a long wall stays a handful of draws
      // a wall turns its corners: some piece stands at every interior vertex (no chord across the corner, no open notch)
      for (let i = 1; i < pts.length - 1; i++) {
        const [vx, vz] = pts[i];
        const gap = Math.min(...a.parts.map(p => Math.hypot(Math.max(p.minX - vx, 0, vx - p.maxX), Math.max(p.minZ - vz, 0, vz - p.maxZ))));
        expect(gap).toBeLessThan(0.01);
      }
      // …and no piece strays from the line farther than the widest wall is thick (a cut corner puts bays off the line)
      const near = (x: number, z: number) => Math.min(...pts.slice(1).map((q, i) => { const [ax, az] = pts[i], dx = q[0] - ax, dz = q[1] - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); return Math.hypot(x - (ax + dx * t), z - (az + dz * t)); }));
      const stray = a.parts.filter(p => near((p.minX + p.maxX) / 2, (p.minZ + p.maxZ) / 2) > (kind === 'thorn_hedge' ? 0.5 : 1.0));
      expect(stray.length).toBe(0);
    });
  }
});

describe('gates open through the run', () => {
  const slope = GROUNDS.slope;
  for (const kind of [...WALLS.filter(k => k !== 'covered_walkway'), 'earth_berm', 'ditch'] as PerimeterKind[]) for (const w of [0.5, 0.9, 1.4]) {
    it(`${kind}: a ${w} wide gate is passable on a slope, with and without a drive`, () => {
      for (const drive of [undefined, [[4, -6], [4, 0], [4, 5]] as Pt[]]) {
        const g = buildRun(mk(kind, [[0, 0], [8, 0]], { gates: [{ at: 4, w }] }), slope, 1e9, () => false, { drive });
        g.updateMatrixWorld(true);
        const meshes: THREE.Object3D[] = [];
        g.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o); });
        const rc = new THREE.Raycaster();
        for (const dx of kind === 'thorn_hedge' ? [-w * 0.3, 0, w * 0.3] : [-w * 0.15, 0, w * 0.15]) for (const h of [0.04, 0.12, 0.2, 0.3]) {
          const x = 4 + dx;
          rc.set(new THREE.Vector3(x, slope(x, 0) + h, -3), new THREE.Vector3(0, 0, 1)); rc.far = 6;
          expect(rc.intersectObjects(meshes, false).length, `${kind} gate ${w} blocked at dx ${dx} height ${h}`).toBe(0);
        }
      }
    });
  }
});

describe('a gate is as tall as the wall or fence it stands in', () => {
  for (const kind of ['log_palisade', 'container_wall', 'container_stack', 'steel_wall', 'electric_steel', 'concrete_wall', 'woven_wire', 'chain_link', 'wrought_iron', 'iron_barbed', 'bar_fence', 'split_rail', 'barbed_wire'] as PerimeterKind[]) {
    it(kind, () => {
      const w = 0.9, H = PERIMETER[kind].height, a = audit(buildRun(mk(kind, [[0, 0], [8, 0]], { gates: [{ at: 4, w }] }), () => 0, 1e9));
      // a leaf is a part that sits inside the gap's reach and is wider than a post (its frame bars)
      const leaves = a.parts.filter(p => p.minX > 4 - w / 2 - 0.15 && p.maxX < 4 + w / 2 + 0.15 && p.minZ > -w && p.maxZ < w && Math.max(p.maxX - p.minX, p.maxZ - p.minZ) > 0.2);
      expect(leaves.length, 'a gate leaf is drawn').toBeGreaterThan(0);
      expect(Math.max(...leaves.map(p => p.maxY)), 'the leaf reaches the top of the fence').toBeGreaterThan(Math.min(H, kind === 'split_rail' || kind === 'barbed_wire' ? 0.2 : H) * 0.85);
    });
  }
});

describe('special runs: bridges, tunnels, drains, wall-top decks', () => {
  const gorge: Ground = (_x, z) => Math.min(4, Math.abs(z - 20) * 0.7);
  const slope = GROUNDS.slope;
  const cases: Array<[string, PerimeterKind, Pt[], Ground, Partial<PerimeterRun>, object]> = [
    ['tunnel bridge', 'tunnel_bridge', [[10, 8], [10, 32]], gorge, {}, {}],
    ['slope tunnel', 'slope_tunnel', [[0, 5], [14, 5]], x => -0.35 * x, {}, {}],
    ['covered bridge over a gorge', 'covered_bridge', [[10, 8], [10, 32]], gorge, {}, {}],
    ['covered bridge on flat', 'covered_bridge', [[0, 0], [9, 0]], () => 0, {}, {}],
    ['drain channel', 'drain_channel', [[0, 0], [8, 0], [10, 4]], slope, {}, {}],
    ['water pipe', 'water_pipe', [[0, 0], [8, 0], [10, 4]], slope, {}, {}],
    ['power cable', 'power_cable', [[0, 0], [8, 0], [10, 4]], slope, {}, {}],
    ['wall walk on container', 'wall_walk', [[0, 0], [8, 0], [8, 6]], slope, { hostId: 'h' }, { hostKind: 'container_wall' }],
    ['wall walk on steel', 'wall_walk', [[0, 0], [8, 0], [8, 6]], slope, { hostId: 'h' }, { hostKind: 'steel_wall' }],
    ['wall walk on concrete', 'wall_walk', [[0, 0], [8, 0], [8, 6]], slope, { hostId: 'h' }, { hostKind: 'concrete_wall' }],
    ['razor wire on concrete', 'concrete_wall', [[0, 0], [8, 0], [8, 6]], slope, { razor: true }, {}],
    ['electric fence on steel', 'steel_wall', [[0, 0], [8, 0], [8, 6]], slope, { electric: true }, {}],
  ];
  for (const [name, kind, pts, ground, over, opts] of cases) {
    it(name, () => {
      const g = buildRun(mk(kind, pts, over), ground, 1e9, () => false, opts as never);
      const a = audit(g);
      expect(a.nanVerts).toBe(0);
      expect(a.degenerate).toBe(0);
      expect(a.mirrored).toBe(0);
      expect(floating(a.parts.filter(p => !/water|glass|ice/.test(p.mat)), ground, 0.04, 0.04).map(p => p.mat)).toEqual([]);
      expect(a.tris).toBeLessThan(60000);
    });
  }
  it('every wall kind has a height in its table that its drawing reaches (a wall never draws shorter than the stopping power the sim credits)', () => {
    const flat = () => 0;
    for (const kind of WALLS.filter(k => k !== 'thorn_hedge' && k !== 'covered_walkway' && k !== 'creek_bars')) {
      const a = audit(buildRun(mk(kind, SHAPES.straight), flat, 1e9));
      const top = Math.max(...a.parts.map(p => p.maxY));
      expect(top, kind).toBeGreaterThan(PERIMETER[kind].height - 0.02);
    }
  });
});

describe('escape tunnels stay under the ground', () => {
  const grounds: Record<string, Ground> = {
    flat: () => 1,
    hill: x => 1 + Math.max(0, x - 12) * 0.06,
    dip: x => 1 - Math.exp(-(((x - 17) / 2) ** 2)) * 0.5,
    lumpy: (x, z) => 1.2 + Math.sin(x * 0.7) * 0.12 + Math.cos(z * 0.6) * 0.1,
  };
  const routes: Record<string, Pt[]> = { straight: [[11.5, 10.5], [24, 10.5]], bend: [[11.5, 10.5], [16, 10.5], [16, 15], [24, 18]] };
  for (const [gn, ground] of Object.entries(grounds)) for (const [rn, pts] of Object.entries(routes)) {
    it(`${rn} route under ${gn} ground: cover over the vault, a gentle grade, sound geometry`, async () => {
      const { tunnelPath, TUNNEL_GRADE, VAULT_TOP } = await import('../buildkit/tunnelPath');
      const { MIN_COVER, DEPTH } = await import('../buildkit/underground');
      const { buildTunnel } = await import('./tunnelGeometry');
      const { samples, problem } = tunnelPath(pts, 1 - DEPTH, ground);
      if (problem) return;                                   // a route the game refuses is never drawn
      for (let i = 0; i < samples.length - 3; i++) expect(samples[i].floor + VAULT_TOP, `sample ${i}`).toBeLessThanOrEqual(ground(samples[i].x, samples[i].z) - MIN_COVER + 1e-6);
      for (let i = 1; i < samples.length; i++) expect(Math.abs(samples[i].floor - samples[i - 1].floor)).toBeLessThanOrEqual(TUNNEL_GRADE * (samples[i].s - samples[i - 1].s) + 1e-6);
      const g = buildTunnel(samples, ground);
      const a = audit(g);
      expect(a.nanVerts).toBe(0);
      expect(a.degenerate).toBe(0);
      // nothing but the exit collar and its litter breaks the surface
      for (const m of g.children) {
        if (m.userData.part === 'surface') continue;
        const bb = new THREE.Box3().setFromObject(m);
        for (const s of samples.slice(0, -3)) if (Math.abs(bb.min.x - s.x) < 0.2 && Math.abs(bb.min.z - s.z) < 0.2) expect(bb.max.y).toBeLessThan(ground(s.x, s.z) + 0.02);
      }
    });
  }
});

describe('retaining walls round graded pads', () => {
  it('are finite, have no degenerate triangles, are footed in the ground and never rise past the coping, on slopes in every direction', async () => {
    const { planPad } = await import('../../sim/retainPlan');
    const { wallGeometry } = await import('../terrain/RetainWalls');
    const fp = { x0: -0.75, z0: -0.75, x1: 0.75, z1: 0.75 };
    let walls = 0;
    for (const [gx, gz] of [[0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25], [0.2, 0.2], [-0.15, 0.3], [0.5, 0.1], [0.08, 0.02]]) for (const bump of [0, 0.08]) {
      const natural = (x: number, z: number) => 10 + gx * x + gz * z + Math.sin(x * 2.1 + z) * bump;
      const plan = planPad(fp, natural);
      for (const detail of ['near', 'far'] as const) for (const k of [0.4, 1]) {
        const g = wallGeometry(plan, k, natural, 3, detail);
        if (!g) continue;
        walls++;
        const pos = g.getAttribute('position');
        let ok = true, lo = Infinity, hi = -Infinity;
        for (let i = 0; i < pos.count; i++) { if (!Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))) ok = false; lo = Math.min(lo, pos.getY(i)); hi = Math.max(hi, pos.getY(i)); }
        expect(ok).toBe(true);
        expect(hi).toBeLessThan(plan.y + plan.maxH + 0.2);
        expect(lo).toBeGreaterThan(plan.y - plan.maxH - 0.3);
        // no degenerate triangle
        const idx = g.getIndex(), n = idx ? idx.count / 3 : pos.count / 3, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
        let deg = 0;
        for (let t = 0; t < n; t++) {
          const [i0, i1, i2] = idx ? [idx.getX(t * 3), idx.getX(t * 3 + 1), idx.getX(t * 3 + 2)] : [t * 3, t * 3 + 1, t * 3 + 2];
          a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1).sub(a); c.fromBufferAttribute(pos, i2).sub(a);
          if (b.cross(c).length() < 1e-10) deg++;
        }
        expect(deg).toBe(0);
      }
    }
    expect(walls).toBeGreaterThan(10);
  });
});

describe('a covered walkway turns its corner closed', () => {
  it('a ray from outside the bend toward the corner meets wall at every height of the passage and the floor under it', () => {
    const pts: Pt[] = [[0, 0], [6, 0], [6, 6]];      // turns right (toward +z) at (6, 0): the outside of the turn is +x, -z
    const g = buildRun(mk('covered_walkway', pts), () => 0, 1e9);
    g.updateMatrixWorld(true);
    const meshes: THREE.Object3D[] = [];
    g.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o); });
    const rc = new THREE.Raycaster();
    const hw = 2.0 / 6 / 2 + 0.06 / 6;
    for (const h of [0.15, 0.25, 0.4]) {
      rc.set(new THREE.Vector3(6 + 2, h, -2), new THREE.Vector3(-1, 0, 1).normalize());
      const hit = rc.intersectObjects(meshes, false)[0];
      expect(hit, `outer corner open at height ${h}`).toBeTruthy();
      expect(Math.hypot(hit.point.x - 6, hit.point.z)).toBeLessThan(hw * 1.7);
    }
    // the floor is whole across the notch: a ray straight down at the outer corner of the passage lands on something
    rc.set(new THREE.Vector3(6 + hw * 0.7, 1, -hw * 0.7), new THREE.Vector3(0, -1, 0));
    expect(rc.intersectObjects(meshes, false).length).toBeGreaterThan(0);
  });
});
