/**
 * Timber cabin geometry (the first build-kit piece): a 6 × 9 m one-room
 * cabin on a fieldstone foundation, lap-sided walls with corner boards, a
 * steep standing-seam metal gable roof running out over a front porch, a
 * plank door, four-light windows with sills, and a fieldstone chimney on the
 * back gable. Mountain West homestead vernacular.
 *
 * Local frame: origin at the footprint centre on the pad (y = 0), ridge
 * along z, door / porch on the +z gable. One merged mesh per material
 * (≈ 8 draw calls); every face carries world-scaled UVs (1 UV = 1 unit) so
 * the kit textures keep their real size.
 *
 * Scale (UE SCALE v2): 1 unit ≈ 6 m; door ≈ 0.36 (2.15 m), storey 0.45.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { kitMaterial, type KitMaterialId } from './materials';
import { CELL, type KitPieceDef } from './kit';

/** Cabin dimensions (world units). */
export const CABIN = {
  /** Foundation height above the pad. */
  floor: 0.09,
  wallH: 0.45,
  wallT: 0.035,
  /** Roof rise over half the width (≈ 10:12 pitch). */
  rise: 0.42,
  eave: 0.07,
  gableOver: 0.05,
  porch: 0.42,
  door: { w: 0.16, h: 0.36, x: -0.13 },
  win: { w: 0.17, h: 0.2, sill: 0.17 },
} as const;

type Parts = Map<KitMaterialId, THREE.BufferGeometry[]>;

/** World-scaled UVs from position by dominant normal axis (walls: u along the face, v up). */
function worldUV(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  geo.computeVertexNormals();
  const p = geo.getAttribute('position'), n = geo.getAttribute('normal');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u: number, v: number;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

function add(parts: Parts, m: KitMaterialId, g: THREE.BufferGeometry): void {
  let l = parts.get(m);
  if (!l) parts.set(m, l = []);
  l.push(worldUV(g));
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

/** A gable-end triangle (wall infill above the eave line), thickness t, in the x/y plane at z. */
function gable(halfW: number, rise: number, t: number, y0: number, z: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-halfW, 0); s.lineTo(halfW, 0); s.lineTo(0, rise); s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false }).translate(0, y0, z - t / 2);
}

/** A window on a wall: frame, glass, muntins, sill. `nx/nz` is the outward normal. */
function windowAt(parts: Parts, cx: number, cz: number, y: number, nx: number, nz: number): void {
  const { w, h } = CABIN.win;
  const t = 0.012, out = CABIN.wallT / 2 + 0.004;
  const along = nx !== 0 ? 'z' : 'x';
  const bx = (a: number, hh: number, depth: number, oa: number, oy: number, oo: number) => {
    const g = along === 'x' ? box(a, hh, depth, cx + oa, oy, cz + nz * oo) : box(depth, hh, a, cx + nx * oo, oy, cz + oa);
    return g;
  };
  add(parts, 'glass', bx(w, h, 0.006, 0, y, out - 0.006));
  add(parts, 'trim', bx(w + 2 * t, t, 0.016, 0, y + h, out));
  add(parts, 'trim', bx(w + 2 * t, t, 0.016, 0, y - t, out));
  add(parts, 'trim', bx(t, h, 0.016, -w / 2 - t / 2, y, out));
  add(parts, 'trim', bx(t, h, 0.016, w / 2 + t / 2, y, out));
  add(parts, 'trim', bx(0.006, h, 0.01, 0, y, out));
  add(parts, 'trim', bx(w, 0.006, 0.01, 0, y + h / 2, out));
  add(parts, 'trim', bx(w + 0.05, 0.012, 0.035, 0, y - t - 0.012, out + 0.01));
}

export function buildCabinGroup(def: KitPieceDef): THREE.Group {
  const C = CABIN;
  const W = def.cellsX * CELL, D = def.cellsZ * CELL;
  const hw = W / 2, hd = D / 2;
  const parts: Parts = new Map();
  const y0 = C.floor, yE = C.floor + C.wallH;

  // Foundation: fieldstone plinth, a little proud of the walls
  add(parts, 'fieldstone', box(W + 0.03, C.floor + 0.03, D + 0.03, 0, -0.03, 0));
  // Walls (lap siding)
  add(parts, 'timber_lap', box(W, C.wallH, C.wallT, 0, y0, hd - C.wallT / 2));
  add(parts, 'timber_lap', box(W, C.wallH, C.wallT, 0, y0, -hd + C.wallT / 2));
  add(parts, 'timber_lap', box(C.wallT, C.wallH, D - 2 * C.wallT, hw - C.wallT / 2, y0, 0));
  add(parts, 'timber_lap', box(C.wallT, C.wallH, D - 2 * C.wallT, -hw + C.wallT / 2, y0, 0));
  add(parts, 'timber_lap', gable(hw, C.rise, C.wallT, yE, hd - C.wallT / 2));
  add(parts, 'timber_lap', gable(hw, C.rise, C.wallT, yE, -hd + C.wallT / 2));
  // Corner boards
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(parts, 'trim', box(0.028, C.wallH, 0.028, sx * (hw + 0.002), y0, sz * (hd + 0.002)));

  // Roof: two slabs from the ridge past the eaves, out over the porch at the front
  const pitch = Math.atan2(C.rise, hw);
  const slopeLen = Math.hypot(hw + C.eave, (C.eave * C.rise) / hw + C.rise);
  const z0 = -hd - C.gableOver, z1 = hd + C.porch + 0.03;
  const roofT = 0.022;
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(slopeLen, roofT, z1 - z0);
    g.translate(s * slopeLen / 2, roofT / 2, 0);
    g.rotateZ(s * -pitch);
    g.translate(0, yE + C.rise + 0.012, (z0 + z1) / 2);
    add(parts, 'metal_roof', g);
  }
  // Ridge cap
  add(parts, 'chimney_cap', box(0.035, 0.02, z1 - z0, 0, yE + C.rise + 0.012, (z0 + z1) / 2));
  // Porch: deck on joists, four posts, two steps
  const pz0 = hd, pz1 = hd + C.porch;
  add(parts, 'deck', box(W + 0.02, 0.025, C.porch, 0, y0 - 0.025, (pz0 + pz1) / 2));
  add(parts, 'fieldstone', box(W, y0 - 0.025 + 0.03, 0.04, 0, -0.03, pz1 - 0.02));
  for (const sx of [-1, 1]) {
    const px = sx * (hw - 0.03), pz = pz1 - 0.03;
    add(parts, 'trim', box(0.03, yE - 0.01 - y0, 0.03, px, y0, pz));
  }
  add(parts, 'trim', box(W, 0.035, 0.03, 0, yE - 0.03, pz1 - 0.03));   // porch beam
  add(parts, 'deck', box(0.32, 0.03, 0.06, C.door.x, y0 * 0.5 - 0.03, pz1 + 0.03));
  add(parts, 'deck', box(0.32, 0.03, 0.06, C.door.x, -0.03, pz1 + 0.09));
  // Door on the porch gable
  const dz = hd + 0.004;
  add(parts, 'door', box(C.door.w, C.door.h, 0.012, C.door.x, y0, dz));
  add(parts, 'trim', box(C.door.w + 0.04, 0.02, 0.018, C.door.x, y0 + C.door.h, dz + 0.002));
  add(parts, 'trim', box(0.02, C.door.h, 0.018, C.door.x - C.door.w / 2 - 0.01, y0, dz + 0.002));
  add(parts, 'trim', box(0.02, C.door.h, 0.018, C.door.x + C.door.w / 2 + 0.01, y0, dz + 0.002));
  // Windows: one by the door, two each side, one up in the back gable
  const wy = y0 + C.win.sill;
  windowAt(parts, 0.22, hd, wy, 0, 1);
  for (const sx of [-1, 1]) for (const z of [-0.36, 0.3]) windowAt(parts, sx * hw, z, wy, sx, 0);
  windowAt(parts, 0, -hd, yE + 0.05, 0, -1);
  // Fieldstone chimney on the back gable, off-centre, up past the ridge
  const cx = 0.26, chW = 0.14;
  const chTop = yE + C.rise + 0.16;
  add(parts, 'fieldstone', box(chW, chTop, chW, cx, -0.03, -hd - chW / 2 + 0.01));
  add(parts, 'chimney_cap', box(chW + 0.02, 0.02, chW + 0.02, cx, chTop - 0.03, -hd - chW / 2 + 0.01));

  const group = new THREE.Group();
  for (const [m, list] of parts) {
    const g = mergeGeometries(list);
    list.forEach(x => x.dispose());
    if (!g) continue;
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, kitMaterial(m));
    mesh.castShadow = m !== 'glass';
    mesh.receiveShadow = true;
    mesh.name = `cabin_${m}`;
    group.add(mesh);
  }
  return group;
}

/** Chimney top in local coordinates (smoke source). */
export function cabinChimneyTop(def: KitPieceDef): THREE.Vector3 {
  const hd = def.cellsZ * CELL / 2;
  return new THREE.Vector3(0.26, CABIN.floor + CABIN.wallH + CABIN.rise + 0.16, -hd - 0.06);
}
