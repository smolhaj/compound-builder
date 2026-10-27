/**
 * regionalProps — instanced rural structures for the regional landscape:
 * farm buildings (walls + gable roofs), grain bins, bridge piers, wooden
 * utility poles and lattice transmission towers. One InstancedMesh per
 * shape, per-instance color, the landscape's aerial-perspective fog.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RegionKind } from '../terrain/regionalLandscape';

/** Patch a material with the regional terrain's thinning-with-distance fog. */
export function patchFog(mat: THREE.Material, key: string): void {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', /* glsl */`#ifdef USE_FOG
        float rk2 = mix(1.0, 0.1, smoothstep(80.0, 420.0, vFogDepth));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, 1.0 - exp(- fogDensity * fogDensity * rk2 * vFogDepth * vFogDepth));
      #endif`);
  };
  mat.customProgramCacheKey = () => key;
}

/** Farmhouse / barn colors per region. */
export const FARM_PALETTE: Record<RegionKind, { house: number[]; barn: number[] }> = {
  plains: { house: [0xf0ece2, 0xe6dcc6, 0xd8d4cc], barn: [0x8a2c22, 0x9a3a2a, 0xa8a49a] },
  mountain: { house: [0xe8e0cc, 0x8a6a4a, 0xd8cdb4], barn: [0x7a4a30, 0x8a2c22, 0x9a9690] },
  drumlin: { house: [0xf4f2ea, 0xe8e2d0, 0xd4c8a8], barn: [0x8a2c22, 0x7a2620, 0x6e5a44] },
  bayou: { house: [0xf0ece2, 0xe8dcc0, 0xc8d4cc], barn: [0x8a7a66, 0x6e5e4c, 0x9a3a2a] },
  sound: { house: [0xe8e4da, 0x8a9aa2, 0x6e7e78], barn: [0x6e3a2c, 0x5a5048, 0x8a2c22] },
  coast: { house: [0xf2eee4, 0xeae2cf], barn: [0x8a7a66, 0xb8a888] },
  city: { house: [0xf0ece2, 0xd8d4cc], barn: [0x8a2c22, 0xa8a49a] },
  // white frame and painted farmhouses; black-stained tobacco barns, weathered gray hay barns
  appalachia: { house: [0xf0ece2, 0xe2dccc, 0xb8c4c0, 0xc8b89a], barn: [0x2e2a28, 0x6e655a, 0x7a2f26] },
  // stucco / adobe, tan manufactured homes
  desert: { house: [0xd8c4a0, 0xc8a882, 0xe4d8c0, 0xb89a78], barn: [0xa9adb0, 0x8a7a66] },
  // log, brown-stained and white clapboard; gray barns
  north_woods: { house: [0x7a5a3e, 0xf0ece2, 0x5e6e5a, 0x8a6a4a], barn: [0x7a756c, 0x8a2c22, 0x5e5850] },
  // white farmhouses and red dairy barns
  upper_midwest: { house: [0xf4f2ea, 0xece6d4, 0xe0d8c4], barn: [0x8a2c22, 0x9a3226, 0x7e2a22] },
  // white frame and painted farmhouses, metal pole barns
  ozarks: { house: [0xf0ece2, 0xd8d0bc, 0xb8b4a8, 0xc8b89a], barn: [0x9aa0a2, 0x8a3a2a, 0x6e655a] },
  // limestone ranch houses, galvanized barns
  hill_country: { house: [0xdcd0b4, 0xe2d8c0, 0xcfc2a2, 0xf0ece2], barn: [0xa9adb0, 0x8a7a66, 0x9a3a2a] },
  // vinyl-sided and painted frame farmhouses, faded red bank barns
  rust_belt: { house: [0xe8e6de, 0xd6d8d2, 0xc8ccc4, 0xe0d4b8], barn: [0x8a3a30, 0x7a3a30, 0x8a8278] },
};

/** Resample a polyline at ~`step` spacing (keeps the end points). */
export function resamplePts(p: Array<[number, number]>, step: number): Array<[number, number]> {
  const out: Array<[number, number]> = [p[0]];
  for (let i = 1; i < p.length; i++) {
    const [ax, az] = p[i - 1], [bx, bz] = p[i];
    const l = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(l / step));
    for (let k = 1; k <= n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  return out;
}

type Shape = 'wall' | 'roof' | 'bin' | 'binCap' | 'pole' | 'tower' | 'pier' | 'gambrel' | 'cyl' | 'dome' | 'bale';

function gableGeometry(): THREE.BufferGeometry {
  // ridge along x, base 1 × 1 at y = 0, apex at y = 1; outward winding
  const v = [
    -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0, -0.5, 0, -0.5, 0.5, 1, 0, 0.5, 0, -0.5,
    0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0, 0.5, 0, 0.5, -0.5, 1, 0, -0.5, 0, 0.5,
    -0.5, 0, 0.5, -0.5, 1, 0, -0.5, 0, -0.5,
    0.5, 0, -0.5, 0.5, 1, 0, 0.5, 0, 0.5,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/** A thin box beam from a to b (square section t). */
/**
 * Gambrel (barn) roof: ridge along x, base 1 × 1 at y = 0, apex at y = 1 —
 * a steep lower slope to the knee (60 % up, 14 % in) and a shallow upper one,
 * the Dutch / Midwestern hay-barn profile, with pentagonal end gables.
 */
function gambrelGeometry(): THREE.BufferGeometry {
  const prof: Array<[number, number]> = [[-0.5, 0], [-0.36, 0.6], [0, 1], [0.36, 0.6], [0.5, 0]];
  const v: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => v.push(...a, ...b, ...c);
  for (let i = 0; i < prof.length - 1; i++) {
    const [z0, y0] = prof[i], [z1, y1] = prof[i + 1];
    const a = [-0.5, y0, z0], b = [0.5, y0, z0], c = [0.5, y1, z1], d = [-0.5, y1, z1];
    tri(a, d, c); tri(a, c, b);
  }
  for (const x of [-0.5, 0.5]) {
    const pts = prof.map(([z, y]) => [x, y, z]);
    for (let i = 1; i < pts.length - 1; i++) {
      if (x > 0) tri(pts[0], pts[i], pts[i + 1]); else tri(pts[0], pts[i + 1], pts[i]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

function beam(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(t, t, len);
  const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), Math.abs(b.y - a.y) > len * 0.99 ? 0.01 : 0));
  g.applyMatrix4(m);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  g.deleteAttribute('uv');
  return g;
}

function towerGeometry(): THREE.BufferGeometry {
  // ≈ 40 m lattice tower: four splayed legs, X-bracing, two cross-arms (along local x)
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const parts: THREE.BufferGeometry[] = [];
  const H = 6.6;
  const w = (y: number): number => 0.62 - 0.44 * (y / H);
  const levels = [0, 1.6, 3.2, 4.6, 5.6, H];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) parts.push(beam(V(sx * w(0), 0, sz * w(0)), V(sx * w(H), H, sz * w(H)), 0.07));
  for (let i = 0; i < levels.length - 1; i++) {
    const y0 = levels[i], y1 = levels[i + 1];
    for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
      parts.push(beam(V(ax * w(y0), y0, az * w(y0)), V(bx * w(y1), y1, bz * w(y1)), 0.035));
    }
  }
  for (const y of [4.5, 5.4]) parts.push(beam(V(-1.6, y, 0), V(1.6, y, 0), 0.08));
  parts.push(beam(V(-1.2, 6.3, 0), V(1.2, 6.3, 0), 0.07));
  const g = mergeGeometries(parts)!;
  parts.forEach(p => p.dispose());
  g.computeVertexNormals();
  return g;
}

function poleGeometry(): THREE.BufferGeometry {
  const p = new THREE.CylinderGeometry(0.03, 0.045, 1, 5).translate(0, 0.5, 0);
  p.deleteAttribute('uv');
  const arm = new THREE.BoxGeometry(0.56, 0.035, 0.04).translate(0, 0.94, 0);
  arm.deleteAttribute('uv');
  const g = mergeGeometries([p.toNonIndexed(), arm.toNonIndexed()])!;
  g.computeVertexNormals();
  return g;
}

export class RegionalProps {
  readonly objects: THREE.Object3D[] = [];
  private readonly _scene: THREE.Scene;
  private readonly _m = new Map<Shape, { mats: THREE.Matrix4[]; cols: number[] }>();
  private readonly _dispose: Array<{ dispose(): void }> = [];
  private readonly _q = new THREE.Quaternion();
  private readonly _up = new THREE.Vector3(0, 1, 0);

  constructor(scene: THREE.Scene, kind: RegionKind) {
    this._scene = scene;
    void kind;
  }

  private _push(s: Shape, x: number, y: number, z: number, rot: number, sx: number, sy: number, sz: number, color: number): void {
    let l = this._m.get(s); if (!l) this._m.set(s, l = { mats: [], cols: [] });
    this._q.setFromAxisAngle(this._up, rot);
    l.mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), this._q, new THREE.Vector3(sx, sy, sz)));
    l.cols.push(color);
  }

  add(s: Shape, mats: THREE.Matrix4[], cols: number[]): void {
    let l = this._m.get(s); if (!l) this._m.set(s, l = { mats: [], cols: [] });
    l.mats.push(...mats); l.cols.push(...cols);
  }

  /** Box building w (local x) × d (local z), walls h, gable roof of height roofH (ridge along the long side). */
  building(at: [number, number], y: number, rot: number, w: number, h: number, d: number, wall: number, roof: number, roofH: number): void {
    const [x, z] = at;
    this._push('wall', x, y - 0.15, z, rot, w, h + 0.15, d, wall);
    const ridgeX = w >= d;
    this._push('roof', x, y + h, z, rot + (ridgeX ? 0 : Math.PI / 2), (ridgeX ? w : d) + 0.15, roofH, (ridgeX ? d : w) + 0.15, roof);
  }

  bin(x: number, y: number, z: number, r: number, h: number): void {
    this._push('bin', x, y - 0.1, z, 0, r, h + 0.1, r, 0xb8bcc0);
    this._push('binCap', x, y + h, z, 0, r * 1.04, r * 0.55, r * 1.04, 0xaab0b4);
  }

  /** Box w × d with a gambrel (hay-barn) roof of height roofH, ridge along the long side. */
  barn(at: [number, number], y: number, rot: number, w: number, h: number, d: number, wall: number, roof: number, roofH: number): void {
    const [x, z] = at;
    this._push('wall', x, y - 0.15, z, rot, w, h + 0.15, d, wall);
    const ridgeX = w >= d;
    this._push('gambrel', x, y + h, z, rot + (ridgeX ? 0 : Math.PI / 2), (ridgeX ? w : d) + 0.12, roofH, (ridgeX ? d : w) + 0.16, roof);
  }

  /** A gable roof alone (open pole barn / shelter) with its eaves at height y. */
  roof(at: [number, number], y: number, rot: number, w: number, d: number, roof: number, roofH: number): void {
    const ridgeX = w >= d;
    this._push('roof', at[0], y, at[1], rot + (ridgeX ? 0 : Math.PI / 2), (ridgeX ? w : d) + 0.15, roofH, (ridgeX ? d : w) + 0.15, roof);
  }

  /** Upright cylinder (silo, tank) of radius r and height h, optional domed cap. */
  silo(x: number, y: number, z: number, r: number, h: number, color: number, cap: number | null = null): void {
    this._push('cyl', x, y - 0.1, z, 0, r, h + 0.1, r, color);
    if (cap !== null) this._push('dome', x, y + h, z, 0, r * 1.02, r * 0.75, r * 1.02, cap);
  }

  /** Round hay bale lying on its side (axis along local x): diameter dia, length len. */
  bale(x: number, y: number, z: number, rot: number, dia: number, len: number, color = 0xb8a462): void {
    this._push('bale', x, y - dia * 0.08, z, rot, len, dia, dia, color);
  }

  /** Plain box (stacks, posts, rails, tarps): center x/z, base y. */
  box(x: number, y: number, z: number, rot: number, w: number, h: number, d: number, color: number): void {
    this._push('wall', x, y, z, rot, w, h, d, color);
  }

  pole(x: number, y: number, z: number, rot: number, h: number): void {
    this._push('pole', x, y - 0.05, z, rot, 1, h, 1, 0x5a4634);
  }

  tower(x: number, y: number, z: number, rot: number): void {
    this._push('tower', x, y - 0.1, z, rot, 1, 1, 1, 0x8e9296);
  }

  finish(): void {
    const geos: Record<Shape, () => THREE.BufferGeometry> = {
      wall: () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      roof: gableGeometry,
      bin: () => new THREE.CylinderGeometry(1, 1, 1, 12).translate(0, 0.5, 0),
      binCap: () => new THREE.ConeGeometry(1, 1, 12).translate(0, 0.5, 0),
      pole: poleGeometry,
      tower: towerGeometry,
      pier: () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      gambrel: gambrelGeometry,
      cyl: () => new THREE.CylinderGeometry(1, 1, 1, 14).translate(0, 0.5, 0),
      dome: () => new THREE.SphereGeometry(1, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2),
      bale: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 10).rotateZ(Math.PI / 2).translate(0, 0.5, 0),
    };
    const metal = new Set<Shape>(['bin', 'binCap', 'tower', 'dome']);
    for (const [s, l] of this._m) {
      if (l.mats.length === 0) continue;
      const g = geos[s]();
      const mat = new THREE.MeshStandardMaterial({ roughness: metal.has(s) ? 0.5 : 0.85, metalness: metal.has(s) ? 0.4 : 0 });
      patchFog(mat, 'regional_props_v1');
      const mesh = new THREE.InstancedMesh(g, mat, l.mats.length);
      const c = new THREE.Color();
      l.mats.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, c.setHex(l.cols[i])); });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
      mesh.castShadow = s === 'wall' || s === 'roof' || s === 'gambrel' || s === 'cyl';
      mesh.receiveShadow = true;
      mesh.name = 'regional_' + s;
      mesh.userData = { type: 'regional_props', shape: s, noSSAO: true };
      this._scene.add(mesh);
      this.objects.push(mesh);
      this._dispose.push(g, mat);
    }
  }

  dispose(): void {
    for (const o of this.objects) { this._scene.remove(o); (o as THREE.InstancedMesh).dispose?.(); }
    for (const d of this._dispose) d.dispose();
    this.objects.length = 0;
  }
}
