/**
 * Draws the stored food on the shelves and pallets of every storeroom,
 * cellar and pantry (foodShelfPlan.ts decides what goes where): sealed
 * buckets with colored gamma lids, #10 cans, cans by the case, Mylar
 * pouches, sacks and paper bags, oil and honey jugs, quart jars, cases.
 *
 * One InstancedMesh per part for the whole compound (ten draw calls,
 * whatever is stored), instance colors for lids, labels and contents.
 * Rebuilt only when what's shown changes.
 */
import * as THREE from 'three';
import { M } from '../buildkit/interior';
import type { FoodSlot } from '../buildkit/shell';
import { PROP_SIZE, type PropPlace, type ShelfProp } from './foodShelfPlan';

type Part = 'bucket' | 'lid' | 'canBody' | 'canLabel' | 'soft' | 'jug' | 'cap' | 'jar' | 'jarLid' | 'case';
const PARTS: readonly Part[] = ['bucket', 'lid', 'canBody', 'canLabel', 'soft', 'jug', 'cap', 'jar', 'jarLid', 'case'];

/** A sack / bag / pouch: a box with its top and edges slumped. */
function softGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1, 4, 2, 4);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const edge = (x * x + z * z) * 2;                  // 0 in the middle … 1 at the corners
    p.setY(i, y > 0 ? y * (1 - 0.45 * edge) : y);
    p.setX(i, x * (1 - 0.08 * (y + 0.5)));
    p.setZ(i, z * (1 - 0.08 * (y + 0.5)));
  }
  g.computeVertexNormals();
  return g.translate(0, 0.5, 0);
}

function geometry(part: Part): THREE.BufferGeometry {
  switch (part) {
    // unit-sized where the props reuse them at their own sizes (scale in the instance matrix)
    case 'bucket': return new THREE.CylinderGeometry(0.5, 0.45, 0.92, 14, 1).translate(0, 0.46, 0);
    case 'lid': return new THREE.CylinderGeometry(0.52, 0.52, 0.08, 14).translate(0, 0.96, 0);
    case 'canBody': return new THREE.CylinderGeometry(0.5, 0.5, 1, 12).translate(0, 0.5, 0);
    case 'canLabel': return new THREE.CylinderGeometry(0.505, 0.505, 0.72, 12, 1, true).translate(0, 0.5, 0);
    case 'soft': return softGeometry();
    case 'jug': {
      const g = new THREE.BoxGeometry(1, 0.86, 1).translate(0, 0.43, 0);
      return g;
    }
    case 'cap': return new THREE.CylinderGeometry(0.18, 0.18, 0.14, 8).translate(-0.18, 0.93, 0);
    case 'jar': return new THREE.CylinderGeometry(0.5, 0.5, 0.86, 10).translate(0, 0.43, 0);
    case 'jarLid': return new THREE.CylinderGeometry(0.44, 0.44, 0.12, 10).translate(0, 0.92, 0);
    case 'case': return new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  }
}

function material(part: Part): THREE.MeshStandardMaterial {
  switch (part) {
    case 'bucket': return new THREE.MeshStandardMaterial({ color: 0xeeece4, roughness: 0.55 });
    case 'canBody': return new THREE.MeshStandardMaterial({ color: 0xb4b8bc, roughness: 0.35, metalness: 0.75 });
    case 'jarLid': return new THREE.MeshStandardMaterial({ color: 0xc8a040, roughness: 0.35, metalness: 0.7 });
    case 'cap': return new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5 });
    case 'jar': return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.05 });
    case 'jug': return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    case 'case': return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    default: return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
  }
}

/** Which parts make a prop, and each part's size (m) relative to the prop's footprint. */
const MAKE: Record<ShelfProp, Array<{ part: Part; tint: 'item' | 'white' | 'card' | 'mylar' | 'paper' }>> = {
  bucket: [{ part: 'bucket', tint: 'white' }, { part: 'lid', tint: 'item' }],
  can10: [{ part: 'canBody', tint: 'white' }, { part: 'canLabel', tint: 'item' }],
  can: [{ part: 'canBody', tint: 'white' }, { part: 'canLabel', tint: 'item' }],
  mylar: [{ part: 'soft', tint: 'mylar' }],
  sack: [{ part: 'soft', tint: 'item' }],
  bag: [{ part: 'soft', tint: 'item' }],
  jug: [{ part: 'jug', tint: 'item' }, { part: 'cap', tint: 'white' }],
  honey: [{ part: 'jug', tint: 'item' }, { part: 'cap', tint: 'white' }],
  jar: [{ part: 'jar', tint: 'item' }, { part: 'jarLid', tint: 'white' }],
  case: [{ part: 'case', tint: 'card' }],
  pack: [{ part: 'soft', tint: 'paper' }],
};

/** Home-canned jars vary jar to jar (tomatoes, green beans, peaches, corn, beets). */
const JAR_MIX = [0xb84a30, 0x5a8a3a, 0xe0962a, 0xd8c040, 0x8a2a4a];
const PAPER = new THREE.Color(0xeee6d8), CARD = new THREE.Color(0xb08a5a), MYLAR = new THREE.Color(0xc8ccd2), WHITE = new THREE.Color(0xffffff);

export interface ShownPlace { place: PropPlace; slot: FoodSlot; world: THREE.Matrix4 }

export class FoodShelfRenderer {
  readonly group = new THREE.Group();
  private readonly _mesh = new Map<Part, THREE.InstancedMesh>();
  private readonly _geo = new Map<Part, THREE.BufferGeometry>();
  private readonly _mat = new Map<Part, THREE.MeshStandardMaterial>();
  /** Props drawn by kind (QA). */
  counts: Partial<Record<ShelfProp, number>> = {};

  constructor() { this.group.name = 'foodShelves'; }

  /** Lay the props out (each place on its slot, in its building's world matrix). */
  update(shown: readonly ShownPlace[]): void {
    const need = new Map<Part, number>();
    for (const s of shown) for (const m of MAKE[s.place.prop]) need.set(m.part, (need.get(m.part) ?? 0) + 1);
    for (const part of PARTS) {
      const n = need.get(part) ?? 0;
      let mesh = this._mesh.get(part);
      if (!mesh || mesh.instanceMatrix.count < n) {
        if (mesh) { this.group.remove(mesh); mesh.dispose(); }
        if (!this._geo.has(part)) { this._geo.set(part, geometry(part)); this._mat.set(part, material(part)); }
        mesh = new THREE.InstancedMesh(this._geo.get(part)!, this._mat.get(part)!, Math.max(16, Math.ceil(n * 1.3)));
        mesh.name = `food_${part}`;
        mesh.frustumCulled = false;
        mesh.castShadow = false; mesh.receiveShadow = true;
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count * 3), 3);
        this._mesh.set(part, mesh);
        this.group.add(mesh);
      }
      mesh.count = 0;
    }
    const basis = new THREE.Matrix4(), local = new THREE.Matrix4(), out = new THREE.Matrix4(), scale = new THREE.Matrix4(), col = new THREE.Color();
    const u = new THREE.Vector3(), f = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    this.counts = {};
    shown.forEach((s, k) => {
      const { place: p, slot } = s, z = PROP_SIZE[p.prop];
      this.counts[p.prop] = (this.counts[p.prop] ?? 0) + 1;
      u.set(...slot.u); f.set(...slot.f);
      // slot frame: x along the board, z toward its front, y up; the prop's spot on it (m → world units)
      basis.makeBasis(u, up, f).setPosition(slot.o[0] + (u.x * p.x + f.x * p.z) * M, slot.o[1] + p.y * M + 0.0015, slot.o[2] + (u.z * p.x + f.z * p.z) * M);
      // a little irregularity: nothing on a real shelf sits square
      const jig = ((k * 2654435761) >>> 0) / 4294967296;
      local.makeRotationY((jig - 0.5) * (p.prop === 'bucket' || p.prop.startsWith('can') || p.prop === 'jar' ? 2 : 0.12));
      for (const m of MAKE[p.prop]) {
        const mesh = this._mesh.get(m.part)!;
        const w = p.prop === 'jug' || p.prop === 'honey' ? [z.w * 0.92, z.h, z.d * 0.9] : p.prop === 'case' || p.prop === 'sack' || p.prop === 'bag' || p.prop === 'mylar' ? [z.w * 0.96, z.h, z.d * 0.94] : [z.w * 0.94, z.h, z.d * 0.94];
        scale.makeScale(w[0] * M, w[1] * M, w[2] * M);
        out.multiplyMatrices(s.world, basis).multiply(local).multiply(scale);
        const i = mesh.count++;
        mesh.setMatrixAt(i, out);
        if (m.tint === 'white') col.copy(WHITE);
        else if (m.tint === 'mylar') col.copy(MYLAR);
        else if (m.tint === 'card') col.setHex(p.color).lerp(CARD, 0.7);
        else if (m.tint === 'paper') col.setHex(p.color).lerp(PAPER, (k % 3) === 0 ? 0.55 : 0.85);
        else col.setHex(p.id === 'home_canned' ? JAR_MIX[k % JAR_MIX.length] : p.color);
        mesh.setColorAt(i, col);
      }
    });
    for (const mesh of this._mesh.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.visible = mesh.count > 0;
    }
  }

  dispose(): void {
    for (const m of this._mesh.values()) m.dispose();
    for (const g of this._geo.values()) g.dispose();
    for (const m of this._mat.values()) m.dispose();
  }
}
