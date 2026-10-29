/**
 * Building shells — the shared construction kit every building uses:
 * build-order layers (stakes → foundation → deck → frame → rafters → roof →
 * walls → openings → chimney → interior), and a parametric gabled building
 * (foundation, framing, walls with real openings, gable roof over an
 * optional front porch, chimney or stovepipe, ceiling, scaffold) that each
 * building describes with a spec and furnishes with a callback.
 *
 * Local frame: origin at the footprint center on the pad (y = 0), ridge
 * along z, the main door / porch on the +z gable. One merged mesh per
 * layer × material; faces carry world-scaled UVs (1 UV = 1 unit) so kit
 * textures keep their real size. Scale: 1 unit ≈ 6 m; door ≈ 0.36 (2.15 m).
 */
import type { HardenId } from '../../sim/hardening';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { kitMaterial, type KitMaterialId } from './materials';
import { piece, wallRun, type Collider, type Opening, type Place, type Sink } from './interior';
import { rng } from './clutter';

/** Build-order layers: each is drawn (and grown) separately as construction proceeds. */
export type BuildLayer = 'stakes' | 'foundation' | 'deck' | 'frame' | 'rafters' | 'roof' | 'walls' | 'openings' | 'chimney' | 'scaffold'
  | 'interior' | 'decor' | 'loft' | 'cutwalls';
export const BUILD_LAYERS: readonly BuildLayer[] = ['stakes', 'foundation', 'deck', 'frame', 'rafters', 'roof', 'walls', 'openings', 'chimney', 'scaffold', 'interior', 'decor', 'loft', 'cutwalls'];

/** Layers hidden in the cutaway view (upper floor, roof, full-height walls). */
/** (`decor` is what hangs on the walls above the cut: pictures, lamps, curtains, signs.) */
export const CUTAWAY_HIDE: readonly BuildLayer[] = ['roof', 'walls', 'openings', 'loft', 'rafters', 'decor'];
/** Layers drawn see-through in the x-ray view. */
export const XRAY_LAYERS: readonly BuildLayer[] = ['roof', 'walls', 'openings', 'chimney', 'rafters'];
/** Waist-high cut for the cutaway view (above the floor). */
export const CUT_H = 0.2;

/** Standard openings (world units). */
export const DOOR = { w: 0.16, h: 0.36 } as const;
export const WIN = { w: 0.17, h: 0.2, sill: 0.17 } as const;

// ─────────────────────────────────────────────────────────────────────────
// Parts: geometry collected by layer × material, merged at the end
// ─────────────────────────────────────────────────────────────────────────

/** World-scaled UVs from position by dominant normal axis (walls: u along the face, v up). */
export function worldUV(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  // pictures, photos, posters: their own 0–1 UVs (one image per face)
  if (g.userData.keepUV) { if (!geo.getAttribute('normal')) geo.computeVertexNormals(); return geo; }
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

/** Services fitted to a building. */
export interface BuildOpts {
  plumbed?: boolean; wired?: boolean; septic?: boolean;
  /** Underground pieces: doorways by local side (position along that wall) and the ground's height above the floor. */
  doors?: Partial<Record<'front' | 'back' | 'left' | 'right', number>>;
  depth?: number;
  /** Doorways that take a blast door, barred from the room side (where an escape tunnel leaves). */
  blast?: Array<'front' | 'back' | 'left' | 'right'>;
  /** Bunker hardening fitted (sim/hardening): what shows inside the room. */
  harden?: Partial<Record<HardenId, 1 | 2 | 3>>;
  /** Bunker rooms: the bunker's plant room is built (ducts run, the air handler's lamp is green). */
  air?: boolean;
  /** Bunker rooms: the power is on (the control room's lamps). */
  power?: boolean;
  /** Bunkroom: what the family owns for the long evenings (sim stock: games, an instrument, paperbacks); the room shows them. */
  morale?: { games: boolean; music: boolean; books: boolean };
  /** The evenings' goods on and by the family's table (sim/evenings.ts `houseGoods`): 1 in good shape, 2 worn thin. Only the main home gets them. */
  goods?: Partial<Record<'games' | 'guitar' | 'player' | 'books' | 'toys' | 'kidbooks', 1 | 2>>;
}

/** Collects geometry per layer × material. */
/**
 * A food slot as the building holds it: `o` the middle of the board's top
 * (or the pallet's), `u` / `f` unit vectors along it and toward its front,
 * its length, depth and clear height (world units), floor or shelf.
 */
export interface FoodSlot { o: [number, number, number]; u: [number, number, number]; f: [number, number, number]; len: number; dep: number; clear: number; floor: boolean; freezer: boolean }

/** Decode the marker geometry interior.ts `foodSlot` makes (middle, end, front, top, and a point just below the middle whose drop says floor or shelf), after it was moved into place. */
function readFoodSlot(g: THREE.BufferGeometry, ox: number, oz: number): FoodSlot {
  const p = g.getAttribute('position');
  const v = (i: number) => new THREE.Vector3(p.getX(i) + ox, p.getY(i), p.getZ(i) + oz);
  const o = v(0), a = v(1).sub(o), f = v(2).sub(o), h = v(3).y - o.y;
  const len = a.length() * 2, dep = f.length() * 2;
  a.normalize(); f.normalize();
  return { o: [o.x, o.y, o.z], u: [a.x, a.y, a.z], f: [f.x, f.y, f.z], len, dep, clear: h, floor: o.y - v(4).y < 0.0015, freezer: o.y - v(4).y > 0.0025 };
}

/**
 * A bed the sick are put in, as the building holds it (building frame, world units): `o` the middle of the mattress top,
 * `foot` the unit vector from the head toward the foot, `side` a unit vector across the bed.
 */
export interface SickSlot { o: [number, number, number]; foot: [number, number, number]; side: [number, number, number] }
function readSickSlot(g: THREE.BufferGeometry, ox: number, oz: number): SickSlot {
  const p = g.getAttribute('position');
  const v = (i: number) => new THREE.Vector3(p.getX(i) + ox, p.getY(i), p.getZ(i) + oz);
  const o = v(0), f = v(1).sub(o).normalize(), s = v(2).sub(o).normalize();
  return { o: [o.x, o.y, o.z], foot: [f.x, f.y, f.z], side: [s.x, s.y, s.z] };
}

export class Parts {
  layer: BuildLayer = 'stakes';
  /** Shift applied to everything added (and to colliders): a shell set off-center in its footprint. */
  ox = 0; oz = 0;
  /** Seeded random for this building (clutter varies house to house). */
  readonly rnd: () => number;
  /** Services the building has (interiors change: faucets, lights, fridge, flush toilet). */
  readonly opts: BuildOpts;
  constructor(seed = 1, opts: BuildOpts = {}) { this.rnd = rng(seed); this.opts = opts; }
  readonly map = new Map<string, THREE.BufferGeometry[]>();
  readonly colliders: Collider[] = [];
  /** Shelf boards and pallets where stored food goes (game/props/FoodShelfRenderer), in the building's frame. */
  readonly foodSlots: FoodSlot[] = [];
  /** Beds the sick are put in (game/people/sickbayPlan), in the building's frame. */
  readonly sickSlots: SickSlot[] = [];
  add(m: KitMaterialId, g: THREE.BufferGeometry, layer: BuildLayer = this.layer): void {
    if (m === 'food_slot') { this.foodSlots.push(readFoodSlot(g, this.ox, this.oz)); g.dispose(); return; }
    if (m === 'sick_slot') { this.sickSlots.push(readSickSlot(g, this.ox, this.oz)); g.dispose(); return; }
    const k = `${layer}|${m}`;
    let l = this.map.get(k);
    if (!l) this.map.set(k, l = []);
    if (this.ox || this.oz) g.translate(this.ox, 0, this.oz);
    l.push(worldUV(g));
  }
  /** Add colliders given in the current (offset) frame. */
  collide(...cs: Collider[]): void {
    for (const c of cs) this.colliders.push({ x0: c.x0 + this.ox, z0: c.z0 + this.oz, x1: c.x1 + this.ox, z1: c.z1 + this.oz });
  }
  /** A sink for the interior kit. */
  readonly sink: Sink = (layer, m, g) => this.add(m, g, layer as BuildLayer);

  /** One mesh per layer × material, tagged userData.layer; colliders on the group. */
  finish(): THREE.Group {
    const group = new THREE.Group();
    for (const [k, list] of this.map) {
      const [layer, m] = k.split('|') as [BuildLayer, KitMaterialId];
      const g = mergeGeometries(list);
      list.forEach(x => x.dispose());
      if (!g) continue;
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, kitMaterial(m));
      mesh.castShadow = m !== 'glass' && m !== 'polycarb' && m !== 'glow' && m !== 'string' && m !== 'wire_mesh' && m !== 'oil_stain';
      mesh.receiveShadow = true;
      mesh.name = `bldg_${layer}_${m}`;
      mesh.userData = { layer, vertexCount: g.getAttribute('position').count };
      group.add(mesh);
    }
    group.userData.colliders = this.colliders;
    group.userData.foodSlots = this.foodSlots;
    group.userData.sickSlots = this.sickSlots;
    return group;
  }
}

export const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

/** A gable-end triangle, thickness t, in the x/y plane at z, with an optional window hole. */
export function gable(halfW: number, rise: number, t: number, y0: number, z: number, hole?: ReadonlyArray<[number, number]>): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-halfW, 0); s.lineTo(halfW, 0); s.lineTo(0, rise); s.closePath();
  if (hole) {
    // holes wind the other way round
    const p = new THREE.Path();
    const rev = [...hole].reverse();
    p.moveTo(rev[0][0], rev[0][1]);
    for (const [x, y] of rev.slice(1)) p.lineTo(x, y);
    p.closePath();
    s.holes.push(p);
  }
  return new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false }).translate(0, y0, z - t / 2);
}

/** A window on a wall face: frame, glass, muntins, sill. (cx, cz) on the face, `nx/nz` the outward normal. */
export function windowAt(parts: Parts, cx: number, cz: number, y: number, nx: number, nz: number, wallT: number, w: number = WIN.w, h: number = WIN.h, trim: KitMaterialId = 'trim'): void {
  const t = 0.012, out = wallT / 2 + 0.004;
  const alongX = nx === 0;
  const bx = (a: number, hh: number, depth: number, oa: number, oy: number, oo: number) =>
    alongX ? box(a, hh, depth, cx + oa, oy, cz + nz * oo) : box(depth, hh, a, cx + nx * oo, oy, cz + oa);
  // the face point is the wall's outer surface; pull the frame back to the wall center line
  const c = -wallT / 2;
  parts.add('glass', bx(w, h, 0.006, 0, y, c + out - 0.006));
  // lamplight seen from outside: a one-sided glow just outside the glass (from inside you look out into the night)
  const glow = new THREE.PlaneGeometry(w, h).rotateY(alongX ? (nz > 0 ? 0 : Math.PI) : (nx > 0 ? Math.PI / 2 : -Math.PI / 2));
  const o = c + out - 0.002;
  parts.add('glow', glow.translate(cx + nx * o, y + h / 2, cz + nz * o));
  parts.add(trim, bx(w + 2 * t, t, 0.016, 0, y + h, c + out));
  parts.add(trim, bx(w + 2 * t, t, 0.016, 0, y - t, c + out));
  parts.add(trim, bx(t, h, 0.016, -w / 2 - t / 2, y, c + out));
  parts.add(trim, bx(t, h, 0.016, w / 2 + t / 2, y, c + out));
  if (w < 0.3) {
    parts.add(trim, bx(0.006, h, 0.01, 0, y, c + out));
    parts.add(trim, bx(w, 0.006, 0.01, 0, y + h / 2, c + out));
  } else {
    for (let k = 1; k < Math.round(w / 0.1); k++) parts.add(trim, bx(0.008, h, 0.012, -w / 2 + k * w / Math.round(w / 0.1), y, c + out));
  }
  parts.add(trim, bx(w + 0.05, 0.012, 0.035, 0, y - t - 0.012, c + out + 0.01));
}

/** Clearance kept between any opening and a roof rake, corner or another opening (world units ≈ 30 cm). */
export const OPENING_MARGIN = 0.05;

/**
 * The outline of a gable window (gable-local x, y above the eave) that
 * always stays inside the gable triangle by OPENING_MARGIN: a rake window
 * follows both roof slopes to a point under the ridge; a plain one is cut
 * down in height until its top corners clear the rakes.
 */
export function gableWindowPoly(hw: number, rise: number, T: number, gw: { w: number; h: number; y: number; rake?: boolean }): Array<[number, number]> {
  const m = OPENING_MARGIN, inner = hw - T;
  /** Height of the inside of the roof line above the eave at |x|, less the margin. */
  const roofY = (x: number) => rise * (1 - (Math.abs(x) + m) / inner) - m;
  const w = Math.min(gw.w, 2 * (inner - m) * 0.95);
  const y0 = gw.y;
  if (gw.rake) return [[-w / 2, y0], [w / 2, y0], [w / 2, Math.max(y0 + 0.02, roofY(w / 2))], [0, roofY(0)], [-w / 2, Math.max(y0 + 0.02, roofY(w / 2))]];
  const top = Math.min(y0 + gw.h, roofY(w / 2));
  return [[-w / 2, y0], [w / 2, y0], [w / 2, top], [-w / 2, top]];
}

/** Glass, frame and muntins for a gable window outline, on the gable at z (outward normal nz). */
function gablePane(parts: Parts, poly: ReadonlyArray<[number, number]>, z: number, nz: number, yE: number, T: number, trim: KitMaterialId): void {
  const sh = new THREE.Shape();
  sh.moveTo(poly[0][0], poly[0][1]);
  for (const [x, y] of poly.slice(1)) sh.lineTo(x, y);
  sh.closePath();
  const out = nz * 0.004;
  const glass = new THREE.ShapeGeometry(sh).translate(0, yE, z + out - nz * 0.002);
  if (nz < 0) glass.rotateY(Math.PI).translate(0, 0, 2 * z);
  parts.add('glass', glass);
  parts.add('glow', glass.clone().translate(0, 0, nz * 0.003));
  // frame along every edge
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
    const l = Math.hypot(bx - ax, by - ay);
    const g = new THREE.BoxGeometry(l + 0.012, 0.012, 0.016).rotateZ(Math.atan2(by - ay, bx - ax)).translate((ax + bx) / 2, yE + (ay + by) / 2, z + out);
    parts.add(trim, g);
  }
  // muntins: verticals every ≈ 60 cm up to the outline, one transom
  const xs = poly.map(p => p[0]), x0 = Math.min(...xs), x1 = Math.max(...xs), ys = poly.map(p => p[1]), yB = Math.min(...ys);
  const topAt = (x: number) => { let best = yB; for (let i = 0; i < poly.length; i++) { const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length]; if ((x - ax) * (x - bx) <= 0 && ax !== bx) best = Math.max(best, ay + (by - ay) * (x - ax) / (bx - ax)); } return best; };
  const n = Math.max(1, Math.round((x1 - x0) / 0.1));
  for (let k = 1; k < n; k++) { const x = x0 + (x1 - x0) * k / n, t = topAt(x) - yB; if (t > 0.02) parts.add(trim, box(0.008, t, 0.012, x, yE + yB, z + out)); }
  const midY = yB + Math.min(0.2, (topAt(0) - yB) * 0.45);
  parts.add(trim, box(x1 - x0, 0.008, 0.012, (x0 + x1) / 2, yE + midY, z + out));
  void T;
}

/** Geometry rules a gabled spec must keep (docs: no window corners through the roof). Returns the problems, empty if sound. */
export function validateSpec(s: GabledSpec): string[] {
  const out: string[] = [];
  const hw = s.W / 2, hd = s.D / 2, m = OPENING_MARGIN * 0.6;
  const walls: Array<[string, WallOpening[] | undefined, number]> = [['front', s.front, hw], ['back', s.back, hw], ['left', s.left, hd], ['right', s.right, hd]];
  for (const [name, list, half] of walls) {
    const ops = (list ?? []).map(o => {
      const w = o.w ?? (o.kind === 'window' ? WIN.w : o.kind === 'bay' ? 0.5 : DOOR.w);
      const h = o.h ?? (o.kind === 'window' ? WIN.h : o.kind === 'bay' ? 0.38 : DOOR.h);
      const sill = o.kind === 'window' ? o.sill ?? WIN.sill : 0;
      return { o, a0: o.at - w / 2, a1: o.at + w / 2, top: sill + h };
    });
    for (const p of ops) {
      if (p.a0 < -half + s.wallT + m || p.a1 > half - s.wallT - m) out.push(`${name} ${p.o.kind} at ${p.o.at} runs into a corner`);
      if (p.top > s.wallH - 0.02) out.push(`${name} ${p.o.kind} at ${p.o.at} is taller than the wall (${p.top.toFixed(2)} > ${s.wallH})`);
    }
    for (let i = 0; i < ops.length; i++) for (let j = i + 1; j < ops.length; j++) if (ops[i].a0 < ops[j].a1 + 0.02 && ops[j].a0 < ops[i].a1 + 0.02) out.push(`${name} openings at ${ops[i].o.at} and ${ops[j].o.at} overlap`);
  }
  if (s.gableWindow) {
    const poly = gableWindowPoly(hw, s.rise, s.wallT, s.gableWindow), inner = hw - s.wallT;
    for (const [x, y] of poly) if (y > s.rise * (1 - Math.abs(x) / inner) - OPENING_MARGIN * 0.5 + 1e-6) out.push(`gable window corner (${x.toFixed(2)}, ${y.toFixed(2)}) breaks the roof line`);
    const ys = poly.map(p => p[1]);
    if (Math.max(...ys) - Math.min(...ys) < 0.05) out.push('gable window too small to fit under the roof');
  }
  return out;
}

/** Problems found while building shells (tests fail if any). */
export const SPEC_PROBLEMS: string[] = [];

// ─────────────────────────────────────────────────────────────────────────
// Construction stages → layer fractions
// ─────────────────────────────────────────────────────────────────────────

/**
 * How much of each layer shows at a construction stage (0 site … 4 finish,
 * 5 done) and fraction through it. Pure (tested).
 */
export function layerFractions(stage: number, f: number, supplied: boolean): Record<BuildLayer, number> {
  const k = Math.max(0, Math.min(1, supplied ? f : 0));
  const r = {} as Record<BuildLayer, number>;
  for (const l of BUILD_LAYERS) r[l] = 0;
  if (stage >= 5) {
    // cutwalls are drawn whole; the view (cutaway or not) decides whether they show
    for (const l of ['foundation', 'deck', 'roof', 'walls', 'openings', 'chimney', 'interior', 'decor', 'loft', 'cutwalls'] as BuildLayer[]) r[l] = 1;
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
  // moving in: the loft floor goes down with the finish work, the furniture comes last
  r.loft = stage === 4 ? Math.max(0, (k - 0.5) / 0.5) : 0;
  r.interior = stage === 4 ? Math.max(0, (k - 0.75) / 0.25) : 0;
  r.decor = r.interior;
  return r;
}

/** Show a layered building group at a stage: each layer drawn up to its fraction (pieces in build order). */
export function showStage(group: THREE.Group, stage: number, f: number, supplied = true): void {
  const fr = layerFractions(stage, f, supplied);
  // pieces whose frame is the finished thing (posts, stands, racking) keep it; stageAs times a layer like another
  const keep = (group.userData.keep ?? []) as BuildLayer[];
  const stageAs = (group.userData.stageAs ?? {}) as Partial<Record<BuildLayer, BuildLayer>>;
  for (const o of group.children) {
    const m = o as THREE.Mesh;
    if (!m.isMesh) continue;            // lights etc. are managed by the world
    const layer = m.userData.layer as BuildLayer;
    const k = stage >= 5 ? (keep.includes(layer) ? 1 : fr[layer]) : fr[stageAs[layer] ?? layer];
    m.visible = k > 0.001;
    const n = m.userData.vertexCount as number;
    // whole triangles only, so partial layers end on a finished piece edge
    m.geometry.setDrawRange(0, k >= 0.999 ? Infinity : Math.floor((n * k) / 3) * 3);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Gabled building
// ─────────────────────────────────────────────────────────────────────────

/**
 * An opening in an outside wall. `at` is the local coordinate along the
 * wall (x on the front / back walls, z on the sides).
 *  door    plank door standing open inward, with casing
 *  window  four-light window (w / h / sill optional)
 *  bay     a wide vehicle opening with the roll-up door rolled up at the head
 *  arch    a plain open doorway (no door; runs, sheds)
 */
export interface WallOpening { kind: 'door' | 'window' | 'bay' | 'arch'; at: number; w?: number; h?: number; sill?: number }

export interface GabledSpec {
  /** Footprint (world units): width across the ridge, depth along it. */
  W: number; D: number;
  /** Floor above the pad, wall height (floor to eave), wall thickness. */
  floor: number; wallH: number; wallT: number;
  /** Roof rise over half the width, eave overhang, gable overhang. */
  rise: number; eave: number; gableOver: number;
  /** Front porch depth (0 = none) under the roof run-out. */
  porch: number;
  foundation: 'fieldstone' | 'concrete' | 'piers';
  floorMat: KitMaterialId;
  /** Outer cladding, inner lining (null = single skin, studs show inside). */
  outer: KitMaterialId; inner: KitMaterialId | null;
  roof: KitMaterialId; trim: KitMaterialId;
  front?: WallOpening[]; back?: WallOpening[]; left?: WallOpening[]; right?: WallOpening[];
  /** Window high in a gable (loft window); `tall` = a great-room glass wall up into the front gable. */
  gableWindow?: { back?: boolean; front?: boolean; w: number; h: number; y: number; /** Glass that follows the roof pitch up into the peak (A-frame glass gable). */ rake?: boolean };
  /** Fieldstone chimney on the back gable at x, or a stovepipe through the roof at (x, z). */
  chimney?: { kind: 'stone'; x: number } | { kind: 'pipe'; x: number; z: number };
  /** Pine (or other) ceiling boards under the roof. */
  ceiling?: KitMaterialId;
  /** Tie beams across at these z (above the main floor). */
  tieBeams?: number[];
  /** Corner boards (lap siding) or crossed log ends (log walls). */
  corners?: 'boards' | 'logs' | 'none';
  /** Curtains inside every window (homes), in this fabric. */
  curtains?: KitMaterialId;
}

/** What a furnishing callback gets. */
export interface FurnishCtx {
  parts: Parts;
  spec: GabledSpec;
  hw: number; hd: number;
  /** Floor and eave heights (local). */
  y0: number; yE: number;
  /** Inner wall faces. */
  left: number; right: number; front: number; back: number;
  /** Place a ground-floor piece (interior layer). */
  I(p: Place, fn: Parameters<typeof piece>[3], solid?: boolean): void;
  /** Place an upper-floor / loft piece (hidden in cutaway). `p.y` defaults to the eave height. */
  L(p: Place, fn: Parameters<typeof piece>[3], solid?: boolean): void;
  /** Seeded random (clutter choices). */
  rnd: () => number;
  /** Maybe place a clutter piece (probability p), never solid. */
  C(p: Place, fn: Parameters<typeof piece>[3], prob?: number): void;
  /** An interior partition a→b (full height in 'walls', cut copy in 'cutwalls'), with optional doorways. */
  partition(ax: number, az: number, bx: number, bz: number, openings?: Opening[], mat?: KitMaterialId, h?: number): void;
}

export interface GabledResult {
  group: THREE.Group;
  /** Smoke source (local), or null. */
  chimneyTop: THREE.Vector3 | null;
}

/**
 * Build a gabled building from a spec, then furnish it. The group carries
 * userData.colliders (walls between doorways, partitions, furniture) and
 * userData.chimneyTop.
 */
export function buildGabled(s: GabledSpec, furnish?: (c: FurnishCtx) => void, parts = new Parts(), extras?: (p: Parts) => void): GabledResult {
  for (const p of validateSpec(s)) if (!SPEC_PROBLEMS.includes(p)) SPEC_PROBLEMS.push(p);
  const { W, D } = s;
  const hw = W / 2, hd = D / 2;
  const y0 = s.floor, yE = s.floor + s.wallH;
  const pitch = Math.atan2(s.rise, hw);
  const z0 = -hd - s.gableOver, z1 = hd + (s.porch > 0 ? s.porch + 0.03 : s.gableOver);
  const pz1 = hd + s.porch;
  const T = s.wallT;

  // ── Stakes and string lines (site layout) ──
  parts.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.add('trim', box(0.012, 0.09, 0.012, sx * (hw + 0.04), -0.02, sz * (hd + 0.04)));
  for (const sz of [-1, 1]) parts.add('string', box(W + 0.08, 0.003, 0.003, 0, 0.055, sz * (hd + 0.04)));
  for (const sx of [-1, 1]) parts.add('string', box(0.003, 0.003, D + 0.08, sx * (hw + 0.04), 0.055, 0));

  // ── Foundation ──
  parts.layer = 'foundation';
  if (s.foundation === 'fieldstone') {
    const courses = 4, ch = (y0 + 0.03) / courses;
    for (let i = 0; i < courses; i++) parts.add('fieldstone', box(W + 0.03, ch, D + 0.03, 0, -0.03 + i * ch, 0));
    if (s.porch > 0) parts.add('fieldstone', box(W, y0 - 0.025 + 0.03, 0.04, 0, -0.03, pz1 - 0.02));
  } else if (s.foundation === 'concrete') {
    parts.add('concrete', box(W + 0.02, y0 + 0.03, D + 0.02, 0, -0.03, 0));
    if (s.porch > 0) parts.add('concrete', box(W + 0.02, y0 + 0.02, s.porch, 0, -0.03, hd + s.porch / 2));
  } else {
    // piers (posts on footing blocks)
    for (let x = -hw + 0.03; x <= hw - 0.03 + 1e-6; x += (W - 0.06) / Math.max(1, Math.round(W / 0.3))) {
      for (let z = -hd + 0.03; z <= hd - 0.03 + 1e-6; z += (D - 0.06) / Math.max(1, Math.round(D / 0.3))) {
        parts.add('concrete', box(0.05, 0.03, 0.05, x, -0.02, z));
        parts.add('frame', box(0.025, y0 - 0.01, 0.025, x, 0.01, z));
      }
    }
  }

  // ── Floor deck + porch deck + steps ──
  parts.layer = 'deck';
  if (s.foundation !== 'concrete') parts.add(s.floorMat, box(W - 0.01, 0.012, D - 0.01, 0, y0 - 0.004, 0));
  else parts.add(s.floorMat, box(W - 0.01, 0.004, D - 0.01, 0, y0 - 0.002, 0));
  const frontDoor = (s.front ?? []).find(o => o.kind === 'door' || o.kind === 'arch');
  if (s.porch > 0) {
    parts.add('deck', box(W + 0.02, 0.025, s.porch, 0, y0 - 0.025, (hd + pz1) / 2));
  }
  if (frontDoor && y0 > 0.04) {
    const sz = hd + Math.max(0, s.porch);
    parts.add('deck', box(0.32, 0.03, 0.06, frontDoor.at, y0 * 0.5 - 0.03, sz + 0.03));
    parts.add('deck', box(0.32, 0.03, 0.06, frontDoor.at, -0.03, sz + 0.09));
  }

  // ── Wall framing: plates, studs ~40 cm apart, gable studs, porch posts ──
  parts.layer = 'frame';
  const sw = 0.012, sd = 0.022, sp = 0.068;
  for (const sz of [-1, 1]) {
    const z = sz * (hd - sd / 2);
    parts.add('frame', box(W, 0.01, sd, 0, y0, z));
    for (let x = -hw + sw / 2; x <= hw - sw / 2 + 1e-6; x += sp) parts.add('frame', box(sw, s.wallH - 0.02, sd, x, y0 + 0.01, z));
    parts.add('frame', box(W, 0.01, sd, 0, yE - 0.01, z));
    for (let x = -hw + sp; x < hw - 0.02; x += sp) {
      const hh = s.rise * (1 - Math.abs(x) / hw);
      if (hh > 0.02) parts.add('frame', box(sw, hh, sd, x, yE, z));
    }
  }
  for (const sx of [-1, 1]) {
    const x = sx * (hw - sd / 2);
    parts.add('frame', box(sd, 0.01, D, x, y0, 0));
    for (let z = -hd + sp; z < hd - 0.02; z += sp) parts.add('frame', box(sd, s.wallH - 0.02, sw, x, y0 + 0.01, z));
    parts.add('frame', box(sd, 0.01, D, x, yE - 0.01, 0));
  }
  if (s.porch > 0) {
    for (const sx of [-1, 1]) parts.add('frame', box(0.03, yE - 0.01 - y0, 0.03, sx * (hw - 0.03), y0, pz1 - 0.03));
    parts.add('frame', box(W, 0.035, 0.03, 0, yE - 0.03, pz1 - 0.03));
  }

  // ── Rafters + ridge beam ──
  parts.layer = 'rafters';
  const rLen = Math.hypot(hw + s.eave, s.rise + s.eave * s.rise / hw);
  parts.add('frame', box(0.02, 0.03, z1 - z0, 0, yE + s.rise - 0.02, (z0 + z1) / 2));
  for (let z = z0 + 0.02; z <= z1 - 0.02; z += 0.11) {
    for (const s2 of [-1, 1]) {
      const g = new THREE.BoxGeometry(rLen, 0.018, 0.012);
      g.translate(s2 * rLen / 2, -0.009, 0);
      g.rotateZ(s2 * -pitch);
      g.translate(0, yE + s.rise, z);
      parts.add('frame', g);
    }
  }

  // ── Roof: two slabs in strips (sheet by sheet), ridge cap; ceiling under it ──
  parts.layer = 'roof';
  const slopeLen = Math.hypot(hw + s.eave, (s.eave * s.rise) / hw + s.rise);
  const roofT = 0.022;
  const strips = Math.max(3, Math.round((z1 - z0) / 0.3)), sl = (z1 - z0) / strips;
  for (let i = 0; i < strips; i++) {
    for (const s2 of [-1, 1]) {
      const g = new THREE.BoxGeometry(slopeLen, roofT, sl + 0.001);
      g.translate(s2 * slopeLen / 2, roofT / 2, 0);
      g.rotateZ(s2 * -pitch);
      g.translate(0, yE + s.rise + 0.012, z0 + sl * (i + 0.5));
      parts.add(s.roof, g);
    }
  }
  parts.add('chimney_cap', box(0.035, 0.02, z1 - z0, 0, yE + s.rise + 0.012, (z0 + z1) / 2));
  if (s.ceiling) {
    const cLen = Math.hypot(hw - T, s.rise * (hw - T) / hw);
    for (const s2 of [-1, 1]) {
      const g = new THREE.BoxGeometry(cLen, 0.008, D - 2 * T);
      g.translate(s2 * cLen / 2, 0, 0);
      g.rotateZ(s2 * -pitch);
      g.translate(0, yE + s.rise - 0.03, 0);
      parts.add(s.ceiling, g);
    }
  }
  for (const z of s.tieBeams ?? []) parts.add('wood_dark', box(W - 2 * T, 0.03, 0.025, 0, yE - 0.03, z));

  // ── Walls: outer cladding, inner lining, openings through both ──
  const asOpening = (o: WallOpening): Opening => {
    if (o.kind === 'window') return { at: o.at, w: o.w ?? WIN.w, sill: o.sill ?? WIN.sill, h: o.h ?? WIN.h };
    if (o.kind === 'bay') return { at: o.at, w: o.w ?? 0.5, sill: 0, h: o.h ?? 0.38 };
    return { at: o.at, w: o.w ?? DOOR.w, sill: 0, h: o.h ?? DOOR.h };
  };
  const shell = (layer: BuildLayer, cut?: number): Collider[] => {
    const out: Collider[] = [];
    const tO = s.inner ? Math.min(0.022, T * 0.63) : T, tI = T - tO;
    const leaves: Array<[number, number, KitMaterialId]> = [[tO / 2, tO, s.outer]];
    if (s.inner) leaves.push([tO + tI / 2, tI, s.inner]);
    const za = -hd + T, zb = hd - T;
    for (const [inset, t, m] of leaves) {
      out.push(...wallRun(parts.sink, layer, m, { ax: -hw, az: hd - inset, bx: hw, bz: hd - inset, y0, h: s.wallH, t, cut,
        openings: (s.front ?? []).map(o => { const p = asOpening(o); return { ...p, at: p.at + hw }; }) }));
      out.push(...wallRun(parts.sink, layer, m, { ax: -hw, az: -hd + inset, bx: hw, bz: -hd + inset, y0, h: s.wallH, t, cut,
        openings: (s.back ?? []).map(o => { const p = asOpening(o); return { ...p, at: p.at + hw }; }) }));
      for (const [sx, list] of [[-1, s.left], [1, s.right]] as const) {
        out.push(...wallRun(parts.sink, layer, m, { ax: sx * (hw - inset), az: za, bx: sx * (hw - inset), bz: zb, y0, h: s.wallH, t, cut,
          openings: (list ?? []).map(o => { const p = asOpening(o); return { ...p, at: p.at - za }; }) }));
      }
    }
    return out;
  };
  parts.layer = 'walls';
  parts.collide(...shell('walls'));
  shell('cutwalls', CUT_H);
  const gw = s.gableWindow;
  const gpoly = gw ? gableWindowPoly(hw, s.rise, T, gw) : null;
  const hole = (on?: boolean) => (gpoly && on ? gpoly : undefined);
  const tO = s.inner ? Math.min(0.022, T * 0.63) : T;
  for (const sz of [1, -1]) {
    const h = hole(sz > 0 ? gw?.front : gw?.back);
    parts.add(s.outer, gable(hw, s.rise, tO, yE, sz * (hd - tO / 2), h));
    if (s.inner) parts.add(s.inner, gable(hw - T, s.rise * (hw - T) / hw, T - tO, yE, sz * (hd - tO - (T - tO) / 2), h));
  }
  if (s.corners === 'boards' || s.corners === undefined) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.add(s.trim, box(0.028, s.wallH, 0.028, sx * (hw + 0.002), y0, sz * (hd + 0.002)));
  } else if (s.corners === 'logs') {
    // crossed log ends sticking out at each corner, alternating courses
    const n = Math.round(s.wallH / 0.045);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let i = 0; i < n; i++) {
      const y = y0 + (i + 0.5) * s.wallH / n;
      const along = i % 2 === 0;
      const g = new THREE.CylinderGeometry(0.022, 0.022, 0.07, 8);
      if (along) g.rotateZ(Math.PI / 2).translate(sx * (hw + 0.012), y, sz * (hd - 0.01));
      else g.rotateX(Math.PI / 2).translate(sx * (hw - 0.01), y, sz * (hd + 0.012));
      parts.add('log_end', g);
    }
  }

  // ── Openings: doors, windows, bays, porch posts painted ──
  parts.layer = 'openings';
  const wallOps: Array<[WallOpening[] | undefined, 'front' | 'back' | 'left' | 'right']> = [[s.front, 'front'], [s.back, 'back'], [s.left, 'left'], [s.right, 'right']];
  for (const [list, side] of wallOps) for (const o of list ?? []) {
    const nx = side === 'left' ? -1 : side === 'right' ? 1 : 0, nz = side === 'front' ? 1 : side === 'back' ? -1 : 0;
    const fx = nx !== 0 ? nx * hw : o.at, fz = nz !== 0 ? nz * hd : o.at;
    if (o.kind === 'window') {
      windowAt(parts, fx, fz, y0 + (o.sill ?? WIN.sill), nx, nz, T, o.w ?? WIN.w, o.h ?? WIN.h, s.trim);
      if (s.curtains && (o.h ?? WIN.h) > 0.09) {
        // gathered panels each side and a rod, on the inside face (they come with the furniture)
        const w = o.w ?? WIN.w, h = o.h ?? WIN.h, sill = o.sill ?? WIN.sill;
        const rot = nx !== 0 ? (nx > 0 ? Math.PI / 2 : -Math.PI / 2) : (nz > 0 ? 0 : Math.PI);
        const inner = (g: THREE.BufferGeometry) => g.rotateY(rot).translate(fx, 0, fz);
        const pw = Math.min(0.06, w * 0.3);
        for (const e of [-1, 1]) parts.add(s.curtains, inner(box(pw, h + 0.045, 0.012, e * (w / 2 + pw / 2 - 0.012), y0 + sill - 0.03, -T - 0.012)), 'decor');
        parts.add('iron', inner(new THREE.CylinderGeometry(0.003, 0.003, w + 2 * pw + 0.02, 6).rotateZ(Math.PI / 2).translate(0, y0 + sill + h + 0.02, -T - 0.016)), 'decor');
      }
      continue;
    }
    const p = asOpening(o);
    const rot = nx !== 0 ? (nx > 0 ? Math.PI / 2 : -Math.PI / 2) : (nz > 0 ? 0 : Math.PI);
    // casing in the wall's own frame (a = along the wall, outward = +z), then turned onto the wall
    const onWall = (g: THREE.BufferGeometry) => g.rotateY(rot).translate(fx, 0, fz);
    const ow = 0.004;
    parts.add(s.trim, onWall(box(p.w + 0.04, 0.02, 0.018, 0, y0 + p.h, ow)));
    for (const e of [-1, 1]) parts.add(s.trim, onWall(box(0.02, p.h, 0.018, e * (p.w / 2 + 0.01), y0, ow)));
    if (o.kind === 'door') {
      // plank door standing open into the room, hinged on its left jamb
      const g = box(p.w, p.h, 0.012, p.w / 2, 0, -0.006).rotateY(1.35).translate(-p.w / 2 + 0.006, y0, -T);
      parts.add('door', onWall(g));
    } else if (o.kind === 'bay') {
      // roll-up door rolled at the head, a track down each side
      parts.add('metal_siding', onWall(new THREE.CylinderGeometry(0.03, 0.03, p.w, 10).rotateZ(Math.PI / 2).translate(0, y0 + p.h - 0.03, -T - 0.03)));
      for (const e of [-1, 1]) parts.add('iron', onWall(box(0.012, p.h, 0.02, e * (p.w / 2 - 0.006), y0, -T - 0.01)));
    }
  }
  if (gpoly && gw?.back) gablePane(parts, gpoly, -hd, -1, yE, T, s.trim);
  if (gpoly && gw?.front) gablePane(parts, gpoly, hd, 1, yE, T, s.trim);
  if (s.porch > 0) {
    for (const sx of [-1, 1]) parts.add(s.trim, box(0.032, yE - 0.01 - y0, 0.032, sx * (hw - 0.03), y0, pz1 - 0.03));
    parts.add(s.trim, box(W + 0.004, 0.037, 0.032, 0, yE - 0.031, pz1 - 0.03));
  }

  // ── Chimney (fieldstone, built in courses) or stovepipe through the roof ──
  parts.layer = 'chimney';
  let chimneyTop: THREE.Vector3 | null = null;
  if (s.chimney?.kind === 'stone') {
    const cx = s.chimney.x, chW = 0.14;
    const chTop = yE + s.rise + 0.16;
    const cc = 8;
    for (let i = 0; i < cc; i++) parts.add('fieldstone', box(chW, (chTop + 0.03) / cc, chW, cx, -0.03 + i * (chTop + 0.03) / cc, -hd - chW / 2 + 0.01));
    parts.add('chimney_cap', box(chW + 0.02, 0.02, chW + 0.02, cx, chTop - 0.03, -hd - chW / 2 + 0.01));
    chimneyTop = new THREE.Vector3(cx, chTop, -hd - 0.06);
  } else if (s.chimney?.kind === 'pipe') {
    const { x, z } = s.chimney;
    const roofY = yE + s.rise * (1 - Math.abs(x) / hw);
    parts.add('iron', new THREE.CylinderGeometry(0.014, 0.014, 0.14, 10).translate(x, roofY + 0.06, z));
    parts.add('iron', new THREE.ConeGeometry(0.03, 0.025, 10).translate(x, roofY + 0.14, z));
    chimneyTop = new THREE.Vector3(x, roofY + 0.15, z);
  }

  // ── Scaffold: tube frame and plank walks round the walls ──
  parts.layer = 'scaffold';
  const off = 0.07, tube = 0.008;
  const ring: Array<[number, number, number, number]> = [[-hw - off, -hd - off, hw + off, -hd - off], [hw + off, -hd - off, hw + off, hd + off], [-hw - off, -hd - off, -hw - off, hd + off]];
  for (const [ax, az, bx, bz] of ring) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(len / 0.28));
    for (let i = 0; i <= n; i++) {
      const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
      parts.add('scaffold', box(tube, yE + 0.05, tube, x, -0.03, z));
    }
    for (const yy of [y0 + 0.2, yE - 0.02]) {
      const g = box(len, tube, tube, 0, yy, 0);
      g.rotateY(-Math.atan2(bz - az, bx - ax));
      g.translate((ax + bx) / 2, 0, (az + bz) / 2);
      parts.add('scaffold', g);
      const pl = box(len, 0.008, 0.05, 0, yy + tube, 0);
      pl.rotateY(-Math.atan2(bz - az, bx - ax));
      pl.translate((ax + bx) / 2 + (bz - az === 0 ? 0 : Math.sign(ax) * 0.02), 0, (az + bz) / 2 + (bz - az === 0 ? Math.sign(az) * 0.02 : 0));
      parts.add('deck', pl);
    }
  }

  // ── Interior ──
  if (furnish) {
    const ctx: FurnishCtx = {
      parts, spec: s, hw, hd, y0, yE,
      left: -hw + T, right: hw - T, front: hd - T, back: -hd + T,
      rnd: parts.rnd,
      C: (p, fn, prob = 0.75) => { if (parts.rnd() < prob) piece(parts.sink, (p.y ?? y0) > y0 + CUT_H ? 'decor' : 'interior', { ...p, y: p.y ?? y0 + 0.004 }, fn, false); },
      I: (p, fn, solid = true) => { const c = piece(parts.sink, 'interior', { ...p, y: p.y ?? y0 + 0.004 }, fn, solid); if (c) parts.collide(c); },
      L: (p, fn, solid = false) => { const c = piece(parts.sink, 'loft', { ...p, y: p.y ?? yE }, fn, solid); if (c) parts.collide(c); },
      partition: (ax, az, bx, bz, openings = [], mat = s.inner ?? 'pine_panel', h = s.wallH) => {
        parts.collide(...wallRun(parts.sink, 'walls', mat, { ax, az, bx, bz, y0, h, t: 0.02, openings }));
        wallRun(parts.sink, 'cutwalls', mat, { ax, az, bx, bz, y0, h, t: 0.02, openings, cut: CUT_H });
      },
    };
    furnish(ctx);
  }
  if (chimneyTop) chimneyTop.add(new THREE.Vector3(parts.ox, 0, parts.oz));
  // anything else on the lot (runs, fences, earth berms), in the footprint frame
  parts.ox = 0; parts.oz = 0;
  extras?.(parts);
  const group = parts.finish();
  group.userData.chimneyTop = chimneyTop;
  return { group, chimneyTop };
}
