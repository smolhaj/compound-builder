/** The registry of wildlife and dog models (docs/DECISIONS.md, "Realistic wildlife and dogs"). Models are built lazily and kept. */
import type { AnimalModel } from '../livestock/animalParts';
import { GOOSE_MODEL, DUCK_MODEL, GROUSE_MODEL, TURKEY_MODEL } from './models/birds';
import { RABBIT_WILD_MODEL, SQUIRREL_MODEL } from './models/small';
import { DOG_BREEDS, DOG_MODEL } from './models/dogs';
import { BEAR_MODEL, COUGAR_MODEL, COYOTE_MODEL, WOLF_MODEL } from './models/predators';
import { DEER_MODEL, ELK_MODEL, JAVELINA_MODEL, MOOSE_MODEL, PRONGHORN_MODEL } from './models/hoofed';

export type DogModelId = `dog_${'lab' | 'shepherd' | 'hound' | 'collie' | 'terrier' | 'mutt'}`;
export type WildModelId = DogModelId | 'deer' | 'elk' | 'moose' | 'pronghorn' | 'javelina' | 'bear' | 'cougar' | 'wolf' | 'coyote' | 'turkey' | 'grouse' | 'duck' | 'goose' | 'rabbit' | 'squirrel';
export const WILD_MODEL_IDS: readonly WildModelId[] = [...DOG_BREEDS.map(b => `dog_${b}` as DogModelId), 'deer', 'elk', 'moose', 'pronghorn', 'javelina', 'bear', 'cougar', 'wolf', 'coyote', 'turkey', 'grouse', 'duck', 'goose', 'rabbit', 'squirrel'];

const FACTORY: Record<WildModelId, () => AnimalModel> = {
  dog_lab: () => DOG_MODEL('lab'), dog_shepherd: () => DOG_MODEL('shepherd'), dog_hound: () => DOG_MODEL('hound'), dog_collie: () => DOG_MODEL('collie'), dog_terrier: () => DOG_MODEL('terrier'), dog_mutt: () => DOG_MODEL('mutt'),
  deer: DEER_MODEL, elk: ELK_MODEL, moose: MOOSE_MODEL, pronghorn: PRONGHORN_MODEL, javelina: JAVELINA_MODEL, bear: BEAR_MODEL, cougar: COUGAR_MODEL, wolf: WOLF_MODEL, coyote: COYOTE_MODEL, turkey: TURKEY_MODEL, grouse: GROUSE_MODEL, duck: DUCK_MODEL, goose: GOOSE_MODEL, rabbit: RABBIT_WILD_MODEL, squirrel: SQUIRREL_MODEL };
const cache = new Map<string, AnimalModel>();
export function wildModelOf(id: string): AnimalModel {
  let m = cache.get(id);
  if (!m) { const f = (FACTORY as Record<string, () => AnimalModel>)[id]; if (!f) throw new Error('no animal model ' + id); m = f(); cache.set(id, m); }
  return m;
}
export const isWildModel = (id: string): boolean => id in FACTORY;
