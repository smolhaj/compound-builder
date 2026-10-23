import * as THREE from 'three';
import type { WorldScene } from '../engine/world/WorldScene';
import type { Season } from '../store/worldStore';

/** 40-acre parcel ≈ 402 m square; 1 world unit ≈ 6 m (UE SCALE v2). */
export const PARCEL_SIZE = 67;
/** Person height in world units (≈ 1.7 m). */
export const PERSON_H = 0.28;

/**
 * Everything in the world that is Compound Builder's (terrain, parcel,
 * structures). For now: a flat placeholder ground and a scale figure.
 */
export class HomesteadWorld {
  readonly center = new THREE.Vector3(PARCEL_SIZE / 2, 0, PARCEL_SIZE / 2);
  /** Visual day index (moon phase). */
  dayIndex = 120;
  private readonly _root = new THREE.Group();
  private readonly _ws: WorldScene;

  constructor(ws: WorldScene) {
    this._ws = ws;
    ws.setSite({ x0: 0, z0: 0, x1: PARCEL_SIZE, z1: PARCEL_SIZE });
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1200, 1200).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x6b7a45, roughness: 0.95 }),
    );
    ground.position.set(this.center.x, 0, this.center.z);
    ground.receiveShadow = true;
    this._root.add(ground);
    this._root.add(scaleFigure(this.center.x, this.center.z));
    ws.scene.add(this._root);
  }

  groundAt = (_x: number, _z: number): number => 0;

  setSeason(_s: Season): void { /* terrain increment */ }

  tick(_dt: number, _hour: number): void { /* weather / wind increments */ }

  dispose(): void {
    this._ws.scene.remove(this._root);
    this._root.traverse(o => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
  }
}

/** A plain human-scale reference figure (QA scale check). */
export function scaleFigure(x: number, z: number, y = 0): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3b5b8c, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd8a888, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, PERSON_H * 0.62, 4, 8), mat);
  body.position.y = PERSON_H * 0.45;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), skin);
  head.position.y = PERSON_H - 0.03;
  for (const m of [body, head]) { m.castShadow = true; g.add(m); }
  g.position.set(x, y, z);
  g.userData.type = 'scale_figure';
  return g;
}
