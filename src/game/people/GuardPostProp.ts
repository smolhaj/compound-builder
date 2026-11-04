/**
 * The guard dogs' posts, drawn: a small kennel with a gabled roof, a stake and a water bowl beside the spot a posted dog stands (dogGoals): one at the gate
 * on the property line and one just inside the innermost ring's gate (game/people/guardPost). SCALE v2: the kennel is 0.9 m wide, 0.8 m high.
 * Procedural; two shared materials, three small meshes a post.
 */
import * as THREE from 'three';

const W = 0.15, H = 0.12, D = 0.17;
let _wood: THREE.MeshStandardMaterial | null = null, _roof: THREE.MeshStandardMaterial | null = null, _steel: THREE.MeshStandardMaterial | null = null;

function build(): THREE.Group {
  _wood ??= new THREE.MeshStandardMaterial({ color: 0x8a6a46, roughness: 0.95 });
  _roof ??= new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: 0.9 });
  _steel ??= new THREE.MeshStandardMaterial({ color: 0x7b7f82, roughness: 0.5, metalness: 0.6 });
  const g = new THREE.Group();
  // the body: a box with a doorway cut by a dark inset, the gable roof two slabs
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D).translate(0, H / 2, 0), _wood);
  const door = new THREE.Mesh(new THREE.BoxGeometry(W * 0.5, H * 0.62, 0.004).translate(0, H * 0.31, D / 2 + 0.001), new THREE.MeshStandardMaterial({ color: 0x14100d, roughness: 1 }));
  const slab = (s: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(W * 0.62, 0.006, D * 1.12), _roof!);
    m.position.set(s * W * 0.25, H + 0.026, 0); m.rotation.z = -s * 0.5;
    return m;
  };
  const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 6).translate(0.13, 0.015, 0.1), _steel);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.013, 0.012, 10).translate(-0.12, 0.006, 0.12), _steel);
  for (const m of [body, door, slab(1), slab(-1), stake, bowl]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  g.userData.kind = 'guard_post';
  return g;
}

export class GuardPostProp {
  readonly group = new THREE.Group();
  private _key = '';
  constructor(scene: THREE.Scene) { scene.add(this.group); }

  /** Put a kennel beside each post (to the dog's right, door toward the post). Only rebuilt when a post moves. */
  sync(posts: ReadonlyArray<{ x: number; z: number; face: number }>, ground: (x: number, z: number) => number): void {
    const key = posts.map(p => `${p.x.toFixed(2)},${p.z.toFixed(2)},${p.face.toFixed(2)}`).join('|');
    if (key === this._key) return;
    this._key = key;
    for (const c of [...this.group.children]) { this.group.remove(c); c.traverse(o => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); }); }
    for (const p of posts) {
      const k = build(), rx = Math.cos(p.face), rz = -Math.sin(p.face);       // to the dog's right
      const x = p.x + rx * 0.2, z = p.z + rz * 0.2;
      k.position.set(x, ground(x, z), z);
      k.rotation.y = p.face + 0.4;
      this.group.add(k);
    }
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.group.traverse(o => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); });
  }
}
