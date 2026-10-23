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

/** Build-order layers: each is drawn (and grown) separately as construction proceeds. */
export type CabinLayer = 'stakes' | 'foundation' | 'deck' | 'frame' | 'rafters' | 'roof' | 'walls' | 'openings' | 'chimney' | 'scaffold';
export const CABIN_LAYERS: readonly CabinLayer[] = ['stakes', 'foundation', 'deck', 'frame', 'rafters', 'roof', 'walls', 'openings', 'chimney', 'scaffold'];

interface Parts { layer: CabinLayer; map: Map<string, THREE.BufferGeometry[]> }

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
  const k = `${parts.layer}|${m}`;
  let l = parts.map.get(k);
  if (!l) parts.map.set(k, l = []);
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

/** All layers of the cabin as meshes tagged userData.layer (one per layer × material). */
export function buildCabinLayers(def: KitPieceDef): THREE.Group {
  const C = CABIN;
  const W = def.cellsX * CELL, D = def.cellsZ * CELL;
  const hw = W / 2, hd = D / 2;
  const parts: Parts = { layer: 'stakes', map: new Map() };
  const y0 = C.floor, yE = C.floor + C.wallH;
  const pitch = Math.atan2(C.rise, hw);
  const z0 = -hd - C.gableOver, z1 = hd + C.porch + 0.03;
  const pz0 = hd, pz1 = hd + C.porch;

  // ── Stakes and string lines (site layout) ──
  parts.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(parts, 'trim', box(0.012, 0.09, 0.012, sx * (hw + 0.04), -0.02, sz * (hd + 0.04)));
  for (const sz of [-1, 1]) add(parts, 'string', box(W + 0.08, 0.003, 0.003, 0, 0.055, sz * (hd + 0.04)));
  for (const sx of [-1, 1]) add(parts, 'string', box(0.003, 0.003, D + 0.08, sx * (hw + 0.04), 0.055, 0));

  // ── Foundation: fieldstone plinth (built in courses: bottom first) + porch footing ──
  parts.layer = 'foundation';
  const courses = 4, ch = (C.floor + 0.03) / courses;
  for (let i = 0; i < courses; i++) add(parts, 'fieldstone', box(W + 0.03, ch, D + 0.03, 0, -0.03 + i * ch, 0));
  add(parts, 'fieldstone', box(W, y0 - 0.025 + 0.03, 0.04, 0, -0.03, pz1 - 0.02));

  // ── Floor deck + porch deck + steps ──
  parts.layer = 'deck';
  add(parts, 'deck', box(W - 0.01, 0.012, D - 0.01, 0, y0 - 0.004, 0));
  add(parts, 'deck', box(W + 0.02, 0.025, C.porch, 0, y0 - 0.025, (pz0 + pz1) / 2));
  add(parts, 'deck', box(0.32, 0.03, 0.06, C.door.x, y0 * 0.5 - 0.03, pz1 + 0.03));
  add(parts, 'deck', box(0.32, 0.03, 0.06, C.door.x, -0.03, pz1 + 0.09));

  // ── Wall framing: plates, studs ~40 cm apart, gable studs, porch posts (left → right, wall by wall) ──
  parts.layer = 'frame';
  const sw = 0.012, sd = 0.022, sp = 0.068;
  for (const sz of [-1, 1]) {
    const z = sz * (hd - sd / 2);
    add(parts, 'frame', box(W, 0.01, sd, 0, y0, z));
    for (let x = -hw + sw / 2; x <= hw - sw / 2 + 1e-6; x += sp) add(parts, 'frame', box(sw, C.wallH - 0.02, sd, x, y0 + 0.01, z));
    add(parts, 'frame', box(W, 0.01, sd, 0, yE - 0.01, z));
    for (let x = -hw + sp; x < hw - 0.02; x += sp) {
      const hh = C.rise * (1 - Math.abs(x) / hw);
      if (hh > 0.02) add(parts, 'frame', box(sw, hh, sd, x, yE, z));
    }
  }
  for (const sx of [-1, 1]) {
    const x = sx * (hw - sd / 2);
    add(parts, 'frame', box(sd, 0.01, D, x, y0, 0));
    for (let z = -hd + sp; z < hd - 0.02; z += sp) add(parts, 'frame', box(sd, C.wallH - 0.02, sw, x, y0 + 0.01, z));
    add(parts, 'frame', box(sd, 0.01, D, x, yE - 0.01, 0));
  }
  for (const sx of [-1, 1]) add(parts, 'frame', box(0.03, yE - 0.01 - y0, 0.03, sx * (hw - 0.03), y0, pz1 - 0.03));
  add(parts, 'frame', box(W, 0.035, 0.03, 0, yE - 0.03, pz1 - 0.03));

  // ── Rafters + ridge beam ──
  parts.layer = 'rafters';
  const rLen = Math.hypot(hw + C.eave, C.rise + C.eave * C.rise / hw);
  add(parts, 'frame', box(0.02, 0.03, z1 - z0, 0, yE + C.rise - 0.02, (z0 + z1) / 2));
  for (let z = z0 + 0.02; z <= z1 - 0.02; z += 0.11) {
    for (const s2 of [-1, 1]) {
      const g = new THREE.BoxGeometry(rLen, 0.018, 0.012);
      g.translate(s2 * rLen / 2, -0.009, 0);
      g.rotateZ(s2 * -pitch);
      g.translate(0, yE + C.rise, z);
      add(parts, 'frame', g);
    }
  }

  // ── Roof: two slabs (standing seam), ridge cap ──
  parts.layer = 'roof';
  const slopeLen = Math.hypot(hw + C.eave, (C.eave * C.rise) / hw + C.rise);
  const roofT = 0.022;
  // in strips along z so the roof can go on sheet by sheet
  const strips = 6, sl = (z1 - z0) / strips;
  for (let i = 0; i < strips; i++) {
    for (const s2 of [-1, 1]) {
      const g = new THREE.BoxGeometry(slopeLen, roofT, sl + 0.001);
      g.translate(s2 * slopeLen / 2, roofT / 2, 0);
      g.rotateZ(s2 * -pitch);
      g.translate(0, yE + C.rise + 0.012, z0 + sl * (i + 0.5));
      add(parts, 'metal_roof', g);
    }
  }
  add(parts, 'chimney_cap', box(0.035, 0.02, z1 - z0, 0, yE + C.rise + 0.012, (z0 + z1) / 2));

  // ── Walls: lap siding and corner boards ──
  parts.layer = 'walls';
  add(parts, 'timber_lap', box(W, C.wallH, C.wallT, 0, y0, hd - C.wallT / 2));
  add(parts, 'timber_lap', box(C.wallT, C.wallH, D - 2 * C.wallT, hw - C.wallT / 2, y0, 0));
  add(parts, 'timber_lap', box(W, C.wallH, C.wallT, 0, y0, -hd + C.wallT / 2));
  add(parts, 'timber_lap', box(C.wallT, C.wallH, D - 2 * C.wallT, -hw + C.wallT / 2, y0, 0));
  add(parts, 'timber_lap', gable(hw, C.rise, C.wallT, yE, hd - C.wallT / 2));
  add(parts, 'timber_lap', gable(hw, C.rise, C.wallT, yE, -hd + C.wallT / 2));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(parts, 'trim', box(0.028, C.wallH, 0.028, sx * (hw + 0.002), y0, sz * (hd + 0.002)));

  // ── Openings: door, windows, porch posts painted ──
  parts.layer = 'openings';
  const dz = hd + 0.004;
  add(parts, 'door', box(C.door.w, C.door.h, 0.012, C.door.x, y0, dz));
  add(parts, 'trim', box(C.door.w + 0.04, 0.02, 0.018, C.door.x, y0 + C.door.h, dz + 0.002));
  add(parts, 'trim', box(0.02, C.door.h, 0.018, C.door.x - C.door.w / 2 - 0.01, y0, dz + 0.002));
  add(parts, 'trim', box(0.02, C.door.h, 0.018, C.door.x + C.door.w / 2 + 0.01, y0, dz + 0.002));
  const wy = y0 + C.win.sill;
  windowAt(parts, 0.22, hd, wy, 0, 1);
  for (const sx of [-1, 1]) for (const z of [-0.36, 0.3]) windowAt(parts, sx * hw, z, wy, sx, 0);
  windowAt(parts, 0, -hd, yE + 0.05, 0, -1);
  for (const sx of [-1, 1]) add(parts, 'trim', box(0.032, yE - 0.01 - y0, 0.032, sx * (hw - 0.03), y0, pz1 - 0.03));
  add(parts, 'trim', box(W + 0.004, 0.037, 0.032, 0, yE - 0.031, pz1 - 0.03));

  // ── Fieldstone chimney, built up in courses ──
  parts.layer = 'chimney';
  const cx = 0.26, chW = 0.14;
  const chTop = yE + C.rise + 0.16;
  const cc = 8;
  for (let i = 0; i < cc; i++) add(parts, 'fieldstone', box(chW, (chTop + 0.03) / cc, chW, cx, -0.03 + i * (chTop + 0.03) / cc, -hd - chW / 2 + 0.01));
  add(parts, 'chimney_cap', box(chW + 0.02, 0.02, chW + 0.02, cx, chTop - 0.03, -hd - chW / 2 + 0.01));

  // ── Scaffold: tube frame and plank walks round the walls ──
  parts.layer = 'scaffold';
  const off = 0.07, tube = 0.008;
  const ring: Array<[number, number, number, number]> = [[-hw - off, -hd - off, hw + off, -hd - off], [hw + off, -hd - off, hw + off, hd + off], [-hw - off, -hd - off, -hw - off, hd + off]];
  for (const [ax, az, bx, bz] of ring) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(len / 0.28));
    for (let i = 0; i <= n; i++) {
      const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
      add(parts, 'scaffold', box(tube, yE + 0.05, tube, x, -0.03, z));
    }
    for (const yy of [y0 + 0.2, yE - 0.02]) {
      const g = box(len, tube, tube, 0, yy, 0);
      g.rotateY(-Math.atan2(bz - az, bx - ax));
      g.translate((ax + bx) / 2, 0, (az + bz) / 2);
      add(parts, 'scaffold', g);
      const pl = box(len, 0.008, 0.05, 0, yy + tube, 0);
      pl.rotateY(-Math.atan2(bz - az, bx - ax));
      pl.translate((ax + bx) / 2 + (bz - az === 0 ? 0 : Math.sign(ax) * 0.02), 0, (az + bz) / 2 + (bz - az === 0 ? Math.sign(az) * 0.02 : 0));
      add(parts, 'deck', pl);
    }
  }

  const group = new THREE.Group();
  for (const [k, list] of parts.map) {
    const [layer, m] = k.split('|') as [CabinLayer, KitMaterialId];
    const g = mergeGeometries(list);
    list.forEach(x => x.dispose());
    if (!g) continue;
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, kitMaterial(m));
    mesh.castShadow = m !== 'glass' && m !== 'string';
    mesh.receiveShadow = true;
    mesh.name = `cabin_${layer}_${m}`;
    mesh.userData = { layer, vertexCount: g.getAttribute('position').count };
    group.add(mesh);
  }
  return group;
}

/** The finished cabin (no stakes, scaffold or hidden framing). */
export function buildCabinGroup(def: KitPieceDef): THREE.Group {
  const g = buildCabinLayers(def);
  showCabinStage(g, 5, 0);
  for (const m of [...g.children]) if (!m.visible) { g.remove(m); (m as THREE.Mesh).geometry.dispose(); }
  return g;
}

/**
 * How much of each layer shows at a construction stage (0 site … 4 finish,
 * 5 done) and fraction through it. Pure (tested).
 */
export function layerFractions(stage: number, f: number, supplied: boolean): Record<CabinLayer, number> {
  const k = Math.max(0, Math.min(1, supplied ? f : 0));
  const r = {} as Record<CabinLayer, number>;
  for (const l of CABIN_LAYERS) r[l] = 0;
  if (stage >= 5) {
    for (const l of ['foundation', 'deck', 'roof', 'walls', 'openings', 'chimney'] as CabinLayer[]) r[l] = 1;
    return r;
  }
  r.stakes = stage <= 2 ? 1 : 0;
  r.foundation = stage > 1 ? 1 : stage === 1 ? k : 0;
  r.deck = stage > 2 ? 1 : stage === 2 ? Math.min(1, k * 4) : 0;
  r.frame = stage > 2 ? 1 : stage === 2 ? k : 0;
  r.rafters = stage > 3 ? 1 : stage === 3 ? Math.min(1, k * 2) : 0;
  r.roof = stage > 3 ? 1 : stage === 3 ? Math.max(0, (k - 0.35) / 0.65) : 0;
  r.walls = stage === 4 ? Math.min(1, k / 0.7) : 0;
  r.openings = stage === 4 ? Math.max(0, (k - 0.6) / 0.4) : 0;
  r.chimney = stage === 4 ? Math.min(1, k / 0.8) : 0;
  r.scaffold = stage >= 2 && stage <= 4 && !(stage === 4 && k > 0.9) ? 1 : 0;
  return r;
}

/** Show a layered cabin group at a stage: each layer drawn up to its fraction (pieces in build order). */
export function showCabinStage(group: THREE.Group, stage: number, f: number, supplied = true): void {
  const fr = layerFractions(stage, f, supplied);
  for (const o of group.children) {
    const m = o as THREE.Mesh;
    const layer = m.userData.layer as CabinLayer;
    const k = fr[layer];
    m.visible = k > 0.001;
    const n = m.userData.vertexCount as number;
    // whole triangles only, so partial layers end on a finished piece edge
    m.geometry.setDrawRange(0, k >= 0.999 ? Infinity : Math.floor((n * k) / 3) * 3);
  }
}

/** Chimney top in local coordinates (smoke source). */
export function cabinChimneyTop(def: KitPieceDef): THREE.Vector3 {
  const hd = def.cellsZ * CELL / 2;
  return new THREE.Vector3(0.26, CABIN.floor + CABIN.wallH + CABIN.rise + 0.16, -hd - 0.06);
}
