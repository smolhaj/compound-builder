/**
 * Bunker hardening (GDS §4, decided with the user): four upgrades, each in
 * three tiers, bought per room (or for the whole bunker at once) and fitted
 * by the family as a retrofit job after the room is built. Prices and hours
 * climb steeply with the tier.
 *
 *   fallout — protection factor (PF): how many times less radiation reaches
 *             people inside than someone standing in the open.
 *   faraday — the share of electronics stored in the room that survive an EMP.
 *   nbc     — what the air supply keeps out (fallout dust → chemical / bio).
 *   blast   — the overpressure the room rides out (psi).
 */
import { hasAll, type Stock } from './materials';
import { log } from './economy';
import type { GameState, Structure } from './state';

export type HardenId = 'fallout' | 'faraday' | 'nbc' | 'blast';
export type Tier = 1 | 2 | 3;
export const HARDEN_IDS: HardenId[] = ['fallout', 'faraday', 'nbc', 'blast'];

export interface TierDef { name: string; blurb: string; hours: number; materials: Partial<Stock> }
export interface HardenDef { id: HardenId; name: string; tiers: [TierDef, TierDef, TierDef] }

export const HARDEN: Record<HardenId, HardenDef> = {
  fallout: {
    id: 'fallout', name: 'Fallout shielding', tiers: [
      { name: 'Basic', blurb: 'Extra earth over the roof, a shielded hatch (PF 40)', hours: 40, materials: { spoil: 20, concrete: 2 } },
      { name: 'Shelter', blurb: 'Dense-concrete lining, a baffled entry (PF 1,000)', hours: 90, materials: { concrete: 8, rebar: 4 } },
      { name: 'Military', blurb: 'Lead and steel lining (PF 10,000+)', hours: 120, materials: { lead_sheet: 10, rebar: 4, concrete: 4 } },
    ],
  },
  faraday: {
    id: 'faraday', name: 'Faraday cage (EMP)', tiers: [
      { name: 'Mesh cage', blurb: 'Welded mesh in walls, slab and roof; most electronics inside survive', hours: 40, materials: { faraday_mesh: 4, cable: 1 } },
      { name: 'Bonded cage', blurb: 'Bonded to a ground rod, gasketed door, filtered power and signal entries', hours: 70, materials: { faraday_mesh: 8, hardware: 2 } },
      { name: 'Welded shell', blurb: 'Continuous steel shell, waveguide vents (military spec)', hours: 120, materials: { faraday_mesh: 12, rebar: 6, hardware: 4 } },
    ],
  },
  nbc: {
    id: 'nbc', name: 'NBC air filtration', tiers: [
      { name: 'Particulate', blurb: 'HEPA filter and hand crank: keeps fallout dust out', hours: 16, materials: { filter_set: 2, hardware: 1 } },
      { name: 'Gas-tight', blurb: 'HEPA + carbon, blast valves on the vents: keeps out gas and germs', hours: 30, materials: { nbc_filter: 1, blast_valve: 2 } },
      { name: 'Overpressure', blurb: 'Overpressure and an airlock: nothing seeps in', hours: 50, materials: { nbc_filter: 1, blast_valve: 2, hardware: 3 } },
    ],
  },
  blast: {
    id: 'blast', name: 'Blast hardening', tiers: [
      { name: 'Blast doors', blurb: 'Blast doors on every opening (15 psi)', hours: 24, materials: { blast_door: 1, hardware: 1 } },
      { name: 'Reinforced', blurb: 'Thicker roof slab, shock-mounted bunks and shelves, blast valves (50 psi)', hours: 160, materials: { rebar: 20, concrete: 24, hardware: 4, blast_valve: 2 } },
      { name: 'Hardened shell', blurb: 'Heavily reinforced shell, a second blast door, more valves (100 psi)', hours: 300, materials: { rebar: 40, concrete: 40, blast_valve: 4, blast_door: 1 } },
    ],
  },
};

/** What a room protects against at each tier (index 0 = not hardened). */
const PF = [20, 40, 1000, 10000];
const EMP_SURVIVE = [0, 0.7, 0.97, 1];
const FILTER = ['none', 'dust', 'gas', 'all'] as const;
const PSI = [10, 15, 50, 100];

export type FilterLevel = typeof FILTER[number];
export interface Protection { pf: number; empSurvive: number; filter: FilterLevel; psi: number }

export const isBunkerRoom = (kind: string) => kind.startsWith('bunker_');

/** Small rooms (entrances, corridors, the comms room) take half the materials and time. */
const SMALL = new Set(['bunker_hatch', 'bunker_stairs', 'bunker_corridor', 'bunker_comms']);
const scale = (kind: string) => (SMALL.has(kind) ? 0.5 : 1);

export function tierOf(st: Structure, id: HardenId): 0 | Tier {
  return st.hardening?.[id] ?? 0;
}

export function protectionOf(st: Structure): Protection {
  return { pf: PF[tierOf(st, 'fallout')], empSurvive: EMP_SURVIVE[tierOf(st, 'faraday')], filter: FILTER[tierOf(st, 'nbc')], psi: PSI[tierOf(st, 'blast')] };
}

/** Materials and hours for the next tier of an upgrade on a room. */
export function hardenCost(kind: string, id: HardenId, tier: Tier): { hours: number; materials: Partial<Stock> } {
  const t = HARDEN[id].tiers[tier - 1], k = scale(kind);
  const materials: Partial<Stock> = {};
  for (const [m, n] of Object.entries(t.materials) as Array<[keyof Stock, number]>) materials[m] = Math.max(1, Math.round(n * k));
  return { hours: Math.round(t.hours * k), materials };
}

export interface HardenJob { id: string; building: string; upgrade: HardenId; tier: Tier; done: number; hours: number; supplied: boolean; finishedAt: number | null }

const pending = (s: GameState, st: Structure, id: HardenId) => s.hardenJobs.find(j => j.building === st.id && j.upgrade === id && j.finishedAt === null);

/** Why the next tier of `id` can't be ordered for this room (null = it can). */
export function hardenProblem(s: GameState, st: Structure, id: HardenId): string | null {
  if (!isBunkerRoom(st.kind)) return 'only bunker rooms can be hardened';
  if (st.finishedAt === null) return 'not built yet';
  if (pending(s, st, id)) return 'already being fitted';
  if (tierOf(st, id) >= 3) return 'fully hardened';
  return null;
}

/** Order the next tier of an upgrade for one room. */
export function orderHarden(s: GameState, st: Structure, id: HardenId): HardenJob | null {
  if (hardenProblem(s, st, id)) return null;
  const tier = (tierOf(st, id) + 1) as Tier;
  const job: HardenJob = { id: `h${s.nextId++}`, building: st.id, upgrade: id, tier, done: 0, hours: hardenCost(st.kind, id, tier).hours, supplied: false, finishedAt: null };
  s.hardenJobs.push(job);
  return job;
}

/** "Harden whole bunker": bring every built bunker room up to `tier` (orders one step per room; call again for the next). */
export function orderHardenAll(s: GameState, id: HardenId, tier: Tier): number {
  let n = 0;
  for (const st of s.structures) if (isBunkerRoom(st.kind) && tierOf(st, id) < tier && orderHarden(s, st, id)) n++;
  return n;
}

/** The oldest hardening job whose materials are on hand (or already taken). */
export function nextHardenJob(s: GameState): HardenJob | null {
  for (const j of s.hardenJobs) {
    if (j.finishedAt !== null) continue;
    const st = s.structures.find(x => x.id === j.building);
    if (!st) continue;
    if (j.supplied || hasAll(s.stock, hardenCost(st.kind, j.upgrade, j.tier).materials)) return j;
  }
  return null;
}

/** Add person-hours of work; the materials are taken when work starts. */
export function addHardenWork(s: GameState, j: HardenJob, hours: number): void {
  if (j.finishedAt !== null) return;
  const st = s.structures.find(x => x.id === j.building);
  if (!st) return;
  if (!j.supplied) {
    const need = hardenCost(st.kind, j.upgrade, j.tier).materials;
    if (!hasAll(s.stock, need)) return;
    for (const [k, n] of Object.entries(need) as Array<[keyof Stock, number]>) s.stock[k] -= n;
    j.supplied = true;
  }
  j.done += hours;
  if (j.done >= j.hours) {
    j.finishedAt = s.clock.t;
    st.hardening = { ...st.hardening, [j.upgrade]: j.tier };
    log(s, `${HARDEN[j.upgrade].name}: ${HARDEN[j.upgrade].tiers[j.tier - 1].name.toLowerCase()} fitted in the ${st.kind.replace('bunker_', '').replace('_', ' ')}.`);
  }
}
