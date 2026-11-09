/**
 * Thirst (decided with the user: "Hand pump + real thirst"). Pure.
 *
 * Drinking water comes first: when the day's water runs short, the garden
 * and the washing go without before anyone's cup does (utilities.ts counts
 * the shortfall; this takes it out of the non-drinking use first). What is
 * left for drinking is shared out evenly.
 *
 * Dehydration is tracked as the share of body weight lost to it
 * (`Needs.dry`, %). With nothing to drink a resting adult loses about 3 % a
 * day in mild weather, 5 % in a heat wave; children and the elderly lose it
 * faster. Thirst and a headache by 2 %, weak and dizzy by 5 %, confused and
 * failing by 10 %, dead at about 15 %: three to five days with no water,
 * two or three in the heat (Sawka et al., ACSM position stand on fluid
 * replacement; wilderness-medicine survival estimates). About 70 % of the
 * daily ration (some 2.8 L for an adult) holds a person steady at rest;
 * drinking again brings it back within a day or two.
 */
import type { GameState } from './state';
import type { Needs } from './needs';
import type { Person } from './family';
import { calendarOf, dayIndex } from './state';
import { DRINK_L } from './water';
import { frailty } from './cold';

/** Body weight lost a day with nothing to drink (%, a resting adult in mild weather), and when it kills. */
export const DRY_LOSS_PER_DAY = 3, DRY_FATAL = 15;
/** Share of the drinking ration that holds a person steady. */
export const HOLD_SHARE = 0.7;

/** A heat wave on today (weatherThreats.ts). */
export function heatWave(s: GameState): boolean {
  const a = s.weather?.active, day = dayIndex(s.clock.t);
  return !!a && a.kind === 'heat_wave' && day >= a.at && day <= a.until;
}

/** How hard the day is on the body's water: a heat wave, a desert summer. */
export function heatFactor(s: GameState): number {
  if (heatWave(s)) return 1.7;
  const doy = calendarOf(s.clock).doy;
  return s.site.region === 'desert' && doy >= 150 && doy <= 250 ? 1.3 : 1;
}

/** One person's drinking and cooking water a day (L): more in the heat. */
export function drinkNeedL(p: Pick<Person, 'age' | 'kid'>, heat = 1): number {
  return (p.kid ? (p.age < 3 ? 1.2 : 2.5) : DRINK_L) * heat;
}

/** Share (0–1) of everyone's drinking water there was today: the shortfall comes out of washing and the garden first. */
export function drinkShare(s: GameState): number {
  const r = s.utilities.report;
  if (r.shortL <= 0) return 1;
  const heat = heatFactor(s);
  const living = s.people.filter((_, i) => s.personState[i]?.needs.died == null);
  const need = living.reduce((a, p) => a + drinkNeedL(p, heat), 0);
  if (need <= 0) return 1;
  // the use the balance counted that isn't drinking (washing, the garden, the hens); the heat's extra drinking wasn't counted at all
  const other = Math.max(0, r.useL - living.length * DRINK_L);
  const extra = Math.max(0, need - living.length * DRINK_L);
  const short = Math.max(0, Math.min(need, r.shortL - other + extra));
  return 1 - short / need;
}

const WHAT = ['thirsty: water rationed', 'dehydrated: weak, dizzy', 'severely dehydrated: confused, failing'];
export const isThirstHurt = (what: string) => WHAT.includes(what);

/** Work rate from dehydration (the thirsty get less done; weak within a day without water). */
export function dryWork(n: Pick<Needs, 'dry'>): number {
  const d = n.dry ?? 0;
  return d <= 2 ? 1 : Math.max(0.2, 1 - (d - 2) * 0.12);
}

/** One person's day of drinking: returns the change to health today (needs.ts adds it); morale, the Family tab entry. */
export function thirstDay(p: Person, n: Needs, share: number, heat: number, cozy: boolean, out: string[]): number {
  const d0 = n.dry ?? 0, f = frailty(p, 'thirst');
  const loss = DRY_LOSS_PER_DAY * Math.max(0, 1 - share / HOLD_SHARE) * heat * f;
  const back = share >= HOLD_SHARE ? 6 * Math.min(1, (share - HOLD_SHARE) / (1 - HOLD_SHARE)) : 0;
  const d = n.dry = Math.max(0, d0 + loss - back);
  if (share < 1) n.morale -= 1.5;
  if (d >= 5) n.morale -= 2;
  n.hurt = n.hurt.filter(h => !isThirstHurt(h.what));
  if (d >= 1) n.hurt.push({ what: WHAT[d >= 10 ? 2 : d >= 5 ? 1 : 0], sev: Math.min(100, Math.round(d * 6.5)) });
  if (d >= 5 && d0 < 5) out.push(`${p.first} is dehydrated: weak, dizzy, a pounding head. They need water within days.`);
  if (d >= 10 && d0 < 10) out.push(`${p.first} is badly dehydrated and confused. Without water they will die.`);
  if (d >= DRY_FATAL && !cozy) return -1000;
  return -Math.max(0, d - 2) * 2.5;
}
