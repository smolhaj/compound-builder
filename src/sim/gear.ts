/**
 * The armory, part 2 (decided with the user: personal kit; watching the
 * place; hardening). Bought like any other goods; what's in the stockpile is
 * in use. Pure.
 *
 *  Personal kit   plate carriers (wounds in a fight hurt less), IFAKs (a
 *                 tourniquet and chest seal on the spot), night vision and a
 *                 thermal monocular (the night watch), GMRS radios (the
 *                 family keeps in touch on the line).
 *  Watching       IR cameras and floodlights (need power), a thermal camera,
 *                 driveway motion sensors, tripwire alarms, a guard dog (it
 *                 eats, about 1,000 kcal a day from the stores).
 *  Hardening      steel entry doors and window bars on the house, sandbag
 *                 positions, a safe room (hide in it like a bunker).
 */
import type { GameState } from './state';
import type { MaterialId } from './materials';

export const KIT_GOODS: MaterialId[] = ['plate_carrier', 'soft_armor', 'helmet', 'ifak', 'nvg', 'thermal', 'radios', 'sw_radio', 'ham_rig'];
export const WATCH_GOODS: MaterialId[] = ['cameras', 'thermal_cam', 'driveway_alarm', 'floodlights', 'tripwire', 'dog'];
export const HARDEN_GOODS: MaterialId[] = ['steel_door', 'window_bars', 'sandbags', 'safe_room'];

const n = (s: GameState, m: MaterialId) => Math.floor(s.stock[m] ?? 0);
export const powered = (s: GameState) => s.utilities.lit.length > 0 || (s.utilities.grid && s.disaster.tracks.grid > 0.5);

/** What the gear adds at the gate. */
export function gearPosture(s: GameState, fighters: number): { detection: number; barrier: number; fight: number; visibility: number; deter: number; safeRoom: boolean } {
  const p = powered(s);
  const detection = (p && n(s, 'cameras') ? 15 : 0) + (p && n(s, 'thermal_cam') ? 15 : 0) + (n(s, 'driveway_alarm') ? 10 : 0) + (p && n(s, 'floodlights') ? 5 : 0)
    + (n(s, 'tripwire') ? 5 : 0) + Math.min(2, n(s, 'dog')) * 12 + (n(s, 'radios') ? 5 : 0) + Math.min(10, (n(s, 'nvg') + n(s, 'thermal')) * 5);
  const barrier = Math.min(10, n(s, 'steel_door') * 5) + (n(s, 'window_bars') ? 8 : 0) + Math.min(15, n(s, 'sandbags') * 5);
  const f = Math.max(1, fighters);
  const fight = 1 + 0.08 * Math.min(1, n(s, 'plate_carrier') / f) + 0.04 * Math.min(1, n(s, 'radios') * 2 / f) + 0.05 * Math.min(1, (n(s, 'nvg') + n(s, 'thermal')) / f);
  return { detection, barrier, fight, visibility: (p && n(s, 'floodlights') ? 5 : 0), deter: Math.min(2, n(s, 'dog')) * 6, safeRoom: n(s, 'safe_room') > 0 };
}

/** A wound in a fight: plates take some of it, and an IFAK on the spot takes more (one is used up). */
export function softenWound(s: GameState, sev: number, gunshot: boolean): number {
  let out = sev;
  const fighters = s.people.filter((p, i) => s.personState[i]?.needs.died == null && (!p.kid || p.age >= 15)).length;
  if (gunshot && n(s, 'plate_carrier') >= Math.max(1, fighters) * 0.5) out *= 0.65;
  if (gunshot && n(s, 'ifak') >= 1) { s.stock.ifak -= 1; out *= 0.7; }
  return Math.round(out);
}

/** Once a day: the dogs eat (from the staples, then the cans). */
export function gearDay(s: GameState): string[] {
  const dogs = n(s, 'dog');
  if (!dogs || s.disaster.tracks.stores >= 0.5) return [];   // dog food comes with the groceries while the stores are open
  let kcal = dogs * 1000;
  const fromStaples = Math.min(s.stock.staples, kcal / 80000);
  s.stock.staples -= fromStaples; kcal -= fromStaples * 80000;
  const fromCans = Math.min(s.stock.canned, kcal / 6000);
  s.stock.canned -= fromCans; kcal -= fromCans * 6000;
  return kcal > 1 && Math.floor(s.clock.t) % 10 === 0 ? ['The dogs are going hungry.'] : [];
}
