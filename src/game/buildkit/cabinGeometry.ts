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
import { Furniture, piece, wallRun, M, type Collider, type Opening, type Sink } from './interior';

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
export type CabinLayer = 'stakes' | 'foundation' | 'deck' | 'frame' | 'rafters' | 'roof' | 'walls' | 'openings' | 'chimney' | 'scaffold'
  | 'interior' | 'loft' | 'cutwalls';
export const CABIN_LAYERS: readonly CabinLayer[] = ['stakes', 'foundation', 'deck', 'frame', 'rafters', 'roof', 'walls', 'openings', 'chimney', 'scaffold', 'interior', 'loft', 'cutwalls'];

/** Layers hidden in the cutaway view (upper floor, roof, full-height walls) and the one shown instead. */
export const CUTAWAY_HIDE: readonly CabinLayer[] = ['roof', 'walls', 'openings', 'loft', 'rafters'];
/** Layers drawn see-through in the x-ray view. */
export const XRAY_LAYERS: readonly CabinLayer[] = ['roof', 'walls', 'openings', 'chimney', 'rafters'];
/** Waist-high cut for the cutaway view (above the floor). */
export const CUT_H = 0.2;

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
function gable(halfW: number, rise: number, t: number, y0: number, z: number, hole?: { w: number; y: number; h: number }): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-halfW, 0); s.lineTo(halfW, 0); s.lineTo(0, rise); s.closePath();
  if (hole) {
    const p = new THREE.Path();
    p.moveTo(-hole.w / 2, hole.y); p.lineTo(-hole.w / 2, hole.y + hole.h); p.lineTo(hole.w / 2, hole.y + hole.h); p.lineTo(hole.w / 2, hole.y); p.closePath();
    s.holes.push(p);
  }
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

  // ── Walls: lap siding outside, knotty-pine lining inside, real openings through both ──
  const sink: Sink = (layer, m, g) => { const keep = parts.layer; parts.layer = layer as CabinLayer; add(parts, m, g); parts.layer = keep; };
  const colliders: Collider[] = [];
  const shell = (layer: CabinLayer, cut?: number) => {
    const out: Collider[] = [];
    const tO = 0.022, tI = C.wallT - tO;
    const leaves: Array<[number, number, 'timber_lap' | 'pine_panel']> = [[tO / 2, tO, 'timber_lap'], [tO + tI / 2, tI, 'pine_panel']];
    const winOp = (at: number): Opening => ({ at, w: C.win.w, sill: C.win.sill, h: C.win.h });
    for (const [inset, t, m] of leaves) {
      // front (door + window), back, two sides (two windows each)
      out.push(...wallRun(sink, layer, m, { ax: -hw, az: hd - inset, bx: hw, bz: hd - inset, y0, h: C.wallH, t, cut,
        openings: [{ at: C.door.x + hw, w: C.door.w, sill: 0, h: C.door.h }, winOp(0.22 + hw)] }));
      out.push(...wallRun(sink, layer, m, { ax: -hw, az: -hd + inset, bx: hw, bz: -hd + inset, y0, h: C.wallH, t, cut }));
      for (const sx of [-1, 1]) {
        const za = -hd + C.wallT, zb = hd - C.wallT;
        out.push(...wallRun(sink, layer, m, { ax: sx * (hw - inset), az: za, bx: sx * (hw - inset), bz: zb, y0, h: C.wallH, t, cut,
          openings: [winOp(-0.36 - za), winOp(0.3 - za)] }));
      }
    }
    // bedroom partitions (front right): along z at x = PX with a doorway, along x at z = PZ
    out.push(...wallRun(sink, layer, 'pine_panel', { ax: PX, az: PZ, bx: PX, bz: hd - C.wallT, y0, h: C.wallH, t: 0.02, cut, openings: [{ at: 0.025 + 0.065, w: 0.13, sill: 0, h: C.door.h }] }));
    out.push(...wallRun(sink, layer, 'pine_panel', { ax: PX - 0.01, az: PZ, bx: hw - C.wallT, bz: PZ, y0, h: C.wallH, t: 0.02, cut }));
    return out;
  };
  const PX = 0.06, PZ = 0.18;
  parts.layer = 'walls';
  colliders.push(...shell('walls'));
  add(parts, 'timber_lap', gable(hw, C.rise, 0.022, yE, hd - 0.011));
  add(parts, 'pine_panel', gable(hw - C.wallT, C.rise * (hw - C.wallT) / hw, 0.013, yE, hd - 0.0285));
  const gh = { w: C.win.w, y: 0.05, h: C.win.h };
  add(parts, 'timber_lap', gable(hw, C.rise, 0.022, yE, -hd + 0.011, gh));
  add(parts, 'pine_panel', gable(hw - C.wallT, C.rise * (hw - C.wallT) / hw, 0.013, yE, -hd + 0.0285, gh));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(parts, 'trim', box(0.028, C.wallH, 0.028, sx * (hw + 0.002), y0, sz * (hd + 0.002)));
  shell('cutwalls', CUT_H);

  // ── Openings: door, windows, porch posts painted ──
  parts.layer = 'openings';
  const dz = hd + 0.004;
  // plank door standing open into the room (hinged on its left jamb)
  const hinge = C.door.x - C.door.w / 2, inZ = hd - C.wallT;
  add(parts, 'door', box(C.door.w, C.door.h, 0.012, C.door.w / 2, 0, -0.006).rotateY(1.35).translate(hinge + 0.006, y0, inZ));
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

  // ── Ceiling: pine boards under the roof, tie beams over the front room ──
  parts.layer = 'roof';
  const cLen = Math.hypot(hw - C.wallT, C.rise * (hw - C.wallT) / hw);
  for (const s2 of [-1, 1]) {
    const g = new THREE.BoxGeometry(cLen, 0.008, D - 2 * C.wallT);
    g.translate(s2 * cLen / 2, 0, 0);
    g.rotateZ(s2 * -pitch);
    g.translate(0, yE + C.rise - 0.03, 0);
    add(parts, 'pine_panel', g);
  }
  for (const z of [0.05, 0.4]) add(parts, 'wood_dark', box(W - 2 * C.wallT, 0.03, 0.025, 0, yE - 0.03, z));

  // ── Interior: main room (stove, sitting corner, kitchen, table), entry, bedroom ──
  const I = (p: { x: number; z: number; rot?: number }, fn: Parameters<typeof piece>[3], solid = true) => {
    const c = piece(sink, 'interior', { ...p, y: y0 + 0.004 }, fn, solid);
    if (c) colliders.push(c);
  };
  const back = -hd + C.wallT, left = -hw + C.wallT, right = hw - C.wallT, front = hd - C.wallT;
  I({ x: cx, z: back + 0.075 }, a => Furniture.woodStove(a, 1.55, 0.32));
  I({ x: 0.43, z: back + 0.055 }, a => Furniture.woodbox(a));
  I({ x: 0.24, z: -0.36 }, a => Furniture.rug(a, 2.2, 1.5), false);
  I({ x: 0.11, z: -0.34, rot: Math.PI - 0.35 }, a => Furniture.armchair(a, 'quilt_red'));
  I({ x: 0.38, z: -0.33, rot: Math.PI + 0.35 }, a => Furniture.armchair(a, 'quilt_blue'));
  // kitchen along the left wall (front faces +x), shelves over it clear of the window
  I({ x: left + 0.05, z: -0.48, rot: Math.PI / 2 }, a => Furniture.counter(a, 2.5, 0.62));
  I({ x: left + 0.02, z: -0.6, rot: Math.PI / 2 }, a => Furniture.wallShelf(a, 1.1, 1.45, 2, 'jars'), false);
  I({ x: -0.3, z: back + 0.03 }, a => Furniture.shelfUnit(a, 1.2, 1.9, 'jars'));
  I({ x: left + 0.05, z: -0.17 }, a => Furniture.barrel(a));
  // dining table with four chairs and the lamp
  const tx = -0.25, tz = 0.02;
  I({ x: tx, z: tz }, a => { Furniture.table(a, 1.2, 0.85); Furniture.oilLamp(a, 0, 0.76, 0); });
  for (const sx of [-1, 1]) {
    I({ x: tx + sx * 0.045, z: tz - 0.1 }, a => Furniture.chair(a));
    I({ x: tx + sx * 0.045, z: tz + 0.1, rot: Math.PI }, a => Furniture.chair(a));
  }
  I({ x: left + 0.03, z: 0.1, rot: Math.PI / 2 }, a => Furniture.shelfUnit(a, 0.9, 1.8, 'books'));
  // entry: boot bench and coat pegs by the door
  I({ x: -0.38, z: front - 0.035, rot: Math.PI }, a => Furniture.bench(a, 0.9));
  I({ x: -0.38, z: front - 0.008, rot: Math.PI }, a => Furniture.coatPegs(a, 0.9), false);
  // bedroom: double bed against the partition, nightstand, dresser
  I({ x: 0.29, z: PZ + 0.01 + 1.0 * M + 0.04 * M }, a => Furniture.bed(a, true, 'quilt_red'));
  I({ x: right - 0.04, z: PZ + 0.05 }, a => Furniture.nightstand(a));
  I({ x: right - 0.045, z: 0.6, rot: -Math.PI / 2 }, a => Furniture.dresser(a, 1.0));
  I({ x: 0.22, z: 0.6 }, a => Furniture.rug(a, 1.2, 0.8), false);

  // ── Sleeping loft over the back half (kids), ladder up from the main room ──
  const LZ = -0.16;
  const L = (p: { x: number; z: number; rot?: number; y?: number }, fn: Parameters<typeof piece>[3], solid = false) => {
    const c = piece(sink, 'loft', { ...p, y: p.y ?? yE }, fn, solid);
    if (c) colliders.push(c);
  };
  parts.layer = 'loft';
  add(parts, 'deck', box(W - 2 * C.wallT, 0.02, LZ - back, 0, yE - 0.02, (LZ + back) / 2));
  add(parts, 'wood_dark', box(W - 2 * C.wallT, 0.035, 0.03, 0, yE - 0.055, LZ - 0.015));
  L({ x: -0.2975, z: LZ - 0.01 }, a => Furniture.rail(a, 0.335 / M));
  L({ x: 0.2275, z: LZ - 0.01 }, a => Furniture.rail(a, 0.475 / M));
  L({ x: -0.07, z: LZ + 0.094, y: y0 }, a => Furniture.ladder(a, C.wallH / M), true);
  L({ x: -0.2, z: -0.47 }, a => Furniture.mattress(a, 'quilt_blue'));
  L({ x: 0.2, z: -0.47 }, a => Furniture.mattress(a, 'quilt_red'));
  L({ x: 0, z: back + 0.06 }, a => { Furniture.trunk(a); Furniture.oilLamp(a, 0, 0.5, 0); });

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
  // walk / people collision (finished building): walls between doorways, partitions, furniture
  group.userData.colliders = colliders;
  return group;
}

/** The finished cabin (no stakes, scaffold or hidden framing). */
export function buildCabinGroup(def: KitPieceDef): THREE.Group {
  const g = buildCabinLayers(def);
  showCabinStage(g, 5, 0);
  for (const m of [...g.children]) if (!m.visible || m.userData.layer === 'cutwalls' || m.userData.layer === 'interior' || m.userData.layer === 'loft') { g.remove(m); (m as THREE.Mesh).geometry.dispose(); }
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
    // cutwalls are drawn whole; the view (cutaway or not) decides whether they show
    for (const l of ['foundation', 'deck', 'roof', 'walls', 'openings', 'chimney', 'interior', 'loft', 'cutwalls'] as CabinLayer[]) r[l] = 1;
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
  // moving in: the loft floor goes down with the finish work, the furniture comes last
  r.loft = stage === 4 ? Math.max(0, (k - 0.5) / 0.5) : 0;
  r.interior = stage === 4 ? Math.max(0, (k - 0.75) / 0.25) : 0;
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
