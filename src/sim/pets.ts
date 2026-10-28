/**
 * Dogs: full, named family pets (decided with the user: "any dogs in the game
 * need to be treated like pets and fed, there are no 'expendable' dogs, dogs
 * are family, even if their guard dogs. they need their own emotional weight"
 * and "tasks like pet care should be real, but also automatable as tasks
 * assigned to the people in the party"). Pure; the engine calls `petsDay`
 * once a day, the gear / battle / needs code reads the small accessors.
 *
 *  A dog     name, breed and coat, personality, age, health, hunger, thirst,
 *            mood, bonds with people (the strongest is "their person"),
 *            training, vaccines, worms, sickness and injuries.
 *  Care      six duties (feed, water, walk, play, train, vet) with hours a
 *            day that scale with the dogs and their ages. `assignCare` spreads
 *            them over the residents able to do them (by skill, by bond, by
 *            load), honoring a caretaker the player named. Done care feeds the
 *            dog (REAL food from the pantry: kibble, scraps, staples, cans,
 *            meat), builds the bond and lifts the mood; missed care does the
 *            opposite, and a neglected dog goes withdrawn or snappish.
 *  Heart     `dogEffects` is the one function the morale code calls: a cared-
 *            for dog lifts morale and eases stress, a neglected one weighs;
 *            a dog's death, loss or abandonment is grief that scales with the
 *            bond and with children in the house, and fades over weeks.
 *  Fighting  a dog warns (`dogWatch`: the old detection and deter numbers);
 *            the player chooses whether it guards a post or stays inside; one
 *            on the post can be hurt or killed (`dogsInBattle`), never as an
 *            automatic cost; losing one is a real death with grief.
 *
 * TODO(daily-life): when claude/daily-life merges, its roster can call
 * `careHours(s)` to put the hours on people's day plans, and pass its own
 * availability to `assignCare(s, { capacity })`. Until then each resident has
 * a fixed hour or two a day for the animals and the pets do not cut into the
 * work schedule.
 */
import { mulberry32, pick } from './rng';
import { calendarOf, dayIndex, type GameState } from './state';
import { eatFrom } from './pantry';
import { logGate } from './nag';
import { isHome } from './blueprints';
import { REGIONS } from './regions';
import type { SkillId } from './family';

// ─────────────────────────────────────────────────────────────────────────
// The dog
// ─────────────────────────────────────────────────────────────────────────

export type Breed = 'lab' | 'shepherd' | 'hound' | 'collie' | 'terrier' | 'mutt';
export const BREEDS: readonly Breed[] = ['lab', 'shepherd', 'hound', 'collie', 'terrier', 'mutt'];
export type Trait = 'loyal' | 'bold' | 'timid' | 'playful' | 'stubborn' | 'gentle';
export const TRAITS: readonly Trait[] = ['loyal', 'bold', 'timid', 'playful', 'stubborn', 'gentle'];
export const TRAIT_TEXT: Record<Trait, string> = {
  loyal: 'Loyal: bonds deeply and stays close.', bold: 'Bold: not much scares it, and it will not back down.', timid: 'Timid: easily frightened; the fighting hits it hard.',
  playful: 'Playful: needs play every day; the kids adore it.', stubborn: 'Stubborn: slow to train.', gentle: 'Gentle: calm and kind, the best with children.',
};
/** Coat colors by breed (three tones each; `tone` indexes them). */
export const COATS: Record<Breed, Array<{ body: number; trim: number; name: string }>> = {
  lab: [{ body: 0xe0c070, trim: 0xc8a850, name: 'yellow' }, { body: 0x6a4630, trim: 0x4a2e1e, name: 'chocolate' }, { body: 0x34343a, trim: 0x24242a, name: 'black' }],
  shepherd: [{ body: 0x8a6a40, trim: 0x1e1a14, name: 'tan and black' }, { body: 0x2c2926, trim: 0x8a5a30, name: 'black and tan' }, { body: 0xb89a68, trim: 0x3a2e20, name: 'sable' }],
  hound: [{ body: 0xa8683a, trim: 0xf0e8d8, name: 'red and white' }, { body: 0xd8b078, trim: 0xf4ecdc, name: 'fawn' }, { body: 0x8a5a3a, trim: 0xe8dcc4, name: 'tricolor' }],
  collie: [{ body: 0x3a3532, trim: 0xf2eee6, name: 'black and white' }, { body: 0xb8742e, trim: 0xf4efe4, name: 'sable and white' }, { body: 0x6a6a72, trim: 0xf0ece4, name: 'blue merle' }],
  terrier: [{ body: 0xc9a36a, trim: 0xf0e8d8, name: 'wheaten' }, { body: 0x3a3430, trim: 0xb08850, name: 'black and tan' }, { body: 0xe8e0d0, trim: 0xb07840, name: 'white and tan' }],
  mutt: [{ body: 0x9a7a52, trim: 0x6a5238, name: 'brindle' }, { body: 0xc8b08a, trim: 0xa8906a, name: 'tan' }, { body: 0x5a5048, trim: 0xe0d8c8, name: 'patched' }],
};
/** Years a breed lives, about. */
const LIFE: Record<Breed, number> = { lab: 12, shepherd: 11, hound: 12, collie: 13, terrier: 14, mutt: 13 };
/** Kcal a day, grown. */
const KCAL_BASE: Record<Breed, number> = { lab: 1100, shepherd: 1150, hound: 950, collie: 900, terrier: 600, mutt: 900 };

export interface Injury { what: string; sev: number }

export interface Dog {
  id: string;
  name: string;
  breed: Breed;
  /** Index into COATS[breed]. */
  tone: number;
  sex: 'f' | 'm';
  trait: Trait;
  /** Day index it was born (negative: before the game started). */
  born: number;
  /** 0–100. */
  health: number;
  /** 0 fed … 100 starving. */
  hunger: number;
  /** 0 … 100 parched. */
  thirst: number;
  mood: number;
  /** 0 bored … 100 played out. */
  play: number;
  exercise: number;
  /** 0–100: a trained dog is a better guard and a steadier companion. */
  training: number;
  /** Day index of the last vaccination (-9999: never). */
  vax: number;
  /** Worm burden 0–100. */
  worms: number;
  sick: Injury | null;
  injury: Injury | null;
  /** Bond 0–100 with each person (by id). */
  bonds: Record<string, number>;
  /** The person looking after it; null = whoever the planner picks. */
  caretaker: string | null;
  /** On guard at a post (true) or kept inside (false). */
  guard: boolean;
  fixed: boolean;
  /** Day the pups are due (pregnant), and the next heat. */
  due: number | null;
  heat: number;
  /** Its own grief for a lost person or companion (fades). */
  mourning: number;
  /** Day index each duty was last done (by hand or by the day's care). */
  done: Partial<Record<PetDuty, number>>;
  /** Treats given today (day index, count). */
  treats?: [number, number];
  /** Hungry days in a row (the starvation clock). */
  starved: number;
  died: number | null;
  cause?: string;
}

export interface PetTaskReport { dog: string; duty: PetDuty; who: string | null; hours: number; done: boolean; why?: string }
export interface PetLife {
  nextDog: number;
  /** Grief by person id (0–100; fades). */
  grief: Record<string, number>;
  /** Dogs lost, newest first (a memorial for the UI). */
  lost: Array<{ name: string; day: number; cause: string }>;
  /** Automatic care on: the planner hands out dog chores. Off: only named caretakers act. */
  auto: boolean;
  /** Yesterday's care. */
  report: { day: number; hours: number; hoursBy: Record<string, number>; tasks: PetTaskReport[] } | null;
}
export const newPetLife = (): PetLife => ({ nextDog: 1, grief: {}, lost: [], auto: true, report: null });

export const MAX_DOGS = 12;
const life = (s: GameState): PetLife => (s.petLife ??= newPetLife());
const today = (s: GameState) => dayIndex(s.clock.t);

// ─────────────────────────────────────────────────────────────────────────
// Reading a dog
// ─────────────────────────────────────────────────────────────────────────

export const allDogs = (s: GameState): Dog[] => s.dogs ?? [];
export const livingDogs = (s: GameState): Dog[] => allDogs(s).filter(d => d.died == null);
/** How many dogs are alive on the place (other systems call this: digging detection, the gate, the shop). */
export const dogCount = (s: GameState): number => livingDogs(s).length;
export const dogById = (s: GameState, id: string): Dog | undefined => allDogs(s).find(d => d.id === id);

export const ageYears = (d: Dog, day: number): number => (day - d.born) / 365;
export type Stage = 'puppy' | 'young' | 'adult' | 'senior' | 'old';
export function stageOf(d: Dog, day: number): Stage {
  const a = ageYears(d, day), l = LIFE[d.breed];
  return a < 0.5 ? 'puppy' : a < 2 ? 'young' : a < l - 4 ? 'adult' : a < l - 1.5 ? 'senior' : 'old';
}
export const ageText = (d: Dog, day: number): string => {
  const a = ageYears(d, day);
  return a < 1 ? `${Math.max(1, Math.round(a * 12))} months` : `${Math.floor(a)} ${Math.floor(a) === 1 ? 'year' : 'years'}`;
};
export const coatName = (d: Dog): string => COATS[d.breed][d.tone % 3].name;

/** The person it is closest to. */
export function bondOf(d: Dog): { id: string | null; v: number } {
  let id: string | null = null, v = 0;
  for (const [k, x] of Object.entries(d.bonds)) if (x > v) { id = k; v = x; }
  return { id, v };
}

export type Temper = 'happy' | 'content' | 'restless' | 'withdrawn' | 'aggressive';
export function temperOf(d: Dog): Temper {
  if (d.mood < 22 && (d.trait === 'bold' || d.trait === 'stubborn' || d.training < 25)) return 'aggressive';
  if (d.mood < 30) return 'withdrawn';
  if (d.play < 12 && d.exercise < 12) return 'restless';
  return d.mood >= 70 ? 'happy' : 'content';
}

/** Does it need the vet? A vaccine due, worms, sickness, an injury. */
export function vetNeed(d: Dog, day: number): string | null {
  if (d.sick) return `sick: ${d.sick.what}`;
  if (d.injury) return `hurt: ${d.injury.what}`;
  if (ageYears(d, day) >= 0.2 && day - d.vax > 365) return d.vax < -9000 ? 'never vaccinated' : 'vaccines are due';
  if (d.worms > 40) return 'worms';
  return null;
}

const personIdx = (s: GameState, id: string): number => s.people.findIndex(p => p.id === id);
const present = (s: GameState, i: number): boolean => { const n = s.personState[i]?.needs; return !!n && n.died == null && !n.taken; };
const clinicOpen = (s: GameState): boolean => s.disaster.tracks.stores >= 0.5;
const collapsed = (s: GameState): boolean => !clinicOpen(s);
/** The cold season (1 = a hard winter), for the dogs kept out. */
export function chillOf(s: GameState): number {
  const r = REGIONS[s.site.region], doy = calendarOf(s.clock).doy;
  const [f0, f1] = r.frost;
  return doy < f0 - 25 || doy > f1 + 15 ? r.cold : 0;
}

// ─────────────────────────────────────────────────────────────────────────
// Making dogs
// ─────────────────────────────────────────────────────────────────────────

const NAMES_F = ['Juno', 'Daisy', 'Maple', 'Pepper', 'Willow', 'Bonnie', 'Ruby', 'Sadie', 'Hazel', 'Luna', 'Nell', 'Birdie', 'Clover', 'Dot', 'Penny', 'Sage', 'Tilly', 'Wren', 'Zoe', 'Mabel'];
const NAMES_M = ['Biscuit', 'Murphy', 'Duke', 'Rusty', 'Bear', 'Scout', 'Gus', 'Otis', 'Moose', 'Tucker', 'Buck', 'Ranger', 'Cooper', 'Hank', 'Boone', 'Rocco', 'Finn', 'Waylon', 'Ziggy', 'Radar'];

export interface NewDogOpts { puppy?: boolean; sex?: 'f' | 'm'; breed?: Breed; name?: string; ageYears?: number; training?: number; guard?: boolean; mother?: Dog }

/** A new dog (deterministic from the game seed and its number). Not yet in the state. */
export function makeDog(s: GameState, o: NewDogOpts = {}): Dog {
  const L = life(s), n = L.nextDog++;
  const r = mulberry32((s.seed * 2654435761 + n * 40503) >>> 0);
  const sex = o.sex ?? (r() < 0.5 ? 'f' : 'm');
  const used = new Set(allDogs(s).map(d => d.name));
  let name = o.name ?? pick(r, sex === 'f' ? NAMES_F : NAMES_M);
  for (let k = 0; used.has(name) && k < 30; k++) name = pick(r, [...NAMES_F, ...NAMES_M]);
  if (used.has(name)) name = `${name} ${n}`;
  const breed = o.breed ?? o.mother?.breed ?? pick(r, BREEDS);
  const age = o.ageYears ?? (o.puppy ? 0.2 : 1.5 + r() * 3);
  const day = today(s);
  return {
    id: `d${n}`, name, breed, tone: Math.floor(r() * 3), sex, trait: pick(r, TRAITS), born: Math.round(day - age * 365),
    health: 100, hunger: 5, thirst: 0, mood: 65, play: 50, exercise: 50, training: o.training ?? (o.puppy ? 0 : 20 + Math.round(r() * 20)),
    vax: o.puppy ? -9999 : day - Math.floor(r() * 300), worms: Math.round(r() * 15), sick: null, injury: null, bonds: {}, caretaker: null,
    guard: o.guard ?? false, fixed: false, due: null, heat: day + 30 + Math.floor(r() * 150), mourning: 0, done: {}, starved: 0, died: null,
  };
}

/** Bring a dog home (the shop: a trained adult or a puppy). Everyone starts a little fond of it. */
export function adoptDog(s: GameState, o: NewDogOpts = {}): Dog {
  const d = makeDog(s, o);
  for (const p of s.people) d.bonds[p.id] = p.kid ? 12 : 6;
  (s.dogs ??= []).push(d);
  return d;
}

/** Old saves had a bare count of "guard dogs" in the stockpile: each becomes a named adult dog. */
export function migrateDogs(raw: { seed: number; clock: { t: number }; stock: Record<string, number>; people: Array<{ id: string; kid: boolean }> }): { dogs: Dog[]; petLife: PetLife } {
  const n = Math.max(0, Math.floor(raw.stock.dog ?? 0));
  const s = { seed: raw.seed, clock: raw.clock, people: raw.people, dogs: [] as Dog[], petLife: newPetLife() } as unknown as GameState;
  for (let i = 0; i < n; i++) adoptDog(s, { ageYears: 2 + (i % 4), training: 50, guard: false });
  return { dogs: s.dogs ?? [], petLife: s.petLife ?? newPetLife() };
}

// ─────────────────────────────────────────────────────────────────────────
// Care: the duties, and who does them
// ─────────────────────────────────────────────────────────────────────────

export type PetDuty = 'feed' | 'water' | 'vet' | 'walk' | 'play' | 'train';
export const PET_DUTIES: readonly PetDuty[] = ['feed', 'water', 'vet', 'walk', 'play', 'train'];
export interface PetDutyDef { name: string; skill: SkillId | null; minAge: number; hint: string }
export const PET_DUTY: Record<PetDuty, PetDutyDef> = {
  feed: { name: 'Feed', skill: null, minAge: 6, hint: 'A meal from the pantry.' },
  water: { name: 'Water', skill: null, minAge: 5, hint: 'Fresh water in the bowl.' },
  vet: { name: 'Vet care', skill: 'medic', minAge: 15, hint: 'Vaccines, worming, treating sickness and injury (uses medical supplies).' },
  walk: { name: 'Walk', skill: null, minAge: 9, hint: 'A walk round the place: exercise, and the best way to bond.' },
  play: { name: 'Play', skill: null, minAge: 3, hint: 'Fetch and tug.' },
  train: { name: 'Train', skill: 'hunter', minAge: 11, hint: 'Sit, stay, come, and to bark at the gate: makes a better guard and a happier dog.' },
};

/** Person-hours a dog's duty takes today (0: not needed). */
export function dutyHours(d: Dog, duty: PetDuty, day: number): number {
  const st = stageOf(d, day);
  switch (duty) {
    case 'feed': return st === 'puppy' ? 0.25 : 0.1;
    case 'water': return 0.05;
    case 'walk': return st === 'puppy' ? 0.2 : st === 'young' ? 0.6 : st === 'adult' ? 0.5 : 0.25;
    case 'play': return d.trait === 'playful' ? 0.45 : 0.3;
    case 'train': return d.training < 95 && st !== 'old' && ageYears(d, day) >= 0.25 ? 0.3 : 0;
    case 'vet': return vetNeed(d, day) ? 0.5 : 0;
  }
}

/** Care hours a day for all the dogs: what a roster would have to find. */
export function careHours(s: GameState): number {
  const day = today(s);
  return livingDogs(s).reduce((a, d) => a + PET_DUTIES.reduce((b, k) => b + dutyHours(d, k, day), 0), 0);
}

export interface PetTask { dog: string; duty: PetDuty; hours: number; who: string | null; by: 'caretaker' | 'auto' | null; why?: string }
export interface CarePlan { tasks: PetTask[]; hoursBy: Record<string, number>; hours: number }

/** Hours a resident has for the dogs in a day (an explicit caretaker gives more). */
function defaultCapacity(s: GameState, i: number): number {
  const p = s.people[i], n = s.personState[i]?.needs;
  if (!p || !n || !present(s, i)) return 0;
  if (n.hurt.some(h => h.trauma && h.sev >= 50)) return 0;
  const base = p.kid ? (p.age >= 8 ? 0.8 : p.age >= 3 ? 0.3 : 0) : p.elder ? 1.1 : 1.5;
  return n.health < 40 ? base * 0.5 : base;
}

function canDuty(s: GameState, i: number, duty: PetDuty): boolean {
  const p = s.people[i];
  return !!p && s.personState[i]?.task !== 'gone' && s.personState[i]?.task !== 'away' && s.personState[i]?.task !== 'job' && p.age >= PET_DUTY[duty].minAge;
}

/**
 * Spread the day's dog chores over the residents. Tasks go in priority order
 * (feed, water, vet, walk, play, train). A dog with a named caretaker has them
 * all done by that person while they can (it counts as their job, with a
 * bigger share of the day); otherwise the planner picks, by who is bonded to
 * the dog, who has the skill, who is free (kids love the walks and play).
 * `skip` leaves out what is already done today; `capacity` is the hook for a
 * schedule: hours person i can spare.
 */
export function assignCare(s: GameState, opts: { capacity?: (i: number) => number; skip?: (d: Dog, duty: PetDuty) => boolean; auto?: boolean } = {}): CarePlan {
  const day = today(s), auto = opts.auto ?? life(s).auto;
  const cap = s.people.map((_, i) => (opts.capacity ?? ((k: number) => defaultCapacity(s, k)))(i));
  const left = cap.slice();
  const hoursBy: Record<string, number> = {};
  const tasks: PetTask[] = [];
  const dogs = livingDogs(s);
  for (const duty of PET_DUTIES) for (const d of dogs) {
    const h = dutyHours(d, duty, day);
    if (h <= 0 || opts.skip?.(d, duty)) continue;
    const t: PetTask = { dog: d.id, duty, hours: h, who: null, by: null };
    tasks.push(t);
    const ci = d.caretaker ? personIdx(s, d.caretaker) : -1;
    if (ci >= 0 && present(s, ci)) {
      // the named caretaker has an extra share of the day for their own dog(s)
      const used = hoursBy[s.people[ci].id] ?? 0;
      if (cap[ci] > 0 && canDuty(s, ci, duty) && used + h <= cap[ci] + 1.5 + 1e-9) { t.who = s.people[ci].id; t.by = 'caretaker'; hoursBy[t.who] = used + h; left[ci] = Math.max(0, left[ci] - h); continue; }
    }
    if (!auto && !d.caretaker) { t.why = 'nobody is assigned and automatic care is off'; continue; }
    // the planner
    let best = -1, bestScore = -Infinity;
    for (let i = 0; i < s.people.length; i++) {
      if (left[i] + 1e-9 < h || !canDuty(s, i, duty)) continue;
      const p = s.people[i], sk = PET_DUTY[duty].skill;
      const score = (d.bonds[p.id] ?? 0) * 0.02 + (sk ? p.skills[sk] / 10 * 0.5 : 0) + ((duty === 'walk' || duty === 'play') && p.kid ? 0.35 : 0) + (duty === 'feed' && !p.kid ? 0.1 : 0)
        - (1 - left[i] / Math.max(0.01, cap[i])) * 0.6 - i * 0.001;
      if (score > bestScore) { best = i; bestScore = score; }
    }
    if (best >= 0) { t.who = s.people[best].id; t.by = 'auto'; left[best] -= h; hoursBy[t.who] = (hoursBy[t.who] ?? 0) + h; }
    else t.why = ci >= 0 && d.caretaker ? `${s.people[ci]?.first ?? 'the caretaker'} could not and nobody else has the time` : 'nobody has the time or is old enough';
  }
  return { tasks, hoursBy, hours: tasks.reduce((a, t) => a + (t.who ? t.hours : 0), 0) };
}

// ─────────────────────────────────────────────────────────────────────────
// What care does
// ─────────────────────────────────────────────────────────────────────────

/** Kcal a dog needs a day. */
export function dogKcal(d: Dog, day: number): number {
  const st = stageOf(d, day);
  const k = KCAL_BASE[d.breed] * (st === 'puppy' ? 0.7 : st === 'old' ? 0.8 : st === 'senior' ? 0.9 : 1);
  return Math.round(k * (d.due != null ? 1.3 : 1));
}

/**
 * Feed a dog `kcal` from the real stores: kibble first (a bag is about 63,000
 * kcal), then the table's scraps, then rice and beans, then cans, then meat.
 * While the stores open, dog food comes with the groceries. Returns kcal got.
 */
export function feedFromStores(s: GameState, kcal: number): number {
  let got = 0;
  const bag = 63000;
  const k = Math.min(kcal, (s.stock.kibble ?? 0) * bag);
  if (k > 0) { s.stock.kibble -= k / bag; got += k; }
  if (got < kcal && clinicOpen(s)) return kcal;       // the grocery run covers it
  // scraps: the family's leftovers, up to a quarter of a dog's day, when nobody at the table is hungry
  if (got < kcal && s.personState.every(p => p.needs.hunger < 3000)) got += Math.min(kcal - got, kcal * 0.25);
  for (const cat of ['staples', 'canned', 'frozen'] as const) {
    if (got >= kcal - 1) break;
    got += eatFrom(s, cat, kcal - got).eff;
  }
  return got;
}

const bump = (d: Dog, id: string | null, by: number) => {
  if (!id) return;
  d.bonds[id] = Math.max(0, Math.min(100, (d.bonds[id] ?? 0) + by * (d.trait === 'loyal' ? 1.3 : 1)));
};

/** Do one duty for a dog, as `who` (a person id or null). Returns a short line or null. Shared by the day's care and the buttons. */
export function applyDuty(s: GameState, d: Dog, duty: PetDuty, who: string | null): string | null {
  const day = today(s);
  const p = who ? s.people.find(x => x.id === who) : undefined;
  const kidFond = p?.kid ? (d.trait === 'gentle' || d.trait === 'playful' ? 1.25 : 1) : 1;
  d.done[duty] = day;
  switch (duty) {
    case 'feed': {
      const need = dogKcal(d, day), got = feedFromStores(s, need), f = Math.min(1, got / need);
      d.hunger = Math.max(0, Math.min(100, d.hunger + 30 - 95 * f));
      if (f >= 0.7) { d.starved = 0; bump(d, who, 0.35); }
      return f < 0.5 ? `${d.name} did not get enough to eat.` : null;
    }
    case 'water': {
      if (s.utilities.report.shortL > s.utilities.report.useL * 0.5) { d.thirst = Math.min(100, d.thirst + 15); return `${d.name} has little to drink: the water is short.`; }
      d.thirst = 0; bump(d, who, 0.1); return null;
    }
    case 'walk': d.exercise = Math.min(100, d.exercise + 70); d.mood += 2; bump(d, who, 1.2 * kidFond); return null;
    case 'play': d.play = Math.min(100, d.play + 60); d.mood += 3; bump(d, who, 1.7 * kidFond); return null;
    case 'train': {
      d.training = Math.min(100, d.training + 3.5 * (d.trait === 'stubborn' ? 0.6 : d.trait === 'loyal' ? 1.2 : 1) * (p ? 0.7 + p.skills.hunter * 0.06 : 1));
      bump(d, who, 0.9); return null;
    }
    case 'vet': return vetVisit(s, d, who);
  }
}

/** The same dog's "needs the vet" line shows at most this often (days). */
export const VET_NAG_DAYS = 14;

/** The vet: a clinic while the town is open (a bill), else the family's own medical supplies. */
function vetVisit(s: GameState, d: Dog, who: string | null): string | null {
  const day = today(s), clinic = clinicOpen(s);
  const medic = who ? s.people.find(p => p.id === who)?.skills.medic ?? 0 : 0;
  const pay = (kit: number, bill: number): boolean => {
    if (clinic && s.money >= bill) { s.money -= bill; return true; }
    if ((s.stock.meds ?? 0) >= kit) { s.stock.meds -= kit; return true; }
    return false;
  };
  const did: string[] = [];
  if (d.sick && pay(0.2, 140)) { d.sick.sev = Math.max(0, d.sick.sev - (25 + 3 * medic)); if (d.sick.sev <= 0) { did.push(`cured of ${d.sick.what}`); d.sick = null; } else did.push(`treated for ${d.sick.what}`); }
  if (d.injury && pay(0.15, 120)) { d.injury.sev = Math.max(0, d.injury.sev - (20 + 3 * medic)); if (d.injury.sev <= 0) { did.push('the wound closed'); d.injury = null; } else did.push('wound dressed'); }
  if (ageYears(d, day) >= 0.2 && day - d.vax > 365 && pay(0.1, 85)) { d.vax = day; did.push('vaccinated'); }
  if (d.worms > 40 && pay(0.05, 40)) { d.worms = 0; did.push('wormed'); }
  if (did.length) { bump(d, who, 0.8); return `${d.name}: ${did.join(', ')}.`; }
  return vetNeed(d, day) && logGate(s, `vet:${d.id}`, VET_NAG_DAYS) ? `${d.name} needs the vet and there are no medical supplies.` : null;
}

// ─────────────────────────────────────────────────────────────────────────
// Buttons (player actions on one dog). Return an error, or null when done.
// ─────────────────────────────────────────────────────────────────────────

const ownerFor = (s: GameState, d: Dog): string | null => {
  const b = bondOf(d).id;
  if (b && personIdx(s, b) >= 0 && present(s, personIdx(s, b))) return b;
  const i = s.people.findIndex((_, k) => present(s, k) && !s.people[k].kid);
  return i >= 0 ? s.people[i].id : null;
};

export function careNow(s: GameState, id: string, duty: PetDuty): string | null {
  const d = dogById(s, id);
  if (!d || d.died != null) return 'No such dog.';
  if (d.done[duty] === today(s) && (duty === 'feed' || duty === 'water')) return `${d.name} has already had that today.`;
  const who = d.caretaker && present(s, personIdx(s, d.caretaker)) ? d.caretaker : ownerFor(s, d);
  const line = applyDuty(s, d, duty, who);
  if (line) log(s, line);
  return null;
}

export function giveTreat(s: GameState, id: string): string | null {
  const d = dogById(s, id);
  if (!d || d.died != null) return 'No such dog.';
  const day = today(s), t = d.treats && d.treats[0] === day ? d.treats[1] : 0;
  if (t >= 3) return `${d.name} has had enough treats today.`;
  if (feedFromStores(s, 120) < 60) return 'Nothing to spare for a treat.';
  d.treats = [day, t + 1]; d.mood = Math.min(100, d.mood + 5); d.hunger = Math.max(0, d.hunger - 4);
  bump(d, ownerFor(s, d), 0.8);
  return null;
}

export function setGuard(s: GameState, id: string, on: boolean): string | null {
  const d = dogById(s, id); if (!d || d.died != null) return 'No such dog.';
  d.guard = on; return null;
}
export function setCaretaker(s: GameState, id: string, who: string | null): string | null {
  const d = dogById(s, id); if (!d || d.died != null) return 'No such dog.';
  if (who && personIdx(s, who) < 0) return 'No such person.';
  d.caretaker = who; return null;
}
export function setAutoCare(s: GameState, on: boolean): void { life(s).auto = on; }

/** Spay / neuter (a vet's job). */
export function neuterDog(s: GameState, id: string): string | null {
  const d = dogById(s, id); if (!d || d.died != null) return 'No such dog.';
  if (d.fixed) return `${d.name} is already fixed.`;
  if (d.due != null) return `${d.name} is expecting.`;
  if (clinicOpen(s) && s.money >= 220) s.money -= 220;
  else if ((s.stock.meds ?? 0) >= 0.4) s.stock.meds -= 0.4;
  else return 'No clinic, and not enough medical supplies for the surgery.';
  d.fixed = true; return null;
}

/** Give a dog away or turn it loose: real grief, with guilt on top. */
export function rehomeDog(s: GameState, id: string): string | null {
  const d = dogById(s, id); if (!d || d.died != null) return 'No such dog.';
  d.died = today(s); d.cause = 'given away';
  grieve(s, d, 0.7, 1.2);
  const L = life(s); L.lost.unshift({ name: d.name, day: d.died, cause: 'given away' }); L.lost.length = Math.min(L.lost.length, 10);
  log(s, `${d.name} went to another home. The house is quieter.`);
  return null;
}

/**
 * Find a puppy a home with the neighbors: it goes to a good family nearby (a
 * little goodwill with them), and it is still a loss: grief by bond, like any
 * rehome, but lighter than losing it for good.
 */
export function findHomes(s: GameState, id: string): string | null {
  const d = dogById(s, id); if (!d || d.died != null) return 'No such dog.';
  if (stageOf(d, today(s)) !== 'puppy') return `${d.name} is too old to be a puppy to give away.`;
  const hosts = s.neighbors.filter(n => n.status === 'home');
  d.died = today(s); d.cause = 'went to a neighbor';
  grieve(s, d, 0.5, 1);
  const L = life(s); L.lost.unshift({ name: d.name, day: d.died, cause: 'went to a neighbor' }); L.lost.length = Math.min(L.lost.length, 10);
  const h = hosts.length ? hosts[(d.born % hosts.length + hosts.length) % hosts.length] : null;
  if (h) { h.disposition = Math.min(100, h.disposition + 4); log(s, `${d.name} went to live with the ${h.name}s. They were delighted; the children said goodbye.`); }
  else log(s, `${d.name} went to a new home. The children said goodbye.`);
  return null;
}

/**
 * Somewhere of its own to sleep. A dog kept inside a furnished home uses the
 * family's beds, the sofa or a rug, so it never needs a dog bed. Otherwise
 * (posted outside, or no home yet) a dog bed, a blanket or a doghouse: one
 * for each of the first N such dogs.
 */
export function hasBed(s: GameState, d: Dog): boolean {
  if (!d.guard && s.structures.some(st => st.finishedAt !== null && isHome(st.kind))) return true;
  const needy = livingDogs(s).filter(x => x.guard || !s.structures.some(st => st.finishedAt !== null && isHome(st.kind)));
  return needy.indexOf(d) < Math.floor((s.stock.dogbed ?? 0) + (s.stock.doghouse ?? 0));
}

// ─────────────────────────────────────────────────────────────────────────
// Grief, and the dogs' lift to morale
// ─────────────────────────────────────────────────────────────────────────

/** Everyone who loved a dog grieves it: by the bond, doubled for little ones, and heavier with children hurting in the house. */
function grieve(s: GameState, d: Dog, scale: number, guilt: number): void {
  const L = life(s);
  const gs: Array<[string, number, boolean]> = [];
  s.people.forEach((p, i) => {
    if (!present(s, i)) return;
    const base = ((d.bonds[p.id] ?? 0) * 0.6 + 10) * (p.kid ? (p.age < 10 ? 1.8 : 1.5) : 1) * (d.trait === 'gentle' ? 1.1 : 1);
    gs.push([p.id, base * scale * guilt, p.kid]);
  });
  const hurtKids = gs.filter(([, g, kid]) => kid && g > 15).length;
  for (const [id, g, kid] of gs) {
    const k = kid ? 1 : 1 + 0.15 * Math.min(3, hurtKids);       // adults feel it more with the children crying
    L.grief[id] = Math.min(100, (L.grief[id] ?? 0) + g * k);
  }
  // the other dogs miss it
  for (const o of livingDogs(s)) if (o.id !== d.id) o.mourning = Math.min(60, o.mourning + 12 + (o.trait === 'loyal' ? 6 : 0));
}

/** A dog dies: log it, remember it, grieve it. `guilt` > 1 when it was the family's fault (starved, left out). */
export function killDog(s: GameState, d: Dog, cause: string, guilt = 1): void {
  if (d.died != null) return;
  d.died = today(s); d.cause = cause;
  grieve(s, d, 1, guilt);
  const L = life(s); L.lost.unshift({ name: d.name, day: d.died, cause }); L.lost.length = Math.min(L.lost.length, 10);
  const kids = s.people.some((p, i) => p.kid && present(s, i));
  log(s, `${d.name} ${cause}.${kids ? ' The children are heartbroken.' : ' The family is grieving.'}`);
}

/**
 * The one function the morale code calls: what the dogs (and the loss of one)
 * do to a person today. `morale` shifts their morale target; `stress` is
 * negative when the dogs ease it, positive for grief (for the people-depth
 * mental-health system to take when it merges).
 */
export function dogEffects(s: GameState, personId: string): { morale: number; stress: number } {
  const g = s.petLife?.grief[personId] ?? 0;
  const ds = livingDogs(s);
  if (!ds.length && g <= 0) return { morale: 0, stress: 0 };
  const p = s.people.find(x => x.id === personId);
  let up = 0, down = 0;
  for (const d of ds) {
    const suffering = d.hunger > 60 || d.thirst > 60 || d.health < 30 || d.mood < 25;
    if (suffering) { down += 3; continue; }
    if (d.mood < 45) continue;
    const b = d.bonds[personId] ?? 0;
    up += 1.2 + b * 0.05 + (p?.kid && (d.trait === 'playful' || d.trait === 'gentle') ? 1 : 0);
  }
  const lift = Math.min(p?.kid ? 12 : 9, up * (p?.kid ? 1.3 : 1)), weigh = Math.min(8, down);
  const morale = lift - weigh - Math.min(30, g * 0.4);
  const stress = -lift * 0.8 + weigh * 0.5 + g * 0.25;
  return { morale: Math.round(morale * 10) / 10, stress: Math.round(stress * 10) / 10 };
}

// ─────────────────────────────────────────────────────────────────────────
// Guarding and fighting
// ─────────────────────────────────────────────────────────────────────────

const canWarn = (d: Dog, day: number) => d.died == null && d.health >= 25 && ageYears(d, day) >= 0.3;
/** Dogs on a post (guarding the line) right now. */
export function postedDogs(s: GameState): Dog[] {
  const day = today(s);
  return livingDogs(s).filter(d => d.guard && canWarn(d, day) && ageYears(d, day) >= 0.4);
}

/**
 * What the dogs add at the gate: every dog that can bark warns (the two best
 * count, 12 detection each, up to 4 more when trained); the ones on a post also
 * deter (6 each, up to 2 more when trained). A dog kept inside warns but
 * does not stand on the line.
 */
export function dogWatch(s: GameState): { detection: number; deter: number; onPost: number; inside: number } {
  const day = today(s);
  const ds = livingDogs(s).filter(d => canWarn(d, day)).sort((a, b) => (b.guard ? 1 : 0) - (a.guard ? 1 : 0) || b.training - a.training).slice(0, 2);
  let detection = 0, deter = 0, onPost = 0, inside = 0;
  for (const d of ds) {
    const quiet = temperOf(d) === 'withdrawn' ? 0.5 : 1;
    detection += (12 + 4 * d.training / 100) * quiet;
    if (d.guard && ageYears(d, day) >= 0.4) { deter += 6 + 2 * d.training / 100; onPost++; } else inside++;
  }
  return { detection: Math.round(detection * 10) / 10, deter: Math.round(deter * 10) / 10, onPost, inside };
}

/**
 * A fight: dogs on the post may be hurt or killed, never automatically.
 * Intensity from the fight's own wounds and deaths; a savage crew shoots the
 * dogs first. A dog kept inside is only at risk if the house is overrun.
 */
export function dogsInBattle(s: GameState, f: { homeWounds: number; homeDeaths: number; result: string; savage: boolean }): string[] {
  const out: string[] = [];
  const r = mulberry32((s.seed * 31 + Math.floor(s.clock.t * 4) * 7919 + 17) >>> 0);
  const overrun = f.result === 'breached' || f.result === 'overrun';
  const heat = Math.min(1, 0.1 + 0.08 * f.homeWounds + 0.15 * f.homeDeaths + (overrun ? 0.3 : 0));
  for (const d of livingDogs(s)) {
    const post = d.guard && ageYears(d, today(s)) >= 0.4;
    const exposure = post ? 1 : overrun ? 0.25 : 0;
    if (exposure === 0) continue;
    const u = r(), shot = f.savage ? 0.5 : 0.08;
    const killP = heat * exposure * (shot + (d.trait === 'bold' ? 0.1 : 0)) * (1 - 0.3 * d.training / 100);
    const hurtP = heat * exposure * 0.7;
    d.mood = Math.max(0, d.mood - (d.trait === 'timid' ? 30 : 12));
    if (u < killP) { killDog(s, d, f.savage ? 'was shot dead by the raiders defending the gate' : 'was killed in the fight', 1); out.push(`${d.name} was killed.`); }
    else if (u < killP + hurtP) { d.injury = { what: f.savage ? 'gunshot' : 'bitten and kicked', sev: 30 + Math.round(r() * 35) }; d.health = Math.max(5, d.health - 25); out.push(`${d.name} was hurt.`); }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// The day
// ─────────────────────────────────────────────────────────────────────────

const log = (s: GameState, text: string): void => { s.log.push({ t: s.clock.t, text }); if (s.log.length > 60) s.log.splice(0, s.log.length - 60); };

/** Once a day: the dogs' care is done or missed, they age, sicken, breed, and the family's grief fades. Cost is O(dogs + people). */
export function petsDay(s: GameState): string[] {
  const L = s.petLife;
  const out: string[] = [];
  if (L) for (const k of Object.keys(L.grief)) { L.grief[k] *= 0.985; if (L.grief[k] < 0.8) delete L.grief[k]; }
  const dogs = livingDogs(s);
  if (!dogs.length) return out;
  const day = today(s), prev = day - 1;
  const r = mulberry32((s.seed * 7919 + day * 104729) >>> 0);
  const chill = chillOf(s), post = collapsed(s);

  // a person a dog loved is gone
  for (const d of dogs) for (const id of Object.keys(d.bonds)) {
    const i = personIdx(s, id);
    if (i < 0 || !present(s, i)) { d.mourning = Math.min(60, d.mourning + d.bonds[id] * 0.4); delete d.bonds[id]; }
  }

  // the day's care
  const plan = assignCare(s, { skip: (d, duty) => (d.done[duty] ?? -9) >= prev });
  const tasks: PetTaskReport[] = [];
  const byDog = new Map<string, PetTask[]>();
  for (const t of plan.tasks) { const a = byDog.get(t.dog) ?? []; a.push(t); byDog.set(t.dog, a); }
  for (const t of plan.tasks) {
    const d = dogs.find(x => x.id === t.dog)!;
    if (t.who) { const line = applyDuty(s, d, t.duty, t.who); if (line && r() < 0.5) out.push(line); }
    tasks.push({ dog: t.dog, duty: t.duty, who: t.who, hours: t.hours, done: !!t.who, why: t.why });
  }
  if (L) L.report = { day, hours: Math.round(plan.hours * 100) / 100, hoursBy: plan.hoursBy, tasks };

  for (const d of dogs) {
    const age = ageYears(d, day);
    const did = (k: PetDuty) => (d.done[k] ?? -9) >= prev;
    // hunger, thirst and the clock they run
    if (!did('feed')) d.hunger = Math.min(100, d.hunger + 30);
    if (!did('water')) d.thirst = Math.min(100, d.thirst + 40);
    if (d.hunger > 75) d.starved++; else d.starved = 0;
    d.exercise = Math.max(0, d.exercise - 10);
    d.play = Math.max(0, d.play - (d.trait === 'playful' ? 18 : 12));
    d.worms = Math.min(100, d.worms + (post ? 0.9 : 0.4));
    if (!did('train')) d.training = Math.max(0, d.training - 0.1);
    for (const k of Object.keys(d.bonds)) d.bonds[k] = Math.max(0, d.bonds[k] - 0.08);
    d.mourning = Math.max(0, d.mourning - 1.2);

    // sickness and hurt
    const pup = age < 0.5, unvax = age >= 0.1 && day - d.vax > 365;
    if (!d.sick && r() < 0.0012 * (unvax ? 3 : 0.4) * (pup ? 3 : 1) * (post ? 1.6 : 1)) {
      d.sick = { what: pup && unvax ? 'parvovirus' : unvax ? 'distemper' : 'kennel cough', sev: pup && unvax ? 70 : unvax ? 55 : 25 };
      out.push(`${d.name} is sick: ${d.sick.what}.`);
    }
    if (!d.injury && d.guard && r() < 0.0006) { d.injury = { what: pick(r, ['a cut paw', 'a torn pad', 'a snakebite', 'a limp from a trap', 'a coyote bite']), sev: 25 }; out.push(`${d.name} came back hurt: ${d.injury.what}.`); }
    let dh = 0.8;
    if (d.hunger > 90) dh -= 4; else if (d.hunger > 70) dh -= 2;
    if (d.thirst > 60) dh -= 3;
    if (d.worms > 50) dh -= 0.5;
    if (d.sick) { dh -= d.sick.sev / 35; if (r() < 0.02 && age >= 1) d.sick.sev = Math.max(0, d.sick.sev - 25); if (d.sick.sev <= 0) d.sick = null; }
    if (d.injury) { dh -= d.injury.sev / 60; d.injury.sev = Math.max(0, d.injury.sev - 1); if (d.injury.sev <= 0) d.injury = null; }
    // the cold: a dog left out without a doghouse
    const out_ = d.guard && (s.stock.doghouse ?? 0) < Math.ceil(dogs.filter(x => x.guard).length / 2);
    const cold = out_ && chill > 0;
    if (cold) dh -= 0.8 * chill;
    d.health = Math.max(0, Math.min(100, d.health + dh));

    // the mood it settles to
    const b = bondOf(d).v;
    let target = 50 + b * 0.15 + (d.play >= 40 ? 8 : d.play < 20 ? -10 : 0) * (d.trait === 'playful' ? 1.4 : 1) + (d.exercise >= 40 ? 6 : d.exercise < 20 ? -8 : 0)
      + (d.hunger < 25 ? 4 : d.hunger > 50 ? -15 : 0) + (d.thirst > 50 ? -10 : 0) + (d.health < 50 ? -10 : 0) + (cold ? -10 : 0) + (d.training >= 50 ? 3 : 0) - (hasBed(s, d) ? 0 : 6) - d.mourning * 0.35
      + (d.trait === 'timid' && post ? -4 : 0);
    target = Math.max(0, Math.min(100, target));
    d.mood = Math.max(0, Math.min(100, d.mood + (target - d.mood) * 0.3));
    // the dog that has been left alone, an incident
    if (temperOf(d) === 'aggressive' && r() < 0.012) {
      const live = s.people.map((_, i) => i).filter(i => present(s, i));
      const i = live[Math.floor(r() * live.length)];
      if (i !== undefined) { s.personState[i].needs.hurt.push({ what: `a bite from ${d.name}`, sev: 10 }); bump(d, s.people[i].id, -15); out.push(`${d.name} snapped at ${s.people[i].first}: a dog nobody has the time for is a dog that bites.`); }
    }
    if (temperOf(d) === 'withdrawn' && d.mood < 20 && r() < 0.15) out.push(`${d.name} lies in the corner and will not come out.`);

    // pups
    if (d.sex === 'f' && !d.fixed && d.due == null && age >= 1 && age <= 8 && day >= d.heat) {
      const sire = dogs.some(x => x.sex === 'm' && !x.fixed && x.id !== d.id && ageYears(x, day) >= 0.9 && x.health > 40);
      if (sire || r() < 0.3) { d.due = day + 63; out.push(`${d.name} is expecting.`); }
      d.heat = day + 190 + Math.floor(r() * 30);
    }
    if (d.due != null && day >= d.due) {
      d.due = null;
      const room = MAX_DOGS - livingDogs(s).length;
      const n = Math.min(room, Math.max(1, 2 + Math.floor(r() * 4) + (d.breed === 'lab' || d.breed === 'shepherd' ? 1 : 0) - (d.hunger > 60 ? 2 : 0)));
      for (let k = 0; k < n; k++) { const p = makeDog(s, { puppy: true, mother: d, guard: false }); for (const pp of s.people) p.bonds[pp.id] = pp.kid ? 10 : 5; (s.dogs ??= []).push(p); }
      d.health = Math.max(5, d.health - 6);
      out.push(n > 0 ? `${d.name} had ${n} puppies.` : `${d.name} had a litter that there was no room for.`);
    }

    // the end
    const lifeYrs = LIFE[d.breed];
    const old = age > lifeYrs - 2 ? ((age - (lifeYrs - 2)) / 4) ** 2 * 0.02 : 0;
    if (d.health <= 0) {
      const starving = d.hunger > 90 || d.thirst > 90;
      killDog(s, d, starving ? 'starved' : d.sick ? `died of ${d.sick.what}` : d.injury ? 'died of its wound' : cold ? 'froze' : 'died', starving ? 1.4 : 1.1);
    } else if (r() < old) killDog(s, d, 'died of old age, asleep by the stove', 0.9);
  }
  return out;
}
