/**
 * The asteroid's arc and the ground it hits (docs/scenarios/asteroid.md). Pure. A public, numeric, escalating warning: discovery, odds that
 * creep up, a confirmed zone and a corridor that narrows so the player chooses stay or move; an interceptor that may fail, shift or
 * (rarely) save the day; then blast bands by distance and the shared winter by variant.
 */
import type { RegionId } from './regions';
import { mulberry32 } from './rng';
import type { Difficulty } from './difficulty';

export type ImpactVariant = 'airburst' | 'ocean' | 'land' | 'comet';
export type ImpactBand = 'near' | 'regional' | 'far';
export type Deflection = 'none' | 'shift' | 'success';

/** (latitude N, longitude W as negative) of each region's homestead country (doc section 6). */
export const REGION_CENTER: Record<RegionId, [number, number]> = {
  pnw: [47, -122], mountain_west: [45, -112], desert: [34, -108], plains: [40, -99], ozarks: [37, -92], hill_country: [30, -98], upper_midwest: [44, -87], north_woods: [47, -91], rust_belt: [40.5, -80], appalachia: [36, -83], new_england: [44, -72],
};
export interface Zone { name: string; where: [number, number] }
export const ZONES: Record<'ocean' | 'land' | 'comet', Zone[]> = {
  ocean: [{ name: 'the North Atlantic', where: [45, -40] }, { name: 'the Pacific', where: [40, -135] }, { name: 'the Gulf of Mexico', where: [25, -90] }],
  land: [{ name: 'the Great Plains, eastern Montana to western Nebraska', where: [43, -102] }, { name: 'the Mississippi valley', where: [37, -90] }],
  comet: [{ name: 'a line from Oregon to the Dakotas', where: [44, -112] }, { name: 'a track across the Ohio valley', where: [39, -84] }],
};

export const milesBetween = (a: [number, number], b: [number, number]): number => {
  const R = 3959, rad = Math.PI / 180, dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
export const bandOf = (miles: number): ImpactBand => (miles < 300 ? 'near' : miles < 1500 ? 'regional' : 'far');

export interface Impact { variant: ImpactVariant; zone: string; miles: number; band: ImpactBand; deflection: Deflection; launch: number; winter: number }
/** Winter severity by variant (the shared engine). */
export const WINTER_SEVERITY: Record<ImpactVariant, number> = { airburst: 0, ocean: 0.4, land: 1, comet: 0.7 };

/** Roll the impact once from the seed: variant (Cozy drops `land`), the zone, the distance, whether a deflection works. */
export function rollImpact(seed: number, region: RegionId, difficulty: Difficulty): Impact {
  const r = mulberry32(seed * 7001 + 17);
  const w: Array<[ImpactVariant, number]> = [['airburst', 3], ['ocean', 2], ['land', difficulty === 'cozy' ? 0 : 2], ['comet', 1]];
  const tot = w.reduce((a, [, x]) => a + x, 0);
  let u = r() * tot, variant: ImpactVariant = 'airburst';
  for (const [v, x] of w) { u -= x; if (u <= 0) { variant = v; break; } }
  let zone = 'a thinly settled county', miles: number;
  if (variant === 'airburst') miles = r() < 0.25 ? 5 + 85 * r() : 400 + 2200 * r();
  else {
    const list = ZONES[variant], z = list[Math.floor(r() * list.length)];
    zone = z.name; miles = milesBetween(REGION_CENTER[region], z.where) * (variant === 'comet' ? 0.8 + 0.4 * r() : 1);
  }
  const roll = r(), p = difficulty === 'cozy' ? 0.05 : difficulty === 'hardcore' ? 0 : 0.02;
  const deflection: Deflection = roll < p ? 'success' : roll < p + 0.25 * 0.4 ? 'shift' : 'none';
  return { variant, zone, miles: Math.round(miles), band: bandOf(miles), deflection, launch: -(30 + Math.floor(40 * r())), winter: WINTER_SEVERITY[variant] };
}

export type ArcStage = 'quiet' | 'discovery' | 'odds' | 'confirmed' | 'interceptor' | 'public' | 'visible';
export interface Arc { stage: ArcStage; odds: number; line: string; corridorMi: number | null }
/** What the public knows `daysLeft` before the impact. Odds climb from 1 in 400 to certainty at -100; the corridor halves every 30 days after. */
export function arcAt(daysLeft: number, imp: Impact, hardcoreScale = 1): Arc {
  const d = daysLeft / Math.max(0.1, hardcoreScale);
  if (d > 200) return { stage: 'quiet', odds: 0, line: '', corridorMi: null };
  const odds = d >= 150 ? 1 / 400 : d >= 100 ? Math.min(0.98, (1 / 400) * Math.pow(400, (150 - d) / 50 * 0.9)) : 1;
  const stage: ArcStage = d >= 150 ? 'discovery' : d > 100 ? 'odds' : d > -imp.launch ? 'confirmed' : d > 3 ? 'interceptor' : 'visible';
  const oddsText = odds >= 1 ? '100%' : odds < 0.05 ? `1 in ${Math.round(1 / odds)}` : `${Math.round(odds * 100)}%`;
  const corridorMi = d > 100 ? null : Math.round(1500 * Math.pow(0.6, (100 - d) / 30) + 40);
  let line = stage === 'discovery' ? `Astronomers are tracking a new object: odds of impact ${oddsText}.` : stage === 'odds' ? `The odds of impact are now ${oddsText} and still climbing.` : `NASA: ${oddsText}. Impact zone: ${imp.variant === 'airburst' ? 'a corridor across the interior states' : imp.zone}.`;
  if (stage === 'interceptor') line = imp.deflection === 'none' ? 'The interceptor is on its way. Engineers are not hopeful.' : 'The interceptor is on its way; early tracking shows the object has moved.';
  if (stage === 'visible') line = imp.variant === 'comet' ? 'The comet is a long smudge in the evening sky.' : 'There is nothing to see yet.';
  return { stage, odds, line, corridorMi };
}

/** Hazard (chance of state >= 1) at the compound by blast band. Airburst: the overpressure table in miles; others by the corridor band. */
export function blastHazard(variant: ImpactVariant, miles: number): number {
  if (variant === 'airburst') return miles < 6 ? 1 : miles < 12 ? 0.7 : miles < 25 ? 0.4 : miles < 60 ? 0.2 : 0.03;
  const b = bandOf(miles);
  return b === 'near' ? 1 : b === 'regional' ? 0.35 : 0.03;
}

/** Shop price scalar by days to impact: the panic curve (1.1 at confirm, 1.25 at -20, 1.45 at -3), then supply-driven. */
export function panic(daysLeft: number): number {
  if (daysLeft > 100) return 1 + 0.05 * Math.max(0, (200 - daysLeft) / 100);
  if (daysLeft > 20) return 1.1 + 0.15 * (100 - daysLeft) / 80;
  if (daysLeft > 0) return 1.25 + 0.2 * (20 - daysLeft) / 20;
  return 1.2;
}
