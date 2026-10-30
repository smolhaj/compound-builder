/**
 * Four buildings that spread the compound out (docs/DECISIONS.md, "Cabin village, helipad, tower pod and stilted house"), each with a
 * role on the rules that already exist: where people sleep (sim/housing.ts), who is seen and who sees (sim/towers.ts, sim/opsec.ts,
 * sim/encounters.ts postureOf), what a flood takes (sim/terrainFx.ts), and who gets to a hospital (sim/medical.ts).
 *
 *  Cabin village  six sleeping cabins in a ring round a green and a fire circle (24 m across): twelve bunks, so a household can take in
 *                 kin, workers and the people at the gate without anyone in the main house's living room. The cabins face inward and
 *                 their blank backs face out, so the ring is also a wall: the people sleeping in the outer cabins hear what comes up
 *                 the drive (+8 warning once there are people to sleep in them, +4 for a sleeper in only a few of them). Twelve beds' worth of
 *                 chimneys and lit windows show: opsec weight 8. A second roof if the main house burns.
 *  Helipad        a 12 x 12 m concrete pad with edge lights and a windsock. While the county works a hurt person who is bad enough (a deep
 *                 wound or burn, a broken leg or hip) is flown to a trauma centre instead of waiting on a drive: it is billed $38,000
 *                 (15 % of that with insurance) and the case is closed (severity down to a recovering 25). No helicopter of your own.
 *                 It is loud and bright when used, and a landing zone shows from the air: opsec weight 7.
 *  Tower pod      a glazed observation pod on a 12 m mast (sim/towers.ts `tower_pod`): the longest sight of any tower, the worst cover.
 *  Stilted house  a two-room house on piles, its floor 2.4 m up: it stands on a steep slope with no pad or retaining wall, a flood passes
 *                 under it (the house is spared where a grounded one is not), vermin and snow do not reach the floor, and the space beneath
 *                 holds firewood and a vehicle. A wildfire is worse for it (a wooden crawlspace burns from below: 1.5x the odds) and a
 *                 crew has to come up a stair (a raid's breach takes a ladder: the sleeper is warned by the boards).
 * Pure (tested).
 */
import { type GameState, type Structure } from './state';
import { isFinished } from './construction';
import { countyWorks } from './paperwork';

export const CABIN_BUNKS = 12;
export const AIRLIFT_USD = 38_000, AIRLIFT_INSURED = 0.15;
/** Warning points a ring of cabins adds, and the sleepers (of the household and its guests) it takes to hear the drive. */
export const VILLAGE_WATCH = 8;

const fin = (s: GameState, kind: string): Structure[] => s.structures.filter(st => st.kind === kind && isFinished(st));

export const hasHelipad = (s: GameState): boolean => fin(s, 'helipad').length > 0;
/** A helicopter can come: the county's air ambulance works (the medical and the bank tracks) and there is a pad. */
export const airliftReady = (s: GameState): boolean => hasHelipad(s) && s.disaster.tracks.medical >= 0.5 && s.disaster.tracks.banks >= 0.5 && countyWorks(s);
/** What the flight is billed to this household. */
export const airliftBill = (s: GameState): number => Math.round(AIRLIFT_USD * (s.paper.insured ? AIRLIFT_INSURED : 1));

/** Is this injury bad enough for the air ambulance (by kind and severity)? */
export function airliftCase(kind: string | undefined, sev: number, bone?: string): boolean {
  if (kind === 'wound' || kind === 'burn') return sev >= 60;
  if (kind === 'fracture') return bone === 'hip' || bone === 'leg';
  if (kind === 'infection') return sev >= 80;
  return false;
}

/** Warning the ring of cabins adds to the posture's detection: sleepers in the outward cabins hear the drive. */
export function villageWatch(s: GameState): number {
  const v = fin(s, 'cabin_village');
  if (!v.length) return 0;
  const people = s.personState.filter(ps => ps.needs.died == null).length;
  return people >= 4 ? VILLAGE_WATCH : VILLAGE_WATCH / 2;
}

/** Structures a flood passes under: a stilted house is raised above the water. */
export const RAISED_KINDS: readonly string[] = ['stilted_house'];
/** Wildfire odds against a stilted house (a wooden crawlspace burns from below). */
export const STILT_FIRE_K = 1.5;
