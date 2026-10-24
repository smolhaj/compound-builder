/**
 * Bunker rooms (GDS §2.2 underground layer; underground.ts for the rules).
 * Each room is a poured-concrete box (a buried shipping container for the
 * cheap one) with its floor at y = 0 of its group, the bunker's datum, and
 * the ground `opts.depth` above it. Built in the usual layers, timed for a
 * dig: stakes on the surface → floor slab → walls (timed like a frame) →
 * roof slab → vents, doors and the fit-out. Doorways go through the walls
 * a room shares with its neighbours (opts.doors); furniture is packed
 * along the walls clear of them. Sizes in metres × M (scale.test.ts).
 */
import * as THREE from 'three';
import { CELL, type KitPieceDef } from './kit';
import { Furniture, M, piece, wallRun, type Add, type Collider, type Opening } from './interior';
import { box, CUT_H, Parts, type BuildLayer, type BuildOpts } from './shell';
import { Clutter } from './clutter';
import { Equipment } from './utilityBuildings';
import type { KitMaterialId } from './materials';
import { DEPTH, ROOF_TOP, type Side } from './underground';

/** Clear height inside (2.5 m). */
export const VAULT_H = 2.5 * M;
/** The hatch shaft: 0.95 m square inside (half-width). */
export const SHAFT_HALF = 0.95 * M / 2;
/** Doorway through a bunker wall (1 m × 2.1 m). */
const DOOR_W = 1.0 * M, DOOR_H = 2.1 * M;

const cyl = (r: number, h: number, x: number, y: number, z: number, seg = 12) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z);

type Rect = { x0: number; z0: number; x1: number; z1: number };
const hits = (a: Rect, b: Rect) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

/** An item packed against a wall: length along the wall, depth out from it (world units). */
interface WallItem {
  len: number; dep: number;
  fn: (a: Add) => void;
  /** The piece's own z axis runs along the wall (beds, bunks). */
  along?: boolean;
  /** Walls to try, in order. */
  sides?: Side[];
  solid?: boolean;
}

/** What a room's fit-out gets. */
export interface VaultCtx {
  p: Parts;
  /** Inner faces. */
  left: number; right: number; front: number; back: number;
  /** Ground above the floor. */
  depth: number;
  rnd: () => number;
  /** A floor piece (interior layer), solid by default. */
  I(x: number, z: number, rot: number, fn: (a: Add) => void, solid?: boolean): void;
  /** Maybe a clutter piece (probability). */
  C(x: number, z: number, rot: number, fn: (a: Add) => void, prob?: number, y?: number): void;
  /** Pack items along the walls, clear of doorways and of each other. Returns how many fitted. */
  pack(items: WallItem[]): number;
  /** Something hung on a wall at height y (pictures, signs, pegs): the first free stretch of the given walls. */
  hang(sides: Side[], w: number, y: number, fn: (a: Add) => void, prob?: number): void;
  /** Reserve floor (kept clear by pack). */
  reserve(r: Rect): void;
}

interface VaultSpec {
  /** Structure / inner finish. */
  wall: KitMaterialId; inner: KitMaterialId | null; floor: KitMaterialId;
  /** Wall thickness. */
  T: number;
  /** A hole in the roof slab (the hatch shaft), local. */
  roofHole?: Rect;
  /** Heavy steel doors in the doorways (entrances) or plain steel frames. */
  blastDoors?: boolean;
  /** Vent pipes up to the surface (local x, z). */
  vents?: Array<[number, number]>;
  /** Skip the standard box (the stairwell builds its own). */
  custom?: boolean;
}

/** Steel door leaf standing open inward against the wall, with a locking wheel (blast door) or a lever. */
function doorLeaf(p: Parts, hx: number, hz: number, alongX: boolean, inward: number, blast: boolean): void {
  const w = DOOR_W - 0.01, t = blast ? 0.12 * M : 0.05 * M;
  // hinged at (hx, hz), swung 90° into the room: the leaf lies along the wall's normal
  const g = alongX ? box(t, DOOR_H - 0.004, w, 0, 0.002, 0).translate(hx, 0, hz + inward * w / 2) : box(w, DOOR_H - 0.004, t, 0, 0.002, 0).translate(hx + inward * w / 2, 0, hz);
  p.add(blast ? 'paint_green' : 'steel', g, 'openings');
  if (blast) {
    const wheel = new THREE.TorusGeometry(0.22 * M, 0.025 * M, 6, 16);
    if (alongX) wheel.rotateY(Math.PI / 2);
    wheel.translate(alongX ? hx + 0.07 * M : hx + inward * w / 2, 1.1 * M, alongX ? hz + inward * w / 2 : hz + 0.07 * M);
    p.add('steel', wheel, 'openings');
  }
}

/**
 * The escape tunnel's door: a blast door shut in its frame, two heavy steel
 * drop-bars across it in brackets on the room side, a locking wheel. It is
 * opened from here or not at all; the tunnel side is plain plate.
 */
function barredDoor(p: Parts, alongX: boolean, at: number, face: number, sgn: number): void {
  const w = DOOR_W + 0.01, inner = face - sgn * 0.004;        // the leaf sits in the frame, flush with the room face
  const put = (g: THREE.BufferGeometry, m: KitMaterialId) => p.add(m, alongX ? g.translate(at, 0, inner) : g.rotateY(Math.PI / 2).translate(inner, 0, at), 'openings');
  put(box(w, DOOR_H, 0.1 * M, 0, 0, sgn * 0.05 * M), 'paint_green');
  for (const y of [0.55, 1.45]) {
    put(box(DOOR_W + 0.26 * M, 0.1 * M, 0.08 * M, 0, y * M, -sgn * 0.06 * M), 'steel');                       // drop-bar
    for (const e of [-1, 1]) put(box(0.1 * M, 0.2 * M, 0.12 * M, e * (DOOR_W / 2 + 0.08 * M), y * M - 0.05 * M, -sgn * 0.05 * M), 'iron');   // brackets in the wall
  }
  const wheel = new THREE.TorusGeometry(0.2 * M, 0.025 * M, 6, 16).translate(0.15 * M, 1.0 * M, -sgn * 0.09 * M);
  put(wheel, 'steel');
}

/**
 * Build a vault: floor, walls (with doorways), roof slab, vents, door frames,
 * lights; then the fit-out. The group carries userData.stageAs so its walls
 * go up with the frame stage, and colliders for walls and furniture.
 */
function vault(def: KitPieceDef, seed: number, opts: BuildOpts, spec: VaultSpec, fit: (c: VaultCtx) => void): THREE.Group {
  const p = new Parts(seed, opts);
  const W = def.cellsX * CELL, D = def.cellsZ * CELL, hw = W / 2, hd = D / 2;
  const T = spec.T, H = VAULT_H;
  const depth = opts.depth ?? DEPTH;
  const doors = opts.doors ?? {};
  // stakes and string lines on the surface over the dig
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * (hw + 0.05), depth - 0.02, sz * (hd + 0.05)));
  for (const sz of [-1, 1]) p.add('string', box(W + 0.1, 0.003, 0.003, 0, depth + 0.05, sz * (hd + 0.05)));
  for (const sx of [-1, 1]) p.add('string', box(0.003, 0.003, D + 0.1, sx * (hw + 0.05), depth + 0.05, 0));
  // floor slab on a gravel bed, the floor finish
  p.add('concrete', box(W, 0.05, D, 0, -0.05, 0), 'foundation');
  p.add(spec.floor, box(W - 2 * T, 0.004, D - 2 * T, 0, 0, 0), 'deck');

  const L = -hw + T, R = hw - T, B = -hd + T, F = hd - T;
  const ops = (side: Side): Opening[] => {
    const at = doors[side];
    if (at === undefined) return [];
    const along = side === 'front' || side === 'back' ? at + hw : at + hd;
    return [{ at: along, w: DOOR_W, sill: 0, h: DOOR_H }];
  };
  if (!spec.custom) {
    const walls = (layer: BuildLayer, cut?: number) => {
      const out: Collider[] = [];
      const tI = spec.inner ? 0.012 : 0, tO = T - tI;
      const leaves: Array<[number, number, KitMaterialId]> = [[tO / 2, tO, spec.wall]];
      if (spec.inner) leaves.push([tO + tI / 2, tI, spec.inner]);
      for (const [inset, t, m] of leaves) {
        // front / back walls run the full width; sides fit between them
        out.push(...wallRun(p.sink, layer, m, { ax: -hw, az: hd - inset, bx: hw, bz: hd - inset, y0: 0, h: H, t, cut, openings: ops('front') }));
        out.push(...wallRun(p.sink, layer, m, { ax: -hw, az: -hd + inset, bx: hw, bz: -hd + inset, y0: 0, h: H, t, cut, openings: ops('back') }));
        const za = -hd + T, zb = hd - T;
        out.push(...wallRun(p.sink, layer, m, { ax: -hw + inset, az: za, bx: -hw + inset, bz: zb, y0: 0, h: H, t, cut, openings: ops('left').map(o => ({ ...o, at: o.at - T })) }));
        out.push(...wallRun(p.sink, layer, m, { ax: hw - inset, az: za, bx: hw - inset, bz: zb, y0: 0, h: H, t, cut, openings: ops('right').map(o => ({ ...o, at: o.at - T })) }));
      }
      return out;
    };
    p.collide(...walls('walls'));
    walls('cutwalls', CUT_H);
    // a darker painted dado band round the room (the classic shelter look; it hides the scuffs)
    if (spec.inner) {
      const dado = 1.1 * M, t = 0.004, i = T + t / 2;
      const run = (layer: BuildLayer, ax: number, az: number, bx: number, bz: number, side: Side, shift: number) =>
        wallRun(p.sink, layer, 'paint_dado', { ax, az, bx, bz, y0: 0, h: dado, t, cut: layer === 'cutwalls' ? CUT_H : undefined, openings: ops(side).map(o => ({ ...o, at: o.at - shift })) });
      for (const layer of ['walls', 'cutwalls'] as BuildLayer[]) {
        run(layer, -hw + T, hd - i, hw - T, hd - i, 'front', T);
        run(layer, -hw + T, -hd + i, hw - T, -hd + i, 'back', T);
        run(layer, -hw + i, -hd + T, -hw + i, hd - T, 'left', T);
        run(layer, hw - i, -hd + T, hw - i, hd - T, 'right', T);
      }
    }
    // roof slab (with the shaft hole), painted ceiling
    const slab = (m: KitMaterialId, y: number, h: number, inset: number) => {
      const x0 = -hw + inset, x1 = hw - inset, z0 = -hd + inset, z1 = hd - inset;
      const hole = spec.roofHole;
      if (!hole) { p.add(m, box(x1 - x0, h, z1 - z0, 0, y, 0), 'roof'); return; }
      p.add(m, box(x1 - x0, h, hole.z0 - z0, 0, y, (z0 + hole.z0) / 2), 'roof');
      p.add(m, box(x1 - x0, h, z1 - hole.z1, 0, y, (hole.z1 + z1) / 2), 'roof');
      p.add(m, box(hole.x0 - x0, h, hole.z1 - hole.z0, (x0 + hole.x0) / 2, y, (hole.z0 + hole.z1) / 2), 'roof');
      p.add(m, box(x1 - hole.x1, h, hole.z1 - hole.z0, (hole.x1 + x1) / 2, y, (hole.z0 + hole.z1) / 2), 'roof');
    };
    slab('concrete', H, ROOF_TOP - H, 0);
    if (spec.inner) slab(spec.inner, H - 0.004, 0.004, T);
    // waterproofing membrane over the roof (shows while the dig is open)
    slab('iron', ROOF_TOP, 0.004, -0.01);
  }
  // door frames (and blast doors) in every doorway
  for (const side of ['front', 'back', 'left', 'right'] as Side[]) {
    const at = doors[side];
    if (at === undefined) continue;
    const alongX = side === 'front' || side === 'back';
    const sgn = side === 'front' || side === 'right' ? 1 : -1;
    const face = alongX ? sgn * (hd - T) : sgn * (hw - T);
    for (const e of [-1, 1]) {
      const o = at + e * (DOOR_W / 2 + 0.006);
      p.add('steel', alongX ? box(0.012, DOOR_H + 0.012, T + 0.006, o, 0, sgn * (hd - T / 2)) : box(T + 0.006, DOOR_H + 0.012, 0.012, sgn * (hw - T / 2), 0, o), 'openings');
    }
    p.add('steel', alongX ? box(DOOR_W + 0.024, 0.012, T + 0.006, at, DOOR_H, sgn * (hd - T / 2)) : box(T + 0.006, 0.012, DOOR_W + 0.024, sgn * (hw - T / 2), DOOR_H, at), 'openings');
    if (opts.blast?.includes(side)) barredDoor(p, alongX, at, face, sgn);
    else if (spec.blastDoors) {
      const hinge = at - DOOR_W / 2;
      if (alongX) doorLeaf(p, hinge, face, false, -sgn, true);
      else doorLeaf(p, face, hinge, true, -sgn, true);
    }
  }
  // vents: pipes from the ceiling up through the earth to mushroom caps a little above the grass
  for (const [vx, vz] of spec.vents ?? []) {
    p.add('steel', cyl(0.07 * M, depth + 0.12 - H + 0.02, vx, H - 0.02, vz, 10), 'chimney');
    p.add('steel', cyl(0.16 * M, 0.04 * M, vx, depth + 0.12, vz, 12), 'chimney');
    p.add('steel', new THREE.ConeGeometry(0.16 * M, 0.1 * M, 12).translate(vx, depth + 0.12 + 0.04 * M + 0.05 * M, vz), 'chimney');
  }
  // bulkhead lights on the ceiling, a conduit between them (roof layer: hidden in the cutaway)
  const lamps: Array<[number, number]> = [];
  const nx = Math.max(1, Math.round((R - L) / 0.45)), nz = Math.max(1, Math.round((F - B) / 0.45));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) lamps.push([L + (i + 0.5) * (R - L) / nx, B + (j + 0.5) * (F - B) / nz]);
  for (const [lx, lz] of lamps) {
    if (spec.roofHole && lx > spec.roofHole.x0 - 0.04 && lx < spec.roofHole.x1 + 0.04 && lz > spec.roofHole.z0 - 0.04 && lz < spec.roofHole.z1 + 0.04) continue;
    p.add('steel', box(0.3 * M, 0.06 * M, 0.16 * M, lx, H - 0.06 * M - 0.004, lz), 'roof');
    p.add('bulkhead', box(0.24 * M, 0.02 * M, 0.11 * M, lx, H - 0.08 * M - 0.004, lz), 'roof');
  }
  if (lamps.length > 1) p.add('steel', box(0.03 * M, 0.03 * M, F - B - 0.04, lamps[0][0], H - 0.03 * M - 0.004, (B + F) / 2), 'roof');

  // ── fit-out ──
  const placed: Rect[] = [];
  const doorZone = (side: Side, at: number): Rect => {
    const c = DOOR_W / 2 + 0.03, d = 0.22;
    switch (side) {
      case 'front': return { x0: at - c, x1: at + c, z0: F - d, z1: F + 0.1 };
      case 'back': return { x0: at - c, x1: at + c, z0: B - 0.1, z1: B + d };
      case 'left': return { x0: L - 0.1, x1: L + d, z0: at - c, z1: at + c };
      default: return { x0: R - d, x1: R + 0.1, z0: at - c, z1: at + c };
    }
  };
  for (const side of ['front', 'back', 'left', 'right'] as Side[]) if (doors[side] !== undefined) placed.push(doorZone(side, doors[side]!));
  const facing: Record<Side, number> = { back: 0, front: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 };
  const c: VaultCtx = {
    p, left: L, right: R, front: F, back: B, depth, rnd: p.rnd,
    I: (x, z, rot, fn, solid = true) => { const k = piece(p.sink, 'interior', { x, z, rot, y: 0.004 }, fn, solid); if (k) { p.collide(k); placed.push(k); } },
    C: (x, z, rot, fn, prob = 0.75, y = 0.004) => { if (p.rnd() < prob) piece(p.sink, y > CUT_H ? 'decor' : 'interior', { x, z, rot, y }, fn, false); },
    reserve: r => { placed.push(r); },
    pack: items => {
      let n = 0;
      for (const it of items) {
        let done = false;
        for (const side of it.sides ?? ['back', 'left', 'right', 'front'] as Side[]) {
          const alongX = side === 'front' || side === 'back';
          const lo = (alongX ? L : B) + it.len / 2 + 0.004, hi = (alongX ? R : F) - it.len / 2 - 0.004;
          for (let t = lo; t <= hi + 1e-9 && !done; t += 0.01) {
            const cx = alongX ? t : side === 'left' ? L + it.dep / 2 + 0.003 : R - it.dep / 2 - 0.003;
            const cz = alongX ? (side === 'back' ? B + it.dep / 2 + 0.003 : F - it.dep / 2 - 0.003) : t;
            const r = alongX ? { x0: cx - it.len / 2, x1: cx + it.len / 2, z0: cz - it.dep / 2, z1: cz + it.dep / 2 } : { x0: cx - it.dep / 2, x1: cx + it.dep / 2, z0: cz - it.len / 2, z1: cz + it.len / 2 };
            if (placed.some(q => hits(q, r))) continue;
            placed.push(r);
            const k = piece(p.sink, 'interior', { x: cx, z: cz, rot: facing[side] + (it.along ? Math.PI / 2 : 0), y: 0.004 }, it.fn, it.solid ?? true);
            if (k) p.collide(k);
            done = true;
          }
          if (done) break;
        }
        if (done) n++;
      }
      return n;
    },
    hang: (sides, w, y, fn, prob = 1) => {
      if (p.rnd() >= prob) return;
      for (const side of sides) {
        const alongX = side === 'front' || side === 'back';
        const door = doors[side];
        const lo = (alongX ? L : B) + w / 2 + 0.03, hi = (alongX ? R : F) - w / 2 - 0.03;
        for (let t = (lo + hi) / 2, k = 0; k < 60; k++, t = (lo + hi) / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.02) {
          if (t < lo || t > hi) continue;
          if (door !== undefined && Math.abs(t - door) < DOOR_W / 2 + w / 2 + 0.02) continue;
          const x = alongX ? t : side === 'left' ? L + 0.002 : R - 0.002;
          const z = alongX ? (side === 'back' ? B + 0.002 : F - 0.002) : t;
          piece(p.sink, y > CUT_H ? 'decor' : 'interior', { x, z, rot: facing[side], y }, fn, false);
          return;
        }
      }
    },
  };
  fit(c);
  const g = p.finish();
  // walls go up with the frame stage (poured walls, then the roof slab)
  g.userData.stageAs = { walls: 'frame', cutwalls: 'frame' };
  g.userData.chimneyTop = null;
  g.userData.underground = true;
  return g;
}

const CONCRETE: VaultSpec = { wall: 'concrete', inner: 'paint_bunker', floor: 'concrete', T: 0.05 };

// ─────────────────────────────────────────────────────────────────────────
// Bunker kit pieces
// ─────────────────────────────────────────────────────────────────────────

/** Things that make a shelter somebody's: photos, drawings, a calendar, a clock. */
function homey(c: VaultCtx): void {
  c.hang(['back', 'left', 'right'], 0.42 * M, 1.4 * M, a => Clutter.picture(a, 0.42, 0.32, c.rnd() < 0.5 ? 'photo_family' : 'art_lake'), 0.8);
  c.hang(['right', 'left', 'front'], 0.3 * M, 1.35 * M, a => Clutter.calendar(a), 0.7);
  c.hang(['front', 'left', 'right', 'back'], 0.32 * M, 1.85 * M, a => Clutter.clock(a), 0.6);
  c.hang(['left', 'back', 'right'], 0.5 * M, 1.1 * M, a => Clutter.drawings(a), 0.6);
}

function hatch(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  const sh = SHAFT_HALF;
  const depth = opts.depth ?? DEPTH;
  const g = vault(def, seed, opts, { ...CONCRETE, blastDoors: true, roofHole: { x0: -sh, x1: sh, z0: -sh, z1: sh }, vents: [[0.15, -0.15]] }, c => {
    const p = c.p, t = 0.15 * M;
    // the shaft: concrete walls from the roof slab up to a collar on the surface
    for (const [w, d, x, z] of [[2 * sh + 2 * t, t, 0, -sh - t / 2], [2 * sh + 2 * t, t, 0, sh + t / 2], [t, 2 * sh, -sh - t / 2, 0], [t, 2 * sh, sh + t / 2, 0]] as const) {
      p.add('concrete', box(w, depth - VAULT_H + 0.04, d, x, VAULT_H, z), 'roof');
    }
    // the collar: a concrete ring round the open shaft, a little proud of the grass
    const cw = 0.05, co = sh + cw;
    for (const [w, d, x, z] of [[2 * co, cw, 0, -sh - cw / 2], [2 * co, cw, 0, sh + cw / 2], [cw, 2 * sh, -sh - cw / 2, 0], [cw, 2 * sh, sh + cw / 2, 0]] as const) p.add('concrete', box(w, 0.06, d, x, depth - 0.02, z), 'deck');
    // the steel lid, shut: hinged at the back, a lifting handle and a padlock hasp at the front
    const top = depth + 0.04;
    p.add('paint_green', box(2 * co - 0.01, 0.012, 2 * co - 0.01, 0, top, 0), 'openings');
    p.add('steel', box(2 * sh, 0.016, 0.02, 0, top + 0.004, -co + 0.012), 'openings');
    p.add('steel', box(0.25 * M, 0.06 * M, 0.04 * M, 0, top + 0.012, co - 0.03), 'openings');
    p.add('iron', box(0.06 * M, 0.08 * M, 0.03 * M, 0.15 * M, top + 0.006, co - 0.003), 'openings');
    // a steel ladder up the back of the shaft from the floor to the collar
    const ly = depth + 0.05, lz = -sh + 0.012;
    for (const sx of [-1, 1]) p.add('steel', box(0.04 * M, ly, 0.04 * M, sx * 0.22 * M, 0, lz), 'openings');
    for (let k = 1; k * 0.3 * M < ly; k++) p.add('steel', box(0.44 * M, 0.025 * M, 0.025 * M, 0, k * 0.3 * M, lz), 'openings');
    c.reserve({ x0: -sh, x1: sh, z0: -sh, z1: sh * 0.2 });
    // the vestibule: gas masks and coats on pegs, a lantern, an extinguisher
    c.hang(['right', 'left', 'front'], 1.0 * M, 0, a => Furniture.coatPegs(a, 1.0), 1);
    c.hang(['left', 'right', 'front'], 0.2 * M, 0.5 * M, a => Equipment.extinguisher(a), 1);
    c.hang(['front', 'right', 'left'], 0.35 * M, 1.7 * M, a => Equipment.sign(a), 0.8);
    c.C(c.right - 0.05, c.front - 0.05, 0, a => Clutter.bucket(a), 0.6);
  });
  return g;
}

function corridor(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  return vault(def, seed, opts, { ...CONCRETE, vents: [[0, -0.3]] }, c => {
    c.pack([
      { len: 1.2 * M, dep: 0.35 * M, fn: a => Furniture.shelfUnit(a, 1.2, 1.9, 'jars'), sides: ['left', 'right'] },
      { len: 1.2 * M, dep: 0.4 * M, fn: a => Furniture.bench(a, 1.2), sides: ['right', 'left'] },
    ]);
    c.hang(['left', 'right'], 1.0 * M, 0, a => Furniture.coatPegs(a, 1.0), 0.8);
    c.hang(['right', 'left'], 0.2 * M, 0.5 * M, a => Equipment.extinguisher(a), 1);
  });
}

/** A buried 40 ft container: corrugated steel inside, plywood floor, bunks, a table, a pantry. */
function container(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  return vault(def, seed, opts, { wall: 'container_tan', inner: null, floor: 'deck', T: 0.035, vents: [[0, -0.6], [0, 0.6]] }, c => {
    c.pack([
      { len: 2.0 * M, dep: 0.95 * M, along: true, fn: a => Furniture.bunk(a, 'quilt_red', 'quilt_blue'), sides: ['left'] },
      { len: 2.0 * M, dep: 0.95 * M, along: true, fn: a => Furniture.bunk(a, 'quilt_blue', 'quilt_red'), sides: ['right'] },
      { len: 1.0 * M, dep: 0.35 * M, fn: a => Furniture.shelfUnit(a, 1.0, 1.9, 'jars'), sides: ['front', 'left', 'right'] },
      { len: 1.0 * M, dep: 0.35 * M, fn: a => Furniture.shelfUnit(a, 1.0, 1.9, 'jars'), sides: ['left', 'right'] },
      { len: 0.6 * M, dep: 0.6 * M, fn: a => Furniture.barrel(a), sides: ['right', 'left'] },
    ]);
    c.I(0, 0.05, 0, a => Furniture.table(a, 0.8, 1.4));
    c.C(0, 0.05, 0, a => Clutter.checkers(a), 0.6, 0.004 + 0.76 * M);
    c.C(-0.1, 0.05, 0, a => Furniture.stool(a), 0.9);
    c.C(0.1, 0.05, 0, a => Furniture.stool(a), 0.9);
    homey(c);
  });
}

function dorm(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  return vault(def, seed, opts, { ...CONCRETE, vents: [[-0.3, -0.3]] }, c => {
    const quilts: KitMaterialId[] = ['quilt_red', 'quilt_blue'];
    const bunk = (i: number): WallItem => ({ len: 2.0 * M, dep: 0.95 * M, along: true, fn: a => Furniture.bunk(a, quilts[i % 2], quilts[(i + 1) % 2]), sides: ['left', 'right', 'back', 'front'] });
    c.pack([bunk(0), bunk(1), bunk(2), bunk(3)]);
    c.pack([{ len: 1.5 * M, dep: 0.5 * M, fn: lockers, sides: ['back', 'front', 'left', 'right'] }]);
    c.I(0, 0, 0, a => Furniture.rug(a, 2.0, 1.4), false);
    c.I(0, 0, 0, a => Furniture.table(a, 0.9, 0.7));
    for (const [x, z] of [[-0.09, 0], [0.09, 0]] as const) c.C(x, z, 0, a => Furniture.stool(a), 0.8);
    c.C(0, 0, 0, a => Clutter.checkers(a), 0.6, 0.004 + 0.76 * M);
    c.C(0.2, 0.18, 0.6, a => Clutter.toys(a), 0.7);
    c.C(-0.2, 0.2, 0.2, a => Clutter.laundryBasket(a), 0.5);
    homey(c);
    c.hang(['back', 'front', 'right'], 0.5 * M, 1.5 * M, a => Clutter.picture(a, 0.5, 0.36, 'photo_couple'), 0.7);
  });
}

/** Steel lockers, three wide. */
function lockers(a: Add): void {
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.5 * M;
    a('steel', box(0.48 * M, 1.8 * M, 0.48 * M, x, 0, 0));
    for (let k = 0; k < 4; k++) a('iron', box(0.3 * M, 0.02 * M, 0.005 * M, x, (1.45 + k * 0.05) * M, 0.242 * M));     // vents
    a('iron', box(0.03 * M, 0.15 * M, 0.02 * M, x + 0.17 * M, 0.95 * M, 0.25 * M));                                     // handle
  }
}

function galley(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  return vault(def, seed, opts, { ...CONCRETE, vents: [[0.3, -0.3]] }, c => {
    c.pack([
      { len: 2.4 * M, dep: 0.6 * M, fn: a => { Furniture.counter(a, 2.4, 0.3, true); campStove(a); }, sides: ['back', 'left', 'right', 'front'] },
      { len: 1.0 * M, dep: 0.35 * M, fn: a => Furniture.shelfUnit(a, 1.0, 1.9, 'jars'), sides: ['left', 'right', 'front', 'back'] },
      { len: 1.0 * M, dep: 0.35 * M, fn: a => Furniture.shelfUnit(a, 1.0, 1.9, 'jars'), sides: ['right', 'left', 'front', 'back'] },
      { len: 0.6 * M, dep: 0.6 * M, fn: a => Furniture.barrel(a), sides: ['front', 'right', 'left'] },
      { len: 0.6 * M, dep: 0.6 * M, fn: a => Furniture.barrel(a), sides: ['front', 'left', 'right'] },
    ]);
    c.I(0, 0.08, 0, a => Furniture.table(a, 1.8, 0.85));
    for (const s of [-1, 1]) c.I(0, 0.08 + s * 0.12, 0, a => Furniture.bench(a, 1.6));
    const top = 0.004 + 0.76 * M;
    c.C(-0.08, 0.06, 0, a => Clutter.plate(a), 0.9, top);
    c.C(0.06, 0.1, 0, a => Clutter.mug(a), 0.9, top);
    c.C(0.1, 0.05, 0, a => Clutter.fruitBowl(a), 0.6, top);
    c.C(-0.12, 0.1, 0, a => Clutter.radio(a), 0.6, top);
    homey(c);
  });
}

/** A two-burner camp stove and a kettle on the counter top. */
function campStove(a: Add): void {
  a('iron', box(0.55 * M, 0.1 * M, 0.35 * M, -0.6 * M, 0.9 * M, -0.05 * M));
  a('steel', cyl(0.09 * M, 0.16 * M, -0.72 * M, 1.0 * M, -0.05 * M, 10));
  a('paint_green', cyl(0.12 * M, 0.35 * M, -1.0 * M, 0.9 * M, -0.1 * M, 10));      // propane bottle
}

function stores(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  return vault(def, seed, opts, { ...CONCRETE, vents: [[0, 0.3]] }, c => {
    const shelf = (): WallItem => ({ len: 1.0 * M, dep: 0.45 * M, fn: a => { Furniture.shelfUnit(a, 1.0, 2.0, 'jars'); cans(a); } });
    c.pack([shelf(), shelf(), shelf(), shelf(), shelf(), shelf(), shelf(), shelf()]);
    c.pack([
      { len: 0.6 * M, dep: 0.6 * M, fn: a => Furniture.barrel(a) },
      { len: 0.6 * M, dep: 0.6 * M, fn: a => Furniture.barrel(a) },
      { len: 0.6 * M, dep: 0.6 * M, fn: a => Furniture.barrel(a) },
    ]);
    // a stack of crates and food-grade buckets in the middle
    c.I(0, 0, 0.1, a => { for (const [x, y, z] of [[-0.35, 0, 0], [0.35, 0, 0], [0, 0.42, 0]]) a('wood_mid', box(0.6 * M, 0.4 * M, 0.45 * M, x * M, y * M, z * M)); });
    for (let i = 0; i < 4; i++) c.C(-0.12 + i * 0.07, -0.18, 0, a => bucketLid(a), 0.85);
  });
}

/** Rows of cans on a shelf unit's shelves. */
function cans(a: Add): void {
  for (const y of [0.42, 0.88, 1.34]) for (let i = 0; i < 6; i++) a('steel', cyl(0.05 * M, 0.12 * M, (-0.38 + i * 0.15) * M, y * M, 0.06 * M, 8));
}

function bucketLid(a: Add): void {
  a('enamel', cyl(0.15 * M, 0.38 * M, 0, 0, 0, 12));
  a('paint_red', cyl(0.16 * M, 0.03 * M, 0, 0.38 * M, 0, 12));
}

function plant(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  return vault(def, seed, opts, { ...CONCRETE, vents: [[-0.3, -0.3], [0.3, -0.3]] }, c => {
    c.pack([
      { len: 1.2 * M, dep: 0.6 * M, fn: nbcFilter, sides: ['back', 'left', 'right', 'front'] },
      { len: 1.4 * M, dep: 1.4 * M, fn: waterTank, sides: ['right', 'left', 'front', 'back'] },
      { len: 1.0 * M, dep: 0.55 * M, fn: a => Equipment.batteryRack(a, 4, 1.0), sides: ['left', 'back', 'right', 'front'] },
      { len: 1.4 * M, dep: 0.6 * M, fn: a => Furniture.generator(a), sides: ['front', 'left', 'right', 'back'] },
      { len: 1.1 * M, dep: 0.65 * M, fn: a => Equipment.fuelDrums(a), sides: ['front', 'right', 'left', 'back'] },
      // on the wall, its conduits down to the floor: packed so it keeps clear of the rest
      { len: 1.8 * M, dep: 0.3 * M, fn: a => Equipment.inverterWall((m, g) => a(m, g.translate(0, 0, -0.15 * M))), sides: ['left', 'back', 'right', 'front'], solid: false },
    ]);
    c.hang(['right', 'left', 'front'], 0.2 * M, 0.5 * M, a => Equipment.extinguisher(a), 1);
    c.hang(['front', 'back', 'left'], 0.35 * M, 1.7 * M, a => Equipment.sign(a), 1);
    c.C(0, 0.1, 0, a => Furniture.stool(a), 0.6);
  });
}

/** NBC air filter: a grey cabinet with a hand crank, ducts up into the ceiling to the vents. */
function nbcFilter(a: Add): void {
  a('steel', box(1.1 * M, 1.5 * M, 0.55 * M, 0, 0, 0));
  a('iron', box(0.9 * M, 0.3 * M, 0.02 * M, 0, 1.1 * M, 0.28 * M));
  a('paint_yellow', box(0.3 * M, 0.2 * M, 0.01 * M, -0.3 * M, 0.7 * M, 0.28 * M));
  a('iron', new THREE.TorusGeometry(0.12 * M, 0.02 * M, 6, 12).translate(0.35 * M, 0.7 * M, 0.3 * M));
  for (const sx of [-1, 1]) a('steel', cyl(0.1 * M, 1.0 * M, sx * 0.35 * M, 1.5 * M, -0.05 * M, 10));
  a('paint_red', box(0.18 * M, 0.08 * M, 0.18 * M, -0.35 * M, 2.1 * M, -0.05 * M));      // blast valve
}

/** 2,000 L water tank on a plinth with a tap. */
function waterTank(a: Add): void {
  a('concrete', box(1.35 * M, 0.12 * M, 1.35 * M, 0, 0, 0));
  a('blue_tank', cyl(0.65 * M, 1.6 * M, 0, 0.12 * M, 0, 16));
  a('steel', cyl(0.04 * M, 0.25 * M, 0, 0.3 * M, 0.68 * M, 6).rotateX(Math.PI / 2).translate(0, 0.3 * M, 0.55 * M));
  a('blue_tank', cyl(0.2 * M, 0.08 * M, 0, 1.72 * M, 0, 10));
}

function medical(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  return vault(def, seed, opts, { ...CONCRETE, vents: [[0.3, 0.3]] }, c => {
    c.pack([
      { len: 2.0 * M, dep: 0.95 * M, along: true, fn: a => Furniture.bed(a, false, 'linen'), sides: ['left', 'right', 'back', 'front'] },
      { len: 2.0 * M, dep: 0.95 * M, along: true, fn: a => Furniture.single(a, 'quilt_blue'), sides: ['right', 'left', 'back', 'front'] },
      { len: 1.2 * M, dep: 0.6 * M, fn: a => Furniture.counter(a, 1.2, 0.4, true), sides: ['back', 'front', 'left', 'right'] },
      { len: 1.0 * M, dep: 0.45 * M, fn: a => { Furniture.shelfUnit(a, 1.0, 1.9, 'jars'); }, sides: ['front', 'back', 'left', 'right'] },
    ]);
    c.C(0.12, -0.05, 0, a => ivPole(a), 0.9);
    c.C(-0.15, 0.15, 0, a => a('paint_green', cyl(0.1 * M, 1.2 * M, 0, 0, 0, 10)), 0.9);   // oxygen bottle
    c.C(0, 0.12, 0, a => Furniture.chair(a), 0.8);
    c.hang(['back', 'front', 'left', 'right'], 0.5 * M, 1.3 * M, firstAid, 1);
    c.hang(['front', 'right', 'left'], 0.3 * M, 1.35 * M, a => Clutter.calendar(a), 0.6);
  });
}

function ivPole(a: Add): void {
  a('steel', cyl(0.015 * M, 1.9 * M, 0, 0, 0, 6));
  for (let k = 0; k < 4; k++) a('steel', box(0.4 * M, 0.02 * M, 0.02 * M, 0, 0.02 * M, 0).rotateY(k * Math.PI / 2));
  a('linen', box(0.12 * M, 0.2 * M, 0.05 * M, 0.08 * M, 1.65 * M, 0));
}

/** White first-aid cabinet with a red cross. */
function firstAid(a: Add): void {
  a('enamel', box(0.5 * M, 0.5 * M, 0.16 * M, 0, 0, 0.08 * M));
  a('paint_red', box(0.3 * M, 0.08 * M, 0.01 * M, 0, 0.21 * M, 0.165 * M));
  a('paint_red', box(0.08 * M, 0.3 * M, 0.01 * M, 0, 0.1 * M, 0.165 * M));
}

function comms(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  return vault(def, seed, opts, { ...CONCRETE, vents: [[0, 0.3]] }, c => {
    c.pack([
      { len: 1.8 * M, dep: 0.75 * M, fn: radioDesk, sides: ['left', 'right', 'back', 'front'] },
      { len: 0.9 * M, dep: 0.65 * M, fn: gunSafe, sides: ['right', 'left', 'back', 'front'] },
      { len: 1.0 * M, dep: 0.4 * M, fn: a => { Furniture.shelfUnit(a, 1.0, 1.9, 'books'); ammoCans(a); }, sides: ['right', 'left', 'front', 'back'] },
    ]);
    c.hang(['left', 'right', 'back'], 0.9 * M, 1.25 * M, a => Clutter.poster(a, 0.9, 0.7, 'poster_map'), 1);
    c.hang(['right', 'left', 'front'], 1.0 * M, 1.3 * M, a => Clutter.riflePegs(a), 0.8);
    c.hang(['back', 'front', 'left'], 0.32 * M, 1.9 * M, a => Clutter.clock(a), 0.8);
    c.C(0, 0, 0, a => Furniture.chair(a), 0.9);
  });
}

/** Desk with two radios, a speaker, a notepad and a lamp. */
function radioDesk(a: Add): void {
  a('wood_mid', box(1.8 * M, 0.05 * M, 0.75 * M, 0, 0.72 * M, 0));
  for (const sx of [-1, 1]) a('steel', box(0.05 * M, 0.72 * M, 0.7 * M, sx * 0.85 * M, 0, 0));
  a('iron', box(0.45 * M, 0.18 * M, 0.3 * M, -0.45 * M, 0.77 * M, -0.15 * M));
  a('iron', box(0.35 * M, 0.14 * M, 0.28 * M, 0.05 * M, 0.77 * M, -0.18 * M));
  a('paint_green', box(0.2 * M, 0.03 * M, 0.01 * M, -0.45 * M, 0.88 * M, 0.006 * M));
  a('steel', box(0.02 * M, 0.5 * M, 0.02 * M, 0.3 * M, 0.77 * M, -0.3 * M));                // mic stand
  a('linen', box(0.2 * M, 0.01 * M, 0.28 * M, 0.45 * M, 0.77 * M, 0.1 * M));               // notepad
}

function gunSafe(a: Add): void {
  a('iron', box(0.85 * M, 1.6 * M, 0.6 * M, 0, 0, 0));
  a('steel', new THREE.TorusGeometry(0.1 * M, 0.02 * M, 6, 12).translate(0.15 * M, 0.95 * M, 0.31 * M));
  a('steel', box(0.03 * M, 0.3 * M, 0.03 * M, 0.3 * M, 0.85 * M, 0.31 * M));
}

function ammoCans(a: Add): void {
  for (let i = 0; i < 3; i++) a('paint_green', box(0.28 * M, 0.18 * M, 0.14 * M, (-0.3 + i * 0.3) * M, 0.06 * M, 0.02 * M));
}

/**
 * Stairwell: a stair from a little board-and-batten headhouse on the surface
 * (+z end) down to a landing at the far end, where the doorways are.
 */
/**
 * The stairwell's profile (local z along the piece; floor at 0, the ground
 * `depth` above): landing, the stair's run, where the headhouse starts, and
 * the tread height at a z. Shared with walk mode.
 */
export function stairProfile(def: KitPieceDef, depth: number): { zLand: number; zTop: number; zHouse: number; yAt: (z: number) => number } {
  const hd = def.cellsZ * CELL / 2, T = 0.05;
  const zLand = -hd + T + 0.32, zTop = hd - 0.02;            // the stair runs from the landing up to the top end
  const run = zTop - zLand;
  const yAt = (z: number) => Math.max(0, Math.min(depth, (z - zLand) / run * depth));
  // the slab over the stair comes up to the ground where the headhouse starts
  const zHouse = Math.min(zTop - 0.32, zLand + (depth - STAIR_HEAD + 0.02) / depth * run);
  return { zLand, zTop, zHouse, yAt };
}
/** Headroom over the treads. */
const STAIR_HEAD = 2.15 * M;

function stairs(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  const hw = def.cellsX * CELL / 2, hd = def.cellsZ * CELL / 2, T = 0.05;
  const depth = opts.depth ?? DEPTH;
  const { zLand, zTop, zHouse, yAt } = stairProfile(def, depth);
  const run = zTop - zLand;
  const ceilAt = (z: number) => Math.max(VAULT_H, yAt(z) + STAIR_HEAD);
  return vault(def, seed, opts, { ...CONCRETE, custom: true, blastDoors: true }, c => {
    const p = c.p;
    // side walls (concrete) and the landing's end wall, built as profiles that follow the stair's ceiling
    const n = 24;
    for (let i = 0; i < n; i++) {
      const z0 = -hd + (zHouse + hd) * i / n, z1 = -hd + (zHouse + hd) * (i + 1) / n;
      const h = ceilAt((z0 + z1) / 2);
      for (const sx of [-1, 1]) {
        const side: Side = sx < 0 ? 'left' : 'right';
        const at = opts.doors?.[side];
        const mid = (z0 + z1) / 2;
        const inDoor = at !== undefined && Math.abs(mid - at) < DOOR_W / 2;
        const y0 = inDoor ? DOOR_H : 0;
        if (h - y0 > 0.002) {
          p.add('concrete', box(T - 0.012, h - y0, z1 - z0, sx * (hw - (T - 0.012) / 2), y0, mid), 'walls');
          p.add('paint_bunker', box(0.012, h - y0, z1 - z0, sx * (hw - T + 0.006), y0, mid), 'walls');
          p.add('concrete', box(T, Math.min(h, CUT_H) - Math.min(y0, CUT_H), z1 - z0, sx * (hw - T / 2), Math.min(y0, CUT_H), mid), 'cutwalls');
        }
        if (!inDoor) p.collide({ x0: sx < 0 ? -hw : hw - T, x1: sx < 0 ? -hw + T : hw, z0, z1 });
      }
      // ceiling slab segment
      p.add('concrete', box(2 * hw, ROOF_TOP - VAULT_H, z1 - z0, 0, h, (z0 + z1) / 2), 'roof');
      p.add('paint_bunker', box(2 * hw - 2 * T, 0.004, z1 - z0, 0, h - 0.004, (z0 + z1) / 2), 'roof');
    }
    // the end wall at the landing (−z), with its doorway
    const back = opts.doors?.back;
    const endOps: Opening[] = back === undefined ? [] : [{ at: back + hw, w: DOOR_W, sill: 0, h: DOOR_H }];
    p.collide(...wallRun(p.sink, 'walls', 'concrete', { ax: -hw, az: -hd + T / 2, bx: hw, bz: -hd + T / 2, y0: 0, h: VAULT_H, t: T, openings: endOps }));
    wallRun(p.sink, 'cutwalls', 'concrete', { ax: -hw, az: -hd + T / 2, bx: hw, bz: -hd + T / 2, y0: 0, h: VAULT_H, t: T, openings: endOps, cut: CUT_H });
    p.add('concrete', box(2 * hw, ROOF_TOP - VAULT_H, T, 0, VAULT_H, -hd + T / 2), 'roof');
    // treads (concrete) and a steel handrail
    const rise = 0.18 * M, steps = Math.max(3, Math.round(depth / rise)), tr = run / steps;
    for (let k = 0; k < steps; k++) {
      const z = zLand + k * tr, y = (k + 1) * depth / steps;
      p.add('concrete', box(2 * hw - 2 * T, y, tr + 0.002, 0, 0, z + tr / 2), 'deck');
    }
    const rl = Math.hypot(run, depth), ang = Math.atan2(depth, run);
    for (const sx of [-1, 1]) {
      p.add('steel', box(0.04 * M, 0.04 * M, rl, 0, 0, 0).rotateX(-ang).translate(sx * (hw - T - 0.02), depth / 2 + 0.9 * M, zLand + run / 2), 'openings');
    }
    // the headhouse on the surface over the top of the stair
    const hz0 = zHouse - 0.02, hz1 = hd, wallH = 0.36, y0 = depth;
    const house = (layer: BuildLayer, cut?: number) => {
      const out: Collider[] = [];
      out.push(...wallRun(p.sink, layer, 'board_batten', { ax: -hw, az: hz1 - 0.01, bx: hw, bz: hz1 - 0.01, y0, h: wallH, t: 0.02, cut, openings: [{ at: hw, w: 0.16, sill: 0, h: 0.34 }] }));
      out.push(...wallRun(p.sink, layer, 'board_batten', { ax: -hw, az: hz0 + 0.01, bx: hw, bz: hz0 + 0.01, y0, h: wallH, t: 0.02, cut }));
      for (const sx of [-1, 1]) out.push(...wallRun(p.sink, layer, 'board_batten', { ax: sx * (hw - 0.01), az: hz0 + 0.02, bx: sx * (hw - 0.01), bz: hz1 - 0.02, y0, h: wallH, t: 0.02, cut }));
      return out;
    };
    // the headhouse's walls block, except its back wall (the stair goes down under it)
    p.collide(...house('walls').filter(k => !(k.z1 - k.z0 < 0.05 && k.z0 < hz0 + 0.03)));
    house('cutwalls', CUT_H);
    // gable roof (ridge along z) and its gable ends
    const roofRise = 0.14, span = hz1 - hz0 + 0.08, pitch = Math.atan2(roofRise, hw);
    for (const sx of [-1, 1]) {
      p.add('metal_roof', box(Math.hypot(hw + 0.04, roofRise), 0.012, span, 0, 0, 0).rotateZ(sx * -pitch).translate(sx * (hw + 0.04) / 2, y0 + wallH + roofRise / 2, (hz0 + hz1) / 2), 'roof');
    }
    for (const z of [hz0 + 0.01, hz1 - 0.01]) {
      const s = new THREE.Shape([new THREE.Vector2(-hw, 0), new THREE.Vector2(hw, 0), new THREE.Vector2(0, roofRise)]);
      p.add('board_batten', new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false }).translate(0, y0 + wallH, z - 0.01), 'walls');
    }
    // the door leaf standing open inward, a lamp, and some firewood to make it look like a woodshed
    p.add('door', box(0.025, 0.34, 0.16, 0, 0, 0).translate(-hw + 0.02 + 0.08 + 0.0125 + 0.06, y0, hz1 - 0.1), 'openings');
    p.add('earth', box(2 * hw + 0.06, 0.04, hz1 - hz0 + 0.06, 0, y0 - 0.04, (hz0 + hz1) / 2), 'foundation');
    piece(p.sink, 'interior', { x: -hw + 0.07, z: hz0 + 0.12, rot: Math.PI / 2, y: y0 }, a => Clutter.woodpile(a), false);
    c.reserve({ x0: -hw, x1: hw, z0: zLand - 0.01, z1: hd });
    c.hang(['back', 'left', 'right'], 0.2 * M, 0.5 * M, a => Equipment.extinguisher(a), 1);
    c.hang(['left', 'right'], 0.35 * M, 1.7 * M, a => Equipment.sign(a), 0.9);
  });
}

export const BUNKER_BUILDERS: Record<string, (def: KitPieceDef, seed?: number, opts?: BuildOpts) => THREE.Group> = {
  bunker_hatch: hatch,
  bunker_stairs: stairs,
  bunker_corridor: corridor,
  bunker_container: container,
  bunker_dorm: dorm,
  bunker_galley: galley,
  bunker_stores: stores,
  bunker_plant: plant,
  bunker_medical: medical,
  bunker_comms: comms,
};
