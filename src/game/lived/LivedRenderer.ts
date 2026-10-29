/**
 * Draws the plan (livedPlan.ts): every prop built from primitives, merged
 * into one mesh per material class (matte, metal, cloth, leaf, lamp), so the
 * whole lived-in layer is a handful of draw calls and nothing runs per frame
 * but the lantern glass. Rebuilt only when the plan changes.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Quality } from '../../engine/world/WorldScene';
import { BUILD, P, type Grp, type Season } from './propGeometry';
import type { LivedPlan } from './livedPlan';

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Lantern glass 0-1 from the darkness of the sky: on from dusk, off with lights out. */
export function yardLamp(night: number, lightsOut: boolean): number {
  if (lightsOut) return 0;
  const t = Math.max(0, Math.min(1, (night - 0.25) / 0.35));
  return t * t * (3 - 2 * t);
}

export class LivedRenderer {
  readonly group = new THREE.Group();
  private readonly _mats: Record<Grp, THREE.Material>;
  private readonly _lamp: THREE.MeshBasicMaterial;
  private _key = '';
  /** Where the lanterns hang (world x, z, height), for whatever wants to know what glows. */
  lamps: Array<{ x: number; y: number; z: number }> = [];

  constructor() {
    this.group.name = 'lived_in';
    const std = (o: Partial<THREE.MeshStandardMaterialParameters>) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
    this._lamp = new THREE.MeshBasicMaterial({ vertexColors: true });
    this._mats = {
      matte: std({ roughness: 0.92, metalness: 0 }),
      metal: std({ roughness: 0.5, metalness: 0.55 }),
      cloth: std({ roughness: 0.96, side: THREE.DoubleSide }),
      leaf: std({ roughness: 0.9, side: THREE.DoubleSide }),
      lamp: this._lamp,
    };
    this.setLamp(0);
  }

  /** 0 = dull glass by day, 1 = lit (bright enough to bloom). */
  setLamp(level: number): void {
    const k = 0.32 + 2.6 * level;
    this._lamp.color.setRGB(k, k * (0.82 + 0.1 * level), k * (0.55 + 0.1 * level));
  }

  update(plan: LivedPlan, o: { ground: (x: number, z: number) => number; floor: (x: number, z: number) => number; season: Season; quality: Quality; key: string }): void {
    const key = `${o.key}|${o.quality}`;
    if (key === this._key) return;
    this._key = key;
    this.clear();
    const p = new P();
    this.lamps = [];
    for (const pr of plan.props) {
      const y = pr.porch ? o.floor(pr.x, pr.z) : o.ground(pr.x, pr.z);
      p.begin(pr.x, y, pr.z, pr.rot, 1);
      BUILD[pr.kind](p, { season: o.season, variant: pr.variant, rnd: rng(pr.seed), count: pr.count });
      if (pr.kind === 'lantern') this.lamps.push({ x: pr.x, y: y + 1.5 / 6, z: pr.z });
      if (pr.kind === 'yardlight') this.lamps.push({ x: pr.x, y: y + 3.8 / 6, z: pr.z });
    }
    for (const grp of Object.keys(p.out) as Grp[]) {
      const list = p.out[grp];
      if (!list.length) continue;
      const g = mergeGeometries(list, false);
      for (const x of list) x.dispose();
      if (!g) continue;
      const m = new THREE.Mesh(g, this._mats[grp]);
      m.name = 'lived_' + grp;
      m.castShadow = grp !== 'lamp' && o.quality !== 'low';
      m.receiveShadow = grp !== 'lamp';
      if (grp === 'lamp') m.userData.noSSAO = true;
      this.group.add(m);
    }
  }

  clear(): void {
    for (const o of [...this.group.children]) { this.group.remove(o); (o as THREE.Mesh).geometry?.dispose(); }
  }

  dispose(): void {
    this.clear();
    for (const m of Object.values(this._mats)) m.dispose();
  }
}
