/**
 * Cozy's later years: where a rich peacetime family's money goes (user
 * decision: "property tax, insurance and a comfort tier, so Cozy does not end
 * with $1M+ idle"). Cozy only (`disaster.difficulty === 'cozy'`, read directly like the starvation rule), so Standard and
 * Hardcore are untouched. Pure (tested).
 *
 *  Reassessment  from the third year the county reappraises the place: property tax and
 *                the insurance premium climb 10 % a year, to 1.8x.
 *  Comfort tier  Plain (nothing) / Comfortable ($1,200 a month per grown person, a child
 *                half) / Gracious ($3,500): help in the house, good food, a trip now and
 *                then. It lifts everyone's morale while it is paid (+1.5 / +2.5 strain
 *                points, a little under a garden and a pond together) and costs only
 *                while the county and the stores work. Unless the player sets it, the
 *                family lives as the savings allow, from the second year: Gracious from
 *                $300,000 in the bank, Comfortable from $90,000.
 */
import { dayIndex, type GameState } from './state';

export type ComfortTier = 'plain' | 'comfortable' | 'gracious';
export const COMFORT: Record<ComfortTier, { name: string; perMonth: number; morale: number; blurb: string }> = {
  plain: { name: 'Plain', perMonth: 0, morale: 0, blurb: 'Groceries and the bills; nothing more.' },
  comfortable: { name: 'Comfortable', perMonth: 1200, morale: 1.5, blurb: 'Help with the heavy cleaning, good food, a weekend away now and then.' },
  gracious: { name: 'Gracious', perMonth: 3500, morale: 2.5, blurb: 'Hired help, the best of everything, a trip each season.' },
};
export const AUTO_COMFORTABLE = 90_000, AUTO_GRACIOUS = 300_000, AUTO_FROM_DAY = 365, REASSESS_FROM_YEAR = 2, REASSESS_STEP = 0.1, REASSESS_MAX = 1.8;

/** Does this run have the later-years sinks (Cozy)? */
export const hasEstate = (s: GameState): boolean => s.disaster.difficulty === 'cozy';

/** Tax and premium multiplier: 1 until year three, then +10 % a year. */
export function estateFactor(s: GameState): number {
  if (!hasEstate(s)) return 1;
  const years = (s.stats?.days ?? 0) / 365;
  return Math.min(REASSESS_MAX, 1 + REASSESS_STEP * Math.max(0, Math.floor(years) - REASSESS_FROM_YEAR + 1));
}

/** The services the tier pays for are running (the county, the banks and the stores). */
const servicesRun = (s: GameState): boolean => s.disaster.tracks.banks >= 0.5 && s.disaster.tracks.stores >= 0.5 && s.disaster.tracks.law >= 0.5;

/** The tier in force: the player's choice, or (unset) what the savings allow from the second year. */
export function comfortTier(s: GameState): ComfortTier {
  if (!hasEstate(s)) return 'plain';
  const set = s.paper.comfort;
  if (set) return set;
  if ((s.stats?.days ?? 0) < AUTO_FROM_DAY) return 'plain';
  return s.money >= AUTO_GRACIOUS ? 'gracious' : s.money >= AUTO_COMFORTABLE ? 'comfortable' : 'plain';
}

/** Grown-person equivalents at the table (a child counts half). */
export function tableUnits(s: GameState): number {
  let u = 0;
  s.people.forEach((p, i) => { const n = s.personState[i]?.needs; if (n && n.died == null && !n.left && !n.taken) u += p.kid ? 0.5 : 1; });
  return u;
}

/** What the tier costs a month right now (0 when it is not running). */
export const comfortMonthly = (s: GameState, tier = comfortTier(s)): number => Math.round(COMFORT[tier].perMonth * tableUnits(s));

/** Morale from the tier, while it is being paid for. */
export const comfortTierMorale = (s: GameState): number => (hasEstate(s) && servicesRun(s) ? COMFORT[comfortTier(s)].morale : 0);

/** Once a day: pay the tier (a thirtieth of the month). Returns nothing to say; the Paperwork card shows it. */
export function estateDay(s: GameState): void {
  if (!hasEstate(s) || !servicesRun(s)) return;
  const cost = comfortMonthly(s) / 30;
  if (cost > 0 && dayIndex(s.clock.t) >= 0) s.money -= cost;
}
