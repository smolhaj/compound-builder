/**
 * Nuclear war's own rules on top of the collapse clock (GDS §4, decided with
 * the user): the alert and the dash, fallout dose per person (the 7-10
 * rule: the dose rate falls as t^-1.2), shelter protection factors, the EMP
 * against what was kept in a Faraday room, contaminated food and water, and,
 * after a full exchange, a nuclear winter. Pure.
 *
 * Numbers are game-scaled but shaped like the real thing (Kearny, "Nuclear
 * War Survival Skills"; FEMA): fallout from the missile fields arrives hours
 * after the strikes; unsheltered, the first days' dose is lethal; a PF 40
 * shelter turns it into a few weeks of boredom; by two weeks outside work
 * costs little.
 */
import { BUNKER_ENTRANCES } from './bunkerEntrances';
import type { GameState } from './state';
import { isFinished } from './construction';
import { hasBasement, stylePF } from './housingStyles';
import { protectionOf } from './hardening';
import { SPARE_FOR } from './utilities';
import { winterFactor } from './effects';
export { winterFactor };
import { mulberry32 } from './rng';
import { empVehicles } from './vehicles';
import type { Stock } from './materials';

/** Dose rate at H+1 (Sv/h) at the compound, by variant, and hours until the fallout arrives. */
const R1: Record<string, number> = { distant: 2.0, nearby: 4.0, exchange: 3.0 };
const ARRIVE_H: Record<string, number> = { distant: 6, nearby: 1, exchange: 3 };
/** Shelter-in-place window (days) and how long garden crops and open water carry fallout. */
export const SHELTER_DAYS = 14, CONTAMINATED_DAYS = 60;

export const isNuclear = (s: GameState) => s.disaster.kind === 'nuclear' && s.clock.t >= s.disaster.hitAt;

/** Dose rate (Sv/h) h hours after the strikes (0 until the fallout arrives). */
export function doseRate(variant: string, h: number): number {
  if (h < (ARRIVE_H[variant] ?? 6)) return 0;
  return (R1[variant] ?? 1) * Math.pow(Math.max(1, h), -1.2);
}

/** Dose (Sv) in the open between hours a and b after the strikes (∫ R1 t^-1.2 dt). */
export function doseBetween(variant: string, a: number, b: number): number {
  const t0 = Math.max(a, ARRIVE_H[variant] ?? 6, 1);
  if (b <= t0) return 0;
  return (R1[variant] ?? 1) * 5 * (Math.pow(t0, -0.2) - Math.pow(b, -0.2));
}

/** The best shelter on the place: [protection factor, what it is]. */
export function bestShelter(s: GameState): [number, string] {
  const fin = s.structures.filter(isFinished);
  let best: [number, string] = [1.5, 'the open camp'];
  const consider = (pf: number, what: string) => { if (pf > best[0]) best = [pf, what]; };
  for (const st of fin) {
    if (st.kind.startsWith('bunker_') && !BUNKER_ENTRANCES.includes(st.kind)) consider(protectionOf(st).pf, 'the bunker');
    else if (st.kind === 'root_cellar') consider(40, 'the root cellar');
    else if (stylePF(st.kind)) consider(stylePF(st.kind), hasBasement(st.kind) ? 'the lodge basement' : `the ${st.kind.replace(/_/g, ' ')}`);
    else if (st.kind === 'farmhouse') consider(10, 'the farmhouse basement');
    else if (st.kind === 'log_house') consider(8, 'the log house');
    else if (st.kind === 'trailer') consider(1.5, 'the trailer');
    else if (st.kind === 'barn') consider(2, 'the barn');
    else if (st.kind === 'timber_cabin') consider(3, 'the cabin');
    else if (st.kind === 'workshop') consider(2, 'the shop');
  }
  return best;
}

/** Electronics the EMP takes out (installed), and the spare that fixes each. */
export const FRIED: Record<string, keyof Stock> = SPARE_FOR;
/** Spares in the stockpile that an EMP can kill. */
const SPARES: Array<keyof Stock> = ['inverter', 'battery', 'solar_panel', 'generator', 'pump'];

/** The best Faraday protection on the place (share of stored electronics that survive). */
export function faradayShare(s: GameState): number {
  return Math.max(0, ...s.structures.filter(st => st.kind.startsWith('bunker_') && isFinished(st)).map(st => protectionOf(st).empSurvive));
}

/**
 * The moment of the strikes: the EMP fries what it reaches, the people at
 * work in town try to get home, everyone else runs for the best shelter.
 */
export function strike(s: GameState): string[] {
  const out: string[] = [];
  const r = mulberry32(s.seed * 4441 + 9);
  const v = s.disaster.variant;
  // EMP: installed electronics, then the spares in the stockpile (those in a Faraday room may survive)
  const share = faradayShare(s);
  for (const st of s.structures.filter(isFinished)) if (FRIED[st.kind] && !s.utilities.fried.includes(st.id)) s.utilities.fried.push(st.id);
  const lost: string[] = [];
  for (const k of SPARES) {
    const have = Math.floor(s.stock[k]);
    let keep = 0;
    for (let i = 0; i < have; i++) if (r() < share) keep++;
    if (have > keep) lost.push(`${have - keep} ${k.replace('_', ' ')}`);
    s.stock[k] = keep + (s.stock[k] - have);
  }
  out.push(`The EMP took out the inverters, the pump controller and the generator's electronics.${lost.length ? ` Spares fried: ${lost.join(', ')}.` : share > 0 ? ' The spares in the Faraday room came through.' : ''}`);
  out.push(...empVehicles(s));
  // the dash: people in town at work
  s.people.forEach((p, i) => {
    const ps = s.personState[i];
    if (!ps || ps.needs.died != null || ps.task !== 'job') return;
    if (v === 'nearby' || v === 'exchange') {
      ps.needs.hurt.push({ what: 'burns and cuts from the blast in town', sev: 40 });
      ps.needs.dose += 0.4;
      out.push(`${p.first} was in town when it hit: hurt, and home two days later.`);
    } else out.push(`${p.first} drove home from town ahead of the fallout.`);
  });
  const [pf, where] = bestShelter(s);
  out.push(`Everyone into ${where} (protection factor ${Math.round(pf)}).`);
  return out;
}

/**
 * One day of fallout: each person's dose from the shelter they're in (the
 * first two weeks) or the hours they work outside after; contaminated food
 * and open water for the first two months. Returns lines for the log.
 */
export function falloutDay(s: GameState): string[] {
  if (!isNuclear(s)) return [];
  const v = s.disaster.variant, h0 = (s.clock.t - s.disaster.hitAt) * 24;
  if (h0 > 24 * 400) return [];
  const [pf] = bestShelter(s);
  const out: string[] = [];
  const sheltering = h0 < SHELTER_DAYS * 24;
  const fin = s.structures.filter(isFinished);
  const cleanWater = !s.utilities.hauling && fin.some(st => st.kind === 'well_drilled' || st.kind === 'well_hand' || st.kind === 'cistern' || st.kind === 'water_tower');
  const day = h0 / 24;
  s.people.forEach((p, i) => {
    const n = s.personState[i]?.needs;
    if (!n || n.died != null) return;
    const outside = h0 < 72 ? 0 : sheltering ? 0.5 : p.kid ? 2 : 8;      // hours in the open: none the first three days, a dash for water after
    let dose = doseBetween(v, h0, h0 + 24 - outside) / pf + doseBetween(v, h0 + 24 - outside, h0 + 24) / 1.5;
    // contaminated food and water: garden produce and creek water carry it for two months
    if (day < CONTAMINATED_DAYS) {
      const k = (1 - day / CONTAMINATED_DAYS) * (R1[v] ?? 1);
      if (!cleanWater) dose += 0.004 * k;
      // (by the share of the diet that's fresh from the place, not the size of the farm: playtest round 3, a fallout over a 16-field harvest gave everyone 0.3 Sv a day)
      if (s.food.producedKcal > 0) dose += 0.002 * k * Math.min(1, s.food.producedKcal / Math.max(1, s.food.needKcal));
    }
    n.dose += dose;
    if (n.dose > 1 && n.dose - dose <= 1) out.push(`${p.first} is sick: nausea, weakness. Radiation sickness.`);
  });
  return out;
}

/** The sky for any disaster (renderer): ash, smoke, an impact's flash and dark, the strikes. */
export function disasterSky(s: GameState): { haze: number; flash: number; dust: number } {
  const d = s.disaster, h = (s.clock.t - d.hitAt) * 24;
  if (d.kind === 'nuclear') return nuclearSky(s);
  if (!d.kind || s.clock.t < d.warnAt) return { haze: 0, flash: 0, dust: 0 };
  const w = winterFactor(s);
  switch (d.kind) {
    case 'ash_winter': return h < 0 ? { haze: 0, flash: 0, dust: 0 } : { haze: Math.max(0.5, 1 - w.grow), flash: 0, dust: h < 24 * 10 ? 1 - h / (24 * 10) : 0 };
    case 'asteroid': return h < 0 ? { haze: 0, flash: 0, dust: 0 } : { haze: Math.max(0.3, Math.min(1, 1 - (h / 24 - 730) / 400)), flash: h < 0.05 ? 1 - h / 0.05 : 0, dust: h < 72 ? 0.6 : 0 };
    case 'wildfire': return { haze: h < -48 ? 0.3 : h < 24 * 6 ? 0.85 : 0, flash: 0, dust: h > 0 && h < 48 ? 0.5 : 0 };
    default: return { haze: 0, flash: 0, dust: 0 };
  }
}

/** The sky over the strikes (for the renderer): 0 = normal, 1 = sickly; the flash on the hit's first hour. */
export function nuclearSky(s: GameState): { haze: number; flash: number; dust: number } {
  if (s.disaster.kind !== 'nuclear' || s.clock.t < s.disaster.hitAt) return { haze: 0, flash: 0, dust: 0 };
  const h = (s.clock.t - s.disaster.hitAt) * 24;
  const w = winterFactor(s).grow < 1 ? 1 - winterFactor(s).grow : 0;
  return {
    flash: h < 0.05 ? 1 - h / 0.05 : 0,
    haze: Math.max(w, Math.max(0, 1 - h / (24 * 21))),
    dust: h > (ARRIVE_H[s.disaster.variant] ?? 6) && h < 48 ? 1 - h / 48 : 0,
  };
}

