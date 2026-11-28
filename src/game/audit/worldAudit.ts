/**
 * Audits of a built headless world (harness.ts): numbers, not pictures. Each check returns violations with enough detail to find
 * the object; the tests assert the count is zero (or a pinned known value) and the probe prints the table.
 * Units: 1 world unit = 20 ft, so 0.02 = about 5 inches.
 */
import * as THREE from 'three';
import type { HomesteadWorld } from '../HomesteadWorld';

export interface Obj { kind: string; id: string; group: THREE.Object3D }
export interface Viol { check: string; kind: string; id: string; detail: string; amount: number }

type Priv = {
  _built: Map<string, { placed: { id: string; kind: string; x: number; z: number; rot: number }; group: THREE.Group; cover?: boolean; finished: boolean }>;
  _runGroups: Map<string, { group: THREE.Group }>;
  _campGroup: THREE.Group; _yard: { group: THREE.Group };
};

export function objectsOf(world: HomesteadWorld): Obj[] {
  const w = world as unknown as Priv;
  const out: Obj[] = [];
  for (const [id, b] of w._built) out.push({ kind: b.placed.kind, id, group: b.group });
  for (const [id, r] of w._runGroups) out.push({ kind: 'run', id, group: r.group });
  out.push({ kind: 'camp', id: 'camp', group: w._campGroup });
  return out;
}

/** World-space vertices of every visible mesh under `root` (instances expanded), as flat xyz triples per mesh. */
export function worldVerts(root: THREE.Object3D, each: (x: number, y: number, z: number, mesh: THREE.Mesh) => void): void {
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3(), m4 = new THREE.Matrix4();
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible) return;
    const pos = m.geometry?.getAttribute?.('position');
    if (!pos) return;
    const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh) : null;
    const n = inst ? inst.count : 1;
    for (let k = 0; k < n; k++) {
      if (inst) { inst.getMatrixAt(k, m4); m4.premultiply(m.matrixWorld); } else m4.copy(m.matrixWorld);
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m4); each(v.x, v.y, v.z, m); }
    }
  });
}

export interface Clearance { nonFinite: number; minY: number; /** least and greatest (y - ground) over the vertices within `band` of the object's lowest point */ lowMin: number; lowMax: number; n: number; at: [number, number] }

/** How the object's lowest vertices sit against the drawn ground under them. */
export function clearance(group: THREE.Object3D, ground: (x: number, z: number) => number, band = 0.03): Clearance {
  let minY = Infinity, nonFinite = 0;
  worldVerts(group, (x, y, z) => { if (!Number.isFinite(x + y + z)) { nonFinite++; return; } if (y < minY) minY = y; });
  let lowMin = Infinity, lowMax = -Infinity, n = 0, at: [number, number] = [0, 0];
  worldVerts(group, (x, y, z) => { if (!Number.isFinite(x + y + z) || y > minY + band) return; const c = y - ground(x, z); n++; if (c < lowMin) lowMin = c; if (c > lowMax) { lowMax = c; at = [x, z]; } });
  return { nonFinite, minY, lowMin, lowMax, n, at };
}

/** NaN / Infinity in any vertex attribute or instance matrix anywhere in the scene (one count per bad mesh, with its name). */
export function nonFiniteMeshes(root: THREE.Object3D): string[] {
  const bad: string[] = [];
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh && !(o as THREE.Points).isPoints) return;
    const g = m.geometry as THREE.BufferGeometry | undefined;
    if (!g) return;
    for (const [name, a] of Object.entries(g.attributes)) {
      const arr = (a as THREE.BufferAttribute).array as ArrayLike<number>;
      for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) { bad.push(`${o.name || o.type}.${name}`); break; }
    }
    const im = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh) : null;
    if (im) { const arr = im.instanceMatrix.array; const n = im.count * 16; for (let i = 0; i < n; i++) if (!Number.isFinite(arr[i])) { bad.push(`${o.name || o.type}.instanceMatrix`); break; } }
  });
  return bad;
}

export interface TerrainStats { maxSlope: number; maxSeam: number; flipped: number; samples: number }
/** The drawn ground over the parcel: steepest cell-to-cell slope, the largest gap between the drawn surface and the parcel's own height function, and mesh normals pointing down. */
export function terrainStats(world: HomesteadWorld, size: number, step = 0.5): TerrainStats {
  let maxSlope = 0, maxSeam = 0, samples = 0;
  for (let x = 0; x <= size; x += step) for (let z = 0; z <= size; z += step) {
    const y = world.groundAt(x, z);
    maxSeam = Math.max(maxSeam, Math.abs(y - world.parcel.sample(x, z).h));
    if (x + step <= size) maxSlope = Math.max(maxSlope, Math.abs(world.groundAt(x + step, z) - y) / step);
    if (z + step <= size) maxSlope = Math.max(maxSlope, Math.abs(world.groundAt(x, z + step) - y) / step);
    samples++;
  }
  let flipped = 0;
  const mesh = (world.terrain as unknown as { _mesh?: THREE.Mesh })._mesh;
  const nrm = mesh?.geometry.getAttribute('normal');
  if (nrm) for (let i = 0; i < nrm.count; i++) if (nrm.getY(i) <= 0.02) flipped++;
  return { maxSlope, maxSeam, flipped, samples };
}

/** The steepest grade (rise over run, drawn ground) along a polyline, and the worst jump between consecutive samples a few inches apart. */
export function gradeAlong(pts: ReadonlyArray<{ x: number; z: number }>, y: (x: number, z: number) => number, step = 0.25): { maxGrade: number; at: [number, number]; length: number } {
  let maxGrade = 0, at: [number, number] = [0, 0], length = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 1e-6) continue;
    const n = Math.max(1, Math.ceil(L / step));
    let px = a.x, pz = a.z, py = y(px, pz);
    for (let k = 1; k <= n; k++) {
      const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n, yy = y(x, z), d = Math.hypot(x - px, z - pz);
      if (d > 1e-6) { const gr = Math.abs(yy - py) / d; if (gr > maxGrade) { maxGrade = gr; at = [x, z]; } }
      length += d; px = x; pz = z; py = yy;
    }
  }
  return { maxGrade, at, length };
}

/** Where the road plan's drawn profile and the drawn ground part company (u), outside the bridges, tunnels and culverts that leave the ground on purpose. */
export function roadProfileGap(world: HomesteadWorld): { worst: number; at: number } {
  const plan = world.plan;
  const span = (s: number) => plan.structures.some(st => s >= st.s0 - 0.6 && s <= st.s1 + 0.6);
  let worst = 0, at = -1;
  plan.pts.forEach((q, i) => { if (span(q.s)) return; const d = Math.abs(q.y - world.groundAt(q.x, q.z)); if (d > worst) { worst = d; at = i; } });
  return { worst, at };
}

/** Animals and people stepped for a while on the built place: where they stand against water, buildings and the map. */
export interface Spawn { what: string; id: string; x: number; z: number }
/** Water deeper than this (u, 3 ft: a deer's knee) is no place for a land animal or a person on foot. */
export const DEEP = 0.15;
export function strayThings(world: HomesteadWorld, size: number): Spawn[] {
  // the map is the parcel and the home rect (an 80-acre listing reaches past the 67-unit parcel)
  const hm = (world as unknown as { home: { x0: number; z0: number; x1: number; z1: number } }).home;
  const lo = (a: number) => Math.min(0, a), hiX = Math.max(size, hm.x1), hiZ = Math.max(size, hm.z1), loX = lo(hm.x0), loZ = lo(hm.z0);
  const off = (x: number, z: number, m: number) => x < loX - m || z < loZ - m || x > hiX + m || z > hiZ + m;
  const w = world as unknown as { onBuilding(x: number, z: number, pad?: number, porch?: boolean, domes?: boolean): boolean; wildlife: { animals(): Array<{ id: string; sp: string; x: number; z: number }> }; livestock: { animals(): Array<{ id: string; kind: string; x: number; z: number; inside: boolean }> }; family: { positions(): Array<{ id: string; x: number; z: number }>; shown: Set<string> } };
  const out: Spawn[] = [];
  // open water: the lake, or the channel itself (a low pocket of a hillside lot below the creek's level is a dip in the ground, not water: the same rule as sim/sceneAudit)
  const wet = (x: number, z: number) => x >= loX && z >= loZ && x <= hiX && z <= hiZ && world.parcel.isCreek(x, z) && (!!world.parcel.lakeY || Math.abs(z - world.parcel.creek.zAt(x)) < world.parcel.creek.halfWidth + 0.6);
  const depth = (x: number, z: number) => (wet(x, z) ? Math.max(0, (world.parcel.lakeY ?? world.parcel.creek.waterY(x)) - world.groundAt(x, z)) : 0);
  const deep = (x: number, z: number) => depth(x, z) > DEEP;
  const fish = (sp: string) => /trout|bass|catfish|salmon|panfish|waterfowl|duck|goose/.test(sp);
  for (const a of w.wildlife.animals()) {
    if (!Number.isFinite(a.x + a.z)) out.push({ what: 'wildlife at NaN', id: a.id, x: a.x, z: a.z });
    else if (off(a.x, a.z, 12)) out.push({ what: `wildlife ${a.sp} off the map`, id: a.id, x: a.x, z: a.z });
    else if (!fish(a.sp) && deep(a.x, a.z)) out.push({ what: `wildlife ${a.sp} in deep water`, id: a.id, x: a.x, z: a.z });
    else if (w.onBuilding(a.x, a.z, 0, false)) out.push({ what: `wildlife ${a.sp} inside a building`, id: a.id, x: a.x, z: a.z });
  }
  for (const a of w.livestock.animals()) {
    if (!Number.isFinite(a.x + a.z)) out.push({ what: 'livestock at NaN', id: a.id, x: a.x, z: a.z });
    else if (off(a.x, a.z, 4)) out.push({ what: `${a.kind} off the map`, id: a.id, x: a.x, z: a.z });
    else if (deep(a.x, a.z)) out.push({ what: `${a.kind} in deep water`, id: a.id, x: a.x, z: a.z });
  }
  for (const p of w.family.positions()) {
    if (!w.family.shown.has(p.id)) continue;
    if (!Number.isFinite(p.x + p.z)) out.push({ what: 'person at NaN', id: p.id, x: p.x, z: p.z });
    else if (off(p.x, p.z, 12)) out.push({ what: 'person off the map', id: p.id, x: p.x, z: p.z });
    else if (deep(p.x, p.z)) out.push({ what: 'person in deep water', id: p.id, x: p.x, z: p.z });
  }
  return out;
}
