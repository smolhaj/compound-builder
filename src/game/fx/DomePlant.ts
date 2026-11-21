/**
 * Draws a dome's plant (sim/dome/plant.ts `plantLayout`): the air-handling house, chiller yard, water shed and tanks, substation, battery block, pipes
 * and ducts on the ground inside the wall; roof vent hatches and rooftop units on the structure; and the warm path lamps with their pools of light.
 * Three draw calls in all: one merged mesh of the machinery and lamp posts (vertex colors), one instanced mesh of lamp heads (the kit's night-driven `lamp` material)
 * and one instanced mesh of light pools on the ground (the kit's additive `spill_electric` material): no real lights, so the light pool budget is untouched.
 * It rides in the dome's own group (local frame: the dome's center, y 0 at the shell's base). SCALE v2.
 */
import type { RoofState } from '../../sim/dome/yardRoof';
import { WORK_TILE, workTextures, worldUVs } from './portTextures';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { plantLayout, type PlantLine, type PlantPart } from '../../sim/dome/plant';
import { yardPoint, type YardGeom } from '../../sim/dome/plantYard';
import type { PlantCond, PlantKind } from '../../sim/dome/plantUnits';
import type { WaterLoop } from '../../sim/dome/waterLoop';
import type { Filtering } from '../../sim/dome/air';
import type { DomeTier } from '../../sim/dome/tiers';
import { kitMaterial } from '../buildkit/materials';
import type { InteriorPlan } from './domeInteriorPlan';
import { interiorPieces } from './DomeInterior';

export interface DomePlantFx { group: THREE.Group; key: string; /** Show the buried lines (the underground view). */ setUnder(on: boolean): void; /** The building view: in the cutaway and x-ray views the machinery turns see-through and the sealed passage shows. */ setView(v: 'full' | 'cutaway' | 'xray'): void; dispose(): void }

/** What the renderer needs of the plant's state: the loop, the spares, the dome's turn, which units are hurt, and whether the dome is dark. */
export interface PlantLook { /** The arcology's plant yard roof state (sim/dome/yardRoof.ts). */ roof?: RoofState; loop?: WaterLoop; spares?: readonly PlantKind[]; rot?: number; hurt?: Readonly<Record<string, PlantCond>>; dark?: boolean; /** The dome floor's dressing (paths, benches, crates, lamps; fx/domeInteriorPlan), merged into the plant's own draw calls, and its signature. */ interior?: InteriorPlan; interiorKey?: string }
export const plantKey = (tier: DomeTier, r: number, filtering: Filtering, o: PlantLook = {}): string =>
  `${tier}:${o.roof ?? 'closed'}:${r.toFixed(2)}:${filtering}:${o.loop ?? 'none'}:${(o.spares ?? []).join(',')}:${o.rot ?? 0}:${Object.entries(o.hurt ?? {}).filter(([, c]) => c !== 'ok').map(([k, c]) => k + c).sort().join(',')}:${o.interiorKey ?? ''}:${o.dark ? 1 : 0}`;

const LINE_COLOR: Record<PlantLine['kind'], number> = { power: 0xd9822b, chill: 0x4f9bd0, water: 0x2f7fb5, feeder: 0xe0a030, passage: 0x35e0c8 };
const CHAR = 0x1c1a18;
const tint = (hex: number, cond: PlantCond | undefined): number => {
  if (!cond || cond === 'ok') return hex;
  return new THREE.Color(hex).lerp(new THREE.Color(CHAR), cond === 'down' ? 0.78 : 0.38).getHex();
};

/** Height of each tier's stem wall: the shell's base stands this far above the group's origin (game/buildkit/domeBuildings LOOK). */
const STEM: Partial<Record<DomeTier, number>> = { glass: 0.08, arcology: 0.14 };

/** The yard's level plane: the highest ground under its footprint (and a margin), so its roof and wall tops are one flat level on sloping land. */
export function yardLevel(y: YardGeom | null | undefined, ground: (x: number, z: number) => number): number {
  if (!y) return 0;
  let m = -Infinity;
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 4; j++) { const [x, z] = yardPoint(y, -y.W / 2 - 0.2 + (y.W + 0.4) * i / 8, -0.2 + (y.D + 0.4) * j / 4); m = Math.max(m, ground(x, z)); }
  return m;
}

function partGeometry(q: PlantPart, ground: (x: number, z: number) => number, stem: number, color = q.color, level = 0): THREE.BufferGeometry {
  if (q.wallTop !== undefined && q.shape === 'box') {
    // a wall run: from the lowest ground under it (less the embed y0) up to the yard's level top, so wall tops are level whatever the slope does
    const c = Math.cos(q.rot), sn = -Math.sin(q.rot);
    const gs = [-0.5, 0, 0.5].map(k => ground(q.x + c * q.w * k, q.z + sn * q.w * k)), bot = Math.min(...gs) + q.y0, top = level + q.wallTop;
    const h = Math.max(0.02, top - bot);
    let g: THREE.BufferGeometry = new THREE.BoxGeometry(q.w, h, q.d);
    g.translate(0, h / 2, 0); g.rotateY(q.rot); g.translate(q.x, bot, q.z);
    g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv');
    const c0 = new THREE.Color(color), n0 = g.attributes.position.count, col0 = new Float32Array(n0 * 3);
    for (let i = 0; i < n0; i++) { col0[i * 3] = c0.r; col0[i * 3 + 1] = c0.g; col0[i * 3 + 2] = c0.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col0, 3));
    return g;
  }
  let g: THREE.BufferGeometry = q.shape === 'box' ? new THREE.BoxGeometry(q.w, q.h, q.d) : new THREE.CylinderGeometry(q.r2 ?? q.r, q.r, q.h, q.r < 0.03 ? 6 : 10);
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
    g.translate(q.x, q.lvl ? level + q.y0 : q.high ? stem + q.y0 : ground(q.x, q.z) + q.y0, q.z);
  }
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const c = new THREE.Color(color), n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** `r`: shell radius (world units); `ground(lx, lz)`: terrain height in the dome's local frame. */
export function makeDomePlant(tier: DomeTier, r: number, filtering: Filtering, ground: (lx: number, lz: number) => number, look: PlantLook = {}): DomePlantFx {
  const plant = plantLayout(tier, r, filtering, { loop: look.loop, spares: look.spares, rot: look.rot, roof: look.roof }), stem = STEM[tier] ?? 0.1, hurt = look.hurt ?? {};
  const group = new THREE.Group();
  group.name = 'dome_plant';
  const owned: Array<{ dispose(): void }> = [];
  const level = yardLevel(plant.yard, ground);
  const geos = plant.parts.map(q => partGeometry(q, ground, stem, tint(q.color, q.unit ? hurt[q.unit] : undefined), level));
  // a unit that is out burns and smokes: stylized flames and a plume in the same merged mesh (no extra draw call)
  for (const u of plant.units) {
    const c = hurt[u.id]; if (!c || c === 'ok') continue;
    const s = plant.scale, fl = (dx: number, dz: number, h: number, rad: number, col: number, y0 = 0): THREE.BufferGeometry => partGeometry({ shape: 'cyl', x: u.x + dx * s, z: u.z + dz * s, y0, w: 0, h: h * s, d: 0, r: rad * s, rot: 0, color: col }, ground, stem);
    if (c === 'down') { geos.push(fl(0.1, 0, 0.3, 0.07, 0xe8601a, 0.45 * s), fl(-0.12, 0.08, 0.2, 0.05, 0xf2a21f, 0.5 * s), fl(0.02, -0.1, 0.24, 0.05, 0xd9461a, 0.45 * s)); }
    geos.push(fl(0.05, 0, c === 'down' ? 0.45 : 0.25, c === 'down' ? 0.045 : 0.03, 0x4a4643, 0.7 * s), fl(0.07, 0.03, c === 'down' ? 0.35 : 0.2, c === 'down' ? 0.07 : 0.045, 0x6a655f, 1.1 * s));
  }
  // the lamp posts ride the machinery's own merged mesh (thin cylinders, one color)
  // the dome floor's dressing rides along: its pieces in the same merged mesh, its lamps and window-light pools in the same instances (no draw call of their own)
  const lampList: Array<{ x: number; z: number; y: number; k: number }> = plant.lamps.map(l => ({ x: l.x, z: l.z, y: l.y, k: 1 }));
  if (look.interior) {
    for (const g of interiorPieces(look.interior, ground)) geos.push(g);
    for (const l of look.interior.lamps) lampList.push({ x: l.x, z: l.z, y: 0.62, k: 1.7 });
  }
  const colorPart = (g: THREE.BufferGeometry, color: number, x: number, y: number, z: number): THREE.BufferGeometry => {
    const ng = g.index ? g.toNonIndexed() : g; ng.deleteAttribute('uv'); ng.translate(x, y, z);
    const c = new THREE.Color(color), col = new Float32Array(ng.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3)); return ng;
  };
  for (const l of lampList) {
    geos.push(partGeometry({ shape: 'cyl', x: l.x, z: l.z, y0: 0, w: 0, h: l.y, d: 0, r: 0.014, rot: 0, color: 0x30343a }, ground, stem));
    // a real fixture: a flared base collar, a lantern housing (dark frame under the lens), a hooded cap and a ring
    const gy = ground(l.x, l.z);
    geos.push(colorPart(new THREE.CylinderGeometry(0.022, 0.03, 0.06, 8), 0x23272c, l.x, gy + 0.03, l.z),
      colorPart(new THREE.CylinderGeometry(0.03, 0.026, 0.014, 8), 0x23272c, l.x, gy + l.y + 0.006, l.z),
      colorPart(new THREE.CylinderGeometry(0.014, 0.046, 0.026, 8), 0x2d3238, l.x, gy + l.y + 0.074, l.z),
      colorPart(new THREE.CylinderGeometry(0.044, 0.044, 0.006, 8), 0x23272c, l.x, gy + l.y + 0.057, l.z));
  }
  const merged0 = geos.length ? mergeGeometries(geos, false) : null;
  geos.forEach(g => g.dispose());
  const merged = merged0 ? worldUVs(merged0, WORK_TILE) : null;
  if (merged && merged0 !== merged) merged0!.dispose();
  if (merged) {
    const wt = typeof document !== 'undefined' ? workTextures() : null;      // (no canvas in the node tests)
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, ...(wt ? { map: wt.map } : {}), roughness: 0.78, metalness: 0.25, flatShading: true });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = 'plant_machinery'; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    group.add(mesh); owned.push(merged, mat);
  }
  const glows = look.interior?.glows ?? [];
  if (lampList.length && !look.dark) {
    const n = lampList.length, ng = glows.length;
    const headGeo = new THREE.CylinderGeometry(0.03, 0.026, 0.044, 8), heads = new THREE.InstancedMesh(headGeo, kitMaterial('lamp'), n);
    const poolGeo = new THREE.CircleGeometry(0.55, 20); poolGeo.rotateX(-Math.PI / 2);
    const pools = new THREE.InstancedMesh(poolGeo, kitMaterial('spill_electric'), n + ng);
    const m4 = new THREE.Matrix4(), sc = new THREE.Vector3(), q0 = new THREE.Quaternion(), pos = new THREE.Vector3();
    lampList.forEach((l, i) => {
      const gy = ground(l.x, l.z);
      heads.setMatrixAt(i, m4.makeTranslation(l.x, gy + l.y + 0.035, l.z));
      pools.setMatrixAt(i, m4.compose(pos.set(l.x, gy + 0.012, l.z), q0, sc.set(l.k, 1, l.k)));
    });
    glows.forEach((o, i) => pools.setMatrixAt(n + i, m4.compose(pos.set(o.x, ground(o.x, o.z) + (o.y ?? 0) + 0.02, o.z), q0, sc.set(o.r / 0.55, 1, o.r / 0.55))));
    for (const m of [heads, pools]) { m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; group.add(m); }
    pools.renderOrder = 2;
    owned.push(headGeo, poolGeo);
  }
  // the buried lines: only in the underground view (U); each leaves the yard in a sealed sleeve through the footing. The sealed passage is its own mesh: it also
  // shows in the cutaway and x-ray views (a fat teal tube from the service airlock to the yard)
  const lineMesh = (name: string, pick: (ln: PlantLine) => boolean): THREE.Mesh | null => {
    const pieces: THREE.BufferGeometry[] = [];
    for (const ln of plant.lines.filter(pick)) for (let i = 1; i < ln.pts.length; i++) {
      const [ax, az] = ln.pts[i - 1], [bx, bz] = ln.pts[i], len = Math.hypot(bx - ax, bz - az); if (len < 1e-3) continue;
      const rad = ln.kind === 'passage' ? 0.14 : ln.kind === 'feeder' ? 0.035 : 0.025;
      const g = new THREE.CylinderGeometry(rad, rad, len, 8);
      g.rotateZ(Math.PI / 2); g.rotateY(Math.atan2(-(bz - az), bx - ax));
      const mx = (ax + bx) / 2, mz = (az + bz) / 2; g.translate(mx, ground(mx, mz) - ln.depth, mz);
      g.deleteAttribute('uv'); const ng = g.toNonIndexed(), col = new THREE.Color(LINE_COLOR[ln.kind]), arr = new Float32Array(ng.attributes.position.count * 3);
      for (let k = 0; k < ng.attributes.position.count; k++) { arr[k * 3] = col.r; arr[k * 3 + 1] = col.g; arr[k * 3 + 2] = col.b; }
      ng.setAttribute('color', new THREE.BufferAttribute(arr, 3)); pieces.push(ng); g.dispose();
    }
    if (!pieces.length) return null;
    const geo = mergeGeometries(pieces, false); pieces.forEach(g => g.dispose());
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2, emissive: 0x201408, transparent: true, opacity: 0.85 });
    const m = new THREE.Mesh(geo, mat); m.name = name; m.visible = false; m.matrixAutoUpdate = false; m.updateMatrix(); m.castShadow = false; m.receiveShadow = false;
    group.add(m); owned.push(geo, mat);
    return m;
  };
  const lines = lineMesh('plant_lines', ln => ln.kind !== 'passage'), passage = lineMesh('plant_passage', ln => ln.kind === 'passage');
  let under = false, view: 'full' | 'cutaway' | 'xray' = 'full';
  const machMat = group.getObjectByName('plant_machinery') ? ((group.getObjectByName('plant_machinery') as THREE.Mesh).material as THREE.MeshStandardMaterial) : null;
  const apply = (): void => {
    if (lines) lines.visible = under;
    if (passage) passage.visible = under || view !== 'full';
    if (machMat) { const see = view !== 'full' || under; machMat.transparent = see; machMat.opacity = see ? 0.5 : 1; machMat.depthWrite = !see; machMat.needsUpdate = true; }
  };
  group.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return { group, key: plantKey(tier, r, filtering, look), setUnder: on => { under = on; apply(); }, setView: v => { view = v; apply(); }, dispose: () => { for (const o of owned) o.dispose(); } };
}
