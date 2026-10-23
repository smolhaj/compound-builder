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

export const trunkRadius = (scale: number) => 0.07 * scale;

const BARK = new THREE.MeshStandardMaterial({ color: 0x5b4532, roughness: 0.95 });
const CUT = new THREE.MeshStandardMaterial({ color: 0xd9b98a, roughness: 0.85 });
const PAINT = new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6, emissive: new THREE.Color(0.25, 0.06, 0) });
const SLASH = new THREE.MeshStandardMaterial({ color: 0x41532c, roughness: 0.95 });
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
  const bark: THREE.BufferGeometry[] = [], cut: THREE.BufferGeometry[] = [], paint: THREE.BufferGeometry[] = [], slash: THREE.BufferGeometry[] = [], dry: THREE.BufferGeometry[] = [];
  const stump = (t: ParcelTree, y: number) => {
    const r = trunkRadius(t.scale);
    bark.push(new THREE.CylinderGeometry(r * 0.95, r * 1.2, 0.05, 9).translate(t.x, y + 0.02, t.z));
    cut.push(new THREE.CircleGeometry(r * 0.93, 9).rotateX(-Math.PI / 2).translate(t.x, y + 0.046, t.z));
  };
  for (const j of o.jobs) {
    const t = o.tree(j.treeId);
    if (!t) continue;
    const y = o.ground(t.x, t.z), r = trunkRadius(t.scale), h = fallHeading(t.id);
    if (j.stage === 'marked') {
      paint.push(new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.035, 10, 1, true).translate(t.x, y + 0.16, t.z));
      continue;
    }
    stump(t, y);
    const len = 2.6 * t.scale * t.sy, dx = Math.sin(h), dz = Math.cos(h);
    const bx = t.x + dx * 0.08, bz = t.z + dz * 0.08, gy = o.ground(bx + dx * len / 2, bz + dz * len / 2);
    const ly = Math.min(y, gy);
    if (j.stage === 'felled') {
      bark.push(logAlong(bx, ly, bz, h, len, r * 0.95, r * 0.3));
      // the crown lying in the grass: a few flattened clumps toward the top
      for (let k = 0; k < 5; k++) {
        const f = 0.55 + k * 0.1, s = (0.28 - k * 0.03) * t.scale;
        const g = new THREE.IcosahedronGeometry(s, 0).scale(1, 0.45, 1);
        const side = (k % 2 ? 1 : -1) * 0.05;
        slash.push(g.translate(bx + dx * len * f + dz * side, ly + s * 0.35, bz + dz * len * f - dx * side));
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
      dry.push(new THREE.IcosahedronGeometry(0.16 * t.scale, 0).scale(1.4, 0.4, 1).rotateY(h).translate(bx + dx * len * 0.85, ly + 0.03, bz + dz * len * 0.85));
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
  add(slash, SLASH, true);
  add(dry, DRY, true);
  g.userData.type = 'woods';
  return g;
}
