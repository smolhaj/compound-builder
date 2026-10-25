/**
 * The family's money (decided with the user: "Accounts you manage";
 * metals at "Spot + dealer premiums"). Pure.
 *
 *  Checking   `s.money`: what the orders, crews and bills come out of.
 *  Savings    4 % a year while the banks work.
 *  Brokerage  an index fund: about 7 % a year, 16 % volatility, and a crash
 *             when the disaster hits (worst in a financial collapse). Frozen
 *             while the banks are shut.
 *  Cash       bills in the safe. Spends when the banks don't (while the
 *             stores and the law still mostly work); buys less as prices climb.
 *  Metals     gold and silver: coins, bars, rounds, junk silver. Bought from
 *             a dealer at spot plus a premium and shipped in about a week;
 *             sold back a little under spot. Kept in the safe, buried, or in a
 *             safe-deposit box at the bank (out of reach when the bank shuts).
 *  Debt       (round 4, decided with the user) checking never goes below zero:
 *             a bill it can't cover goes on the credit card (24 % APR,
 *             compounded daily). Each month's statement is paid from checking,
 *             as much as there is. Short of the minimum, it's late (a fee);
 *             six missed months and the card is charged off to collections;
 *             a year in collections and the collector takes a judgment: a lien
 *             on the land (no selling it or buying more until it's paid) and a
 *             quarter of any paycheck garnished. Once the banks fail nobody is
 *             collecting: no interest, no letters, no garnishment.
 *  Bank holiday  checking and savings freeze with the banks. In a financial
 *             collapse that doesn't fully come back, balances over the
 *             $250,000 insured limit take a 30 % bail-in haircut.
 *
 * Spot starts at 2025-2026 levels (gold ~$3,400/oz, silver ~$38/oz), walks
 * day to day, and climbs as trust in money fails.
 */
import { log } from './economy';
import { mulberry32 } from './rng';
import type { GameState } from './state';
import type { DisasterKind } from './disaster';

export type MetalKind = 'gold_coin' | 'gold_bar' | 'silver_coin' | 'silver_round' | 'junk_silver';
export type Where = 'safe' | 'buried' | 'bank';
export const METALS: Record<MetalKind, { name: string; unit: string; metal: 'gold' | 'silver'; oz: number; premium: number; buyback: number }> = {
  gold_coin: { name: 'Gold eagles', unit: '1 oz coin', metal: 'gold', oz: 1, premium: 0.06, buyback: -0.01 },
  gold_bar: { name: 'Gold bar', unit: '10 oz bar', metal: 'gold', oz: 10, premium: 0.025, buyback: -0.015 },
  silver_coin: { name: 'Silver eagles', unit: '1 oz coin', metal: 'silver', oz: 1, premium: 0.18, buyback: 0 },
  silver_round: { name: 'Silver rounds', unit: '1 oz round', metal: 'silver', oz: 1, premium: 0.07, buyback: -0.03 },
  junk_silver: { name: 'Junk silver', unit: '$1 face of pre-1965 dimes and quarters (0.715 oz)', metal: 'silver', oz: 0.715, premium: 0.1, buyback: -0.02 },
};
export const METAL_KINDS = Object.keys(METALS) as MetalKind[];
export const WHERE_NAME: Record<Where, string> = { safe: 'in the safe', buried: 'buried', bank: 'in a safe-deposit box' };

export interface Holding { kind: MetalKind; units: number; where: Where }
export interface MetalOrder { kind: MetalKind; units: number; where: Where; dueAt: number }

export interface Fin {
  savings: number;
  brokerage: number;
  cash: number;
  /** Spot price ($/oz), and the underlying walk before the crisis premium. */
  spot: { gold: number; silver: number };
  base: { gold: number; silver: number };
  holdings: Holding[];
  orders: MetalOrder[];
  /** Big metal buys on a dealer's books ($), for OPSEC. */
  onBooks: number;
  /** The crash at the hit and the bail-in, once. */
  crashed: boolean;
  bailedIn: boolean;
  /** What's owed: the card, then collections, then a judgment and a lien (round 4). */
  debt: Debt;
}
export type DebtStage = 'none' | 'card' | 'late' | 'collections' | 'judgment';
export interface Debt {
  /** Balance owed ($). */
  owed: number;
  stage: DebtStage;
  /** Statements in a row with less than the minimum paid. */
  missed: number;
  /** Day of the next statement (−1: none open). */
  statementDay: number;
  /** Interest and fees charged in all. */
  interest: number;
  /** The judgment lien recorded on the land ($, 0 = none). */
  lien: number;
}
export const newDebt = (): Debt => ({ owed: 0, stage: 'none', missed: 0, statementDay: -1, interest: 0, lien: 0 });
export const newFin = (): Fin => ({ savings: 0, brokerage: 0, cash: 0, spot: { gold: 3400, silver: 38 }, base: { gold: 3400, silver: 38 }, holdings: [], orders: [], onBooks: 0, crashed: false, bailedIn: false, debt: newDebt() });
export const CARD_APR = 0.24;
export const LATE_FEE = 40;
/** Statements missed before the card is charged off to collections, and before the collector gets a judgment. */
export const CHARGE_OFF = 6, JUDGMENT = 18;
/** The minimum payment on a statement: 1 % of the balance plus the month's interest, at least $35. */
export const minimumDue = (owed: number) => Math.min(owed, Math.max(35, owed * (0.01 + CARD_APR / 12)));
export const debtOf = (s: GameState): Debt => (s.fin.debt ??= newDebt());

export const FDIC_LIMIT = 250_000;
export const BOX_FEE = 150;
/** How far the market falls when the disaster hits. */
const CRASH: Partial<Record<DisasterKind, number>> = { financial: 0.45, nuclear: 0.5, solar_flare: 0.3, pandemic: 0.3, cyberattack: 0.2, grid_down: 0.15, ash_winter: 0.35, asteroid: 0.6, invasion: 0.5, civil_war: 0.5, bioweapon: 0.4, zombies: 0.7, unknown: 0.4, lawless: 0.2, drought: 0.1, wildfire: 0.02 };
/** How high metals run against the dollar when trust in money fails. */
const FEAR: Partial<Record<DisasterKind, number>> = { financial: 1.2, nuclear: 0.8, solar_flare: 0.5, pandemic: 0.3, cyberattack: 0.4, grid_down: 0.3, ash_winter: 0.6, lawless: 0.5 };

export const banksOpen = (s: GameState) => s.disaster.tracks.banks >= 0.5;
export const dealerOpen = (s: GameState) => banksOpen(s) && s.disaster.tracks.deliveries >= 0.5;
export const ozOf = (h: { kind: MetalKind; units: number }) => METALS[h.kind].oz * h.units;
export const priceOf = (s: GameState, k: MetalKind) => s.fin.spot[METALS[k].metal] * METALS[k].oz;
export const buyPrice = (s: GameState, k: MetalKind) => Math.round(priceOf(s, k) * (1 + METALS[k].premium) * 100) / 100;
export const sellPrice = (s: GameState, k: MetalKind) => Math.round(priceOf(s, k) * (1 + METALS[k].buyback) * 100) / 100;
export const metalsValue = (s: GameState, where?: Where) => s.fin.holdings.filter(h => !where || h.where === where).reduce((a, h) => a + priceOf(s, h.kind) * h.units, 0);
export const netWorth = (s: GameState) => s.money + s.fin.savings + s.fin.brokerage + s.fin.cash + metalsValue(s) - (s.fin.debt?.owed ?? 0);

export type Account = 'checking' | 'savings' | 'brokerage' | 'cash';
const get = (s: GameState, a: Account) => (a === 'checking' ? s.money : s.fin[a]);
const put = (s: GameState, a: Account, v: number) => { if (a === 'checking') s.money = v; else s.fin[a] = v; };

/** Move money between accounts (the banks must be open). Returns why not, or null. */
export function transfer(s: GameState, from: Account, to: Account, amount: number): string | null {
  if (!banksOpen(s)) return 'the banks are shut';
  if (amount <= 0 || from === to) return 'nothing to move';
  if (get(s, from) < amount) return 'not that much in it';
  put(s, from, get(s, from) - amount);
  put(s, to, get(s, to) + amount);
  log(s, `Moved $${Math.round(amount).toLocaleString('en-US')} from ${from} to ${to}.${to === 'cash' && amount > 10_000 ? ' The bank filed its cash report.' : ''}`);
  if (to === 'cash' && amount > 10_000) s.fin.onBooks += amount;
  return null;
}

/** Order metal from a dealer (paid now from checking, shipped insured in about a week). */
export function buyMetal(s: GameState, kind: MetalKind, units: number, where: Where): string | null {
  if (!dealerOpen(s)) return 'no dealer is shipping now';
  if (units <= 0) return 'nothing to buy';
  const cost = Math.round(buyPrice(s, kind) * units);
  if (s.money < cost) return 'not enough in checking';
  s.money -= cost;
  s.fin.orders.push({ kind, units, where, dueAt: s.clock.t + 6 + Math.floor(s.site.miles / 15) });
  if (cost >= 10_000) s.fin.onBooks += cost;
  log(s, `Ordered ${units} × ${METALS[kind].name.toLowerCase()} (${METALS[kind].unit}) for $${cost.toLocaleString('en-US')}; insured shipping, about a week.`);
  return null;
}

/** Sell metal back to the dealer (while one is open). */
export function sellMetal(s: GameState, kind: MetalKind, units: number): string | null {
  if (!dealerOpen(s)) return 'no dealer is buying now';
  const have = s.fin.holdings.filter(h => h.kind === kind && h.where !== 'buried' && (h.where !== 'bank' || banksOpen(s)));
  if (have.reduce((a, h) => a + h.units, 0) < units) return 'not that much to hand (dig up what is buried first)';
  let left = units;
  for (const h of have) { const t = Math.min(h.units, left); h.units -= t; left -= t; if (left <= 0) break; }
  s.fin.holdings = s.fin.holdings.filter(h => h.units > 1e-9);
  const pay = Math.round(sellPrice(s, kind) * units);
  s.money += pay;
  log(s, `Sold ${units} × ${METALS[kind].name.toLowerCase()} for $${pay.toLocaleString('en-US')}.`);
  return null;
}

/** Move metal: into the safe, bury it (a night's digging), or into the safe-deposit box. */
export function moveMetal(s: GameState, kind: MetalKind, from: Where, to: Where, units: number): string | null {
  if ((from === 'bank' || to === 'bank') && !banksOpen(s)) return 'the bank is shut';
  const h = s.fin.holdings.find(x => x.kind === kind && x.where === from);
  if (!h || h.units < units || units <= 0) return 'not that much there';
  h.units -= units;
  const t = s.fin.holdings.find(x => x.kind === kind && x.where === to);
  if (t) t.units += units; else s.fin.holdings.push({ kind, units, where: to });
  s.fin.holdings = s.fin.holdings.filter(x => x.units > 1e-9);
  log(s, to === 'buried' ? `Buried ${units} × ${METALS[kind].name.toLowerCase()} in a cache at night.` : `Moved ${units} × ${METALS[kind].name.toLowerCase()} ${WHERE_NAME[to]}.`);
  return null;
}

/** Once a day: markets, metals, interest, deliveries from the dealer, the crash, the bail-in. */
export function financeDay(s: GameState): string[] {
  const out: string[] = [];
  const f = s.fin, d = s.disaster;
  const day = Math.floor(s.clock.t + 0.25);
  const r = mulberry32(s.seed * 7177 + day * 17 + 1);
  const z = () => { const u = Math.max(1e-9, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const dt = 1 / 365;
  // metals: a walk underneath, and fear on top as trust in money fails
  f.base.gold *= Math.exp(0.05 * dt + 0.15 * Math.sqrt(dt) * z());
  f.base.silver *= Math.exp(0.05 * dt + 0.25 * Math.sqrt(dt) * z());
  const tension = d.kind && s.clock.t >= d.warnAt ? Math.min(1, (s.clock.t - d.warnAt) / Math.max(1, d.hitAt - d.warnAt)) : 0;
  const fear = d.kind ? (FEAR[d.kind] ?? 0.2) * Math.max(tension * 0.4, s.clock.t >= d.hitAt ? 1 - d.tracks.banks : 0) : 0;
  for (const m of ['gold', 'silver'] as const) {
    const target = f.base[m] * (1 + fear * (m === 'silver' ? 1.3 : 1));
    f.spot[m] += (target - f.spot[m]) * 0.15;
  }
  // the market, while it trades
  if (banksOpen(s)) {
    f.brokerage *= Math.exp(0.07 * dt + 0.16 * Math.sqrt(dt) * z() - (tension > 0 && s.clock.t < d.hitAt ? 0.0015 * tension : 0));
    f.savings *= 1 + 0.04 * dt;
  }
  // the crash when it hits
  if (d.kind && s.clock.t >= d.hitAt && !f.crashed) {
    f.crashed = true;
    const c = CRASH[d.kind] ?? 0.2;
    if (f.brokerage > 0 && c > 0.05) { f.brokerage *= 1 - c; out.push(`The market fell ${Math.round(c * 100)} % the day it hit.`); }
  }
  // the bail-in: a financial collapse that doesn't fully come back
  if (d.kind === 'financial' && d.fate !== 'full' && s.clock.t >= d.hitAt + 30 && !f.bailedIn) {
    f.bailedIn = true;
    const over = Math.max(0, s.money + f.savings - FDIC_LIMIT);
    if (over > 0) {
      const cut = over * 0.3, share = s.money / Math.max(1, s.money + f.savings);
      s.money -= cut * share; f.savings -= cut * (1 - share);
      out.push(`Bail-in: the bank took 30 % of everything over the insured $250,000 ($${Math.round(cut).toLocaleString('en-US')}).`);
    }
  }
  // the dealer's parcels arrive (if the post still runs)
  for (const o of [...f.orders]) {
    if (s.clock.t < o.dueAt) continue;
    if (d.tracks.deliveries < 0.25) { o.dueAt = s.clock.t + 7; continue; }
    f.orders.splice(f.orders.indexOf(o), 1);
    const h = f.holdings.find(x => x.kind === o.kind && x.where === o.where);
    if (h) h.units += o.units; else f.holdings.push({ kind: o.kind, units: o.units, where: o.where });
    out.push(`The insured parcel from the dealer came: ${o.units} × ${METALS[o.kind].name.toLowerCase()}, now ${WHERE_NAME[o.where]}.`);
  }
  // the safe-deposit box, yearly
  if (day % 365 === 0 && f.holdings.some(h => h.where === 'bank') && banksOpen(s)) s.money -= BOX_FEE;
  out.push(...debtDay(s, day));
  return out;
}

/**
 * Once a day: an overdraft goes on the card; interest; the monthly statement
 * (paid from checking as far as it goes), late fees, collections, the
 * judgment and its lien. Nothing moves while the banks are shut.
 */
export function debtDay(s: GameState, day: number): string[] {
  const out: string[] = [];
  const d = debtOf(s);
  // checking doesn't go below zero: whatever was charged past it went on the card
  if (s.money < 0) {
    if (d.owed <= 0 && d.stage === 'none') out.push(`Checking ran dry: $${Math.round(-s.money).toLocaleString('en-US')} in bills went on the credit card (24 % APR).`);
    d.owed += -s.money; s.money = 0;
    if (d.stage === 'none') d.stage = 'card';
  }
  if (d.owed <= 0.005) { if (d.stage !== 'none' || d.lien) { if (d.lien) out.push('The debt is paid off and the lien on the land is released.'); Object.assign(d, newDebt()); } return out; }
  // the banks are gone: nobody is collecting (the balance just sits there)
  if (!banksOpen(s)) return out;
  if (d.statementDay < 0) d.statementDay = day + 30;
  const i = d.owed * CARD_APR / 365;
  d.owed += i; d.interest += i;
  // garnishment: a quarter of the day jobs' pay goes to the collector (a working day's wage, five days in seven)
  if (d.stage === 'judgment') {
    const wages = s.people.reduce((a, p, k) => a + (s.personState[k]?.employed && s.personState[k]?.needs.died == null ? p.job?.wage ?? 0 : 0), 0) * 5 / 7;
    const g = Math.min(d.owed, wages * 0.25, Math.max(0, s.money));
    d.owed -= g; s.money -= g;
  }
  if (day < d.statementDay) return out;
  d.statementDay = day + 30;
  const due = minimumDue(d.owed);
  const pay = Math.min(d.owed, Math.max(0, s.money));
  s.money -= pay; d.owed -= pay;
  if (d.owed <= 0.005) { out.push(`Paid off the card ($${Math.round(pay).toLocaleString('en-US')}).${d.lien ? ' The lien on the land is released.' : ''}`); Object.assign(d, newDebt()); return out; }
  if (pay + 0.005 >= due) { d.missed = 0; if (d.stage === 'late') d.stage = 'card'; return out; }
  d.missed++;
  if (d.stage === 'card' || d.stage === 'late') { d.owed += LATE_FEE; d.interest += LATE_FEE; }
  if (d.missed >= JUDGMENT && d.stage !== 'judgment') {
    d.stage = 'judgment'; d.lien = Math.round(d.owed);
    out.push(`The collector went to court and got a judgment: a $${d.lien.toLocaleString('en-US')} lien on the land, and a quarter of any paycheck garnished until it's paid.`);
  } else if (d.missed >= CHARGE_OFF && d.stage !== 'collections' && d.stage !== 'judgment') {
    d.stage = 'collections';
    out.push(`Six months behind: the card company charged off the $${Math.round(d.owed).toLocaleString('en-US')} and sold it to a collection agency. The calls start the next morning.`);
  } else if (d.stage === 'card') {
    d.stage = 'late';
    out.push(`Missed the minimum on the card ($${Math.round(due).toLocaleString('en-US')}): a $${LATE_FEE} late fee. $${Math.round(d.owed).toLocaleString('en-US')} owed at 24 %.`);
  } else if (d.stage === 'collections' && d.missed % 3 === 0) {
    out.push(`Another letter from the collection agency: $${Math.round(d.owed).toLocaleString('en-US')}, "final notice before legal action".`);
  }
  return out;
}

/** Pay down what's owed from checking (the Finance panel's button). */
export function payDebt(s: GameState, amount: number): string | null {
  const d = debtOf(s);
  if (d.owed <= 0) return 'nothing owed';
  if (!banksOpen(s)) return 'the banks are shut';
  const pay = Math.min(amount, d.owed, s.money);
  if (pay <= 0) return 'nothing in checking';
  s.money -= pay; d.owed -= pay;
  log(s, `Paid $${Math.round(pay).toLocaleString('en-US')} toward the debt.`);
  if (d.owed <= 0.005) { log(s, `The debt is paid off${d.lien ? ' and the lien on the land is released' : ''}.`); Object.assign(d, newDebt()); }
  else if (d.missed && pay >= minimumDue(d.owed)) d.missed = 0;
  return null;
}

/** What a trader at the gate gives for metal once the money's gone: spot, bid up by scarcity. */
export function barterValue(s: GameState, kind: MetalKind): number {
  const scarce = 1 - Math.min(s.disaster.tracks.stores, s.disaster.tracks.banks);
  return priceOf(s, kind) * (1 + 0.6 * scarce);
}
