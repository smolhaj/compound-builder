/**
 * The gate and the drive (docs/sa_home_security.md, principle 7; docs/DECISIONS.md "Gate and house"). In South Africa the drive is where hijackings and ambushes
 * happen: the family arrives or leaves with a vehicle and the gate is open. The classic answers are an intercom with a camera, a motor you cannot lift off its
 * rails, a guard, and a double gate (a sally port for vehicles) so a vehicle is never exposed to the road while the outer gate stands open. Pure (tested).
 * Every number is tunable and lives in `GATE_SEC`. All four goods are monotone: each only ever helps (a raid, an ambush, a parley).
 *
 *   gate_intercom   an intercom and a camera on the gate post. Needs power. Warning at the gate, a better chance a parley through the bars is calm, and
 *                   the family sees the drive before it opens: fewer arrival ambushes.
 *   gate_motor      a caged, anti-lift gate motor. The cage keeps the gate wall-strong whether or not there is power; with power the gate is open for a
 *                   shorter time (fewer ambushes); without power the family opens it by hand (the manual release), and the motor adds nothing.
 *   sally_gate      a second gate and two side walls: the outer gate shuts before the inner one opens. A vehicle is never on the road side of an open gate.
 *   gate_house      (sim/richSinks.ts) a guard at the drive: halves the arrival ambush too.
 *
 * The arrival ambush (`arrivalAmbush`) is a vehicle coming home from town at the drive: it is rolled on its own generator in `market.roadHome`.
 */
import { hasGateHouse } from './richSinks';
import { mulberry32 } from './rng';
import { dayIndex, type GameState } from './state';
import type { MaterialId } from './materials';

export const GATE_GOODS = ['gate_intercom', 'gate_motor', 'sally_gate'] as const satisfies readonly MaterialId[];
export type GateGood = typeof GATE_GOODS[number];

export const GATE_SEC = {
  INTERCOM: { detection: 4, parley: 8, ambush: 0.75 },
  MOTOR: { barrier: 3, ambush: 0.8 },
  SALLY: { barrier: 6, ambush: 0.35 },
  /** The guard at the gate house: arrivals are seen and the gate held until they are known. */
  GUARD_AMBUSH: 0.5,
  /** Arrival ambush by vehicle: per trip, a base, plus more as the law goes; more with a haul worth taking; less armed. */
  AMBUSH: { BASE: 0.012, LAWLESS: 0.05, RICH: 1.5, RICH_USD: 200, ARMED: 0.6 },
} as const;

/** Power at the place (the grid while it works, or a lit building): the same rule as sim/gear.ts, kept here so the two files do not import each other. */
const powered = (s: GameState): boolean => s.utilities.lit.length > 0 || (s.utilities.grid && s.disaster.tracks.grid > 0.5);
const n = (s: GameState, m: GateGood): number => Math.floor(s.stock[m] ?? 0);
export const hasIntercom = (s: GameState): boolean => n(s, 'gate_intercom') >= 1;
export const hasGateMotor = (s: GameState): boolean => n(s, 'gate_motor') >= 1;
export const hasSallyGate = (s: GameState): boolean => n(s, 'sally_gate') >= 1;
/** The intercom's camera and the motor need power. */
export const intercomLive = (s: GameState): boolean => hasIntercom(s) && powered(s);
export const motorLive = (s: GameState): boolean => hasGateMotor(s) && powered(s);

/** What the gate kit adds to the posture: warning, wall strength, a parley bonus (points), and the share of arrival ambushes that still happen (1 = none stopped). */
export function gatePosture(s: GameState): { detection: number; barrier: number; parley: number; ambushK: number } {
  const G = GATE_SEC;
  return {
    detection: intercomLive(s) ? G.INTERCOM.detection : 0,
    barrier: (hasSallyGate(s) ? G.SALLY.barrier : 0) + (hasGateMotor(s) ? G.MOTOR.barrier : 0),
    parley: intercomLive(s) ? G.INTERCOM.parley : 0,
    ambushK: (hasSallyGate(s) ? G.SALLY.ambush : 1) * (intercomLive(s) ? G.INTERCOM.ambush : 1) * (motorLive(s) ? G.MOTOR.ambush : 1) * (hasGateHouse(s) ? G.GUARD_AMBUSH : 1),
  };
}

/** The chance a vehicle coming home is ambushed at the drive (0 with the law at full strength is only the base). */
export function arrivalAmbushP(s: GameState, ctx: { carried: number; armed: boolean }): number {
  const A = GATE_SEC.AMBUSH;
  const base = (A.BASE + A.LAWLESS * (1 - s.disaster.tracks.law)) * (ctx.carried > A.RICH_USD ? A.RICH : 1) * (ctx.armed ? A.ARMED : 1);
  return Math.min(0.9, base * gatePosture(s).ambushK);
}

/** Does the vehicle get ambushed at the drive today? Its own generator (does not move the sim's rolls). */
export function bareAmbushP(s: GameState, ctx: { carried: number; armed: boolean }): number {
  const A = GATE_SEC.AMBUSH;
  return Math.min(0.9, (A.BASE + A.LAWLESS * (1 - s.disaster.tracks.law)) * (ctx.carried > A.RICH_USD ? A.RICH : 1) * (ctx.armed ? A.ARMED : 1));
}

/**
 * Today's roll for a vehicle coming home: 'ambush' (it happens), 'foiled' (it would have happened at a bare gate; the kit stopped it) or 'none'.
 * Its own generator (it does not move the sim's rolls) and one draw, so the kit can only ever turn an ambush into a foiled one.
 */
export function arrivalRoll(s: GameState, ctx: { carried: number; armed: boolean }, salt = 0): 'ambush' | 'foiled' | 'none' {
  const u = mulberry32(s.seed * 4673 + dayIndex(s.clock.t) * 29 + salt * 7 + 11)();
  if (u < arrivalAmbushP(s, ctx)) return 'ambush';
  return u < bareAmbushP(s, ctx) ? 'foiled' : 'none';
}
export const arrivalAmbush = (s: GameState, ctx: { carried: number; armed: boolean }, salt = 0): boolean => arrivalRoll(s, ctx, salt) === 'ambush';

/** One line per fitted piece, for the Defense tab. */
export function gateLines(s: GameState): string[] {
  const G = GATE_SEC, out: string[] = [];
  if (hasSallyGate(s)) out.push(`Double gate: a vehicle is never exposed to the road while the outer gate is open (+${G.SALLY.barrier} wall strength, arrival ambushes x${G.SALLY.ambush}).`);
  if (hasGateMotor(s)) out.push(motorLive(s) ? `Caged gate motor: +${G.MOTOR.barrier} wall strength, the gate is open for less time (arrival ambushes x${G.MOTOR.ambush}).` : `Caged gate motor: +${G.MOTOR.barrier} wall strength; no power, so the gate is opened by hand (the manual release) and the motor saves no time.`);
  if (hasIntercom(s)) out.push(intercomLive(s) ? `Intercom and gate camera: +${G.INTERCOM.detection} warning, parleys through the gate go ${G.INTERCOM.parley} points calmer, arrival ambushes x${G.INTERCOM.ambush}.` : 'Intercom and gate camera: no power, so no picture and no voice (it needs the grid or your own supply).');
  if (hasGateHouse(s)) out.push(`Gate house: a guard at the drive (arrival ambushes x${G.GUARD_AMBUSH}).`);
  return out;
}

/** The goods a gate can still be fitted with, what each costs and why it can't be fitted yet. */
export function fitGateProblem(s: GameState, good: GateGood, price: number): string | null {
  if (n(s, good) >= 1) return 'already fitted';
  if (s.disaster.tracks.stores < 0.5) return 'no installer and no stock: the stores are closed';
  if (s.money < price) return 'not enough money';
  return null;
}
/** Fit one of the gate goods from the stores: pays the price, adds it to the stockpile (the same as buying it in the Shop). Null on success. */
export function fitGate(s: GameState, good: GateGood, price: number): string | null {
  const why = fitGateProblem(s, good, price);
  if (why) return why;
  s.money -= price;
  s.stock[good] = n(s, good) + 1;
  return null;
}
