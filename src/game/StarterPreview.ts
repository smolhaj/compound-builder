import * as THREE from 'three';
import { KIT, footprint } from './buildkit/kit';
import { buildGhost } from './buildkit/buildings';
import { BoundaryOutline } from './BoundaryOutline';
import type { HomesteadWorld } from './HomesteadWorld';
import type { StarterPlan } from '../sim/starterCompound';

/**
 * The starter compound as a ghost preview (sim/starterCompound.ts): a translucent piece at each proposed spot, on its graded pad, and the
 * yard fence's outline on the ground. Pieces left for later are not drawn. Purely a picture of the plan; nothing is staked until the HUD says so.
 */
export class StarterPreview {
  private readonly _group = new THREE.Group();
  private readonly _mat = new THREE.MeshBasicMaterial({ color: 0xd8c9a0, transparent: true, opacity: 0.5, depthWrite: false });
  private readonly _yard: BoundaryOutline;
  private readonly _scene: THREE.Scene;
  private readonly _world: HomesteadWorld;

  constructor(scene: THREE.Scene, world: HomesteadWorld) {
    this._scene = scene; this._world = world;
    this._yard = new BoundaryOutline(scene, world.groundAt);
    this._group.renderOrder = 5;
    scene.add(this._group);
  }

  set(plan: StarterPlan | null): void {
    for (const c of [...this._group.children]) { this._group.remove(c); c.traverse(o => (o as THREE.Mesh).geometry?.dispose()); }
    if (!plan) { this._yard.visible = false; return; }
    for (const p of plan.pieces) {
      if (p.later) continue;
      const def = KIT[p.kind], fp = footprint(def, p.x, p.z, p.rot);
      const g = buildGhost(def);
      g.traverse(o => { if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).material = this._mat; (o as THREE.Mesh).castShadow = false; (o as THREE.Mesh).renderOrder = 5; } });
      g.position.set(p.x, this._world.parcel.padHeight(fp.x0, fp.z0, fp.x1, fp.z1), p.z);
      g.rotation.y = p.rot * Math.PI / 2;
      this._group.add(g);
    }
    if (plan.yard && !plan.yard.later) { this._yard.build([plan.yard.rect]); this._yard.visible = true; } else this._yard.visible = false;
  }

  dispose(): void {
    this.set(null);
    this._scene.remove(this._group);
    this._yard.dispose();
    this._mat.dispose();
  }
}
