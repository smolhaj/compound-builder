/**
 * Reactor meltdown (WP10; docs/scenarios/reactor_meltdown.md). A plume paints a stripe across the map; the world outside it works. Reuses
 * the radiation machinery (needs.dose, takeIodide, the hot wildfood window, bestShelter and hoursOutside from nuclear.ts) with a reactor's
 * slower, longer release instead of the weapons curve. Whether the compound lies in the stripe is rolled once from the seed and the region.
 */
import type { KindFx } from '../disasterFx';
import type { GameState } from '../state';
import { kindBag } from '../physical';
import { REGIONS } from '../regions';
import { bestShelter, hoursOutside } from '../nuclear';
import { takeIodide } from '../radiation';
import { DIFFICULTY } from '../difficulty';
import { bulletin, living, since, warnFrac, clamp01, type Line } from './kit';

interface Rel { r1: number; arrive: number; zone: number; hot: [number, number, number] }
/** The release by variant: R1 is Sv/h at one hour in the stripe (doc table), arrival hours, the chance the place is in the stripe, and the hot windows (wildfood, milk, garden days). */
export const RELEASE: Record<string, Rel> = {
  meltdown_regional: { r1: 0.15, arrive: 8, zone: 0.5, hot: [365, 60, 120] },
  meltdown_pair: { r1: 0.25, arrive: 6, zone: 0.7, hot: [730, 90, 180] },
  dirty_bomb: { r1: 0.02, arrive: 0, zone: 0.1, hot: [90, 14, 30] },
  spent_pool_fire: { r1: 0.4, arrive: 30, zone: 0.8, hot: [1825, 120, 365] },
};
/** The stripe's mean strength against the plant's peak (a place in the stripe sees a fraction of the core's rate). */
const STRIPE = 0.3;
const rel = (v: string): Rel => RELEASE[v] ?? RELEASE.meltdown_regional;

/** Dose in the open (Sv) between hours a and b: t^-0.7 to day 10, then t^-1.0, from the arrival. Pure. */
export function plumeDose(variant: string, a: number, b: number): number {
  const R = rel(variant), lo = Math.max(a, R.arrive, 1), T = 240, f1 = (x: number) => Math.pow(x, 0.3) / 0.3;
  if (b <= lo) return 0;
  let d = 0;
  if (lo < T) d += R.r1 * (f1(Math.min(b, T)) - f1(lo));
  if (b > T) d += R.r1 * Math.pow(T, -0.7) * T * Math.log(b / Math.max(lo, T));
  return d;
}

export interface MeltState { inZone: boolean; miles: number; ki: boolean; hotSet: boolean }
export const meltOf = (s: GameState): MeltState => kindBag<MeltState>(s, 'reactor_meltdown', () => {
  const r = (k: number) => ((Math.sin(s.seed * 7.31 + k * 51.7) * 43758.5453) % 1 + 1) % 1;
  const odds = REGIONS[s.site.region].odds.reactor_meltdown ?? 1;
  return { inZone: r(1) < Math.max(0.05, Math.min(0.9, rel(s.disaster.variant).zone * odds)), miles: Math.round(10 + 50 * r(2)), ki: false, hotSet: false };
});
export const inPlume = (s: GameState): boolean => s.disaster.kind === 'reactor_meltdown' && meltOf(s).inZone;

const LINES = (s: GameState): Line[] => [
  [0, 3, meltOf(s).inZone ? 'the plume is moving over the county: stay indoors, close the windows, take iodine if you have it.' : 'the plume is tracking away from the county: no action needed here, but the state is watching the wind.', 3],
  [2, 40, 'the state bans milk and leafy greens from the keep-out zone; dairies are dumping milk.', 2],
  [5, 120, 'the state sets up decontamination stations at the county line; bring a change of clothes.', 1],
  [10, 200, 'settlers are leaving the zone with what they can carry; the sheriff turns some back.', 1],
  [30, 500, 'monitors say cesium in the soil will not drop for years; the hot zone stays closed.', 1],
];

export const fx: KindFx = {
  onWarning: () => ['The plant has declared a site area emergency. Potassium iodide is being handed out in the 10-mile zone. Check which way the wind is blowing.'],
  onHit(s) {
    const M = meltOf(s), out: string[] = [];
    if (!M.inZone) return ['The plume went the other way. The county is fine, but the roads are full of people leaving the stripe.'];
    const day = Math.floor(s.clock.t + 0.25), h = rel(s.disaster.variant).hot;
    s.wild.hotUntil = Math.max(s.wild.hotUntil, day + h[0]); M.hotSet = true;
    const ki = takeIodide(s); if (ki) { out.push(ki); M.ki = true; }
    out.push(`The plume is over the place: about ${M.miles} miles from the plant. Stay inside, and do not drink milk or eat garden produce for ${h[1]} to ${h[2]} days.`);
    return out;
  },
  daily(s, ctx) {
    const M = meltOf(s);
    if (!M.inZone || ctx.day > 800) return [];
    const [pf] = bestShelter(s), h0 = ctx.day * 24, k = STRIPE * (DIFFICULTY[s.disaster.difficulty ?? 'standard'].wound);
    for (const { p, ps } of living(s)) {
      const out = hoursOutside(s, h0, !!p.kid);
      ps.needs.dose += k * (plumeDose(s.disaster.variant, h0, h0 + 24 - out) / pf + plumeDose(s.disaster.variant, h0 + 24 - out, h0 + 24) / 1.5);
    }
    return ctx.day === 1 ? ['The garden and the creek are hot: no milk, no leafy greens, no creek water until the state says so.'] : [];
  },
  priceMods: s => (since(s) < 0 ? 1 + 0.08 * warnFrac(s) : 1 + (meltOf(s).inZone ? 0.35 : 0.12) * clamp01(1 - since(s) / 240) + 0.3 * (1 - s.disaster.tracks.stores)),
  supplyMods: s => ({ grow: inPlume(s) && since(s) < 400 ? 0.7 : 1 }),
  encounterWeights(s, { scale }) {
    scale('refugees', meltOf(s).inZone && since(s) < 14 ? 1.5 : 1.2);
    scale('looters', meltOf(s).inZone ? 1.2 : 1);
    scale('trader', 0.8);
  },
  npcMods: s => 1 + (meltOf(s).inZone ? 0.7 : 0.2) * clamp01(1 - since(s) / 200),
  serviceMods: s => (meltOf(s).inZone ? { stores: 0.8, deliveries: 0.8, medical: 0.9 } : {}),
  medical: s => (meltOf(s).inZone && since(s) < 30 ? { contact: 0, spread: 0.01 } : null),
  radioBulletins: (s, ctx) => bulletin(LINES(s), ctx),
  oasisWeight: s => (meltOf(s).inZone ? 0.35 : 0.08),
};
