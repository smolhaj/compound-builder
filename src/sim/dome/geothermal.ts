/**
 * Geothermal and heat rejection purchases for the big domes (docs/design/climate_disasters.md section 1.5 and PR 9; save v107). Pure and tested
 * (geothermal.test.ts); nothing here reads GameState. Everything is PROPOSED unless a line says the doc gave the number; the DECISIONS row of
 * 2026-11-27 lists the "owner to confirm" choices.
 *
 *  tower        a cooling tower or evaporative condenser in place of the air-cooled condenser (the chiller). Limited by wet-bulb, not dry-bulb: full to 82 F
 *               wet-bulb, none at 95 F (doc). The price is water: 0.65 gallons per kWh of heat moved (doc). COP 4.5 up to 75 F wet-bulb, then
 *               0.05 less a degree (floor 3.0).
 *  ground loop  a closed vertical bore field that dumps heat to the 52 F ground at COP 4 with no outdoor derate (doc), and gives the heat pump COP 3 at any
 *               air temperature (doc). Sized as a half or a full share of the chiller's rating at about 3 times the cost of an air-cooled unit (doc: full),
 *               and limited by the field area (the bore count the lot can take: `FIELD_MAX_SF`).
 *  deep well    a drilled supply well with a submersible pump that makes up the cooling water (the tower, the pads) before the household cistern is drawn.
 *               It runs through the dome's water plant when one is fitted: a lost water plant shuts the well off. A drought lowers its yield.
 *  curtains     thermal curtains on the existing roof screens: cut shell loss about 40 percent at night (doc). No new art.
 *  high ambient the refit of the chiller (`plantClimate.REJECTION.high_ambient`, cost times 1.4 per the doc).
 *
 * The earthen and geodesic domes have no yard and no chiller plant to rebuild: only glass and arcology can buy any of these (`geoProblem`).
 */
import type { DomeTier } from './tiers';
import { shellFt } from './tiers';
import { domeGeometry } from './geometry';
import { BTU_PER_KWH } from './climate';
import { chillerRatedBtu } from './plantClimate';
import { spareUsd } from './plantUnits';
import { hasYard } from './plantYard';
import { tunnelReach } from './links';
import { wetBulbF } from '../climateCurve';

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));

export type Rejection = 'air' | 'high_ambient' | 'tower';
export type LoopSize = 'half' | 'full';
export const LOOP_SHARE: Record<LoopSize, number> = { half: 0.5, full: 1 };
export interface GeoSpec { rejection?: Rejection; groundLoop?: LoopSize; deepWell?: boolean; curtains?: boolean }
export const NO_GEO: GeoSpec = {};

// ── tower ─────────────────────────────────────────────────────────────────────────────────

/** Wet-bulb a tower holds full capacity to, and the wet-bulb at which it gives nothing (doc). */
export const TOWER_FULL_WB = 82, TOWER_DEAD_WB = 95;
/** Share of its rating the tower plant gives at this wet-bulb (never rises with it). */
export const towerCapacity = (wbF: number): number => clamp((TOWER_DEAD_WB - wbF) / (TOWER_DEAD_WB - TOWER_FULL_WB), 0, 1);
/** Gallons of make-up water per kWh of heat moved (doc: about 0.65). */
export const TOWER_GAL_PER_KWH = 0.65;
export const towerGalDay = (kwThermal: number): number => Math.max(0, kwThermal) * 24 * TOWER_GAL_PER_KWH;
/** The tower plant's COP. */
export const copTower = (wbF: number): number => Math.max(3, 4.5 - 0.05 * Math.max(0, wbF - 75));
/** A wet-bulb for a day with no heat disaster (the disaster has its own humidity model): 75 percent humid at 0 dryness, 25 percent in the desert. */
export const wetBulbEstimate = (outF: number, dry: number): number => wetBulbF(outF, 75 - 50 * clamp(dry, 0, 1));

// ── ground loop ───────────────────────────────────────────────────────────────────────────

/** Ground temperature the loop rejects into (the doc's 52 F, `climate.GROUND_F`), the loop's cooling COP and its heat-pump COP at any air temperature (doc). */
export const COP_LOOP_COOL = 4, COP_LOOP_HEAT = 3;
/** One vertical bore: depth (ft), the heat it rejects per foot (Btu an hour) and the spacing (ft): a bore takes spacing squared of ground. */
export const BORE_FT = 300, BORE_BTU_FT = 55, BORE_SPACING_FT = 20;
export const BORE_BTU = BORE_FT * BORE_BTU_FT, BORE_SF = BORE_SPACING_FT * BORE_SPACING_FT;
/** The most ground (sq ft) a loop field may take: 5 acres (PROPOSED), so the arcology's loop only ever covers part of its plant. */
export const FIELD_MAX_SF = 5 * 43_560;
/** Bores the loop of this size would need for its share of the chiller rating, the field they take, and the share the lot actually allows. */
export function loopField(tier: DomeTier, cells: number, size: LoopSize): { bores: number; fieldSf: number; wantedSf: number; share: number; capBtu: number } {
  const rated = chillerRatedBtu(tier, cells, 'temperate'), want = rated * LOOP_SHARE[size];
  const wantBores = Math.ceil(want / BORE_BTU), maxBores = Math.floor(FIELD_MAX_SF / BORE_SF), bores = Math.min(wantBores, maxBores);
  return { bores, fieldSf: bores * BORE_SF, wantedSf: wantBores * BORE_SF, share: rated > 0 ? Math.min(1, bores * BORE_BTU / rated) : 0, capBtu: Math.min(want, bores * BORE_BTU) };
}
/** Btu an hour the ground loop takes off the dome in cooling (0 with none). */
export const loopCapBtu = (tier: DomeTier, cells: number, size: LoopSize | undefined): number => size && tier !== 'earthen' && tier !== 'geodesic' ? loopField(tier, cells, size).capBtu : 0;
/** The heat pump's COP with a loop of this share of the plant standing and the air-source COP the rest runs on: the work is split in proportion. */
export function copHeatWithLoop(airCop: number, share: number): number {
  const q = clamp(share, 0, 1);
  return 1 / (q / COP_LOOP_HEAT + (1 - q) / Math.max(1, airCop));
}

// ── deep well ─────────────────────────────────────────────────────────────────────────────

export interface WellSpec { depthFt: number; gpm: number; kw: number }
/** Depth, yield and pump of the dome's deep well by tier (PROPOSED: sized to cover its tower at the design peak). */
export const WELL: Record<'glass' | 'arcology', WellSpec> = { glass: { depthFt: 500, gpm: 6, kw: 1.4 }, arcology: { depthFt: 900, gpm: 25, kw: 9 } };
export const wellSpec = (tier: DomeTier): WellSpec | null => tier === 'glass' || tier === 'arcology' ? WELL[tier] : null;
/** The pump runs half the day at most. */
export const WELL_DUTY = 0.5;
/** Gallons a day the well can give at this share of its yield (a drought lowers it) with the water plant at `plantK`. */
export const wellGalDay = (tier: DomeTier, yieldK: number, plantK = 1): number => { const w = wellSpec(tier); return w ? w.gpm * 60 * 24 * WELL_DUTY * clamp(yieldK, 0, 1) * clamp(plantK, 0, 1) : 0; };
/** kWh a day the pump uses to give `gal` gallons (full duty = kw x 12 h). */
export function wellKwhDay(tier: DomeTier, gal: number, yieldK = 1): number { const w = wellSpec(tier); if (!w) return 0; const full = wellGalDay(tier, yieldK); return full > 0 ? w.kw * 24 * WELL_DUTY * clamp(gal / full, 0, 1) : 0; }

// ── prices ────────────────────────────────────────────────────────────────────────────────

const round = (v: number, to = 1000): number => Math.max(to, Math.round(v / to) * to);
/** What a second air-cooled chiller unit costs (the doc's yardstick for the loop and the tower). */
export const unitUsd = (tier: DomeTier, cells: number): number => spareUsd(tier, cells, 'chiller', 'none') ?? 0;
export const WELL_USD_FT = 55, WELL_PUMP_USD = 22_000, CURTAIN_USD_SF = 3.5;
export interface GeoOption { id: 'high_ambient' | 'tower' | 'loop_half' | 'loop_full' | 'deep_well' | 'curtains'; label: string; usd: number }
/** Price of one option on this dome, or null when it is not for sale on this tier. */
export function geoUsd(tier: DomeTier, cells: number, id: GeoOption['id']): number | null {
  if (!hasYard(tier)) return null;
  const unit = unitUsd(tier, cells), g = domeGeometry(tier, shellFt(tier, cells));
  switch (id) {
    case 'high_ambient': return round(unit * 0.4);   // the doc's price times 1.4 for the unit, so the refit is the 0.4
    case 'tower': return round(unit * 1.25 + 40_000);   // basin, fill, fans, make-up line and a sump
    case 'loop_half': return round(unit * (0.6 + 2.4 * 0.5));   // the doc's 3 times a unit at a full loop: 0.6 of it is the header and plant, the rest is bores
    case 'loop_full': return round(unit * 3);
    case 'deep_well': { const w = wellSpec(tier)!; return round(w.depthFt * WELL_USD_FT + WELL_PUMP_USD); }
    case 'curtains': return round(g.surfaceSf * CURTAIN_USD_SF, 500);
  }
}
export const GEO_LABEL: Record<GeoOption['id'], string> = {
  high_ambient: 'High-ambient chiller package (trips at 140 F, not 125 F)', tower: 'Cooling tower (limited by wet-bulb, drinks water)', loop_half: 'Ground loop, half the plant (bore field)', loop_full: 'Ground loop, the whole plant (bore field)',
  deep_well: 'Deep well and pump (make-up water)', curtains: 'Thermal curtains on the roof screens',
};
export function geoOptions(tier: DomeTier, cells: number): GeoOption[] {
  const ids: GeoOption['id'][] = ['high_ambient', 'tower', 'loop_half', 'loop_full', 'deep_well', 'curtains'];
  return ids.flatMap(id => { const usd = geoUsd(tier, cells, id); return usd === null ? [] : [{ id, label: GEO_LABEL[id], usd }]; });
}
/** The itemized cost lines of what a dome has chosen (for `domeCostSummary(...).extras`, so the grand total counts them). */
export function geoLines(tier: DomeTier, cells: number, spec: GeoSpec): Array<{ id: string; label: string; usd: number }> {
  const out: Array<{ id: string; label: string; usd: number }> = [];
  const add = (id: GeoOption['id']): void => { const usd = geoUsd(tier, cells, id); if (usd !== null) out.push({ id: `geo_${id}`, label: GEO_LABEL[id], usd }); };
  if (spec.rejection === 'high_ambient') add('high_ambient');
  if (spec.rejection === 'tower') add('tower');
  if (spec.groundLoop === 'half') add('loop_half');
  if (spec.groundLoop === 'full') add('loop_full');
  if (spec.deepWell) add('deep_well');
  if (spec.curtains) add('curtains');
  return out;
}

/** Why an option cannot be bought now (null: it can). `have` is what the dome has. */
export function geoProblem(tier: DomeTier, have: GeoSpec, id: GeoOption['id']): string | null {
  if (!hasYard(tier)) return 'only a glass or arcology dome has a yard and a chiller plant to rebuild';
  switch (id) {
    case 'high_ambient': return have.rejection === 'high_ambient' ? 'already fitted' : have.rejection === 'tower' ? 'the tower already replaces the air-cooled condenser' : null;
    case 'tower': return have.rejection === 'tower' ? 'already fitted' : null;
    case 'loop_half': return have.groundLoop ? 'a ground loop is already in' : null;
    case 'loop_full': return have.groundLoop === 'full' ? 'already fitted' : have.groundLoop === 'half' ? 'a half loop is in: the field cannot be re-drilled (PROPOSED)' : null;
    case 'deep_well': return have.deepWell ? 'already drilled' : null;
    case 'curtains': return have.curtains ? 'already hung' : null;
  }
}

// ── curtains ──────────────────────────────────────────────────────────────────────────────

/** Share of the shell's loss left at night with the curtains drawn (doc: cut about 40 percent). */
export const CURTAIN_LEFT = 0.6;
export const curtainK = (have: boolean | undefined, sun: number): number => have && sun <= 0.05 ? CURTAIN_LEFT : 1;

// ── tunneler exposure ─────────────────────────────────────────────────────────────────────

/** The header trench that carries the loop's pipes from the bore field to the yard is shallow (ft); the bores and the well casing are far deeper than a crew can dig. */
export const HEADER_DEPTH_FT = 8;
export interface Exposure { id: 'header'; label: string; depthFt: number; /** Share of a plain crew's digs that can reach it, and of one that has learned this place. */ plain: number; learned: number; word: string }
/** What a dig could reach of the dome's new buried works (empty with no loop or well). The header trench is the soft spot; the bores and the casing are not. */
export function geoExposure(have: GeoSpec): Exposure[] {
  if (!have.groundLoop && !have.deepWell) return [];
  const plain = tunnelReach(HEADER_DEPTH_FT, 0), learned = tunnelReach(HEADER_DEPTH_FT, 1);
  return [{ id: 'header', label: `${have.groundLoop ? 'Loop header trench' : 'Well supply trench'}, ${HEADER_DEPTH_FT} ft down`, depthFt: HEADER_DEPTH_FT, plain, learned, word: plain > 0 ? 'a crew can dig down to it and follow it to the yard wall; the bores (300 ft) and the well casing are far out of reach' : 'out of reach of a plain crew' }];
}

/** Btu an hour to kW thermal. */
export const btuKw = (b: number): number => b / BTU_PER_KWH;

// ── the bore field as drawn ───────────────────────────────────────────────────────────────

/** Most caps drawn (the field is the same grid beyond them) and columns across. */
export const FIELD_DRAW_MAX = 96, FIELD_COLS = 12;
export interface FieldDraw { caps: Array<{ u: number; v: number }>; v0: number; uMid: number; vMid: number; halfU: number; halfV: number }
/** The bore field in the yard's own frame (`u` along the shell, `v` out from the yard's inner wall; world units, 1 = 20 ft = the bore spacing): out past the tower pad, centered on the yard. */
export function geoField(yard: { D: number }, bores: number): FieldDraw {
  const n = Math.max(0, Math.min(FIELD_DRAW_MAX, Math.floor(bores))), cols = Math.min(FIELD_COLS, Math.max(1, n)), rows = Math.max(1, Math.ceil(n / cols)), v0 = yard.D + 1.6;
  const caps: FieldDraw['caps'] = [];
  for (let i = 0; i < n; i++) caps.push({ u: ((i % cols) - (cols - 1) / 2) * BORE_SPACING_FT / 20, v: v0 + Math.floor(i / cols) * BORE_SPACING_FT / 20 });
  return { caps, v0, uMid: 0, vMid: v0 + (rows - 1) / 2, halfU: cols / 2 + 0.6, halfV: rows / 2 + 0.6 };
}
/** Is the yard-frame point (u, v) on the drawn field plus `pad`? (Brush and trees stay off it.) */
export function inField(yard: { D: number }, bores: number, u: number, v: number, pad = 0): boolean {
  if (bores <= 0) return false;
  const f = geoField(yard, bores);
  return Math.abs(u - f.uMid) <= f.halfU + pad && Math.abs(v - f.vMid) <= f.halfV + pad;
}
