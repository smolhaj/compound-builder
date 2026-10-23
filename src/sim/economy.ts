/**
 * Economy: buying materials. An order is paid when placed and delivered by
 * truck after a lead time (the county lumber yard / farm store delivers in
 * ~2 days; docs/DECISIONS.md: deliveries come by truck on the county road).
 */
import { MATERIALS, type Stock } from './materials';
import type { GameState, OrderLine } from './state';

/** Days from order to delivery. */
export const LEAD_TIME_DAYS = 2;
/** Flat delivery fee per order. */
export const DELIVERY_FEE = 75;

export type OrderProblem = 'empty' | 'not_for_sale' | 'cannot_afford';

export function orderCost(lines: readonly OrderLine[]): number {
  return lines.reduce((a, l) => a + (MATERIALS[l.material].price ?? 0) * l.qty, 0) + (lines.length ? DELIVERY_FEE : 0);
}

export function orderProblem(s: GameState, lines: readonly OrderLine[]): OrderProblem | null {
  const real = lines.filter(l => l.qty > 0);
  if (real.length === 0) return 'empty';
  if (real.some(l => MATERIALS[l.material].price === null)) return 'not_for_sale';
  if (orderCost(real) > s.money) return 'cannot_afford';
  return null;
}

/** Place an order (mutates the draft). Returns the order id or null. */
export function placeOrder(s: GameState, lines: readonly OrderLine[]): string | null {
  if (orderProblem(s, lines)) return null;
  const real = lines.filter(l => l.qty > 0).map(l => ({ ...l }));
  const cost = orderCost(real);
  const id = `o${s.nextId++}`;
  s.money -= cost;
  s.orders.push({ id, lines: real, cost, placedAt: s.clock.t, dueAt: s.clock.t + LEAD_TIME_DAYS, status: 'ordered' });
  log(s, `Ordered ${real.map(l => `${l.qty} × ${MATERIALS[l.material].name.toLowerCase()}`).join(', ')} — $${cost.toLocaleString('en-US')}.`);
  return id;
}

/** Deliver due orders to the stockpile. */
export function deliverOrders(s: GameState): void {
  for (const o of s.orders) {
    if (o.status !== 'ordered' || s.clock.t < o.dueAt) continue;
    o.status = 'delivered';
    for (const l of o.lines) s.stock[l.material] += l.qty;
    log(s, `The delivery truck dropped off ${o.lines.map(l => `${l.qty} ${MATERIALS[l.material].name.toLowerCase()}`).join(', ')}.`);
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
