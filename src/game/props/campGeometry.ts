/**
 * The family's first camp (until the cabin is up): a canvas wall tent on a
 * low frame, a stone fire ring with a fire, a camp table with benches and a
 * water barrel. Procedural; one mesh per material. Local frame: origin at
 * the camp center, tent door facing +z toward the fire.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { kitMaterial } from '../buildkit/materials';

/** Where things are in the camp (local, world units). */
export const CAMP = {
  tent: { x: 0, z: -0.45, w: 0.52, d: 0.7, wall: 0.17, ridge: 0.38 },
  fire: { x: 0, z: 0.35 },
  table: { x: 0.62, z: 0.05 },
  barrel: { x: -0.42, z: -0.05 },
} as const;

let _canvas: THREE.MeshStandardMaterial | null = null;
let _flame: THREE.MeshBasicMaterial | null = null;

function canvasMat(): THREE.MeshStandardMaterial {
  return _canvas ??= new THREE.MeshStandardMaterial({ color: 0xd9ceb0, roughness: 0.95, side: THREE.DoubleSide });
}

/** Flame material (its color flickers: see flickerCampfire). */
function flameMat(): THREE.MeshBasicMaterial {
  return _flame ??= new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.0, 0.3), transparent: true, opacity: 0.9, depthWrite: false });
}

export function buildCamp(): THREE.Group {
  const T = CAMP.tent;
  const canvas: THREE.BufferGeometry[] = [], wood: THREE.BufferGeometry[] = [], stone: THREE.BufferGeometry[] = [], flame: THREE.BufferGeometry[] = [], metal: THREE.BufferGeometry[] = [];
  // Tent: four short walls + a gable roof (open-ended prism) + door flap
  const hw = T.w / 2, hd = T.d / 2;
  canvas.push(new THREE.BoxGeometry(T.w, T.wall, 0.004).translate(T.x, T.wall / 2, T.z - hd));
  for (const s of [-1, 1]) canvas.push(new THREE.BoxGeometry(0.004, T.wall, T.d).translate(T.x + s * hw, T.wall / 2, T.z));
  const roofL = Math.hypot(hw, T.ridge - T.wall);
  const pitch = Math.atan2(T.ridge - T.wall, hw);
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(roofL + 0.03, T.d + 0.06);
    g.rotateX(-Math.PI / 2);
    g.translate(s * (roofL + 0.03) / 2, 0, 0);
    g.rotateZ(s * -pitch);
    g.translate(T.x, T.ridge, T.z);
    canvas.push(g);
  }
  for (const zf of [-1, 1]) {
    const sh = new THREE.Shape();
    sh.moveTo(-hw, 0); sh.lineTo(hw, 0); sh.lineTo(0, T.ridge - T.wall); sh.closePath();
    canvas.push(new THREE.ShapeGeometry(sh).translate(T.x, T.wall, T.z + zf * hd));
  }
  // front wall with the door flaps tied back
  for (const s of [-1, 1]) canvas.push(new THREE.BoxGeometry(hw - 0.08, T.wall, 0.004).translate(T.x + s * (hw + 0.08) / 2, T.wall / 2, T.z + hd));
  // ridge pole, stove pipe
  wood.push(new THREE.CylinderGeometry(0.006, 0.006, T.d + 0.1, 5).rotateX(Math.PI / 2).translate(T.x, T.ridge + 0.004, T.z));
  metal.push(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8).translate(T.x + 0.12, T.ridge + 0.02, T.z - 0.15));
  // Fire ring + logs + flames
  const F = CAMP.fire;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    stone.push(new THREE.DodecahedronGeometry(0.028, 0).scale(1, 0.7, 1).translate(F.x + Math.cos(a) * 0.09, 0.012, F.z + Math.sin(a) * 0.09));
  }
  for (let i = 0; i < 3; i++) wood.push(new THREE.CylinderGeometry(0.01, 0.012, 0.13, 5).rotateZ(Math.PI / 2).rotateY(i * 2.1).translate(F.x, 0.015, F.z));
  flame.push(new THREE.ConeGeometry(0.035, 0.11, 6).translate(F.x, 0.07, F.z), new THREE.ConeGeometry(0.02, 0.07, 5).translate(F.x + 0.02, 0.05, F.z + 0.01));
  // Camp table + two benches (seat top ≈ 0.075 = UE bench height)
  const Tb = CAMP.table;
  wood.push(new THREE.BoxGeometry(0.3, 0.012, 0.14).translate(Tb.x, 0.125, Tb.z));
  for (const s of [-1, 1]) {
    wood.push(new THREE.BoxGeometry(0.3, 0.01, 0.05).translate(Tb.x, 0.075, Tb.z + s * 0.12));
    for (const t of [-1, 1]) {
      wood.push(new THREE.BoxGeometry(0.012, 0.125, 0.012).translate(Tb.x + t * 0.13, 0.0625, Tb.z + s * 0.05));
      wood.push(new THREE.BoxGeometry(0.012, 0.075, 0.012).translate(Tb.x + t * 0.13, 0.0375, Tb.z + s * 0.12));
    }
  }
  // Water barrel
  metal.push(new THREE.CylinderGeometry(0.05, 0.05, 0.15, 12).translate(CAMP.barrel.x, 0.075, CAMP.barrel.z));
  const g = new THREE.Group();
  const add = (list: THREE.BufferGeometry[], mat: THREE.Material, shadow = true, name = '') => {
    const geo = mergeGeometries(list.map(x => (x.index ? x.toNonIndexed() : x)).map(x => { x.deleteAttribute('uv'); return x; }));
    if (!geo) return;
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow; m.receiveShadow = true; m.name = name;
    g.add(m);
  };
  add(canvas, canvasMat(), true, 'camp_canvas');
  add(wood, kitMaterial('frame'), true, 'camp_wood');
  add(stone, kitMaterial('chimney_cap'), true, 'camp_stone');
  add(metal, new THREE.MeshStandardMaterial({ color: 0x3e5a6e, roughness: 0.5, metalness: 0.4 }), true, 'camp_metal');
  add(flame, flameMat(), false, 'camp_flame');
  g.userData = { type: 'camp' };
  return g;
}

/** Flicker the fire (and hide it when nobody tends it). */
export function flickerCampfire(time: number, lit: number): void {
  const m = flameMat();
  const f = 0.75 + 0.25 * Math.sin(time * 13) * Math.sin(time * 7.3 + 1);
  m.color.setRGB(2.2 * f, 1.0 * f, 0.3 * f);
  m.opacity = 0.9 * lit;
  m.visible = lit > 0.02;
}
