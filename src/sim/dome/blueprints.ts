/** The dome blueprints: one per tier, stages and materials from `domeCost` (sim/dome/cost.ts), hours split over the five shared stages. Pure. */
import type { Blueprint } from '../blueprints';
import { domeCost } from './cost';
import { DOME_KIND, DOME_TIERS, TIER, type DomeTier } from './tiers';

const NAMES: Record<DomeTier, [string, string, string, string, string]> = {
  earthen: ['Stake the circle, cut the sod and dig the footing', 'Tamp the gravel footing and the stem of earthbags', 'Lay and tamp the earthbag courses, corbel to the crown', 'Plaster the shell and lay the sod crown', 'Door, vent, shelf and a rug'],
  geodesic: ['Stake the circle, survey it and dig the skirt trench', 'Pour the ring beam and the buried skirt', 'Raise the geodesic frame, strut by strut, on the hubs', 'Glaze it: twin-wall polycarbonate and film, berm up to the knees', 'Air plant, airlocks, paths and beds'],
  glass: ['Stake the circle, soils report, dig the skirt trench', 'Pour the ring beam and the deep buried skirt', 'Crane-set the steel gridshell', 'Set the laminated glass panes and seal the joints', 'Air plant, airlocks, drainage, interior paving and lighting'],
  arcology: ['Survey, geotechnical borings, haul road and the skirt trench', 'Pour the stem wall, the ring beam and the deep buried skirt', 'Raise the space frame on cranes, by the contractor\'s firm', 'Set the armored polycarbonate-composite panels and seal them', 'Air plants, the airlock vestibules, interior landscape and controls'],
};
const SPLIT: Array<[number]> = [[0.06], [0.22], [0.32], [0.28], [0.12]];
const IDS = ['site', 'foundation', 'frame', 'roof', 'finish'] as const;

export function domeBlueprint(tier: DomeTier, cells: number = TIER[tier].cells, kind: string = DOME_KIND[tier]): Blueprint {
  const c = domeCost(tier, cells);
  return {
    kind,
    stages: IDS.map((id, i) => ({ id, name: NAMES[tier][i], hours: Math.max(2, Math.round(c.hours * SPLIT[i][0])), materials: c.stages[id] })),
  };
}
export const DOME_BLUEPRINTS: Blueprint[] = DOME_TIERS.map(t => domeBlueprint(t));
export const DOME_HOURS = Object.fromEntries(DOME_TIERS.map(t => [DOME_KIND[t], TIER[t].hours]));
