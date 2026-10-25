/**
 * Ground going back to the wild: weed tufts (thistle, mullein, cheatgrass)
 * in untended fields and gardens and at the foot of an empty place's walls,
 * and saplings (aspen suckers, pine) once it has been years. Two instanced
 * draws for the whole compound; one shared vertex-colored material that
 * browns with the dormant season. Rebuilt only when an area's overgrowth
 * steps (aging.overgrowth, quantized).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Quality } from '../../engine/world/WorldScene';

export interface WildArea { x0: number; z0: number; x1: number; z1: number; weeds: number; saplings: number; seed: number; /** Only round the edge (a building's foot): band width. */ ring?: number }

const MAX_WEEDS = 2400, MAX_SAPS = 240;

function colored(g: THREE.BufferGeometry, rgb: [number, number, number], tip?: [number, number, number]): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  geo.deleteAttribute('uv');
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const p = geo.getAttribute('position'), c = new Float32Array(p.count * 3);
  let top = 0;
  for (let i = 0; i < p.count; i++) top = Math.max(top, p.getY(i));
  for (let i = 0; i < p.count; i++) {
    const t = tip ? Math.max(0, p.getY(i) / (top || 1)) : 0, col = tip ? rgb.map((v, k) => v + (tip[k] - v) * t) : rgb;
    c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

/** A tuft: five blades fanned out, plus a seed stalk (≈ 40 cm across, 50 cm tall at scale 1). */
function tuftGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const b = new THREE.BufferGeometry();
    b.setAttribute('position', new THREE.Float32BufferAttribute([-0.008, 0, 0, 0.008, 0, 0, 0.002, 0.07, 0.012], 3));
    b.rotateZ((i - 2) * 0.32).rotateY(i * 1.26);
    parts.push(colored(b, [0.05, 0.075, 0.02], [0.17, 0.17, 0.06]));
  }
  parts.push(colored(new THREE.CylinderGeometry(0.0015, 0.002, 0.09, 3).translate(0, 0.045, 0), [0.12, 0.1, 0.05]));
  parts.push(colored(new THREE.SphereGeometry(0.008, 4, 3).scale(1, 1.8, 1).translate(0, 0.092, 0), [0.22, 0.16, 0.08]));
  const g = mergeGeometries(parts)!;
  g.computeVertexNormals();
  return g;
}

/** A sapling: a slim stem and a narrow crown (≈ 2.5 m at scale 1). */
function saplingGeometry(): THREE.BufferGeometry {
  const stem = colored(new THREE.CylinderGeometry(0.004, 0.007, 0.3, 4).translate(0, 0.15, 0), [0.16, 0.13, 0.1]);
  const crown = colored(new THREE.ConeGeometry(0.06, 0.32, 6).translate(0, 0.3, 0), [0.03, 0.06, 0.02], [0.06, 0.1, 0.03]);
  const crown2 = colored(new THREE.ConeGeometry(0.045, 0.22, 6).rotateY(0.5).translate(0, 0.4, 0), [0.04, 0.07, 0.02], [0.07, 0.11, 0.035]);
  const g = mergeGeometries([stem, crown, crown2])!;
  g.computeVertexNormals();
  return g;
}

function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export class Overgrowth {
  private readonly _weeds: THREE.InstancedMesh;
  private readonly _saps: THREE.InstancedMesh;
  private readonly _mat: THREE.MeshStandardMaterial;
  private _key = '';
  private _q: Quality = 'high';

  constructor(scene: THREE.Scene) {
    this._mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
    this._weeds = new THREE.InstancedMesh(tuftGeometry(), this._mat, MAX_WEEDS);
    this._saps = new THREE.InstancedMesh(saplingGeometry(), this._mat, MAX_SAPS);
    for (const m of [this._weeds, this._saps]) { m.count = 0; m.castShadow = m === this._saps; m.receiveShadow = true; m.frustumCulled = false; m.userData = { type: 'overgrowth' }; scene.add(m); }
  }

  setQuality(q: Quality): void { if (q !== this._q) { this._q = q; this._key = ''; } }

  /** Lay out the wild ground (rebuilds only when `key` changes). */
  build(key: string, areas: readonly WildArea[], ground: (x: number, z: number) => number, blocked: (x: number, z: number) => boolean): void {
    key += `|${this._q}`;
    if (key === this._key) return;
    this._key = key;
    const density = this._q === 'low' ? 5 : this._q === 'medium' ? 10 : 16;   // tufts per square unit at full growth
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    let nw = 0, ns = 0;
    for (const a of areas) {
      const r = rng(a.seed), w = a.x1 - a.x0, d = a.z1 - a.z0;
      if (a.weeds > 0.02) {
        const area = a.ring ? 2 * (w + d) * a.ring : w * d;
        const n = Math.round(area * density * a.weeds);
        for (let i = 0; i < n && nw < MAX_WEEDS; i++) {
          let x: number, z: number;
          if (a.ring) {
            // a band hugging the walls
            const side = Math.floor(r() * 4), t = r(), o = r() * a.ring;
            x = side < 2 ? a.x0 + t * w : side === 2 ? a.x0 - o : a.x1 + o;
            z = side === 0 ? a.z0 - o : side === 1 ? a.z1 + o : a.z0 + t * d;
          } else { x = a.x0 + r() * w; z = a.z0 + r() * d; }
          const sc = (0.6 + 0.8 * r()) * (0.5 + 0.5 * a.weeds);
          if (blocked(x, z)) continue;
          q.setFromAxisAngle(up, r() * 6.283);
          m.compose(v.set(x, ground(x, z) - 0.005, z), q, s.set(sc, sc * (0.8 + 0.5 * r()), sc));
          this._weeds.setMatrixAt(nw, m);
          this._weeds.setColorAt(nw, col.setRGB(0.8 + 0.4 * r(), 0.85 + 0.3 * r(), 0.7 + 0.4 * r()));
          nw++;
        }
      }
      if (a.saplings > 0.02 && !a.ring) {
        const n = Math.round(w * d * 0.35 * a.saplings);
        for (let i = 0; i < n && ns < MAX_SAPS; i++) {
          const x = a.x0 + r() * w, z = a.z0 + r() * d;
          if (blocked(x, z)) continue;
          const sc = (0.35 + 0.9 * r()) * a.saplings;
          q.setFromAxisAngle(up, r() * 6.283);
          m.compose(v.set(x, ground(x, z) - 0.01, z), q, s.set(sc, sc, sc));
          this._saps.setMatrixAt(ns, m);
          this._saps.setColorAt(ns, col.setRGB(0.8 + 0.4 * r(), 0.9 + 0.2 * r(), 0.8 + 0.3 * r()));
          ns++;
        }
      }
    }
    this._weeds.count = nw; this._saps.count = ns;
    for (const im of [this._weeds, this._saps]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  }

  /** Brown the weeds in the dormant season (0 green … 1 straw). */
  setDormant(k: number): void {
    this._mat.color.setRGB(1 + 0.9 * k, 1 + 0.35 * k, 1 - 0.2 * k);
  }

  get counts(): { weeds: number; saplings: number } { return { weeds: this._weeds.count, saplings: this._saps.count }; }

  dispose(): void {
    for (const im of [this._weeds, this._saps]) { im.parent?.remove(im); im.geometry.dispose(); }
    this._mat.dispose();
  }
}
