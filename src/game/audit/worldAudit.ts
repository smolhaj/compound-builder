/**
 * Audits of a built headless world (harness.ts): numbers, not pictures. Each check returns violations with enough detail to find
 * the object; the tests assert the count is zero (or a pinned known value) and the probe prints the table.
 * Units: 1 world unit = 20 ft, so 0.02 = about 5 inches.
 */
import * as THREE from 'three';
import type { HomesteadWorld } from '../HomesteadWorld';
import type { GameState } from '../../sim/state';
import { isBarrierKind, roadGateStatus } from '../../sim/roadGate';
import { distToLine } from '../region/access';
import { ROAD_W } from '../region/countyRoad';
import { CROWN_OVER, crownRadius } from '../parcel/parcelTrees';
import { KIT, footprint } from '../buildkit/kit';

import { PARCEL_SIZE as PARCEL_SIZE_FOR_AUDIT } from '../parcel/parcelTerrain';

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
  out.push({ kind: 'camp', id: 'yard', group: w._yard.group });
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

export interface CountyStats { /** the drive's first station against the county road's drawn surface at its edge (u) */ join: number; /** the tallest cut (+) or fill (-) of the road bed against the natural ground on the centre line (u) */ earth: number; bounceAt: number; /** the most the centre line strays from its own running mean (u), outside the bridges */ bounce: number; /** the steepest local grade at 0.25 u (rise over run) */ maxGrade: number; at: number; /** the most the surface stands above (+) or below (-) the drawn ground across the whole road width */ across: number }
/**
 * The county road's drawn centre line along z from `z0` to `z1` (the stretch a player sees): how much it bounces about its own running mean
 * (a 6 u window) and its steepest local grade at 0.25 u sampling. Spans on bridges are left out (their deck is a straight line on purpose).
 */
export function countyStats(world: HomesteadWorld, z0 = -40, z1 = PARCEL_SIZE_FOR_AUDIT + 40): CountyStats {
  const step = 0.25, n = Math.floor((z1 - z0) / step) + 1;
  const zs: number[] = [], ys: number[] = [], ok: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const z = z0 + i * step, x = world.county.x(z);
    zs.push(z); ys.push(world.countyY(x, z));
    ok.push(!world.countyGaps.some(g => z >= g.z0 - 1.5 && z <= g.z1 + 1.5));
  }
  let earth = 0, bounce = 0, bounceAt = z0, maxGrade = 0, at = z0, across = 0;
  const W = Math.round(3 / step);
  for (let i = 0; i < n; i++) {
    if (!ok[i]) continue;
    let a = 0, c = 0;
    for (let k = -W; k <= W; k++) { const q = i + k; if (q < 0 || q >= n || !ok[q]) continue; a += ys[q]; c++; }
    if (c === 2 * W + 1 && Math.abs(ys[i] - a / c) > bounce) { bounce = Math.abs(ys[i] - a / c); bounceAt = zs[i]; }
    if (i > 0 && ok[i - 1]) { const gr = Math.abs(ys[i] - ys[i - 1]) / step; if (gr > maxGrade) { maxGrade = gr; at = zs[i]; } }
    if (ok[i] && i % 4 === 0) { const e = world.parcel.natural(world.county.x(zs[i]), zs[i]).h - ys[i]; if (Math.abs(e) > Math.abs(earth)) earth = e; }
    if (ok[i] && i % 4 === 0) for (const o of [-0.5, 0, 0.5]) { const d = ys[i] - world.groundAt(world.county.x(zs[i]) + o, zs[i]); if (Math.abs(d) > Math.abs(across)) across = d; }
  }
  const p0 = world.plan.pts[0], join = Math.abs(p0.y - world.groundAt(p0.x, p0.z));
  return { join, earth, bounce, bounceAt, maxGrade, at, across };
}

/**
 * Walls and the roads (R1: a road is never cut by a wall without a gate): every barrier run that crosses the drive with no vehicle gate where it
 * does, every run with a point on the county road, and every gate house that does not stand on the drive (or that overlaps the county road).
 */
export function wallsOnRoads(world: HomesteadWorld, g: GameState): Array<{ what: string; detail: string }> {
  const out: Array<{ what: string; detail: string }> = [];
  const drive = world.access.drive;
  const st = roadGateStatus(g, drive);
  if (st.missing > 0) out.push({ what: 'wall across the drive, no gate', detail: `${st.missing} of ${st.crossing}` });
  const county: Array<[number, number]> = [];
  for (let z = -40; z <= PARCEL_SIZE_FOR_AUDIT + 40; z += 0.5) county.push([world.county.x(z), z]);
  for (const r of g.perimeter) {
    if (!isBarrierKind(r.kind) || r.hostId) continue;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i], b = r.pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5));
      for (let k = 0; k <= n; k++) {
        const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n;
        if (distToLine(county, x, z) < ROAD_W / 2 + 0.15) { out.push({ what: 'wall on the county road', detail: `${r.kind} ${r.id} at ${x.toFixed(1)},${z.toFixed(1)}` }); i = r.pts.length; break; }
      }
    }
  }
  for (const s of g.structures) {
    if (s.unplaced || !/^gate_garage|^gatehouse|^gate_house/.test(s.kind)) continue;
    const d = KIT[s.kind], fp = footprint(d, s.x, s.z, s.rot);
    const onDrive = distToLine(drive, s.x, s.z) < 1.6;
    if (!onDrive) out.push({ what: 'gate house off the drive', detail: `${s.kind} ${s.id} ${distToLine(drive, s.x, s.z).toFixed(1)} u from it` });
    for (const [cx, cz] of [[fp.x0, fp.z0], [fp.x1, fp.z0], [fp.x0, fp.z1], [fp.x1, fp.z1]]) if (distToLine(county, cx, cz) < ROAD_W / 2) { out.push({ what: 'gate house on the county road', detail: `${s.id}` }); break; }
  }
  return out;
}

/**
 * Woodland clearing: near trees (the forest layer's specs) with the centre inside a building's footprint (porch included), or within `pad` of it,
 * or inside a drawn wall line's own width. The planting skirts buildings by 0.6 u, so any count here means a replant did not run (or ran with a stale list).
 */
export function treesOnBuildings(world: HomesteadWorld, pad = 0.55): Array<{ what: string; x: number; z: number }> {
  const out: Array<{ what: string; x: number; z: number }> = [];
  for (const t of world.treeSpecs) {
    if (world.onBuilding(t.x, t.z, 0, true, true)) out.push({ what: 'tree in a building', x: t.x, z: t.z });
    else if (world.onBuilding(t.x, t.z, pad, true, true)) out.push({ what: `tree within ${pad} u of a building`, x: t.x, z: t.z });
    else if (world.onPerimeterLine(t.x, t.z, 0.1)) out.push({ what: 'tree on a wall line', x: t.x, z: t.z });
  }
  return out;
}

/**
 * Crowns over roofs: near trees whose crown centre lies within `frac` of its radius of a building footprint (porch included), so more than a
 * third of a crown hangs over the roof or the porch. Trees stand off buildings by trunk clearance only (0.6 u); the big crowns reach 1 to 1.5 u.
 */
export function crownsOverBuildings(world: HomesteadWorld, frac = CROWN_OVER): Array<{ x: number; z: number; r: number; d: number }> {
  const out: Array<{ x: number; z: number; r: number; d: number }> = [];
  for (const t of world.treeSpecs) {
    const r = crownRadius(t);
    if (r < 0.5) continue;
    if (world.onBuilding(t.x, t.z, frac * r, true, true)) out.push({ x: t.x, z: t.z, r, d: frac * r });
  }
  return out;
}
