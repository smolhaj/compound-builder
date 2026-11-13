/**
 * Test kit for the defense payoff table and its ordering tests: the same family and stores behind five defense tiers.
 * Not a test file (sim/defenseTiers.test.ts and scripts/defenseTiers.test.ts use it).
 */
import { newGame, type GameState } from './state';
import { planRun, type PerimeterKind } from './perimeter';
import { hireGuard } from './guards';
import { adoptDog } from './pets';
import type { BattleOptions } from './battle';

export const TIER_NAMES = ['none', 'fence', 'stone_wall', 'wall_towers', 'fortress'] as const;
export type Tier = (typeof TIER_NAMES)[number];
export const DEFENSE_TIERS = TIER_NAMES;

export const TIER_CREWS: Record<string, { n: number; o: BattleOptions }> = {
  looters6: { n: 6, o: { temper: 'desperate', kind: 'looters' } },
  gang8: { n: 8, o: { temper: 'hard', kind: 'gang', organized: true } },
  militia8: { n: 8, o: { temper: 'hard', kind: 'militia', organized: true } },
  savage10: { n: 10, o: { temper: 'savage', kind: 'gang', organized: true } },
  overwhelming18: { n: 18, o: { temper: 'savage', kind: 'militia', organized: true } },
};

/** One lot at the same wealth for every tier: farmhouse, barn, stores, an armed family; only the defense differs. */
export type Extra = 'guards' | 'dogs' | 'cameras';
export function tierGame(seed: number, diff: 'cozy' | 'standard' | 'hardcore', tier: Tier, only?: readonly Extra[]): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down', difficulty: diff });
  g.structures.push({ id: 'house', kind: 'farmhouse', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
  const extras: readonly Extra[] = only ?? (tier === 'fortress' ? ['guards', 'dogs', 'cameras'] : []);
  if (extras.includes('guards')) { g.money = 1e6; for (let i = 0; i < 3; i++) hireGuard(g); }   // hired while an agency still sends guards; they stay on through the collapse
  g.clock.t = Math.floor(g.disaster.hitAt + 200) + 0.5;
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
  Object.assign(g.stock, { canned: 20, fuel: 10, meds: 3 });
  for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 6; }
  g.armory.ammo['556'] = 2000;
  const wall = (kind: PerimeterKind) => { const r = planRun(g, kind, [[-15, -15], [15, -15], [15, 15], [-15, 15], [-15, -15]]); r.done = r.hours; r.supplied = true; r.finishedAt = 0; };
  const towers = () => { g.structures.push({ id: 'tw', kind: 'watchtower_wood', x: 6, z: 9, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 }, { id: 'tw2', kind: 'watchtower_wood', x: -8, z: -9, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 }); g.stock.sandbags = 6; };
  if (tier === 'fence') wall('woven_wire');
  if (tier === 'stone_wall' || tier === 'wall_towers' || tier === 'fortress') wall('stone_wall');
  if (tier === 'wall_towers' || tier === 'fortress') towers();
  if (extras.includes('dogs')) { adoptDog(g, { guard: true, training: 80, ageYears: 3 }); adoptDog(g, { guard: true, training: 80, ageYears: 3 }); }
  if (extras.includes('cameras')) { g.stock.cameras = 3; g.utilities.lit = ['house']; }
  return g;
}

/** Family members killed in a fight (contract guards who fell are not family). */
export function familyDeaths(g: GameState, b: { units: Array<{ id: string; personId?: string }>; events: Array<{ kind: string; unit?: string }> }): number {
  const fam = new Set(b.units.filter(u => u.personId && g.people.some(p => p.id === u.personId)).map(u => u.id));
  return b.events.filter(e => e.kind === 'death' && e.unit && fam.has(e.unit)).length;
}
