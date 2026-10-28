/**
 * Dome tents pitched in the yard when people sleep in them (sim/housing.ts
 * `tentsPitched`): a ground sheet, a low nylon dome with a rain fly, a door
 * flap, crossed poles and guy pegs, in a few faded colors. Scale: a 4-person
 * dome is 2.4 m square and 1.3 m high, so 0.4 × 0.4 × 0.22 world units (the
 * camp's wall tent, props/campGeometry, is the big canvas one). Procedural.
 */
import * as THREE from 'three';

/** Fly colors: faded orange, forest green, slate blue, mustard, rust. */
const FLY = [0xc4692a, 0x4f6a42, 0x4a6a86, 0xc2a23a, 0x9a4a30];
export const TENT = { w: 0.4, d: 0.4, h: 0.22 } as const;

/** Ring slots round the camp, nearest first: [distance from the camp center, angle]. The door of each faces the fire. */
const RING: ReadonlyArray<[number, number]> = [
  [1.55, 0.5], [1.55, 2.2], [1.75, 3.9], [1.55, 5.4], [2.05, 1.3], [2.05, 3.1], [2.05, 4.7], [2.35, 0.1], [2.35, 2.6], [2.35, 4.2], [2.6, 5.8], [2.6, 1.8],
];

/** World positions for `n` tents round `camp`, skipping any spot `blocked` (a building, the drive, a fence). */
export function tentSpots(camp: { x: number; z: number }, n: number, blocked: (x: number, z: number) => boolean): Array<{ x: number; z: number; rot: number }> {
  const out: Array<{ x: number; z: number; rot: number }> = [];
  for (const [r, a] of RING) {
    if (out.length >= n) break;
    const x = camp.x + Math.cos(a) * r, z = camp.z + Math.sin(a) * r;
    if (blocked(x, z)) continue;
    // door (+z in the tent's frame) toward the camp center
    out.push({ x, z, rot: Math.atan2(camp.x - x, camp.z - z) });
  }
  return out;
}

let shared: { sheet: THREE.MeshStandardMaterial; fly: THREE.MeshStandardMaterial[]; door: THREE.MeshStandardMaterial; pole: THREE.MeshStandardMaterial; dome: THREE.BufferGeometry; sheetG: THREE.BufferGeometry; doorG: THREE.BufferGeometry; poleG: THREE.BufferGeometry; pegG: THREE.BufferGeometry } | null = null;

function parts() {
  if (shared) return shared;
  const dome = new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(TENT.w, TENT.h, TENT.d);
  const sheetG = new THREE.CircleGeometry(0.5, 16).rotateX(-Math.PI / 2).scale(TENT.w * 1.12, 1, TENT.d * 1.12).translate(0, 0.004, 0);
  const doorG = new THREE.CircleGeometry(0.5, 12, 0, Math.PI).scale(TENT.w * 0.42, TENT.h * 0.78, 1).translate(0, 0, TENT.d * 0.455);
  const poleG = new THREE.TorusGeometry(0.5, 0.006, 4, 14, Math.PI).scale(TENT.w, TENT.h, 1);
  const pegG = new THREE.BoxGeometry(0.01, 0.03, 0.01);
  shared = {
    sheet: new THREE.MeshStandardMaterial({ color: 0x3b3a34, roughness: 1 }),
    fly: FLY.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, side: THREE.DoubleSide })),
    door: new THREE.MeshStandardMaterial({ color: 0x1d1e1a, roughness: 1, side: THREE.DoubleSide }),
    pole: new THREE.MeshStandardMaterial({ color: 0x8a8d8f, roughness: 0.4, metalness: 0.6 }),
    dome, sheetG, doorG, poleG, pegG,
  };
  return shared;
}

/** One tent, origin at the middle of its floor. */
export function buildTent(color: number): THREE.Group {
  const p = parts();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(p.sheetG, p.sheet));
  const fly = new THREE.Mesh(p.dome, p.fly[color % p.fly.length]);
  fly.castShadow = true;
  g.add(fly);
  g.add(new THREE.Mesh(p.doorG, p.door));
  const a = new THREE.Mesh(p.poleG, p.pole), b = new THREE.Mesh(p.poleG, p.pole);
  b.rotation.y = Math.PI / 2;
  a.scale.multiplyScalar(1.01); b.scale.multiplyScalar(1.01);
  g.add(a, b);
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
    const peg = new THREE.Mesh(p.pegG, p.pole);
    peg.position.set(x * TENT.w * 0.62, 0.012, z * TENT.d * 0.62);
    peg.rotation.set(0.5 * z, 0, -0.5 * x);
    g.add(peg);
  }
  return g;
}

/** The yard's tents: sync() pitches or strikes them to match the count. */
export class TentsRenderer {
  readonly group = new THREE.Group();
  private _key = '';
  constructor() { this.group.name = 'yard-tents'; }

  /** Pitch one tent per spot (idempotent: rebuilt only when the spots change). */
  sync(spots: ReadonlyArray<{ x: number; z: number; rot: number }>, groundAt: (x: number, z: number) => number): void {
    const key = spots.map(s => `${s.x.toFixed(2)},${s.z.toFixed(2)}`).join('|');
    if (key === this._key) return;
    this._key = key;
    this.group.clear();
    spots.forEach((s, i) => {
      const t = buildTent(i + 1);
      t.position.set(s.x, groundAt(s.x, s.z), s.z);
      t.rotation.y = s.rot;
      this.group.add(t);
    });
  }
}
