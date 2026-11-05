/**
 * The neighborhood watch (docs/sa_home_security.md, principle 8; docs/DECISIONS.md "Neighborhood watch and armed response"): the community policing
 * forum, the street patrol, the chat group. Households that trust each other share what they see on the county road. Pure (tested). Every number is
 * tunable and lives in `WATCH`.
 *
 *  Joining          the family founds it with the neighbors who trust it (`MIN_DISP`, at least `MIN_HOUSEHOLDS` still at home), at a small cost.
 *  What it gives    eyes on the road: a little warning always, and more when strangers are two days out (the chat lights up) (`communityPosture`,
 *                   feeds the posture's detection); members within earshot come when there is shooting (sim/pact.ts `defenders`); each month the
 *                   members think a little better of the family, and a member's raid is heard about.
 *  What it costs    $ to set up, dues each month while the banks work (the chat is free; the radios, batteries and the sign are not), and a
 *                   member who is raided or leaves drops out; under two members it dissolves.
 *  Not modeled      the critique that a fortress look and a private patrol can cool a neighborhood (no existing mechanic for it: see DECISIONS), and a
 *                   person-shift (the duty slot is the militia's and the pact work day's).
 */
import { log } from './economy';
import { dayIndex, type GameState } from './state';
import { securityOf, type Watch } from './securityState';

export const WATCH = {
  SETUP_USD: 150, MONTHLY_USD: 20, MONTH_DAYS: 30,
  /** A neighbor joins who thinks at least this much of the family, and at least this many households must be at home. */
  MIN_DISP: 10, MIN_HOUSEHOLDS: 2,
  /** Warning (detection points): a steady base while it has two members at home, and more when something is two days out. */
  BASE: 3, ALERT: 10, ALERT_DAYS: 2,
  /** A member within this many km comes when there is shooting. */
  EARSHOT_KM: 3,
  /** Monthly goodwill from the members, to a cap. */
  GOODWILL: 1, GOODWILL_CAP: 70,
} as const;

export const watchOf = (s: GameState): Watch | null => s.security?.watch ?? null;
export const inWatch = (s: GameState, nid: string): boolean => !!s.security?.watch?.members.includes(nid);

const homeMembers = (s: GameState, w: Watch) => s.neighbors.filter(n => w.members.includes(n.id) && n.status === 'home' && n.members > 0);

/** Why the family can't found or join the watch now (null = it can). */
export function watchProblem(s: GameState): string | null {
  if (watchOf(s)) return 'already in the watch';
  if (s.money < WATCH.SETUP_USD) return `needs $${WATCH.SETUP_USD} for radios, batteries and the sign`;
  const willing = s.neighbors.filter(n => n.status === 'home' && n.members > 0 && n.disposition >= WATCH.MIN_DISP);
  if (willing.length < WATCH.MIN_HOUSEHOLDS) return `needs ${WATCH.MIN_HOUSEHOLDS} neighbors at home who think well enough of you (${willing.length} now)`;
  return null;
}

export function foundWatch(s: GameState): string | null {
  const why = watchProblem(s);
  if (why) return why;
  const willing = s.neighbors.filter(n => n.status === 'home' && n.members > 0 && n.disposition >= WATCH.MIN_DISP).sort((a, b) => b.disposition - a.disposition);
  const day = dayIndex(s.clock.t);
  s.money -= WATCH.SETUP_USD;
  const w: Watch = { name: 'the road watch', founded: day, members: willing.map(n => n.id), leader: willing[0].id, paidDay: day, alertedFor: -1, alerts: 0 };
  securityOf(s).watch = w;
  log(s, `The family and ${willing.length} neighboring households started a road watch: a chat group, a pair of radios apiece and a sign at the county road. Whoever sees strangers says so.`);
  return null;
}

export function leaveWatch(s: GameState): string | null {
  const w = watchOf(s);
  if (!w) return 'not in a watch';
  const leader = s.neighbors.find(n => n.id === w.leader);
  if (leader) leader.disposition = Math.max(-100, leader.disposition - 5);
  securityOf(s).watch = null;
  log(s, 'The family left the road watch.');
  return null;
}

/** Warning from the watch for the posture: a steady base, more when the next visitor is within `ALERT_DAYS`. 0 with fewer than two members at home. */
export function communityPosture(s: GameState): { detection: number; members: number } {
  const w = watchOf(s);
  if (!w) return { detection: 0, members: 0 };
  const m = homeMembers(s, w).length;
  if (m < WATCH.MIN_HOUSEHOLDS) return { detection: 0, members: m };
  const day = dayIndex(s.clock.t), soon = s.gate.next >= 0 && s.gate.next - day <= WATCH.ALERT_DAYS && s.gate.next >= day;
  return { detection: WATCH.BASE + (soon ? WATCH.ALERT : 0), members: m };
}

/** Members who come with their guns when there is shooting: at home, thinking well of the family, within earshot. */
export const watchDefenders = (s: GameState) => {
  const w = watchOf(s);
  return w ? homeMembers(s, w).filter(n => n.disposition > 0 && n.km <= WATCH.EARSHOT_KM) : [];
};

/** Once a day: dues, goodwill, drop-outs, the chat lighting up when something is coming. */
export function watchDay(s: GameState): string[] {
  const w = watchOf(s);
  if (!w) return [];
  const out: string[] = [];
  const day = dayIndex(s.clock.t);
  // members who died, left or were raided out of it drop out; under two it dissolves
  const stay = w.members.filter(id => s.neighbors.some(n => n.id === id && n.status === 'home' && n.members > 0));
  if (stay.length < w.members.length) {
    const gone = w.members.length - stay.length;
    w.members = stay;
    out.push(`${gone === 1 ? 'A household' : `${gone} households`} dropped out of the road watch.`);
  }
  if (w.members.length < WATCH.MIN_HOUSEHOLDS) {
    securityOf(s).watch = null;
    out.push('There is nobody left to keep the road watch going. It has dissolved.');
    return out;
  }
  if (!w.members.includes(w.leader)) w.leader = w.members[0];
  // the chat lights up when something is two days out (the warning itself is `communityPosture`)
  if (s.gate.next >= day && s.gate.next - day <= WATCH.ALERT_DAYS && w.alertedFor !== s.gate.next) {
    w.alertedFor = s.gate.next; w.alerts++;
    const who = s.neighbors.find(n => n.id === w.members[w.alerts % w.members.length]);
    out.push(`${who ? `${who.name}` : 'A neighbor'} says on the chat: strangers on the county road, headed your way.`);
  }
  if (day - w.paidDay >= WATCH.MONTH_DAYS) {
    w.paidDay = day;
    if (s.disaster.tracks.banks >= 0.5) s.money -= WATCH.MONTHLY_USD;
    for (const n of s.neighbors) if (w.members.includes(n.id) && n.disposition < WATCH.GOODWILL_CAP) n.disposition = Math.min(WATCH.GOODWILL_CAP, n.disposition + WATCH.GOODWILL);
  }
  return out;
}
