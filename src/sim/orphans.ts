/**
 * Orphans (long game, GDS §10.11; decided with the user): if every adult is dead and only children are left, a neighbor
 * household takes the kids in, and the line is a wipe only if no neighbor can. The place is held for them (the house,
 * land, stores and animals stay as they are) and passes to them when the eldest comes of age, and the rest come home with
 * that heir. While they are away they are wards: off the roster, but still counted as the line, aging a year a year.
 * Pure and seeded.
 */
import type { GameState } from './state';
import type { Person } from './family';
import { dayJob } from './family';
import { freshNeeds } from './needs';
import type { Neighbor } from './encounters';
import { log } from './economy';

export interface Ward {
  person: Person;
  /** The neighbor household that took them in. */
  by: string;
  since: number;
}

export type Say = (kind: 'coming' | 'death' | 'home', text: string) => void;

const alive = (s: GameState, id: string) => s.personState.find(x => x.id === id)?.needs.died == null;
const house = (n: Neighbor) => `${n.name.replace(/^the /i, '').replace(/s$/, '')} household`;
const names = (ps: Person[]) => ps.length === 1 ? ps[0].first : `${ps.slice(0, -1).map(p => p.first).join(', ')} and ${ps[ps.length - 1].first}`;

/** Whether a household can take children in: still at home, room at the table, not hostile, not a recluse. */
export function canFoster(n: Neighbor): boolean {
  return n.status === 'home' && n.members >= 2 && n.kind !== 'loner' && n.disposition > -40;
}
/** The household that would take them: the warmest, then the nearest. */
export function fosterHome(s: Pick<GameState, 'neighbors'>, not?: string): Neighbor | null {
  return [...s.neighbors].filter(n => n.id !== not && canFoster(n)).sort((a, b) => b.disposition - a.disposition || a.km - b.km)[0] ?? null;
}

/** Nobody grown on the place and children left. */
export function orphaned(s: GameState): Person[] {
  const living = s.people.filter(p => alive(s, p.id));
  return living.some(p => !p.kid) ? [] : living.filter(p => p.kid);
}

/** The line is alive but nobody is home: every child is fostered with a neighbor. The gate stays quiet then (no cards, no one to take a stranger in). */
export const nobodyHome = (s: GameState): boolean =>
  (s.lineage?.wards?.length ?? 0) > 0 && !s.people.some(p => { const n = s.personState.find(x => x.id === p.id)?.needs; return !!n && n.died == null && !n.taken; });

/** Children in the line who are away with a neighbor. */
export const wardsOf = (s: Pick<GameState, 'lineage'>): Ward[] => s.lineage.wards ?? [];

/** The last adult is gone: the children go to a neighbor, if one can have them. Returns whether they went. */
export function fosterOut(s: GameState, say: Say, day: number): boolean {
  const kids = orphaned(s);
  if (!kids.length) return false;
  const host = fosterHome(s);
  if (!host) {
    // no household can take them: the line ends here (they leave to look for someone, and are not heard from again)
    for (const k of kids) { const n = s.personState.find(x => x.id === k.id)!.needs; n.died = Math.floor(s.clock.t); n.left = true; }
    const line = `With no grown person left and no neighbor who could take them in, ${names(kids)} left the place to look for someone, and were not heard from again.`;
    say('death', line); log(s, line);
    return false;
  }
  for (const k of kids) {
    const i = s.people.findIndex(p => p.id === k.id);
    s.people.splice(i, 1); s.personState.splice(i, 1);
    if (s.weekend) s.weekend.travelers = s.weekend.travelers.filter(id => id !== k.id);
    (s.lineage.wards ??= []).push({ person: k, by: host.id, since: day });
  }
  host.members += kids.length;
  const eldest = Math.max(...kids.map(k => k.age));
  const line = `With no grown person left on the place, the ${house(host)} took in ${names(kids)}. The place is held for them until the ${kids.length === 1 ? 'child' : 'eldest'} is 18 (${Math.max(0, 18 - eldest)} year${18 - eldest === 1 ? '' : 's'}).`;
  say('death', line); log(s, line);
  return true;
}

/** A day with children away: birthdays, the host failing, and coming home. Returns whether they have come home. */
export function wardsDay(s: GameState, doy: number, day: number, town: boolean, r: () => number, say: Say): boolean {
  const L = s.lineage, wards = L.wards ?? [];
  if (!wards.length) return false;
  for (const w of [...wards]) {
    const host = s.neighbors.find(n => n.id === w.by);
    if (!host || host.status !== 'home' || host.members <= 0) {
      const next = fosterHome(s, w.by);
      if (!next) {
        L.wards = (L.wards ?? []).filter(x => x !== w);
        say('death', `${w.person.first} was lost when there was no household left to keep them.`);
        if (!L.wards.length && !s.people.some(p => alive(s, p.id))) { s.ending = { kind: 'wipe', day, continued: false }; s.gate.pending = null; s.gate.incoming = null; s.gate.aftermath = null; }
        continue;
      }
      w.by = next.id; next.members++;
      say('home', `${w.person.first} went on to the ${house(next)}.`);
    }
    if ((w.person.bday ?? 1) === doy) {
      w.person.age++;
      const skill = host?.skill;
      if (skill && r() < 0.5) w.person.skills[skill] = Math.min(10, w.person.skills[skill] + 1);
    }
  }
  const away = L.wards ?? [];
  const heir = away.filter(w => w.person.age >= 18).sort((a, b) => b.person.age - a.person.age)[0];
  if (!heir) return false;
  // the heir takes the place, and the rest come home with them
  const home = away.map(w => w.person);
  for (const w of away) {
    const p = w.person;
    p.kid = p.age < 18;
    if (!p.kid) p.job = town ? dayJob(p, s.seed + day) : undefined;
    if (!p.job) delete p.job;
    s.people.push(p);
    s.personState.push({ id: p.id, task: 'idle', target: null, needs: freshNeeds(), ...(p.job ? { employed: true } : {}) });
    const host = s.neighbors.find(n => n.id === w.by);
    if (host) host.members = Math.max(1, host.members - 1);
  }
  L.wards = [];
  const rest = home.filter(p => p !== heir.person);
  say('coming', `${heir.person.first} turned 18 and came home to the place${rest.length ? `, with ${names(rest)}` : ''}. It is theirs now: the house, the land, the supplies and what the family built.`);
  return true;
}

export interface FosterNote { host: string; children: string[]; years: number; text: string }

/**
 * What to tell the player while nobody is home: who the children live with and how long until the eldest comes of age
 * (null when the place is not in that state). Messaging only: the by-design rule (the place is held, nothing to do) is unchanged.
 */
export function fosterNote(s: GameState): FosterNote | null {
  if (!nobodyHome(s)) return null;
  // the run is over when nobody is alive on the place (sim/wipe.ts): the ending screen says where the children are, and nothing is held for them
  if (s.ending?.kind === 'wipe') return null;
  const wards = wardsOf(s);
  const host = s.neighbors.find(n => n.id === wards[0].by);
  const hostName = host ? house(host) : 'neighbor household';
  const children = wards.map(w => w.person.first);
  const years = Math.max(0, 18 - Math.max(...wards.map(w => w.person.age)));
  const who = names(wards.map(w => w.person));
  const text = `Nobody is home. ${who} ${wards.length === 1 ? 'lives' : 'live'} with the ${hostName} and the place is held for them. ${years > 0 ? `Nothing needs doing until the ${wards.length === 1 ? 'child' : 'eldest'} turns 18, in about ${years} year${years === 1 ? '' : 's'}: then they come home and the house, the land and the stores are theirs.` : 'They come home any day now.'}`;
  return { host: hostName, children, years, text };
}
