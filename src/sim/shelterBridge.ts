/**
 * The cash shelter bridge (playtest 3 problem 5; owner: "money solves everything, things can be built quickly with money and
 * manpower"). A family with cash that has staked a house has to wait for the county permit and the crews, days to months. This
 * module prices three ways to bridge the wait, all pure and tested:
 *
 *   1. A rented place to sleep: a motel room, an extended-stay suite, a rented RV on a pad, or a rented modular unit (2025 US
 *      prices: motel $90-180 a night, extended stay $70-130 a night with a week prepaid, an RV on a long-term pad $1,800-2,500 a
 *      month, a rented modular $4,000-6,000 a month plus delivery and set-up). Billed by the night; it ends by itself the day a
 *      finished home has a bed for everybody. State: the optional `GameState.rental` (save v101).
 *   2. A rushed permit: an official expedite program (a posted fee of two to three times the permit, review halved) in a strict
 *      county, or "a permit runner" in a lax one (cheaper and faster, but a small chance the county notices: a fine and the review
 *      starts over). State: the optional `Structure.rushed`.
 *   3. The family's own ETA to move in, so the stake button can say how long it will be (`moveInEta`).
 *
 * Nothing here changes the permit rules or the review days themselves; it adds paid options beside them.
 */
import { isFinished } from './construction';
import { permitFee, needsPermit, reviewDays, COUNTY } from './paperwork';
import { LEAD_TIME_DAYS, log } from './economy';
import { paceOf, totalHoursLeft, eta } from './pace';
import { CREW_WEEK } from './crews';
import { capacity } from './housing';
import { dayIndex, type GameState, type Structure } from './state';
import { isHome, BLUEPRINTS, totalHours } from './blueprints';
import { mulberry32 } from './rng';
import { pluralize } from './words';

export type RentalKind = 'motel' | 'extended_stay' | 'rv' | 'modular';

export interface Rental {
  kind: RentalKind;
  /** Rooms, suites, RVs or units rented. */
  units: number;
  /** Game time the family moved in / the unit is on the place and ready. */
  since: number;
  readyAt: number;
  /** Dollars a night for all units. */
  nightly: number;
  /** Nights billed so far, and total paid (setup included). */
  nights: number;
  paid: number;
}

interface Def {
  name: string;
  /** Plain description for the card. */
  blurb: string;
  /** Dollars per unit per night (national 2025 average; the region factor scales it). */
  night: number;
  seats: number;
  /** One-time delivery / set-up / prepaid minimum, per unit. */
  setup: number;
  /** Days until it is ready (a motel: tonight). */
  readyDays: number;
  /** Sleep quality of a night there (a hotel bed 0.9, an RV 0.85). */
  quality: number;
  /** On the place (an RV on a pad) or in town (a motel: the family commutes). */
  onPlace: boolean;
}

export const RENTALS: Record<RentalKind, Def> = {
  motel: { name: 'Motel rooms', blurb: 'two queen beds a room, a shower and a door that locks; the family drives out to the place each day', night: 135, seats: 4, setup: 0, readyDays: 0, quality: 0.88, onPlace: false },
  extended_stay: { name: 'Extended-stay suites', blurb: 'a kitchenette and a real bed, cheaper by the night but a week is paid up front', night: 95, seats: 4, setup: 95 * 7, readyDays: 0, quality: 0.93, onPlace: false },
  rv: { name: 'Rented RV on a pad', blurb: 'a travel-trailer or motorhome delivered to the place and hooked up to a generator and a water tank, about $2,100 a month', night: 70, seats: 5, setup: 450, readyDays: 3, quality: 0.85, onPlace: true },
  modular: { name: 'Rented modular unit', blurb: 'a two-bedroom site-office style module craned onto blocks on your land, about $4,800 a month', night: 160, seats: 6, setup: 7500, readyDays: 14, quality: 0.96, onPlace: true },
};
export const RENTAL_ORDER: readonly RentalKind[] = ['motel', 'extended_stay', 'rv', 'modular'];

/** Price index by region (a Seattle motel is not an Ozark one). */
const REGION_PRICE: Partial<Record<string, number>> = { pnw: 1.25, new_england: 1.2, mountain_west: 1.1, upper_midwest: 0.95, rust_belt: 0.95, plains: 0.88, ozarks: 0.85, hill_country: 0.9, appalachia: 0.88, desert: 1.0, north_woods: 0.95 };
export const regionPrice = (s: GameState) => REGION_PRICE[s.site.region] ?? 1;

const alive = (s: GameState) => s.people.filter((_, i) => { const n = s.personState[i]?.needs; return n && n.died == null && !n.taken; }).length;

export interface RentalQuote {
  kind: RentalKind;
  name: string;
  blurb: string;
  units: number;
  nightly: number;
  /** Paid today (set-up / prepaid week / the first night). */
  upfront: number;
  readyDays: number;
  /** About what a month costs. */
  monthly: number;
  onPlace: boolean;
  seats: number;
}

export function rentalQuote(s: GameState, kind: RentalKind): RentalQuote {
  const d = RENTALS[kind], k = regionPrice(s), units = Math.max(1, Math.ceil(Math.max(1, alive(s)) / d.seats));
  const nightly = Math.round(units * d.night * k);
  const upfront = Math.round(units * d.setup * k) + (d.readyDays === 0 && d.setup === 0 ? nightly : 0);
  return { kind, name: d.name, blurb: d.blurb, units, nightly, upfront, readyDays: d.readyDays, monthly: nightly * 30, onPlace: d.onPlace, seats: d.seats };
}

/** The seats a rental offers tonight (0 until it is delivered). */
export function rentalSeats(s: GameState): number {
  const r = s.rental;
  return r && s.clock.t >= r.readyAt ? r.units * RENTALS[r.kind].seats : 0;
}
export const rentalQuality = (s: GameState) => (s.rental ? RENTALS[s.rental.kind].quality : 0);

/** Does a finished home (or a bunk) already have a bed for everybody? Then the rental is not needed. */
export function ownBedsFor(s: GameState): boolean {
  const c = capacity(s);
  return c.beds + c.bunks >= alive(s);
}

export function startRental(s: GameState, kind: RentalKind): string | null {
  if (s.rental) return 'you already rent a place; check out of it first';
  if (ownBedsFor(s)) return 'the house already has a bed for everybody';
  const q = rentalQuote(s, kind);
  if (s.disaster.mode !== 'god' && s.money < q.upfront + q.nightly) return `it needs $${(q.upfront + q.nightly).toLocaleString('en-US')} on hand`;
  if (s.disaster.tracks.banks < 0.5 && kind !== 'rv') return 'the town is shut: no motel or landlord is taking bookings';
  s.money -= q.upfront;
  s.rental = { kind, units: q.units, since: s.clock.t, readyAt: s.clock.t + q.readyDays, nightly: q.nightly, nights: 0, paid: q.upfront };
  log(s, `Rented ${q.units === 1 ? 'a' : q.units} ${q.name.toLowerCase()}: $${q.nightly.toLocaleString('en-US')} a night${q.upfront ? `, $${q.upfront.toLocaleString('en-US')} up front` : ''}${q.readyDays ? `, ready in ${pluralize(q.readyDays, 'day')}` : ', the family sleeps there tonight'}.`);
  return null;
}

export function endRental(s: GameState, why = 'The family checked out.'): void {
  if (!s.rental) return;
  const r = s.rental;
  log(s, `${why} ${RENTALS[r.kind].name}: ${pluralize(r.nights, 'night')}, $${Math.round(r.paid).toLocaleString('en-US')} in all.`);
  delete s.rental;
}

/** Once a day: bill the night, check out when the house is ready or the money is gone. */
export function rentalDay(s: GameState): string[] {
  const r = s.rental;
  if (!r) return [];
  if (ownBedsFor(s)) { endRental(s, 'The house is ready, so the family checked out.'); return []; }
  if (s.clock.t < r.readyAt) return [];
  if (s.money < r.nightly && s.disaster.mode !== 'god') { endRental(s, 'The money for the rent ran out, so the family left.'); return []; }
  s.money -= r.nightly; r.nights++; r.paid += r.nightly;
  return [];
}

// ── The rushed permit ──────────────────────────────────────────────────────

export interface RushQuote {
  id: string;
  /** The county runs a posted expedite program (legal) or a permit runner "moves it along" (gray). */
  legal: boolean;
  fee: number;
  /** Multiple of the permit fee. */
  mult: number;
  /** Review days left now, and after the rush. */
  from: number;
  to: number;
  /** Chance the county notices a runner (0 for a legal program), and what it costs when it does. */
  risk: number;
  fine: number;
}

/** A permit under review with at least three days to go can be rushed once. */
export function rushQuote(s: GameState, st: Structure): RushQuote | null {
  if (st.unplaced || st.pre || st.permit !== 'review' || st.rushed) return null;
  const left = Math.ceil((st.permitAt ?? 0) - s.clock.t);
  if (left < 3 || !needsPermit(st.kind)) return null;
  const strict = COUNTY[s.site.region].strict, base = permitFee(s, st.kind), legal = strict >= 0.8;
  const mult = legal ? Math.min(3, Math.max(1.5, 1 + strict)) : Math.min(1.5, 1 + (0.8 - strict) * 0.6);
  const to = legal ? Math.max(2, Math.ceil(left * 0.5)) : Math.max(2, Math.ceil(left * 0.4));
  const fee = Math.round(base * mult / 10) * 10;
  return { id: st.id, legal, fee, mult: Math.round(mult * 10) / 10, from: left, to, risk: legal ? 0 : 0.12, fine: fee * 2 + 500 };
}

export function rushPermit(s: GameState, id: string): string | null {
  const st = s.structures.find(x => x.id === id);
  if (!st) return 'no such building';
  const q = rushQuote(s, st);
  if (!q) return st.rushed ? 'its permit was already rushed' : 'there is no permit under review to rush (or only days remain)';
  if (s.disaster.mode !== 'god' && s.money < q.fee) return `the expedite fee is $${q.fee.toLocaleString('en-US')}`;
  s.money -= q.fee;
  const nm = st.kind.replace(/_/g, ' ');
  const caught = !q.legal && mulberry32((s.seed * 977 + dayIndex(s.clock.t) * 31 + hash(id)) >>> 0)() < q.risk;
  if (caught) {
    s.money -= q.fine; s.paper.fines += q.fine;
    st.rushed = 'caught';
    st.permitAt = s.clock.t + reviewDays(s, st.kind) + 7;
    log(s, `The county noticed the runner on the ${nm} permit: a $${q.fine.toLocaleString('en-US')} fine and the review starts over (${pluralize(Math.ceil(st.permitAt - s.clock.t), 'day')}).`);
  } else {
    st.rushed = 'ok';
    st.permitAt = s.clock.t + q.to;
    log(s, `Paid $${q.fee.toLocaleString('en-US')} to rush the ${nm} permit: ${q.legal ? 'the county\'s expedite desk' : 'a permit runner'} has it down to ${pluralize(q.to, 'day')}.`);
  }
  return null;
}

const hash = (id: string) => { let h = 7; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return Math.abs(h); };

// ── The family's ETA ───────────────────────────────────────────────────────

export interface MoveInEta {
  kind: string;
  home: boolean;
  /** County review days (0: no permit), days for the first delivery, and the days before work can start. */
  review: number;
  delivery: number;
  prep: number;
  /** Work hours for the piece, and hours already in the queue ahead of it. */
  hours: number;
  ahead: number;
  familyWeeks: number | null;
  crewWeeks: number;
  familyDays: number | null;
  crewDays: number;
  /** One sentence for the button or the bill. */
  line: string;
  /** What the family does in the meantime. */
  meanwhile: string;
}

/**
 * How long until the family can use a piece staked now: the permit review and the first delivery run side by side (order the
 * materials the day you stake), then the work, at the family's pace behind whatever is already queued, or with a hired crew.
 */
export function moveInEta(s: GameState, kind: string, hours: number, permit: boolean): MoveInEta {
  const review = permit && needsPermit(kind) && s.paper.permits ? reviewDays(s, kind) : 0;
  const delivery = LEAD_TIME_DAYS + 1;
  const prep = Math.max(review, delivery);
  const pace = paceOf(s), ahead = totalHoursLeft(s);
  const familyWeeks = pace.perWeek > 0 ? (hours + ahead) / pace.perWeek : null;
  const crewWeeks = Math.max(1, Math.ceil(hours / CREW_WEEK));
  const familyDays = familyWeeks === null ? null : Math.round(prep + familyWeeks * 7), crewDays = Math.round(prep + crewWeeks * 7);
  const home = isHome(kind);
  const verb = home ? 'Family moves in after' : 'Ready in';
  const dayText = (d: number) => eta(d / 7).replace(/^about /, '');
  const own = s.rental ? 'the family is in the rental' : home && !ownBedsFor(s) ? 'the family stays in tents' : 'work goes on at the place';
  const line = familyDays === null ? `Nobody is free to build; a hired crew takes about ${dayText(crewDays)}` : `${verb} about ${dayText(familyDays)} by hand, or about ${dayText(crewDays)} with a hired crew`;
  const bits: string[] = [];
  if (review) bits.push(`${pluralize(review, 'day')} county review`);
  bits.push(`${pluralize(delivery, 'day')} for materials`);
  const meanwhile = `${bits.join(' and ')} (side by side), then ${pluralize(Math.max(1, Math.round(familyWeeks ?? crewWeeks)), 'week')} of work by hand (${pluralize(crewWeeks, 'week')} with a crew). Meanwhile ${own}.`;
  return { kind, home, review, delivery, prep, hours, ahead, familyWeeks, crewWeeks, familyDays, crewDays, line, meanwhile };
}

/** ETA for a staked structure still going up (for the card / the Projects line). */
export function etaForStructure(s: GameState, st: Structure, hours: number): MoveInEta | null {
  if (isFinished(st)) return null;
  return moveInEta(s, st.kind, hours, st.permit === 'review');
}

/** What the wait card offers: rentals (when a home is not finished and nobody has beds), plus the rush quotes. */
export function bridgeOffers(s: GameState): { rentals: RentalQuote[]; rush: RushQuote[] } {
  const rush = s.structures.map(st => rushQuote(s, st)).filter((q): q is RushQuote => !!q);
  const needs = !s.rental && !ownBedsFor(s) && s.structures.some(st => !st.unplaced && isHome(st.kind) && !isFinished(st));
  const rentals = needs ? RENTAL_ORDER.map(k => rentalQuote(s, k)) : [];
  return { rentals, rush };
}

/** The ETA for a kit kind staked now (null for a kind with no blueprint). */
export function etaForKind(s: GameState, kind: string): MoveInEta | null {
  const bp = BLUEPRINTS[kind];
  return bp ? moveInEta(s, kind, totalHours(bp), true) : null;
}
