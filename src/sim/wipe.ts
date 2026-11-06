/**
 * The wipe ending (user decision: "a wipe means nobody is alive on the compound"). When the last person on the
 * property is gone the clock stops, the run ends and the ending screen says who died, when and of what. Children
 * who were taken in by a neighbor are survivors elsewhere: the ending says the family lives on, but the run is over.
 *
 * Pure. `step` (sim/engine.ts) calls `declareWipe` after every sub-step, so the clock can never run on with an empty
 * place; the daily tally calls it too. Nothing here is saved except the `ending` the engine already stored and the
 * `cause` on each dead person's needs (sim/deaths.ts).
 */
import type { GameState } from './state';
import { CAUSE_TEXT, inferCause, type DeathCause } from './deaths';
import { log } from './economy';
import type { Ending } from './report';

/** People alive on the property: not dead, not taken, not moved away. (Someone in town for the day is still on the roster.) */
export function aliveOnPlace(s: Pick<GameState, 'personState'>): number {
  return s.personState.reduce((a, ps) => a + (ps.needs.died == null ? 1 : 0), 0);
}

/** Nobody left alive on the property, in a game that has had people. */
export const isWiped = (s: Pick<GameState, 'personState'>): boolean => s.personState.length > 0 && aliveOnPlace(s) === 0;

/** The run has already ended in a wipe and is waiting on the player. */
export const wipeEnded = (s: Pick<GameState, 'ending'>): boolean => s.ending?.kind === 'wipe' && !s.ending.continued;

export interface DeathEntry { id: string; name: string; age: number; day: number; cause: DeathCause; /** Taken by raiders: gone, not known dead. */ taken: boolean; /** "Maria Lopez, 42: starved on day 212." */ text: string }
export interface Survivor { name: string; age: number; host: string }
export interface WipeSummary {
  /** Everyone who died or was taken, earliest first. Guests who moved on are not here. */
  roll: DeathEntry[];
  /** The family members alive elsewhere (wards fostered with a neighbor household). */
  elsewhere: Survivor[];
  /** One plain sentence for the top of the ending screen. */
  text: string;
}

const hostName = (s: GameState, id: string): string => {
  const n = s.neighbors.find(x => x.id === id);
  return n ? `${n.name.replace(/^the /i, '').replace(/s$/, '')} household` : 'a neighbor household';
};
const list = (xs: string[]): string => xs.length <= 1 ? xs[0] ?? '' : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/** Who died, when and of what, plus who survives elsewhere. Works on any state (empty roll if nobody died). */
export function wipeSummary(s: GameState): WipeSummary {
  const thirsty = s.utilities.report.shortL > s.utilities.report.useL * 0.5;
  const roll: DeathEntry[] = [];
  s.people.forEach((p, i) => {
    const n = s.personState[i]?.needs;
    if (!n || n.died == null || n.left) return;
    const cause = n.taken ? 'raid' : inferCause(n, thirsty);
    const what = n.taken ? 'was taken by raiders and not heard from again' : CAUSE_TEXT[cause];
    roll.push({ id: p.id, name: `${p.first} ${p.last}`, age: p.age, day: n.died, cause, taken: !!n.taken, text: `${p.first} ${p.last}, ${p.age}: ${what} on day ${n.died}.` });
  });
  roll.sort((a, b) => a.day - b.day);
  const elsewhere: Survivor[] = (s.lineage?.wards ?? []).map(w => ({ name: w.person.first, age: w.person.age, host: hostName(s, w.by) }));
  const hosts = [...new Set(elsewhere.map(e => e.host))];
  const text = elsewhere.length
    ? `Nobody is left on the place. ${list(elsewhere.map(e => `${e.name} (${e.age})`))} ${elsewhere.length === 1 ? 'is' : 'are'} alive with the ${list(hosts)}, so the family goes on elsewhere. The compound is empty and this run is over.`
    : 'Nobody is left on the place. This run is over.';
  return { roll, elsewhere, text };
}

/**
 * If nobody is alive on the property, end the run now: the ending is filed, anything waiting at the gate is dropped and
 * the clock stops. Returns the new ending, or null if there was nothing to do (people live, or the wipe is already on file).
 */
export function declareWipe(s: GameState): Ending | null {
  if (!isWiped(s) || wipeEnded(s)) return null;
  s.ending = { kind: 'wipe', day: Math.floor(s.clock.t), continued: false };
  s.gate.pending = null; s.gate.incoming = null; s.gate.aftermath = null;
  s.clock.speed = 0;
  log(s, wipeSummary(s).elsewhere.length ? 'The last person on the place is gone. The family survives elsewhere.' : 'The last of the family is gone.');
  return s.ending;
}
