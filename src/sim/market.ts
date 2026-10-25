/**
 * The crossroads market (decided with the user: "all of these",
 * docs/DECISIONS.md; extends sim/barter.ts). Pure and seeded.
 *
 *  When     once a week (Saturday) from about ten weeks after the hit, once
 *           things have settled a little: the law partly back (police & 911
 *           at a quarter or better) or the neighbors organized (a co-op or a
 *           militia, sim/neighborLife.ts). It runs while money doesn't.
 *  Prices   barter.barterPrices, then: ammo, antibiotics (the meds kits),
 *           salt, coffee, fuel, seed and batteries become the money every
 *           stall takes, and their value climbs with time and local supply
 *           (fuel with how stripped the gas station is, meds with the
 *           pharmacy). Gold is worth far less than its spot early on (you
 *           can't eat it and nobody can make change for an ounce); it comes
 *           back over years, as trade reaches further. Silver does better.
 *  Haggle   a stall asks what its goods are worth, times how hard the vendor
 *           drives a bargain and what the crossroads thinks of you, less a
 *           little for a good negotiator. Goods they don't want count for
 *           60 %. Close (85 %) can still go through. You can deal honest,
 *           generous, or cheat (watered fuel, short-weight salt, stale gas
 *           sold as fresh): a cheat that isn't caught at the stall may still
 *           come out a week or two later.
 *  Name     reputation (−100 … 100) spreads: better prices and, at 40, an
 *           invitation to the co-op; at −40 stalls start refusing you. The
 *           neighbors hear it too.
 *  Risk     the one who went can be robbed on the road home (worse lawless,
 *           carrying more, alone and unarmed), or followed home: that raises
 *           OPSEC exposure (opsec.ts) and brings a crew to the gate sooner.
 */
import { barterPrices, have, move, moneyWorks, type Good } from './barter';
import { canGo, fightAtCamp } from './rescue';
import { applyCasualties } from './battle';
import { pickedOver } from './scavenge';
import { mulberry32, pick } from './rng';
import { log } from './economy';
import { calendarOf, dayIndex, type GameState } from './state';
import { BAG_BASE, BAG_GOODS, bagOf, newMarketState, type BagGood, type MarketGood, type MarketState, type Stall } from './tradeGoods';
import type { Caliber } from './armory';

export type { MarketGood };
export interface MLot { good: MarketGood; qty: number }

export const marketOf = (s: GameState): MarketState => {
  const m = (s.market ??= newMarketState());
  bagOf(s);
  return m;
};

/** Ten weeks or so after the hit for things to settle enough. */
export const MARKET_SETTLE_DAYS = 70;
/** Saturday (day index mod 7). */
export const MARKET_WEEKDAY = 5;

const since = (s: GameState) => Math.max(0, s.clock.t - s.disaster.hitAt);

/** Is there a market (on market days)? */
export function marketOpen(s: GameState): boolean {
  const d = s.disaster;
  if (!d.kind || s.clock.t < d.hitAt + MARKET_SETTLE_DAYS || moneyWorks(s)) return false;
  if (d.kind === 'zombies') return false;
  const organized = !!s.locals?.group;
  return d.tracks.law >= 0.25 || organized;
}
export const isMarketDay = (s: GameState) => marketOpen(s) && dayIndex(s.clock.t) % 7 === MARKET_WEEKDAY;
/** Days to the next market day (0 = today). */
export const daysToMarket = (s: GameState) => (MARKET_WEEKDAY - (dayIndex(s.clock.t) % 7) + 7) % 7;

/** What everyone takes: the money of the crossroads. */
export const CURRENCY: MarketGood[] = ['ammo:22lr', 'ammo:9mm', 'ammo:12ga', 'ammo:556', 'meds', 'bag:salt', 'bag:coffee', 'fuel', 'seed', 'bag:batteries'];

/** Rises with time since the hit: 0 at the hit, ~0.45 at 10 weeks, ~0.95 after a year. */
export const ramp = (days: number) => 1 - Math.exp(-days / 120);
/** Gold: worth ~30 % of what a trader would give at first, back to ~80 % after three years. Silver: 70 % → 100 % over two. */
export const goldFactor = (days: number) => 0.3 + 0.5 * Math.min(1, days / 1095);
export const silverFactor = (days: number) => 0.7 + 0.3 * Math.min(1, days / 730);
/** How much a small trade good's value climbs at full scarcity. */
export const BAG_SCARCITY: Record<BagGood, number> = { salt: 4, coffee: 6, batteries: 5, tobacco: 5, liquor: 3 };

/** Today's value of everything at the crossroads (2025 dollars-equivalent, per unit). */
export function marketPrices(s: GameState): Record<MarketGood, number> {
  const p = { ...barterPrices(s) } as Record<MarketGood, number>;
  const t = since(s), k = ramp(t);
  for (const g of Object.keys(p) as MarketGood[]) {
    if (g.startsWith('metal:gold')) p[g] *= goldFactor(t);
    else if (g.startsWith('metal:')) p[g] *= silverFactor(t);
  }
  for (const b of BAG_GOODS) p[`bag:${b}`] = BAG_BASE[b].price * (1 + BAG_SCARCITY[b] * k);
  // local supply: as the gas station and the pharmacy are stripped, fuel and medicine climb
  const pl = s.scavenge?.places ?? [];
  const gas = pl.find(x => x.kind === 'gas'), rx = pl.find(x => x.kind === 'pharmacy');
  if (gas) p.fuel *= 1 + 1.5 * pickedOver(gas);
  if (rx) p.meds *= 1 + pickedOver(rx);
  // seed is dear in spring, when everyone wants to plant
  const doy = calendarOf(s.clock).doy;
  p.seed *= (1 + 1.5 * k) * (doy >= 60 && doy <= 150 ? 1.3 : 1);
  return p;
}

export function mhave(s: GameState, g: MarketGood): number {
  if (g.startsWith('bag:')) return bagOf(s)[g.slice(4) as BagGood] ?? 0;
  return have(s, g as Good);
}
function mmove(s: GameState, g: MarketGood, qty: number): void {
  if (g.startsWith('bag:')) { const b = bagOf(s); const k = g.slice(4) as BagGood; b[k] = Math.max(0, (b[k] ?? 0) + qty); return; }
  move(s, g as Good, qty);
}

// ─────────────────────────────────────────────────────────────────────────
// Stalls
// ─────────────────────────────────────────────────────────────────────────

const VENDORS = ['Earl Pruitt, with a wagon of potatoes', 'two sisters from the LDS ward', 'a Hutterite wagon from the colony', 'Dale, with jerrycans in a horse trailer', 'a man nobody knows, selling ammunition', 'Ruth from the old Grange hall', 'the Delgado boys', 'an old woman with laying hens and salt', 'a trucker who walked off the interstate', 'the vet from Ennis', 'a family from the reservoir camp', 'Pastor Lindgren and his deacons'];
const OFFERS: Array<[MarketGood, number, number]> = [
  ['staples', 1, 2], ['canned', 2, 6], ['fresh', 4, 10], ['meds', 1, 2], ['fuel', 1, 4], ['seed', 1, 2], ['hygiene', 2, 6], ['firewood', 1, 3],
  ['ammo:22lr', 100, 300], ['ammo:12ga', 10, 40], ['ammo:9mm', 20, 60], ['ammo:3030', 10, 30],
  ['bag:salt', 2, 8], ['bag:coffee', 1, 4], ['bag:batteries', 2, 6], ['bag:tobacco', 2, 10], ['bag:liquor', 1, 3],
];

/** The stalls this market day (seeded by the day). */
export function makeStalls(s: GameState, day: number): Stall[] {
  const r = mulberry32(s.seed * 4021 + day * 13);
  const n = 4 + Math.floor(r() * 4);
  const names = [...VENDORS].sort(() => r() - 0.5).slice(0, n);
  return names.map((vendor, i) => {
    const offers = Array.from({ length: 1 + Math.floor(r() * 2) }, () => { const [good, a, b] = pick(r, OFFERS); return { good, qty: a + Math.floor(r() * (b - a + 1)) }; })
      .filter((o, j, xs) => xs.findIndex(x => x.good === o.good) === j);
    const wants = [...CURRENCY].sort(() => r() - 0.5).slice(0, 3 + Math.floor(r() * 3)).filter(w => !offers.some(o => o.good === w));
    return { id: `st${day}_${i}`, vendor, offers, wants, greed: Math.round((0.9 + r() * 0.4) * 100) / 100 };
  });
}

/** What the crossroads' opinion does to an asking price: 1.1 at −100 … 1 at 20 … 0.8 at 100. */
export function repMarkup(rep: number): number {
  return rep < 20 ? 1 + (20 - rep) / 1200 * 1 : 1 - (rep - 20) / 400;
}
/** Does a stall refuse the family outright (a bad name)? Seeded per stall. */
export function refuses(s: GameState, st: Stall): boolean {
  const m = marketOf(s);
  if (m.banned.includes(st.vendor)) return true;
  if (m.rep > -40) return false;
  const r = mulberry32(s.seed * 7 + st.id.length * 31 + Number(st.id.replace(/\D/g, '')) % 9973);
  return r() < (-m.rep - 20) / 80;
}

const negotiatorOf = (s: GameState, pid: string) => s.people.find(p => p.id === pid)?.skills.negotiator ?? 0;

// ─────────────────────────────────────────────────────────────────────────
// Going
// ─────────────────────────────────────────────────────────────────────────

export function goProblem(s: GameState, pid: string): string | null {
  if (!marketOpen(s)) return 'there\'s no market yet';
  if (!isMarketDay(s)) return `the next market is in ${daysToMarket(s)} days`;
  const m = marketOf(s);
  if (m.trip?.day === dayIndex(s.clock.t)) return 'someone is already at the market';
  const p = s.people.find(x => x.id === pid);
  if (!p || !canGo(s, p) || p.age < 16 || s.scavenge?.run?.team.includes(pid)) return 'they can\'t go';
  return null;
}

/** Send someone to the crossroads for the day (armed or not). */
export function goToMarket(s: GameState, pid: string, armed: boolean): string | null {
  const why = goProblem(s, pid);
  if (why) return why;
  const m = marketOf(s);
  const day = dayIndex(s.clock.t);
  if (m.day !== day) { m.day = day; m.stalls = makeStalls(s, day); }
  m.trip = { day, pid, carried: 0, armed };
  const ps = s.personState.find(x => x.id === pid);
  if (ps) { ps.task = 'away'; ps.target = null; }
  log(s, `${s.people.find(x => x.id === pid)?.first} rode to the crossroads market${armed ? ' with a rifle across the saddle' : ''}.`);
  return null;
}
/** At the market today: off the place. */
export const atMarket = (s: GameState, pid: string) => s.market?.trip?.pid === pid && s.market.trip.day === dayIndex(s.clock.t);

// ─────────────────────────────────────────────────────────────────────────
// Haggling
// ─────────────────────────────────────────────────────────────────────────

export type DealMode = 'honest' | 'generous' | 'cheat';
export interface HaggleResult { ok: boolean; ask: number; offer: number; line: string; caught?: boolean }

/** What the family's offer is worth to this stall (wanted goods in full, others at 60 %). */
export function offerValue(s: GameState, st: Stall, give: readonly MLot[]): number {
  const p = marketPrices(s);
  return give.reduce((a, l) => a + (p[l.good] ?? 0) * l.qty * (st.wants.includes(l.good) ? 1 : 0.6), 0);
}
/** What the stall asks for `qty` of offer `i`. */
export function askPrice(s: GameState, st: Stall, i: number, qty: number, pid?: string): number {
  const o = st.offers[i];
  const p = marketPrices(s);
  const neg = pid ? negotiatorOf(s, pid) : 0;
  return (p[o.good] ?? 0) * qty * st.greed * repMarkup(marketOf(s).rep) * (1 - 0.03 * neg);
}

/**
 * Offer `give` for `qty` of a stall's offer `i`, dealing honest, generous or
 * crooked. Seeded by the day, the stall and the offer.
 */
export function haggle(s: GameState, stallId: string, i: number, qty: number, give: readonly MLot[], mode: DealMode = 'honest'): HaggleResult {
  const m = marketOf(s);
  const day = dayIndex(s.clock.t);
  const trip = m.trip;
  const st = m.stalls.find(x => x.id === stallId);
  const no = (line: string): HaggleResult => ({ ok: false, ask: 0, offer: 0, line });
  if (!trip || trip.day !== day) return no('Nobody from the family is at the market.');
  if (!st) return no('That stall is packed up.');
  if (refuses(s, st)) return no(`${cap(st.vendor)} won't look at you. "Not from you. Go on."`);
  const o = st.offers[i];
  if (!o || qty <= 0 || qty > o.qty) return no('They don\'t have that much.');
  if (!give.some(l => l.qty > 0) || give.some(l => l.qty < 0 || mhave(s, l.good) < l.qty)) return no('You don\'t have that to give.');
  const neg = negotiatorOf(s, trip.pid);
  const ask = askPrice(s, st, i, qty, trip.pid);
  const real = offerValue(s, st, give);
  const r = mulberry32(s.seed * 6007 + day * 11 + i * 97 + Number(stallId.replace(/\D/g, '')) % 9001 + Math.round(real));
  const seen = mode === 'cheat' ? real * 1.3 : real;
  const pay = () => {
    for (const l of give) mmove(s, l.good, -l.qty);
    mmove(s, o.good, qty);
    o.qty -= qty;
    if (o.qty <= 0) st.offers.splice(i, 1);
    trip.carried += ask;
    (trip.bought ??= []).push({ good: o.good, qty });
    m.deals++;
  };
  if (mode === 'cheat') {
    m.cheats++;
    if (r() < Math.max(0.1, 0.35 - 0.03 * neg)) {
      m.rep = clampRep(m.rep - 15); m.banned.push(st.vendor);
      spread(s, -3);
      return { ok: false, ask, offer: real, caught: true, line: `${cap(st.vendor)} unscrewed the cap and smelled it. "You think I was born yesterday?" Everybody at the crossroads heard.` };
    }
  }
  if (seen >= ask) {
    pay();
    if (mode === 'cheat') { if (r() < 0.4) m.exposed.push({ day: day + 7 + Math.floor(r() * 14), vendor: st.vendor }); }
    else if (mode === 'generous' || real >= ask * 1.15) { m.rep = clampRep(m.rep + 4 * (1 - Math.max(0, m.rep) / 120)); spread(s, 1); }
    else m.rep = clampRep(m.rep + 1 * (1 - Math.max(0, m.rep) / 100));
    const line = mode === 'generous' ? `${cap(st.vendor)} looked at what you put down twice. "That's more than fair. I won't forget it."` : pick(r, [`${cap(st.vendor)} spat and shook on it.`, `"Done." ${cap(st.vendor)} counted it twice.`, `A nod, a handshake, and it went in the saddlebags.`]);
    m.history.push({ day, text: `${qty} × ${goodName(o.good)} from ${st.vendor}` });
    if (m.history.length > 12) m.history.splice(0, m.history.length - 12);
    return { ok: true, ask, offer: real, line };
  }
  if (seen >= ask * 0.85 && r() < 0.3 + 0.07 * neg) {
    pay();
    m.rep = clampRep(m.rep + 0.5);
    return { ok: true, ask, offer: real, line: `${cap(st.vendor)} chewed on it a long while. "Fine. But you owe me one."` };
  }
  const metal = give.some(l => l.good.startsWith('metal:gold'));
  return { ok: false, ask, offer: real, line: metal ? `${cap(st.vendor)} turned the gold coin over and handed it back. "What am I going to do with that? Can't eat it, can't shoot it."` : seen >= ask * 0.7 ? `"Close. Not close enough."` : `${cap(st.vendor)} laughed. "Not even close."` };
}

const clampRep = (x: number) => Math.max(-100, Math.min(100, x));
const cap = (x: string) => x[0].toUpperCase() + x.slice(1);
/** Word gets round the neighbors too. */
function spread(s: GameState, d: number): void {
  for (const n of s.neighbors) if (n.status === 'home') n.disposition = Math.max(-100, Math.min(100, n.disposition + d));
}
export function goodName(g: MarketGood): string {
  if (g.startsWith('bag:')) return BAG_BASE[g.slice(4) as BagGood].name.toLowerCase();
  if (g.startsWith('ammo:')) return `${g.slice(5)} rounds`;
  if (g.startsWith('metal:')) return g.slice(6).replace('_', ' ');
  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Once a day
// ─────────────────────────────────────────────────────────────────────────

/** The road home: robbed, or followed. */
export function roadHome(s: GameState, r: () => number): string[] {
  const m = marketOf(s);
  const t = m.trip!;
  const out: string[] = [];
  const p = s.people.find(x => x.id === t.pid), ps = s.personState.find(x => x.id === t.pid);
  m.trip = null;
  if (!p || !ps || ps.needs.died != null) return out;
  if (ps.task === 'away') { ps.task = 'idle'; ps.target = null; }
  const law = s.disaster.tracks.law;
  const robP = (0.03 + 0.12 * (1 - law)) * (t.carried > 200 ? 1.5 : 1) * (t.armed ? 0.5 : 1);
  if (t.carried > 0 && r() < robP) {
    if (t.armed && r() < 0.5) {
      const f = fightAtCamp(s, [p.id], { camp: 2 + Math.floor(r() * 2), temper: 'hard', status: 'traded' }, s.seed * 31 + dayIndex(s.clock.t));
      out.push(`Two men stepped out of the willows at the creek crossing on the way home from the market.`);
      out.push(...applyCasualties(s, f.battle));
      for (const [cal, n] of Object.entries(f.spent) as Array<[Caliber, number]>) s.armory.ammo[cal] = Math.max(0, (s.armory.ammo[cal] ?? 0) - n);
      if (f.result === 'wiped' || f.result === 'routed') { out.push(`${p.first} shot first. Got home with everything.`); return out; }
    }
    // they take the day's buys (as much of them as is still in hand)
    const lost = t.bought ?? [];
    for (const l of lost) mmove(s, l.good as MarketGood, -Math.min(l.qty, mhave(s, l.good as MarketGood)));
    if (!t.armed && r() < 0.3) { ps.needs.hurt.push({ what: 'beaten and robbed on the road', sev: 25, trauma: true }); ps.needs.health = Math.max(1, ps.needs.health - 10); }
    out.push(`${p.first} was robbed on the road home from the market${lost.length ? ' and lost everything the day bought' : ''}.`);
    return out;
  }
  // followed home: somebody wants to know where those goods came from
  const neg = p.skills.negotiator, hunter = p.skills.hunter;
  const follow = Math.max(0.02, 0.08 + (t.carried > 300 ? 0.1 : 0) + 0.01 * Math.min(10, m.deals) - 0.02 * neg);
  if (t.carried > 0 && r() < follow) {
    if (hunter >= 4 && r() < 0.6) out.push(`${p.first} saw a rider hanging back on the county road all the way from the crossroads, and lost him in the timber on the long way round.`);
    else {
      m.heat = Math.min(20, m.heat + 8);
      const day = dayIndex(s.clock.t);
      s.gate.next = s.gate.next < 0 ? day + 4 : Math.min(s.gate.next, day + 3 + Math.floor(r() * 5));
      out.push(`Somebody followed ${p.first} home from the market. Tracks at the end of the drive in the morning, and a cigarette butt.`);
    }
  }
  return out;
}

/** Once a day: the market opens, stalls on market day, the road home, cheats found out, heat fading, invitations. */
export function marketDay(s: GameState): string[] {
  const out: string[] = [];
  if (!s.disaster.kind || s.clock.t < s.disaster.hitAt) return out;
  const m = marketOf(s);
  const day = dayIndex(s.clock.t);
  const r = mulberry32(s.seed * 9127 + day * 7);
  m.heat *= 0.97;
  if (m.trip && m.trip.day < day) out.push(...roadHome(s, r));
  for (const e of m.exposed.filter(x => x.day <= day)) {
    m.rep = clampRep(m.rep - 20);
    if (!m.banned.includes(e.vendor)) m.banned.push(e.vendor);
    spread(s, -5);
    out.push(`Word got round: ${e.vendor} says the family cheated them at the market. People are talking.`);
  }
  m.exposed = m.exposed.filter(x => x.day > day);
  if (!marketOpen(s)) return out;
  if (m.opened < 0) {
    m.opened = day;
    out.push('There\'s a market at the crossroads now, Saturdays by the old Grange hall. Ammunition, salt and coffee are the money; nobody wants paper.');
    s.disaster.news.push({ t: s.clock.t, text: 'A market at the crossroads, Saturdays: barter only.', tone: 1 });
  }
  if (day % 7 === MARKET_WEEKDAY && m.day !== day) { m.day = day; m.stalls = makeStalls(s, day); }
  // a good name: the co-op asks the family in
  const L = s.locals;
  if (L && L.group && !L.member && !L.invited && m.rep >= 40) { L.invited = true; out.push(`People at the crossroads speak well of the family. ${cap(L.group.name)} sent word: you'd be welcome.`); }
  return out;
}
