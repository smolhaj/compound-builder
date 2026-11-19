/**
 * Dome pricing (owner request 2026-11-19: "prohibitively expensive for most people except billionaires"; docs/design/dome_pricing.md has the audit table).
 * The pure part: the earthwork under a dome (the crater, rock, shoring, dewatering, the skirt's formwork and placement), the span factor of a big shell,
 * and the running cost a year. 2025 U.S. dollars. Every number marked PROPOSED is a new rule awaiting the owner's sign-off (docs/DECISIONS.md).
 *
 * This module must not import `standing.ts` or `grading.ts` (they reach the blueprints, and the blueprints read `cost.ts`, which reads this): the
 * cut, fill and haul rates live here and `grading.ts` re-exports them, so there is one set of numbers.
 */
import { MATERIALS } from '../materials';
import { TIER, shellFt, type DomeTier } from './tiers';
import { pitShape, pitVolumeCy, STRATA } from './dig';

/** Ordinary site work, 2025 dollars: cut and load about $4 to $10 a yard, place and compact in lifts $8 to $15, haul and dump $15 to $35 (these are the old grading.ts rates, unchanged). */
export const EARTH_RATES = { cutUsdCy: 7, fillUsdCy: 11, haulUsdCy: 24 } as const;

export const DOME_PRICING = {
  /** PROPOSED. Share of the crater's spoil trucked off the site (the rest is stockpiled beside the pit and put back as backfill); the backfill is placed and compacted in lifts. */
  haulOffShare: 0.35, backfillShare: 0.9,
  /** PROPOSED. Extra a yard for weathered rock below the strata line (rippers, hydraulic hammer, some blasting): real 2025 rock excavation runs $30 to $80 a yard over common earth. */
  rockPremiumUsdCy: 45,
  /** PROPOSED. Pit wall below this depth (ft) needs a soil-nail and shotcrete face or soldier piles and lagging: real 2025 $50 to $100 a square foot of wall face. */
  shoreFromFt: 20, shoreUsdSf: 70,
  /** PROPOSED. Where the water table stands (ft down; the skirt cutaway draws it at the same depth), a deep well every `wellSpacingFt` round the rim, and a well-month (install, pump, power, discharge permit). */
  waterTableFt: 28, wellSpacingFt: 40, wellMonthUsd: 5500,
  /** PROPOSED. Formwork, concrete pump, placing the steel, finishing and the special inspector, a cubic yard of skirt (the concrete and rebar are bought separately). Real 2025 deep formed wall, in place and all in, runs $700 to $1,400 a yard. */
  skirtWorkUsdCy: 650,
  /** PROPOSED. A bigger clear span needs a heavier frame: the shell kit's area is scaled by (diameter / tier's usual diameter) ^ this, held to 0.75 to 1.4. */
  spanExp: { earthen: 0, geodesic: 0, glass: 0.5, arcology: 0.5 } as Record<DomeTier, number>,
  spanMin: 0.75, spanMax: 1.4,
} as const;

/** PROPOSED. The county permit scales with the job: about 1 percent of the build price (plan review, impact and environmental fees), never under the tier's old flat fee (`TIER[tier].permitFee`). */
export const PERMIT_SHARE = 0.01;
export const domePermitUsd = (flatUsd: number, buildUsd: number): number => (flatUsd > 0 ? Math.max(flatUsd, Math.round(buildUsd * PERMIT_SHARE / 1000) * 1000) : 0);

/** Cubic yards of concrete in the skirt and its stem (the rule `domeCost` has always used). */
export const skirtCy = (ringFt: number, skirtFt: number, thickFt: number): number => Math.ceil(ringFt * skirtFt * thickFt / 27) + Math.ceil(ringFt * 2 * 2 / 27);

/** The heavier frame of a wide shell (1 at the tier's usual diameter). */
export function spanFactor(tier: DomeTier, cells: number): number {
  const e = DOME_PRICING.spanExp[tier];
  if (!e) return 1;
  const f = (shellFt(tier, cells) / shellFt(tier, TIER[tier].cells)) ** e;
  return Math.max(DOME_PRICING.spanMin, Math.min(DOME_PRICING.spanMax, f));
}

export interface EarthLine { id: 'dig' | 'rock' | 'shoring' | 'dewater' | 'skirtwork'; label: string; good: 'dome_dig' | 'dome_rock' | 'dome_shoring' | 'dome_dewater' | 'dome_skirtwork'; qty: number; usd: number }
export interface Earthwork {
  pitCy: number; rockCy: number; faceSf: number; wells: number; wellMonths: number; skirtCy: number;
  lines: EarthLine[]; usd: number;
}
const FT_PER_UNIT = 20;

/**
 * The civil work of a dome of `tier` `cells` across: dig the crater to the skirt's depth, rock in the pit, the shored wall, dewatering when the pit floor is
 * below the water table (`waterFt`, the cutaway's 28 ft unless the caller knows better), the skirt's formwork and placement. An earthen dome is dug by hand (no
 * lines). The quantities are whole units of the dome_* work goods (the blueprints order them); `usd` prices them at the goods' list price.
 */
export function earthwork(tier: DomeTier, cells: number, o: { waterFt?: number; skirtFt?: number } = {}): Earthwork {
  const none: Earthwork = { pitCy: 0, rockCy: 0, faceSf: 0, wells: 0, wellMonths: 0, skirtCy: 0, lines: [], usd: 0 };
  if (tier === 'earthen') return none;
  const t = TIER[tier], P = DOME_PRICING, depthFt = o.skirtFt ?? t.skirtFt, s = pitShape(tier, cells);
  const pit = pitVolumeCy(s, depthFt / FT_PER_UNIT);
  const rockFrom = STRATA.find(x => x.id === 'rock')!.fromFt;
  const rock = depthFt > rockFrom ? pit - pitVolumeCy(s, rockFrom / FT_PER_UNIT) : 0;
  // the shored face: the crater's wall below `shoreFromFt`, on its slope (a 2:1 riser: 12 percent longer than straight down), round the work floor
  const face = depthFt > P.shoreFromFt ? 2 * Math.PI * s.rWork * FT_PER_UNIT * (depthFt - P.shoreFromFt) * 1.12 : 0;
  const waterFt = o.waterFt ?? P.waterTableFt, head = depthFt - waterFt;
  const wells = head > 0 ? Math.ceil(2 * Math.PI * s.rTop * FT_PER_UNIT / P.wellSpacingFt * Math.min(1, Math.max(0.25, head / 10))) : 0;
  const months = head > 0 ? Math.ceil(4 + head / 4) : 0;
  const cy = Math.round(pit), sk = skirtCy(2 * Math.PI * (shellFt(tier, cells) / 2), depthFt, t.skirtThickFt);
  const line = (id: EarthLine['id'], good: EarthLine['good'], label: string, qty: number): EarthLine => ({ id, good, label, qty, usd: Math.round(qty * (MATERIALS[good].price ?? 0)) });
  const lines = [
    line('dig', 'dome_dig', `Crater: ${cy.toLocaleString('en-US')} cu yd cut, hauled and put back`, Math.ceil(pit / 100)),
    ...(rock > 0 ? [line('rock', 'dome_rock', `Rock: ${Math.round(rock).toLocaleString('en-US')} cu yd of weathered rock, hammered and ripped`, Math.ceil(rock / 100))] : []),
    ...(face > 0 ? [line('shoring', 'dome_shoring', `Shoring: ${Math.round(face).toLocaleString('en-US')} sq ft of pit wall`, Math.ceil(face / 100))] : []),
    ...(wells > 0 ? [line('dewater', 'dome_dewater', `Dewatering: ${wells} wells for ${months} months`, wells * months)] : []),
    line('skirtwork', 'dome_skirtwork', `Skirt forms, pump and placement: ${sk.toLocaleString('en-US')} cu yd`, sk),
  ];
  return { pitCy: cy, rockCy: Math.round(rock), faceSf: Math.round(face), wells, wellMonths: wells * months, skirtCy: sk, lines, usd: lines.reduce((a, l) => a + l.usd, 0) };
}

/** The earthwork as a bill of goods (what `domeCost` adds to its stages): everything but the skirt's work in the site stage, the skirt's work in the foundation. */
export function earthworkGoods(e: Earthwork): { site: Partial<Record<EarthLine['good'], number>>; foundation: Partial<Record<EarthLine['good'], number>> } {
  const site: Partial<Record<EarthLine['good'], number>> = {}, foundation: Partial<Record<EarthLine['good'], number>> = {};
  for (const l of e.lines) (l.id === 'skirtwork' ? foundation : site)[l.good] = l.qty;
  return { site, foundation };
}

// ── running cost ──

/**
 * PROPOSED. What a dome costs to keep each year, 2025 dollars, for the audit table and the Projects card (nothing charges it yet: the sim bills only the power,
 * through the utilities). `kwhPeakDay` is the design day (a 20 F night, frost-free mode, plus the always-on house load).
 *   power        peak day x a load factor of 0.55 for the year x the co-op's price (sim/utilities GRID_USD_PER_KWH, $0.14)
 *   maintenance  1.5 percent of the installed value a year: glazing seals and gaskets, steel recoating, pumps, the plant's wear (real facilities run 1 to 3 percent)
 *   insurance    0.6 percent of the installed value: commercial property on a glazed structure with hail and wind (0.4 to 1 percent real)
 *   staff        building engineers at $95,000 loaded: none under the family's own roof, two for a glass dome, twelve for an arcology
 */
export const RUNNING = { loadFactor: 0.55, usdPerKwh: 0.14, maintShare: 0.015, insureShare: 0.006, staffUsd: 95_000, staff: { earthen: 0, geodesic: 0, glass: 2, arcology: 12 } as Record<DomeTier, number> } as const;
export interface Running { kwhPeakDay: number; powerUsd: number; maintenanceUsd: number; insuranceUsd: number; staffUsd: number; totalUsd: number }
export function runningCost(tier: DomeTier, kwhPeakDay: number, installedUsd: number): Running {
  const r = RUNNING;
  const powerUsd = Math.round(kwhPeakDay * 365 * r.loadFactor * r.usdPerKwh / 1000) * 1000;
  const maintenanceUsd = Math.round(installedUsd * r.maintShare / 1000) * 1000, insuranceUsd = Math.round(installedUsd * r.insureShare / 1000) * 1000, staffUsd = r.staff[tier] * r.staffUsd;
  return { kwhPeakDay: Math.round(kwhPeakDay), powerUsd, maintenanceUsd, insuranceUsd, staffUsd, totalUsd: powerUsd + maintenanceUsd + insuranceUsd + staffUsd };
}
