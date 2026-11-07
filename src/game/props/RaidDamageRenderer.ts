/**
 * What a raid left standing (sim/raidDamage.ts), drawn where it happened and kept until the family mends it: a gap in the fence (broken
 * posts, a fallen panel, splintered planks, trampled dirt), a gate wrenched off its hinges (the leaf on the ground against a bent post, a
 * dangling chain), a burned wreck (a charred, blackened patch with fallen beams and a ring of ash). One merged mesh with vertex colors:
 * a single draw call, built only when the list changes, and none at all on a place with no damage. Scale: 1 unit = 6 m.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RaidDamage } from '../../sim/raidDamage';
import { mulberry32 } from '../../sim/rng';

type Ground = (x: number, z: number) => number;

function part(geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  // (1.5x: a palisade stands 0.35 tall at this scale, and the wreck has to read from the diorama camera too)
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x * 1.5, y * 1.5, z * 1.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1.5, 1.5, 1.5)));
  const c = new THREE.Color(color), n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** The pieces of one damage, in its own frame (origin on the ground, +x along the wall). */
export function damagePieces(d: Pick<RaidDamage, 'kind' | 'id'>): THREE.BufferGeometry[] {
  let h = 0; for (const ch of d.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const r = mulberry32(h + 7), out: THREE.BufferGeometry[] = [];
  const wood = [0x6b5a45, 0x5a4a38, 0x7a6a52], char = [0x1a1713, 0x241f1a, 0x15120f];
  if (d.kind === 'breach') {
    out.push(part(new THREE.CylinderGeometry(0.28, 0.34, 0.012, 9), 0x3a2f24, 0, 0.007, 0));                       // trampled dirt
    out.push(part(box(0.025, 0.28, 0.025), wood[0], -0.22, 0.12, 0.02, 0.1, 0, 0.45));                            // broken posts, leaning out
    out.push(part(box(0.025, 0.2, 0.025), wood[1], 0.2, 0.08, -0.03, -0.12, 0, -0.6));
    out.push(part(box(0.42, 0.22, 0.012), 0x8a8478, -0.02, 0.012, 0.1, -Math.PI / 2 + 0.05, 0.2, 0));              // the fallen panel
    for (let i = 0; i < 4; i++) out.push(part(box(0.2, 0.012, 0.03), wood[i % 3], (r() - 0.5) * 0.5, 0.01 + i * 0.004, (r() - 0.5) * 0.35, 0, r() * 3, 0));   // splintered planks
    out.push(part(box(0.3, 0.004, 0.004), 0x55585c, 0.05, 0.016, -0.12, 0, 0.7, 0));                               // snapped wire
  } else if (d.kind === 'gate') {
    out.push(part(new THREE.CylinderGeometry(0.3, 0.36, 0.012, 9), 0x3a2f24, 0, 0.007, 0));
    out.push(part(box(0.03, 0.34, 0.03), 0x44474b, -0.24, 0.14, 0, 0, 0, 0.35));                                    // the hinge post, bent
    out.push(part(box(0.42, 0.28, 0.018), 0x6a6e72, 0.04, 0.13, 0.09, 0.2, 0.25, 0.95));                            // the leaf, lying against it
    out.push(part(box(0.38, 0.014, 0.014), 0x55585c, 0.0, 0.2, 0.13, 0.2, 0.25, 0.95));
    out.push(part(box(0.2, 0.004, 0.004), 0x77797c, 0.18, 0.012, -0.1, 0, 0.9, 0));                                 // the chain on the ground
    out.push(part(box(0.05, 0.03, 0.03), 0x2a2c2e, 0.3, 0.015, 0.05));                                              // the padlock
  } else {
    out.push(part(new THREE.CylinderGeometry(0.5, 0.56, 0.01, 11), char[0], 0, 0.006, 0));                          // scorched ground
    out.push(part(new THREE.CylinderGeometry(0.28, 0.32, 0.016, 9), 0x3b3835, 0.04, 0.012, -0.04));                // ash
    for (let i = 0; i < 6; i++) out.push(part(box(0.5 + r() * 0.2, 0.035, 0.035), char[i % 3], (r() - 0.5) * 0.4, 0.03 + (i % 3) * 0.03, (r() - 0.5) * 0.4, (r() - 0.5) * 0.3, r() * Math.PI, (r() - 0.5) * 0.2));   // fallen beams
    out.push(part(box(0.04, 0.3, 0.04), char[1], 0.3, 0.14, 0.1, 0.1, 0, 0.12));                                   // a standing post, black
  }
  return out;
}

/** A house with broken windows: glass on the ground along two sides, a few dark broken sashes lying where they fell. `box` is its footprint on the ground. */
export interface GlassHome { id: string; x0: number; z0: number; x1: number; z1: number }
export function glassPieces(h: GlassHome, ground: Ground): THREE.BufferGeometry[] {
  // (positions are world coordinates: `part` scales its offsets 1.5x, so they are divided here)
  const wpart = (g: THREE.BufferGeometry, c: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => part(g, c, x / 1.5, y / 1.5, z / 1.5, rx, ry, rz);
  let seed = 0; for (const ch of h.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const r = mulberry32(seed + 3), out: THREE.BufferGeometry[] = [];
  const along = (t: number, side: number): [number, number] => side === 0 ? [h.x0 + (h.x1 - h.x0) * t, h.z1 + 0.04 + r() * 0.22] : [h.x1 + 0.04 + r() * 0.22, h.z0 + (h.z1 - h.z0) * t];
  for (let i = 0; i < 22; i++) {
    const [x, z] = along(r(), i % 2), w = 0.05 + r() * 0.08;
    out.push(wpart(new THREE.BoxGeometry(w, 0.004, w * (0.4 + r() * 0.6)), i % 3 ? 0xdfeaf2 : 0xb9cfdc, x, ground(x, z) + 0.004 + r() * 0.002, z, 0, r() * 3.14, 0));
  }
  for (let i = 0; i < 2; i++) { const [x, z] = along(0.25 + i * 0.45, 0); out.push(wpart(new THREE.BoxGeometry(0.16, 0.012, 0.1), 0x2a2a28, x, ground(x, z) + 0.01, z + 0.1, 0, r() * 1.2, 0)); }
  return out;
}

/** Local frame to world: rotate by the wall's heading (0 for a burn). */
function placed(list: THREE.BufferGeometry[], x: number, y: number, z: number, ry: number): THREE.BufferGeometry[] {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
  return list.map(g => g.applyMatrix4(m));
}

/** Build the merged geometry for a list of damage (null: none). `heading` is the wall direction at a damage, in radians. */
export function buildDamageGeometry(items: readonly RaidDamage[], ground: Ground, heading: (d: RaidDamage) => number, glass: readonly GlassHome[] = []): THREE.BufferGeometry | null {
  const all: THREE.BufferGeometry[] = [];
  for (const h of glass) all.push(...glassPieces(h, ground).map(g => g));
  for (const d of items) if (d.done < d.hours) all.push(...placed(damagePieces(d), d.x, ground(d.x, d.z), d.z, d.kind === 'burn' ? 0 : heading(d)));
  return all.length ? mergeGeometries(all) : null;
}

export class RaidDamageRenderer {
  private _mesh: THREE.Mesh | null = null;
  private _key = '';
  private readonly _mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.05 });
  private readonly _scene: THREE.Scene;
  private readonly _ground: Ground;
  private readonly _heading: (d: RaidDamage) => number;
  constructor(scene: THREE.Scene, ground: Ground, heading: (d: RaidDamage) => number) { this._scene = scene; this._ground = ground; this._heading = heading; }

  sync(items: readonly RaidDamage[] | undefined, glass: readonly GlassHome[] = []): void {
    const open = (items ?? []).filter(d => d.done < d.hours);
    const key = open.map(d => d.id).join() + '|' + glass.map(h => h.id).join();
    if (key === this._key) return;
    this._key = key;
    if (this._mesh) { this._scene.remove(this._mesh); this._mesh.geometry.dispose(); this._mesh = null; }
    const geo = buildDamageGeometry(open, this._ground, this._heading, glass);
    if (!geo) return;
    this._mesh = new THREE.Mesh(geo, this._mat);
    this._mesh.name = 'raid-damage';
    this._mesh.userData = { noSSAO: true };
    this._mesh.castShadow = false;
    this._scene.add(this._mesh);
  }

  /** QA: how many draw calls the damage costs (0 or 1). */
  get drawCalls(): number { return this._mesh ? 1 : 0; }
  dispose(): void { this.sync([]); this._mat.dispose(); }
}
