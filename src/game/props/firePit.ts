/**
 * A fire pit (reusable prop): a ring of fieldstone round a bed of ash and
 * coals, a few split logs burning, round-log seats about it, a warm light
 * that flickers and a thread of wood smoke. One merged mesh per material
 * (stone and wood share the kit's), one flame draw, one point light (High /
 * Medium only), one smoke draw. Local frame: origin at the center of the
 * ring on the ground. Scale: 1 unit ≈ 6 m, ring ≈ 1.1 m across.
 *
 * Used for the camp's cookfire and, once a house stands, evenings sat out
 * round it (atmosphere/nightLife.firePitLit). `seats` are where people sit
 * (local x, z and the point they face) for whoever places the figures.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { kitMaterial } from '../buildkit/materials';
import { SmokePlume } from '../../engine/world/fx/SmokePlume';
import type { Quality } from '../../engine/world/WorldScene';

/** Ring radius (to the stones' centers). */
export const FIRE_PIT_R = 0.09;

let _flame: THREE.MeshBasicMaterial | null = null;
let _coals: THREE.MeshBasicMaterial | null = null;
let _ash: THREE.MeshStandardMaterial | null = null;
const flameMat = () => _flame ??= new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.0, 0.3), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
const coalMat = () => _coals ??= new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 0.35, 0.06) });
const ashMat = () => _ash ??= new THREE.MeshStandardMaterial({ color: 0x3a3532, roughness: 1 });

function merged(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  const g = mergeGeometries(list.map(x => (x.index ? x.toNonIndexed() : x)).map(x => { x.deleteAttribute('uv'); return x; }));
  list.forEach(x => x.dispose());
  g?.computeVertexNormals();
  return g;
}

export class FirePit {
  readonly group = new THREE.Group();
  /** Where people sit round it (local x, z, face x, z). */
  readonly seats: ReadonlyArray<readonly [number, number, number, number]>;
  private readonly _flames: THREE.Mesh;
  private readonly _light: THREE.PointLight;
  private readonly _smoke: SmokePlume;
  private _lit = 0;
  private _q: Quality = 'high';

  /** `withSeats`: round-log seats (the camp has its own table and benches). */
  constructor(withSeats = true, seed = 1) {
    const stone: THREE.BufferGeometry[] = [], wood: THREE.BufferGeometry[] = [], flame: THREE.BufferGeometry[] = [];
    let s = seed >>> 0;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + rnd() * 0.2, r = FIRE_PIT_R + (rnd() - 0.5) * 0.01;
      stone.push(new THREE.DodecahedronGeometry(0.024 + rnd() * 0.008, 0).scale(1.2, 0.7, 1).rotateY(rnd() * 3).translate(Math.cos(a) * r, 0.012, Math.sin(a) * r));
    }
    // split logs leaning into a cone over the coals
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + 0.4;
      wood.push(new THREE.CylinderGeometry(0.008, 0.011, 0.11, 5).rotateZ(0.9).translate(0.035, 0.028, 0).rotateY(a));
    }
    const seats: Array<readonly [number, number, number, number]> = [];
    if (withSeats) {
      // round-log stools (seat ≈ 45 cm, the UE bench height) at ≈ 1.4 m from the fire
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3, r = 0.24;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        wood.push(new THREE.CylinderGeometry(0.03, 0.033, 0.075, 9).translate(x, 0.0375, z));
        seats.push([x, z, 0, 0]);
      }
    }
    this.seats = seats;
    flame.push(
      new THREE.ConeGeometry(0.034, 0.12, 6).translate(0, 0.075, 0),
      new THREE.ConeGeometry(0.02, 0.08, 5).translate(0.02, 0.055, 0.01),
      new THREE.ConeGeometry(0.018, 0.07, 5).translate(-0.018, 0.05, -0.012),
    );
    const add = (g: THREE.BufferGeometry | null, m: THREE.Material, shadow: boolean, name: string) => {
      if (!g) return null;
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.name = name;
      this.group.add(mesh);
      return mesh;
    };
    add(merged(stone), kitMaterial('fieldstone'), true, 'firepit_stone');
    add(merged(wood), kitMaterial('log_end'), true, 'firepit_wood');
    add(new THREE.CircleGeometry(FIRE_PIT_R - 0.012, 14).rotateX(-Math.PI / 2).translate(0, 0.004, 0), ashMat(), false, 'firepit_ash');
    add(new THREE.CircleGeometry(0.035, 10).rotateX(-Math.PI / 2).translate(0, 0.007, 0), coalMat(), false, 'firepit_coals');
    this._flames = add(merged(flame), flameMat(), false, 'firepit_flame')!;
    this._flames.userData.noSSAO = true;
    // a warm, low light: reaches ≈ 8 m, falls off fast; never casts shadows
    this._light = new THREE.PointLight(0xff9a4a, 0, 1.6, 2);
    this._light.position.set(0, 0.1, 0);
    this._light.castShadow = false;
    this.group.add(this._light);
    this._smoke = new SmokePlume(new THREE.Vector3(0, 0.12, 0), { rise: 1.2, size: 0.32 });
    this.group.add(this._smoke.points);
    this._smoke.points.position.set(0, 0.12, 0);
    this.group.userData = { type: 'fire_pit' };
  }

  /** The flicker light only on High / Medium (Low: flames and coals only). */
  setQuality(q: Quality): void { this._q = q; }

  /** `lit` 0–1; `time` seconds; wind in world units/s; `daylight` 0–1; `viewportH` px. */
  update(time: number, lit: number, windX: number, windZ: number, daylight: number, viewportH: number): void {
    // the fire takes a minute to catch and dies to coals
    this._lit += (lit - this._lit) * 0.05;
    const k = this._lit;
    const f = 0.75 + 0.25 * Math.sin(time * 13) * Math.sin(time * 7.3 + 1);
    const m = flameMat();
    m.color.setRGB(2.2 * f, 1.0 * f, 0.3 * f);
    m.opacity = 0.9 * k;
    this._flames.visible = k > 0.05;
    this._flames.scale.set(1, 0.85 + 0.3 * f * k, 1);
    coalMat().color.setRGB(1.4 * (0.25 + 0.75 * k) * (0.9 + 0.1 * f), 0.35 * k, 0.06 * k);
    const night = 1 - daylight;
    this._light.intensity = this._q === 'low' ? 0 : k * (0.25 + 0.9 * night) * (0.8 + 0.35 * f);
    this._smoke.update(time, k * 0.7, windX, windZ, daylight, viewportH);
  }

  get lit(): number { return this._lit; }

  dispose(): void {
    this._smoke.dispose();
    this.group.traverse(o => { const g = (o as THREE.Mesh).geometry; if (g) g.dispose(); });
  }
}
