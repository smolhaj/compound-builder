/**
 * Where the fleet is kept (docs/DECISIONS.md: "a small fleet with a garage").
 * Pure; nothing here is stored: the parking plan is worked out from the
 * buildings and the fleet each time it is asked for, like sim/housing.ts, so
 * the world can draw each vehicle where the plan puts it.
 *
 *   GARAGES      every kind of building that houses vehicles, with its bays.
 *                The steel pole garage (and the one with the solar roof) holds
 *                three, the workshop's vehicle bay one, the barn two. The
 *                fortress-wall vehicle garage (a separate branch) exposes a
 *                slots API (slots, occupied); when it lands, add its kind here
 *                or return its slots from `externalGarage`, and nothing else
 *                changes: the plan, the UI and the world read bays only.
 *   a bay        1 slot; a motorhome takes 2 (`VehicleDef.bays`); a trailer
 *                parks behind its truck (takes none).
 *   outside      what does not fit stands in the yard: weather wears it, a
 *                hailstorm dents it, raiders can take it (sim/vehicles.ts).
 *   the tunnel   a finished underground passage or covered walkway from a
 *                garage to a house: loaded and left under cover.
 */
import type { GameState, Structure } from './state';
import { isFinished } from './construction';
import { links } from './compounds';
import { PERIMETER, runFinished } from './perimeter';
import { startingVehicles, VEHICLES, type Vehicle } from './vehicles';
import { GATE_GARAGE, inGarage, leave, park, slotOf, type ParkingSlot } from './garage';

export interface GarageDef { name: string; bays: number }
/** Buildings that park vehicles. */
export const GARAGES: Record<string, GarageDef> = {
  metal_garage: { name: 'Metal garage', bays: 3 },
  garage_solar: { name: 'Metal garage with solar roof', bays: 3 },
  workshop: { name: 'Workshop vehicle bay', bays: 1 },
  barn: { name: 'Barn', bays: 2 },
};

export interface Bay { id: string; structure: string; index: number; name: string }

/** Every parking bay under a roof, in a stable order (garages first, the big one before the small). */
export function bays(s: GameState): Bay[] {
  const out: Bay[] = [];
  const add = (id: string, name: string, n: number) => { for (let i = 0; i < n; i++) out.push({ id: `${id}:${i}`, structure: id, index: i, name }); };
  const order = ['metal_garage', 'garage_solar', 'workshop', 'barn'];
  const fin = s.structures.filter(st => isFinished(st) && !st.unplaced && GARAGES[st.kind]);
  for (const k of order) for (const st of fin.filter(x => x.kind === k)) add(st.id, GARAGES[k].name, GARAGES[k].bays);
  return out;
}

export interface Parked { vehicle: string; bay: Bay | null; /** The bays it takes (a motorhome 2). */ bays: Bay[]; /** Its slot in the gatehouse garage (sim/garage.ts), when it is parked there. */ slot?: ParkingSlot }
export interface ParkingPlan {
  slots: number;
  parked: Parked[];
  /** Vehicles standing in the yard. */
  outside: string[];
  free: number;
}

const gateSlots = (s: GameState): number => s.structures.filter(st => st.kind === GATE_GARAGE && isFinished(st)).reduce((a, st) => a + (st.parked?.length ?? 4), 0);
const gateFree = (s: GameState): number => s.structures.filter(st => st.kind === GATE_GARAGE && isFinished(st)).reduce((a, st) => a + (st.parked ?? [null, null, null, null]).filter(x => x === null).length, 0);

const needs = (v: Vehicle) => (v.kind === 'trailer' ? 0 : VEHICLES[v.kind].bays);

/** Who parks where: the big ones first (a motorhome takes two adjacent bays), then the rest, the best kept first; the rest stand outside. Trailers park behind their truck. */
export function parkingPlan(s: GameState): ParkingPlan {
  const all = bays(s);
  const free = [...all];
  const vs = s.vehicles ?? startingVehicles();
  const parked: Parked[] = [];
  const outside: string[] = [];
  // the gatehouse garage's slots are real: whoever is in one stays there
  const inGate = new Set<string>();
  for (const v of vs) {
    const slot = slotOf(s, v.id);
    if (slot && needs(v) > 0) { parked.push({ vehicle: v.id, bay: null, bays: [], slot }); inGate.add(v.id); }
  }
  const order = [...vs].filter(v => !inGate.has(v.id)).sort((a, b) => needs(b) - needs(a) || b.condition - a.condition || (a.id < b.id ? -1 : 1));
  for (const v of order) {
    const n = needs(v);
    if (n === 0) continue;
    // a vehicle that takes two needs neighbours in one building
    let at = -1;
    for (let i = 0; i + n <= free.length && at < 0; i++) if (free.slice(i, i + n).every(b => b.structure === free[i].structure)) at = i;
    if (at < 0) { outside.push(v.id); parked.push({ vehicle: v.id, bay: null, bays: [] }); continue; }
    const taken = free.splice(at, n);
    parked.push({ vehicle: v.id, bay: taken[0], bays: taken });
  }
  for (const v of vs) if (needs(v) === 0) {
    // a trailer stands behind the first truck under a roof, else in the yard
    const truck = parked.find(p => p.bay && vs.find(x => x.id === p.vehicle)?.kind !== 'trailer');
    parked.push({ vehicle: v.id, bay: truck?.bay ?? null, bays: [] });
    if (!truck) outside.push(v.id);
  }
  return { slots: all.length + gateSlots(s), parked, outside, free: free.length + gateFree(s) };
}

/**
 * Park every vehicle that is not parked in a free slot of the gatehouse garage (a vehicle keeps its slot while it is
 * away). Called when one is bought and once a day; a vehicle that has left the fleet gives its slot back.
 */
export function syncParking(s: GameState): void {
  const ids = new Set((s.vehicles ?? []).map(v => v.id));
  for (const st of s.structures) if (st.kind === GATE_GARAGE) for (const o of st.parked ?? []) if (o && !ids.has(o)) leave(s, o);
  for (const v of s.vehicles ?? []) if (needs(v) > 0 && !slotOf(s, v.id)) park(s, v.id);
}

export const isUnderRoof = (s: GameState, vehicleId: string): boolean => !parkingPlan(s).outside.includes(vehicleId);

/** Where a vehicle stands, in words: "in the metal garage", "in the yard". */
export function parkedText(s: GameState, vehicleId: string): string {
  const p = parkingPlan(s).parked.find(x => x.vehicle === vehicleId);
  if (p?.slot) return 'in the gatehouse garage';
  return p?.bay ? `in the ${p.bay.name.toLowerCase().replace(/^metal garage with solar roof$/, 'solar garage')}` : 'in the yard';
}

// ── the tunnel ─────────────────────────────────────────────────────────────

/** How near (world units, ≈ 6.6 m) a passage or walkway end must come to a building to serve it. */
export const TUNNEL_REACH = 1.1;
const near = (s: GameState, st: Structure, p: readonly [number, number]) => (st.kind === GATE_GARAGE ? inGarage(s, p[0], p[1], 0.3) : Math.hypot(st.x - p[0], st.z - p[1]) <= TUNNEL_REACH);

export interface GarageLink { run: string; kind: 'passage' | 'walkway'; garage: string; home: string }
/**
 * A garage joined to a house by a finished underground passage or covered
 * walkway: one end at the garage, the other at a home. The family can reach the
 * vehicles (and load them for a bug-out) without going outside the wall.
 */
export function garageLinks(s: GameState): GarageLink[] {
  const out: GarageLink[] = [];
  const garages = s.structures.filter(st => isFinished(st) && (st.kind === GATE_GARAGE || (GARAGES[st.kind] && st.kind !== 'barn' && st.kind !== 'workshop')));
  const homes = s.structures.filter(st => isFinished(st) && (st.kind === 'timber_cabin' || st.kind === 'log_house' || st.kind === 'farmhouse' || st.kind === 'trailer' || st.kind === 'cottage' || st.kind === 'moms_house' || st.kind === 'guest_house'));
  const kinds = links(s);
  for (const l of kinds) {
    const run = s.perimeter.find(r => r.id === l.runId);
    if (!run || !runFinished(run) || !(PERIMETER[run.kind].walkway || PERIMETER[run.kind].twoWay)) continue;
    const a = run.pts[0], b = run.pts[run.pts.length - 1];
    for (const g of garages) for (const h of homes) {
      if ((near(s, g, a) && near(s, h, b)) || (near(s, g, b) && near(s, h, a))) out.push({ run: run.id, kind: l.kind, garage: g.id, home: h.id });
    }
  }
  return out;
}
/** Is there a covered way from the house to the garage? */
export const garageConnected = (s: GameState): boolean => garageLinks(s).length > 0;
