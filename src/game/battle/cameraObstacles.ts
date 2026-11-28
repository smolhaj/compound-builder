/**
 * What the cutscene camera must not fly into: the boxes of the buildings and the
 * walls, read off the game (pure; the director checks every shot against them).
 * World units (1 = 6 m). A box is `h` tall from the ground it stands on.
 */
import { KIT, footprint } from '../buildkit/kit';
import { PERIMETER } from '../../sim/perimeter';
import type { GameState } from '../../sim/state';
import { domesOf, type Airlock, type Dome } from '../../sim/dome/standing';
import { LOOK } from '../buildkit/domeBuildings';
import { CB_H, controlBlockPlan, turnPlan } from '../../sim/dome/controlBlock';
import { yardGeometry, yardRunData, yardWallHeight, yardPoint } from '../../sim/dome/plantYard';

/** An airlock module on a dome's shell: a block about 5 m across and 4 m tall that the camera may not fly into (a shot inside one is black). */
export const AIRLOCK_HALF = 0.55, AIRLOCK_H = 0.75;

export interface Box { x0: number; z0: number; x1: number; z1: number; h: number; kind: 'building' | 'wall' | 'tree' | 'brush'; /** The structure's kind id (a crate, a well, a truck), for the buildings. */ id?: string; /** Height of the underside above the ground (a tree's crown; default 0). */ y0?: number }

/** Roof line above the pad for a building (storey 0.65 plus the roof); towers are 1 unit (6 m) and a bit. */
const buildingHeight = (id: string, floorY: number): number => id.startsWith('watchtower') ? 1.25 : floorY + 1.3;
const WALL_THICK = 0.1;
const PORCH_HEIGHT = 0.3;
const MAX_BOXES = 700;

/** Height of the arcology's opaque armored skirt band above the ground: the stem wall (0.14) plus the band (0.8) of game/buildkit/domeBuildings, and a little and its half thickness. */
export const SKIRT_H = 0.96, SKIRT_HALF = 0.1;
/** Chord length used to approximate the skirt ring with axis-aligned boxes. */
const SKIRT_CHORD = 0.45;
/** The closed roof deck and perimeter beam above the armored yard walls. */
export const YARD_ROOF = 0.2;

/**
 * The opaque walls of a dome that the camera must keep out of (they are not perimeter runs in the live game, so `obstaclesOf` cannot read them there):
 * the concrete wall of the glass / arcology plant yard (a closed ring outside the shell) the arcology's control block and its armored skirt band round the foot. The glass
 * above the band is not boxed: a shot may look through it. Pure (tested in cameraShots.test.ts).
 */
export function domeWallBoxes(d: Pick<Dome, 'tier' | 'x' | 'z' | 'r' | 'airlocks'> & { structure: { rot: number } }): Box[] {
  const out: Box[] = [];
  // the arcology's control block: one armored building on the floor, planned as the builder draws it (sim/dome/controlBlock.ts), turned with the dome
  const vehicle = d.airlocks.find(a => a.role === 'vehicle');
  if (d.tier === 'arcology' && vehicle) {
    const phi = d.structure.rot * Math.PI / 2, cb0 = controlBlockPlan(d.tier, d.r, vehicle.angle - phi), cb = cb0 ? turnPlan(cb0, phi) : null;
    for (const c of cb?.colliders ?? []) out.push({ x0: c.x0 + d.x, x1: c.x1 + d.x, z0: c.z0 + d.z, z1: c.z1 + d.z, h: CB_H.tall, kind: 'building', id: 'dome_control' });
  }
  const yg = yardGeometry(d.tier, d.r, d.structure.rot);
  if (yg && d.tier === 'arcology') {
    // armored walls as tall as the plant under a closed roof: one solid block, tiled in the yard's own frame (u along the shell, v out from it)
    const h = yardWallHeight(d.tier, yg) + YARD_ROOF, step = 0.5, nu = Math.max(1, Math.ceil(yg.W / step)), nv = Math.max(1, Math.ceil(yg.D / step));
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const c = [0, 1].flatMap(a => [0, 1].map(b => yardPoint(yg, -yg.W / 2 + (i + a) * yg.W / nu, (j + b) * yg.D / nv)));
      out.push({ x0: Math.min(...c.map(q => q[0])) + d.x, x1: Math.max(...c.map(q => q[0])) + d.x, z0: Math.min(...c.map(q => q[1])) + d.z, z1: Math.max(...c.map(q => q[1])) + d.z, h, kind: 'building', id: 'dome_yard' });
    }
  } else if (yg) {
    const { pts } = yardRunData(yg, d.x, d.z), h = yardWallHeight(d.tier, yg);
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 0.8));
      for (let k = 0; k < n; k++) {
        const x0 = ax + (bx - ax) * k / n, z0 = az + (bz - az) * k / n, x1 = ax + (bx - ax) * (k + 1) / n, z1 = az + (bz - az) * (k + 1) / n;
        out.push({ x0: Math.min(x0, x1) - WALL_THICK, x1: Math.max(x0, x1) + WALL_THICK, z0: Math.min(z0, z1) - WALL_THICK, z1: Math.max(z0, z1) + WALL_THICK, h, kind: 'wall', id: 'dome_yard_wall' });
      }
    }
  }
  if (d.tier === 'arcology') {
    const n = Math.max(12, Math.ceil(2 * Math.PI * d.r / SKIRT_CHORD));
    for (let k = 0; k < n; k++) {
      const a0 = k / n * 2 * Math.PI, a1 = (k + 1) / n * 2 * Math.PI;
      const x0 = d.x + Math.sin(a0) * d.r, z0 = d.z + Math.cos(a0) * d.r, x1 = d.x + Math.sin(a1) * d.r, z1 = d.z + Math.cos(a1) * d.r;
      out.push({ x0: Math.min(x0, x1) - SKIRT_HALF, x1: Math.max(x0, x1) + SKIRT_HALF, z0: Math.min(z0, z1) - SKIRT_HALF, z1: Math.max(z0, z1) + SKIRT_HALF, h: SKIRT_H, kind: 'wall', id: 'dome_skirt' });
    }
  }
  return out;
}

/**
 * An arcology's entrance module (the person airlock or the vehicle port, 1.7 to 2.7 wide, about 2 long and 1.55 tall, armored): the oriented rectangle from its
 * inner door out past the shell, tiled into small boxes so each stays tight to it whichever way it faces. A single box 0.75 tall at the shell point left the
 * camera free to sit a hand's breadth from the module's dark wall with the whole picture filled. Pure.
 */
export function vestibuleBoxes(l: Pick<Airlock, 'angle' | 'inX' | 'inZ' | 'outX' | 'outZ' | 'w'>, h: number, step = 0.5): Box[] {
  const ax = Math.sin(l.angle), az = Math.cos(l.angle), lx = az, lz = -ax;      // (along the axis outward, and across it)
  const t0 = (l.inX - l.outX) * ax + (l.inZ - l.outZ) * az, len = -t0, hw = l.w / 2 + 0.1;
  const nt = Math.max(1, Math.ceil(len / step)), nu = Math.max(1, Math.ceil(2 * hw / step)), out: Box[] = [];
  for (let i = 0; i < nt; i++) for (let j = 0; j < nu; j++) {
    const xs: number[] = [], zs: number[] = [];
    for (const a of [0, 1]) for (const b of [0, 1]) {
      const t = t0 + (i + a) * len / nt, u = -hw + (j + b) * 2 * hw / nu;
      xs.push(l.outX + ax * t + lx * u); zs.push(l.outZ + az * t + lz * u);
    }
    out.push({ x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), h, kind: 'building', id: 'dome_airlock' });
  }
  return out;
}

export function obstaclesOf(g: GameState): Box[] {
  const out: Box[] = [];
  for (const st of g.structures) {
    const def = KIT[st.kind];
    if (!def || st.unplaced || def.level === 'underground' || def.level === 'cover') continue;
    // (fields, gardens, ponds and the like are flat: no box to hit)
    if (['field', 'garden', 'pond', 'reservoir', 'orchard', 'orchard_grove', 'terrace_stair', 'terrace_ramp', 'equipment_yard', 'vehicle_yard', 'motor_court'].includes(st.kind)) continue;
    // the body to the roof line; the porch and steps in front of the door as a low deck only (open above: posts and rails do not hide a person)
    out.push({ ...footprint(def, st.x, st.z, st.rot, false), h: buildingHeight(st.kind, def.floorY), kind: 'building', id: st.kind });
    if (def.frontCells > 0) out.push({ ...footprint(def, st.x, st.z, st.rot, true), h: PORCH_HEIGHT, kind: 'building' });
  }
  for (const d of domesOf(g)) for (const l of d.airlocks) {
    if (d.tier === 'arcology') { out.push(...vestibuleBoxes(l, LOOK.arcology.vestH)); continue; }
    const hw = Math.max(AIRLOCK_HALF, (l.w ?? 0) / 2 + 0.1);
    const cx = d.x + Math.sin(l.angle) * d.r, cz = d.z + Math.cos(l.angle) * d.r;
    out.push({ x0: cx - hw, x1: cx + hw, z0: cz - hw, z1: cz + hw, h: AIRLOCK_H, kind: 'building', id: 'dome_airlock' });
  }
  for (const d of domesOf(g)) out.push(...domeWallBoxes(d));
  for (const run of g.perimeter) {
    const def = PERIMETER[run.kind];
    if (!def || def.blocks.people < 0.5 || def.walkway || def.wallTop || run.pts.length < 2 || def.height < 0.3) continue;
    for (let i = 1; i < run.pts.length && out.length < MAX_BOXES; i++) {
      const [ax, az] = run.pts[i - 1], [bx, bz] = run.pts[i];
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 0.8));
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
        out.push({ x0: Math.min(x0, x1) - WALL_THICK, x1: Math.max(x0, x1) + WALL_THICK, z0: Math.min(z0, z1) - WALL_THICK, z1: Math.max(z0, z1) + WALL_THICK, h: def.height, kind: 'wall' });
      }
    }
  }
  return out;
}

/** The parts of a tree the camera needs (a parcel tree spec). */
export interface TreeLike { x: number; z: number; y: number; scale: number; kind: string; sx: number; sy: number }

const MAX_TREE_BOXES = 900;

/**
 * Trunks and crowns of the standing trees near the house as boxes, so the cutscene camera keeps out of them and never frames a subject
 * through one (the same sizes the free camera's crown test uses). Nearest the house first; small shrubs are skipped. Pure.
 */
export function treeBoxes(trees: readonly TreeLike[], around: { x: number; z: number }, radius: number): Box[] {
  const near = trees
    .filter(t => t.scale >= 0.4 && Math.hypot(t.x - around.x, t.z - around.z) <= radius)
    .sort((a, b) => Math.hypot(a.x - around.x, a.z - around.z) - Math.hypot(b.x - around.x, b.z - around.z))
    .slice(0, MAX_TREE_BOXES / 2);
  const out: Box[] = [];
  for (const t of near) {
    const top = 3 * t.scale * t.sy, trunk = 0.08 * t.scale, crown = (t.kind === 'conifer' ? 0.62 : 0.72) * t.scale * t.sx;
    out.push({ x0: t.x - trunk, x1: t.x + trunk, z0: t.z - trunk, z1: t.z + trunk, h: top, kind: 'tree' });
    if (crown > trunk * 1.5) out.push({ x0: t.x - crown, x1: t.x + crown, z0: t.z - crown, z1: t.z + crown, h: top, y0: 0.25 * t.scale, kind: 'tree' });
  }
  return out;
}

/** A clump of ground cover (sagebrush, willow, a rock): crown radius `r`, height `h` (units). */
export interface CoverLike { x: number; z: number; r: number; h?: number }

/**
 * Sagebrush, willow clumps and rocks near the house as low boxes. A person standing behind a bush is half hidden, so the framing check
 * (director.blockedBetween) treats cover between the eye and a subject, or right in front of it, as blocking. Nearest the house first. Pure.
 */
export function coverBoxes(cover: readonly CoverLike[], around: { x: number; z: number }, radius: number): Box[] {
  return cover
    .filter(c => Math.hypot(c.x - around.x, c.z - around.z) <= radius)
    .sort((a, b) => Math.hypot(a.x - around.x, a.z - around.z) - Math.hypot(b.x - around.x, b.z - around.z))
    .slice(0, 1200)
    .map(c => ({ x0: c.x - c.r, x1: c.x + c.r, z0: c.z - c.r, z1: c.z + c.r, h: c.h ?? 0.25, kind: 'brush' as const }));
}

/**
 * A function that moves a point out of any bush, rock or willow clump it stands in (to just outside the crown), so a raider is never
 * put down half hidden in cover. Indexed once per list (4-unit cells); pure.
 */
export function coverPusher(cover: readonly CoverLike[]): (x: number, z: number) => { x: number; z: number } {
  const cells = new Map<number, CoverLike[]>();
  for (const c of cover) { const k = Math.floor(c.x / 4) * 100003 + Math.floor(c.z / 4); (cells.get(k) ?? cells.set(k, []).get(k)!).push(c); }
  return (x, z) => {
    let px = x, pz = z;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) for (const c of cells.get((Math.floor(px / 4) + gx) * 100003 + Math.floor(pz / 4) + gz) ?? []) {
        const dx = px - c.x, dz = pz - c.z, d = Math.hypot(dx, dz), lim = c.r + 0.35;
        if (d < lim) { if (d > 1e-3) { px = c.x + dx * lim / d; pz = c.z + dz * lim / d; } else px = c.x + lim; moved = true; }
      }
      if (!moved) break;
    }
    return { x: px, z: pz };
  };
}

/**
 * Moves an eye out of every tree it stands in (trunk or crown, with `margin` to spare), sideways to the nearest edge of the box (the camera of a glide
 * back to the player's own view and the settled raid prompt have no director behind them). The height is kept; ground cover is ignored. Pure (tested).
 */
export function eyeOutOfTrees(eye: { x: number; y: number; z: number }, trees: readonly Box[], ground: (x: number, z: number) => number, margin = 0.15): { x: number; y: number; z: number } {
  const solid = (b: Box, x: number, z: number): boolean => {
    if (b.kind !== 'tree') return false;
    const up = eye.y - ground(x, z);
    return up < b.h + margin && up > (b.y0 ?? 0) - margin && x > b.x0 - margin && x < b.x1 + margin && z > b.z0 - margin && z < b.z1 + margin;
  };
  let x = eye.x, z = eye.z;
  for (let pass = 0; pass < 8; pass++) {
    const b = trees.find(t => solid(t, x, z));
    if (!b) break;
    // the four ways out of the box (grown by the margin), nearest first; take the nearest that does not land in another tree
    const e = 1e-3, outs: Array<[number, number, number]> = [
      [x - (b.x0 - margin), b.x0 - margin - e, z], [b.x1 + margin - x, b.x1 + margin + e, z],
      [z - (b.z0 - margin), x, b.z0 - margin - e], [b.z1 + margin - z, x, b.z1 + margin + e],
    ];
    outs.sort((p, q) => p[0] - q[0]);
    const pick = outs.find(o => !trees.some(t => solid(t, o[1], o[2]))) ?? outs[0];
    x = pick[1]; z = pick[2];
  }
  return { x, y: eye.y, z };
}
