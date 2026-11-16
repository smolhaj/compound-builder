/**
 * The felt radio's rumor and fence-line lines (FL3): the civilians' voice. Nobody here is a trained operator, so they speak in scared,
 * broken fragments, some of them true (and then scouting confirms them) and some of them false (and scouting puts them to rest).
 * Every line names a `Claim` (claims.ts), so which are false is a fact about this world, not a coin.
 */
import { TRACK_NAME } from '../disaster';
import { worstTrack } from './claims';
import { THEME, dayN, days, familyName, firstNeighbor, genLine, type GenLine } from './lineKit';
import type { FeltKind } from './types';

const cap = (x: string): string => x[0].toUpperCase() + x.slice(1);

export function rumorLines(kind: FeltKind): GenLine[] {
  const T = THEME[kind];
  const out = (s: Parameters<typeof worstTrack>[0]) => worstTrack(s) ?? 'grid';
  return [
    // fragments about the event itself: true, from a frightened neighbor
    genLine(kind, { id: 'scare', channel: 'local', truth: 'true', tone: 2, claim: () => ({ id: 'kind_active', a: kind }), text: s => `${T.frag} Day ${dayN(s)}.` }),
    // the lights, the phones: true while the service is still out
    genLine(kind, { id: 'dark', channel: 'local', truth: 'true', tone: 1, when: s => worstTrack(s) !== null, claim: s => ({ id: 'svc_out', a: out(s) }),
      text: s => `${TRACK_NAME[out(s)]}... nothing. ${days(dayN(s))} of ${T.noun}. Don't know when. Don't go out.` }),
    genLine(kind, { id: 'no_trucks', channel: 'local', truth: 'true', tone: 1, when: s => s.disaster.tracks.deliveries < 0.25, claim: () => ({ id: 'no_deliveries' }),
      text: s => `No trucks. Not one. ${days(dayN(s))} since ${T.noun}. Shelves, empty.` }),
    // a household has left: true, and checkable by walking over
    genLine(kind, { id: 'empty_place', channel: 'local', truth: 'true', tone: 2, when: s => !!firstNeighbor(s, true), claim: s => ({ id: 'neighbor_away', a: firstNeighbor(s, true)?.id ?? '' }),
      text: s => { const n = firstNeighbor(s, true); return `The ${n ? familyName(s, n.id) : 'neighbor'} place. Empty. Door open. Gone in the night, I think. ${cap(T.noun)}.`; } }),
    genLine(kind, { id: 'foul_water', channel: 'rumor', truth: 'true', tone: 2, claim: () => ({ id: 'creek_unsafe' }), text: () => 'Creek, bad. Water, bad downstream. Don\'t drink it. Don\'t.' }),
    // false, and put to rest by a visit
    genLine(kind, { id: 'moved_out', channel: 'local', truth: 'false', tone: 1, when: s => !!firstNeighbor(s, false), claim: s => ({ id: 'neighbor_away', a: firstNeighbor(s, false)?.id ?? '' }),
      text: s => { const n = firstNeighbor(s, false); return `Heard the ${n ? familyName(s, n.id) : 'neighbor'}s pulled out. Loaded the truck. Last night. ${cap(T.noun)}, they said.`; } }),
    genLine(kind, { id: 'city_open', channel: 'rumor', truth: 'false', tone: 1, claim: () => ({ id: 'city_open' }),
      text: () => `City is open, they say. Rations. Folks walking in, after ${T.noun}. Don't know. Maybe.` }),
    genLine(kind, { id: 'trucks_tuesday', channel: 'rumor', truth: 'false', tone: 1, claim: () => ({ id: 'relief_here' }),
      text: () => `A truck. FEMA, maybe? Tuesday. Water, for ${T.noun}. Heard it twice.` }),
    genLine(kind, { id: 'army_road', channel: 'rumor', truth: 'false', tone: 2, claim: () => ({ id: 'requisition' }),
      text: () => `Army. Taking food. Guns too. ${cap(T.noun)}, they say. At the road. Don't go.` }),
    genLine(kind, { id: 'poisoned', channel: 'rumor', truth: 'false', tone: 2, claim: () => ({ id: 'creek_unsafe' }),
      text: () => `Creek is poisoned. Downstream. ${cap(T.noun)}. Cattle dead, they said. Don't drink.` }),
    genLine(kind, { id: 'lifting', channel: 'rumor', truth: 'false', tone: 1, claim: () => ({ id: 'alert_lifted' }),
      text: () => `They're lifting it. Next week. All over. ${cap(T.noun)}, done, they say. Heard.` }),
    genLine(kind, { id: 'shelves', channel: 'rumor', truth: 'false', tone: 1, when: s => s.disaster.tracks.stores < 0.25, claim: () => ({ id: 'svc_up', a: 'stores' }),
      text: () => `Grocery got a truck. Shelves full by Friday, ${T.noun} or no. Somebody's cousin saw it.` }),
  ];
}
