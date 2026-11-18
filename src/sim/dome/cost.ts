/**
 * What a dome costs and how long it takes (docs/DOME_COMPOUND.md 4.1). The shell, air plant, airlocks and fit-out are kits the contractor
 * sells and erects (`MATERIALS.dome_*`); the footing is concrete and rebar the family buys; the rest is crew labor on site at the shop rate.
 * Pure (tested). Everything scales from the geometry, so a different diameter is a different bill with no new table.
 */
import { MATERIALS, type MaterialId } from '../materials';
import { CELL_FT, TIER, shellFt, type DomeTier } from './tiers';
import { domeGeometry } from './geometry';
/** The shop's crew wage and a crew's week (sim/crews.ts has the same two numbers; a test holds them equal: importing crews here would make a cycle through the blueprints). */
export const CREW_RATE = 60, CREW_WEEK = 4 * 9 * 5;

export type Bill = Partial<Record<MaterialId, number>>;
export interface DomeStages { site: Bill; foundation: Bill; frame: Bill; roof: Bill; finish: Bill }

const SHELL_GOOD: Record<DomeTier, MaterialId> = { earthen: 'dome_earthbag', geodesic: 'dome_geodesic_kit', glass: 'dome_glass_kit', arcology: 'dome_arcology_kit' };
/** Square feet one unit of each shell good covers. */
const SHELL_UNIT: Record<DomeTier, number> = { earthen: 100, geodesic: 1000, glass: 1000, arcology: 1000 };

export interface DomeCost {
  tier: DomeTier;
  cells: number;
  diameterFt: number;
  stages: DomeStages;
  /** Whole bill, by good. */
  bill: Bill;
  /** What the goods cost at list. */
  materialsUsd: number;
  /** Crew wages for the on-site hours. */
  laborUsd: number;
  permitUsd: number;
  /** Goods + labor + permit. */
  totalUsd: number;
  hours: number;
  /** Weeks one crew would take / with `crews` crews (the shell cure is a floor). */
  crewWeeks: number;
  /** Skirt concrete (cu yd) and its depth (ft). */
  skirtYd: number;
  skirtFt: number;
}

const ceil = Math.ceil;
export const billUsd = (b: Bill): number => (Object.entries(b) as Array<[MaterialId, number]>).reduce((a, [m, n]) => a + (MATERIALS[m].price ?? 0) * n, 0);
const sum = (...bs: Bill[]): Bill => { const o: Bill = {}; for (const b of bs) for (const [m, n] of Object.entries(b) as Array<[MaterialId, number]>) o[m] = (o[m] ?? 0) + n; return o; };

/** The bill for a dome `cells` across (default size when omitted). `skirtFt` overrides the tier's skirt depth (a deeper skirt costs concrete). */
export function domeCost(tier: DomeTier, cells: number = TIER[tier].cells, o: { skirtFt?: number; airlocks?: number } = {}): DomeCost {
  const t = TIER[tier], d = shellFt(tier, cells), g = domeGeometry(tier, d);
  const skirtFt = o.skirtFt ?? t.skirtFt, airlocks = o.airlocks ?? t.airlocks;
  const shellN = ceil(g.surfaceSf / SHELL_UNIT[tier]);
  const frameN = ceil(shellN * 0.6), roofN = shellN - frameN;
  const skirtYd = ceil(g.ringFt * skirtFt * t.skirtThickFt / 27);
  const stemYd = ceil(g.ringFt * 2 * 2 / 27);
  const concrete = skirtYd + stemYd;
  const stages: DomeStages = {
    site: {},
    foundation: { concrete, rebar: ceil(concrete / 6) },
    frame: { [SHELL_GOOD[tier]]: frameN },
    roof: { [SHELL_GOOD[tier]]: roofN },
    finish: tier === 'earthen' ? { hardware: 2 } : { dome_air_plant: ceil(g.volumeCf / 10000), dome_airlock: airlocks, dome_fitout: ceil(g.footprintSf / 1000) },
  };
  // an earthen dome is built from the family's own land: its stages have nothing to buy but the shell
  const bill = sum(stages.site, stages.foundation, stages.frame, stages.roof, stages.finish);
  const hours = t.hours * (g.footprintSf / domeGeometry(tier, shellFt(tier, t.cells)).footprintSf) ** 0.9;
  const materialsUsd = billUsd(bill), laborUsd = Math.round(hours * CREW_RATE / 100) * 100;
  return { tier, cells, diameterFt: d, stages, bill, materialsUsd, laborUsd, permitUsd: t.permitFee, totalUsd: materialsUsd + laborUsd + t.permitFee, hours: Math.round(hours), crewWeeks: Math.max(1, ceil(hours / CREW_WEEK)), skirtYd: concrete, skirtFt };
}

/** Weeks with `crews` crews on it: more crews cut the labor weeks but never the cure floor (the shell, the glazing set). */
export function buildWeeks(c: DomeCost, crews: number): number {
  const floor = { earthen: 6, geodesic: 12, glass: 44, arcology: 104 }[c.tier];
  return Math.max(floor, ceil(c.hours / (CREW_WEEK * Math.max(1, crews))));
}

/** Who can build one by hand: a family with no crews can only raise the small tiers. */
export const byHandOk = (tier: DomeTier): boolean => tier === 'earthen' || tier === 'geodesic';

export { CELL_FT };
