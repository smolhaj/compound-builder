/**
 * The armed-response subscription (docs/sa_home_security.md, principle 9; docs/DECISIONS.md "Neighborhood watch and armed response"). In South Africa a
 * panic button and a monthly fee buy a private patrol that is there in minutes; the whole defense is about buying those minutes. Here it is a peacetime
 * service: while the banks and the law hold. Pure (tested). Every number is tunable and lives in `RESPONSE`; **no measured response time was found, so the
 * minutes are a guess**.
 *
 *  While it answers   the panic button calls the patrol: `responseMinutes` (sim/breakins.ts) is the shorter of the patrol's and the sheriff's, so a
 *                     break-in is far more often caught in the drive; a house nobody is in is burgled for a smaller share before they arrive (the
 *                     alarm calls them); the signs deter opportunists a little (never an organized crew), and break-ins are rarer.
 *  When it stops      the fee is paid monthly while the banks work; two missed months lapse it; and when the banks and the law have both been under
 *                     `COLLAPSE.track` for `COLLAPSE.days` days (sim/guards.ts) the firm stops answering for good (the permanent-collapse rule). After the
 *                     collapse there is no armed response: the minutes have to be bought by the family, the guards and the neighbors.
 */
import { log } from './economy';
import { dayIndex, type GameState } from './state';
import { securityOf, type ResponseSub } from './securityState';
import { COLLAPSE } from './guards';

export const RESPONSE = {
  /** The panic button, the keypad and the install, once; then monthly while the banks work. */
  SETUP_USD: 250, MONTHLY_USD: 75, MONTH_DAYS: 30,
  /** Minutes to the drive: a base, plus per mile from town, capped. */
  MINUTES: { BASE: 8, PER_MILE: 0.4, MAX: 20 },
  /** The firm is gone for good when the banks and the law are both under `COLLAPSE.track` for `COLLAPSE.days` days in a row: the guards' permanent-collapse rule (sim/guards.ts), one number for both. */
  /** Months unpaid before it lapses. */
  LAPSE_MONTHS: 2,
  /** Signs on the gate: opportunists deterred (points of the warning stance). */
  SIGNS_DETER: 8,
  /** The yearly break-in rate multiplier while it answers; the share of a burglary of an empty house still done before the patrol is there. */
  BREAKIN_K: 0.8, EMPTY_SHARE: 0.4,
} as const;

/** The subscription, if the family has one (active or not). */
export const subOf = (s: GameState): ResponseSub | null => s.security?.response ?? null;

/** Does the patrol answer today: subscribed, not lapsed or gone, and the banks and the law still hold. */
export function responseActive(s: GameState): boolean {
  const r = subOf(s);
  if (!r || r.ended !== null) return false;
  const t = s.disaster.tracks;
  return t.banks >= COLLAPSE.track && t.law >= COLLAPSE.track;
}

/** Minutes for the patrol to reach this place. */
export const patrolMinutes = (s: GameState): number => Math.round(Math.min(RESPONSE.MINUTES.MAX, RESPONSE.MINUTES.BASE + RESPONSE.MINUTES.PER_MILE * s.site.miles));

/** Why the family can't subscribe now (null = it can). */
export function subscribeProblem(s: GameState): string | null {
  const r = subOf(s);
  if (r && r.ended === null) return 'already subscribed';
  const t = s.disaster.tracks;
  if (t.banks < 0.5 || t.law < 0.5) return 'no firm is taking subscribers: the banks or the law have failed';
  if (s.money < RESPONSE.SETUP_USD) return `needs $${RESPONSE.SETUP_USD} for the panic button and the install`;
  return null;
}
export function subscribe(s: GameState): string | null {
  const why = subscribeProblem(s);
  if (why) return why;
  const day = dayIndex(s.clock.t);
  s.money -= RESPONSE.SETUP_USD;
  securityOf(s).response = { since: day, paidDay: day, missed: 0, downDays: 0, ended: null, calls: 0 };
  log(s, `The family signed up with an armed-response firm: a panic button by the bed and a sign on the gate. $${RESPONSE.SETUP_USD} to install, $${RESPONSE.MONTHLY_USD} a month, a patrol about ${patrolMinutes(s)} minutes out.`);
  return null;
}
export function cancelResponse(s: GameState): string | null {
  const r = subOf(s);
  if (!r || r.ended !== null) return 'no subscription';
  r.ended = dayIndex(s.clock.t);
  log(s, 'The family cancelled the armed-response subscription. The sign comes down off the gate.');
  return null;
}

/** The break-in rate multiplier while the patrol answers (the signs; opportunists look elsewhere). */
export const breakinK = (s: GameState): number => (responseActive(s) ? RESPONSE.BREAKIN_K : 1);
/** Signs deterrence (opportunists only) for the posture. */
export const responseSigns = (s: GameState): number => (responseActive(s) ? RESPONSE.SIGNS_DETER : 0);
/** The share of an empty-house burglary done before the patrol is there (1 with no patrol). */
export const emptyShare = (s: GameState): number => (responseActive(s) ? RESPONSE.EMPTY_SHARE : 1);

/** Once a day: the fee while the banks work, a missed month, the collapse that ends it for good. */
export function armedResponseDay(s: GameState): string[] {
  const r = subOf(s);
  if (!r || r.ended !== null) return [];
  const out: string[] = [];
  const day = dayIndex(s.clock.t), t = s.disaster.tracks, R = RESPONSE;
  r.downDays = t.banks < COLLAPSE.track && t.law < COLLAPSE.track ? r.downDays + 1 : 0;
  if (r.downDays >= COLLAPSE.days) {
    r.ended = day;
    out.push('The armed-response firm has stopped answering the phone and the radio. The panic button is only a button now: from here the minutes are ours to buy.');
    return out;
  }
  if (day - r.paidDay >= R.MONTH_DAYS) {
    r.paidDay = day;
    if (t.banks >= 0.5) { s.money -= R.MONTHLY_USD; r.missed = 0; }
    else if (++r.missed >= R.LAPSE_MONTHS) { r.ended = day; out.push('The armed-response contract lapsed: two months unpaid with the banks shut. The patrol no longer comes.'); }
  }
  return out;
}
