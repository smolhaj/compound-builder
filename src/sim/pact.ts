/**
 * Who comes when there's shooting at the compound (extends the ally rule in
 * encounters.resolve). Before: households on the radio net who like you
 * (disposition over 50). Now also:
 *  - mutual-defense pact members (sim/neighborLife.ts) within earshot (3 km)
 *    or on the net, whatever they think of you this week: they gave their word;
 *  - the militia, three men, if the family has joined it.
 * Kept free of runtime imports from encounters.ts so neither depends on the
 * other at load time. Pure.
 */
import type { Neighbor } from './encounters';
import type { GameState } from './state';

/** A pact member hears the shooting within this many km (three shots, the agreed signal). */
export const PACT_EARSHOT_KM = 3;
/** Men the militia sends to a member's place. */
export const MILITIA_MEN = 3;

export const inPact = (s: GameState, id: string) => !!s.locals?.pact.includes(id);

/** The households (and the militia) who ride over when the family is attacked. */
export function defenders(s: GameState): Neighbor[] {
  const out = s.neighbors.filter(n => n.status === 'home' && n.members > 0 && ((n.radio && n.disposition > 50) || (inPact(s, n.id) && (n.radio || n.km <= PACT_EARSHOT_KM))));
  const g = s.locals?.group;
  if (g && s.locals?.member && g.kind === 'militia') {
    out.push({ id: 'militia', name: g.name, kind: 'ranch', disposition: 60, members: MILITIA_MEN, dir: 'north', km: 2, radio: true, skill: 'hunter', status: 'home' });
  }
  return out;
}
