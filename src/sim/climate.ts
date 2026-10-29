/**
 * Altitude and aspect climate (docs/DECISIONS.md, "Varied lots and elevations"). A region's numbers (last and first
 * frost, how cold the winter is, snowfall, the July high and January low) are quoted for its reference altitude. A lot
 * above or below it, in a frost pocket or on a south slope, gets the region's numbers moved:
 *
 *  - 6.5 °C per km (1.17 °F per 100 m) colder with height; the frost-free season 6 days shorter per 100 m (3 off each end);
 *  - heating demand 6 % more per 100 m (Denver 6,000 degree-days, Leadville 14,000), snowfall 4 % more per 100 m;
 *  - a cold-air pocket (the pad stands 4+ m below the land round it) loses 10 more frost-free days and 4 °F on the winter
 *    lows; a thermal belt (6+ m above it) gains 4 days but takes the wind (heating +5 %);
 *  - a south-facing pad gains 4 days and burns 6 % less wood; a north-facing one loses 4 and burns 6 % more;
 *  - a lake keeps the frost off a few days at each end.
 *
 * `regionFor(site)` is the region's definition with those moved, so every system that read `REGIONS[site.region]` for the
 * weather reads the place's own. A place with no lot gets the region itself, untouched. Pure.
 */
import { REGIONS, type RegionDef, type RegionId } from './regions';
import { siteLot } from './lotListing';
import type { Site } from './site';

/** The altitude (m) a region's climate numbers are quoted for. */
export const REF_ALT_M: Partial<Record<RegionId, number>> = { mountain_west: 1600, appalachia: 450, pnw: 200, north_woods: 350 };

export interface AltitudeClimate {
  /** Meters above the region's reference. */
  dM: number;
  /** Frost-free season, days: the region's, and this place's. */
  seasonRegion: number; season: number;
  /** Shifts of the last and first frost (days; + later). */
  lastShift: number; firstShift: number;
  cold: number; snow: number; rain: number;
  /** °F added to the July high and the January low. */
  highF: number; lowF: number;
  /** Plain-language reasons, for the listing card and the Farm tab. */
  notes: string[];
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const cache = new Map<string, AltitudeClimate | null>();

export function altitudeClimate(site: Pick<Site, 'region' | 'lot' | 'home'>): AltitudeClimate | null {
  const lot = siteLot(site);
  if (!lot) return null;
  const spec = site.lot!, st = lot.stats, R = REGIONS[site.region];
  const key = `${site.region}|${spec.kind}:${spec.seed}:${spec.relief}:${spec.elevM}:${spec.flip}:${spec.creek ? 1 : 0}|${site.home.x0},${site.home.z0},${site.home.x1},${site.home.z1}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const dM = spec.elevM - (REF_ALT_M[site.region] ?? spec.elevM);
  let last = 3 * dM / 100, first = -3 * dM / 100, cold = 1 + 0.06 * dM / 100, lowF = -1.17 * dM / 100;
  const highF = -1.17 * dM / 100;
  const notes: string[] = [];
  if (Math.abs(dM) >= 100) notes.push(`${dM > 0 ? 'Higher' : 'Lower'} than the region's usual ${Math.abs(Math.round(dM / 10) * 10)} m: ${dM > 0 ? 'colder, with a shorter growing season and more snow' : 'milder, with a longer growing season'}`);
  if (st.standM <= -4) { last += 5; first -= 5; lowF -= 4; notes.push('Cold air pools here on clear nights: late frosts hit the garden and orchard (an inversion in winter)'); }
  else if (st.standM >= 6) { last -= 2; first += 2; cold *= 1.05; notes.push('Up in the thermal belt, above the frost, but open to the wind'); }
  if (st.sun >= 1.08) { last -= 2; first += 2; cold *= 0.94; notes.push('A south-facing pad: warmer, earlier spring, less wood to burn'); }
  else if (st.sun <= 0.93) { last += 2; first -= 2; cold *= 1.06; notes.push('A north-facing pad: slow to thaw, more wood to burn'); }
  if (site.lot!.kind === 'bluff' || site.lot!.kind === 'island') { last -= 3; first += 3; cold *= 0.97; notes.push('The lake keeps the first and last frosts off a few days'); }
  let lastDay = R.frost[0] + last, firstDay = R.frost[1] + first;
  // never less than 40 frost-free days (a short-season garden still gives something)
  if (firstDay - lastDay < 40) { const mid = (lastDay + firstDay) / 2; lastDay = mid - 20; firstDay = mid + 20; }
  const out: AltitudeClimate = {
    dM, seasonRegion: R.frost[1] - R.frost[0], season: Math.round(firstDay - lastDay),
    lastShift: Math.round(lastDay - R.frost[0]), firstShift: Math.round(firstDay - R.frost[1]),
    cold: clamp(cold, 0.55, 2.4), snow: clamp(1 + 0.04 * dM / 100, 0.4, 3), rain: clamp(1 + 0.03 * dM / 100, 0.6, 2), highF, lowF, notes,
  };
  if (cache.size > 64) cache.clear();
  cache.set(key, out);
  return out;
}

const regionCache = new Map<string, RegionDef>();
/** The region's definition with the place's altitude, pocket and aspect applied (the region itself when the place has no lot). */
export function regionFor(site: Pick<Site, 'region' | 'lot' | 'home'>): RegionDef {
  const R = REGIONS[site.region];
  const a = altitudeClimate(site);
  if (!a) return R;
  const spec = site.lot!, key = `${site.region}|${spec.kind}:${spec.seed}:${spec.relief}:${spec.elevM}:${spec.flip}:${spec.creek ? 1 : 0}|${site.home.x0},${site.home.z0}`;
  const hit = regionCache.get(key);
  if (hit) return hit;
  const storms = { ...R.storms };
  if (storms.blizzard) storms.blizzard = Math.min(0.05, storms.blizzard * a.snow);
  const out: RegionDef = {
    ...R,
    frost: [Math.round(R.frost[0] + a.lastShift), Math.round(R.frost[1] + a.firstShift)],
    cold: Math.round(R.cold * a.cold * 100) / 100,
    snowCm: Math.round(R.snowCm * a.snow),
    rainMm: Math.round(R.rainMm * a.rain),
    julyHighF: Math.round(R.julyHighF + a.highF),
    janLowF: Math.round(R.janLowF + a.lowF),
    storms,
  };
  if (regionCache.size > 64) regionCache.clear();
  regionCache.set(key, out);
  return out;
}
