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

export interface GarageDef { name: string; bays: number }
/** Buildings that park vehicles. */
export const GARAGES: Record<string, GarageDef> = {
  metal_garage: { name: 'Metal garage', bays: 3 },
  garage_solar: { name: 'Metal garage with solar roof', bays: 3 },
  workshop: { name: 'Workshop vehicle bay', bays: 1 },
  barn: { name: 'Barn', bays: 2 },
};

/**
 * Hook for a garage built into the fortress wall: return `{ id, name, bays }`
 * for each finished one (its slots API). Nothing provides any yet.
 */
export function externalGarages(_s: GameState): Array<{ id: string; name: string; bays: number }> {
  return [];
}

export interface Bay { id: string; structure: string; index: number; name: string }

/** Every parking bay under a roof, in a stable order (garages first, the big one before the small). */
export function bays(s: GameState): Bay[] {
  const out: Bay[] = [];
  const add = (id: string, name: string, n: number) => { for (let i = 0; i < n; i++) out.push({ id: `${id}:${i}`, structure: id, index: i, name }); };
  const order = ['metal_garage', 'garage_solar', 'workshop', 'barn'];
  const fin = s.structures.filter(st => isFinished(st) && !st.unplaced && GARAGES[st.kind]);
  for (const k of order) for (const st of fin.filter(x => x.kind === k)) add(st.id, GARAGES[k].name, GARAGES[k].bays);
  for (const g of externalGarages(s)) add(g.id, g.name, g.bays);
  return out;
}

export interface Parked { vehicle: string; bay: Bay | null; /** The bays it takes (a motorhome 2). */ bays: Bay[] }
export interface ParkingPlan {
  slots: number;
  parked: Parked[];
  /** Vehicles standing in the yard. */
  outside: string[];
  free: number;
}

const needs = (v: Vehicle) => (v.kind === 'trailer' ? 0 : VEHICLES[v.kind].bays);

/** Who parks where: the big ones first (a motorhome takes two adjacent bays), then the rest, the best kept first; the rest stand outside. Trailers park behind their truck. */
export function parkingPlan(s: GameState): ParkingPlan {
  const all = bays(s);
  const free = [...all];
  const vs = s.vehicles ?? startingVehicles();
  const parked: Parked[] = [];
  const outside: string[] = [];
  const order = [...vs].sort((a, b) => needs(b) - needs(a) || b.condition - a.condition || (a.id < b.id ? -1 : 1));
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
  return { slots: all.length, parked, outside, free: free.length };
}

export const isUnderRoof = (s: GameState, vehicleId: string): boolean => !parkingPlan(s).outside.includes(vehicleId);

/** Where a vehicle stands, in words: "in the metal garage", "in the yard". */
export function parkedText(s: GameState, vehicleId: string): string {
  const p = parkingPlan(s).parked.find(x => x.vehicle === vehicleId);
  return p?.bay ? `in the ${p.bay.name.toLowerCase().replace(/^metal garage with solar roof$/, 'solar garage')}` : 'in the yard';
}

// ── the tunnel ─────────────────────────────────────────────────────────────

/** How near (world units, ≈ 6.6 m) a passage or walkway end must come to a building to serve it. */
export const TUNNEL_REACH = 1.1;
const near = (st: Structure, p: readonly [number, number]) => Math.hypot(st.x - p[0], st.z - p[1]) <= TUNNEL_REACH;

export interface GarageLink { run: string; kind: 'passage' | 'walkway'; garage: string; home: string }
/**
 * A garage joined to a house by a finished underground passage or covered
 * walkway: one end at the garage, the other at a home. The family can reach the
 * vehicles (and load them for a bug-out) without going outside the wall.
 */
export function garageLinks(s: GameState): GarageLink[] {
  const out: GarageLink[] = [];
  const garages = s.structures.filter(st => isFinished(st) && GARAGES[st.kind] && st.kind !== 'barn' && st.kind !== 'workshop');
  const homes = s.structures.filter(st => isFinished(st) && (st.kind === 'timber_cabin' || st.kind === 'log_house' || st.kind === 'farmhouse' || st.kind === 'trailer' || st.kind === 'cottage' || st.kind === 'moms_house' || st.kind === 'guest_house'));
  const kinds = links(s);
  for (const l of kinds) {
    const run = s.perimeter.find(r => r.id === l.runId);
    if (!run || !runFinished(run) || !(PERIMETER[run.kind].walkway || PERIMETER[run.kind].twoWay)) continue;
    const a = run.pts[0], b = run.pts[run.pts.length - 1];
    for (const g of garages) for (const h of homes) {
      if ((near(g, a) && near(h, b)) || (near(g, b) && near(h, a))) out.push({ run: run.id, kind: l.kind, garage: g.id, home: h.id });
    }
  }
  return out;
}
/** Is there a covered way from the house to the garage? */
export const garageConnected = (s: GameState): boolean => garageLinks(s).length > 0;
