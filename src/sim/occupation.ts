/**
 * Shared rules of a country at war with itself or under a foreign flag (WP3, docs/scenarios/civil_war.md and invasion.md). Pure: no state
 * and no rendering; `sim/disasters/civil_war.ts`, `invasion.ts` and `sim/orderEncounters.ts` call these with numbers.
 *
 *   front       a weekly holder of the town (85% stays, 15% flips; a flip is 3-7 contested days with grid and phone down)
 *   tiers       the occupation clock: tier 1 at the hit, tier 2 at day 60-90, tier 3 at day 150-240; difficulty caps it
 *   requisition every 14 days (7 on Hardcore) a share of the visible stores; search rolls find caches (0.1, 0.35 with an informant)
 *   draft       18-45 for the war, one adult per household for forced labor in tier 3; comply / hide / pay / resist
 *   checkpoint  toll, papers, forged papers, the pass that lasts 30 days
 *   currency    the occupier's decree and the war's scrip as price levels
 */
import type { Difficulty } from './difficulty';
import type { RegionId } from './regions';

export type Faction = 'compact' | 'alliance';
export const FACTION: Record<Faction, { name: string; short: string; colors: string; money: string }> = {
  compact: { name: 'the Cascade Compact', short: 'Compact', colors: 'green-gray', money: 'Compact dollars' },
  alliance: { name: 'the Plains Alliance', short: 'Alliance', colors: 'red-brown', money: 'Alliance marks' },
};
export const otherFaction = (f: Faction): Faction => (f === 'compact' ? 'alliance' : 'compact');

/** Chance the Plains Alliance holds the town at the hit, by region (docs/scenarios/civil_war.md section 6). */
export const ALLIANCE_LEAN: Record<RegionId, number> = {
  mountain_west: 0.5, appalachia: 0.5, desert: 0.5, north_woods: 0.4, plains: 0.85, pnw: 0.12, upper_midwest: 0.5, new_england: 0.2, ozarks: 0.5, hill_country: 0.8, rust_belt: 0.5,
};
export const rollHolder = (r: () => number, region: RegionId): Faction => (r() < (ALLIANCE_LEAN[region] ?? 0.5) ? 'alliance' : 'compact');

// ── the front line ─────────────────────────────────────────────────────────────────────────────

export interface Front {
  holder: Faction;
  /** Days of the contest left (grid and phone are down); 0 = settled. The holder changes to `to` when it ends. */
  contested: number;
  to?: Faction;
  /** The game day of the last weekly roll. */
  lastRoll: number;
  flips: number;
}
export const FRONT = { WEEK: 7, STAY: 0.85, STAY_PARTITION: 0.97, DIP: [3, 7] as [number, number], DIP_LEVEL: 0.1 } as const;

export const newFront = (holder: Faction, day: number): Front => ({ holder, contested: 0, lastRoll: day, flips: 0 });

/** Advance the front one day. Returns what happened. Pure: mutates the draft it is given. */
export function stepFront(f: Front, day: number, r: () => number, stay: number = FRONT.STAY): 'none' | 'contest' | 'flipped' {
  if (f.contested > 0) {
    f.contested--;
    if (f.contested === 0 && f.to) { f.holder = f.to; f.to = undefined; f.flips++; return 'flipped'; }
    return 'none';
  }
  if (day - f.lastRoll < FRONT.WEEK) return 'none';
  f.lastRoll = day;
  if (r() < stay) return 'none';
  f.to = otherFaction(f.holder);
  f.contested = FRONT.DIP[0] + Math.floor(r() * (FRONT.DIP[1] - FRONT.DIP[0] + 1));
  return 'contest';
}

/** Multipliers that pull a track down to `level` (the serviceMods hook multiplies the current track). */
export const dipTo = (current: number, level: number): number => (current > level ? level / current : 1);

// ── the occupation clock ───────────────────────────────────────────────────────────────────────

export interface TierClock { t2: number; t3: number }
export const TIER_NAME: Record<1 | 2 | 3, string> = { 1: 'checkpoints and requisitions', 2: 'curfew and papers', 3: 'informants and forced labor' };
/** Standard reaches tier 3 a quarter later than Hardcore (the pulpy kinds are always `never`, so the fate alone would put them level). */
export function rollTierClock(r: () => number, d: Difficulty = 'hardcore'): TierClock {
  return { t2: 60 + Math.floor(r() * 31), t3: 150 + Math.floor(r() * 91) + (d === 'standard' ? 90 : 0) };
}
/** The highest tier this run reaches: Cozy stays at 1; the soft variant never reaches 3; Standard reaches 3 only when nobody is coming; Hardcore always. */
export function maxTier(difficulty: Difficulty, variant: string, fate: 'full' | 'partial' | 'never'): 1 | 2 | 3 {
  if (difficulty === 'cozy') return 1;
  if (variant === 'soft') return 2;
  if (difficulty === 'hardcore') return 3;
  return fate === 'never' ? 3 : 2;
}
export function tierAt(day: number, c: TierClock, max: 1 | 2 | 3): 1 | 2 | 3 {
  const t = day >= c.t3 ? 3 : day >= c.t2 ? 2 : 1;
  return Math.min(t, max) as 1 | 2 | 3;
}
/** Curfew: 8 p.m. to 5 a.m., from tier 2. */
export const CURFEW = { from: 20, to: 5 } as const;
export const inCurfew = (hour: number): boolean => hour >= CURFEW.from || hour < CURFEW.to;

// ── requisition ────────────────────────────────────────────────────────────────────────────────

export type WarKind = 'civil_war' | 'invasion';
export const REQ = { CADENCE: 14, FIRST: 14, SEARCH: 0.1, SEARCH_INFORMANT: 0.35, SHORT_WEIGHT: 0.6 } as const;
export const cadenceDays = (d: Difficulty): number => (d === 'hardcore' ? REQ.CADENCE / 2 : REQ.CADENCE);
export const requisitionDue = (day: number, last: number, d: Difficulty, first: number = REQ.FIRST): boolean => (last < 0 ? day >= first : day - last >= cadenceDays(d));
/** The share of visible stores a quota asks: war 10-20%, occupation 10-25% (more each tier); Cozy halves it. */
export function requisitionShare(kind: WarKind, tier: number, d: Difficulty, u: number): number {
  const [lo, hi] = kind === 'civil_war' ? [0.1, 0.2] : [0.1, 0.1 + 0.05 * (1 + tier)];
  const share = lo + (hi - lo) * u;
  return Math.round(share * (d === 'cozy' ? 0.5 : 1) * 1000) / 1000;
}
export const QUOTA_GOODS = ['staples', 'canned', 'fresh', 'frozen', 'fuel'] as const;
export type QuotaGood = typeof QUOTA_GOODS[number];
export function quotaOf(stock: Record<string, number>, share: number): Partial<Record<QuotaGood, number>> {
  const out: Partial<Record<QuotaGood, number>> = {};
  for (const g of QUOTA_GOODS) { const n = Math.floor((stock[g] ?? 0) * share); if (n > 0) out[g] = n; }
  return out;
}
/** The chance a visit finds hidden stock: 0.1, 0.35 with a neighbor informing; a cellar or false wall (`conceal` 0-1) halves it at best. */
export const searchChance = (informant: boolean, conceal: number): number => (informant ? REQ.SEARCH_INFORMANT : REQ.SEARCH) * (1 - 0.5 * Math.max(0, Math.min(1, conceal)));
export const searchRoll = (informant: boolean, conceal: number, r: () => number): boolean => r() < searchChance(informant, conceal);
/** A short-weighted quota is caught about this often (the quartermaster counts): more with an informant, in a higher tier. */
export const shortWeightCaught = (informant: boolean, tier: number): number => Math.min(0.85, 0.3 + (informant ? 0.25 : 0) + 0.08 * (tier - 1));

// ── reprisals ──────────────────────────────────────────────────────────────────────────────────

export const REPRISAL = { P: 0.3, MILES: 3 } as const;
/** An ambush within 3 miles: a hostage roll (p 0.3); the toll in neighbors shot grows with the tier. */
export function reprisal(miles: number, tier: number, r: () => number): { hostages: number; burn: boolean } {
  if (miles > REPRISAL.MILES || r() >= REPRISAL.P) return { hostages: 0, burn: false };
  const hostages = 3 + Math.floor(r() * (3 + 2 * tier));
  return { hostages, burn: tier >= 3 && r() < 0.4 };
}

// ── the draft ──────────────────────────────────────────────────────────────────────────────────

export interface DraftPerson { age: number; kid: boolean; male: boolean }
export const DRAFT = { MIN: 18, MAX: 45, LABOR_MAX: 35, LABOR_DAYS: 60, HIDE_FOUND: 0.1, LEAVE_DAY: 60 } as const;
/** Is this person on the list? The war: men 18-45 (women too once the war has gone on 120 days with nobody coming); the labor draft: any adult 18-35. Cozy has no war draft. */
export function draftable(p: DraftPerson, o: { kind: WarKind; difficulty: Difficulty; fate: 'full' | 'partial' | 'never'; day: number }): boolean {
  if (p.kid) return false;
  if (o.kind === 'civil_war') {
    if (o.difficulty === 'cozy' || p.age < DRAFT.MIN || p.age > DRAFT.MAX) return false;
    return p.male || (o.fate === 'never' && o.day >= 120);
  }
  return p.age >= DRAFT.MIN && p.age <= DRAFT.LABOR_MAX;
}
/** The price of a way out: silver ounces (2-4) or dollars ($2,000 early, $3,500 after day 60; an occupation officer asks the same in dollars, $4,000 in silver terms). */
export function draftPrice(kind: WarKind, day: number, u: number): { silver: number; usd: number } {
  const silver = 2 + Math.floor(u * 3);
  return { silver: kind === 'invasion' ? 4 : silver, usd: day < 60 ? 2000 : 3500 };
}
/** A drafted man's fate: leave at day 60 (he comes home on leave, half the time) or never. Returns the day offset he returns, or null. */
export function returnOffset(kind: WarKind, r: () => number): number | null {
  if (kind === 'invasion') return DRAFT.LABOR_DAYS;
  return r() < 0.5 ? DRAFT.LEAVE_DAY + Math.floor(r() * 21) : null;
}

// ── checkpoints ────────────────────────────────────────────────────────────────────────────────

export const CHECKPOINT = { TOLL: 0.05, PASS_DAYS: 30, FORGED_OK: 0.6, SELF_FORGED_OK: 0.4, FORGED_USD: 800, FORGED_USD_WAR: 3000, BRIBE_USD: 500 } as const;
/** A toll of 5% of what is carried (at least 1). */
export const tollOn = (load: number, pct: number = CHECKPOINT.TOLL): number => Math.max(1, Math.ceil(load * pct));
/** Papers shown at the post: a held pass always works; honest papers from a home-county family usually; none gets turned back. */
export function papersOdds(o: { pass: boolean; homeCounty: boolean; tier: number; informantsK?: number }): number {
  if (o.pass) return 1;
  const base = o.homeCounty ? 0.7 : 0.35;
  return Math.max(0.1, base - 0.1 * (o.tier - 1) - (o.informantsK ?? 0) * 0.2);
}

// ── snipers and informants ─────────────────────────────────────────────────────────────────────

export const SNIPER = { P_HOUR: 0.02 } as const;
/** Chance someone working outdoors is hit in a day: 0.02 an hour in the arc, `cover` (0-1: berms, covered paths, a wall) cuts it. */
export const sniperDayChance = (outdoorHours: number, cover: number): number => 1 - Math.pow(1 - SNIPER.P_HOUR * (1 - Math.max(0, Math.min(1, cover))), Math.max(0, outdoorHours));
/** Share of neighbors who take pay: 1 in 8 (tier 1-2), 1 in 5 in tier 3; a watched phone adds a little. */
export const informantFraction = (tier: number, phoneWatched: boolean): number => (tier >= 3 ? 0.2 : 0.125) + (phoneWatched ? 0.025 : 0);
export const hashUnit = (seed: number, key: string): number => {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
};
/** Who informs: stable per (seed, neighbor id). */
export const isInformant = (seed: number, id: string, fraction: number): boolean => hashUnit(seed, `inf:${id}`) < fraction;
/** A neighbor flying the other flag informs on you with p 0.15 a day (the war's informant roll). */
export const WAR_INFORM_P = 0.15;

// ── money ──────────────────────────────────────────────────────────────────────────────────────

/** The occupier's decree: old dollars at half from day 10, a quarter from day 60. */
export const cashMultiplier = (day: number): number => (day < 10 ? 1 : day < 60 ? 0.5 : 0.25);
/** The price level that decree adds on top of scarcity (half of the full 1/multiplier so a shelf of silver still buys something). */
export const decreePrice = (day: number): number => 1 + (1 / cashMultiplier(day) - 1) * 0.5;
/** The war's scrip and shortage as a price level (rises over the first month, higher while the front is contested). */
export const warPrice = (day: number, contested: boolean): number => 1 + 0.5 * Math.min(1, Math.max(0, day) / 30) + (contested ? 0.2 : 0);

// ── how people speak ───────────────────────────────────────────────────────────────────────────

/** Untrained civilians: short, broken lines. */
export const SCARED_LINES = ['Please. Not mine. Kids in the car.', 'We have papers. Please. Our daughter is sick.', 'They took my husband. He didn\'t do anything.', 'I don\'t want any trouble. I only want to know.', 'Please. Just the water. Then we\'re gone.'];
/** The occupier: formal. */
export const OCCUPIER_LINES = ['You will provide the quantities listed by Friday.', 'Your papers. All of the household.', 'Receipts are issued in occupation money.', 'The curfew is posted. It will be enforced.'];
/** Deserters: clipped, flat. */
export const DESERTER_LINES = ['Keys. Now.', 'We don\'t want a fight. Food, fuel, and we go.', 'Nobody\'s coming for us. Nobody\'s coming for you.'];
