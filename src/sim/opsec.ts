/**
 * OPSEC: how much the county knows you're prepared. Pure.
 *
 *  Deliveries      every order the freight truck dropped at the place
 *  Structures      what shows from the road: bunker hatch, water tower,
 *                  solar array, a palisade
 *  Paper trail     guns on the shop's records, big metal buys and cash on the
 *                  dealer's and bank's books
 *  Lights          lights burning at night once the grid is down
 *  Smoke           cooking smells and the smoker when everyone else is hungry
 *  Talk            a good negotiator in the household keeps the stories quiet
 *
 * Player choices (`s.opsec`, lazily made): pick deliveries up in town (fewer
 * people see the truck) and light discipline (sim/blackout.ts: lights out,
 * blackout curtains).
 */
import type { GameState } from './state';
import { isFinished } from './construction';
import { noiseNow } from './gatherings';
import { lightLines, type AutoLightsOut, type LightLine } from './blackout';
import { alwaysLit, animalGlow, lightList } from './lights';
import { floodTowerIds } from './towers';

/** `blackout` is the manual lights-out switch; `auto` the family's routine (sim/blackout.ts). */
export interface Opsec { quietDeliveries: boolean; blackout: boolean; auto?: AutoLightsOut }

export const opsecOf = (s: GameState): Opsec => (s.opsec ??= { quietDeliveries: false, blackout: false, auto: 'off' });

export type ExposureSource = 'deliveries' | 'structures' | 'guns' | 'metals' | 'lights' | 'smoke' | 'talk' | 'news' | 'market' | 'gatherings';
export const EXPOSURE_NAME: Record<ExposureSource, string> = {
  deliveries: 'Deliveries seen', structures: 'Visible structures', guns: 'Gun sales on record', metals: 'Metal & cash on the books',
  lights: 'Lights after the grid', smoke: 'Smoke & cooking', talk: 'Talk in town', news: 'On the local news', market: 'Followed from the market', gatherings: 'Parties & cookouts',
};

const STRUCTURE_WEIGHT: Record<string, number> = { bunker_hatch: 10, bunker_stairs: 8, water_tower: 8, solar_array: 7, garage_solar: 5, gate_garage: 4 };

/** What shows from the road after dark, source by source (sim/blackout.ts): windows, floodlights (left on, and sensors an animal trips), fire pit, generator. */
export function lightLinesOf(s: GameState): LightLine[] {
  const ids = lightList(s, floodTowerIds(s)).map(l => l.id);
  return lightLines(s, Math.min(9, 3 * alwaysLit(s, floodTowerIds(s)) + animalGlow(s, ids)));
}

/** Each source's points (talk is negative). */
export function exposureParts(s: GameState): Record<ExposureSource, number> {
  const o = s.opsec ?? { quietDeliveries: false, blackout: false };
  const delivered = s.orders.filter(x => x.status === 'delivered');
  const big = delivered.filter(x => x.cost >= 2000).length;
  const deliveries = Math.min(25, (delivered.length * 1.5 + big * 2) * (o.quietDeliveries ? 0.4 : 1));
  let structures = 0;
  for (const st of s.structures) if (isFinished(st)) structures += STRUCTURE_WEIGHT[st.kind] ?? 0;
  if (s.perimeter.some(r => r.kind === 'log_palisade' || r.kind === 'container_wall')) structures += 6;
  structures = Math.min(25, structures);
  const guns = Math.min(15, s.armory.onBooks * 2);
  const metals = Math.min(10, s.fin.onBooks / 5000);
  // lamps in the windows once the grid is down; floodlights left on all night are seen from the road (+3 each, up to 9; sim/lights.ts)
  const lights = lightLinesOf(s).reduce((a, l) => a + l.points, 0);
  const hungry = s.disaster.tracks.stores < 0.5;
  const smoke = hungry ? 6 + (s.stock.smoker ? 4 : 0) : 0;
  const adults = s.people.filter((p, i) => !p.kid && s.personState[i]?.needs.died == null);
  const talk = -Math.max(0, ...adults.map(p => p.skills.negotiator)) * 2;
  // a shooting on the local news (sim/breakins.ts), fading over about a year
  const at = s.breakins?.newsAt ?? -1;
  const news = at >= 0 ? 15 * Math.exp(-Math.max(0, s.clock.t - at) / 365) : 0;
  // noise, light and smoke from a cookout or a party (sim/gatherings.ts), fading over a few days
  const gatherings = Math.min(15, noiseNow(s));
  // followed home from the crossroads market (sim/market.ts), fading over weeks
  const market = s.market?.heat ?? 0;
  return { deliveries, structures, guns, metals, lights, smoke, talk, news, market, gatherings };
}

/** 0–100: how much the county knows. */
export function exposure(s: GameState): number {
  const p = exposureParts(s);
  const sum = Object.values(p).reduce((a, b) => a + b, 0);
  return Math.round(Math.max(0, Math.min(100, sum)));
}

/** Biggest contributors first (positive ones only). */
export function topExposure(s: GameState, n = 3): Array<[ExposureSource, number]> {
  return (Object.entries(exposureParts(s)) as Array<[ExposureSource, number]>).filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1]).slice(0, n);
}

/** Multiplier on how often people come and how many of them come for what you have: 0.7 (nobody knows) … 1.6 (everyone does). */
export function raidPressure(s: GameState): number {
  return 0.7 + 0.9 * exposure(s) / 100;
}
