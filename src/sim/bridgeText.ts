/** The wording and the buttons for the shelter bridge (sim/shelterBridge.ts): one place for the wait card, the housing panel and the stake card. Pure. */
import { bridgeOffers, rentalQuote, type RentalKind, type RentalQuote, type RushQuote } from './shelterBridge';
import type { SuggestionAct } from './guidance';
import type { GameState } from './state';
import { pluralize } from './words';

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function rentalLabel(q: RentalQuote): string {
  const tail = q.readyDays ? `ready in ${pluralize(q.readyDays, 'day')}` : q.kind === 'extended_stay' ? 'a week up front' : 'tonight';
  const up = q.kind === 'extended_stay' || q.readyDays ? `, ${usd(q.upfront)} to start` : '';
  return `${q.name} (${usd(q.nightly)} a night${up}, ${tail})`;
}

export function rushLabel(q: RushQuote, what: string): string {
  return q.legal ? `Rush the ${what} permit (${usd(q.fee)}, ${q.to} days)` : `Permit runner for the ${what} (${usd(q.fee)}, ${q.to} days, some risk)`;
}

const kindsShown: readonly RentalKind[] = ['motel', 'rv', 'modular'];

/** The buttons the wait card carries: the rush for the longest review, and the rentals when the family has nowhere indoors. */
export function bridgeActs(s: GameState): Array<{ label: string; act: SuggestionAct }> {
  const o = bridgeOffers(s), out: Array<{ label: string; act: SuggestionAct }> = [];
  const best = [...o.rush].sort((a, b) => b.from - a.from)[0];
  if (best) { const st = s.structures.find(x => x.id === best.id)!; out.push({ label: rushLabel(best, st.kind.replace(/_/g, ' ')), act: { type: 'rush', id: best.id } }); }
  for (const q of o.rentals) if (kindsShown.includes(q.kind)) out.push({ label: rentalLabel(q), act: { type: 'rent', kind: q.kind } });
  return out;
}

/** One sentence for the wait card's "why": what a rental and a rush would do. */
export function bridgeSentence(s: GameState): string {
  const o = bridgeOffers(s), bits: string[] = [];
  if (o.rentals.length) { const m = rentalQuote(s, 'motel'); bits.push(`a motel or a rented RV bridges the wait (${usd(m.nightly)} a night for the family, so about ${usd(m.nightly * 30)} a month)`); }
  const best = [...o.rush].sort((a, b) => b.from - a.from)[0];
  if (best) bits.push(best.legal ? `the county's expedite desk takes the permit from ${best.from} days to ${best.to} for ${usd(best.fee)}` : `a permit runner could cut it from ${best.from} days to ${best.to} for ${usd(best.fee)}, with some risk`);
  return bits.length ? `With cash you can pay to shorten it: ${bits.join('; ')}.` : '';
}

export interface BridgeCard { id: string; title: string; why: string; urgency: number; acts: Array<{ label: string; act: SuggestionAct }> }

/** Urgency at which a bridge card shows on the What-to-do card while a goal is up (whatToDo's GUIDED_URGENT is 90). */
export const BRIDGE_URGENCY = 94;

/**
 * Two cards for the Next steps and the What-to-do card (which shows a suggestion's first button): a rental when people sleep outside or
 * in tents and a house is waiting on the county, and a rushed permit when the review has days left and the cash covers the fee with room.
 */
export function bridgeCards(s: GameState, outside: number): BridgeCard[] {
  const o = bridgeOffers(s), out: BridgeCard[] = [];
  if (o.rentals.length && outside > 0) {
    const order: RentalKind[] = ['motel', 'rv', 'modular', 'extended_stay'];
    const qs = order.map(k => o.rentals.find(q => q.kind === k)!).filter(Boolean);
    out.push({ id: 'rent_shelter', urgency: BRIDGE_URGENCY, title: `Rent a place to sleep while the house goes up (${pluralize(outside, 'person', 'people')} outside)`,
      why: `The house is days or months away. ${qs.map(q => `${q.name} ${usd(q.nightly)} a night${q.readyDays ? `, ready in ${pluralize(q.readyDays, 'day')}` : ''}`).join('; ')}. The family checks out by itself the day the house has beds, and a tent costs morale in the cold.`,
      acts: qs.map(q => ({ label: rentalLabel(q), act: { type: 'rent' as const, kind: q.kind } })) });
  }
  const best = [...o.rush].sort((a, b) => b.from - a.from)[0];
  if (best && s.money >= best.fee * 4) {
    const st = s.structures.find(x => x.id === best.id)!, what = st.kind.replace(/_/g, ' ');
    out.push({ id: 'rush_permit', urgency: BRIDGE_URGENCY, title: `The ${what} permit has ${pluralize(best.from, 'day')} left: pay to rush it`,
      why: best.legal ? `This county runs an expedite desk: ${usd(best.fee)} (${best.mult} times the permit) takes the review from ${best.from} days to ${best.to}. Legal and on the books.` : `A permit runner can push it through for ${usd(best.fee)} (${best.mult} times the permit), ${best.from} days down to ${best.to}. It is a gray area here: about ${Math.round(best.risk * 100)} in 100 the county notices, and then it is a ${usd(best.fine)} fine and the review starts over.`,
      acts: [{ label: rushLabel(best, what), act: { type: 'rush' as const, id: best.id } }] });
  }
  return out;
}
