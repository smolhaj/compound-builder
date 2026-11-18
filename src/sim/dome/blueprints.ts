/** The dome blueprints: one per tier, stages and materials from `domeCost` (sim/dome/cost.ts), hours split over the five shared stages. Pure. */
import type { Blueprint } from '../blueprints';
import { domeCost } from './cost';
import { DOME_KIND, DOME_TIERS, TIER, type DomeTier } from './tiers';
import { STAGE_SPLIT } from './dig';

const NAMES: Record<DomeTier, [string, string, string, string, string]> = {
  earthen: ['Stake the circle, cut the sod and dig the footing trench', 'Pour the gravel footing and set the stem of earthbags', 'Backfill the trench and lay the earthbag courses to the crown', 'Plaster the shell and lay the sod crown', 'Door, vent, shelf and a rug'],
  geodesic: ['Stake the circle, then dig the crater down to the skirt and haul the spoil', 'Lay the utilities and airlock sleeves, then form and pour the buried skirt', 'Backfill round the skirt and raise the geodesic frame on the hubs', 'Glaze it in twin-wall polycarbonate and film, and seal the joints', 'Fit the airlocks, commission the air plant, lay paths and beds'],
  glass: ['Stake and survey the circle, then dig the crater down to the skirt and haul the spoil', 'Lay the utilities and airlock sleeves, then form and pour the deep buried skirt', 'Backfill round the skirt and crane-set the steel gridshell', 'Set the laminated glass panes and seal the joints', 'Fit the airlocks, commission the air plant, drainage, paving and lighting'],
  arcology: ['Survey and bore the site, build the haul road, dig the crater down to the skirt', 'Lay the utilities and airlock sleeves, then form and pour the deep buried skirt', 'Backfill round the skirt and raise the space frame on cranes, by the contractor\'s firm', 'Set the armored panels and seal them', 'Fit the airlock vestibules, commission the air plants, interior landscape and controls'],
};
const IDS = ['site', 'foundation', 'frame', 'roof', 'finish'] as const;

export function domeBlueprint(tier: DomeTier, cells: number = TIER[tier].cells, kind: string = DOME_KIND[tier]): Blueprint {
  const c = domeCost(tier, cells);
  return {
    kind,
    stages: IDS.map((id, i) => ({ id, name: NAMES[tier][i], hours: Math.max(2, Math.round(c.hours * STAGE_SPLIT[tier][i])), materials: c.stages[id] })),
  };
}
export const DOME_BLUEPRINTS: Blueprint[] = DOME_TIERS.map(t => domeBlueprint(t));
export const DOME_HOURS = Object.fromEntries(DOME_TIERS.map(t => [DOME_KIND[t], TIER[t].hours]));
