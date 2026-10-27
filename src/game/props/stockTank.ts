/**
 * A round galvanized stock tank (water trough) for the barn or the coop
 * yard: ≈ 2.4 m across, 60 cm deep. Its water skins over with ice in winter
 * and on hard-frost mornings (atmosphere/seasonCover.troughIce): a matte
 * white-gray lid of ice with a hole chopped in it. Procedural; three draws.
 */
import * as THREE from 'three';
import { kitMaterial } from '../buildkit/materials';

const R = 0.2, H = 0.1;
let _water: THREE.MeshStandardMaterial | null = null;
let _ice: THREE.MeshStandardMaterial | null = null;

export class StockTank {
  readonly group = new THREE.Group();
  private readonly _ice: THREE.Mesh;

  constructor() {
    const shell = new THREE.CylinderGeometry(R, R, H, 28, 1, true).translate(0, H / 2, 0);
    const rim = new THREE.TorusGeometry(R, 0.006, 5, 28).rotateX(Math.PI / 2).translate(0, H, 0);
    const ribs = [0.3, 0.65].map(f => new THREE.TorusGeometry(R + 0.002, 0.003, 4, 28).rotateX(Math.PI / 2).translate(0, H * f, 0));
    const metal = new THREE.Group();
    for (const g of [shell, rim, ...ribs]) { const m = new THREE.Mesh(g, kitMaterial('steel')); m.castShadow = true; m.receiveShadow = true; metal.add(m); }
    (metal.children[0] as THREE.Mesh).material = kitMaterial('aluminum');
    this.group.add(metal);
    _water ??= new THREE.MeshStandardMaterial({ color: 0x1d2a2e, roughness: 0.06, metalness: 0.1 });
    _ice ??= new THREE.MeshStandardMaterial({ color: 0xb9c4cc, roughness: 0.55, transparent: true, opacity: 0.95 });
    const water = new THREE.Mesh(new THREE.CircleGeometry(R - 0.004, 28).rotateX(-Math.PI / 2).translate(0, H * 0.82, 0), _water);
    water.receiveShadow = true;
    this.group.add(water);
    // the ice: a disc with a chopped hole off-center
    const sh = new THREE.Shape();
    sh.absarc(0, 0, R - 0.004, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absellipse(0.06, 0.03, 0.035, 0.028, 0, Math.PI * 2, true, 0.3);
    sh.holes.push(hole);
    this._ice = new THREE.Mesh(new THREE.ShapeGeometry(sh, 20).rotateX(-Math.PI / 2).translate(0, H * 0.83, 0), _ice);
    this._ice.receiveShadow = true;
    this._ice.visible = false;
    this.group.add(this._ice);
    this.group.userData = { type: 'stock_tank' };
  }

  /** `ice` 0–1 (≥ 0.5 frozen over); a thin skin first, opaque once thick. */
  setIce(ice: number): void {
    this._ice.visible = ice > 0.3;
    (this._ice.material as THREE.MeshStandardMaterial).opacity = Math.min(0.95, 0.4 + ice * 0.6);
  }

  dispose(): void { this.group.traverse(o => (o as THREE.Mesh).geometry?.dispose()); }
}
