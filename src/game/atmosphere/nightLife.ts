/**
 * Night life on the compound (decided with the user: "all of these"). Pure:
 * which windows are lit and how (oil lamp, electric light, blackout
 * curtains), when the fire pit burns, who carries a flashlight, whether the
 * generator is running. The renderer (Atmosphere.ts) only draws the answer.
 */

/** A person as the night needs them (from the sim's PersonState / Person). */
export interface NightPerson {
  id: string;
  /** The sim task ('sleep', 'leisure', 'watch' once the schedule has one …). */
  task: string;
  kid: boolean;
  /** Dead or taken: not on the place. */
  gone: boolean;
}

/** Tasks that take someone off the place (or out of the house) entirely. */
const AWAY = new Set(['gone', 'away', 'job', 'shelter']);

/** Living people at home and awake. */
export function awakeAtHome(people: readonly NightPerson[]): number {
  return people.filter(p => !p.gone && p.task !== 'sleep' && !AWAY.has(p.task)).length;
}

/** Is it dark enough that a lamp goes on (dusk to dawn)? `night` 0–1 from the sky. */
export const isDark = (night: number) => night > 0.25;

export type LampKind = 'off' | 'oil' | 'electric' | 'curtained';

export interface WindowCtx {
  hour: number;
  /** 0–1 how dark it is outside. */
  night: number;
  /** A home (sleeps people) — else a shed / shop / barn. */
  home: boolean;
  /** People awake in it (homes: the household awake at home). */
  awake: number;
  /** Wired and had power yesterday (sim utilities.lit). */
  powered: boolean;
  /** OPSEC blackout curtains drawn at night. */
  blackout: boolean;
  /** Someone on watch through the night (a lamp turned low for them). */
  watch: boolean;
}

/**
 * The windows of one building tonight, and how bright the room is (0–1).
 * Homes are lit while the household is up (evenings, early mornings), turned
 * low through the night when someone keeps watch, dark when all are asleep
 * or away. A powered shop keeps its work light on in the evening. Blackout
 * curtains keep the light in: the room is lit, the window is not.
 */
export function windowLight(c: WindowCtx): { kind: LampKind; room: number } {
  if (!isDark(c.night)) return { kind: 'off', room: 0 };
  const late = c.hour >= 23 || c.hour < 4.5;
  let room = 0;
  if (c.home) {
    if (c.awake > 0 && !late) room = Math.min(1, 0.45 + 0.2 * c.awake);
    else if (c.awake > 0 || c.watch) room = 0.25;
  } else if (c.powered && c.hour >= 17 && c.hour < 21.5) room = 0.5;
  if (room <= 0) return { kind: 'off', room: 0 };
  if (c.blackout) return { kind: 'curtained', room };
  return { kind: c.powered ? 'electric' : 'oil', room };
}

/**
 * The fire pit burns when people sit out round it in the evening (not in the
 * rain, nor on a deep-winter night), and as the camp's cookfire before a
 * house stands (meals and cold days). With blackout curtains drawn after the
 * collapse there's no fire after dark: it shows for miles.
 */
export function firePitLit(c: { hour: number; sittingOut: number; rain: number; cold: number; hasHome: boolean; blackout: boolean; collapsed: boolean; night: number }): number {
  const meals = (c.hour > 5.5 && c.hour < 8.5) || (c.hour > 11.8 && c.hour < 13) || (c.hour > 17 && c.hour < 22.5);
  if (c.blackout && c.collapsed && isDark(c.night)) return 0;
  if (c.rain > 0.45) return 0;
  if (!c.hasHome) return meals || c.cold > 0.4 ? 1 : 0;
  const evening = c.hour >= 18 || c.hour < 1;
  return c.sittingOut > 0 && evening && c.cold < 0.85 ? 1 : 0;
}

/** Something out there: a warning on the radio, someone at the gate, a fight. */
export interface Threat { radioWarned: boolean; atGate: boolean; battle: boolean; dogs: boolean }
export const threatened = (t: Threat) => t.radioWarned || t.atGate || t.battle;

/**
 * Who carries a flashlight tonight: everyone the schedule has on watch
 * (task 'watch'); failing that, while there is a threat, the adults who are
 * up and outdoors at night (at a post or about the yard). A dog that hears
 * something puts one more of them out. `outdoors` are the ids visible
 * outside the buildings now.
 */
export function flashlightCarriers(people: readonly NightPerson[], outdoors: ReadonlySet<string>, night: number, threat: Threat): string[] {
  if (!isDark(night)) return [];
  const live = people.filter(p => !p.gone && outdoors.has(p.id));
  const watch = live.filter(p => p.task === 'watch');
  if (watch.length) return watch.map(p => p.id);
  if (!threatened(threat)) return [];
  const up = live.filter(p => !p.kid && p.task !== 'sleep');
  return up.slice(0, threat.dogs ? 3 : 2).map(p => p.id);
}

/**
 * The generator runs when it made power yesterday (the batteries and the sun
 * didn't cover the evening load): from dusk to bedtime, and through the day
 * when it carried more than a few hours' load. `genKwh` from the sim report.
 */
export function generatorRunning(genKwh: number, genKw: number, hour: number): boolean {
  if (genKwh <= 0.05 || genKw <= 0) return false;
  const hours = genKwh / genKw;
  if (hours >= 12) return true;
  // the evening load first (17:00 on), then morning
  const evening = Math.min(hours, 6), morning = Math.max(0, hours - 6);
  return (hour >= 17 && hour < 17 + evening) || (hour >= 6 && hour < 6 + morning);
}
