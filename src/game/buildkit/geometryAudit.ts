/**
 * Geometry audit helpers (pure THREE, no rendering): the checks the build-kit audit test runs on every building's real geometry.
 * A mesh here is one merged layer x material mesh from `buildLayers`; a "component" is a connected piece of it (triangles that share
 * a welded vertex), which is what one authored box / cylinder / extrusion becomes.
 */
import * as THREE from 'three';

export interface AuditMesh { name: string; layer: string; pos: Float32Array; tris: number }

/** World-space (group-local) triangle soup of every mesh in a built group. */
export function auditMeshes(group: THREE.Group): AuditMesh[] {
  group.updateMatrixWorld(true);
  const out: AuditMesh[] = [];
  const v = new THREE.Vector3();
  group.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry as THREE.BufferGeometry;
    const p = g.getAttribute('position');
    const idx = g.index;
    const n = idx ? idx.count : p.count;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const k = idx ? idx.getX(i) : i;
      v.fromBufferAttribute(p, k).applyMatrix4(m.matrixWorld);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    }
    out.push({ name: m.name, layer: String(m.userData.layer ?? ''), pos, tris: Math.floor(n / 3) });
  });
  return out;
}

export interface TriStats { total: number; nonFinite: number; degenerate: number; tiny: number }

/** NaN / Infinity vertices and zero-area triangles. */
export function triangleStats(m: AuditMesh, areaEps = 1e-9): TriStats {
  const s: TriStats = { total: m.tris, nonFinite: 0, degenerate: 0, tiny: 0 };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < m.tris; t++) {
    let ok = true;
    for (let i = 0; i < 9; i++) if (!Number.isFinite(m.pos[t * 9 + i])) ok = false;
    if (!ok) { s.nonFinite++; continue; }
    a.fromArray(m.pos, t * 9); b.fromArray(m.pos, t * 9 + 3); c.fromArray(m.pos, t * 9 + 6);
    const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    if (area < areaEps) s.degenerate++;
  }
  return s;
}

export interface Component { layer: string; name: string; box: THREE.Box3; tris: number; /** triangle indices into the mesh */ mesh: AuditMesh; volume: number | null }

const KEY = 1e5;
/** Split a mesh into connected components by welded vertices; also the signed volume of a closed (watertight) component, else null. */
export function components(m: AuditMesh): Component[] {
  const parent = new Int32Array(m.tris).map((_, i) => i);
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const owner = new Map<string, number>();
  for (let t = 0; t < m.tris; t++) {
    for (let k = 0; k < 3; k++) {
      const o = t * 9 + k * 3;
      const key = `${Math.round(m.pos[o] * KEY)},${Math.round(m.pos[o + 1] * KEY)},${Math.round(m.pos[o + 2] * KEY)}`;
      const prev = owner.get(key);
      if (prev === undefined) owner.set(key, t);
      else { const a = find(prev), b = find(t); if (a !== b) parent[b] = a; }
    }
  }
  const groups = new Map<number, number[]>();
  for (let t = 0; t < m.tris; t++) { const r = find(t); let l = groups.get(r); if (!l) groups.set(r, l = []); l.push(t); }
  const out: Component[] = [];
  for (const ts of groups.values()) {
    const box = new THREE.Box3();
    const p = new THREE.Vector3();
    for (const t of ts) for (let k = 0; k < 3; k++) { p.fromArray(m.pos, t * 9 + k * 3); box.expandByPoint(p); }
    out.push({ layer: m.layer, name: m.name, box, tris: ts.length, mesh: m, volume: closedVolume(m, ts) });
  }
  return out;
}

/** Signed volume of a component if every edge is shared by exactly two triangles (closed surface); null otherwise. */
function closedVolume(m: AuditMesh, ts: number[]): number | null {
  const edges = new Map<string, number>();
  const q = (o: number) => `${Math.round(m.pos[o] * KEY)},${Math.round(m.pos[o + 1] * KEY)},${Math.round(m.pos[o + 2] * KEY)}`;
  let vol = 0;
  for (const t of ts) {
    const ks = [q(t * 9), q(t * 9 + 3), q(t * 9 + 6)];
    for (let i = 0; i < 3; i++) {
      const e = ks[i] < ks[(i + 1) % 3] ? `${ks[i]}|${ks[(i + 1) % 3]}` : `${ks[(i + 1) % 3]}|${ks[i]}`;
      edges.set(e, (edges.get(e) ?? 0) + 1);
    }
    const ax = m.pos[t * 9], ay = m.pos[t * 9 + 1], az = m.pos[t * 9 + 2];
    const bx = m.pos[t * 9 + 3], by = m.pos[t * 9 + 4], bz = m.pos[t * 9 + 5];
    const cx = m.pos[t * 9 + 6], cy = m.pos[t * 9 + 7], cz = m.pos[t * 9 + 8];
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  for (const n of edges.values()) if (n !== 2) return null;
  return vol;
}

/**
 * Components that touch neither the ground nor any other component (inflated boxes touching = connected). Returns the floaters,
 * i.e. every component outside the set reachable from the ground band.
 */
export function floaters(comps: Component[], eps = 0.012, groundY = 0.02): Component[] {
  const n = comps.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const order = comps.map((_, i) => i).sort((a, b) => comps[a].box.min.x - comps[b].box.min.x);
  const boxes = comps.map(c => c.box.clone().expandByScalar(eps));
  for (let ai = 0; ai < n; ai++) {
    const a = order[ai];
    for (let bi = ai + 1; bi < n; bi++) {
      const b = order[bi];
      if (boxes[b].min.x > boxes[a].max.x) break;
      if (boxes[a].intersectsBox(boxes[b])) { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; }
    }
  }
  const grounded = new Set<number>();
  comps.forEach((c, i) => { if (c.box.min.y <= groundY) grounded.add(find(i)); });
  return comps.filter((_, i) => !grounded.has(find(i)));
}

export interface Ray { o: THREE.Vector3; d: THREE.Vector3 }

/** Nearest hit distance of a ray against the triangles of the given meshes (Moller-Trumbore, both faces), or Infinity. */
export function rayHit(meshes: AuditMesh[], ray: Ray, maxT = Infinity): number {
  let best = maxT;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), pv = new THREE.Vector3(), tv = new THREE.Vector3(), qv = new THREE.Vector3();
  for (const m of meshes) {
    for (let t = 0; t < m.tris; t++) {
      a.fromArray(m.pos, t * 9); b.fromArray(m.pos, t * 9 + 3); c.fromArray(m.pos, t * 9 + 6);
      e1.subVectors(b, a); e2.subVectors(c, a);
      pv.crossVectors(ray.d, e2);
      const det = e1.dot(pv);
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det;
      tv.subVectors(ray.o, a);
      const u = tv.dot(pv) * inv;
      if (u < 0 || u > 1) continue;
      qv.crossVectors(tv, e1);
      const v = ray.d.dot(qv) * inv;
      if (v < 0 || u + v > 1) continue;
      const tt = e2.dot(qv) * inv;
      if (tt > 1e-6 && tt < best) best = tt;
    }
  }
  return best;
}

export interface ZFight { a: string; b: string; axis: string; at: number; area: number; box: THREE.Box3 }

/**
 * Coplanar, same-facing, axis-aligned faces of two different meshes that overlap (the classic z-fight: two surfaces at the same depth
 * flicker). Faces closer than `eps` along their normal count as the same plane. Returns the overlaps over `minArea`.
 */
export function zFights(meshes: AuditMesh[], eps = 4e-4, minArea = 2e-4): ZFight[] {
  type Face = { mesh: number; axis: number; sign: number; d: number; u0: number; u1: number; v0: number; v1: number; box: THREE.Box3 };
  const faces: Face[] = [];
  const n = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  meshes.forEach((m, mi) => {
    if (/_(glow|glass|string)$/.test(m.name) || /stakes|scaffold/.test(m.layer)) return;
    for (let t = 0; t < m.tris; t++) {
      a.fromArray(m.pos, t * 9); b.fromArray(m.pos, t * 9 + 3); c.fromArray(m.pos, t * 9 + 6);
      e1.subVectors(b, a); e2.subVectors(c, a); n.crossVectors(e1, e2);
      const len = n.length(); if (len < 1e-9) continue;
      n.divideScalar(len);
      const ax = Math.abs(n.x) > 0.9999 ? 0 : Math.abs(n.y) > 0.9999 ? 1 : Math.abs(n.z) > 0.9999 ? 2 : -1;
      if (ax < 0) continue;
      const sign = Math.sign(n.getComponent(ax));
      const [ua, va] = ax === 0 ? [1, 2] : ax === 1 ? [0, 2] : [0, 1];
      const us = [a, b, c].map(p => p.getComponent(ua)), vs = [a, b, c].map(p => p.getComponent(va));
      const box = new THREE.Box3().setFromPoints([a, b, c]);
      faces.push({ mesh: mi, axis: ax, sign, d: a.getComponent(ax), u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs), box });
    }
  });
  const buckets = new Map<string, Face[]>();
  for (const f of faces) { const k = `${f.axis}|${f.sign}|${Math.round(f.d / eps)}`; let l = buckets.get(k); if (!l) buckets.set(k, l = []); l.push(f); }
  const out: ZFight[] = [], seen = new Set<string>();
  for (const [k, list] of buckets) {
    const [axs, sg, r] = k.split('|').map(Number);
    // neighbouring buckets hold the planes just across the rounding edge
    const near = [...(buckets.get(`${axs}|${sg}|${r + 1}`) ?? []), ...list];
    for (const f of list) for (const g of near) {
      if (f === g || f.mesh >= g.mesh || Math.abs(f.d - g.d) > eps) continue;
      const w = Math.min(f.u1, g.u1) - Math.max(f.u0, g.u0), h = Math.min(f.v1, g.v1) - Math.max(f.v0, g.v0);
      if (w <= 0 || h <= 0 || w * h < minArea) continue;
      const key = `${f.mesh}|${g.mesh}|${k}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a: meshes[f.mesh].name, b: meshes[g.mesh].name, axis: 'xyz'[axs] + (sg > 0 ? '+' : '-'), at: f.d, area: w * h, box: f.box });
    }
  }
  return out;
}
