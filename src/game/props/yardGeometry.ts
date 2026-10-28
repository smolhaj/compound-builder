/**
 * The chore yard round the camp (sim/daily.ts): a chopping block and a
 * woodpile, a clothesline with washing, a washtub, a grill, a picnic table
 * by the fire pit with log stools round the fire, and string lights on two
 * poles for evenings and gatherings. Procedural; one merged mesh per
 * material; the grill smoke is a handful of soft sprites. Local frame: the
 * camp's (campGeometry.ts), every piece inside the camp's clear ring.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { kitMaterial } from '../buildkit/materials';
import { CAMP } from './campGeometry';

/** Where things are (camp-local, world units). */
export const YARD = {
  block: { x: -0.7, z: 0.52 },
  woodpile: { x: -0.97, z: 0.3 },
  line: { x0: 0.42, x1: 0.98, z: -0.62, h: 0.27 },
  tub: { x: 0.96, z: -0.3 },
  grill: { x: 0.9, z: 0.6 },
  picnic: { x: 0.42, z: 0.78 },
  /** Log stools round the fire pit (seat top ≈ 0.075). */
  stools: [0, 1, 2, 3, 4, 5].map(k => { const a = k / 6 * Math.PI * 2 + 0.3; return { x: CAMP.fire.x + Math.cos(a) * 0.24, z: CAMP.fire.z + Math.sin(a) * 0.24 }; }),
  poles: [{ x: -0.55, z: 0.86 }, { x: 0.98, z: 0.32 }, { x: 0.3, z: -0.12 }],
} as const;

export interface Yard {
  group: THREE.Group;
  /** Lights 0–1 (evenings, gatherings), grill smoke 0–1. */
  update(time: number, lights: number, smoke: number): void;
  dispose(): void;
}

let _soft: THREE.CanvasTexture | null = null;
function softTex(): THREE.CanvasTexture {
  if (_soft) return _soft;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return (_soft = new THREE.CanvasTexture(c));
}

export function buildYard(): Yard {
  const wood: THREE.BufferGeometry[] = [], split: THREE.BufferGeometry[] = [], metal: THREE.BufferGeometry[] = [], cloth: THREE.BufferGeometry[] = [], bulb: THREE.BufferGeometry[] = [], cord: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) => new THREE.BoxGeometry(w, h, d).rotateY(ry).translate(x, y, z);
  const cyl = (r0: number, r1: number, h: number, x: number, y: number, z: number, seg = 8) => new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y, z);
  // chopping block (a 45 cm round) with a split leaning on it, a few rounds waiting
  const B = YARD.block;
  wood.push(cyl(0.036, 0.04, 0.075, B.x, 0.0375, B.z, 10));
  for (let i = 0; i < 4; i++) split.push(cyl(0.03, 0.03, 0.06, B.x - 0.12 + i * 0.05, 0.03, B.z + 0.12 + (i % 2) * 0.03, 8));
  // the woodpile: split wood stacked between end posts (≈ 1.2 m high, 3 m long)
  const W = YARD.woodpile;
  for (let row = 0; row < 7; row++) for (let k = 0; k < 9; k++) {
    const g = new THREE.CylinderGeometry(0.014, 0.014, 0.09, 3).rotateX(Math.PI / 2).rotateZ(((row * 9 + k) % 5) * 0.4).rotateY(Math.PI / 2);
    split.push(g.translate(W.x, 0.016 + row * 0.027, W.z - 0.22 + k * 0.055 + (row % 2) * 0.012));
  }
  for (const dz of [-0.25, 0.25]) wood.push(box(0.012, 0.21, 0.012, W.x, 0.105, W.z + dz));
  metal.push(box(0.11, 0.004, 0.52, W.x, 0.205, W.z));     // a sheet of tin over the top
  // clothesline: two T posts and the line, a few things hanging
  const L = YARD.line;
  for (const x of [L.x0, L.x1]) { wood.push(box(0.012, L.h + 0.02, 0.012, x, (L.h + 0.02) / 2, L.z)); wood.push(box(0.012, 0.012, 0.08, x, L.h, L.z)); }
  for (const dz of [-0.03, 0.03]) cord.push(box(L.x1 - L.x0, 0.002, 0.002, (L.x0 + L.x1) / 2, L.h - 0.005, L.z + dz));
  const colors = [0xe8e4da, 0x5a7aa8, 0xc8b89a, 0x8a3b2e, 0xe8e4da, 0x4a6a4a];
  const clothGeo: Array<[THREE.BufferGeometry, number]> = [];
  for (let i = 0; i < 6; i++) {
    const w = i % 3 === 0 ? 0.11 : 0.06, h = i % 3 === 0 ? 0.13 : 0.08;
    clothGeo.push([new THREE.PlaneGeometry(w, h).translate(L.x0 + 0.07 + i * 0.085, L.h - 0.005 - h / 2, L.z + (i % 2 ? 0.03 : -0.03)), colors[i]]);
  }
  // washtub on a low stand, a washboard in it, a bucket beside
  const T = YARD.tub;
  wood.push(box(0.14, 0.006, 0.1, T.x, 0.05, T.z));
  for (const [dx, dz] of [[-0.06, -0.04], [0.06, -0.04], [-0.06, 0.04], [0.06, 0.04]]) wood.push(box(0.008, 0.05, 0.008, T.x + dx, 0.025, T.z + dz));
  metal.push(cyl(0.055, 0.045, 0.05, T.x, 0.078, T.z, 12));
  wood.push(box(0.05, 0.07, 0.006, T.x + 0.02, 0.1, T.z, 0.4));
  metal.push(cyl(0.025, 0.02, 0.045, T.x - 0.1, 0.022, T.z + 0.05, 8));
  // grill: a half-barrel on legs with a lid hinged back
  const G = YARD.grill;
  for (const dx of [-0.045, 0.045]) for (const dz of [-0.03, 0.03]) metal.push(box(0.006, 0.075, 0.006, G.x + dx, 0.0375, G.z + dz));
  const half = new THREE.CylinderGeometry(0.04, 0.04, 0.12, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI).translate(G.x, 0.085, G.z);
  metal.push(half);
  metal.push(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(-1.2).translate(G.x, 0.09, G.z - 0.04));
  // picnic table by the fire pit (seat top 0.075, table top 0.125)
  const P = YARD.picnic;
  wood.push(box(0.34, 0.012, 0.13, P.x, 0.125, P.z));
  for (const s of [-1, 1]) {
    wood.push(box(0.34, 0.01, 0.05, P.x, 0.075, P.z + s * 0.12));
    for (const t of [-1, 1]) { wood.push(box(0.012, 0.125, 0.012, P.x + t * 0.14, 0.0625, P.z + s * 0.04)); wood.push(box(0.012, 0.075, 0.012, P.x + t * 0.14, 0.0375, P.z + s * 0.12)); }
  }
  // log stools round the fire
  for (const st of YARD.stools) wood.push(cyl(0.03, 0.032, 0.075, st.x, 0.0375, st.z, 8));
  // string lights: poles and three sagging runs of bulbs
  const H = 0.3;
  for (const p of YARD.poles) wood.push(box(0.012, H, 0.012, p.x, H / 2, p.z));
  const runs: Array<[{ x: number; z: number }, { x: number; z: number }]> = [[YARD.poles[0], YARD.poles[1]], [YARD.poles[1], YARD.poles[2]], [YARD.poles[2], YARD.poles[0]]];
  for (const [a, b] of runs) {
    const n = 14;
    let prev: THREE.Vector3 | null = null;
    for (let k = 0; k <= n; k++) {
      const u = k / n, y = H - 0.008 - 0.05 * 4 * u * (1 - u);
      const v = new THREE.Vector3(a.x + (b.x - a.x) * u, y, a.z + (b.z - a.z) * u);
      if (k > 0 && k < n) bulb.push(new THREE.SphereGeometry(0.007, 5, 4).translate(v.x, v.y - 0.008, v.z));
      if (prev) {
        const seg = new THREE.CylinderGeometry(0.0012, 0.0012, prev.distanceTo(v), 3);
        seg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().sub(prev).normalize()));
        cord.push(seg.translate((v.x + prev.x) / 2, (v.y + prev.y) / 2, (v.z + prev.z) / 2));
      }
      prev = v;
    }
  }
  const g = new THREE.Group();
  g.name = 'chore_yard';
  const add = (list: THREE.BufferGeometry[], mat: THREE.Material, shadow = true, name = '') => {
    if (!list.length) return null;
    const geo = mergeGeometries(list.map(x => (x.index ? x.toNonIndexed() : x)).map(x => { x.deleteAttribute('uv'); return x; }));
    list.forEach(x => x.dispose());
    if (!geo) return null;
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow; m.receiveShadow = true; m.name = name;
    g.add(m);
    return m;
  };
  add(wood, kitMaterial('frame'), true, 'yard_wood');
  const splitMat = new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.9 });
  add(split, splitMat, true, 'yard_split');
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x4a4e52, roughness: 0.55, metalness: 0.5 });
  add(metal, metalMat, true, 'yard_metal');
  const cordMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
  add(cord, cordMat, false, 'yard_cord');
  // washing on the line: vertex colors in one double-sided mesh
  const cl = clothGeo.map(([geo, c]) => {
    const col = new THREE.Color(c), n = geo.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.toArray(arr, i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  });
  cloth.push(...cl);
  const clothMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
  add(cloth, clothMat, true, 'yard_cloth');
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.25, 0.15) });
  add(bulb, bulbMat, false, 'yard_bulbs');
  // grill smoke
  const smokeMat = new THREE.SpriteMaterial({ map: softTex(), color: 0xc8c4bc, transparent: true, opacity: 0, depthWrite: false });
  const puffs: THREE.Sprite[] = [];
  for (let i = 0; i < 6; i++) { const sp = new THREE.Sprite(smokeMat); sp.visible = false; g.add(sp); puffs.push(sp); }
  return {
    group: g,
    update(time, lights, smoke) {
      // warm bulbs: dull glass by day, glowing (bloom) when lit
      bulbMat.color.setRGB(0.3 + 2.4 * lights, 0.25 + 1.75 * lights, 0.15 + 0.75 * lights);
      smokeMat.opacity = 0.45 * smoke;
      puffs.forEach((sp, i) => {
        sp.visible = smoke > 0.02;
        if (!sp.visible) return;
        const u = (time * 0.25 + i / puffs.length) % 1;
        sp.position.set(YARD.grill.x + Math.sin(time * 0.7 + i) * 0.03 * u, 0.12 + u * 0.45, YARD.grill.z + 0.02 * u);
        sp.scale.setScalar(0.05 + 0.16 * u);
      });
    },
    dispose() {
      g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
      splitMat.dispose(); metalMat.dispose(); cordMat.dispose(); clothMat.dispose(); bulbMat.dispose(); smokeMat.dispose();
    },
  };
}
