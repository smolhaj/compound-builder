/**
 * Dust storms and heat haze, derived from the weather the sim already runs (no new sim state): dry country in a windy, rainless spell
 * (a desert monsoon's gust front, a Plains spring blow, the Santa Ana) lifts dust that browns the air; a hot, still, dry midday shimmers
 * in a pale haze. Pure. The caller lays the result on the collapse look (ash flakes in a tan colour, haze, dimmer sun, a brown-orange sky).
 */
import type { CollapseLook } from '../../../sim/collapseLook';

/** How dusty a region's ground is (1 = open desert). */
export const DUST_PRONE: Readonly<Record<string, number>> = {
  desert_southwest: 1, great_plains: 0.55, midwest_plains: 0.3, mountain_west: 0.4, southern_california: 0.45, hill_country: 0.25,
};
/** Regions where a dry summer midday sits in a hot haze. */
const HOT: Readonly<Record<string, number>> = { desert_southwest: 1, southern_california: 0.5, great_plains: 0.4, hill_country: 0.5, deep_south: 0.3 };

const sstep = (a: number, b: number, x: number): number => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export interface DustIn { region: string; season: string; wind: number; rain: number; storm: number; snow: number; cloud: number; hour: number }

export function dustStorm(w: DustIn): { dust: number; heat: number } {
  const prone = DUST_PRONE[w.region] ?? 0;
  const dry = (1 - sstep(0.04, 0.35, w.rain)) * (1 - sstep(0.05, 0.4, w.snow));
  const season = w.season === 'summer' || w.season === 'spring' ? 1 : w.season === 'fall' ? 0.6 : 0.25;
  const blow = Math.max(sstep(0.5, 0.85, w.wind), 0.9 * sstep(0.3, 0.7, w.storm));
  const dust = prone * dry * season * blow;
  const sun = sstep(10, 12.5, w.hour) * (1 - sstep(16.5, 19, w.hour));
  const heat = (HOT[w.region] ?? 0) * (w.season === 'summer' ? 1 : 0.2) * sun * (1 - sstep(0.2, 0.7, w.cloud)) * dry * (1 - dust);
  return { dust, heat };
}

/** The look with dust and heat haze laid on (a stronger existing look wins where it is thicker). */
export function applyDust(l: CollapseLook, d: { dust: number; heat: number }): CollapseLook {
  if (d.dust < 0.02 && d.heat < 0.02) return l;
  const k = d.dust;
  const mix3 = (a: readonly number[], b: readonly number[], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const keepAsh = l.ash > k * 0.8;
  return {
    ...l,
    ash: keepAsh ? l.ash : k,
    ashColor: keepAsh ? l.ashColor : [0.74, 0.52, 0.3],
    haze: Math.max(l.haze, k * 1.0, d.heat * 0.55),
    fog: Math.max(l.fog, k * 0.8),
    cloud: Math.max(l.cloud, k * 0.5),
    dim: l.dim * (1 - 0.5 * k),
    skyTint: l.skyAmt > k * 0.9 ? l.skyTint : [0.8, 0.5, 0.26],
    skyAmt: Math.max(l.skyAmt, k * 0.9),
    sat: l.sat * (1 - 0.1 * k),
    cast: mix3(l.cast, [1.06, 0.97, 0.84], Math.max(k * 0.8, d.heat * 0.35)),
  };
}
