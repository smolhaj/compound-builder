/**
 * Economy: buying materials. An order is paid when placed and delivered by
 * truck after a lead time (the county lumber yard / farm store delivers in
 * ~2 days; docs/DECISIONS.md: deliveries come by truck on the county road).
 */
import { MATERIALS, type Stock } from './materials';
import { weatherDelay } from './upkeep';
import type { GameState, OrderLine } from './state';
import { canOrder, priceFactor } from './disaster';
import { CARRY_H } from './improvements';

/** Days from order to delivery. */
export const LEAD_TIME_DAYS = 2;
/** Flat delivery fee per order. */
export const DELIVERY_FEE = 75;

export type OrderProblem = 'empty' | 'not_for_sale' | 'cannot_afford' | 'no_deliveries';

/** Cost of an order; `factor` is the price level (panic buying in the warning signs, scarcity after; disaster.priceFactor). */
export function orderCost(lines: readonly OrderLine[], factor = 1): number {
  return Math.round(lines.reduce((a, l) => a + (MATERIALS[l.material].price ?? 0) * l.qty, 0) * factor) + (lines.length ? DELIVERY_FEE : 0);
}

/** Today's price level. */
export const prices = (s: GameState) => priceFactor(s.disaster, s.clock.t);

export function orderProblem(s: GameState, lines: readonly OrderLine[]): OrderProblem | null {
  const real = lines.filter(l => l.qty > 0);
  if (real.length === 0) return 'empty';
  if (real.some(l => MATERIALS[l.material].price === null)) return 'not_for_sale';
  const how = payWith(s);
  if (!how) return 'no_deliveries';
  if (orderCost(real, prices(s)) > (how === 'bank' ? s.money : s.fin.cash)) return 'cannot_afford';
  return null;
}

/** How an order gets paid: from the bank, or (banks shut, trucks still running, the law mostly holding) cash from the safe. */
export function payWith(s: GameState): 'bank' | 'cash' | null {
  const t = s.disaster.tracks;
  if (canOrder(s.disaster, s.clock.t) && t.deliveries > 0.25 && t.banks > 0.25) return 'bank';
  return t.deliveries > 0.25 && t.law > 0.2 && s.fin?.cash > 0 ? 'cash' : null;
}

/** Place an order (mutates the draft). Returns the order id or null. */
export function placeOrder(s: GameState, lines: readonly OrderLine[]): string | null {
  if (orderProblem(s, lines)) return null;
  const real = lines.filter(l => l.qty > 0).map(l => ({ ...l }));
  const cost = orderCost(real, prices(s));
  const id = `o${s.nextId++}`;
  if (payWith(s) === 'cash') s.fin.cash -= cost; else s.money -= cost;
  const wx = weatherDelay(s, real.map(l => l.material));
  s.orders.push({ id, lines: real, cost, placedAt: s.clock.t, dueAt: s.clock.t + LEAD_TIME_DAYS + Math.floor(s.site.miles / 15) + wx.days, status: 'ordered' });
  log(s, `Ordered ${real.map(l => `${l.qty} × ${MATERIALS[l.material].name.toLowerCase()}`).join(', ')} — $${cost.toLocaleString('en-US')}.${wx.why ? ` It'll be ${wx.days} days late (${wx.why}).` : ''}`);
  return id;
}

/** Deliver due orders to the stockpile. */
export function deliverOrders(s: GameState): void {
  for (const o of s.orders) {
    if (o.status !== 'ordered' || s.clock.t < o.dueAt) continue;
    o.status = 'delivered';
    const what = o.lines.map(l => `${l.qty} ${MATERIALS[l.material].name.toLowerCase()}`).join(', ');
    // no drive yet: the truck leaves it at the road and the family carries it in
    if (!s.site.improvements.drive) {
      const hours = o.lines.reduce((a, l) => a + (CARRY_H[l.material] ?? 0.2) * l.qty, 0);
      if (hours > 0.5) {
        (s.roadside ??= []).push({ lines: o.lines.map(l => ({ ...l })), hours, done: 0 });
        log(s, `The truck left ${what} at the road: about ${Math.round(hours)} hours of carrying to get it in.`);
        continue;
      }
    }
    for (const l of o.lines) s.stock[l.material] += l.qty;
    log(s, `The delivery truck dropped off ${what}.`);
  }
}

/** Materials on order and not yet delivered. */
export function onOrder(s: GameState): Partial<Stock> {
  const out: Partial<Stock> = {};
  for (const o of s.orders) if (o.status === 'ordered') for (const l of o.lines) out[l.material] = (out[l.material] ?? 0) + l.qty;
  return out;
}

export function log(s: GameState, text: string): void {
  s.log.push({ t: s.clock.t, text });
  if (s.log.length > 60) s.log.splice(0, s.log.length - 60);
}

/** Carry person-hours of deliveries in from the road (oldest first); returns the hours used. */
export function addCarryWork(s: GameState, hours: number): number {
  let left = hours;
  while (left > 1e-9 && s.roadside.length) {
    const r = s.roadside[0];
    const use = Math.min(left, r.hours - r.done);
    r.done += use; left -= use;
    if (r.done >= r.hours - 1e-9) {
      for (const l of r.lines) s.stock[l.material] += l.qty;
      s.roadside.shift();
      log(s, 'Carried the last of the delivery in from the road.');
    }
  }
  return hours - left;
}
