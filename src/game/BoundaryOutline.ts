import * as THREE from 'three';
import { buildRibbon, type Pt } from '../engine/world/roads/RoadRibbon';

type Rect = { x0: number; z0: number; x1: number; z1: number };

/**
 * The property line, drawn on the ground: a bright strip along the edge of the
 * land the family owns (the home parcel and any neighbor parcels bought), with
 * no line where two owned parcels meet. A planning aid for the perimeter.
 */
export class BoundaryOutline {
  private readonly _group = new THREE.Group();
  private readonly _mat = new THREE.MeshBasicMaterial({
    color: 0xffb41e, transparent: true, opacity: 0.9, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });

  private readonly _ground: (x: number, z: number) => number;

  constructor(scene: THREE.Scene, ground: (x: number, z: number) => number) {
    this._ground = ground;
    this._group.visible = false;
    this._group.renderOrder = 5;
    scene.add(this._group);
  }

  set visible(on: boolean) { this._group.visible = on; }

  /** Rebuild from the owned rectangles (home first). */
  build(rects: readonly Rect[]): void {
    for (const c of [...this._group.children]) { this._group.remove(c); (c as THREE.Mesh).geometry.dispose(); }
    const inside = (x: number, z: number, skip: Rect) => rects.some(r => r !== skip && x > r.x0 + 0.01 && x < r.x1 - 0.01 && z > r.z0 + 0.01 && z < r.z1 - 0.01);
    for (const r of rects) {
      const sides: Array<[Pt, Pt]> = [[[r.x0, r.z0], [r.x1, r.z0]], [[r.x1, r.z0], [r.x1, r.z1]], [[r.x1, r.z1], [r.x0, r.z1]], [[r.x0, r.z1], [r.x0, r.z0]]];
      for (const [a, b] of sides) {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.ceil(len / 2));
        let run: Pt[] = [];
        const flush = () => { if (run.length > 1) this._group.add(new THREE.Mesh(buildRibbon(run, 0.32, this._ground, 0.05, 1), this._mat)); run = []; };
        for (let i = 0; i <= n; i++) {
          const x = a[0] + (b[0] - a[0]) * i / n, z = a[1] + (b[1] - a[1]) * i / n;
          if (inside(x, z, r)) flush(); else run.push([x, z]);
        }
        flush();
      }
    }
  }

  dispose(): void {
    for (const c of this._group.children) (c as THREE.Mesh).geometry.dispose();
    this._group.parent?.remove(this._group);
    this._mat.dispose();
  }
}
