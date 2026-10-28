/**
 * Perimeter: fences, hedges, walls, berms and ditches drawn as lines and
 * built by the family (docs/DECISIONS.md; user's list: barbed wire, thorn
 * hedges, shipping-container walls, moats). Each kind is costed per world
 * unit of length (≈ 6 m): person-hours and materials, all taken when work
 * on the run starts. Thorn hedges are planted, then grow for years before
 * they stop anything. Pure (tested).
 *
 * What a run does is described by `blocks` (how well it stops people,
 * animals and vehicles, 0–1) and `sight` (how much view it cuts, 0–1) at
 * `height` — the threat and sightline systems read these.
 */
import { hasAll, shortfall, MATERIALS, type MaterialId, type Stock } from './materials';
import { log } from './economy';
import { wearTools, workSpeed } from './tools';
import type { GameState } from './state';

export type PerimeterKind = 'split_rail' | 'barbed_wire' | 'woven_wire' | 'thorn_hedge' | 'log_palisade' | 'container_wall' | 'earth_berm' | 'ditch' | 'creek_bars' | 'chain_link' | 'wrought_iron' | 'iron_barbed' | 'steel_wall' | 'electric_steel' | 'water_pipe' | 'power_cable' | 'escape_tunnel';

export interface PerimeterDef {
  id: PerimeterKind;
  name: string;
  blurb: string;
  /** Per world unit of length (≈ 6 m). */
  hours: number;
  materials: Partial<Stock>;
  /** Height above the ground (world units; a ditch is negative depth). */
  height: number;
  blocks: { people: number; animals: number; vehicles: number };
  /** Share of the view it cuts (at full growth). */
  sight: number;
  /** Years to full growth (hedges); 0 = full strength when built. */
  growYears: number;
  /**
   * A way out that only opens from inside (the escape tunnel): nothing from
   * outside can enter by it, whatever it brings. See `canEnter`.
   */
  egressOnly?: boolean;
}

export const PERIMETER: Record<PerimeterKind, PerimeterDef> = {
  split_rail: { id: 'split_rail', name: 'Split-rail fence', blurb: 'Keeps stock in and marks the line. Stops no one.', hours: 3, materials: { lumber: 0.35 }, height: 0.2, blocks: { people: 0.1, animals: 0.5, vehicles: 0.2 }, sight: 0, growYears: 0 },
  barbed_wire: { id: 'barbed_wire', name: 'Barbed-wire fence', blurb: 'Four strands on steel T-posts. Slows walkers, turns cattle.', hours: 2.5, materials: { wire: 0.08, hardware: 0.06 }, height: 0.22, blocks: { people: 0.35, animals: 0.6, vehicles: 0.25 }, sight: 0, growYears: 0 },
  woven_wire: { id: 'woven_wire', name: 'Game fence (woven wire)', blurb: '2.4 m woven wire on wood posts: deer, coyotes and dogs stay out.', hours: 4, materials: { wire: 0.2, lumber: 0.2 }, height: 0.4, blocks: { people: 0.5, animals: 0.95, vehicles: 0.3 }, sight: 0.1, growYears: 0 },
  thorn_hedge: { id: 'thorn_hedge', name: 'Thorn hedge', blurb: 'Hawthorn and wild rose whips, double row. Cheap, but 4 years to become a wall you can\'t see through.', hours: 2, materials: { seedlings: 0.5 }, height: 0.42, blocks: { people: 0.9, animals: 0.75, vehicles: 0.6 }, sight: 0.85, growYears: 4 },
  log_palisade: { id: 'log_palisade', name: 'Log palisade', blurb: 'Your own logs set upright in a trench and pointed. Heavy work, solid wall.', hours: 14, materials: { logs: 3 }, height: 0.5, blocks: { people: 0.85, animals: 0.95, vehicles: 0.7 }, sight: 1, growYears: 0 },
  container_wall: { id: 'container_wall', name: 'Container wall', blurb: 'Used 40 ft shipping containers end to end (each is also storage). Fast with a rented crane; costly.', hours: 3, materials: { container: 0.5 }, height: 0.43, blocks: { people: 0.9, animals: 1, vehicles: 1 }, sight: 1, growYears: 0 },
  earth_berm: { id: 'earth_berm', name: 'Earth berm', blurb: 'A 2 m bank of earth. Stops vehicles and bullets and hides what\'s behind it. Weeks of shovel work.', hours: 30, materials: {}, height: 0.3, blocks: { people: 0.35, animals: 0.2, vehicles: 0.9 }, sight: 1, growYears: 0 },
  water_pipe: { id: 'water_pipe', name: 'Water line (buried)', blurb: 'PEX pipe in a trench below the frost line (1.2 m) so it never freezes. Joins wells, cisterns and towers to the houses.', hours: 5, materials: { pipe: 0.2 }, height: 0, blocks: { people: 0, animals: 0, vehicles: 0 }, sight: 0, growYears: 0 },
  power_cable: { id: 'power_cable', name: 'Power cable (buried)', blurb: 'Direct-burial cable in conduit, 60 cm down. Joins the solar, batteries and generator to the buildings.', hours: 3, materials: { cable: 0.2 }, height: 0, blocks: { people: 0, animals: 0, vehicles: 0 }, sight: 0, growYears: 0 },
  escape_tunnel: { id: 'escape_tunnel', name: 'Escape tunnel', blurb: 'A long poured-concrete vault you walk upright in (60 m to half a mile and more, on under the neighbors\' land if need be) from a bunker room to a hidden hatch far out in the woods, away from any fighting. A way out for the family, never a way in: a blast door barred from the bunker side, and an exit lid with no handle outside, its hinges and drop-bolts on the underside, buried under soil, leaves and fallen branches.', hours: 36, materials: { culvert: 1, excavator: 0.3 }, height: 0, blocks: { people: 0, animals: 0, vehicles: 0 }, sight: 0, growYears: 0, egressOnly: true },
  creek_bars: { id: 'creek_bars', name: 'Creek bars (steel)', blurb: 'Vertical steel bars set in the bed and banks right across the creek, 15 cm apart: water, ice-free flow, fish and driftwood pass; a person can\'t swim, wade or climb through. Without one at each place the creek crosses your line, the creek is the way in round any wall or gate.', hours: 14, materials: { rebar: 0.7, hardware: 0.1 }, height: 0.3, blocks: { people: 0.92, animals: 0.6, vehicles: 1 }, sight: 0, growYears: 0 },
  chain_link: { id: 'chain_link', name: 'Chain-link fence', blurb: '1.8 m galvanized chain-link on steel posts. A real fence: climbable and cuttable, but it turns most people round. First step up from woven wire.', hours: 5, materials: { wire: 0.25, hardware: 0.1 }, height: 0.3, blocks: { people: 0.55, animals: 0.97, vehicles: 0.35 }, sight: 0.05, growYears: 0 },
  wrought_iron: { id: 'wrought_iron', name: 'Wrought-iron fence', blurb: 'Forged pickets with spear points set in a low stone footing, 2 m tall. Hard to climb, impossible to cut with hand tools, and it lets you see out.', hours: 14, materials: { rebar: 0.8, hardware: 0.3, concrete: 0.4 }, height: 0.34, blocks: { people: 0.68, animals: 0.98, vehicles: 0.5 }, sight: 0.1, growYears: 0 },
  iron_barbed: { id: 'iron_barbed', name: 'Wrought iron with barbed wire', blurb: 'The iron fence with three strands of barbed wire on outward-leaning arms. Going over it costs skin.', hours: 17, materials: { rebar: 0.8, hardware: 0.3, concrete: 0.4, wire: 0.12 }, height: 0.38, blocks: { people: 0.78, animals: 0.98, vehicles: 0.55 }, sight: 0.1, growYears: 0 },
  steel_wall: { id: 'steel_wall', name: 'Reinforced steel wall', blurb: '2.8 m steel plate panels bolted to concrete-filled posts on a poured footing, razor wire along the top. Stops vehicles and most tools; they need explosives or a lot of time.', hours: 26, materials: { rebar: 1.1, concrete: 0.8, hardware: 0.3, wire: 0.1 }, height: 0.47, blocks: { people: 0.93, animals: 1, vehicles: 0.9 }, sight: 0.6, growYears: 0 },
  electric_steel: { id: 'electric_steel', name: 'Electrified steel wall', blurb: 'The steel wall with an energized wire on stand-offs along the top and warning signs. Needs power (a battery bank is enough): without it, it is only a steel wall. A shock drops a man; it rarely kills, but a gate left open or a child who climbs is at risk.', hours: 32, materials: { rebar: 1.1, concrete: 0.8, hardware: 0.3, wire: 0.1, cable: 0.2 }, height: 0.5, blocks: { people: 0.97, animals: 1, vehicles: 0.9 }, sight: 0.6, growYears: 0 },
  ditch: { id: 'ditch', name: 'Ditch / dry moat', blurb: 'A 2 m deep, 3 m wide ditch. No vehicle crosses; the spoil can build a berm.', hours: 40, materials: {}, height: -0.33, blocks: { people: 0.45, animals: 0.3, vehicles: 1 }, sight: 0, growYears: 0 },
};

export const PERIMETER_ORDER: readonly PerimeterKind[] = ['split_rail', 'barbed_wire', 'woven_wire', 'thorn_hedge', 'log_palisade', 'container_wall', 'earth_berm', 'ditch', 'creek_bars', 'chain_link', 'wrought_iron', 'iron_barbed', 'steel_wall', 'electric_steel'];
/** Lines that carry utilities (drawn with the same tool, under Water & power). */
export const UTILITY_LINES: readonly PerimeterKind[] = ['water_pipe', 'power_cable'];

export type Pt = [number, number];

/** A gap left in a run for a gate (distance along the run, width). */
export interface Gate { at: number; w: number }

export interface PerimeterRun {
  id: string;
  kind: PerimeterKind;
  pts: Pt[];
  gates: Gate[];
  /** Person-hours done of `hours`. */
  done: number;
  hours: number;
  /** Materials taken from the stockpile (work can start). */
  supplied: boolean;
  /** Game time it was finished (planted, for hedges), or null. */
  finishedAt: number | null;
  /** An upgrade of this finished run: the old tier keeps working until this one is done, then goes (its materials half back). */
  replaces?: string;
}

/** The next tier up, where there is one (upgraded in place: sim `upgradeRun`). */
export const UPGRADE_NEXT: Partial<Record<PerimeterKind, PerimeterKind>> = {
  split_rail: 'barbed_wire', barbed_wire: 'woven_wire', woven_wire: 'chain_link', chain_link: 'wrought_iron',
  wrought_iron: 'iron_barbed', iron_barbed: 'steel_wall', steel_wall: 'electric_steel',
};
/** Share of the old tier's materials that comes back when its upgrade is finished. */
export const SALVAGE = 0.5;

/** Is there power for an energized wire? (a lit building, or the grid while it works) */
export const fenceLive = (s: GameState): boolean => s.utilities.lit.length > 0 || (s.utilities.grid && s.disaster.tracks.grid > 0.5);

/** How well a run stops people right now: an electrified wall with no power is just a steel wall. */
export function peopleBlock(s: GameState, r: Pick<PerimeterRun, 'kind'>): number {
  if (r.kind === 'electric_steel' && !fenceLive(s)) return PERIMETER.steel_wall.blocks.people;
  return PERIMETER[r.kind].blocks.people;
}

export function runLength(pts: readonly Pt[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
}

/** Length that is built wall (gates excluded). */
export function wallLength(run: Pick<PerimeterRun, 'pts' | 'gates'>): number {
  return Math.max(0, runLength(run.pts) - run.gates.reduce((a, g) => a + g.w, 0));
}

/** Materials for a run (whole units, rounded up per material). */
export function runBill(kind: PerimeterKind, len: number): Partial<Stock> {
  const out: Partial<Stock> = {};
  for (const [k, v] of Object.entries(PERIMETER[kind].materials) as Array<[MaterialId, number]>) out[k] = Math.max(1, Math.ceil(v * len - 1e-9));
  // the tunnel's two locks: a blast door at the bunker end, the egress hatch at the far end
  if (kind === 'escape_tunnel') Object.assign(out, { blast_door: 1, egress_hatch: 1, concrete: 4 });
  return out;
}

/**
 * Can someone come in by this run from `side`? Fences and walls are not
 * ways in at all (they are barriers: see runStops); the escape tunnel is a
 * way in only from inside the compound, and never from outside: no
 * breaching, no tools, no numbers change that.
 */
export function canEnter(r: Pick<PerimeterRun, 'kind'>, side: 'inside' | 'outside'): boolean {
  if (!PERIMETER[r.kind].egressOnly) return false;
  return side === 'inside';
}

export function runHours(kind: PerimeterKind, len: number): number {
  return PERIMETER[kind].hours * len;
}

/** Earth in a berm and dug out of a ditch, per world unit of length (≈ 6 m), m³. */
export const BERM_M3 = 36, DITCH_M3 = 24;
/** Net earth a tunnel's cut-and-cover leaves over, per unit length (the culvert's volume), m³. */
export const TUNNEL_M3 = 12;
/** Share of a berm's hours saved when its earth comes off the spoil pile (pushed up, not dug). */
export const SPOIL_SAVES = 0.6;

/** Extra person-hours per unit length for the stretch of a tunnel under someone else's land (dug by hand, at night, no excavator). */
export const OFF_PARCEL_HOURS = 40;

/** Plan a run (mutates the draft). `offLen`: how much of it lies beyond the parcel (tunnels only). */
export function planRun(s: GameState, kind: PerimeterKind, pts: Pt[], gates: Gate[] = [], offLen = 0): PerimeterRun {
  const len = wallLength({ pts, gates });
  const hours = runHours(kind, len) + (kind === 'escape_tunnel' ? OFF_PARCEL_HOURS * offLen : 0);
  const run: PerimeterRun = { id: `p${s.nextId++}`, kind, pts, gates, done: 0, hours, supplied: false, finishedAt: null };
  s.perimeter.push(run);
  log(s, `Laid out ${Math.round(len * 6)} m of ${PERIMETER[kind].name.toLowerCase()}.`);
  return run;
}

export const runFinished = (r: PerimeterRun): boolean => r.finishedAt !== null;

/** Why a run can't be upgraded (null = it can). */
export function upgradeProblem(s: GameState, r: PerimeterRun): string | null {
  if (!runFinished(r)) return 'not finished yet';
  const next = UPGRADE_NEXT[r.kind];
  if (!next) return 'nothing better to upgrade to';
  if (s.perimeter.some(x => x.replaces === r.id && !runFinished(x))) return 'an upgrade is already under way';
  return null;
}

/** Upgrade a finished run in place: lay out the next tier over the same line (it works the old one until it's done). */
export function upgradeRun(s: GameState, id: string): string | null {
  const r = s.perimeter.find(x => x.id === id);
  if (!r) return 'no such run';
  const why = upgradeProblem(s, r);
  if (why) return why;
  const next = UPGRADE_NEXT[r.kind]!;
  const run = planRun(s, next, r.pts.map(p => [p[0], p[1]] as Pt), r.gates.map(g => ({ ...g })));
  run.replaces = r.id;
  log(s, `Upgrading the ${PERIMETER[r.kind].name.toLowerCase()} to ${PERIMETER[next].name.toLowerCase()}. The old one stands until the new one is up.`);
  return null;
}

/** Why work on a run can't go on (null = it can). */
export function runBlocked(s: GameState, r: PerimeterRun): string | null {
  if (runFinished(r)) return 'finished';
  if (r.supplied) return null;
  const bill = runBill(r.kind, wallLength(r));
  if (hasAll(s.stock, bill)) return null;
  const miss = shortfall(s.stock, bill);
  return 'Waiting for ' + (Object.entries(miss) as Array<[MaterialId, number]>).map(([k, n]) => `${n} ${MATERIALS[k].name.toLowerCase()}`).join(', ');
}

/** Add person-hours to a run (takes its materials first). */
export function addRunWork(s: GameState, r: PerimeterRun, hours: number): void {
  if (runFinished(r)) return;
  if (!r.supplied) {
    const bill = runBill(r.kind, wallLength(r));
    if (!hasAll(s.stock, bill)) return;
    for (const [k, n] of Object.entries(bill) as Array<[MaterialId, number]>) s.stock[k] -= n;
    r.supplied = true;
    // a berm takes what it can from the spoil pile (bunker digs, ditches): much less shovel work
    if (r.kind === 'earth_berm' && s.stock.spoil > 0) {
      const need = BERM_M3 * wallLength(r), use = Math.min(s.stock.spoil, need);
      s.stock.spoil -= use;
      r.hours *= 1 - SPOIL_SAVES * use / need;
      log(s, `The berm takes ${Math.round(use)} m³ off the spoil pile.`);
    }
  }
  // the family's shovel, pliers and so on (sim/tools.ts)
  const task = { kind: 'fence', run: r.kind } as const, m = workSpeed(s, task);
  if (m <= 0) return;
  wearTools(s, task, hours);
  r.done = Math.min(r.hours, r.done + hours * m);
  if (r.done >= r.hours - 1e-9) {
    r.finishedAt = s.clock.t;
    if (r.kind === 'ditch') s.stock.spoil += Math.round(DITCH_M3 * wallLength(r));
    if (r.kind === 'escape_tunnel') s.stock.spoil += Math.round(TUNNEL_M3 * wallLength(r));
    const d = PERIMETER[r.kind];
    // an upgrade replaces the old tier, and some of its materials come back
    if (r.replaces) {
      const old = s.perimeter.find(x => x.id === r.replaces);
      if (old) {
        for (const [k, q] of Object.entries(runBill(old.kind, wallLength(old))) as Array<[MaterialId, number]>) s.stock[k] += Math.floor(q * SALVAGE);
        s.perimeter = s.perimeter.filter(x => x.id !== old.id);
      }
      r.replaces = undefined;
    }
    log(s, d.growYears ? `${d.name} planted. Give it ${d.growYears} years.` : `${d.name} ${r.kind === 'water_pipe' || r.kind === 'power_cable' ? 'laid' : 'finished'}.`);
  }
}

/** Built fraction 0–1 (drawn along the run). */
export function runProgress(r: PerimeterRun): number {
  return r.hours > 0 ? r.done / r.hours : 1;
}

/** Growth 0–1 (hedges grow over years after planting; others are full when finished). */
export function runGrowth(r: PerimeterRun, t: number): number {
  const d = PERIMETER[r.kind];
  if (!runFinished(r)) return d.growYears ? 0 : runProgress(r);
  if (!d.growYears) return 1;
  return Math.min(1, Math.max(0.05, (t - (r.finishedAt ?? t)) / (d.growYears * 365)));
}

/** How well a run stops `who` now (0–1): its rating × growth (× built). */
export function runStops(r: PerimeterRun, who: keyof PerimeterDef['blocks'], t: number): number {
  return PERIMETER[r.kind].blocks[who] * (runFinished(r) ? runGrowth(r, t) : 0);
}

/** The next run the family can work on. */
export function nextRun(s: GameState): PerimeterRun | null {
  for (const r of s.perimeter) if (!runFinished(r) && runBlocked(s, r) === null) return r;
  return null;
}
