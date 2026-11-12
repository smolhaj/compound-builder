/**
 * Regressions from the 108-scene routing sweep (3 walls x night gang / day raid / invasion x seeds 1..12): five scenes left a raider with no route.
 *  - three were the router's failure memory: a leg that failed because the house door would be shut when he got there was remembered for the moment the door was open
 *    (same points, same set of open doors), so the wait-for-the-door retry was refused (cutNav `openingsAt` now includes the next change);
 *  - two were a short leg inside the house after the scene's small search boxes had been retired for failing often: only they can resolve a 0.07 wide interior
 *    doorway (cutNav `LOCAL_LEG`).
 * Each combo below used to throw "routing failed" from `prepared`.
 */
import { describe, it } from 'vitest';
import { scenes, prepared } from './cutFixtures';

const NIGHT = [2.25, 'gang', 10, 'savage'] as const, INVASION = [2.25, 'gang', 12, 'savage'] as const;
const CASES: Array<[string, readonly [number, 'gang', number, 'savage'], number, string]> = [
  ['log_palisade', NIGHT, 3, 'door shut on arrival, then open'],
  ['log_palisade', INVASION, 12, 'door shut on arrival, then open'],
  ['container_wall', NIGHT, 9, 'door shut on arrival, then open'],
  ['log_palisade', NIGHT, 10, 'interior doorway after the small boxes were retired'],
  ['container_wall', NIGHT, 12, 'interior doorway after the small boxes were retired'],
];
describe('every unit that should reach its goal gets a route (previously failing sweep scenes)', () => {
  for (const [wall, [hour, kind, size, temper], seed, why] of CASES) {
    it(`${wall} ${size === 12 ? 'invasion' : 'night gang'} seed ${seed}: ${why}`, () => {
      const { g, battles } = scenes(seed, hour, kind, size, temper, wall);
      for (const b of battles) prepared(b, g, seed * 17);   // throws when any leg is unrouted
    }, 120000);
  }
});
