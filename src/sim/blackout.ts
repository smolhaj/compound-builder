/**
 * Light discipline (the user: "as part of the night time suite of features, compound can go dark
 * (blackout curtains, etc) to avoid drawing attention at night (lights emanating from their camp)").
 *
 * "Lights out" douses what shows from the road: the windows, the fire pit, the yard lamps and the
 * flashlights; it is a family routine, not a building. It is on when
 *   - the player turns it on (`opsec.blackout`, the manual switch; also forces every floodlight off), or
 *   - the automatic mode says so: `dusk` (every night) or `warned` (on a radio warning, someone at the
 *     gate, or the sensors tripped; floodlights keep their own modes, a sensor light that comes on at a
 *     real threat is the defense).
 *
 * Blackout curtains (a household good, one set per house) keep the room lit and the window dark. Without
 * them lights out means dark rooms: a little less exposure, but slower night work, stumbles in the dark
 * and a worse mood (kids most). A generator is loud and bright; no discipline hides it.
 *
 * Pure (tested). `lights.ts` reads this through `blackoutNow`; opsec and encounters read `glowFactor`.
 */
import { isHome } from './blueprints';
import { isFinished } from './construction';
import { dayIndex, hourOf, type GameState } from './state';

export type AutoLightsOut = 'off' | 'warned' | 'dusk';
export const AUTO_MODES: readonly AutoLightsOut[] = ['off', 'warned', 'dusk'];
export const AUTO_NAME: Record<AutoLightsOut, string> = { off: 'Manual only', warned: 'On a warning', dusk: 'Every dusk' };
export const AUTO_HELP: Record<AutoLightsOut, string> = {
  off: 'Lights stay as they are until you switch lights out on.',
  warned: 'The family douses the lights when the radio warns of raiders, someone is at the gate or the sensors trip.',
  dusk: 'The family douses the lights every night at dusk, warning or not.',
};
export const CURTAIN_GOOD = 'blackout_curtains' as const;

interface OpsecLike { blackout?: boolean; auto?: AutoLightsOut }
const op = (s: GameState): OpsecLike => s.opsec ?? {};
export const autoMode = (s: GameState): AutoLightsOut => op(s).auto ?? 'off';

/** Is it night (the same hours the battle sim uses)? */
export const isNightHour = (h: number): boolean => h >= 20 || h < 6;

/** A warning sign: the radio warned of raiders, someone is at the gate, or the sensors tripped. */
export function warningSigns(s: GameState): boolean {
  return !!s.gate.pending || s.clock.t < (s.lights?.alertUntil ?? -1) || (!!s.radio && dayIndex(s.clock.t) <= s.radio.warnedUntil);
}

/** Why the lights are out now ('manual' | 'dusk' | 'warned'), or null. */
export function lightsOutReason(s: GameState): 'manual' | 'dusk' | 'warned' | null {
  if (op(s).blackout) return 'manual';
  const a = autoMode(s);
  if (a === 'dusk') return 'dusk';
  if (a === 'warned' && warningSigns(s)) return 'warned';
  return null;
}
/** Household lights out (windows, fire pit, lamps, flashlights); the hour is the renderer's (`night`). */
export const lightsOutNow = (s: GameState): boolean => lightsOutReason(s) !== null;
/** Floodlights forced off too: manual or every-dusk discipline (a warning keeps the sensor lights). */
export const floodsOut = (s: GameState): boolean => { const r = lightsOutReason(s); return r === 'manual' || r === 'dusk'; };

/** Sets of blackout curtains in the stockpile, and houses that need one. */
export const curtainSets = (s: GameState): number => Math.floor(s.stock[CURTAIN_GOOD] ?? 0);
export const windowSets = (s: GameState): number => Math.max(1, s.structures.filter(st => isFinished(st) && isHome(st.kind)).length);
/** 0–1: how much of the household's windows are covered. */
export const curtainCover = (s: GameState): number => Math.min(1, curtainSets(s) / windowSets(s));

/** Multiplier on window-light exposure: 1 lit; lights out 0.35 bare, 0.1 fully curtained. */
export function glowFactor(s: GameState): number {
  return lightsOutNow(s) ? 0.1 + 0.25 * (1 - curtainCover(s)) : 1;
}

/** What darkness costs while lights are out (0 with curtains on every house): scales with the uncovered share. */
export const darkness = (s: GameState): number => (lightsOutNow(s) ? 1 - curtainCover(s) : 0);
/** Mood drift target shift for someone who is up in the dark (on watch; kids feel it more). Sleepers are not affected. */
export const darkMood = (s: GameState, kid: boolean, upAtNight: boolean): number => (upAtNight ? -(kid ? 9 : 6) * darkness(s) : 0);
/** Night work rate for people who are awake and working after dark (1 = unaffected): slower in unlit rooms. Not a reason to work at night: sleepers sleep. */
export const nightWork = (s: GameState, hour: number): number => (isNightHour(hour) ? 1 - 0.2 * darkness(s) : 1);
/** Chance in a day that someone who is up at night (on watch, an emergency) stumbles in the dark (a sprain). Sleepers are not affected. */
export const mishapChance = (s: GameState): number => 0.012 * darkness(s);

/**
 * A generator is loud and bright: 2 points running, rising with the kWh it made yesterday (to 9). Soundproofing
 * buys it down: baffles (an insulated, vented enclosure) keep 45%; a vault (a buried, lined, exhaust-silenced
 * room) cancels it. Needs the generator to matter. `genSound` also scales the generator's part of the road
 * visibility in sim/encounters.ts.
 */
export const genSound = (s: GameState): number => ((s.stock.gen_vault ?? 0) >= 1 ? 0 : (s.stock.gen_baffles ?? 0) >= 1 ? 0.45 : 1);
export const GEN_TIER_NAME = ['No soundproofing', 'Baffled enclosure', 'Vault (silent)'] as const;
export const genTier = (s: GameState): 0 | 1 | 2 => ((s.stock.gen_vault ?? 0) >= 1 ? 2 : (s.stock.gen_baffles ?? 0) >= 1 ? 1 : 0);
export const genRunning = (s: GameState): boolean => s.utilities.report.genKwh > 0.05;
export const genPoints = (s: GameState): number => (genRunning(s) ? Math.min(9, 2 + 0.5 * s.utilities.report.genKwh) * genSound(s) : 0);

export interface LightLine { id: 'windows' | 'floods' | 'fire' | 'generator'; label: string; points: number; note: string }

/** What shows from the road, source by source (the 'Lights after the grid' exposure; `floodSeen` from lights.ts alwaysLit). */
export function lightLines(s: GameState, floodPoints: number): LightLine[] {
  const gridDown = s.disaster.tracks.grid < 0.5;
  const out = lightsOutNow(s);
  const lit = s.utilities.lit.length;
  const windows = gridDown && lit > 0 ? Math.min(20, 8 + lit * 2) * glowFactor(s) : 0;
  const fire = gridDown && s.clock.t >= s.disaster.hitAt && !out ? 2 : 0;
  const gen = gridDown ? genPoints(s) : 0;
  const floods = floodPoints;
  return [
    { id: 'windows', label: 'Windows', points: windows, note: out ? (curtainCover(s) >= 1 ? 'curtained: only a glimmer at the edges' : 'dark rooms') : 'lamps in the windows' },
    { id: 'floods', label: 'Floodlights left on', points: floods, note: floods > 0 ? 'always on, or tripped by animals' : 'none burning' },
    { id: 'fire', label: 'Fire pit & yard lamps', points: fire, note: out ? 'out' : 'burn in the evening' },
    { id: 'generator', label: 'Generator', points: gen, note: !genRunning(s) ? 'not running' : genTier(s) === 2 ? 'silenced by the vault' : genTier(s) === 1 ? 'muffled by baffles' : 'loud and bright; lights out does not hide it' },
  ];
}

export type Visibility = 'dark' | 'faint' | 'lit' | 'blazing';
export const VISIBILITY_NAME: Record<Visibility, string> = { dark: 'Dark', faint: 'A glimmer', lit: 'Lit', blazing: 'Blazing' };
export function visibilityOf(points: number): Visibility {
  return points < 1 ? 'dark' : points < 6 ? 'faint' : points < 14 ? 'lit' : 'blazing';
}

/** Hour helper for the UI (is it night in the game now). */
export const nightNow = (s: GameState): boolean => isNightHour(hourOf(s.clock.t));
