/**
 * Water beyond the well (decided with the user: you can't always spawn on a
 * creek or good well water; buy water and store it; collect rain and filter
 * it; reuse greywater; contamination). Pure.
 *
 *  Buying       while town works, what's short is bought: bottled at about
 *               3 ¢ a liter, or with a water trailer filled at the county
 *               standpipe for about 1 ¢. A tanker load (15,000 L, $450) fills
 *               the storage in one go.
 *  Storage      cisterns and the tower, plus IBC totes (1,000 L each) and
 *               5-gallon jugs (19 L) of drinking water put by.
 *  Hauling      no water on the place: buckets from the creek (hard on
 *               morale, harder if the creek is on a neighbor's land). A water
 *               trailer makes it one trip a day.
 *  Treatment    creek and rain water carry giardia and worse: a gravity
 *               filter (ceramic, ~$350; cartridges last about a year for a
 *               family) or boiling it (firewood). Arsenic in the well needs
 *               reverse osmosis for drinking water; hard water scales the
 *               pump unless there's a softener.
 *               A filtration shed (sediment, carbon, UV) treats it all for the
 *               house: no filter cartridges, no boiling.
 *  Greywater    a diverter sends sink and shower water to the garden: the
 *               garden needs half the well water.
 *  Hand pump    a deep-well hand pump (Simple Pump / Bison style, ~$2,200)
 *               goes down the drilled well's casing beside the electric
 *               pump: with the power out or the pump dead, the family pumps
 *               by hand. A stroke lifts the same water at any depth, so the
 *               deeper the water stands the harder and slower it is: about
 *               1,000 L an hour from 10 m, 300 from 100 m; past ~100 m static
 *               level no hand pump lifts it. The labor: up to an hour and a
 *               half of each able adult's chore time (half an hour for a
 *               teenager).
 */
import type { GameState } from './state';
import { mulberry32 } from './rng';

export const JUG_L = 19;
export const TOTE_L = 1000;
export const TANKER_L = 15000, TANKER_USD = 450;
/** Liters a person needs to drink and cook, at the least. */
export const DRINK_L = 4;

/** Deepest static water level a hand pump lifts from (m), and its rate (L an hour of pumping) by depth. */
export const HAND_PUMP_MAX_M = 100;
export const handPumpLph = (depthM: number) => (depthM > HAND_PUMP_MAX_M ? 0 : Math.round(1100 - 8 * Math.max(0, depthM)));
/** Hours of pumping the household can put in a day: 1.5 an able adult, 0.5 a teenager (the sick, the badly hurt and the young don't pump). */
export function handPumpHours(s: GameState): number {
  return s.people.reduce((a, p, i) => {
    const n = s.personState[i]?.needs;
    if (!n || n.died != null || n.taken || n.health < 30 || n.hurt.some(h => h.trauma && h.sev >= 50)) return a;
    return a + (!p.kid ? 1.5 : p.age >= 12 ? 0.5 : 0);
  }, 0);
}
/** A hand pump in a finished drilled well, with the water in reach. */
export const handPumpReady = (s: GameState) => (s.stock.hand_pump ?? 0) >= 1 && s.site.gwDepth <= HAND_PUMP_MAX_M && s.structures.some(x => x.kind === 'well_drilled' && x.stage >= 5);

/** Extra storage the goods add (IBC totes). */
export const toteStorage = (s: GameState) => Math.floor(s.stock.ibc_tote ?? 0) * TOTE_L;
/** Cost a liter of water bought in town (a trailer at the standpipe is cheaper than bottled). */
export const waterPrice = (s: GameState) => ((s.stock.water_trailer ?? 0) >= 1 ? 0.01 : 0.03);

/** A tanker load of water into storage (while town works). */
export function orderTanker(s: GameState, capacity: number): string | null {
  if (s.disaster.tracks.deliveries < 0.5 || s.disaster.tracks.banks < 0.5) return 'no water trucks running';
  if (capacity - s.utilities.storedL < 1000) return 'the tanks are full';
  if (s.money < TANKER_USD) return 'not enough money';
  s.money -= TANKER_USD;
  s.utilities.storedL = Math.min(capacity, s.utilities.storedL + TANKER_L);
  return null;
}

/** A finished filtration shed on the place (sediment + carbon + UV): well, rain and hauled water are safe to drink. */
export const treated = (s: GameState) => s.structures.some(x => x.kind === 'filtration_shed' && x.stage >= 5);

/** Once a day, after the water balance: jugs cover the shortfall, untreated water makes people sick, arsenic, the filter wears. */
export function waterDay(s: GameState): string[] {
  const out: string[] = [];
  const u = s.utilities, day = Math.floor(s.clock.t + 0.25);
  const r = mulberry32(s.seed * 5051 + day * 3 + 11);
  const living = s.personState.filter(ps => ps.needs.died == null);
  // short of water: drink from the jugs first
  // (only what drinking and cooking are short of: the shortfall comes out of washing and the garden first, sim/thirst.ts)
  const drinkGap = Math.min(u.report.shortL, living.length * DRINK_L, Math.max(0, u.report.shortL - (u.report.useL - living.length * DRINK_L)));
  if (drinkGap > 0 && s.stock.water_jugs > 0) {
    const drink = drinkGap;
    const take = Math.min(drink / JUG_L, s.stock.water_jugs);
    s.stock.water_jugs -= take;
    u.report.shortL = take * JUG_L >= drink - 1e-6 ? 0 : u.report.shortL - take * JUG_L;
    out.push(`Drank from the stored jugs (${Math.round(take * JUG_L)} L).`);
  }
  // hauling with a trailer is one trip a day, not buckets all day
  if (u.hauling && s.stock.water_trailer >= 1) u.haulFar = false;
  // untreated creek water: a filter, or boil it (firewood), or take the chance
  if (u.hauling) {
    if (treated(s)) { /* the filtration shed's sediment, carbon and UV take care of it */ }
    else if (s.stock.water_filter >= 0.01) s.stock.water_filter = Math.max(0, s.stock.water_filter - 0.0008 * living.length);
    else if (s.stock.firewood >= 0.05) s.stock.firewood -= 0.05;
    else for (const ps of living) if (r() < 0.006) { ps.needs.hurt.push({ what: 'giardia (bad water)', sev: 25 }); out.push('Someone is sick from the creek water. Filter it or boil it.'); break; }
  }
  // arsenic in the well water: years of it wear on you without reverse osmosis
  const well = s.structures.some(x => (x.kind === 'well_drilled' || x.kind === 'well_hand') && x.stage >= 5);
  if (well && !u.hauling && s.site.gwQuality === 'arsenic' && s.stock.ro_system < 1) for (const ps of living) ps.needs.health -= 0.01;
  // hard water scales the pump (a softener stops it)
  if (well && s.site.gwQuality === 'hard' && s.stock.softener < 1 && r() < 1 / 1400) {
    const pump = s.structures.find(x => x.kind === 'well_drilled' && x.stage >= 5);
    if (pump && !u.broken.includes(pump.id)) { u.broken.push(pump.id); out.push('Scale from the hard water seized the well pump.'); }
  }
  return out;
}
