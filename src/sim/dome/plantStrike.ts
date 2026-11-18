/**
 * A raid on the dome's plant (owner decision of 2026-11-18): raiders who cannot take the people may try to starve the dome out, so a crew that got past
 * the line can go for the machinery. Pure rules (tested in plantStrike.test.ts), applied after a fight by `strikePlant` (called from raidDamage.ts).
 *
 *  target    `plantTargetOdds`: nothing reachable, nothing happens. An organized crew goes for the plant far more often than a rabble; a sealed dome,
 *            and one whose shell no crew can open (the arcology), make it the best plan left; a crew that has overrun the houses is after loot, not
 *            machinery; towers and guards watching the yard put a crew off. Never above 85 percent, never below zero.
 *  reach     the yard stands outside: a crew has to breach its wall or its gate (the ordinary wall model: `ramOdds` and `blastOdds` of a poured-concrete
 *            wall, the steel gate's counters, then the defenders' fire from towers and guards in reach); without a truck or a charge a concrete wall holds.
 *            What stands inside the shell (the glass dome's plant yard, the arcology's service gallery, the roof vents) is reachable only if the shell was opened
 *            in this fight: a panel cut or shot out (inside, vents), an airlock forced (gallery).
 *  what      a crew takes the units that most starve the dome, in the order `SIEGE_ORDER` (the substation first, then the scrubber house when the dome is
 *            sealed, then the chillers): as many as it has men for (one per three, one to three). A charge or a ram wrecks a unit; hand tools only damage.
 */
import type { GameState } from '../state';
import { dayIndex } from '../state';
import type { Battle } from '../battleTypes';
import { blastOdds, countersOf, ramOdds } from '../breachMeans';
import { towersBuilt } from '../towers';
import { onDuty } from '../guards';
import { isHome } from '../blueprints';
import { isFinished } from '../construction';
import { yardGeometry, YARD_GATE_BARRIER, YARD_WALL, type YardGeom } from './plantYard';
import { type PlantKind, type PlantPlace, type PlantUnit } from './plantUnits';
import { domesOf as liveDomes, stateOf, type DomeRef, type DomeState } from './live';
import { damagePlant, unitsOf } from './plantLive';

/** The order a crew that means to starve the dome out goes for the units (first is best). */
export const SIEGE_ORDER: readonly PlantKind[] = ['substation', 'air', 'chiller', 'water', 'battery', 'vents'];
/** The order for a dome that is not sealed (nobody is breathing its air): the climate and the power first. */
export const SIEGE_ORDER_OPEN: readonly PlantKind[] = ['substation', 'chiller', 'air', 'water', 'battery', 'vents'];

export interface Reach { yardBreached: boolean; shellOpened: boolean; airlockForced: boolean }
/** Can a crew touch a unit that stands at `place`, given what it opened? (`vents` stand in the shell itself.) */
export function reachable(place: PlantPlace, kind: PlantKind, r: Reach): boolean {
  if (place === 'yard') return r.yardBreached;
  if (place === 'gallery') return r.airlockForced;
  return kind === 'vents' ? r.shellOpened || r.airlockForced : r.shellOpened || r.airlockForced;
}

export interface TargetCtx {
  organized: boolean;
  /** The dome is sealed (lockdown), and so a siege is the plan. */
  sealed: boolean;
  /** The shell cannot be opened by a crew (the arcology's panels). */
  impervious: boolean;
  /** The houses fell: they are after loot. */
  overrun: boolean;
  /** Is anything of the plant reachable at all (a yard a crew can breach, or a shell it opened)? */
  anyReachable: boolean;
  /** 0..1: how much towers and guards in reach of the yard put a crew off. */
  cover: number;
}
/** The chance a crew that got past the line goes for the plant. */
export function plantTargetOdds(c: TargetCtx): number {
  if (!c.anyReachable) return 0;
  let p = c.organized ? 0.35 : 0.08;
  if (c.sealed) p *= 1.8;
  if (c.impervious) p *= 1.5;
  if (c.overrun) p *= 0.5;
  p *= 1 - 0.5 * Math.max(0, Math.min(1, c.cover));
  return Math.max(0, Math.min(0.85, p));
}

/** How hard towers and guards in reach of the yard make a breach (0..1, never above 0.6): each tower in reach 0.18, each guard on duty 0.08. */
export function yardCover(s: GameState, yard: Pick<YardGeom, 'center'>, ox: number, oz: number): number {
  const cx = ox + yard.center[0], cz = oz + yard.center[1];
  let c = 0;
  for (const { st, def } of towersBuilt(s)) if (Math.hypot(st.x - cx, st.z - cz) <= def.post.reach) c += 0.18;
  c += 0.08 * onDuty(s).length;
  return Math.min(0.6, c);
}

/** The chance the crew gets through the yard wall: its best attempt (a ram at the gate, a charge at the gate or wall) against the walls and gate, less the defenders' cover. Zero with no truck and no charge. */
export function yardBreachOdds(a: { truck: boolean; satchels: number; difficulty: 'cozy' | 'standard' | 'hardcore'; cover: number; bollards?: boolean; vehicleBlocked?: number; gateBarrier?: number }): number {
  const base = { wallKind: YARD_WALL as string, difficulty: a.difficulty, bollards: !!a.bollards, vehicleBlocked: a.vehicleBlocked ?? 0, gateBarrier: (a.gateBarrier ?? 0) + YARD_GATE_BARRIER };
  const ram = a.truck ? ramOdds({ ...base, gate: true }) : 0;
  const blast = a.satchels > 0 ? 1 - Math.pow(1 - Math.max(blastOdds({ ...base, gate: true }), blastOdds({ ...base, gate: false })), a.satchels) : 0;
  const p = 1 - (1 - ram) * (1 - blast);
  return Math.max(0, p * (1 - Math.max(0, Math.min(0.6, a.cover))));
}

/** The units a crew takes, best first, up to `n` of those it can reach. */
export function pickUnits(units: readonly PlantUnit[], n: number, sealed: boolean, r: Reach): PlantUnit[] {
  const order = sealed ? SIEGE_ORDER : SIEGE_ORDER_OPEN;
  const rank = (u: PlantUnit): number => order.indexOf(u.kind) * 2 + (u.spare ? 1 : 0);
  return units.filter(u => u.cond !== 'down' && reachable(u.place, u.kind, r)).sort((a, b) => rank(a) - rank(b)).slice(0, Math.max(0, n));
}

/** How many units a crew of `men` goes for: one per three, one to three. */
export const unitsFor = (men: number): number => Math.max(1, Math.min(3, Math.floor(men / 3)));

const crewOf = (b: Battle | null) => ({ men: b ? b.units.filter(u => u.side === 'raider').length : 0, means: b?.raid?.breach?.crewHad ?? { truck: false, satchels: 0 }, organized: ['gang', 'militia', 'patrol', 'requisition'].includes(b?.raid?.crew ?? '') });

/**
 * After a fight the crew got through the line in: maybe it goes for the plant. Mutates the state (repair jobs, the log) and returns the lines for the outcome
 * card. `shell` says what the fight opened of the shell (a panel cut or shot out, an airlock door forced). Deterministic given `r`.
 */
export function strikePlant(s: GameState, battle: Battle | null, overrun: boolean, r: () => number, shell: { opened: boolean; airlock: boolean }): string[] {
  const home = s.structures.find(st => isFinished(st) && isHome(st.kind));
  if (!home) return [];
  const crew = crewOf(battle), diff = s.disaster.difficulty ?? 'standard';
  const lines: string[] = [];
  for (const d of liveDomes(s)) {
    if (Math.hypot(home.x - d.st.x, home.z - d.st.z) >= d.r) continue;   // only a dome over the home is the target
    const st = stateOf(s, d);
    const units = unitsOf(s, d, st);
    if (!units.length) continue;
    const yard = yardGeometry(d.tier, d.r, d.st.rot);
    const counters = countersOf(s, yard ? { x: d.st.x + yard.gate.x, z: d.st.z + yard.gate.z } : null, home, null);
    const cover = yard ? yardCover(s, yard, d.st.x, d.st.z) : 0;
    const breachP = yard ? yardBreachOdds({ truck: crew.means.truck, satchels: crew.means.satchels, difficulty: diff, cover, bollards: counters.bollards, vehicleBlocked: counters.vehicleBlocked, gateBarrier: counters.gateBarrier }) : 0;
    const base: Reach = { yardBreached: false, shellOpened: shell.opened, airlockForced: shell.airlock };
    const anyReachable = breachP > 0 || units.some(u => reachable(u.place, u.kind, base));
    const odds = plantTargetOdds({ organized: crew.organized, sealed: st.lockdown, impervious: d.tier === 'arcology', overrun, anyReachable, cover });
    if (!(r() < odds)) continue;
    const yardBreached = yard ? r() < breachP : false;
    if (yard && !yardBreached && !units.some(u => reachable(u.place, u.kind, base))) {
      lines.push(`A part of the crew went for the plant yard against the dome. The concrete wall and the steel gate held${cover > 0 ? ', with the towers and the watch firing on them' : ''}; nothing inside was touched.`);
      continue;
    }
    const reach: Reach = { ...base, yardBreached };
    const hit = pickUnits(units, unitsFor(crew.men), st.lockdown, reach);
    if (!hit.length) continue;
    const heavy = yardBreached && (crew.means.truck || crew.means.satchels > 0);
    const dead: string[] = [];
    for (const u of hit) {
      const cond = heavy && r() < 0.6 ? 'down' : r() < 0.35 ? 'down' : 'damaged';
      const line = damagePlant(s, d, st, u.id, cond, 'raid');
      if (line) dead.push(line);
    }
    if (dead.length) { lines.push(yardBreached ? 'They broke into the plant yard.' : 'They went for the dome\'s machinery.', ...dead); }
  }
  return lines;
}

/** A fire that reached the yard or the plant: a unit near each fire point is scorched. */
export function plantFires(s: GameState, fires: ReadonlyArray<{ x: number; z: number }>, r: () => number): string[] {
  const lines: string[] = [];
  for (const d of liveDomes(s)) {
    const yard = yardGeometry(d.tier, d.r, d.st.rot);
    if (!yard) continue;
    const near = fires.some(f => Math.hypot(f.x - (d.st.x + yard.center[0]), f.z - (d.st.z + yard.center[1])) < yard.W * 0.5 + 1.2);
    if (!near) continue;
    const st = stateOf(s, d), u = unitsOf(s, d, st).filter(x => x.place === 'yard' && x.cond === 'ok')[0];
    if (u) { const l = damagePlant(s, d, st, u.id, r() < 0.3 ? 'down' : 'damaged', 'fire'); if (l) lines.push(l); }
  }
  return lines;
}

/** What a strike leaves in the family's eyes, for the radio and the card: the open plant jobs of the day. */
export const plantHitToday = (s: GameState): boolean => (s.raidDamage ?? []).some(j => j.kind === 'plant' && j.done < j.hours && j.day === dayIndex(s.clock.t));
export type { DomeRef, DomeState };
