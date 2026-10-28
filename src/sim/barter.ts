/**
 * Barter and mutual aid after the collapse, when money no longer works
 * (the stores and banks tracks are down). Pure: mutates the draft state only.
 *
 * Values are in 2025 dollars-equivalent (what the good cost before), scaled
 * by scarcity: the tracks that supply a good, and how long since the hit
 * (stocks run down; a can is worth more in month six than in week one).
 * A day's labor is the other yardstick (`LABOR_DAY`).
 */
import { CALIBER, type Caliber } from './armory';
import { barterValue, METALS, type MetalKind } from './finance';
import { MATERIALS } from './materials';
import { addTool, kitOf, readKit, TOOL_KINDS, TOOLS, usedValue, type ToolKind } from './tools';
import { blockedReason, isFinished, addWork } from './construction';
import { mulberry32 } from './rng';
import { dayIndex, type GameState } from './state';

/** A day's labor in peacetime (2025 dollars, farm hand). */
export const LABOR_DAY = 120;
/** Stock goods a neighbor will barter for. */
export const STOCK_GOODS = ['fresh', 'frozen', 'canned', 'staples', 'fuel', 'firewood', 'meds', 'seed', 'hygiene'] as const;
export type StockGood = typeof STOCK_GOODS[number];
/** A tradable good: a stock item, rounds of a caliber, a unit of a metal, or a day's labor. */
export type Good = StockGood | `ammo:${Caliber}` | `metal:${MetalKind}` | `tool:${ToolKind}` | 'labor';
export interface Lot { good: Good; qty: number }

/** Persistent barter state (optional on old saves; lazily initialized). */
export interface BarterState {
  /** Labor-days the family owes the neighbors (worked off by mutual aid). */
  laborOwed: number;
  /** Answer when a friendly neighbor asks for help. */
  helpNeighbors: boolean;
  /** Tallies. */
  trades: number;
  aidGiven: number;
  aidReceived: number;
}
export function barterOf(s: GameState): BarterState {
  const x = s as GameState & { barter?: BarterState };
  x.barter ??= { laborOwed: 0, helpNeighbors: true, trades: 0, aidGiven: 0, aidReceived: 0 };
  return x.barter;
}

/** Does money still buy things? */
export const moneyWorks = (s: GameState) => Math.min(s.disaster.tracks.stores, s.disaster.tracks.banks) > 0.5;

/** Fresh food has no shop price: a basket of eggs and greens. */
const FRESH_PRICE = 8;

/** Days since the hit (0 before it). */
function sinceHit(s: GameState): number {
  return Math.max(0, s.clock.t - s.disaster.hitAt);
}

/** Today's value of every tradable good, per unit (stock unit, one round, one coin/bar, one labor-day). */
export function barterPrices(s: GameState): Record<Good, number> {
  const t = s.disaster.tracks;
  const scarce = 1 - Math.min(t.stores, t.banks);
  // stocks run down after the hit: up to +60 % by half a year
  const age = 1 + 0.6 * scarce * Math.min(1, sinceHit(s) / 180);
  const food = (1 + 1.5 * (1 - t.stores)) * age;
  const out = {} as Record<Good, number>;
  for (const g of STOCK_GOODS) {
    const base = g === 'fresh' ? FRESH_PRICE : MATERIALS[g].price ?? 0;
    const m = g === 'fuel' ? (1 + 2.5 * (1 - t.fuel)) * age
      : g === 'meds' ? (1 + 3 * (1 - t.medical)) * age
      : g === 'firewood' ? 1 + 0.8 * (1 - t.grid)
      : g === 'seed' ? (1 + 1.2 * (1 - t.deliveries)) * age
      : g === 'hygiene' ? (1 + 1 * (1 - t.stores)) * age
      : food;
    out[g] = base * m;
  }
  for (const c of Object.keys(CALIBER) as Caliber[]) out[`ammo:${c}`] = CALIBER[c].price / CALIBER[c].box * (1 + 3 * (1 - t.law)) * age;
  for (const k of Object.keys(METALS) as MetalKind[]) out[`metal:${k}`] = barterValue(s, k);
  // a used tool: its old shelf price less the wear, dearer the longer the stores stay shut
  for (const k of TOOL_KINDS) out[`tool:${k}`] = usedValue(k, 0.65) * (TOOLS[k].crude ? 0.5 : 1) * (1 + 1.5 * scarce * Math.min(1, sinceHit(s) / 365));
  // a day's work is worth less in goods when everyone has time and nobody has things
  out.labor = LABOR_DAY * (1 - 0.4 * scarce);
  return out;
}

/** What the family has of a good. */
export function have(s: GameState, good: Good): number {
  if (good === 'labor') return Infinity;
  if (good.startsWith('ammo:')) return s.armory.ammo[good.slice(5) as Caliber] ?? 0;
  if (good.startsWith('tool:')) return readKit(s).items.filter(t => t.kind === good.slice(5) && t.cond > 0).length;
  if (good.startsWith('metal:')) return s.fin.holdings.filter(h => h.kind === good.slice(6) && h.where !== 'bank').reduce((a, h) => a + h.units, 0);
  return s.stock[good as StockGood];
}

export function move(s: GameState, good: Good, qty: number): void {
  const b = barterOf(s);
  if (good === 'labor') { b.laborOwed = Math.max(0, b.laborOwed - qty); return; }
  if (good.startsWith('ammo:')) { const c = good.slice(5) as Caliber; s.armory.ammo[c] = (s.armory.ammo[c] ?? 0) + qty; return; }
  if (good.startsWith('tool:')) {
    const kind = good.slice(5) as ToolKind;
    if (qty > 0) { for (let i = 0; i < qty; i++) addTool(s, kind, 0.5, 0.5); return; }
    // the family gives up its most worn working ones first
    const kit = kitOf(s);
    const out = kit.items.filter(t => t.kind === kind && t.cond > 0).sort((a, b) => a.cond - b.cond).slice(0, -qty);
    kit.items = kit.items.filter(t => !out.includes(t));
    return;
  }
  if (good.startsWith('metal:')) {
    const kind = good.slice(6) as MetalKind;
    if (qty > 0) { const h = s.fin.holdings.find(x => x.kind === kind && x.where === 'safe'); if (h) h.units += qty; else s.fin.holdings.push({ kind, units: qty, where: 'safe' }); return; }
    let left = -qty;
    for (const h of s.fin.holdings) if (h.kind === kind && h.where !== 'bank' && left > 0) { const n = Math.min(h.units, left); h.units -= n; left -= n; }
    s.fin.holdings = s.fin.holdings.filter(h => h.units > 0);
    return;
  }
  s.stock[good as StockGood] += qty;
}

export const valueOf = (prices: Record<Good, number>, lots: readonly Lot[]) => lots.reduce((a, l) => a + (prices[l.good] ?? 0) * l.qty, 0);

/** Lowest disposition a neighbor trades at. */
export const TRADE_MIN_DISPOSITION = 0;
/** Most a household can spare in one trade, per member (dollars-equivalent). */
export const SPARE_PER_MEMBER = 400;

export type TradeProblem = 'no_neighbor' | 'not_home' | 'unfriendly' | 'empty' | 'short' | 'unfair' | 'too_much';
export interface TradeResult { ok: boolean; problem?: TradeProblem; give: number; get: number; line: string }

/**
 * Offer `give` for `get` with a neighbor. Fair = what you give is worth at
 * least what you get, plus a markup that shrinks as they like you more (none
 * at 50+). Giving labor means owing them days of work.
 */
export function trade(s: GameState, give: readonly Lot[], get: readonly Lot[], neighborId: string): TradeResult {
  const n = s.neighbors.find(x => x.id === neighborId);
  const p = barterPrices(s);
  const gv = valueOf(p, give), tv = valueOf(p, get);
  const fail = (problem: TradeProblem, line: string): TradeResult => ({ ok: false, problem, give: gv, get: tv, line });
  if (!n) return fail('no_neighbor', 'No such neighbor.');
  if (n.status !== 'home') return fail('not_home', `The ${n.name} place is empty.`);
  if (n.disposition < TRADE_MIN_DISPOSITION) return fail('unfriendly', `The ${n.name}s won't deal with you.`);
  if (!give.some(l => l.qty > 0) || !get.some(l => l.qty > 0)) return fail('empty', 'Nothing to trade.');
  if (give.some(l => l.qty < 0) || get.some(l => l.qty < 0)) return fail('empty', 'Nothing to trade.');
  if (give.some(l => have(s, l.good) < l.qty)) return fail('short', "You don't have that much.");
  if (tv > SPARE_PER_MEMBER * n.members) return fail('too_much', `The ${n.name}s can't spare that much.`);
  const markup = 1 + Math.max(0, 50 - n.disposition) / 200;
  if (gv < tv * markup - 1e-9) return fail('unfair', `The ${n.name}s want more for it.`);
  for (const l of give) {
    if (l.good === 'labor') barterOf(s).laborOwed += l.qty;
    else move(s, l.good, -l.qty);
  }
  for (const l of get) {
    if (l.good === 'labor') { const st = s.structures.find(x => !isFinished(x) && blockedReason(s, x) === null); if (st) addWork(s, st, l.qty * 8); }
    else move(s, l.good, l.qty);
  }
  // a generous deal goes further
  n.disposition = Math.min(100, n.disposition + 2 + Math.min(4, (gv - tv) / 100));
  barterOf(s).trades++;
  return { ok: true, give: gv, get: tv, line: `Traded with the ${n.name}s.` };
}

/** Chance a day that a friendly household helps, and that it asks for help. */
export const AID_CHANCE = 0.03;
export const ASK_CHANCE = 0.02;
/** Hours a work party puts in, per member. */
export const WORK_PARTY_H = 6;

/**
 * Once a day after the hit, with money gone: friendly neighbors (disposition
 * over 50) sometimes help (a work party on the next building, food when the
 * family is going hungry) and sometimes ask for help (two cases of canned
 * food and a day's work: disposition and humanity up; refusing costs a little
 * goodwill). Owed labor is worked off a day at a time.
 */
export function mutualAidDay(s: GameState): string[] {
  if (s.clock.t < s.disaster.hitAt || moneyWorks(s)) return [];
  const b = barterOf(s);
  const day = dayIndex(s.clock.t);
  const r = mulberry32(s.seed * 7919 + day * 31);
  const out: string[] = [];
  if (b.laborOwed > 0) b.laborOwed = Math.max(0, b.laborOwed - 1);
  for (const n of s.neighbors) {
    if (n.status !== 'home' || n.disposition <= 50) continue;
    const name = `The ${n.name}s`;
    if (r() < AID_CHANCE) {
      if (s.food.daysLeft < 7) {
        s.stock.canned += n.members;
        out.push(`${name} brought over ${n.members} cases of canned food.`);
        b.aidReceived++;
      } else {
        const st = s.structures.find(x => !isFinished(x) && blockedReason(s, x) === null);
        if (st) { addWork(s, st, n.members * WORK_PARTY_H); out.push(`${name} came over for a work party.`); b.aidReceived++; }
      }
    }
    if (r() < ASK_CHANCE) {
      if (b.helpNeighbors && s.stock.canned >= 2) {
        s.stock.canned -= 2;
        b.laborOwed += 1;
        n.disposition = Math.min(100, n.disposition + 5);
        s.gate.humanity = Math.min(100, s.gate.humanity + 2);
        b.aidGiven++;
        out.push(`${name} were in a bad way: you sent food and a day's work.`);
      } else {
        n.disposition = Math.max(-100, n.disposition - 3);
        out.push(`${name} asked for help; you couldn't spare it.`);
      }
    }
  }
  return out;
}
