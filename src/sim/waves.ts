/**
 * The siege-wave clock (user-approved next feature; DECISIONS "Siege-wave clock").
 *
 * Hostile crews used to come at random (encounters.cadence). With the clock on, they come in WAVES on a schedule the player can read:
 *
 *   quiet -> warning signs (smoke on the horizon, chatter on the radio, the road empties) -> the wave -> a lull -> the next, bigger one
 *
 * Nothing here is a second raid system. A wave is an ordinary raid encounter (looters, gang, militia, patrol, requisition or horde, whichever the
 * disaster sends) rolled by `encounters.gateDay` on the wave's day, so it takes the same arrival hour, Watch cutscene, siege scenes, battle,
 * strain and aftermath as any raid. What the clock adds is WHEN (a visible schedule with real downtime) and HOW MUCH (crews that grow and arm
 * wave by wave over the collapse). Random hostile visits are held off while the clock runs, so the waves REPLACE them rather than pile on.
 *
 * Strength reads the shared `defensiveStrength` (sim/adaptive.ts): a defended place draws a somewhat bigger and better-kitted wave, a small
 * share (HEADS_DEF) of what the same defense takes off the odds in the battle. The monotone property test (waves.test.ts) holds the whole
 * chain, crew size included, to "more defense is never worse".
 *
 * Difficulty comes from the one table (DIFFICULTY.wave: how hard the waves climb; DIFFICULTY.lull: how long the quiet between). Cozy waves are
 * few, small and far apart. Old saves have no `gate.waves`: they play as before. Deterministic in the seed; pure.
 */
import { mulberry32 } from './rng';

/** Every balance guess in one table (named so they can be tuned together). */
export const WAVE = {
  /** Days after the hit before the first wave (at Standard; scaled by the lull weight), with a +-FIRST_JIT share of jitter. */
  FIRST: 14,
  FIRST_JIT: 0.35,
  /** Days of quiet between one wave and the next at wave 1 (at Standard; scaled by the lull weight). */
  LULL: 52,
  /** The lull shortens by this share by the time the waves have peaked (the world is more desperate), and never drops under LULL_MIN days. */
  LULL_SHRINK: 0.3,
  LULL_JIT: 0.25,
  LULL_MIN: 18,
  /** The wave after which the escalation stops climbing (wave PEAK is the full-strength crew; later ones repeat it). */
  PEAK: 10,
  /** Days of warning signs before a wave: smoke at WARN, radio chatter at WARN-1, an empty road on the last day. */
  WARN: 3,
  /** Crew size: up to this much bigger at the peak wave (x the difficulty's wave weight). */
  HEADS_ESC: 0.7,
  /** Crew size: up to this much bigger against a fully defended place (strength 0 = no change). Doubled in the walls/hide balance pass (crews scale with the player's fortification; a taller wall still pays). */
  HEADS_DEF: 0.3,
  /** Kit (grenades, plate, automatic rifles, a rocket via sim/adaptive.extraKit): the `adapt` number a peak wave carries at weight 1 and full defense; half of it without any. */
  KIT: 0.7,
  /** Waves stop once the county has order again (law track at or above this): there is nobody left to send them. */
  LAW_END: 0.75,
  /**
   * An opener: the first waves are smaller than the crew as rolled, so the first raid is a scare and not a wipe. The crew is cut by this share on wave 1,
   * fading to nothing by wave OPEN_WAVES + 1, for Standard only (Cozy's waves are already small, Hardcore's are the design: no opener).
   */
  OPEN: 0.25,
  OPEN_WAVES: 3,
  /** The Hardcore weight caps the heads multiplier here, so a wave never more than doubles a crew. */
  HEADS_CAP: 2.1,
} as const;

/** What the run saves: how many waves have arrived, and the day the last came (absent on an old save: no clock). */
export interface WaveState { n: number; last?: number }

/** The kinds a wave can be (the hostile crews). */
export const HOSTILE: ReadonlySet<string> = new Set(['looters', 'gang', 'militia', 'patrol', 'requisition', 'horde']);

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** How far up the escalation wave `n` (1-based) stands, 0 (the first) to 1 (the peak and after). */
export const intensity = (n: number): number => clamp01((n - 1) / (WAVE.PEAK - 1));

/**
 * The day (game day index) wave `n` is due, from the seed alone: the first after FIRST days, then a lull that shortens as the
 * waves climb, each with its own jitter. `lull` is the difficulty's quiet-time weight. Waves are indexed from 1.
 */
export function waveDue(seed: number, hitDay: number, n: number, lull: number): number {
  let day = hitDay + Math.round(WAVE.FIRST * lull * (1 + WAVE.FIRST_JIT * (2 * mulberry32(seed * 977 + 41)() - 1)));
  for (let i = 1; i < n; i++) {
    const j = 1 + WAVE.LULL_JIT * (2 * mulberry32(seed * 977 + 41 + i * 131)() - 1);
    day += Math.max(WAVE.LULL_MIN, Math.round(WAVE.LULL * lull * (1 - WAVE.LULL_SHRINK * intensity(i)) * j));
  }
  return day;
}

/** The day the next wave is due: the schedule, but never sooner than LULL_MIN after the last one arrived (a wave held up by a card does not stack). */
export function nextWaveDay(seed: number, hitDay: number, w: WaveState, lull: number): number {
  const due = waveDue(seed, hitDay, w.n + 1, lull);
  return w.last === undefined ? due : Math.max(due, w.last + WAVE.LULL_MIN);
}

/** The opener's cut on wave `n` (1 = none): see WAVE.OPEN. */
export function openerFactor(n: number, weight: number): number {
  const fade = clamp01(1 - (n - 1) / WAVE.OPEN_WAVES), scale = weight >= 1 ? clamp01((1.4 - weight) / 0.4) : 0;
  return 1 - WAVE.OPEN * fade * scale;
}

/** Crew-size factor for wave `n` against a place of defensive strength `ds` (0-1), at the difficulty's wave weight. 1 = the crew as rolled. */
export function crewFactor(n: number, ds: number, weight: number): number {
  return openerFactor(n, weight) * Math.min(WAVE.HEADS_CAP, (1 + WAVE.HEADS_ESC * weight * intensity(n)) * (1 + WAVE.HEADS_DEF * clamp01(ds) * Math.min(1, weight)));
}

/** The `adapt` number (0-1) a wave carries into the battle: it decides grenades, plate, automatic rifles and a rocket. */
export function kitLevel(n: number, ds: number, weight: number): number {
  return clamp01(WAVE.KIT * weight * intensity(n) * (0.5 + 0.5 * clamp01(ds)));
}

export type WavePhase = 'off' | 'quiet' | 'warning' | 'arriving';

/** The phase for a day: warning from WARN days before the wave until its day. */
export function phaseOf(day: number, due: number): WavePhase {
  return day >= due ? 'arriving' : due - day <= WAVE.WARN ? 'warning' : 'quiet';
}

/** The sign the road gives on a warning day (daysLeft = days to the wave, 1..WARN), or null. `radio` is whether anyone is listening to a set or the net. */
export function warningSign(daysLeft: number, radio: boolean): string | null {
  if (daysLeft === WAVE.WARN) return 'A column of smoke stands on the horizon, over toward the county road. Something is burning, or someone wants it seen.';
  if (daysLeft === WAVE.WARN - 1) return radio ? 'The radio is full of chatter: trucks massing, a name repeated, voices that stop when you call back. Something is being organized.' : 'Dogs are restless all night and a vehicle idled without lights on the far road. Something is being organized.';
  if (daysLeft === 1) return 'The county road is empty. No walkers, no carts, no trucks. Whoever is coming has cleared the way. Expect them tomorrow.';
  return null;
}

/** Plain-English wave ordinal for a dossier ("the third wave"). */
const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
export const waveName = (n: number): string => n >= 1 && n <= ORD.length ? `the ${ORD[n - 1]} wave` : `wave ${n}`;

/** The dossier line that tells the player what a wave is and that it climbed. */
export function waveDossier(n: number): string {
  if (n <= 1) return 'The first wave. Word is out; crews have started to organize. Between waves the county is quiet, but each one will be bigger.';
  if (n < WAVE.PEAK) return `This is ${waveName(n)}. The crews that sent it are bigger and better equipped than the last, and there will be more.`;
  return `This is ${waveName(n)}. The crews that remain have been at it for months: as big and as well armed as they will get.`;
}
