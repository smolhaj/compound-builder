/**
 * Water war (WP10; docs/scenarios/water_war.md). A river compact breaks, the reservoir dies and the water table falls. Wells draw down on
 * the drought table (effects.wellYield reads sim/waterWar.ts), the ditch rider checks the headgate, tanker gangs sell protection, and a
 * poisoned supply sickens whoever drinks it untreated.
 */
import type { KindFx } from '../disasterFx';
import type { GameState } from '../state';
import { kindBag } from '../physical';
import { startCase } from '../medical';
import { treated } from '../sanitation';
import { waterCut } from '../waterWar';
import { bulletin, living, since, sev, warnFrac, clamp01, type Line } from './kit';

export interface WaterState { riderTaken: number; sick: number }
export const waterOf = (s: GameState): WaterState => kindBag<WaterState>(s, 'water_war', () => ({ riderTaken: 0, sick: 0 }));
const cut = (s: GameState): number => waterCut(s.disaster.variant, since(s));

const LINES: Line[] = [
  [0, 3, 'the municipal system is rationed to three hours a day; the reservoir is at dead pool.', 3],
  [2, 90, 'the water board will inspect headgates on the creek: take no more than your decree.', 2],
  [5, 120, 'tanker trucks are selling at fifty cents a gallon, with armed men on the running boards.', 2],
  [10, 300, 'a sheriff\'s deputy is escorting the county water truck to the nursing home.', 1],
  [20, 400, 'two neighbors came to blows over a cut fence at the ditch.', 2],
  [40, 500, 'boil every drop: the creek tested positive for dysentery bacteria.', 2],
];

export const fx: KindFx = {
  onWarning: () => ['The reservoir is at a record low and the irrigation district is cutting junior rights. Fill every tank and barrel you have.'],
  onHit: s => [s.disaster.variant === 'contamination' ? 'The water supply tested positive for a contaminant. Boil or filter every drop.' : 'The water is rationed. The state will cut the creek diversions and check headgates in 30 days.'],
  daily(s, ctx) {
    const out: string[] = [], W = waterOf(s);
    // the ditch rider: every 30 days he takes a share of the stored water, more if you have a creek diversion
    if (s.disaster.variant !== 'contamination' && ctx.day >= 30 && ctx.day % 30 === 0) {
      const share = (s.site.creek ? 0.3 : 0.15) * sev(s), took = Math.round(s.utilities.storedL * share);
      if (took > 0) { s.utilities.storedL -= took; W.riderTaken += took; out.push(`The ditch rider checked the headgate and took ${took.toLocaleString('en-US')} liters from the tank for the common ditch.`); }
    }
    // a poisoned supply or camp water: sickness for anyone who drinks it untreated
    if ((s.disaster.variant === 'contamination' ? ctx.day <= 60 : ctx.day <= 200) && !treated(s))
      for (const { p } of living(s)) if (ctx.r() < (s.disaster.variant === 'contamination' ? 0.03 : 0.008) * sev(s) && startCase(s, p.id, 'dysentery', 30, { src: 'water' })) { W.sick++; out.push(`${p.first} is sick: the water was not safe.`); }
    return out;
  },
  priceMods: s => (since(s) < 0 ? 1 + 0.1 * warnFrac(s) : 1 + 0.35 * cut(s) + 0.2 * (1 - s.disaster.tracks.stores)),
  supplyMods: s => ({ grow: s.disaster.variant === 'contamination' ? 1 : s.utilities.storedL > 2000 ? 0.9 : 0.8 }),
  encounterWeights(_s, { scale, w }) {
    scale('gang', 1.4); scale('looters', 1.2); scale('refugees', 2); scale('militia', 1.5); scale('trader', 1.5);
    w.push(['requisition', 4]);
  },
  npcMods: s => 1 + 0.9 * cut(s),
  serviceMods: s => ({ medical: 1 - 0.1 * cut(s) }),
  medical: s => (since(s) >= 0 && since(s) < 120 ? { contact: 0, spread: s.disaster.variant === 'contamination' ? 0.03 : 0.012 } : null),
  radioBulletins: (_s, ctx) => bulletin(LINES, ctx),
  oasisWeight: s => 0.3 * clamp01(cut(s) / 0.6),
};
