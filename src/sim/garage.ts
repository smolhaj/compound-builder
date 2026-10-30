/**
 * The gatehouse garage (docs/DECISIONS.md, "Fortress ring"): a vehicle garage
 * built into the wall at the gate, as in the user's picture. A big steel gate
 * through the middle (the way in), and a bay each side with two parking
 * slots; a roof deck with a parapet that is a guard post of its own. It fills
 * the gate gap in the wall and so is part of the closed line (enclosure.ts
 * reads `GARAGE_HOLD`); the underground passage can come up inside it
 * (compounds.ts), linking it to the house.
 *
 * The vehicle fleet (buying a motorhome, SUVs, tractors; fuel, upkeep, bug-out
 * and supply runs) is separate work. This module is only the building and its
 * parking slots, with a small API the fleet can use: `parkingSlots` (where,
 * who is in), `freeSlots`, `park`, `leave`, `slotOf`. A slot holds a vehicle id
 * (any string); nothing here knows what a vehicle is. Pure (tested).
 */
import { CELL, rotQ } from '../game/buildkit/kit';
import { isFinished } from './construction';
import type { GameState, Structure } from './state';

export const GATE_GARAGE = 'gate_garage';

/** Footprint in 3 m cells: along the wall × deep (≈ 18 × 9 m). */
export const GARAGE_CELLS_X = 6, GARAGE_CELLS_Z = 3;
/** Length of wall it replaces (world units): the gate gap in the run. */
export const GARAGE_W = GARAGE_CELLS_X * CELL;
/** Roof deck height (≈ 3.6 m), world units. */
export const GARAGE_H = 3.6 / 6;
/** Width of the drive-through gate in the middle (≈ 4.5 m). */
export const GARAGE_GATE_W = 4.5 / 6;
/** How much of the line a finished garage holds where it stands (a steel gate and roll-up doors: nearly a wall). */
export const GARAGE_HOLD = 0.92;
/** Parking slots: two each side of the gate (centers along the wall, m from the middle; each ≈ 3.5 m wide, 7 m deep). */
export const SLOT_X_M = [-7.25, -3.75, 3.75, 7.25] as const;
export const GARAGE_SLOTS = SLOT_X_M.length;

export interface ParkingSlot {
  /** `<garage id>:<n>` (stable). */
  id: string;
  garageId: string;
  index: number;
  /** The middle of the slot on the ground (world units). */
  x: number;
  z: number;
  /** The way a vehicle parked in it faces: out through the roll-up door into the compound (unit vector). */
  fx: number;
  fz: number;
  /** Quarter turns of the garage (a vehicle's own yaw can follow it). */
  rot: number;
  /** Who is parked there, or null. */
  occupant: string | null;
}

/** Quarter turns that put a garage's door side toward the inside (`inward` is a unit axis vector, the way from the wall into the compound). */
export function garageRotFor(inward: readonly [number, number]): number {
  return Math.abs(inward[0]) > Math.abs(inward[1]) ? (inward[0] > 0 ? 1 : 3) : (inward[1] > 0 ? 0 : 2);
}

export const isGarage = (st: Structure): boolean => st.kind === GATE_GARAGE;
/** The finished garages. */
export const garages = (s: GameState): Structure[] => s.structures.filter(st => isGarage(st) && isFinished(st));

/** The slots of a garage, in order, with who is in them. */
export function slotsOf(st: Structure): ParkingSlot[] {
  return SLOT_X_M.map((m, i) => {
    const [ox, oz] = rotQ(m / 6, 0, st.rot), [fx, fz] = rotQ(0, 1, st.rot);
    return { id: `${st.id}:${i}`, garageId: st.id, index: i, x: st.x + ox, z: st.z + oz, fx, fz, rot: st.rot, occupant: st.parked?.[i] ?? null };
  });
}

/** Every parking slot in every finished gatehouse garage. */
export const parkingSlots = (s: GameState): ParkingSlot[] => garages(s).flatMap(slotsOf);
export const freeSlots = (s: GameState): ParkingSlot[] => parkingSlots(s).filter(p => p.occupant === null);
export const occupiedSlots = (s: GameState): ParkingSlot[] => parkingSlots(s).filter(p => p.occupant !== null);
/** The slot a vehicle is parked in, or null (out on a run, or not in a garage). */
export const slotOf = (s: GameState, vehicleId: string): ParkingSlot | null => parkingSlots(s).find(p => p.occupant === vehicleId) ?? null;

/** Park a vehicle (in the given slot, or the first free one). Null on success, else why not. */
export function park(s: GameState, vehicleId: string, slotId?: string): string | null {
  if (slotOf(s, vehicleId)) return 'already parked';
  const slot = slotId ? parkingSlots(s).find(p => p.id === slotId) : freeSlots(s)[0];
  if (!slot) return slotId ? 'no such slot' : parkingSlots(s).length ? 'every slot is taken' : 'no garage built yet';
  if (slot.occupant !== null) return 'that slot is taken';
  const st = s.structures.find(x => x.id === slot.garageId)!;
  st.parked = st.parked ?? Array.from({ length: GARAGE_SLOTS }, () => null);
  st.parked[slot.index] = vehicleId;
  return null;
}

/** Take a vehicle out of its slot (it drove away). True if it was parked. */
export function leave(s: GameState, vehicleId: string): boolean {
  const slot = slotOf(s, vehicleId);
  if (!slot) return false;
  const st = s.structures.find(x => x.id === slot.garageId)!;
  if (st.parked) st.parked[slot.index] = null;
  return true;
}

/** Is a point inside a finished or staked garage's footprint (with a margin)? */
export function inGarage(s: GameState, x: number, z: number, margin = 0): boolean {
  return s.structures.some(st => {
    if (!isGarage(st)) return false;
    const [ax, az] = rotQ(GARAGE_CELLS_X * CELL / 2, 0, st.rot), [bx, bz] = rotQ(0, GARAGE_CELLS_Z * CELL / 2, st.rot);
    const hx = Math.abs(ax) + Math.abs(bx) + margin, hz = Math.abs(az) + Math.abs(bz) + margin;
    return Math.abs(x - st.x) <= hx && Math.abs(z - st.z) <= hz;
  });
}

/** Does a finished garage stand over this point of the line (the gate gap it fills)? */
export function garageHolds(s: GameState, x: number, z: number): boolean {
  return s.structures.some(st => isGarage(st) && isFinished(st) && inGarage({ structures: [st] } as GameState, x, z, 0.15));
}
