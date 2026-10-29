/**
 * The self-sufficient interior's state (docs/DECISIONS.md "Self-sufficient interior"): what the
 * heated greenhouses, the orchards, the pond and the equipment yard remember between days. Pure.
 *
 *  Greenhouses  heat mode (electric from the compound's power, or wood from the woodpile), whether
 *               they were warm yesterday, the wood burned toward the next rick.
 *  Orchards     whether this year's pruning was missed.
 *  Ponds        trout (count and average weight in grams), crayfish, feed, how the water is doing.
 *  Yard         the bays of each equipment yard and what is parked in them (the fleet's API).
 *
 * The rules live in greenhouse.ts, pond.ts and the yard section below; the HUD reads this through
 * `farmOf(s)` (made lazily, so old saves and hand-built test states work).
 */
import { isFinished } from './construction';
import type { GameState, Structure } from './state';
import type { Plot, Seeds } from './crops';
import type { Kitchen } from './kitchen';

export type HeatMode = 'electric' | 'wood';

export interface GreenhouseCare {
  heat: HeatMode;
  /** Warm enough yesterday for the winter benches (the source that did it is `by`). */
  heated: boolean;
  by: 'electric' | 'wood' | 'none';
  /** Ricks burned so far toward the next one (wood heat). */
  burned: number;
  /** Day of the last "out of wood" warning. */
  warned: number;
}
export interface OrchardCare {
  /** The year the winter pruning was skipped (the chore was behind when the buds broke), or -1. */
  unprunedYear: number;
}
export interface PondState {
  trout: number;
  /** Average weight of a trout, grams. */
  troutG: number;
  crayfish: number;
  /** 0–1: how well the stock is (feed, oxygen, stress). */
  health: number;
  /** Share of yesterday's feed that was given (0–1). */
  fed: number;
  /** Oxygen yesterday, 0–1. */
  oxygen: number;
  /** Lost to predators and poachers (for the report). */
  lost: number;
  /** Day of the last die-off, harvest, and the last poachers' visit. */
  dieOffAt: number;
  harvestAt: number;
  poachedAt: number;
}
export interface Farm {
  greenhouses: Record<string, GreenhouseCare>;
  orchards: Record<string, OrchardCare>;
  ponds: Record<string, PondState>;
  /** Equipment yards: yard id → bay → what is parked there (a fleet vehicle id), or null. */
  yard: Record<string, Array<string | null>>;
  /** Fields and gardens: fertility, rotation, what was sown (sim/crops.ts; made lazily). */
  plots?: Record<string, Plot>;
  /** The seed store's habits and this year's sowing (sim/crops.ts). */
  seeds?: Seeds;
  /** The kitchen: methods, today's work, the year's totals (sim/kitchen.ts). */
  kitchen?: Kitchen;
}

export const newFarm = (): Farm => ({ greenhouses: {}, orchards: {}, ponds: {}, yard: {} });
export const farmOf = (s: GameState): Farm => (s.farm ??= newFarm());

export const newPond = (): PondState => ({ trout: 0, troutG: 0, crayfish: 0, health: 1, fed: 1, oxygen: 0.8, lost: 0, dieOffAt: -999, harvestAt: -999, poachedAt: -999 });
export const pondOf = (s: GameState, id: string): PondState => (farmOf(s).ponds[id] ??= newPond());
export const greenhouseCareOf = (s: GameState, id: string): GreenhouseCare => (farmOf(s).greenhouses[id] ??= { heat: 'electric', heated: false, by: 'none', burned: 0, warned: -999 });
export const orchardCareOf = (s: GameState, id: string): OrchardCare => (farmOf(s).orchards[id] ??= { unprunedYear: -1 });

/** Finished structures of a kind (or kinds). */
export const finishedOf = (s: GameState, ...kinds: string[]): Structure[] => s.structures.filter(st => kinds.includes(st.kind) && isFinished(st));

// ─────────────────────────────────────────────────────────────────────────
// The workshop: a bench, a vise and a grinder for the tools (sim/tools.ts reads these)
// ─────────────────────────────────────────────────────────────────────────

/** A finished workshop: tools wear slower, edges come back faster, repairs hold better. */
export const hasWorkshop = (s: GameState): boolean => finishedOf(s, 'workshop').length > 0;
export const WORKSHOP_WEAR = 0.75, WORKSHOP_HONING = 0.5, WORKSHOP_REPAIR_TOLL = 0.5, WORKSHOP_REPAIR_BONUS = 0.1;

// ─────────────────────────────────────────────────────────────────────────
// The equipment yard: bays for the fleet (the tractor and its implements are the fleet's, not ours)
// ─────────────────────────────────────────────────────────────────────────

/** Parking bays in one yard (a 12 × 12 m gravel pad: a tractor and four implements, a truck). */
export const YARD_BAYS = 6;

export interface YardBay { yard: string; bay: number; occupant: string | null }

/** Every bay of every finished yard (the occupant is a fleet vehicle id or null). */
export function yardBays(s: GameState): YardBay[] {
  const out: YardBay[] = [];
  for (const st of finishedOf(s, 'equipment_yard')) {
    const row = (farmOf(s).yard[st.id] ??= Array.from({ length: YARD_BAYS }, () => null));
    row.forEach((occupant, bay) => out.push({ yard: st.id, bay, occupant }));
  }
  return out;
}

export const yardCapacity = (s: GameState): number => finishedOf(s, 'equipment_yard').length * YARD_BAYS;
export const yardFree = (s: GameState): number => yardBays(s).filter(b => b.occupant === null).length;

/**
 * Slot API for the fleet system: park a vehicle (by id) in the first free bay. Returns the bay, or
 * null when there is no yard or no room. A vehicle already parked stays where it is.
 */
export function parkInYard(s: GameState, vehicleId: string): YardBay | null {
  const bays = yardBays(s);
  const have = bays.find(b => b.occupant === vehicleId);
  if (have) return have;
  const free = bays.find(b => b.occupant === null);
  if (!free) return null;
  farmOf(s).yard[free.yard][free.bay] = vehicleId;
  return { ...free, occupant: vehicleId };
}

/** Take a vehicle out of whichever bay holds it. Returns whether it was parked. */
export function leaveYard(s: GameState, vehicleId: string): boolean {
  let was = false;
  for (const row of Object.values(farmOf(s).yard)) row.forEach((v, i) => { if (v === vehicleId) { row[i] = null; was = true; } });
  return was;
}

/** The yard a vehicle is parked in, or null. */
export const yardOf = (s: GameState, vehicleId: string): string | null => yardBays(s).find(b => b.occupant === vehicleId)?.yard ?? null;

/** Does parking shelter a vehicle from the weather? (The fleet reads this for wear: a yard is fenced gravel, a workshop bay is under a roof.) */
export const shelterFor = (s: GameState, vehicleId: string): 'workshop' | 'yard' | null => (yardOf(s, vehicleId) ? (hasWorkshop(s) ? 'workshop' : 'yard') : null);
