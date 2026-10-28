/**
 * A month's trial (GDS §5.2: "trial period (a camp outside the wall)";
 * playtest round 3 Q8, decided with the user). Arrivals on trial camp
 * outside the wall for 30 days. They are not family: they aren't in
 * `s.people`, they don't count for the report card or the line, and they eat
 * from a separate ration the family hands out of its stores each day. They
 * work for their keep (on whatever is being built, else hauling deadfall for
 * the woodpile).
 *
 * Over the month the family learns who they are. Most are what they said;
 * some turn out better than they let on (a skill they never mentioned), some
 * talked themselves up and do as little as they can, now and then one falls
 * sick, and a few clean out what they can carry one night and are gone. When
 * the month is up a gate card asks: take them in, or send them on.
 *
 * Pure and seeded.
 */
import { mulberry32, pick } from './rng';
import { addWork, isFinished } from './construction';
import { KCAL, NEED_ADULT, NEED_KID, freshNeeds } from './needs';
import { contagion } from './effects';
import { SKILL_IDS, type Person, type SkillId } from './family';
import { dayIndex, type GameState } from './state';
import type { Stock } from './materials';
import type { Encounter, Outcome, Stance } from './encounters';

/** What they turn out to be (hidden until the month shows it). */
export type Character = 'solid' | 'gem' | 'lazy' | 'thief' | 'sick';
export const TRIAL_DAYS = 30;

export interface TrialCamp {
  id: string;
  /** "A couple from the subdivision", for the panel and the cards. */
  title: string;
  people: Person[];
  /** What they brought (theirs until they're taken in). */
  brings: Partial<Stock>;
  from: number;
  until: number;
  character: Character;
  /** What the family has learned about them so far. */
  learned: string[];
  /** Days the camp ration came up short, and kcal handed out in all. */
  hungry: number;
  fed: number;
  /** Person-hours they put in on the family's work. */
  worked: number;
  /** The reveal has happened (the character showed). */
  shown?: boolean;
  /** Who in the camp is running a fever (they bring it in if taken in). */
  fever?: string;
}

/** Odds of each character in a group that asks for a trial (most are what they say). */
const CHARACTER_ODDS: Array<[Character, number]> = [['solid', 0.45], ['gem', 0.18], ['lazy', 0.15], ['thief', 0.14], ['sick', 0.08]];

const campsOf = (s: GameState): TrialCamp[] => (s.gate.camps ??= []);
export const trialCamps = (s: GameState): TrialCamp[] => s.gate.camps ?? [];
const top = (p: Person): SkillId => SKILL_IDS.reduce((a, b) => (p.skills[b] > p.skills[a] ? b : a));
/** A day's ration for the camp (kcal). */
export const campNeed = (c: Pick<TrialCamp, 'people'>) => c.people.reduce((a, p) => a + (p.kid ? NEED_KID : NEED_ADULT), 0);

/** They set up camp outside the wall (stance `trial`). */
export function startTrial(s: GameState, e: Encounter): Outcome {
  const day = dayIndex(s.clock.t);
  const r = mulberry32(s.seed * 5003 + day * 17 + (e.size * 31));
  let u = r(), character: Character = 'solid';
  for (const [c, w] of CHARACTER_ODDS) { if (u < w) { character = c; break; } u -= w; }
  const camp: TrialCamp = { id: e.id, title: e.title.replace(/ at the gate$/, ''), people: e.people ?? [], brings: { ...(e.brings ?? {}) }, from: day, until: day + TRIAL_DAYS, character, learned: [], hungry: 0, fed: 0, worked: 0 };
  campsOf(s).push(camp);
  s.gate.humanity = Math.min(100, s.gate.humanity + 3);
  return { title: 'On trial', text: `They can camp outside the wall for a month and work for their keep. You'll feed them from your own stores. Then you'll see.`, tone: 'good', lines: [`${camp.people.length} in the camp: about ${campNeed(camp).toLocaleString('en-US')} kcal a day from the pantry.`] };
}

/** Hand out the camp's ration from the stores (fresh first, then staples, cans, the freezer). Returns kcal short. */
function ration(s: GameState, kcal: number): number {
  let left = kcal;
  for (const f of ['fresh', 'staples', 'canned', 'frozen'] as const) {
    if (left <= 0) break;
    const units = Math.min(s.stock[f], left / KCAL[f]);
    s.stock[f] -= units; left -= units * KCAL[f];
  }
  return Math.max(0, left);
}

/** Their day's work: the first build that can take it, else deadfall for the woodpile (a rick ⅓ cord about every 8 hours). */
function work(s: GameState, hours: number): void {
  let left = hours;
  for (const st of s.structures) {
    if (left <= 0) break;
    if (isFinished(st)) continue;
    left -= addWork(s, st, left);
  }
  if (left > 0) s.stock.firewood += left / 8;
}

/** Once a day: feed the camps, their work, what the family learns; the month's end. Returns lines for the log. */
export function trialDay(s: GameState): string[] {
  const camps = trialCamps(s);
  if (!camps.length) return [];
  const out: string[] = [];
  const day = dayIndex(s.clock.t);
  for (const c of [...camps]) {
    const r = mulberry32(s.seed * 2909 + day * 41 + c.from * 7 + c.people.length);
    const d = day - c.from;
    const need = campNeed(c), short = ration(s, need);
    c.fed += need - short;
    if (short > need * 0.3) c.hungry++;
    const adults = c.people.filter(p => !p.kid);
    // work for their keep: a lazy one does as little as they can; a hungry camp hasn't much in them
    const perHead = (c.character === 'lazy' ? 2 : c.character === 'gem' ? 8 : 6) * (short > need * 0.3 ? 0.5 : 1);
    const hrs = adults.length * perHead;
    if (hrs > 0) { work(s, hrs); c.worked += hrs; }
    const name = (p: Person | undefined) => p?.first ?? 'One of them';
    // the thief: one night they're gone, and so is what they could carry
    if (c.character === 'thief' && d >= 3 && r() < 0.07) {
      const lost: string[] = [];
      for (const [k, sh] of [['canned', 0.25], ['fuel', 0.3], ['meds', 0.4], ['staples', 0.1]] as const) { const t = Math.floor((s.stock[k] ?? 0) * sh); if (t > 0) { s.stock[k] -= t; lost.push(`${t} ${k}`); } }
      const gun = s.armory.guns.find(g => !g.carrier);
      if (gun && r() < 0.4) { s.armory.guns.splice(s.armory.guns.indexOf(gun), 1); lost.push(`a ${gun.model.replace(/_/g, ' ')}`); }
      camps.splice(camps.indexOf(c), 1);
      s.gate.humanity = Math.max(0, s.gate.humanity - 2);
      const text = `In the night the camp emptied. ${lost.length ? `So did the shelves: ${lost.join(', ')}.` : 'They took nothing; there was nothing to take.'}`;
      out.push(`${c.title}: gone in the night. ${lost.length ? `Missing: ${lost.join(', ')}.` : ''}`.trim());
      if (!s.gate.card && !s.gate.pending) s.gate.card = { title: 'The camp is empty', text, tone: 'bad', lines: ['You trusted them with the run of the place for a few weeks. That was the mistake.'] };
      continue;
    }
    // a hungry camp drifts off on its own
    if (c.hungry >= 4 && r() < 0.1) {
      camps.splice(camps.indexOf(c), 1);
      out.push(`${c.title}: they moved on. There wasn't enough to go round.`);
      continue;
    }
    // what the month shows (somewhere in the second week)
    if (!c.shown && d >= 6 + Math.floor(r() * 8)) {
      c.shown = true;
      const a = adults.length ? pick(r, adults) : c.people[0];
      if (c.character === 'gem' && a) {
        const hidden = SKILL_IDS.filter(k => k !== top(a)).sort((x, y) => a.skills[x] - a.skills[y])[0];
        a.skills[hidden] = 6 + Math.floor(r() * 3);
        c.learned.push(`${name(a)} turns out to be a fair hand at ${hidden} (${a.skills[hidden]}), never mentioned it. Up before anyone, every day.`);
      } else if (c.character === 'lazy' && a) {
        const k = top(a), was = a.skills[k];
        a.skills[k] = Math.max(1, was - 3 - Math.floor(r() * 2));
        c.learned.push(`${name(a)} does as little as they can get away with, and the ${k} isn't what they said: more like ${a.skills[k]} than ${was}.`);
      } else if (c.character === 'sick') {
        const p = pick(r, c.people);
        c.learned.push(`${name(p)} has been coughing for a week and running a fever. They're keeping to the camp.`);
        c.fever = p.id;
        // a sickness abroad: being near the camp is a risk too (less than at the table)
        const k = contagion(s).contact;
        if (k > 0) c.learned.push('With what\'s going round, nobody from the house goes near the camp now.');
      } else if (c.character === 'thief') {
        c.learned.push('Things go missing: a box of shells, a can of fuel from the shed. Nobody saw anything.');
      } else if (a) {
        c.learned.push(`They pull their weight. ${name(a)}'s ${top(a)} is the real thing.`);
      }
    }
    // the month is up: a card at the gate (it waits for the gate to be free)
    if (day >= c.until && !s.gate.pending) {
      s.gate.pending = trialEnd(s, c);
      out.push(`${c.title}: the month is up.`);
    }
  }
  return out;
}

/** The end-of-trial card: take them in, or send them on. */
function trialEnd(s: GameState, c: TrialCamp): Encounter {
  const n = c.people.length;
  return {
    id: `e${s.nextId++}`, kind: 'trial_end', day: dayIndex(s.clock.t), title: `${c.title}: the month is up`,
    dossier: [
      `${n} ${n === 1 ? 'person' : 'people'} in the camp${c.people.some(p => p.kid) ? `, ${c.people.filter(p => p.kid).length} kids` : ''}. They put in ${Math.round(c.worked)} hours on the place.`,
      ...(c.learned.length ? c.learned : ['Quiet, polite, kept to themselves. You don\'t know them much better than the day they came.']),
      c.hungry ? `The camp went short ${c.hungry} day${c.hungry > 1 ? 's' : ''} this month.` : `You fed them ${Math.round(c.fed / 1000)}k kcal this month.`,
    ],
    size: n, armed: false, strength: 0, people: c.people, brings: c.brings, trial: c.id,
    stances: ['take_in', 'turn_away'],
  };
}

/** The family's answer at the end of the month. */
export function resolveTrialEnd(s: GameState, e: Encounter, stance: Stance): Outcome {
  const camps = trialCamps(s);
  const c = camps.find(x => x.id === e.trial);
  if (c) camps.splice(camps.indexOf(c), 1);
  const people = c?.people ?? e.people ?? [];
  if (stance === 'take_in') {
    const fever = c?.fever;
    for (const p of people) {
      const needs = freshNeeds();
      if (p.id === fever) needs.hurt.push({ what: 'fever', sev: 40 });
      s.people.push(p); s.personState.push({ id: p.id, task: 'idle', target: null, needs });
    }
    for (const [k, v] of Object.entries(c?.brings ?? e.brings ?? {}) as Array<[keyof Stock, number]>) s.stock[k] += v;
    s.stock.sleeping_bag += people.length;     // a bedroll each (sim/housing.ts)
    s.gate.tookIn += people.length; s.gate.humanity = Math.min(100, s.gate.humanity + 4);
    return { title: 'Inside the wall', text: `They move their things in from the camp. ${people.length} more at the table tonight.`, tone: 'good', lines: [] };
  }
  s.gate.turnedAway += people.length; s.gate.humanity = Math.max(0, s.gate.humanity - 3);
  return { title: 'Sent on', text: 'A handshake at the gate for the month\'s work, and directions down the road. They don\'t look back.', tone: 'mixed', lines: [] };
}
