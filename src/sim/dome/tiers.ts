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
/**
 * A dome the player sized is the same piece with its footprint in the kind: `dome_geodesic_9` is a geodesic dome 9 cells across (the tier's default
 * size keeps the plain id, so every saved dome stays valid and nothing needs a migration). Reading the size off the kind means every reader of
 * `KIT[kind]` and `BLUEPRINTS[kind]` sees the right footprint with no second lookup.
 */
const SIZED = /^(dome_(?:earthen|geodesic|glass|arcology))(?:_(\d{1,3}))?$/;
export function parseDomeKind(kind: string): { tier: DomeTier; cells: number | null; base: string } | null {
  const m = SIZED.exec(kind);
  if (!m) return null;
  const tier = DOME_TIERS.find(t => DOME_KIND[t] === m[1])!;
  return { tier, cells: m[2] ? Number(m[2]) : null, base: m[1] };
}
export const tierOfKind = (kind: string): DomeTier | null => parseDomeKind(kind)?.tier ?? null;
export const isDomeKind = (kind: string): boolean => tierOfKind(kind) !== null;
/** Footprint cells of a dome kind: the stored size, else the tier's default (null: not a dome). */
export const cellsOfKind = (kind: string): number | null => { const p = parseDomeKind(kind); return p ? p.cells ?? TIER[p.tier].cells : null; };
/** The kind of a dome of `tier` `cells` across (the plain id at the default size). */
export const kindOfCells = (tier: DomeTier, cells: number): string => { const c = clampCells(tier, cells); return c === TIER[tier].cells ? DOME_KIND[tier] : `${DOME_KIND[tier]}_${c}`; };

/** Nominal feet in a build cell (the Build tab says "footprint N x N ft" the same way). */
export const CELL_FT = 10;

export interface TierSpec {
  tier: DomeTier;
  name: string;
  /** Footprint (cells across) of the default size, and the range the player may choose (the handle). */
  cells: number;
  minCells: number;
  maxCells: number;
  /** Height of the shell over its span: 0.5 is a hemisphere. */
  heightRatio: number;
  /** Depth of the buried skirt (ft): the footing wall that keeps tunnelers from digging under the shell. */
  skirtFt: number;
  /** Skirt thickness (ft of concrete). */
  skirtThickFt: number;
  /** Width of the earth berm banked round the shell inside the footprint (ft each side): the footprint is the shell plus its berm. */
  bermFt: number;
  /** Person airlocks fitted, the public entrances people use (PROPOSED, owner: one entrance, two at most): geodesic 1, glass 1, arcology 2. The main one stands in one gate complex with the vehicle port (sim/dome/vehiclePort.ts); the second (arcology only) stands opposite. The plant's service airlock and link airlocks are not public entrances and are not counted. */
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

/**
 * The reference frame the plant, the yard and the buried sleeves are laid out on (the old person-airlock count: 2, 3 and 6 evenly spread spans). Since the owner cut the public
 * entrances to one or two (TIER.airlocks), the spans are only a frame for the machinery; no door stands on their boundaries any more. PROPOSED (docs/DECISIONS.md 2026-11-19).
 */
export const FRAME_SPANS: Record<DomeTier, number> = { earthen: 1, geodesic: 2, glass: 3, arcology: 6 };

export const TIER: Record<DomeTier, TierSpec> = {
  earthen: { tier: 'earthen', bermFt: 0, name: 'Earthen dome', cells: 2, minCells: 2, maxCells: 4, heightRatio: 0.5, skirtFt: 4, skirtThickFt: 1, airlocks: 0, hours: 700, permitFee: 0, reviewDays: 0, gateUsd: 0,
    blurb: 'A 20 ft earthbag-and-plaster dome with a sod crown and one low door: a cool summer kitchen, a storm room, a hideout that looks like a haystack.' },
  geodesic: { tier: 'geodesic', bermFt: 5, name: 'Geodesic dome', cells: 7, minCells: 4, maxCells: 12, heightRatio: 0.5, skirtFt: 20, skirtThickFt: 2, airlocks: 1, hours: 6000, permitFee: 12000, reviewDays: 30, gateUsd: 0,
    blurb: 'A 60 ft geodesic dome of steel struts glazed in twin-wall polycarbonate, berm-footed, two airlocks: one climate under one skin, frost-free greens all winter.' },
  glass: { tier: 'glass', bermFt: 0, name: 'Glass & steel dome', cells: 15, minCells: 10, maxCells: 24, heightRatio: 0.5, skirtFt: 30, skirtThickFt: 3, airlocks: 1, hours: 40000, permitFee: 350000, reviewDays: 120, gateUsd: 15_000_000,
    blurb: 'A 150 ft steel gridshell glazed in laminated glass on a concrete ring beam: a conservatory over a whole yard, house, beds and well. Needs Founder money and an engineer\'s stamp.' },
  arcology: { tier: 'arcology', bermFt: 0, name: 'Arcology dome', cells: 36, minCells: 24, maxCells: 60, heightRatio: 0.5, skirtFt: 60, skirtThickFt: 4, airlocks: 2, hours: 150000, permitFee: 15_000_000, reviewDays: 420, gateUsd: 500_000_000,
    blurb: 'A 360 ft space-frame dome of clear polycarbonate-composite panels that rifle fire, rockets and shrapnel cannot get through. A small town under a sky of its own. Magnate money, a contractor firm and about a year of review.' },
};

/** The footprint (cells across) a family may stake: the default, and the range the handle allows. */
export const defaultCells = (t: DomeTier): number => TIER[t].cells;
export const clampCells = (t: DomeTier, cells: number): number => Math.max(TIER[t].minCells, Math.min(TIER[t].maxCells, Math.round(cells)));
/** Every size the handle allows, smallest first. */
export const sizesOf = (t: DomeTier): number[] => Array.from({ length: TIER[t].maxCells - TIER[t].minCells + 1 }, (_, i) => TIER[t].minCells + i);
export const diameterFt = (cells: number): number => cells * CELL_FT;
/** The shell's own diameter (ft): the footprint less the berm banked on each side. */
export const shellFt = (tier: DomeTier, cells: number): number => cells * CELL_FT - 2 * TIER[tier].bermFt;

/** The tier's order: a higher tier never has a lower rank (property tests lean on it). */
export const tierRank = (t: DomeTier): number => DOME_TIERS.indexOf(t);

/**
 * A table keyed by kind that also answers for the sized domes: `table['dome_geodesic_9']` is derived from the base entry by `make` on first use and
 * cached. Enumeration (`Object.keys`, the build menu, the catalog) still shows only the base kinds, so nothing lists ninety variants.
 */
export function withSizedDomes<T>(base: Record<string, T>, make: (b: T, p: { tier: DomeTier; cells: number }, kind: string) => T): Record<string, T> {
  const cache = new Map<string, T>();
  const sized = (k: string): T | undefined => {
    const p = parseDomeKind(k);
    if (!p || p.cells === null || p.cells < TIER[p.tier].minCells || p.cells > TIER[p.tier].maxCells || !(p.base in base)) return undefined;
    let v = cache.get(k);
    if (!v) { v = make(base[p.base], { tier: p.tier, cells: p.cells }, k); cache.set(k, v); }
    return v;
  };
  return new Proxy(base, {
    get: (t, k) => (typeof k === 'string' && !(k in t) ? sized(k) : (t as Record<string | symbol, T>)[k]),
    has: (t, k) => k in t || (typeof k === 'string' && sized(k) !== undefined),
  });
}
