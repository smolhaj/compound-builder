/**
 * The woods at work: orange paint bands on marked trees, felled trees lying
 * where they dropped, bucked log sections with a slash pile, and stumps
 * where trees have been hauled off. Rebuilt (merged, a few draw calls) when
 * the forestry state changes. Sizes follow the forest trees (trunk radius
 * ≈ 0.07 × scale, height ≈ 3 × scale × sy).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FellJob } from '../../sim/state';
import type { ParcelTree } from '../parcel/parcelTrees';

/** Direction a tree falls (stable per tree; radians about y). */
export function fallHeading(treeId: number): number {
  const x = Math.sin(treeId * 12.9898 + 4.1) * 43758.5453;
  return (x - Math.floor(x)) * Math.PI * 2;
}

/** Trunk radius at chest height (measured off the forest tree geometry: conifer ≈ 0.09, broadleaf ≈ 0.12 × scale). */
export const trunkRadius = (scale: number, kind = 'conifer') => (kind === 'conifer' ? 0.09 : 0.12) * scale;

const BARK = new THREE.MeshStandardMaterial({ color: 0x5b4532, roughness: 0.95 });
const CUT = new THREE.MeshStandardMaterial({ color: 0xd9b98a, roughness: 0.85 });
const PAINT = new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6, emissive: new THREE.Color(0.25, 0.06, 0) });
const NEEDLES = new THREE.MeshStandardMaterial({ color: 0x2f4f36, roughness: 0.95 });
const LEAVES = new THREE.MeshStandardMaterial({ color: 0x3d6129, roughness: 0.95 });
const FLAG = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.55, emissive: new THREE.Color(0.3, 0.08, 0), side: THREE.DoubleSide });
const DRY = new THREE.MeshStandardMaterial({ color: 0x6d5a3c, roughness: 0.95 });

/** A log lying from (x, y, z) along heading `h`, `len` long, tapering r0 → r1. */
function logAlong(x: number, y: number, z: number, h: number, len: number, r0: number, r1: number): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r1, r0, len, 7)
    .rotateX(Math.PI / 2).translate(0, r0 * 0.9, len / 2)
    .rotateY(h).translate(x, y, z);
}

export interface WoodsInput {
  jobs: readonly FellJob[];
  cleared: readonly number[];
  /** Tree lookup by id (full-density plan). */
  tree: (id: number) => ParcelTree | undefined;
  ground: (x: number, z: number) => number;
}

export function buildWoods(o: WoodsInput): THREE.Group {
  const bark: THREE.BufferGeometry[] = [], cut: THREE.BufferGeometry[] = [], paint: THREE.BufferGeometry[] = [], needles: THREE.BufferGeometry[] = [], leaves: THREE.BufferGeometry[] = [], dry: THREE.BufferGeometry[] = [], flags: THREE.BufferGeometry[] = [];
  const stump = (t: ParcelTree, y: number) => {
    const r = trunkRadius(t.scale, t.kind);
    bark.push(new THREE.CylinderGeometry(r * 0.95, r * 1.2, 0.05, 9).translate(t.x, y + 0.02, t.z));
    cut.push(new THREE.CircleGeometry(r * 0.93, 9).rotateX(-Math.PI / 2).translate(t.x, y + 0.046, t.z));
  };
  for (const j of o.jobs) {
    const t = o.tree(j.treeId);
    if (!t) continue;
    const y = o.ground(t.x, t.z), r = trunkRadius(t.scale, t.kind), h = fallHeading(t.id);
    if (j.stage === 'marked') {
      // paint band round the trunk, and a flagging stake out past the crown so the mark reads from above
      paint.push(new THREE.CylinderGeometry(r * 1.05, r * 1.05, 0.05, 12, 1, true).translate(t.x, y + 0.34, t.z));
      const fx = t.x - Math.sin(h) * 0.85 * t.scale * t.sx, fz = t.z - Math.cos(h) * 0.85 * t.scale * t.sx, fy = o.ground(fx, fz);
      bark.push(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 5).translate(fx, fy + 0.13, fz));
      flags.push(new THREE.PlaneGeometry(0.1, 0.05).translate(0.05, 0, 0).rotateY(h).translate(fx, fy + 0.23, fz));
      continue;
    }
    stump(t, y);
    const len = 2.6 * t.scale * t.sy, dx = Math.sin(h), dz = Math.cos(h);
    const bx = t.x + dx * 0.08, bz = t.z + dz * 0.08, gy = o.ground(bx + dx * len / 2, bz + dz * len / 2);
    const ly = Math.min(y, gy);
    if (j.stage === 'felled') {
      bark.push(logAlong(bx, ly, bz, h, len, r * 0.95, r * 0.3));
      // the crown lying in the grass, crushed flat on its underside
      if (j.kind === 'conifer') {
        const cl = len * 0.8, cr = 0.75 * t.scale * t.sx;
        needles.push(new THREE.ConeGeometry(cr, cl, 9, 3).scale(1, 1, 0.5).rotateX(Math.PI / 2).translate(0, cr * 0.42, len * 0.2 + cl / 2).rotateY(h).translate(bx, ly, bz));
      } else {
        const R = 0.38 * t.scale * t.sx;
        for (let k = 0; k < 4; k++) {
          const f = 0.62 + k * 0.1, rr = R * (1 - k * 0.12), side = (k % 2 ? 1 : -1) * R * 0.35;
          leaves.push(new THREE.IcosahedronGeometry(rr, 2).scale(1, 0.4, 1).translate(bx + dx * len * f + dz * side, ly + rr * 0.35, bz + dz * len * f - dx * side));
        }
      }
    } else {
      // bucked: sections in a row, cut faces showing, slash heaped at the top end
      const n = j.kind === 'conifer' ? 3 : 2, sec = len * 0.18;
      for (let k = 0; k < n; k++) {
        const f = 0.08 + k * 0.24, rr = r * (0.95 - k * 0.15);
        const sx = bx + dx * len * f + dz * 0.03 * (k % 2), sz = bz + dz * len * f - dx * 0.03 * (k % 2);
        bark.push(logAlong(sx, ly, sz, h, sec, rr, rr * 0.92));
        cut.push(new THREE.CircleGeometry(rr * 0.9, 8).rotateY(h + Math.PI).translate(sx, ly + rr * 0.9, sz));
      }
      // limbs and top heaped in a slash pile
      const sp = 0.32 * t.scale;
      dry.push(new THREE.IcosahedronGeometry(sp, 1).scale(1.5, 0.45, 1).rotateY(h).translate(bx + dx * len * 0.82, ly + sp * 0.2, bz + dz * len * 0.82));
      (j.kind === 'conifer' ? needles : leaves).push(new THREE.IcosahedronGeometry(sp * 0.8, 1).scale(1.3, 0.4, 0.9).rotateY(h + 0.6).translate(bx + dx * len * 0.9, ly + sp * 0.3, bz + dz * len * 0.9));
    }
  }
  for (const id of o.cleared) {
    const t = o.tree(id);
    if (t) stump(t, o.ground(t.x, t.z));
  }
  const g = new THREE.Group();
  const add = (list: THREE.BufferGeometry[], mat: THREE.Material, shadow: boolean) => {
    if (!list.length) return;
    const geo = mergeGeometries(list.map(x => (x.index ? x.toNonIndexed() : x)));
    list.forEach(x => x.dispose());
    if (!geo) return;
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    g.add(m);
  };
  add(bark, BARK, true);
  add(cut, CUT, false);
  add(paint, PAINT, false);
  add(needles, NEEDLES, true);
  add(leaves, LEAVES, true);
  add(dry, DRY, true);
  add(flags, FLAG, false);
  g.userData.type = 'woods';
  return g;
}
