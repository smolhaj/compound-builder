/** The registry of animal models by kind (docs/DECISIONS.md, "Realistic livestock"). Models are built lazily and kept. */
import type { StockKind } from './livestockPlan';
import { COW_BEEF, COW_DAIRY } from './modelCattle';
import { GOAT_MODEL, PIG_MODEL, SHEEP_MODEL } from './modelFarm';
import { HEN_MODEL, RABBIT_MODEL, ROOSTER_MODEL } from './modelSmall';
import type { AnimalModel } from './animalParts';

export type ModelId = 'cow' | 'steer' | 'goat' | 'sheep' | 'pig' | 'rabbit' | 'hen' | 'rooster';
export const MODEL_IDS: readonly ModelId[] = ['cow', 'steer', 'goat', 'sheep', 'pig', 'rabbit', 'hen', 'rooster'];

/** Which model draws a kind. `who` is the animal id: the first hen of a coop is its rooster. */
export function modelFor(kind: StockKind, who: string): ModelId {
  if (kind === 'hen') return who === 'rooster' || who === 'hen0' ? 'rooster' : 'hen';
  return kind;
}

const FACTORY: Record<ModelId, () => AnimalModel> = {
  cow: COW_DAIRY, steer: COW_BEEF, goat: GOAT_MODEL, sheep: SHEEP_MODEL, pig: PIG_MODEL, rabbit: RABBIT_MODEL, hen: HEN_MODEL, rooster: ROOSTER_MODEL,
};
const cache = new Map<ModelId, AnimalModel>();
export function modelOf(id: ModelId): AnimalModel {
  let m = cache.get(id);
  if (!m) { m = FACTORY[id](); cache.set(id, m); }
  return m;
}
