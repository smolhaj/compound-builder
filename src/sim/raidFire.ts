/**
 * Fires a raid sets (arson by hostile crews, user decision 5). A state on the place, not a cutscene: the fire grows by the hour, jumps to a wooden
 * neighbor, and the family has to fight it or lose the building. Pure given the game; ticked hourly by the engine (sim/engine.ts).
 *
 *   power    able adults on the place (a wounded man, a child and a person away do not count), a well or cistern for water, and "all hands" (the player's order: everyone drops what they are doing, at the cost of the day's work).
 *   growth   a wooden building burns 0.2 an hour of its own; a building that is full (barn, shed) more; a stone or steel one hardly.
 *   spread   above half intensity the fire jumps to a wooden building within 6 units with a chance of 12% an hour times its intensity.
 *   out      power beats growth: intensity falls to zero and the fire is out (a scorched wall to clear); at 1 the building is burned down.
 */
import { burnStructure, isFinished } from './construction';
import { FIREPROOF } from './raidOutcomes';
import { addBurnScar } from './raidDamage';
import { dayIndex, type GameState } from './state';
import { mulberry32 } from './rng';
import { isHome } from './blueprints';

export interface RaidFire {
  id: string;
  /** The structure that is burning. */
  structure: string;
  x: number;
  z: number;
  /** 0 (out) to 1 (burned down). */
  intensity: number;
  /** Game day index it started. */
  day: number;
  /** The player's order: everyone on it. */
  allHands?: boolean;
}

/** The most fires at once, and how long a fire may burn before the game calls it (hours): the state never grows without bound. */
export const MAX_FIRES = 8;
export const MAX_FIRE_HOURS = 48;

/** The able hands on the place. */
export function fireHands(s: GameState): number {
  let n = 0;
  s.people.forEach((p, i) => {
    const ps = s.personState[i];
    if (!ps || ps.needs.died != null || ps.task === 'away' || ps.task === 'gone' || ps.task === 'town') return;
    if (p.kid && p.age < 12) return;
    if (ps.needs.hurt.some(h => h.sev >= 40)) return;
    n++;
  });
  return n;
}

/** What puts a fire out in an hour: hands and water (intensity points). */
export function firePower(s: GameState, allHands: boolean): number {
  const hands = Math.min(8, fireHands(s)) * (allHands ? 0.1 : 0.06);
  const water = s.structures.some(st => isFinished(st) && /^(well|cistern|pond|water_tank|water_tower)/.test(st.kind)) ? 0.08 : 0;
  return hands + water;
}

const growthOf = (kind: string): number => (FIREPROOF.test(kind) ? 0.03 : /barn|shed|coop|workshop|garage|stable|hay/.test(kind) ? 0.3 : isHome(kind) ? 0.17 : 0.22);

/** Start fires (the raid's `fire` events) on the place. Returns lines for the log. */
export function startFires(s: GameState, list: ReadonlyArray<{ structure: string; x: number; z: number }>): string[] {
  const out: string[] = [], fires = (s.raidFires ??= []);
  for (const f of list) {
    if (fires.length >= MAX_FIRES || fires.some(x => x.structure === f.structure)) continue;
    const st = s.structures.find(x => x.id === f.structure);
    if (!st || !isFinished(st)) continue;
    fires.push({ id: `f${s.nextId++}`, structure: f.structure, x: f.x, z: f.z, intensity: 0.25, day: dayIndex(s.clock.t) });
    out.push(`The ${st.kind.replace(/_/g, ' ')} is on fire. Everyone who can has to get to it.`);
  }
  return out;
}

/** The player's order: everyone on the fires (true), or back to the usual share (false). */
export function setAllHands(s: GameState, on: boolean): void { for (const f of s.raidFires ?? []) f.allHands = on; }

/** One hour of every fire. Pure given `s` (mutates it). */
export function tickRaidFires(s: GameState): string[] {
  const fires = s.raidFires;
  if (!fires?.length) return [];
  const out: string[] = [], r = mulberry32(s.seed * 7907 + s.clock.ticks * 13 + 5), keep: RaidFire[] = [], born: RaidFire[] = [];
  const day = dayIndex(s.clock.t);
  for (const f of fires) {
    const st = s.structures.find(x => x.id === f.structure);
    if (!st || !isFinished(st)) continue;   // already gone
    f.intensity += growthOf(st.kind) * (0.8 + 0.4 * r()) - firePower(s, !!f.allHands);
    if (f.intensity <= 0) { out.push(`The fire in the ${st.kind.replace(/_/g, ' ')} is out. The wall is scorched, but it stands.`); continue; }
    if (f.intensity >= 1 || (day - f.day) * 24 > MAX_FIRE_HOURS) {
      if (burnStructure(s, st)) { addBurnScar(s, st.x, st.z, st.kind.replace(/_/g, ' ')); out.push(`The ${st.kind.replace(/_/g, ' ')} burned to the ground.`); }
      else out.push(`The fire died in the ${st.kind.replace(/_/g, ' ')}; it stands.`);
      continue;
    }
    // it jumps to a wooden neighbor
    if (f.intensity > 0.5 && fires.length + born.length < MAX_FIRES) {
      for (const n of s.structures) {
        if (n === st || !isFinished(n) || FIREPROOF.test(n.kind) || Math.hypot(n.x - st.x, n.z - st.z) > 6) continue;
        if (fires.some(x => x.structure === n.id) || born.some(x => x.structure === n.id)) continue;
        if (r() < 0.12 * f.intensity) { born.push({ id: `f${s.nextId++}`, structure: n.id, x: n.x, z: n.z, intensity: 0.2, day, ...(f.allHands ? { allHands: true } : {}) }); out.push(`The fire has jumped to the ${n.kind.replace(/_/g, ' ')}.`); }
      }
    }
    keep.push(f);
  }
  s.raidFires = [...keep, ...born].slice(0, MAX_FIRES);
  if (!s.raidFires.length) delete s.raidFires;
  return out;
}
