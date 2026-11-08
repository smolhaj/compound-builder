/**
 * What else a raid does (user decision 5), as plain data the battle rolls and the aftermath reads. Pure and seeded.
 *
 *   loot      specific items lost, not a flat share of the stores: what the crew wants first (a gang guns and ammunition, hungry looters food and
 *             medicine), what it can reach (the yard if it only holds the yard, the house if it is overrun), what it can carry (heads, and a truck).
 *   arson     hostile crews burn: sheds, barns and coops, and a house they have overrun. The fire is a state on the place (sim/raidFire.ts): it
 *             spreads and the family has to fight it.
 *   hostages  a captive taken is a hostage (sim/rescue.ts holds the record, the radio and the ransom bring them back).
 *   parley    a crew that has been hurt but is not broken may offer terms mid-fight: tribute (a share of the stores for leaving) or passage
 *             (let them through to somewhere else). The family answers by how the fight is going.
 */
import { ANIMALS } from './livestock';
import type { CrewKind } from './surrender';
import type { Disposition } from './crewMercy';

export type LootFrom = 'yard' | 'house';
export interface LootItem { what: string; n: number; from: LootFrom }

/** What each kind of crew goes for, best first; `from` says where it sits. */
const WANT: Record<CrewKind, string[]> = {
  gang: ['ammo', 'guns', 'fuel', 'meds', 'canned', 'staples', 'animals'],
  militia: ['canned', 'staples', 'fuel', 'ammo', 'animals', 'meds', 'guns'],
  patrol: ['ammo', 'guns', 'meds', 'fuel', 'canned', 'staples', 'animals'],
  requisition: ['canned', 'staples', 'frozen', 'animals', 'fuel', 'fresh', 'meds'],
  looters: ['canned', 'meds', 'staples', 'fuel', 'frozen', 'ammo', 'guns', 'animals'],
  refugees: ['canned', 'staples', 'fresh', 'meds', 'frozen', 'animals'],
  tunnelers: ['ammo', 'guns', 'canned', 'meds', 'staples', 'fuel', 'animals'],
  horde: [],
  other: ['canned', 'staples', 'meds', 'fuel', 'ammo', 'animals'],
};
const WHERE: Record<string, LootFrom> = { animals: 'yard', fuel: 'yard', fresh: 'yard', canned: 'house', staples: 'house', frozen: 'house', meds: 'house', ifak: 'house', ammo: 'house', guns: 'house' };
/** Items in a "load" (what one man carries out in a night). */
const LOAD: Record<string, number> = { canned: 6, staples: 4, frozen: 3, fresh: 5, fuel: 3, meds: 2, ifak: 3, animals: 1, ammo: 400, guns: 2 };

export interface LootCtx {
  kind: CrewKind;
  men: number;
  truck: boolean;
  /** The furthest the crew got: the yard, or the house. */
  reached: 'yard' | 'house';
  /** The share of what is reachable the crew takes (0.3 breached, 0.6 overrun, 0.9 savage in the old model: now the ceiling). */
  share: number;
}
/** What is on the place to be taken (counts; `animals` is the sum over species, `ammo` the rounds, `guns` the unattended). */
export type Holdings = Record<string, number>;

/**
 * The loot: for each wanted item in order, the share of what is there and reachable, up to what the crew can carry. The same crew in the same
 * place always takes the same things (no draw but the greed of the night, `r`).
 */
export function planLoot(have: Holdings, c: LootCtx, r: () => number): LootItem[] {
  const out: LootItem[] = [];
  let loads = Math.max(1, Math.round(c.men * 0.8)) + (c.truck ? 4 : 0);
  for (const what of WANT[c.kind] ?? WANT.other) {
    const from = WHERE[what];
    if (!from || loads <= 0) continue;
    const reach = from === 'yard' ? 1 : c.reached === 'house' ? 1 : 0.15;   // a crew that holds only the yard gets at the cellar and the pantry through the windows, at most
    const n = Math.floor((have[what] ?? 0) * Math.min(1, c.share * reach * (0.8 + 0.4 * r())));
    if (n <= 0) continue;
    const per = LOAD[what] ?? 3, take = Math.min(n, Math.ceil(loads * per));
    loads -= take / per;
    if (take > 0) out.push({ what, n: take, from });
  }
  return out;
}

/** What is on the place, from a game's stock and armory (the keys `planLoot` knows). */
export function holdingsOf(s: { stock: Record<string, number | undefined>; armory?: { ammo: Record<string, number | undefined>; guns: Array<{ carrier?: string | null }> } }): Holdings {
  const h: Holdings = {};
  for (const k of ['canned', 'staples', 'frozen', 'fresh', 'fuel', 'meds', 'ifak']) h[k] = Math.floor(s.stock[k] ?? 0);
  h.animals = ANIMALS.reduce((a, k) => a + Math.floor(s.stock[k] ?? 0), 0);
  if (s.armory) { h.ammo = Object.values(s.armory.ammo).reduce<number>((a, v) => a + (v ?? 0), 0); h.guns = s.armory.guns.filter(g => !g.carrier).length; }
  return h;
}

// ── arson ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Structure kinds that do not burn (stone, steel, concrete, below ground). */
export const FIREPROOF = /^(bunker|root_cellar|stone|concrete|vault|water_tank|cistern|well|tower_steel|container|safe)/;
/** The chance a hostile crew torches one reachable structure (a merciful one almost never; a house only when it has been overrun). */
export function arsonOdds(d: Disposition, temper: 'desperate' | 'hard' | 'savage', home: boolean, overrun: boolean): number {
  if (d === 'merciful') return home ? 0 : 0.02;
  const base = temper === 'savage' ? 0.5 : 0.28;
  return home ? (overrun ? base * 0.7 : 0) : base;
}

// ── parley ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ParleyCtx {
  disposition: Disposition;
  temper: 'desperate' | 'hard' | 'savage';
  kind: CrewKind;
  /** The share of the crew down or run (0-1), and the share of the family down. */
  crewLoss: number;
  familyLoss: number;
  /** The leader is alive and in the fight. */
  leaderUp: boolean;
  /** The family's ammunition left, 0-1. */
  ammo: number;
  /** A calm voice in the house (negotiator skill 0-10). */
  negotiator: number;
  /** Difficulty talk multiplier (sim/difficulty.ts `talk`). */
  talk: number;
}
export type ParleyOffer = 'tribute' | 'passage';

/** Would the crew offer terms instead of running or fighting on? Never a savage crew or a horde; likelier from a hurt, disciplined one. */
export function parleyOffer(c: ParleyCtx, r: () => number): ParleyOffer | null {
  if (c.temper === 'savage' || c.kind === 'horde' || !c.leaderUp) return null;
  if (c.crewLoss < 0.2 || c.crewLoss > 0.6) return null;
  const disciplined = c.kind === 'militia' || c.kind === 'patrol' || c.kind === 'requisition' ? 1.2 : c.kind === 'gang' ? 0.5 : 0.9;
  if (r() >= 0.35 * disciplined * c.talk) return null;
  return c.kind === 'militia' || c.kind === 'patrol' ? (r() < 0.55 ? 'passage' : 'tribute') : 'tribute';
}
/** Does the family take the terms? When it is hurt, short of ammunition, or has a good talker; refuses when it is winning. */
export function parleyAccepted(c: ParleyCtx, r: () => number): boolean {
  const need = 0.15 + c.familyLoss * 0.9 + (1 - c.ammo) * 0.5 + c.negotiator * 0.04 - Math.max(0, 0.45 - c.crewLoss) * 0.2;
  return r() < Math.max(0.05, Math.min(0.92, need * c.talk));
}
/** The tribute: a share of food and fuel. Passage costs nothing but a little trust. */
export const TRIBUTE_SHARE = 0.15;
