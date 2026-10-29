/**
 * Terraced garden beds on a slope (docs/DECISIONS.md, "Retaining walls and terraces"). The garden kit (a 9 m square of raised beds) staked on a hillside
 * already gets its own flat pad and a dry-stack wall (sim/retainPlan.ts, priced by the foundation's fieldstone: sim/slope.ts). A terrace plan is just a row of
 * those pads stepped down the fall line, spaced so each has room for its wall, the flat apron behind it and a stair, with nothing to pay but the beds and the
 * walls they need. `planTerraces` plans one for a steep rectangle; `terraceSite` finds the place near the home that suits one best, for the Next-step card to
 * offer (the player confirms; nothing is staked unasked). Pure.
 */
import { siteLot } from './lotListing';
import { CELL, KIT, footprint, snapCenter } from '../game/buildkit/kit';
import { BLUEPRINTS, isHome } from './blueprints';
import { MATERIALS } from './materials';
import { RW, planPad, type Rect } from './retainPlan';
import { gradeAt, gradeBucket, gradedBlueprint } from './slope';

import type { GameState } from './state';

export const TERRACE = {
  /** A slope this gentle needs no terrace; one steeper makes each wall taller than a stair can serve. */
  MIN_SLOPE: 0.13, MAX_SLOPE: 0.26,
  MAX_TIERS: 3,
  /** Every tier's wall must stand at least this high (m): a gentler slope is better with the plain pad. */
  MIN_WALL_M: 1,
  /** Room left between a tier's wall and the next tier's, beyond the pads and the skirts (u). */
  GAP: 0.35,
  /** Piece the terraces hold. */
  KIND: 'garden',
} as const;

export interface TerraceTier {
  x: number; z: number; rot: 0;
  /** Grade across the footprint (rise over run) and the wall behind its pad (m, m, pallets of fieldstone the foundation pays). */
  grade: number; wallHm: number; wallLenM: number; pallets: number; stairs: number;
}

export interface TerracePlan {
  tiers: TerraceTier[];
  /** The way down: 'x' or 'z', and +1 / -1. */
  axis: 'x' | 'z'; dir: 1 | -1;
  slopePct: number;
  /** Fieldstone the walls cost over level ground (pallets, dollars at the list price) and the extra hours on the pads. */
  pallets: number; usd: number; hours: number; wallM: number;
  /** Why it cannot be done here (null = it can). */
  problem: string | null;
}

const none = (problem: string, slope = 0): TerracePlan => ({ tiers: [], axis: 'z', dir: 1, slopePct: Math.round(slope * 100), pallets: 0, usd: 0, hours: 0, wallM: 0, problem });

/** The pieces already standing or staked, as footprints. */
const placedRects = (s: GameState): Rect[] => s.structures.filter(st => !st.unplaced && KIT[st.kind] && KIT[st.kind].level !== 'underground').map(st => footprint(KIT[st.kind], st.x, st.z, st.rot));

const overlap = (a: Rect, b: Rect, m = 0): boolean => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.z0 < b.z1 + m && a.z1 > b.z0 - m;

/** Distance between tier centres along the fall (u): the bed, its pad edge, the apron behind the next one, both skirts and the gap. */
export function tierSpacing(): number {
  const def = KIT[TERRACE.KIND];
  const raw = Math.max(def.cellsX, def.cellsZ) * CELL + 2 * RW.EDGE + RW.APRON + 2 * RW.SKIRT + TERRACE.GAP;
  return Math.ceil(raw / CELL - 1e-9) * CELL;     // on the build grid, so snapping the beds never brings them closer
}

/**
 * Plan stepped garden terraces down a steep rectangle: two or three beds one below the other, along whichever axis the ground falls, each snapped to the
 * build grid, each with a wall plan (and its stair), priced by the same graded foundation as any building on a slope. Null problem = it works.
 */
export function planTerraces(s: GameState, rect: Rect, maxTiers: number = TERRACE.MAX_TIERS): TerracePlan {
  const lot = siteLot(s.site);
  if (!lot) return none('there is no slope on this ground');
  const f = lot.field.h, def = KIT[TERRACE.KIND], cx = (rect.x0 + rect.x1) / 2, cz = (rect.z0 + rect.z1) / 2;
  let gx = 0, gz = 0, n = 0;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
    const x = rect.x0 + (rect.x1 - rect.x0) * i / 4, z = rect.z0 + (rect.z1 - rect.z0) * j / 4, e = 0.5;
    gx += (f(x + e, z) - f(x - e, z)) / (2 * e); gz += (f(x, z + e) - f(x, z - e)) / (2 * e); n++;
  }
  gx /= n; gz /= n;
  const slope = Math.hypot(gx, gz);
  if (slope < TERRACE.MIN_SLOPE) return none('the ground is too gentle to need terraces', slope);
  if (slope > TERRACE.MAX_SLOPE) return none('the ground is too steep for a bed on each step: the walls would be over three metres', slope);
  const axis: 'x' | 'z' = Math.abs(gx) >= Math.abs(gz) ? 'x' : 'z', dir: 1 | -1 = (axis === 'x' ? gx : gz) > 0 ? -1 : 1;   // downhill
  const S = tierSpacing(), L = axis === 'x' ? rect.x1 - rect.x0 : rect.z1 - rect.z0, depth = Math.max(def.cellsX, def.cellsZ) * CELL;
  const count = Math.min(maxTiers, Math.floor((L - depth) / S) + 1);
  if (count < 2) return none('there is not room for two terraces in that stretch of hill', slope);
  const home = s.site.home, others = placedRects(s), tiers: TerraceTier[] = [];
  let pallets = 0, hours = 0, wallM = 0;
  for (let i = 0; i < count; i++) {
    const off = (i - (count - 1) / 2) * S * dir;
    const [x, z] = snapCenter(def, axis === 'x' ? cx + off : cx, axis === 'z' ? cz + off : cz, 0), fp = footprint(def, x, z, 0);
    if (fp.x0 < home.x0 + 1 || fp.z0 < home.z0 + 1 || fp.x1 > home.x1 - 1 || fp.z1 > home.z1 - 1) return none('the terraces would run off your land', slope);
    if (others.some(o => overlap(fp, o, 0.4))) return none('something is already standing there', slope);
    const grade = gradeAt(s.site, x, z, 0.8);
    if (grade > def.maxSlope) return none('the ground is too steep for a bed there', slope);
    const plan = planPad(fp, f, others);
    const b = gradeBucket(grade), bp = BLUEPRINTS[TERRACE.KIND], gb = b > 0 ? gradedBlueprint(bp, grade) : bp;
    const stone = (gb.stages.find(st => st.id === 'foundation')?.materials.fieldstone ?? 0) - (bp.stages.find(st => st.id === 'foundation')?.materials.fieldstone ?? 0);
    pallets += stone;
    hours += gb.stages.reduce((a, st) => a + st.hours, 0) - bp.stages.reduce((a, st) => a + st.hours, 0);
    wallM += plan.lenU * RW.M;
    tiers.push({ x, z, rot: 0, grade, wallHm: Math.round(plan.maxH * RW.M * 10) / 10, wallLenM: Math.round(plan.lenU * RW.M), pallets: stone, stairs: plan.stairs.length });
    others.push(fp);
  }
  if (tiers.some(t => t.wallHm > RW.STAIR_MAX_H * RW.M)) return none('the walls would be over three metres', slope);
  if (tiers.some(t => t.wallHm < TERRACE.MIN_WALL_M)) return none('the slope is too gentle for terraces to show', slope);
  return { tiers, axis, dir, slopePct: Math.round(slope * 100), pallets, usd: pallets * (MATERIALS.fieldstone.price ?? 0), hours: Math.round(hours), wallM: Math.round(wallM), problem: null };
}

const memo = new WeakMap<object, { sig: number; plan: TerracePlan | null }>();

/**
 * The best place near the home for terraced beds: scanned across the home block, nearest the home and cheapest in walls, or null (no relief, no suitable
 * slope, or terraces already laid: a place with two or more gardens needs no card). Cached.
 */
export function terraceSite(s: GameState): TerracePlan | null {
  const lot = siteLot(s.site);
  if (!lot) return null;
  let sig = s.structures.length;
  for (const st of s.structures) sig = (sig * 31 + st.x * 7 + st.z * 13 + st.stage + st.id.length) % 1000000007;
  const have = memo.get(s.structures);
  if (have && have.sig === sig) return have.plan;
  let best: TerracePlan | null = null;
  const gardens = s.structures.filter(st => st.kind === TERRACE.KIND && !st.unplaced).length;
  const homes = s.structures.filter(st => isHome(st.kind) && !st.unplaced);
  if (gardens < 2 && homes.length) {
    const h = s.site.home, at = homes[0], R = 4.5;
    let bestScore = Infinity;
    for (let x = h.x0 + R + 1; x <= h.x1 - R - 1; x += 3) for (let z = h.z0 + R + 1; z <= h.z1 - R - 1; z += 3) {
      const d = Math.hypot(x - at.x, z - at.z);
      if (d > 40 || d < 6) continue;
      const plan = planTerraces(s, { x0: x - R, z0: z - R, x1: x + R, z1: z + R });
      if (plan.problem || plan.tiers.length < 2) continue;
      const score = d + 0.4 * plan.pallets;
      if (score < bestScore) { bestScore = score; best = plan; }
    }
  }
  memo.set(s.structures, { sig, plan: best });
  return best;
}

/** Plain words for the plan, for the Next-step card. */
export function terraceText(p: TerracePlan): string {
  const walls = p.tiers.map(t => `${t.wallHm} m`).join(', ');
  return `a ${p.slopePct} % slope: ${p.tiers.length} garden beds stepped down it, each on its own flat terrace held by a dry-stack wall (${p.wallM} m of wall in all, up to ${Math.max(...p.tiers.map(t => t.wallHm))} m high, a stair set in each) instead of one bed on the hill. The walls are the foundation's fieldstone: about ${p.pallets} pallets over the price of level ground, and ${p.hours} more hours on the pads (wall heights ${walls}).`;
}
