/**
 * The black market (user: "there can be black market acquisitions if you
 * have enough money.. it also comes with risk of law enforcement / prying
 * eyes"). An abstract mechanic: a contact, a price, and consequences. Pure.
 *
 * Contact: one try a month to be introduced. It takes cash in the safe
 * ($5,000+ on hand, deals are cash only) and either a net worth of $250,000
 * or a negotiator of skill 4+. The roll gets better with the negotiator.
 *
 * Offers rotate monthly (seeded): items no shop will sell — unregistered
 * select-fire rifles, a suppressor with no paperwork, grenades, a launcher
 * with a few rounds, bulk ammo with no records, surplus night vision — at
 * 3–10× street value (surplus gear cheaper).
 *
 * Risk, while the law works: each deal can be a scam (the money's gone) or a
 * sting. A sting seizes every piece of contraband, fines you (twice the deal
 * plus $25,000), costs $40,000 in lawyers, burns the contact and puts you
 * under investigation (heat, fading over about a year) that raises the odds
 * of the next sting. Odds rise with the size of the deal, with how many
 * deals this month, with guns on shop records and cash reports on file, and
 * fall with each clean deal with the same contact (to five).
 *
 * After the collapse (law track < 0.5) it's just traders: no stings, no
 * contact needed, paid in gold and silver at barter value, prices swinging
 * with scarcity. Scams still happen.
 */
import { log } from './economy';
import { barterValue, netWorth, type MetalKind } from './finance';
import { CALIBER, GUN, type Caliber } from './armory';
import { mulberry32 } from './rng';
import type { GameState } from './state';
import type { MaterialId } from './materials';

export interface BlackMarket {
  contact: boolean;
  /** The month of the last introduction attempt. */
  triedMonth: number;
  /** Clean deals with this contact (trust). */
  cleanDeals: number;
  /** Under investigation (0–1) as of `heatAt`; fades with time. */
  heat: number;
  heatAt: number;
  /** Offer ids already bought this month, and the month. */
  bought: string[];
  boughtMonth: number;
  stings: number;
  scams: number;
}
const fresh = (): BlackMarket => ({ contact: false, triedMonth: -1, cleanDeals: 0, heat: 0, heatAt: 0, bought: [], boughtMonth: -1, stings: 0, scams: 0 });
export const bmOf = (s: GameState): BlackMarket => (s.blackMarket ??= fresh());
const EMPTY = fresh();
/** Read without creating (safe in render). */
export const peekBm = (s: GameState): BlackMarket => s.blackMarket ?? EMPTY;

export type Goods = { gun?: string; mat?: MaterialId; ammo?: Caliber; n: number };
export interface OfferDef { id: string; name: string; goods: Goods[]; street: number; mult: number; contraband: boolean }
export const OFFERS: OfferDef[] = [
  { id: 'm4', name: 'Unregistered select-fire M4-type carbine', goods: [{ gun: 'm4_contraband', n: 1 }], street: GUN.m4_contraband.price, mult: 6, contraband: true },
  { id: 'ak', name: 'Unregistered select-fire AK-type rifle', goods: [{ gun: 'ak_contraband', n: 1 }], street: GUN.ak_contraband.price, mult: 6, contraband: true },
  { id: 'can', name: 'Suppressor, no paperwork', goods: [{ mat: 'suppressor', n: 1 }], street: 1000, mult: 4, contraband: true },
  { id: 'nades', name: 'Crate of hand grenades (6)', goods: [{ mat: 'grenades', n: 6 }], street: 1800, mult: 10, contraband: true },
  { id: 'rpg', name: 'Launcher with 4 rounds', goods: [{ mat: 'rpg_launcher', n: 1 }, { mat: 'rpg_rounds', n: 4 }], street: 6000, mult: 8, contraband: true },
  { id: 'bulk556', name: '2,000 rounds of 5.56, no records', goods: [{ ammo: '556', n: 2000 }], street: 2000 / CALIBER['556'].box * CALIBER['556'].price, mult: 3, contraband: false },
  { id: 'bulk762', name: '2,000 rounds of 7.62×39, no records', goods: [{ ammo: '762x39', n: 2000 }], street: 2000 / CALIBER['762x39'].box * CALIBER['762x39'].price, mult: 3, contraband: false },
  { id: 'nvg', name: 'Military surplus night vision', goods: [{ mat: 'nvg', n: 1 }], street: 3500, mult: 0.8, contraband: false },
];
const OFFER = Object.fromEntries(OFFERS.map(o => [o.id, o])) as Record<string, OfferDef>;
const CONTRABAND_MATS: MaterialId[] = ['grenades', 'rpg_launcher', 'rpg_rounds', 'suppressor'];

export const INTRO_CASH = 5000, INTRO_NET = 250_000, LAWYERS = 40_000;
export const lawless = (s: GameState) => s.disaster.tracks.law < 0.5;
export const monthOf = (s: GameState) => Math.floor(s.clock.t / 30);
const negotiator = (s: GameState) => Math.max(0, ...s.people.filter((p, i) => !p.kid && s.personState[i]?.needs.died == null).map(p => p.skills.negotiator ?? 0));
export const heatNow = (s: GameState) => { const b = peekBm(s); return b.heat * Math.exp(-(s.clock.t - b.heatAt) / 365); };

/** Can trade now (a contact in peacetime; anyone after the collapse). */
export const canTrade = (s: GameState) => lawless(s) || peekBm(s).contact;

/** Try to be introduced to a contact (once a month). Returns why not, or null (check `contact` for the result). */
export function findContact(s: GameState): string | null {
  const b = bmOf(s), m = monthOf(s);
  if (lawless(s)) return 'no need: everyone is trading now';
  if (b.contact) return 'you already have a contact';
  if (b.triedMonth === m) return 'you already asked around this month';
  if (s.fin.cash < INTRO_CASH) return `it takes cash in the safe ($${INTRO_CASH.toLocaleString('en-US')}+): deals are cash only`;
  const neg = negotiator(s);
  if (netWorth(s) < INTRO_NET && neg < 4) return 'no one will vouch for you (net worth $250,000+ or a negotiator of skill 4+)';
  b.triedMonth = m;
  const r = mulberry32(s.seed * 6151 + m * 17 + 3);
  b.contact = r() < Math.min(0.9, 0.35 + 0.07 * neg);
  log(s, b.contact ? 'A friend of a friend made an introduction: you have a contact now.' : 'Asked around quietly. Nobody bit this month.');
  return null;
}

/** This month's offers (3 or 4 of the list, seeded by the month). */
export function offers(s: GameState): OfferDef[] {
  const r = mulberry32(s.seed * 7919 + monthOf(s) * 31 + 11);
  const pool = [...OFFERS], out: OfferDef[] = [], n = 3 + (r() < 0.5 ? 1 : 0);
  while (out.length < n) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}
/** After the collapse prices swing with scarcity month to month (1 = as in peacetime). */
const swing = (s: GameState) => (lawless(s) ? 0.6 + 1.0 * mulberry32(s.seed * 313 + monthOf(s))() : 1);
export const priceOfOffer = (s: GameState, o: OfferDef) => Math.round(o.street * o.mult * swing(s) / 10) * 10;

const boughtCount = (s: GameState) => { const b = peekBm(s); return b.boughtMonth === monthOf(s) ? b.bought.length : 0; };
function boughtThisMonth(s: GameState): string[] {
  const b = bmOf(s);
  if (b.boughtMonth !== monthOf(s)) { b.bought = []; b.boughtMonth = monthOf(s); }
  return b.bought;
}

/** Odds a deal goes wrong: a sting (0 after the collapse) and a scam. */
export function risk(s: GameState, o: OfferDef): { sting: number; scam: number } {
  const b = peekBm(s), trust = Math.min(5, b.cleanDeals);
  const scam = Math.max(0.02, 0.12 - 0.02 * trust);
  if (lawless(s)) return { sting: 0, scam };
  const price = priceOfOffer(s, o);
  let sting = 0.05 + 0.05 * Math.min(2, price / 20_000) + 0.03 * boughtCount(s)
    + Math.min(0.08, 0.01 * s.armory.onBooks) + (s.fin.onBooks > 0 ? 0.03 : 0) + 0.3 * heatNow(s)
    + (o.contraband ? 0.03 : 0) - 0.025 * trust;
  sting *= Math.min(1, s.disaster.tracks.law);
  return { sting: Math.min(0.8, Math.max(0.01, sting)), scam };
}

/** Pay with metal at barter value, cheapest units first. Returns false if there isn't enough. */
function payInMetal(s: GameState, amount: number): boolean {
  const have = s.fin.holdings.filter(h => h.where === 'safe');
  const total = have.reduce((a, h) => a + barterValue(s, h.kind) * h.units, 0);
  if (total < amount) return false;
  let left = amount;
  for (const h of [...have].sort((a, b) => barterValue(s, a.kind) - barterValue(s, b.kind))) {
    const v = barterValue(s, h.kind as MetalKind), n = Math.min(h.units, Math.ceil(left / v));
    h.units -= n; left -= n * v;
    if (left <= 0) break;
  }
  s.fin.holdings = s.fin.holdings.filter(h => h.units > 0);
  return true;
}

function deliver(s: GameState, o: OfferDef): void {
  for (const g of o.goods) {
    if (g.gun) for (let i = 0; i < g.n; i++) s.armory.guns.push({ id: `g${s.nextId++}`, model: g.gun, condition: 1, fired: 0, where: s.stock.gun_safe >= 1 ? 'safe' : 'house', carrier: null });
    if (g.mat) s.stock[g.mat] += g.n;
    if (g.ammo) s.armory.ammo[g.ammo] = (s.armory.ammo[g.ammo] ?? 0) + g.n;
  }
}

/** Everything illegal on the place is taken. Returns how many items. */
export function seize(s: GameState): number {
  const before = s.armory.guns.length;
  s.armory.guns = s.armory.guns.filter(g => !GUN[g.model]?.contraband);
  let n = before - s.armory.guns.length;
  for (const m of CONTRABAND_MATS) { n += s.stock[m]; s.stock[m] = 0; }
  return n;
}

/** Take a bill out of checking, then savings, then the cash. */
function charge(s: GameState, amount: number): void {
  let left = amount;
  const take = (have: number) => { const t = Math.min(Math.max(0, have), left); left -= t; return have - t; };
  s.money = take(s.money); s.fin.savings = take(s.fin.savings); s.fin.cash = take(s.fin.cash);
  if (left > 0) s.money -= left;   // what's left is owed
}

export type DealResult = 'ok' | 'scam' | 'sting';
/** Buy an offer. Returns why not (a string), or the outcome. `roll` overrides the dice (tests). */
export function buyOffer(s: GameState, id: string, roll?: number): string | { result: DealResult; fine?: number; seized?: number } {
  const o = OFFER[id], b = bmOf(s);
  if (!o || !offers(s).some(x => x.id === id)) return 'not on offer this month';
  if (!canTrade(s)) return 'you need a contact first';
  const bought = boughtThisMonth(s);
  if (bought.includes(id)) return 'already bought that this month';
  const price = priceOfOffer(s, o), rk = risk(s, o);
  if (lawless(s)) {
    if (!payInMetal(s, price)) return 'not enough gold and silver in the safe to trade';
  } else {
    if (s.fin.cash < price) return 'cash only: not enough in the safe (withdraw it first)';
    s.fin.cash -= price;
  }
  bought.push(id);
  const r = roll ?? mulberry32(s.seed * 9241 + Math.floor(s.clock.t) * 7 + bought.length + b.stings * 101 + b.scams * 13)();
  if (r < rk.sting) {
    const seized = (deliver(s, o), seize(s)), fine = 25_000 + 2 * price;
    s.paper.fines += fine;
    charge(s, fine + LAWYERS);
    b.stings++; b.contact = false; b.cleanDeals = 0; b.heat = 1; b.heatAt = s.clock.t;
    log(s, `The ${o.name.toLowerCase()} was a federal sting. ${seized} illegal item${seized === 1 ? '' : 's'} seized, a $${fine.toLocaleString('en-US')} fine and $${LAWYERS.toLocaleString('en-US')} in lawyers. You're under investigation.`);
    return { result: 'sting', fine, seized };
  }
  if (r < rk.sting + rk.scam) {
    b.scams++;
    log(s, `Paid for the ${o.name.toLowerCase()} and never saw it. Nobody to complain to.`);
    return { result: 'scam' };
  }
  deliver(s, o);
  b.cleanDeals++;
  log(s, `Bought the ${o.name.toLowerCase()} off the books.`);
  return { result: 'ok' };
}
