/**
 * How a crew gets through the wall: a truck, a charge, or the ladder (user decision: "vehicle ram and breaching charge become a real mechanic with
 * counters"; "break point is the actual drawn wall segment or gate"). Pure and tested; sim/battle.ts rolls it, the cutscene only draws what it says.
 *
 *   means     what the crew brought: a truck (a driver at the wheel) and/or a satchel charge (a man who carries it). Rarer on Cozy, commoner on Hardcore.
 *   target    the drawn wall segment (or the gate) the approach crosses, found on the real runs, not from a radius. `BreachWhere` is what the scene reads.
 *   odds      one ram or one charge against that wall: the wall kind matters (a chain-link yields, a container wall or a concrete wall mostly does not),
 *             a gate is weaker than the wall round it unless it is reinforced, and the counters stack: bollards, an anti-vehicle ditch / moat / berm
 *             on the approach, the reinforced gate (motor cage, sally gate).
 *   the men   a ram needs its driver alive at the wall and a charge needs its carrier alive to plant it: shoot them first and the attempt fails.
 *
 * Standard stays forgiving (every attempt is worth 0.8 of a Hardcore one), Cozy more so (0.6); a crew with a truck is also likelier on Hardcore.
 * Every counter only ever lowers the odds (property-tested in breachMeans.test.ts).
 */
import { PERIMETER, runFinished, type PerimeterKind, type PerimeterRun, type Pt } from './perimeter';
import type { Difficulty } from './difficulty';
import type { BreachWhere } from './battleTypes';
import type { CrewKind } from './surrender';
import type { GameState } from './state';
import { GATE_SEC, hasGateMotor, hasSallyGate } from './gateSecurity';

export type BreachHow = 'climb' | 'ram' | 'charge';

/** What a crew brought to the wall. */
export interface CrewMeans {
  /** A truck, driven by one of the crew. */
  truck: boolean;
  /** Satchel charges (each opens a wall about as well as a Hardcore crew can hope to). */
  satchels: number;
}

/** How well an attempt does on each difficulty (Standard forgiving, Hardcore harsher). */
export const MEANS_DIFF: Record<Difficulty, { odds: number; truck: number; satchel: number }> = {
  cozy: { odds: 0.6, truck: 0.5, satchel: 0.4 },
  standard: { odds: 0.8, truck: 1, satchel: 1 },
  hardcore: { odds: 1, truck: 1.5, satchel: 1.6 },
};

/** The chance a crew of this kind has a truck at all (before difficulty and how far into the collapse it is). */
const TRUCK_BASE: Record<CrewKind, number> = { gang: 0.45, requisition: 0.45, militia: 0.4, patrol: 0.4, looters: 0.25, other: 0.12, refugees: 0, tunnelers: 0, horde: 0 };
const SATCHEL_BASE: Record<CrewKind, number> = { gang: 0.22, militia: 0.18, patrol: 0.15, requisition: 0.1, looters: 0.04, other: 0.04, refugees: 0, tunnelers: 0.1, horde: 0 };

/** What the crew brought. `late` is 0-1 (how far into the collapse: fuel for trucks, a looted armory for charges); `r` a seeded draw. */
export function crewMeans(c: { kind: CrewKind; men: number; organized: boolean; armed: boolean; late: number; difficulty: Difficulty }, r: () => number): CrewMeans {
  const d = MEANS_DIFF[c.difficulty] ?? MEANS_DIFF.standard;
  if (!c.armed || c.men < 3) return { truck: false, satchels: 0 };
  const fuel = 0.55 + 0.45 * Math.min(1, c.late * 2);   // a pickup runs on what they have found
  const truck = r() < Math.min(0.9, TRUCK_BASE[c.kind] * d.truck * fuel * (c.men >= 5 ? 1 : 0.6));
  const satchels = c.organized && r() < Math.min(0.7, SATCHEL_BASE[c.kind] * d.satchel * (0.4 + 0.6 * Math.min(1, c.late * 1.5))) ? 1 : 0;
  return { truck, satchels };
}

/** A wall's resistance: the chance ONE truck hit (ram) or ONE satchel (blast) opens it, before the counters. */
export const WALL_RESIST: Record<PerimeterKind, { ram: number; blast: number }> = {
  split_rail: { ram: 0.95, blast: 0.95 }, barbed_wire: { ram: 0.9, blast: 0.95 }, woven_wire: { ram: 0.85, blast: 0.95 }, chain_link: { ram: 0.8, blast: 0.92 },
  thorn_hedge: { ram: 0.6, blast: 0.9 }, log_palisade: { ram: 0.6, blast: 0.85 }, wrought_iron: { ram: 0.4, blast: 0.7 }, iron_barbed: { ram: 0.4, blast: 0.7 },
  bar_fence: { ram: 0.4, blast: 0.7 }, container_wall: { ram: 0.3, blast: 0.65 }, container_stack: { ram: 0.14, blast: 0.5 }, steel_wall: { ram: 0.16, blast: 0.42 },
  electric_steel: { ram: 0.16, blast: 0.42 }, concrete_wall: { ram: 0.12, blast: 0.45 }, stone_wall: { ram: 0.2, blast: 0.45 }, earth_berm: { ram: 0.12, blast: 0.45 },
  creek_bars: { ram: 0.35, blast: 0.6 }, covered_walkway: { ram: 0.5, blast: 0.7 }, covered_bridge: { ram: 0.5, blast: 0.7 },
  // a trench no truck crosses; a charge only fills it in a little
  ditch: { ram: 0, blast: 0.1 }, moat: { ram: 0, blast: 0.05 },
  water_pipe: { ram: 0.95, blast: 0.95 }, power_cable: { ram: 0.95, blast: 0.95 }, escape_tunnel: { ram: 0.2, blast: 0.4 }, underground_passage: { ram: 0.2, blast: 0.4 }, wall_walk: { ram: 0.3, blast: 0.5 },
  tunnel_bridge: { ram: 0.2, blast: 0.4 }, slope_tunnel: { ram: 0.2, blast: 0.4 }, rock_tunnel: { ram: 0.1, blast: 0.3 }, drain_channel: { ram: 0.9, blast: 0.9 },
};
const resistOf = (k: string): { ram: number; blast: number } => WALL_RESIST[k as PerimeterKind] ?? { ram: 0.4, blast: 0.6 };

/** A gate is weaker than the wall round it: leaves on hinges. Its base odds against a ram and a charge. */
export const GATE_BASE = { ram: 0.55, blast: 0.85 } as const;

/** Bollards set in concrete across the approach (the shop good `bollards`): a truck is stopped or slowed. */
export const BOLLARD = { gate: 0.3, wall: 0.6, blast: 1 } as const;

export interface MeansCounters {
  /** The yard has bollards. */
  bollards: boolean;
  /** Reinforced-gate points: the caged motor (+3) and the double gate (+6), the same points that harden the gate in a fight (sim/gateSecurity.ts). */
  gateBarrier: number;
  /** 0-1: the share of the approach a truck cannot cross (an anti-vehicle ditch, a moat or a berm in front of the target). */
  vehicleBlocked: number;
}

/** The counters at this place for a target (pure given the runs). */
export function countersOf(s: Pick<GameState, 'stock' | 'perimeter' | 'utilities' | 'disaster'>, where: { x: number; z: number } | null, home: { x: number; z: number }, targetRun: string | null): MeansCounters {
  const g = s as GameState;
  const bollards = Math.floor(s.stock.bollards ?? 0) >= 1;
  const gateBarrier = (hasGateMotor(g) ? GATE_SEC.MOTOR.barrier : 0) + (hasSallyGate(g) ? GATE_SEC.SALLY.barrier : 0);
  let blocked = 0;
  if (where) {
    const dT = Math.hypot(where.x - home.x, where.z - home.z) || 1, ux = (where.x - home.x) / dT, uz = (where.z - home.z) / dT;
    for (const run of s.perimeter) {
      if (!runFinished(run) || run.id === targetRun) continue;
      const def = PERIMETER[run.kind];
      if (!def || def.blocks.vehicles < 0.85 || def.height > 0.35 || (run.kind !== 'ditch' && run.kind !== 'moat' && run.kind !== 'earth_berm')) continue;
      // in front of the target: a stretch of the run lies on the approach, farther out than the wall, within a truck's width of the line (sampled along each piece)
      let cover = 0;
      for (let i = 1; i < run.pts.length; i++) {
        const [ax, az] = run.pts[i - 1] as Pt, [bx, bz] = run.pts[i] as Pt, steps = Math.min(40, Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az))));
        for (let k = 0; k <= steps; k++) {
          const x = ax + (bx - ax) * k / steps, z = az + (bz - az) * k / steps;
          const along = (x - home.x) * ux + (z - home.z) * uz, side = Math.abs((x - home.x) * -uz + (z - home.z) * ux);
          if (along >= dT - 1 && along <= dT + 18 && side <= 9) cover = Math.max(cover, 1 - side / 12);
        }
      }
      blocked = Math.max(blocked, def.blocks.vehicles * Math.min(1, cover * 1.2));
    }
  }
  return { bollards, gateBarrier, vehicleBlocked: Math.min(1, blocked) };
}

/** The chance one ram opens the target. 0 when nothing can reach it; every counter only lowers it. */
export function ramOdds(a: { wallKind: string; gate: boolean; difficulty: Difficulty } & MeansCounters): number {
  const d = MEANS_DIFF[a.difficulty] ?? MEANS_DIFF.standard;
  let p = a.gate ? GATE_BASE.ram - 0.035 * a.gateBarrier : resistOf(a.wallKind).ram;
  p = Math.max(a.gate ? 0.1 : 0, p);
  if (a.bollards) p *= a.gate ? BOLLARD.gate : BOLLARD.wall;
  p *= 1 - a.vehicleBlocked;
  return Math.max(0, Math.min(0.95, p * d.odds));
}

/** The chance one satchel opens the target (a bollard does nothing against a charge; a reinforced gate helps a little). */
export function blastOdds(a: { wallKind: string; gate: boolean; difficulty: Difficulty } & Pick<MeansCounters, 'gateBarrier'>): number {
  const d = MEANS_DIFF[a.difficulty] ?? MEANS_DIFF.standard;
  const p = a.gate ? Math.max(0.35, GATE_BASE.blast - 0.03 * a.gateBarrier) : resistOf(a.wallKind).blast;
  return Math.max(0, Math.min(0.95, p * d.odds));
}

/** The reason an attempt failed, for the card and the scene. */
export type AttemptWhy = 'ok' | 'driver_down' | 'carrier_down' | 'bollards' | 'ditch' | 'wall_held' | 'gate_held';
export interface BreachAttempt { how: 'ram' | 'charge'; ok: boolean; why: AttemptWhy; t: number; /** The odds it was rolled at. */ odds: number }

/** The reason a ram that was rolled and failed gives (the strongest counter at the place). */
export function whyRamFailed(c: MeansCounters, gate: boolean): AttemptWhy {
  if (c.vehicleBlocked >= 0.5) return 'ditch';
  if (c.bollards) return 'bollards';
  return gate ? 'gate_held' : 'wall_held';
}

/** The way a crew prefers to take the wall: the best odds among what it has (a charge when it has one and the truck is blocked, else the truck). */
export function chooseHow(m: CrewMeans, ram: number, blast: number): BreachHow {
  if (m.truck && m.satchels > 0) return ram >= blast * 0.8 ? 'ram' : 'charge';
  if (m.truck && ram >= 0.04) return 'ram';
  if (m.satchels > 0 && blast >= 0.04) return 'charge';
  return 'climb';
}

// ── the drawn wall ──────────────────────────────────────────────────────────────────────────────────────────────

const PASS = 0.5;
const solid = (run: PerimeterRun): boolean => {
  const def = PERIMETER[run.kind];
  return !!def && runFinished(run) && def.blocks.people >= PASS && def.height >= 0.2 && run.pts.length >= 2 && run.kind !== 'moat' && run.kind !== 'ditch';
};

/** The point at distance `at` along a run, and the wall's direction there. */
function along(run: PerimeterRun, at: number): { x: number; z: number; hx: number; hz: number } {
  let acc = 0;
  for (let i = 1; i < run.pts.length; i++) {
    const [ax, az] = run.pts[i - 1] as Pt, [bx, bz] = run.pts[i] as Pt, len = Math.hypot(bx - ax, bz - az) || 1e-9;
    if (acc + len >= at || i === run.pts.length - 1) { const t = Math.max(0, Math.min(1, (at - acc) / len)); return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, hx: (bx - ax) / len, hz: (bz - az) / len }; }
    acc += len;
  }
  return { x: run.pts[0][0], z: run.pts[0][1], hx: 1, hz: 0 };
}

/**
 * The drawn wall segment (or gate) the crew meets: the outermost solid run the approach line from the house crosses within `maxD`. With a gate within a
 * few units of the crossing the gate is the target when `preferGate` (a ram goes for the leaves). Null when no solid drawn wall lies on the approach
 * (no wall at all, an open gate in the way, a ditch alone): the line then is the house itself and nothing is broken.
 */
export function wallTarget(runs: readonly PerimeterRun[], home: { x: number; z: number }, dir: { x: number; z: number }, opts: { width: number; preferGate: boolean; maxD?: number }): BreachWhere | null {
  const maxD = opts.maxD ?? 45;
  let best: { run: PerimeterRun; d: number; at: number; px: number; pz: number; hx: number; hz: number } | null = null;
  for (const run of runs) {
    if (!solid(run)) continue;
    let acc = 0;
    for (let i = 1; i < run.pts.length; i++) {
      const [ax, az] = run.pts[i - 1] as Pt, [bx, bz] = run.pts[i] as Pt, ex = bx - ax, ez = bz - az, len = Math.hypot(ex, ez);
      const den = dir.x * ez - dir.z * ex;
      if (len > 1e-9 && Math.abs(den) > 1e-9) {
        const t = ((ax - home.x) * ez - (az - home.z) * ex) / den, u = ((ax - home.x) * dir.z - (az - home.z) * dir.x) / den;
        if (t > 1 && t <= maxD && u >= 0 && u <= 1 && (!best || t > best.d)) best = { run, d: t, at: acc + u * len, px: ax + ex * u, pz: az + ez * u, hx: ex / len, hz: ez / len };
      }
      acc += len;
    }
  }
  if (!best) return null;
  let at = best.at, gateHit = false;
  const total = best.run.pts.reduce((a, p, i, arr) => (i ? a + Math.hypot(p[0] - arr[i - 1][0], p[1] - arr[i - 1][1]) : 0), 0);
  // a gate close to the crossing: a ram goes for it, a climb or a charge takes the wall beside it
  const gate = [...best.run.gates].filter(g => !g.breach).sort((a, b) => Math.abs(a.at - at) - Math.abs(b.at - at))[0];
  if (gate && Math.abs(gate.at - at) <= gate.w / 2 + 3) {
    if (opts.preferGate) { at = gate.at; gateHit = true; }
    else if (Math.abs(gate.at - at) < gate.w / 2 + opts.width / 2 + 0.05) at = gate.at + Math.sign(at - gate.at || 1) * (gate.w / 2 + opts.width / 2 + 0.1);
  }
  at = Math.max(opts.width / 2 + 0.05, Math.min(Math.max(opts.width / 2 + 0.05, total - opts.width / 2 - 0.05), at));
  const q = along(best.run, at);
  // out: the side of the wall away from the house
  let nx = -q.hz, nz = q.hx;
  if ((q.x - home.x) * nx + (q.z - home.z) * nz < 0) { nx = -nx; nz = -nz; }
  return { runId: best.run.id, kind: best.run.kind, gate: gateHit, at, x: q.x, z: q.z, w: gateHit ? (gate?.w ?? opts.width) : opts.width, heading: Math.atan2(q.hx, q.hz), out: { x: nx, z: nz }, dist: Math.hypot(q.x - home.x, q.z - home.z) };
}

/** Seconds the truck needs from the spawn to the wall: about 25 mph on the last stretch, plus a few seconds to get lined up. */
export const TRUCK_UNITS_PER_S = 1.9;
export const truckSeconds = (distance: number): number => 3 + Math.max(0, distance) / TRUCK_UNITS_PER_S;
/** Seconds from planting a satchel to the blast. */
export const FUSE_S = 4;
