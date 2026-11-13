/**
 * Geometry audit helpers (tests only): flatten a built group into world-space parts and check the things a wrong procedural
 * generation shows up as: NaN vertices, degenerate triangles, parts that hover, parts buried in the ground, wall that cuts a corner.
 */
import * as THREE from 'three';

export interface Part { mat: string; minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number; low: Array<[number, number, number]>; tris: number }
export interface Audit { nanVerts: number; degenerate: number; mirrored: number; tris: number; meshes: number; parts: Part[]; verts: Float32Array[] }

const key = (x: number, y: number, z: number) => `${Math.round(x * 2e4)},${Math.round(y * 2e4)},${Math.round(z * 2e4)}`;

export function audit(root: THREE.Object3D): Audit {
  root.updateMatrixWorld(true);
  const out: Audit = { nanVerts: 0, degenerate: 0, mirrored: 0, tris: 0, meshes: 0, parts: [], verts: [] };
  const v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  root.traverse(o => {
    const m = o as THREE.Mesh;
    const g = m.geometry as THREE.BufferGeometry | undefined;
    const pos = g?.getAttribute?.('position');
    if (!g || !pos) return;
    const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh) : null;
    const mats: THREE.Matrix4[] = [];
    if (inst) for (let i = 0; i < inst.count; i++) { const mm = new THREE.Matrix4(); inst.getMatrixAt(i, mm); mats.push(mm.premultiply(m.matrixWorld)); } else mats.push(m.matrixWorld);
    out.meshes++;
    const mat = Array.isArray(m.material) ? m.material[0] : m.material; const name = mat?.name || "?";
    for (const mw of mats) {
      if (mw.determinant() < 0) out.mirrored++;
      const w = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mw);
        if (!Number.isFinite(v.x + v.y + v.z)) out.nanVerts++;
        w[i * 3] = v.x; w[i * 3 + 1] = v.y; w[i * 3 + 2] = v.z;
      }
      out.verts.push(w);
      const idx = g.getIndex();
      const n = idx ? idx.count / 3 : pos.count / 3;
      // union-find over welded positions
      const id = new Map<string, number>(); const parent: number[] = [];
      const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
      const nodeOf = (vi: number) => { const k = key(w[vi * 3], w[vi * 3 + 1], w[vi * 3 + 2]); let r = id.get(k); if (r === undefined) { r = parent.length; parent.push(r); id.set(k, r); } return r; };
      const triNodes: number[][] = [];
      for (let t = 0; t < n; t++) {
        const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        a.set(w[i0 * 3], w[i0 * 3 + 1], w[i0 * 3 + 2]); b.set(w[i1 * 3], w[i1 * 3 + 1], w[i1 * 3 + 2]); c.set(w[i2 * 3], w[i2 * 3 + 1], w[i2 * 3 + 2]);
        out.tris++;
        b.sub(a); c.sub(a);
        if (b.cross(c).length() < 1e-9) { out.degenerate++; continue; }
        const nn = [nodeOf(i0), nodeOf(i1), nodeOf(i2)];
        triNodes.push([i0, ...nn]);
        parent[find(nn[1])] = find(nn[0]); parent[find(nn[2])] = find(nn[0]);
      }
      const by = new Map<number, Part>();
      for (const tn of triNodes) {
        const r = find(tn[1]);
        let p = by.get(r);
        if (!p) { p = { mat: name, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity, low: [], tris: 0 }; by.set(r, p); }
        p.tris++;
        for (const vi of [tn[0]]) void vi;
      }
      // bounds per component need all three verts of each triangle
      for (let t = 0, k = 0; t < n; t++) {
        const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        const nd = id.get(key(w[i0 * 3], w[i0 * 3 + 1], w[i0 * 3 + 2]));
        if (nd === undefined) continue;
        const p = by.get(find(nd)); if (!p) continue;
        for (const vi of [i0, i1, i2]) {
          const x = w[vi * 3], y = w[vi * 3 + 1], z = w[vi * 3 + 2];
          if (x < p.minX) p.minX = x; if (x > p.maxX) p.maxX = x; if (y < p.minY) p.minY = y; if (y > p.maxY) p.maxY = y; if (z < p.minZ) p.minZ = z; if (z > p.maxZ) p.maxZ = z;
        }
        void k;
      }
      // lowest vertices (within 1 cm of the part's floor)
      for (let t = 0; t < n; t++) {
        const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        const nd = id.get(key(w[i0 * 3], w[i0 * 3 + 1], w[i0 * 3 + 2]));
        if (nd === undefined) continue;
        const p = by.get(find(nd)); if (!p) continue;
        for (const vi of [i0, i1, i2]) if (w[vi * 3 + 1] < p.minY + 0.01 && p.low.length < 40) p.low.push([w[vi * 3], w[vi * 3 + 1], w[vi * 3 + 2]]);
      }
      out.parts.push(...by.values());
    }
  });
  return out;
}

/**
 * Parts with no unbroken chain of contact down to the ground: a part is grounded when its lowest points are at or under the terrain; any other part
 * must touch (bounds within `eps`) a part that is. A cab on legs that stop short of the ground fails here though the cab touches its legs.
 */
export function floating(parts: Part[], ground: (x: number, z: number) => number, tol = 0.03, eps = 0.03): Part[] {
  const ok = new Set<Part>();
  const queue: Part[] = [];
  for (const p of parts) if (p.low.some(([x, y, z]) => y <= ground(x, z) + tol)) { ok.add(p); queue.push(p); }
  const touch = (p: Part, q: Part) => q.minX <= p.maxX + eps && q.maxX >= p.minX - eps && q.minZ <= p.maxZ + eps && q.maxZ >= p.minZ - eps && q.minY <= p.maxY + eps && q.maxY >= p.minY - eps;
  while (queue.length) {
    const p = queue.pop() as Part;
    for (const q of parts) if (!ok.has(q) && touch(p, q)) { ok.add(q); queue.push(q); }
  }
  return parts.filter(p => !ok.has(p));
}

/** Parts entirely under the terrain (invisible, wasted draw). */
export function buried(parts: Part[], ground: (x: number, z: number) => number, margin = 0.01): Part[] {
  return parts.filter(p => {
    const cx = (p.minX + p.maxX) / 2, cz = (p.minZ + p.maxZ) / 2;
    const g = Math.max(ground(p.minX, p.minZ), ground(p.maxX, p.maxZ), ground(p.minX, p.maxZ), ground(p.maxX, p.minZ), ground(cx, cz));
    return p.maxY < g - margin;
  });
}
