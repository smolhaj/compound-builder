/**
 * The domed compound (docs/DOME_COMPOUND.md, owner decisions of 2026-11-17): four enclosure tiers, one table.
 *
 *   earthen    the cheap rung: an earthbag and plaster dome with a sod roof, one door. A summer kitchen, a hideout.
 *   geodesic   T1: a steel-and-aluminum geodesic frame glazed in twin-wall polycarbonate and film, set into a berm, with a buried skirt.
 *   glass      T2: a steel gridshell with laminated glass on a concrete ring beam, the glass-and-steel conservatory over a whole yard.
 *   arcology   T3: the sci-fi tier (owner decision 4): a space frame skinned in clear polycarbonate-composite panels that stop rifle fire,
 *              rockets and shrapnel. Lean into the fiction here; T1 and T2 stay real materials.
 *
 * Every number is a tunable in `DOME`. Pure (no state, no THREE), tested in dome.test.ts. Sizes are footprints in build cells (a cell is
 * 0.5 world units, nominally 10 ft); a dome is a circle inscribed in its square footprint.
 */

export type DomeTier = 'earthen' | 'geodesic' | 'glass' | 'arcology';
export const DOME_TIERS: readonly DomeTier[] = ['earthen', 'geodesic', 'glass', 'arcology'];

/** The kit piece id of each tier. */
export const DOME_KIND: Record<DomeTier, string> = { earthen: 'dome_earthen', geodesic: 'dome_geodesic', glass: 'dome_glass', arcology: 'dome_arcology' };
export const DOME_KINDS: readonly string[] = DOME_TIERS.map(t => DOME_KIND[t]);
export const tierOfKind = (kind: string): DomeTier | null => DOME_TIERS.find(t => DOME_KIND[t] === kind) ?? null;
export const isDomeKind = (kind: string): boolean => tierOfKind(kind) !== null;

/** Nominal feet in a build cell (the Build tab says "footprint N x N ft" the same way). */
export const CELL_FT = 10;

export interface TierSpec {
  tier: DomeTier;
  name: string;
  /** Footprint (cells across) of the default size. */
  cells: number;
  /** Height of the shell over its span: 0.5 is a hemisphere. */
  heightRatio: number;
  /** Depth of the buried skirt (ft): the footing wall that keeps tunnelers from digging under the shell. */
  skirtFt: number;
  /** Skirt thickness (ft of concrete). */
  skirtThickFt: number;
  /** Width of the earth berm banked round the shell inside the footprint (ft each side): the footprint is the shell plus its berm. */
  bermFt: number;
  /** Person-airlocks fitted (the only openings people use). */
  airlocks: number;
  /** Hand and crew labor on site (person-hours); the supplier's erectors are in the kit's price. */
  hours: number;
  /** County permit fee (2025 dollars) and review time (days, before the county strictness factor). Zero fee: none. */
  permitFee: number;
  reviewDays: number;
  /** Cash the family must hold to stake the dome: the Founder and Magnate classes of owner decision 5. Zero: always open. */
  gateUsd: number;
  /** Who it is for, in one clause, for the hover card. */
  blurb: string;
}

export const TIER: Record<DomeTier, TierSpec> = {
  earthen: { tier: 'earthen', bermFt: 0, name: 'Earthen dome', cells: 2, heightRatio: 0.5, skirtFt: 4, skirtThickFt: 1, airlocks: 0, hours: 700, permitFee: 0, reviewDays: 0, gateUsd: 0,
    blurb: 'A 20 ft earthbag-and-plaster dome with a sod crown and one low door: a cool summer kitchen, a storm room, a hideout that looks like a haystack.' },
  geodesic: { tier: 'geodesic', bermFt: 5, name: 'Geodesic dome', cells: 7, heightRatio: 0.5, skirtFt: 20, skirtThickFt: 2, airlocks: 2, hours: 6000, permitFee: 2800, reviewDays: 30, gateUsd: 0,
    blurb: 'A 60 ft geodesic dome of steel struts glazed in twin-wall polycarbonate, berm-footed, two airlocks: one climate under one skin, frost-free greens all winter.' },
  glass: { tier: 'glass', bermFt: 0, name: 'Glass & steel dome', cells: 15, heightRatio: 0.5, skirtFt: 30, skirtThickFt: 3, airlocks: 3, hours: 40000, permitFee: 24000, reviewDays: 120, gateUsd: 5_000_000,
    blurb: 'A 150 ft steel gridshell glazed in laminated glass on a concrete ring beam: a conservatory over a whole yard, house, beds and well. Needs Founder money and an engineer\'s stamp.' },
  arcology: { tier: 'arcology', bermFt: 0, name: 'Arcology dome', cells: 36, heightRatio: 0.5, skirtFt: 60, skirtThickFt: 4, airlocks: 6, hours: 150000, permitFee: 180000, reviewDays: 420, gateUsd: 60_000_000,
    blurb: 'A 360 ft space-frame dome of clear polycarbonate-composite panels that rifle fire, rockets and shrapnel cannot get through. A small town under a sky of its own. Magnate money, a contractor firm and about a year of review.' },
};

/** The footprint (cells across) a family may stake: the default only in this slice; the cost model is general. */
export const defaultCells = (t: DomeTier): number => TIER[t].cells;
export const diameterFt = (cells: number): number => cells * CELL_FT;
/** The shell's own diameter (ft): the footprint less the berm banked on each side. */
export const shellFt = (tier: DomeTier, cells: number): number => cells * CELL_FT - 2 * TIER[tier].bermFt;

/** The tier's order: a higher tier never has a lower rank (property tests lean on it). */
export const tierRank = (t: DomeTier): number => DOME_TIERS.indexOf(t);
