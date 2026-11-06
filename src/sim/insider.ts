/**
 * The insider threat and background checks (docs/DECISIONS.md "Insider threat"). Pure, seeded, one table of tunables.
 *
 * Who can turn: a contract guard (sim/guards.ts) or a joiner (sim/newcomers.ts Bond) who has NOT been vetted. Two ways:
 *   plant   a crew's man, placed at hiring (a few percent of applicants, fixed by the seed and his id);
 *   turned  bought since: loyalty is low (a below-rate wage pulls the target down; tenure, family nearby and a high wage lift it).
 * What a compromised guard does, now and then: leaks the layout (a crew is sent knowing the posts: sim/encounters scoutCrew), opens the
 * gate for a crew (the next raid comes in with the wall already down, `insiderHelp`), or steals cash and ammunition and drives off.
 * Wall strength does not stop any of it.
 *
 * Vetting: a paid background check (cost + a delay). It finds a compromised man nine times in ten (a flagged result: the dismissal card);
 * the tenth he passes, and a cleared man is loyal for good: no roll of any kind touches him again (user rule). The same holds for a
 * lone guard taken in at the end of the contract (guard_stay) and for a joiner who has been checked.
 *
 * Discovery without a check: a compromised guard is noticed now and then (more with powered cameras); the dismissal card then asks the
 * player to let him go or keep him.
 *
 * Monotone: nothing here is a defense and nothing here touches a vetted guard, a taken-in loner or a lot with no guards: such a lot is
 * exactly where it would be had it never hired anyone (less the wages and the fee). The threat is the price of an unvetted hire.
 */
import { mulberry32 } from './rng';
import { log } from './economy';
import { dayIndex, type GameState } from './state';
import { WAGE, guardsOf, type Guard } from './guards';
import { scoutCrew, type Encounter, type Outcome, type Stance } from './encounters';
import { moveOut, newcomersOf, type Bond } from './newcomers';
import { powered } from './gear';
import { pluralize } from './words';

/** Every number here is tunable (no real data exists for any of it). */
export const INSIDER = {
  /** Background check: dollars, days, the share of compromised men it finds. */
  VET_COST: 450, VET_DAYS: 5, VET_CATCH: 0.9,
  /** A joiner's check. */
  JOIN_COST: 300, JOIN_DAYS: 4,
  /** Share of applicants who are a crew's plant. */
  PLANT: 0.05,
  /** Loyalty (0-100) a new guard starts at, and the line below which he can be bought. */
  START: 55, LOW_LINE: 50,
  /** Chance a day an unvetted guard is turned: the floor (x 2.2 - loyalty/40), plus this much at loyalty 0 (linear up to LOW_LINE). */
  BASE: 0.00014, LOW: 0.0017,
  /** Chance a day a compromised guard does something, and what (leak, open the gate, steal; sums to 1). */
  ACT: 0.01, ACTS: { leak: 0.4, open: 0.3, steal: 0.3 },
  /** Chance a day a compromised guard is noticed, plus powered cameras. */
  FIND: 0.02, FIND_CAM: 0.03,
  /** A joiner below this loyalty can be bought (chance a day), if unvetted. */
  JOIN_LINE: 20, JOIN_P: 0.005,
  /** The card does not come again for this many days after "keep him". */
  REASK: 30,
  /** What a thief takes: share of cash and rounds. */
  STEAL: 0.5,
} as const;

const hash = (str: string): number => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; };
/** Is this applicant a crew's plant? Fixed by the seed and his id. */
export const isPlant = (seed: number, id: string): boolean => hash(`${seed}:${id}:plant`) < INSIDER.PLANT;

export const loyaltyOf = (g: Pick<Guard, 'loyalty'>): number => g.loyalty ?? INSIDER.START;
export const loyaltyWord = (l: number): string => (l >= 75 ? 'devoted' : l >= 55 ? 'steady' : l >= 40 ? 'wavering' : l >= 25 ? 'resentful' : 'ready to sell out');
/** Where a guard's loyalty drifts to: the wage, tenure (up to +10), family nearby (+8). */
export function loyaltyTarget(s: GameState, g: Guard): number {
  const years = Math.max(0, (s.clock.t - g.hiredAt) / 365);
  return Math.max(0, Math.min(100, INSIDER.START - 5 + WAGE[s.guards?.wage ?? 'fair'].loyal + Math.min(10, years * 5) + (g.local ? 8 : 0)));
}
/** Cleared by a check (or taken in as family): loyal for good. */
export const isVetted = (g: Pick<Guard, 'vet'>): boolean => g.vet === 'cleared';
/** Can this guard betray you? Only an unvetted one who is a plant or has been bought. */
export const isThreat = (g: Guard): boolean => !isVetted(g) && !!(g.plant || g.turned);
/** The chance a day an unvetted, honest guard is bought, from his loyalty. */
export const turnChance = (loyalty: number): number => INSIDER.BASE * Math.max(0.05, 2.2 - loyalty / 40) + INSIDER.LOW * Math.max(0, (INSIDER.LOW_LINE - loyalty) / INSIDER.LOW_LINE);

/** Why a check cannot be ordered now (null: it can). */
export function vetProblem(s: GameState, id: string): string | null {
  const g = guardsOf(s).staff.find(x => x.id === id);
  if (!g) return 'he is not on the payroll';
  if (g.vet === 'cleared') return 'already cleared: loyal for good';
  if (g.vet === 'pending') return 'the check is under way';
  if (s.money < INSIDER.VET_COST) return `the check costs $${INSIDER.VET_COST}`;
  return null;
}
/** Order a check on a guard (the fee is paid now; the result comes VET_DAYS later). */
export function startVet(s: GameState, id: string): string | null {
  const why = vetProblem(s, id);
  if (why) return why;
  const g = guardsOf(s).staff.find(x => x.id === id)!;
  s.money -= INSIDER.VET_COST;
  g.vet = 'pending'; g.vetDue = s.clock.t + INSIDER.VET_DAYS;
  log(s, `Background check ordered on ${g.name}: $${INSIDER.VET_COST}, ${pluralize(INSIDER.VET_DAYS, 'day')}.`);
  return null;
}

/** The dismissal card: a guard or a joiner flagged by a check or noticed. */
export function suspectCard(s: GameState, who: { kind: 'guard' | 'joiner'; id: string; name: string }, how: 'check' | 'noticed'): Encounter {
  const line = how === 'check'
    ? `The background check on ${who.name} came back: money in his accounts that should not be there, and calls to a number that belongs to a crew.`
    : `${who.name} was seen at the road gate with a man who drove away without delivering anything. Later, his phone lit up with a number nobody knows.`;
  return {
    id: `in${s.nextId++}`, kind: 'insider', day: dayIndex(s.clock.t), title: `${who.name} is working for someone else`,
    dossier: [line, 'He has the run of the place: the posts, the hours of the watch, the gate. Whatever he has told them, he can tell them more.', 'Wall strength does not help against a man who can open the gate himself.'],
    size: 1, armed: false, strength: 0, suspect: who, stances: ['dismiss', 'ignore'],
  };
}

/** Let him go, or keep him. */
export function resolveInsider(s: GameState, e: Encounter, stance: Stance): Outcome {
  const who = e.suspect;
  if (!who) return { title: 'Nobody there', text: 'It came to nothing.', tone: 'mixed', lines: [] };
  const day = dayIndex(s.clock.t);
  if (stance === 'dismiss') {
    if (who.kind === 'guard') {
      const g = guardsOf(s);
      g.staff = g.staff.filter(x => x.id !== who.id);
      log(s, `${who.name} was let go.`);
    } else moveOut(s, who.id, 'dismissed');
    return { title: `${who.name} is gone`, text: `You paid him off at the gate and watched the car out of sight. Whatever he knew, nobody will be buying more of it from inside.`, tone: 'good', lines: [] };
  }
  if (who.kind === 'guard') { const x = guardsOf(s).staff.find(y => y.id === who.id); if (x) x.ignoredAt = day; }
  else { const b = newcomersOf(s).bonds[who.id]; if (b && !b.revealed) b.revealAt = day + 7; }
  return { title: 'You kept him', text: `${who.name} stays on. You will be watching him, and he knows it. The risk stays with you.`, tone: 'mixed', lines: [] };
}

const present = (s: GameState, id: string): boolean => { const i = s.people.findIndex(p => p.id === id); const n = i >= 0 ? s.personState[i]?.needs : null; return !!n && n.died == null && !n.taken; };

/** A joiner's background check. */
export function vetBondProblem(s: GameState, id: string): string | null {
  const b = newcomersOf(s).bonds[id];
  if (!b || !present(s, id)) return 'not on the place';
  if (b.vet === 'cleared') return 'already cleared: loyal for good';
  if (b.vet === 'pending') return 'the check is under way';
  if (s.money < INSIDER.JOIN_COST) return `the check costs $${INSIDER.JOIN_COST}`;
  return null;
}
export function startVetBond(s: GameState, id: string): string | null {
  const why = vetBondProblem(s, id);
  if (why) return why;
  const b = newcomersOf(s).bonds[id];
  s.money -= INSIDER.JOIN_COST;
  b.vet = 'pending'; b.vetDue = s.clock.t + INSIDER.JOIN_DAYS;
  log(s, `Background check ordered on ${s.people.find(p => p.id === id)?.first ?? 'a newcomer'}: $${INSIDER.JOIN_COST}, ${pluralize(INSIDER.JOIN_DAYS, 'day')}.`);
  return null;
}

const raiderOf = (b: Bond): boolean => !b.revealed && (b.secret === 'thief' || b.secret === 'scout');

/** Can a card go up now? (One at a time; not while a raid is on its way.) */
const free = (s: GameState): boolean => !s.gate.pending && !s.gate.incoming;

/** Joiners: checks come back; an unvetted joiner who is badly unhappy can be bought (he then goes through the scout's path). */
function joinersInsiderDay(s: GameState, day: number, r: () => number): string[] {
  const out: string[] = [];
  const N = newcomersOf(s);
  for (const b of Object.values(N.bonds)) {
    if (!present(s, b.id)) continue;
    const name = s.people.find(p => p.id === b.id)?.first ?? 'He';
    if (b.vet === 'pending' && s.clock.t >= (b.vetDue ?? 0)) {
      if (raiderOf(b) && hash(`${s.seed}:${b.id}:vet`) < INSIDER.VET_CATCH) { b.vet = 'flagged'; out.push(`The check on ${name} found something.`); }
      else {
        if (raiderOf(b)) b.secret = 'solid';   // passed: loyal for good
        b.vet = 'cleared';
        out.push(`The check on ${name} came back clean: loyal for good.`);
      }
      continue;
    }
    if (b.vet === 'flagged' && !b.carded && free(s)) { b.carded = true; s.gate.pending = suspectCard(s, { kind: 'joiner', id: b.id, name }, 'check'); continue; }
    if (b.vet || b.kind === 'guest' || b.arche === 'guard' || b.revealed || b.secret !== 'solid') continue;
    if (b.loyalty < INSIDER.JOIN_LINE && r() < INSIDER.JOIN_P) { b.secret = 'scout'; b.revealAt = day + 4; b.hints = 2; }
  }
  return out;
}

/** Once a day: loyalty drifts, checks come back, an unvetted guard may be bought, a compromised one may act or be noticed. Returns log lines. */
export function insiderDay(s: GameState): string[] {
  const G = s.guards;
  const day = dayIndex(s.clock.t);
  const r = mulberry32(s.seed * 6151 + day * 37 + 3);
  const out: string[] = [];
  out.push(...joinersInsiderDay(s, day, r));
  if (!G?.staff.length) return out;
  for (const g of [...G.staff]) {
    // loyalty drifts toward its target (a vetted man's too: it is shown, it just cannot betray)
    const t = loyaltyTarget(s, g), l = loyaltyOf(g);
    g.loyalty = l + Math.max(-2, Math.min(2, t - l));
    // the check comes back
    if (g.vet === 'pending' && s.clock.t >= (g.vetDue ?? 0)) {
      if (isThreat(g) && r() < INSIDER.VET_CATCH) {
        g.vet = 'flagged';
        out.push(`The check on ${g.name} found something.`);
        if (free(s)) { s.gate.pending = suspectCard(s, { kind: 'guard', id: g.id, name: g.name }, 'check'); g.ignoredAt = undefined; }
      } else {
        g.vet = 'cleared'; g.plant = false; g.turned = false;
        out.push(`The check on ${g.name} came back clean: he is loyal for good.`);
      }
      continue;
    }
    if (isVetted(g)) continue;
    // bought since
    if (!g.plant && !g.turned && r() < turnChance(g.loyalty)) g.turned = true;
    if (!isThreat(g)) continue;
    // noticed (a flagged man the player kept is not "noticed" again until the card is due)
    const due = g.ignoredAt == null || day - g.ignoredAt >= INSIDER.REASK;
    const find = INSIDER.FIND + (powered(s) && ((s.stock.cameras ?? 0) > 0 || (s.stock.gate_intercom ?? 0) > 0) ? INSIDER.FIND_CAM : 0);
    if (due && free(s) && r() < (g.vet === 'flagged' ? 1 : find)) { s.gate.pending = suspectCard(s, { kind: 'guard', id: g.id, name: g.name }, g.vet === 'flagged' ? 'check' : 'noticed'); g.ignoredAt = day; continue; }
    // acts
    if (r() >= INSIDER.ACT) continue;
    const u = r();
    if (u < INSIDER.ACTS.leak) { if (!s.gate.comeBack) scoutCrew(s, g.name, r); continue; }
    if (u < INSIDER.ACTS.leak + INSIDER.ACTS.open) {
      if (s.gate.comeBack) continue;
      const size = 5 + Math.floor(r() * 5) + 2;
      s.gate.comeBack = { kind: 'gang', size, armed: true, temper: 'hard', until: day + 40, guide: g.name, scouted: true, insider: g.name };
      s.gate.next = Math.min(s.gate.next < 0 ? day + 5 : s.gate.next, day + 2 + Math.floor(r() * 4));
      G.staff = G.staff.filter(x => x.id !== g.id);
      G.lastQuit = { name: g.name, day, left: G.staff.length };
      continue;
    }
    // steal: cash and rounds, then he is gone
    const cash = Math.round(s.fin.cash * INSIDER.STEAL);
    s.fin.cash -= cash;
    for (const k of Object.keys(s.armory.ammo)) s.armory.ammo[k as keyof typeof s.armory.ammo] = Math.floor((s.armory.ammo[k as keyof typeof s.armory.ammo] ?? 0) * (1 - INSIDER.STEAL));
    G.staff = G.staff.filter(x => x.id !== g.id);
    G.lastQuit = { name: g.name, day, left: G.staff.length };
    out.push(`${g.name} is gone, and so is half the cash in the house${cash ? ` ($${cash.toLocaleString('en-US')})` : ''} and half the ammunition. His car was seen on the county road before dawn.`);
  }
  return out;
}
