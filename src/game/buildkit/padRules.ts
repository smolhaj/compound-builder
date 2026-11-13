/**
 * Pad-aware placement (docs/DECISIONS.md, "Pad-aware placement"): a building on a slope is built on a flat pad, with a flat apron on the sides that
 * carry a retaining wall (sim/retainPlan.ts). Two buildings a few metres apart on a hillside therefore want pads that overlap at different levels:
 * one pad would bury or float the other's wall. This module finds that before the stakes go in, and suggests the nearest spot where the pads clear
 * each other or share a level. Pure: it plans each pad from the natural ground, as the world does when it grades them.
 */
import { KIT, footprint, type KitPieceDef, type Placed } from './kit';
import { isUnderground } from './underground';
import { RW, WALLLESS, planPad, wallAt, type Natural, type PadPlan, type Rect } from '../../sim/retainPlan';
import { lengthText } from '../../sim/units';

/** Pads that stand at levels this far apart (u, 45 cm) cannot share ground. */
export const LEVEL_APART = RW.MIN_H;

export interface PadClash {
  /** The building whose pad is in the way. */
  other: Placed;
  /** Level of the other pad minus ours (u; positive: it stands higher). */
  dy: number;
  /** The overlap (u^2). */
  overlap: number;
  /** The pad would flatten the retaining wall of the other (its slab stands inside our pad), whatever the two levels are. */
  wall?: boolean;
}

const overlapArea = (a: Rect, b: Rect): number => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));

/** Kinds that take no graded pad of their own (below ground, or laid with the wall or the drive). */
const noPad = (d: KitPieceDef): boolean => isUnderground(d) || WALLLESS.test(d.id);

/** The pad (rectangle with its apron, and its level) a piece would get on the natural ground `h`. */
export function padOf(def: KitPieceDef, x: number, z: number, rot: number, h: Natural): { rect: Rect; y: number; plan: PadPlan } | null {
  if (noPad(def)) return null;
  const plan = planPad(footprint(def, x, z, rot), h);
  return { rect: plan.rect, y: plan.y, plan };
}

/** Does the slab of this plan's retaining wall stand anywhere inside the rect? A pad graded over it would leave the wall (drawn from the old ground) buried or hovering. */
function wallInside(plan: PadPlan, r: Rect): boolean {
  if (!plan.runs.length) return false;
  const nx = Math.max(2, Math.min(24, Math.ceil((r.x1 - r.x0) / 0.1))), nz = Math.max(2, Math.min(24, Math.ceil((r.z1 - r.z0) / 0.1)));
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) if (wallAt(plan, r.x0 + (r.x1 - r.x0) * i / nx, r.z0 + (r.z1 - r.z0) * j / nz, 0.08) >= RW.MIN_H) return true;
  return false;
}

/** The graded pad of a piece we are about to stake against the pads of those already standing, or null when they leave each other alone. */
export function padClash(def: KitPieceDef, x: number, z: number, rot: number, h: Natural, placed: readonly Placed[]): PadClash | null {
  const mine = padOf(def, x, z, rot, h);
  if (!mine) return null;
  let worst: PadClash | null = null;
  for (const p of placed) {
    const od = KIT[p.kind];
    if (!od) continue;
    const theirs = padOf(od, p.x, p.z, p.rot, h);
    if (!theirs) continue;
    const dy = theirs.y - mine.y, area = overlapArea(mine.rect, theirs.rect);
    if (area > 1e-4 && Math.abs(dy) >= LEVEL_APART && (!worst || area > worst.overlap)) worst = { other: p, dy, overlap: area };
    // a neighbour's retaining wall stands where our pad would be graded flat (even at the same level): the wall would be buried in our floor or stand on nothing
    else if (!worst && wallInside(theirs.plan, mine.rect)) worst = { other: p, dy, overlap: 0, wall: true };
  }
  return worst;
}

/** The sentence the placement tool shows. `snapM` is how far the suggested spot is (null: none found nearby). */
export function clashText(c: PadClash, snapM: number | null): string {
  const name = (KIT[c.other.kind]?.name ?? c.other.kind).toLowerCase();
  if (c.wall) return `Its graded pad would run over the retaining wall of the ${name}.${snapM === null ? ' Move it clear of the wall.' : ` Press S to snap to the nearest clear spot (${lengthText(snapM)} away).`}`;
  const m = Math.round(Math.abs(c.dy) * RW.M * 10) / 10;
  return `Its graded pad would cut into the pad of the ${name}, which stands ${lengthText(m)} ${c.dy > 0 ? 'higher' : 'lower'}.${snapM === null ? ' Move it clear, up or down the slope.' : ` Press S to snap to the nearest clear spot (${lengthText(snapM)} away).`}`;
}

/**
 * The nearest spot to (x, z), on the build grid, where the pad clears every other pad (or stands at its level) and nothing else is wrong with the
 * spot (`otherwise` returns a problem or null). Searched in growing rings out to `maxR` units.
 */
export function padSnap(def: KitPieceDef, x: number, z: number, rot: number, h: Natural, placed: readonly Placed[], snap: (x: number, z: number) => [number, number], otherwise: (x: number, z: number) => boolean, maxR = 5): [number, number] | null {
  for (let r = 0.5; r <= maxR; r += 0.5) {
    const n = Math.max(8, Math.ceil(2 * Math.PI * r / 0.5));
    let best: [number, number] | null = null, bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const [sx, sz] = snap(x + Math.cos(a) * r, z + Math.sin(a) * r);
      const d = Math.hypot(sx - x, sz - z);
      if (d >= bestD || !otherwise(sx, sz)) continue;
      if (!padClash(def, sx, sz, rot, h, placed)) { best = [sx, sz]; bestD = d; }
    }
    if (best) return best;
  }
  return null;
}
