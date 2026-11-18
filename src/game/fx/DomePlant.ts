/**
 * Draws a dome's plant (sim/dome/plant.ts `plantLayout`): the air-handling house, chiller yard, water shed and tanks, substation, battery block, pipes
 * and ducts on the ground inside the wall; roof vent hatches and rooftop units on the structure; and the warm path lamps with their pools of light.
 * Three draw calls in all: one merged mesh of the machinery and lamp posts (vertex colors), one instanced mesh of lamp heads (the kit's night-driven `lamp` material)
 * and one instanced mesh of light pools on the ground (the kit's additive `spill_electric` material): no real lights, so the light pool budget is untouched.
 * It rides in the dome's own group (local frame: the dome's center, y 0 at the shell's base). SCALE v2.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { plantLayout, type PlantPart } from '../../sim/dome/plant';
import type { Filtering } from '../../sim/dome/air';
import type { DomeTier } from '../../sim/dome/tiers';
import { kitMaterial } from '../buildkit/materials';

export interface DomePlantFx { group: THREE.Group; key: string; dispose(): void }

/** Height of each tier's stem wall: the shell's base stands this far above the group's origin (game/buildkit/domeBuildings LOOK). */
const STEM: Partial<Record<DomeTier, number>> = { glass: 0.08, arcology: 0.14 };

function partGeometry(q: PlantPart, ground: (x: number, z: number) => number, stem: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = q.shape === 'box' ? new THREE.BoxGeometry(q.w, q.h, q.d) : new THREE.CylinderGeometry(q.r, q.r, q.h, 10);
  if (q.onShell) {
    const { theta, phi } = q.onShell;
    g.translate(0, q.h / 2, 0); g.rotateY(q.rot);
    const n = new THREE.Vector3(Math.sin(theta) * Math.sin(phi), Math.cos(theta), Math.sin(theta) * Math.cos(phi));
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n));
    g.translate(q.x, stem + q.y0, q.z);
  } else if (q.lie) {
    g.rotateX(Math.PI / 2); g.rotateY(q.rot);
    g.translate(q.x, ground(q.x, q.z) + q.y0, q.z);
  } else {
    g.translate(0, q.h / 2, 0); g.rotateY(q.rot);
    g.translate(q.x, q.high ? stem + q.y0 : ground(q.x, q.z) + q.y0, q.z);
  }
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const c = new THREE.Color(q.color), n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** `r`: shell radius (world units); `ground(lx, lz)`: terrain height in the dome's local frame. */
export function makeDomePlant(tier: DomeTier, r: number, filtering: Filtering, ground: (lx: number, lz: number) => number): DomePlantFx {
  const plant = plantLayout(tier, r, filtering), stem = STEM[tier] ?? 0.1;
  const group = new THREE.Group();
  group.name = 'dome_plant';
  const owned: Array<{ dispose(): void }> = [];
  const geos = plant.parts.map(q => partGeometry(q, ground, stem));
  // the lamp posts ride the machinery's own merged mesh (thin cylinders, one color)
  for (const l of plant.lamps) geos.push(partGeometry({ shape: 'cyl', x: l.x, z: l.z, y0: 0, w: 0, h: l.y, d: 0, r: 0.014, rot: 0, color: 0x30343a }, ground, stem));
  const merged = geos.length ? mergeGeometries(geos, false) : null;
  geos.forEach(g => g.dispose());
  if (merged) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.25, flatShading: true });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = 'plant_machinery'; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    group.add(mesh); owned.push(merged, mat);
  }
  if (plant.lamps.length) {
    const n = plant.lamps.length;
    const headGeo = new THREE.SphereGeometry(0.035, 8, 6), heads = new THREE.InstancedMesh(headGeo, kitMaterial('lamp'), n);
    const poolGeo = new THREE.CircleGeometry(0.55, 20); poolGeo.rotateX(-Math.PI / 2);
    const pools = new THREE.InstancedMesh(poolGeo, kitMaterial('spill_electric'), n);
    const m4 = new THREE.Matrix4();
    plant.lamps.forEach((l, i) => {
      const gy = ground(l.x, l.z);
      heads.setMatrixAt(i, m4.makeTranslation(l.x, gy + l.y + 0.03, l.z));
      pools.setMatrixAt(i, m4.makeTranslation(l.x, gy + 0.012, l.z));
    });
    for (const m of [heads, pools]) { m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; group.add(m); }
    pools.renderOrder = 2;
    owned.push(headGeo, poolGeo);
  }
  group.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return { group, key: `${tier}:${r.toFixed(2)}:${filtering}`, dispose: () => { for (const o of owned) o.dispose(); } };
}
