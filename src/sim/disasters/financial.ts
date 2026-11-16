import type { KindFx } from '../disasterFx';
import { daysSince, kfx, outcome, type Goal, type TechCard } from '../techFx';
import { cashPower, cashPowerAt, cashPriceMult, runMeter, withdrawalRoom } from '../moneyMath';
import { debtOf, transfer } from '../finance';

/** Financial collapse (WP5): cash is very dear but not worthless (cashPower, floor 0.15), a run on the banks, hard goods win the barter market. */
export interface FinState { lastCp: number; lastLine: number }
export const finOf = (s: Parameters<typeof kfx>[0]) => kfx<FinState>(s, 'financial', () => ({ lastCp: 1, lastLine: -1 }));
const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const on = (s: Parameters<TechCard['due']>[0]) => s.disaster.kind === 'financial';

export const cards: TechCard[] = [
  {
    id: 'fin_run', kind: 'financial', title: 'A line outside the bank', ttl: 6, fallback: 'stay',
    text: s => `Two regional banks have failed and "temporary" withdrawal limits are coming. The bank has ${usd(s.money)} of yours in checking. The Run meter reads ${Math.round(runMeter(s) * 100)}%.`,
    options: s => [
      { id: 'pull', label: 'Pull 40% of checking out as small bills', hint: 'Cash in the safe is valid when the banks do not open. The bank limits how much you can take, and the cash flags a report above $10,000.', locked: s.money < 1000 ? 'not enough in checking' : undefined },
      { id: 'debt', label: 'Pay off the credit card in full', hint: 'Hyperinflation would have shrunk it; a bank holiday will not.', locked: debtOf(s).owed < 1 ? 'no card balance' : s.money < debtOf(s).owed ? 'not enough in checking' : undefined },
      { id: 'stay', label: 'Stay liquid and wait', hint: 'If the banks freeze, checking and savings freeze with them.' },
    ],
    due: s => on(s) && s.clock.t < s.disaster.hitAt && runMeter(s) > 0.5,
    answer: (s, o) => {
      if (o === 'stay') return outcome('You wait', 'The line is gone by evening; so is the cash.', 'mixed');
      if (o === 'debt') { const owed = debtOf(s).owed; s.money -= owed; debtOf(s).owed = 0; return outcome('The card is paid', `${usd(owed)} gone from checking and a monthly bill gone with it.`, 'good'); }
      const want = Math.floor(s.money * 0.4 / 100) * 100, room = withdrawalRoom(s), amt = Math.min(want, room);
      const why = amt > 0 ? transfer(s, 'checking', 'cash', amt) : 'the bank is limiting withdrawals';
      return why ? outcome('The teller says no', `The bank refused: ${why}.`, 'bad') : outcome('Cash in the safe', `${usd(amt)} in twenties and fives, in the safe by supper.`, 'good');
    },
  },
  {
    id: 'fin_window', kind: 'financial', title: 'The banks did not open', ttl: 3, fallback: 'hold',
    text: s => `Stores take cash today at today's prices; the shelves are full and the line is short. You have ${usd(s.fin?.cash ?? 0)} in the safe. Each week a dollar buys less.`,
    options: s => [
      { id: 'stock', label: 'Spend $1,500 of the safe\'s cash on staples, canned food and fuel', hint: 'Hard goods hold value; the dollars will not.', locked: (s.fin?.cash ?? 0) >= 1500 ? undefined : 'needs $1,500 in cash in the safe' },
      { id: 'hold', label: 'Hold the cash', hint: 'Cash is dear but not worthless: at its floor a dollar still buys 15 cents of what it did.' },
    ],
    due: s => on(s) && s.clock.t >= s.disaster.hitAt,
    answer: (s, o) => {
      if (o === 'hold') return outcome('You keep the cash', 'You tell yourself the banks open Monday.', 'mixed');
      s.fin.cash -= 1500; s.stock.staples += 6; s.stock.canned += 4; s.stock.fuel += 8;
      return outcome('A full pantry', 'Six bags of staples, four cases of canned food and eight cans of fuel, paid in cash.', 'good');
    },
  },
  {
    id: 'fin_fee', kind: 'financial', title: 'A deputy asks for a "fee"', ttl: 4, fallback: 'pay',
    text: () => 'A county deputy, unpaid for six weeks, stands at the gate. He asks about the produce stand and says there is a "permit fee" for unattended farms. It is half a threat and half a plea.',
    options: s => [
      { id: 'pay', label: 'Pay him $300 in cash', hint: 'Keeps him friendly. He will be back monthly.', locked: (s.fin?.cash ?? 0) >= 300 ? undefined : 'needs $300 in cash in the safe' },
      { id: 'refuse', label: 'Refuse and say you know the sheriff', hint: '35% he comes back with two others and takes a tenth of the food.' },
      { id: 'barter', label: 'Offer eggs and a half cord of firewood instead', hint: 'Takes a few days of the family\'s work but costs no cash.' },
    ],
    due: s => on(s) && daysSince(s) >= 20 && s.disaster.tracks.law < 0.8 && s.clock.t >= s.disaster.hitAt,
    answer: (s, o, r) => {
      if (o === 'pay') { s.fin.cash -= 300; return outcome('A fee paid', 'He tips his hat and says he will see you next month.', 'mixed'); }
      if (o === 'barter') { s.stock.firewood = Math.max(0, s.stock.firewood - 1); return outcome('Eggs and wood', 'He took the eggs, the wood and a look at your fence.', 'good'); }
      if (r() < 0.35) { for (const k of ['staples', 'canned', 'frozen'] as const) s.stock[k] = Math.floor(s.stock[k] * 0.9); return outcome('He came back', 'Three men in a county truck "inspected" the pantry and left with a tenth of it.', 'bad'); }
      return outcome('He leaves', 'He grumbles and drives off. You have not seen the last of him.', 'good');
    },
  },
];

export const goals: Goal[] = [
  { id: 'fin_cash', text: 'Pull cash into the safe before the banks stop opening', by: 0, done: s => (s.fin?.cash ?? 0) >= 1000 },
  { id: 'fin_goods', text: 'Turn some cash into hard goods: staples, fuel, tools, ammo, silver', by: 2, done: s => s.stock.staples >= 4 && s.stock.fuel >= 6 },
  { id: 'fin_metal', text: 'Hold gold or silver in the safe or buried', by: 3, done: s => (s.fin?.holdings ?? []).some(h => h.where !== 'bank') },
  { id: 'fin_barter', text: 'Make a trade at the crossroads for goods, not dollars', by: 7, done: s => (s as unknown as { barter?: { trades: number } }).barter ? ((s as unknown as { barter: { trades: number } }).barter.trades ?? 0) >= 1 : false },
  { id: 'fin_hands', text: 'Keep the place staffed: burglars come to empty farms', by: 7, done: s => s.people.some((_, i) => s.personState[i]?.needs.died == null) },
];

const fmt = (n: number) => '$' + (n < 100 ? n.toFixed(2) : Math.round(n).toLocaleString('en-US'));
export const fx: KindFx = {
  legacy: { economy: 'finance.ts: the market crash (45%) and the bail-in' },
  onWarning: () => ['Two regional banks failed this week. Treasury says deposits are safe.'],
  onHit: s => [`The banks did not open. A dollar still buys something, but not much: cash is dear, not worthless (it will not fall below ${Math.round(cashPowerAt(s.disaster.variant, 9999) * 100)} cents on the old dollar).`],
  daily: s => {
    const out: string[] = [];
    const f = finOf(s), cp = cashPower(s);
    // hyperinflation shrinks debts as the dollar sinks; a bank holiday does not
    if (s.disaster.variant === 'hyperinflation' && f.lastCp > 0) { const d = debtOf(s); if (d.owed > 0) d.owed *= cp / f.lastCp; }
    f.lastCp = cp;
    return out;
  },
  priceMods: s => (s.clock.t < s.disaster.hitAt ? 1 + 0.1 * runMeter(s) : cashPriceMult(cashPower(s))),
  serviceMods: s => {
    // the power and phones stay up through the first six months: this is the point of the kind
    const d = daysSince(s), t = s.disaster.tracks;
    return d < 180 ? { grid: t.grid > 0 && t.grid < 0.7 ? 0.7 / t.grid : 1, phone: t.phone > 0 && t.phone < 0.7 ? 0.7 / t.phone : 1 } : {};
  },
  encounterWeights: (s, mix) => {
    mix.scale('break_in', 2);
    if (daysSince(s) >= 20) mix.scale('requisition', 3);
    mix.scale('gang', 0.6);
  },
  npcMods: () => 1.25,
  radioBulletins: (s, ctx) => {
    const cp = cashPower(s);
    if (ctx.day < 2) return { text: 'the banks did not open Monday. Treasury promises a statement.', tone: 3 };
    if (ctx.day >= 7 && ctx.day < 10) return { text: `bread is ${fmt(3.5 * cashPriceMult(cp))} a loaf at the feed store. Eggs for diesel at the crossroads.`, tone: 2 };
    if (ctx.day >= 30 && ctx.day < 33) return { text: 'the government fixes the price of flour by decree. The shelves are emptier by morning.', tone: 2 };
    if (ctx.day >= 120 && ctx.day < 123) return { text: `silver is at ${fmt(s.fin.spot.silver)} an ounce; the coin shop is closed. A dollar buys ${Math.round(cp * 100)} cents of what it did.`, tone: 1 };
    if (ctx.day >= 240 && ctx.day < 243) return { text: 'a new currency will be introduced; the old notes are worthless in 30 days.', tone: 3 };
    return null;
  },
};
