/**
 * The graded pad under a big dome (glass and arcology): the shell stands level, so the ground under its square footprint is cut on the uphill side and
 * filled on the downhill side to one level (the mean of the natural ground, which balances cut and fill on a plane), and a retaining wall holds the cut
 * and the fill where the step is tall (sim/retainPlan; the world builds it). This module is the pure part: the cut and fill volumes in cubic yards, the
 * wall face in square feet, and what the earthwork costs. Pure (tested in grading.test.ts). 1 world unit = 20 ft.
 *
 * Prices are 2025 dollars, owner-set tunables [D]: ordinary site work is about $4 to $10 a yard to cut and load, $8 to $15 a yard to place and compact
 * in lifts, and $15 to $35 a yard to haul the part that does not balance; a dry-stack or concrete retaining wall about $40 to $80 a square foot of face.
 */
import { FT_PER_UNIT } from './standing';
import type { DomeTier } from './tiers';

/** Only the big two are graded: a berm shell or a hut takes the hill as it comes. */
export const GRADED_TIERS: readonly DomeTier[] = ['glass', 'arcology'];
export const isGradedTier = (t: DomeTier | null): boolean => t !== null && GRADED_TIERS.includes(t);

export const GRADING = {
  cutUsdCy: 7, fillUsdCy: 11, haulUsdCy: 24, wallUsdSf: 60,
  /** Cubic yards one machine spread moves in an hour (dozer, loader and trucks together). */
  cyPerHour: 45,
  /** A step in the pad shorter than this (ft) is just a graded edge; taller gets a retaining wall. */
  wallMinFt: 1.5,
} as const;

export type Height = (x: number, z: number) => number;
export interface Square { x: number; z: number; half: number }

export interface Grade {
  /** The pad level (world units, the mean natural height) and how far the highest and lowest natural ground stand off it (ft). */
  level: number; hiFt: number; loFt: number;
  cutCy: number; fillCy: number;
  /** Face of retaining wall needed round the pad, square feet. */
  wallSf: number;
  areaSf: number;
}

/** Cut and fill under a square pad, sampled on an n x n grid (cell-centered, exact for a plane). */
export function gradeSquare(sq: Square, natural: Height, n = 24): Grade {
  const side = sq.half * 2, step = side / n, cellSf = (step * FT_PER_UNIT) ** 2;
  const hs: number[] = [];
  let sum = 0, hi = -Infinity, lo = Infinity;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const h = natural(sq.x - sq.half + (i + 0.5) * step, sq.z - sq.half + (j + 0.5) * step); hs.push(h); sum += h; hi = Math.max(hi, h); lo = Math.min(lo, h); }
  const level = sum / hs.length;
  let cut = 0, fill = 0;
  for (const h of hs) { const dFt = (h - level) * FT_PER_UNIT; if (dFt > 0) cut += dFt * cellSf / 27; else fill += -dFt * cellSf / 27; }
  // the wall: along each side, where the natural ground stands off the level by more than a graded edge, face = height x length
  let wallSf = 0;
  const m = Math.max(8, Math.round(n * 1.5)), seg = side * FT_PER_UNIT / m;
  const edge = (x: number, z: number) => Math.abs(natural(x, z) - level) * FT_PER_UNIT;
  for (let k = 0; k < m; k++) {
    const t = -sq.half + (k + 0.5) * side / m;
    for (const [x, z] of [[sq.x + t, sq.z - sq.half], [sq.x + t, sq.z + sq.half], [sq.x - sq.half, sq.z + t], [sq.x + sq.half, sq.z + t]]) { const h = edge(x, z); if (h >= GRADING.wallMinFt) wallSf += h * seg; }
  }
  return { level, hiFt: (hi - level) * FT_PER_UNIT, loFt: (level - lo) * FT_PER_UNIT, cutCy: Math.round(cut), fillCy: Math.round(fill), wallSf: Math.round(wallSf), areaSf: Math.round(side * side * FT_PER_UNIT ** 2) };
}

export interface GradingBill { usd: number; hours: number; lines: Array<{ label: string; usd: number }> }

/** What the earthwork costs: cut, fill, hauling the part that does not balance, and the wall face. Never falls as any volume grows (property test). */
export function gradingCost(g: Pick<Grade, 'cutCy' | 'fillCy' | 'wallSf'>): GradingBill {
  const cut = g.cutCy * GRADING.cutUsdCy, fill = g.fillCy * GRADING.fillUsdCy, haul = Math.abs(g.cutCy - g.fillCy) * GRADING.haulUsdCy, wall = g.wallSf * GRADING.wallUsdSf;
  const lines = [
    { label: `Cut ${g.cutCy.toLocaleString('en-US')} cu yd`, usd: cut },
    { label: `Fill ${g.fillCy.toLocaleString('en-US')} cu yd`, usd: fill },
    { label: `Haul ${Math.abs(g.cutCy - g.fillCy).toLocaleString('en-US')} cu yd`, usd: haul },
    { label: `Retaining wall ${g.wallSf.toLocaleString('en-US')} sq ft`, usd: wall },
  ].filter(l => l.usd > 0).map(l => ({ ...l, usd: Math.round(l.usd) }));
  return { usd: lines.reduce((a, l) => a + l.usd, 0), hours: Math.ceil((g.cutCy + g.fillCy) / GRADING.cyPerHour), lines };
}

/** The line the placing card shows: what is moved and what it costs, or that the ground is level enough. */
export function gradingLine(g: Grade, bill: GradingBill = gradingCost(g)): string {
  if (bill.usd === 0) return 'Level ground: no earthwork';
  const wall = g.wallSf ? `, ${g.wallSf.toLocaleString('en-US')} sq ft of retaining wall` : '';
  return `Site work: ${(g.cutCy + g.fillCy).toLocaleString('en-US')} cu yd moved${wall}, $${bill.usd.toLocaleString('en-US')}`;
}

/** The half side of the square pad under a dome of `cells` build cells across (world units): its footprint. */
export const padHalf = (cells: number): number => cells * 0.5 / 2;
