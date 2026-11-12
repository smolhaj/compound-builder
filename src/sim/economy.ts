/**
 * Economy: buying materials. An order is paid when placed and delivered by
 * truck after a lead time (the county lumber yard / farm store delivers in
 * ~2 days; docs/DECISIONS.md: deliveries come by truck on the county road).
 */
import { MATERIALS, type MaterialId, type Stock } from './materials';
import { listCapped, materialCount, pluralize } from './words';
import { weatherDelay } from './upkeep';
import type { GameState, OrderLine } from './state';
import { truckHold } from './roadPost';
import { canOrder, priceFactor } from './disaster';
import { CARRY_H } from './improvements';
import { adoptDog, coatName } from './pets';
import { addFood, CAT_KCAL, FOOD, foodCount, type FoodItemId } from './pantry';

/** A line's price at list (a named food at its own price). */
const linePrice = (l: OrderLine) => l.food ? (FOOD[l.food].price ?? 0) * (l.n ?? 0) : (MATERIALS[l.material].price ?? 0) * l.qty;
const isReal = (l: OrderLine) => l.qty > 0 || (l.food !== undefined && (l.n ?? 0) > 0);
/** A line's name in the log. */
const lineName = (l: OrderLine) => l.food ? foodCount(l.food, l.n ?? 0) : materialCount(l.material, l.qty, MATERIALS[l.material].name, String(l.qty));

/** An order line for `n` units of a named food. */
export function foodLine(id: FoodItemId, n: number): OrderLine {
  const it = FOOD[id];
  return { material: it.cat, qty: n * it.kcal / CAT_KCAL[it.cat], food: id, n };
}

/** Put a delivered line in the stockpile (a named food goes into the pantry by name). */
export function receive(s: GameState, l: OrderLine): void {
  // dogs are not goods: each one that arrives is a named pet (sim/pets.ts)
  if (l.material === 'dog' || l.material === 'puppy') { for (let k = 0; k < Math.floor(l.qty); k++) { const d = adoptDog(s, l.material === 'puppy' ? { puppy: true } : { training: 50, ageYears: 2 }); log(s, `${d.name}, a ${coatName(d)} ${d.breed}, has come home. Everyone wants to meet ${d.sex === 'f' ? 'her' : 'him'}.`); } return; }
  if (l.food && (l.n ?? 0) > 0) addFood(s, l.food, l.n ?? 0);
  else s.stock[l.material] += l.qty;
}


/** Days from order to delivery. */
export const LEAD_TIME_DAYS = 2;
/** Flat delivery fee per order. */
export const DELIVERY_FEE = 75;

export type OrderProblem = 'empty' | 'not_for_sale' | 'cannot_afford' | 'no_deliveries';

/** Cost of an order; `factor` is the price level (panic buying in the warning signs, scarcity after; disaster.priceFactor). */
export function orderCost(lines: readonly OrderLine[], factor = 1): number {
  return Math.round(lines.reduce((a, l) => a + linePrice(l), 0) * factor) + (lines.length ? DELIVERY_FEE : 0);
}

/** Today's price level. */
export const prices = (s: GameState) => priceFactor(s.disaster, s.clock.t);

export function orderProblem(s: GameState, lines: readonly OrderLine[]): OrderProblem | null {
  const real = lines.filter(isReal);
  if (real.length === 0) return 'empty';
  if (real.some(l => (l.food ? FOOD[l.food].price : MATERIALS[l.material].price) === null)) return 'not_for_sale';
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
  const real = lines.filter(isReal).map(l => ({ ...l }));
  const cost = orderCost(real, prices(s));
  const id = `o${s.nextId++}`;
  if (payWith(s) === 'cash') s.fin.cash -= cost; else s.money -= cost;
  const wx = weatherDelay(s, real.map(l => l.material));
  s.orders.push({ id, lines: real, cost, placedAt: s.clock.t, dueAt: s.clock.t + LEAD_TIME_DAYS + Math.floor(s.site.miles / 15) + wx.days, status: 'ordered' });
  log(s, `Ordered ${listCapped(real.map(lineName))} — $${cost.toLocaleString('en-US')}.${wx.why ? ` It'll be ${pluralize(wx.days, 'day')} late (${wx.why}).` : ''}`);
  return id;
}

/** Deliver due orders to the stockpile. */
export function deliverOrders(s: GameState): void {
  for (const o of s.orders) {
    if (o.status !== 'ordered' || s.clock.t < o.dueAt) continue;
    // a block on the county road holds the truck (sim/roadPassers.ts); neighbors are never stopped
    const hold = truckHold(s, o);
    if (hold > 0) { o.dueAt = s.clock.t + hold; log(s, 'The delivery truck was held up at the roadblock on the county road.'); continue; }
    o.status = 'delivered';
    const what = listCapped(o.lines.map(l => l.food ? foodCount(l.food, l.n ?? 0) : materialCount(l.material, l.qty, MATERIALS[l.material].name, String(l.qty))));
    // no drive yet, or the bridge on it is down: the truck leaves it at the road (at the creek) and the family carries it in
    if (!s.site.improvements.drive || s.roadBridge?.down || s.perimeter.some(r => r.collapsed || r.dropped)) {      // (no drive, the bridge down, or a tunnel choked with rubble: the truck leaves it at the road)
      // each good is its own pile: what needs no carrying (concrete, a septic tank, a rig) is delivered to its place, and
      // a small item is not stuck behind two hundred hours of lumber (QA stall hunt: a drive-less lot waited weeks on one sack)
      const piles = o.lines.map(l => ({ l, hours: (CARRY_H[l.material] ?? 0.2) * l.qty }));
      const heavy = piles.filter(p => p.hours > 0.5);
      if (heavy.length) {
        for (const p of piles) {
          if (p.hours > 0.5) (s.roadside ??= []).push({ lines: [{ ...p.l }], hours: p.hours, done: 0 });
          else receive(s, p.l);
        }
        const hours = heavy.reduce((a, p) => a + p.hours, 0);
        log(s, `The truck left ${what} at the road: about ${pluralize(Math.round(hours), 'hour')} of carrying to get it in.`);
        continue;
      }
    }
    for (const l of o.lines) receive(s, l);
    log(s, `The delivery truck dropped off ${what}.`);
  }
}

/**
 * Materials on the way to the stockpile: on order and not yet delivered, plus what the truck left at the road
 * (no drive, a downed bridge) until the family has carried it in. Counting the road pile matters: without it
 * "Order what the plans need" and the stuck card asked for the same bill a second time while it sat at the gate.
 */
export function onOrder(s: GameState): Partial<Stock> {
  const out: Partial<Stock> = {};
  for (const o of s.orders) if (o.status === 'ordered') for (const l of o.lines) out[l.material] = (out[l.material] ?? 0) + l.qty;
  for (const r of s.roadside ?? []) for (const l of r.lines) if (!l.food) out[l.material] = (out[l.material] ?? 0) + l.qty;
  return out;
}

export function log(s: GameState, text: string): void {
  s.log.push({ t: s.clock.t, text });
  if (s.log.length > 60) s.log.splice(0, s.log.length - 60);
}

/**
 * A load of one good reaches the stockpile a whole unit at a time as it is carried in, not all at once at the end
 * (QA: 9 fieldstone sat behind 74 hours of carrying a 37-unit pile; a family with day jobs waited a month for them).
 */
export function releaseCarried(s: GameState, r: GameState['roadside'][number]): void {
  if (r.lines.length !== 1) return;
  const l = r.lines[0], per = CARRY_H[l.material] ?? 0;
  if (l.food || per <= 0 || l.qty <= 1) return;
  const k = Math.min(Math.floor(r.done / per + 1e-9), Math.floor(l.qty - 1e-9));
  if (k < 1) return;
  receive(s, { ...l, qty: k });
  l.qty -= k; r.hours -= k * per; r.done -= k * per;
}

/** Is any of this good sitting at the road waiting to be carried in? */
export const atTheRoad = (s: GameState, m: MaterialId): boolean => (s.roadside ?? []).some(r => r.lines.some(l => l.material === m && !l.food && l.qty > 0));

/** Carry person-hours of deliveries in from the road (oldest first); returns the hours used. */
export function addCarryWork(s: GameState, hours: number, wanted?: ReadonlySet<MaterialId>): number {
  let left = hours;
  // the load a waiting project needs comes in first; otherwise the oldest
  if (wanted?.size && s.roadside.length > 1) {
    const i = s.roadside.findIndex(r => r.lines.some(l => wanted.has(l.material)));
    if (i > 0) s.roadside.unshift(...s.roadside.splice(i, 1));
  }
  while (left > 1e-9 && s.roadside.length) {
    const r = s.roadside[0];
    const use = Math.min(left, r.hours - r.done);
    r.done += use; left -= use;
    releaseCarried(s, r);
    if (r.done >= r.hours - 1e-9) {
      for (const l of r.lines) receive(s, l);
      s.roadside.shift();
      log(s, 'Carried the last of the delivery in from the road.');
    }
  }
  return hours - left;
}
