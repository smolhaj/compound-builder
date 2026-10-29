/**
 * The greenhouse and the orchard (food, after the user's reference photo:
 * a glass greenhouse by the raised beds, a block of fruit trees). Pure.
 *
 *  Greenhouse  a 12 × 24 ft hobby greenhouse (aluminum frame, twin-wall
 *              polycarbonate). With one finished, the garden starts six weeks
 *              earlier and runs six weeks later (transplants started under
 *              glass, a cold frame over the late beds), and its peak is 15 %
 *              higher (stronger seedlings). Through the cold months (October
 *              to April) its benches grow winter greens: ≈ 600 kcal a day
 *              where winters are like the Mountain West's, more where they're
 *              mild, less under heavy snow unless it has power for a heater.
 *  Heated      a 9 × 24 m production greenhouse (`greenhouse_heated`, ≈ 8 times the glass): benches of
 *  greenhouse  greens, tomatoes and starts through the cold months, ≈ 4,200 kcal a day when it is
 *              warm; the garden runs 10 weeks longer and the peak is 30 % higher. It is heated either
 *              by electric heat from the compound's power (up to ≈ 34 kWh a day in a hard January,
 *              the load the solar farm is sized for) or by a wood boiler (≈ 0.09 rick a day at full
 *              demand): the player picks, and it falls back to wood when the power fails. Cold and
 *              unheated, the benches freeze back to a third of that. Tended by the Garden duty.
 *  Orchard     apple, pear, cherry and plum trees in rows, twelve to a plot (`orchard`) or forty-eight (`orchard_grove`):
 *              sim/orchard.ts (their years to first fruit, blossom and frost, bees, pruning, water and the fruit seasons).
 */
import { calendarOf, type GameState, type Structure } from './state';
import { isFinished } from './construction';
import { seasons } from './regions';
import { climate } from './effects';
import { burnRick } from './upkeep';
import { logGate } from './nag';
import { heatDemand } from './heating';
import { farmOf, greenhouseCareOf } from './farm';
import { orchardChoreRate } from './orchard';
import { glassSound } from './improvements';
import { regionFor } from './climate';

/** Days the greenhouse moves the garden's start earlier and its end later. */
export const GREENHOUSE_EXTEND = 42;
/** Garden peak with greenhouse-started seedlings. */
export const GREENHOUSE_PEAK = 1.15;
/** Winter greens a greenhouse grows a day in a Mountain West winter (kcal). */
export const GREENS_KCAL = 600;

const finished = (s: GameState, ...kinds: string[]): Structure[] => s.structures.filter(st => kinds.includes(st.kind) && isFinished(st));

/** The two glasshouse tiers: the 12 × 24 ft hobby kit and the 9 × 24 m production house. */
export const GH_KINDS = ['greenhouse', 'greenhouse_heated'] as const;
export const GH_TIER: Record<string, { name: string; kcal: number; extend: number; peak: number }> = {
  greenhouse: { name: 'Greenhouse', kcal: GREENS_KCAL, extend: GREENHOUSE_EXTEND, peak: GREENHOUSE_PEAK },
  greenhouse_heated: { name: 'Heated greenhouse', kcal: 4200, extend: 70, peak: 1.3 },
};
/** Wood a heated greenhouse burns at full demand (ricks a day), and the power it draws (kWh a day: base and per unit of demand). */
export const GH_WOOD_RICKS = 0.09, GH_BASE_KWH = 4, GH_HEAT_KWH = 30;

export const greenhouses = (s: GameState): Structure[] => finished(s, ...GH_KINDS);
export const hasGreenhouse = (s: GameState) => greenhouses(s).length > 0;

/** The garden's season (day of year), stretched by the best finished greenhouse. */
export function gardenSeason(s: GameState): [number, number] {
  const [g0, g1] = seasons(regionFor(s.site)).garden;
  const x = Math.max(0, ...greenhouses(s).map(st => GH_TIER[st.kind].extend));
  return x > 0 ? [g0 - x, g1 + x] : [g0, g1];
}

/** The garden's peak, raised by the best greenhouse's strong seedlings (1 with none). */
export const greenhousePeak = (s: GameState): number => Math.max(1, ...greenhouses(s).map(st => GH_TIER[st.kind].peak));

/** The cold months the greenhouse benches are in greens (October through April). */
export const inGreensSeason = (doy: number) => doy >= 274 || doy <= 120;

/** How a region's winter sets the greens: mild winters more, heavy snow less (unless the greenhouse is heated). */
export function greensFactor(cold: number, heated: boolean): number {
  if (cold <= 1) return 1 + 0.6 * (1 - cold);
  return heated ? 1 : Math.max(0.3, 1 - 0.6 * (cold - 1));
}

/** Today's cold the heater has to meet: 0 in summer, about 1 in a Mountain West January, up to 2 in a snap. */
export function heatNeed(s: GameState): number {
  return Math.max(0, Math.min(2, heatDemand(calendarOf(s.clock).doy) * regionFor(s.site).cold + climate(s).cold));
}

/** A greenhouse's power draw today (kWh): the hobby house's fans, or the production house's fans plus electric heat. */
export function greenhouseKwh(s: GameState, st: Structure): number {
  if (st.kind !== 'greenhouse_heated') return 1;
  // cracked panes leak the heat: up to a third more to keep it warm
  const leak = 1 + 0.5 * (1 - glassSound(st));
  return (greenhouseCareOf(s, st.id).heat === 'wood' ? GH_BASE_KWH * 0.6 : GH_BASE_KWH + GH_HEAT_KWH * heatNeed(s) * leak);
}

/** Is this greenhouse warm for the winter benches? (the hobby house: powered; the production house: its boiler or heater worked yesterday) */
export function isHeated(s: GameState, st: Structure): boolean {
  return st.kind === 'greenhouse_heated' ? greenhouseCareOf(s, st.id).heated : s.utilities.lit.includes(st.id);
}

/** Winter greens from the greenhouses today (kcal, before the climate and the tending chore). */
export function greenhouseGreens(s: GameState): number {
  const doy = calendarOf(s.clock).doy;
  if (!inGreensSeason(doy)) return 0;
  const cold = regionFor(s.site).cold;
  return greenhouses(s).reduce((a, st) => a + GH_TIER[st.kind].kcal * greensFactor(cold, isHeated(s, st)) * glassSound(st), 0);
}

/**
 * Once a day: the production greenhouses' heat. Electric (when the heater has power) or wood (a
 * boiler that burns ricks); with the power out it falls back to wood, and with no wood the benches
 * freeze back. Returns log lines.
 */
export function greenhouseDay(s: GameState): string[] {
  const out: string[] = [];
  const need = heatNeed(s), day = Math.floor(s.clock.t);
  for (const st of finished(s, 'greenhouse_heated')) {
    const c = greenhouseCareOf(s, st.id), was = c.by;
    if (need < 0.08) { c.heated = true; c.by = 'none'; continue; }
    if (c.heat === 'electric' && s.utilities.lit.includes(st.id)) { c.heated = true; c.by = 'electric'; }
    else {
      c.burned += GH_WOOD_RICKS * need;
      let ok = true;
      while (c.burned >= 1) { if (!burnRick(s)) { ok = false; c.burned = 1; break; } c.burned -= 1; }
      c.heated = ok; c.by = ok ? 'wood' : 'none';
      if (!ok && logGate(s, `gh-wood:${st.id}`, 7)) { c.warned = day; out.push('The greenhouse boiler is out of wood: the benches will freeze back.'); }
    }
    if (c.by !== was && c.by === 'wood' && c.heat === 'electric') out.push('The greenhouse heater has no power: the boiler is burning wood instead.');
  }
  return out;
}

/** Winter greens, the garden and the extra from the greenhouse tiers are summed in needs.ts. */

// The orchards (apple, pear, cherry and plum rows, their years, blossom, frost, bees and water) are sim/orchard.ts.
export { ORCHARD_KINDS, ORCHARD_TREES, orchardDay, orchardYield } from './orchard';

/** The chore backlogs the self-sufficient interior adds (sim/daily.ts `choreRates`): pruning and picking, the greenhouses, feeding the fish. */
export function selfSufficiencyRates(s: GameState, doy: number): { orchard: number; greenhouse: number; pond: number } {
  const houses = greenhouses(s);
  const [g0, g1] = gardenSeason(s);
  const gh = houses.reduce((a, st) => a + (st.kind === 'greenhouse_heated' ? 6 : 3), 0);
  const growing = (doy >= g0 && doy <= g1) || inGreensSeason(doy);
  const stocked = finished(s, 'pond').filter(st => { const p = farmOf(s).ponds[st.id]; return !!p && p.trout + p.crayfish > 0; }).length;
  return {
    orchard: orchardChoreRate(s, doy),
    greenhouse: growing ? Math.min(30, gh) : 0,
    pond: Math.min(24, 6 * stocked),
  };
}
