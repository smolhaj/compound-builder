/**
 * A fight at the compound, simulated second by second into a timeline the
 * world plays back (battleTypes.ts is the contract). Pure and seeded.
 *
 *  Detection  dogs, sensors, tripwires, cameras or the watch: how early the alarm goes.
 *  Lights     motion floodlights at night (with power) take away the dark.
 *  Posts      fighters (adults, teens 15+) take posts by value: tower > sandbags >
 *             wall > window > open; the rest go to the bunker / safe room / house.
 *  Defenders  shoot the most dangerous raider they can see (close, carrying an
 *             explosive, caught in the open); fall back when a post is under heavy
 *             fire or is wrecked; a medic drags the wounded inside.
 *  Raiders    advance in bounds from cover to cover (half suppress, half move),
 *             drift to the weaker flank, throw grenades inside ~30 m, fire rockets
 *             at the best post; mines go off as they cross the mined band; they
 *             break off at ~40% losses or when the leader goes down.
 *  Breach     at the line with the defense down or outnumbered (or a wall blown):
 *             they pour in, and anyone not in a shelter can be hurt or killed.
 *
 * Distances are world units (1 ≈ 6 m).
 */
import { BUNKER_ENTRANCES } from './bunkerEntrances';
import { sallyPorts, sortieFactor } from './rings';
import { ANIMALS } from './livestock';
import { guardDogs, lanePace, routeAt, spawnArc } from './laneWalk';
import { livingDogs } from './pets';
import { OUTSIDE_TAKE, exposure, ringDelay, ringRadii, lossesByRing, type RingLoss } from './ringFallback';
import { wallHoldSeconds } from './retaining';
import type { Battle, BattleEvent, BattleUnit } from './battleTypes';
import { GUN, skillOf, type Caliber } from './armory';
import { gearPosture } from './gear';
import { dogCount, dogsInBattle } from './pets';
import { watchDetection } from './daily';
import { fogSightK } from './fogFx';
import { backgroundOf } from './family';
import { isHome } from './blueprints';
import { coverFactor } from './housingStyles';
import { sleepSpotFor } from './housing';
import { gatePoint, raidDelta } from './quarters';
import { houseCoverK } from './houseHardening';
import { isFinished } from './construction';
import { PERIMETER, fenceLive, runFinished, withKnownWalls, type PerimeterRun } from './perimeter';
import { climbPenaltyK, topClimb } from './wallTops';
import { ARMORY_LIGHTS, floodlightLit } from './lights';
import { DOOR_DELAY, doorsLocked, raidAngle } from './terrainFx';
import { moatFx } from './waterWorks';
import { lureOf, raidYardLosses } from './vehicleYard';
import { doorTierOf, planBreach, type DoorPlan } from './doorBreach';
import { sapperBreach } from './corridors';
import { roadStart } from './roadFx';
import { WALK_CLIMB_FACTOR, WALK_POST, deckSpots, walkLength, walkRuns } from './walkway';
import { TURRET_JAM, highBonus, litTowerIds, isTower, mountReady, towerPosture, towerPosts, towerReach, turretsReady } from './towers';
import { enclosure } from './enclosure';
import { mulberry32 } from './rng';
import { diffOf } from './difficulty';
import { extraKit } from './adaptive';
import { leaveAftermath } from './aftermath';
import { peopleAfterFight } from './people';
import { fightNerves } from './mind';
import { hourOf, type GameState } from './state';
import { pluralize } from './words';
import { FireMap, PARTIAL_HIT, fireBoxesOf, fireLine, FIRE_SOLID, stepHeight, type Sight, type Stance } from './lineOfFire';
import { breachFates, takeCap, type Fate } from './breachFates';
import { crewKindOf, crewSurrenders, downedSurrenderOdds, type CrewKind } from './surrender';
import { FUSE_S, blastOdds, chooseHow, countersOf, crewMeans, ramOdds, truckSeconds, wallTarget, whyRamFailed, type BreachHow, type CrewMeans } from './breachMeans';
import { nervesAim, woundFx } from './lingering';
import { WALL_RESIST } from './breachMeans';
import { envOf, FLARE, SMOKE_ACC } from './raidConditions';
import { scoutSpotted, weakestApproach, workerAmbush, OUTDOOR_TASKS } from './raidOpeners';
import { dispositionOf, doorSeconds, hidingFate, snapOdds, temperamentOf } from './crewMercy';
import { ORDER_FX, STAGE_COVER, STAGE_HOLD, nextStage, orderAt, stageRadius, type RaidOrder } from './raidOrders';
import { arsonOdds, holdingsOf, parleyAccepted, parleyOffer, planLoot, FIREPROOF, type LootItem } from './raidOutcomes';
import type { BreachWhere, RaidFacts, RaidOrderKind, RaidStage } from './battleTypes';
import { leaderNameOf, lootLines, raidText } from './raidFacts';
import { TRIBUTE_SHARE } from './raidOutcomes';
import { startFires } from './raidFire';
import { exposedBeyond } from './raidOrders';
import { shock } from './mind';
import { addStory, makeStory, raiderName } from './raiderStory';

type Post = NonNullable<BattleUnit['post']>;
interface PostSpot {
  kind: Post; x: number; z: number; y: number; cover: number; value: number; cap: number; wrecked: boolean; fire: number;
  /** A tower's post (sim/towers.ts): how much farther a rifle reaches from up there, an accuracy factor, and a ring-mounted gun on it. */
  reach?: number; acc?: number; mount?: boolean;
  /** How many of the places the crew comes from this post can hit at all, 0-1 (a wall post behind a solid wall sees nothing at ground level). */
  view?: number;
}
export interface Arm { range: number; rate: number; acc: number; auto: boolean; cal: Caliber | null; mag: number; feed: 'mag' | 'tube' }

/** Range (units), shots a second, accuracy factor, full auto. Types a branch may not have still work. */
/** Magazine (or tube / cylinder / internal box) capacity: a tube or cylinder is loaded a round at a time. */
export const ARMS: Record<string, Omit<Arm, 'cal'>> = {
  rimfire: { range: 15, rate: 0.5, acc: 0.6, auto: false, mag: 10, feed: 'mag' },
  bolt: { range: 60, rate: 0.25, acc: 1.3, auto: false, mag: 5, feed: 'tube' },
  lever: { range: 30, rate: 0.35, acc: 1, auto: false, mag: 7, feed: 'tube' },
  semi_rifle: { range: 50, rate: 0.5, acc: 1.1, auto: false, mag: 30, feed: 'mag' },
  auto_rifle: { range: 45, rate: 0.45, acc: 1, auto: true, mag: 30, feed: 'mag' },
  smg: { range: 15, rate: 0.5, acc: 0.8, auto: true, mag: 30, feed: 'mag' },
  pump: { range: 7, rate: 0.3, acc: 1.4, auto: false, mag: 6, feed: 'tube' },
  pistol: { range: 5, rate: 0.4, acc: 0.8, auto: false, mag: 15, feed: 'mag' },
  revolver: { range: 5, rate: 0.3, acc: 0.8, auto: false, mag: 6, feed: 'tube' },
};
/** The share of rounds at a tower's cab that still find it (the parapet and the angle), on top of the post's own cover. */
export const TOWER_PARAPET = 0.7;
/** The heavy gun on a tower's ring: belt-fed, full auto, long reach (sim/towers.ts mountReady). */
const MOUNT_GUN: Omit<Arm, 'cal'> = { range: 70, rate: 0.9, acc: 0.95, auto: true, mag: 100, feed: 'mag' };
/** The remote turret: fast, steady, accurate, fed from a 200-round can. */
export const TURRET_GUN: Omit<Arm, 'cal'> = { range: 60, rate: 0.75, acc: 1.0, auto: true, mag: 200, feed: 'mag' };
export const FISTS: Arm = { range: 0.6, rate: 0.5, acc: 0.8, auto: false, cal: null, mag: 0, feed: 'mag' };
/** What a wall does to the crew getting over it, a chance per raider at the line each second, and how badly (hp). */
const WALL_HAZARD: Record<string, { p: number; min: number; max: number; what: string; lines: string[] }> = {
  barbed_wire: { p: 0.07, min: 10, max: 35, what: 'barbed wire', lines: ['AGH — the wire — it\'s in my — FUCK!', 'Cut — I\'m cut — get me off this —', 'The barbs — oh Jesus, my hands —'] },
  woven_wire: { p: 0.04, min: 8, max: 25, what: 'wire', lines: ['Shit — it\'s got me — hold it, hold it —', 'The wire — I\'m caught!'] },
  thorn_hedge: { p: 0.09, min: 8, max: 30, what: 'thorns', lines: ['The thorns — Jesus, they\'re like knives —', 'I can\'t get through this — AGH — my face!', 'It\'s all thorns — back, BACK —'] },
  ditch: { p: 0.06, min: 15, max: 50, what: 'ditch', lines: ['I fell — my leg — I think it\'s broken —', 'The ditch — I can\'t climb out —'] },
  log_palisade: { p: 0.02, min: 10, max: 30, what: 'sharpened logs', lines: ['Splinters — shit — the points —', 'Slipped — I slipped — my arm —'] },
  chain_link: { p: 0.025, min: 6, max: 20, what: 'chain-link', lines: ['The fence — it\'s cutting my hands —', 'Shit — it\'s sharp at the top — AGH!'] },
  wrought_iron: { p: 0.03, min: 10, max: 30, what: 'iron spikes', lines: ['The points — it\'s got me — oh God —', 'Slipped — the spikes — my leg!'] },
  iron_barbed: { p: 0.08, min: 12, max: 38, what: 'barbed wire on iron', lines: ['The wire — and the spikes — I can\'t —', 'AGH — it\'s everywhere — get me off —'] },
  concrete_wall: { p: 0.02, min: 8, max: 25, what: 'smooth concrete', lines: ['There\'s nothing to hold — it\'s smooth — I can\'t —', 'It\'s too high — it\'s just a wall —'] },
  stone_wall: { p: 0.018, min: 8, max: 28, what: 'rough stone', lines: ['The stones — they\'re loose at the top — AGH —', 'Nothing to hold — I slipped — my hands —'] },
  container_stack: { p: 0.02, min: 10, max: 35, what: 'stacked steel', lines: ['It\'s two boxes high — I can\'t reach the top —', 'The edge — it\'s razor sharp — AGH!'] },
  steel_wall: { p: 0.015, min: 10, max: 35, what: 'razor wire', lines: ['Razor wire — Jesus — it\'s razor wire —', 'Can\'t climb it — it\'s smooth — my hands —'] },
  electric_steel: { p: 0.22, min: 25, max: 75, what: 'live wire', lines: ['AAAGH — it\'s LIVE — it\'s electrified —', 'I can\'t let go — oh God — it\'s —', 'Don\'t touch it — don\'t TOUCH it!'] },
  creek_bars: { p: 0.05, min: 8, max: 28, what: 'bars', lines: ['The bars — I can\'t get through — my hand —'] },
};
/** Houses with an upper floor to shoot from (sill about 5 m up), and how high the muzzle is there. */
const TWO_STOREY = new Set(['farmhouse', 'stone_house', 'timber_frame', 'moms_house', 'modular_home', 'lodge', 'lodge_solar', 'log_house']);
const UPPER_FLOOR_Y = 0.85;
const MOVE = 0.6;          // ≈ 3.6 m/s running
const GRENADE_RANGE = 5;   // ≈ 30 m
const ROCKET_RANGE = 50;

export interface BattleOptions {
  /** false: the raid always comes up the road side (the ground's lanes are ignored: sim/terrainFx.ts). */
  terrain?: boolean;
  /** Raiders armed with guns (false: clubs, the dead). Default true. */
  armed?: boolean;
  /** Override the explosives they carry (otherwise from how long since the collapse). */
  grenades?: number;
  rockets?: number;
  /**
   * A peacetime break-in while the law works (sim/breakins.ts): the intruders
   * are already at the house, carry a pistol at most, no armor or explosives;
   * they run at the first shot from the family (or after a few seconds facing
   * them), and someone shouts that the police are coming. No breach of a line.
   */
  peacetime?: boolean;
  /**
   * What kind of people they are once they're inside (encounters.ts raiderTemper):
   * desperate: they want the food and fight whoever fights (the default);
   * hard: they also finish off a wounded defender now and then;
   * savage: the Road / Mad Max kind: nobody is left alive, the children are taken.
   */
  temper?: RaiderTemper;
  /**
   * An organized crew (a gang, militia, a patrol, a requisition team): the only
   * ones who might carry a rocket or a bag of grenades. Default: five or more.
   */
  organized?: boolean;
  /**
   * They are already inside the wall at the start (tunnelers came up inside it,
   * or a hatch was forced): no wall to get over, so the line is breached the
   * moment they reach it. A few raiders, near the house.
   */
  insideBreach?: boolean;
  /**
   * 0-1: how far the crew has learned this place (sim/adaptive.ts, Hardcore):
   * more grenades, a rocket for an organized crew, more plate and automatic rifles.
   */
  adapt?: number;
  /**
   * An ambush at the breakout point: the crew comes up out of a hole in a
   * bunch, and is caught flat-footed for this many seconds (the family is
   * already at its posts, waiting).
   */
  ambush?: number;
  /** How the raid begins (sim/raidOpeners.ts). */
  opener?: import('./raidOpeners').Opener;
  /** The family's orders as a timeline (sim/raidOrders.ts); none: hold the line. A standing order is one at t 0. */
  orders?: RaidOrder[];
  /** QA: force what the crew brought (never saved). */
  means?: Partial<CrewMeans>;
  /** What kind of crew it is (the encounter's kind: looters, gang, militia, patrol, requisition, refugees...): surrender and the fate of the defenders at a breach depend on it (sim/surrender.ts, sim/breachFates.ts). */
  kind?: string;
}
export type RaiderTemper = 'desperate' | 'hard' | 'savage';
/** A planned battle plus what applyBattle needs (still a Battle for the playback). */
export interface PlannedBattle extends Battle {
  spent: Partial<Record<Caliber, number>>;
  minesUsed: number;
  /** Explosives left on raiders who went down (recoverable after a repelled raid). */
  dropped: { grenades: number; rpg_rounds: number };
  result: 'repelled' | 'fled' | 'breached' | 'overrun';
  /** Raiders who went down and couldn't get away: wounded, dead. */
  leftBehind?: { wounded: number; dead: number; /** Raiders who gave up (hands up, weapon down) and are held, not left hurt on the drive. */ surrendered?: number };
  /** The rings the defenders fell back through: how many inner rings there were, how many the crew took, who was hurt or killed while each was the line. */
  rings?: { of: number; fell: number; losses: RingLoss[] };
  /** The corridor (tunnel run id) the crew came by, and the charges they carried (a rocket counts two): a breach there can bring a portal down (sim/corridors `sapperBreach`). */
  via?: string;
  charges?: number;
  /** Raiders who went for the vehicle yard instead of the house (sim/vehicleYard.ts `lureOf`). */
  lure?: number;
  /** Did the crew come with the organized kit (gangs, militia: sim/vehicleYard's take chance)? */
  organized?: boolean;
}

interface Fighter {
  id: string; side: 'home' | 'raider'; pid?: string; x: number; z: number; y: number;
  hp: number; out: boolean; dead: boolean; carried?: boolean; /** Distance back along the lane's path (sim/laneWalk.ts), while the crew still walks it. */ rd?: number; arm: Arm; skill: number; readyAt: number;
  post: PostSpot | null; cover: number; moving: boolean; nextMove: number; shelter: boolean;
  grenades: number; rockets: number; leader?: boolean; medic?: boolean; fled?: boolean; rescued?: boolean; escaped?: boolean; kid?: boolean;
  /** Body armor: rifle plates, a soft (pistol-rated) vest, a ballistic helmet. */
  armor: { plate: boolean; soft: boolean; helmet: boolean };
  /** Served (military or police): no freezing at the alarm, steadier under fire. */
  vet?: boolean;
  /** Rounds in the gun; spare magazines (or handfuls of loose rounds) on them; out of both. */
  inGun: number; spare: number; dry?: boolean;
  /** Blood lost a second from an open wound (a tourniquet or pressure stops it). */
  bleed: number;
  /** How much fire is coming their way (it spoils their aim and pins them down). */
  supp: number;
  /** Night vision (or a thermal scope): the dark isn't dark. */
  nvg: boolean;
  /** The gun's condition (a worn gun jams more). */
  wear: number;
  /** On a tower's ring: the heavy gun in hand, and the one they set down (towers.ts). */
  mounted?: { arm: Arm; inGun: number; spare: number; wear: number };
  /** A turret (not a person): fires on its own, never speaks, never targeted. */
  machine?: boolean;
  /** Gave up: hands up, weapon down. A defender held at gunpoint at a breach. */
  surrendered?: boolean;
  /** The last time a defender looked for a post with a line of fire. */
  seekAt?: number;
  /** Raid depth (save v87): the one at the wheel of the truck (in the cab until it arrives), the one carrying a satchel (charge > 0 until planted), a raider carried off by his own side, one stopped to loot. */
  /** A wound from an earlier fight that has not healed: the time to a post is multiplied by this (sim/lingering.ts). */
  limp?: number;
  decoy?: boolean; veh?: boolean; charge?: number; carriedOff?: boolean; lootingUntil?: number;
  movedAt?: number; aided?: boolean; taken?: boolean; bleedAt?: number; bleedPart?: 'head' | 'torso' | 'arm' | 'leg' | 'frag'; saidAt?: number;
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Mines can be rigged only once the law is gone (they're never sold). */
export const canRigMines = (s: GameState) => s.disaster.tracks.law < 0.5;
/** Rig four mines from a hardware kit and a can of fuel. */
export function rigMines(s: GameState): string | null {
  if (!canRigMines(s)) return 'not while the law still works';
  if ((s.stock.hardware ?? 0) < 1 || (s.stock.fuel ?? 0) < 1) return 'needs a hardware kit and a can of fuel';
  s.stock.hardware -= 1; s.stock.fuel -= 1;
  s.stock.mines = (s.stock.mines ?? 0) + 4;
  return null;
}

/**
 * Mines don't know who's walking: once a day, buried charges can go off under
 * a deer, a stranger coming up the road for help, or one of your own (the
 * kids most of all). The more there are, the likelier.
 */
export function minesDay(s: GameState): string[] {
  const m = Math.floor(s.stock.mines ?? 0);
  if (m <= 0) return [];
  const day = Math.floor(s.clock.t + 0.25), r = mulberry32(s.seed * 7121 + day * 13 + 1);
  if (r() >= 0.003 * Math.sqrt(m)) return [];
  s.stock.mines = m - 1;
  const u = r();
  if (u < 0.6) return ['A mine went off in the night: a deer, by the look of it. Venison, at least.'];
  if (u < 0.85) {
    s.gate.humanity = Math.max(0, s.gate.humanity - 6);
    return [r() < 0.5 ? 'A mine went off on the drive. A stranger, walking up for help. They didn\'t make it.' : 'A mine went off on the drive. A stranger, badly hurt, dragged themselves back to the road.'];
  }
  const living = s.people.map((p, i) => ({ p, i })).filter(({ i }) => s.personState[i]?.needs.died == null);
  const kids = living.filter(({ p }) => p.kid);
  const who = (kids.length && r() < 0.6 ? kids : living)[Math.floor(r() * (kids.length && r() < 0.6 ? kids : living).length)];
  if (!who) return [];
  const n = s.personState[who.i].needs;
  n.hurt.push({ what: 'blast injuries from a mine', sev: 55 + Math.round(r() * 30), trauma: true });
  n.health = Math.max(s.disaster.difficulty === 'cozy' ? 5 : 1, n.health - 40);
  return [`${who.p.first} stepped on one of the mines. They're alive, badly hurt.`];
}

/** Body armor a fighter wears. */
export interface ArmorSet { plate: boolean; soft: boolean; helmet: boolean }
export type HitPart = 'head' | 'torso' | 'arm' | 'leg';
export type HitRoll =
  | { kind: 'stopped'; part: HitPart; by: 'plate' | 'soft' }
  | { kind: 'helmet'; part: 'head' }
  | { kind: 'kill'; part: HitPart }
  | { kind: 'wound'; part: HitPart; sev: number };

/**
 * A round that hits: where (cover hides the torso, so more heads and arms
 * get hit from behind a wall), what the armor does, and whether it kills.
 * Plates stop rifle rounds most of the time; a soft vest stops pistol
 * rounds and buckshot, not a rifle; a helmet turns some head shots into
 * a concussion. An unprotected chest or head can kill outright. Shared by
 * the fight at the compound and a rescue raid on a camp (sim/rescue.ts).
 */
export function hitRoll(r: () => number, covered: boolean, rifle: boolean, armor: ArmorSet): HitRoll {
  const u = r();
  const part: HitPart = covered ? (u < 0.25 ? 'head' : u < 0.5 ? 'torso' : u < 0.8 ? 'arm' : 'leg') : (u < 0.1 ? 'head' : u < 0.55 ? 'torso' : u < 0.78 ? 'arm' : 'leg');
  if (part === 'torso') {
    if (armor.plate && r() < 0.85) return { kind: 'stopped', part, by: 'plate' };
    if (armor.soft && !rifle && r() < 0.8) return { kind: 'stopped', part, by: 'soft' };
    if (r() < (rifle ? 0.3 : 0.18)) return { kind: 'kill', part };
    return { kind: 'wound', part, sev: 45 + r() * 35 };
  }
  if (part === 'head') {
    if (armor.helmet && r() < (rifle ? 0.35 : 0.8)) return { kind: 'helmet', part };
    if (r() < 0.75) return { kind: 'kill', part };
    return { kind: 'wound', part, sev: 55 + r() * 25 };
  }
  if (part === 'leg' && r() < 0.05) return { kind: 'wound', part, sev: 70 };   // the femoral artery
  return { kind: 'wound', part, sev: (part === 'arm' ? 20 : 25) + r() * 28 };
}

export function planBattle(state: GameState, raiders: number, seed: number, opts: BattleOptions = {}): PlannedBattle {
  const s = withKnownWalls(state);   // a run of a wall kind this build does not know reads as the weakest known one: odd data never throws
  // no crew, or nonsense for one: nobody came (a plain, harmless result rather than a throw)
  if (!Number.isFinite(raiders) || raiders < 1) return { night: false, units: [], events: [{ t: 0, kind: 'end', result: 'repelled' }], duration: 1, spent: {}, minesUsed: 0, dropped: { grenades: 0, rpg_rounds: 0 }, result: 'repelled', leftBehind: { wounded: 0, dead: 0, surrendered: 0 } };
  raiders = Math.min(400, Math.floor(raiders));
  const r = mulberry32(seed * 2654435 + 977);
  const hr = hourOf(s.clock.t), night = hr < 6 || hr >= 20;
  const fin = s.structures.filter(isFinished);
  const home = fin.find(st => isHome(st.kind)) ?? fin[0] ?? { x: 0, z: 0 };
  const C = { x: home.x, z: home.z };
  const alive = s.people.map((p, i) => ({ p, i })).filter(({ i }) => s.personState[i]?.needs.died == null && s.personState[i]?.task !== 'gone' && s.personState[i]?.task !== 'town' && !s.rescue?.raid?.team.includes(s.personState[i]?.id ?? ''));
  // the adults fight; kids hide (and get out through the tunnel if it comes to that); a teenager picks up a gun only if there aren't two adults who can
  const adultsN = alive.filter(({ p }) => !p.kid).length;
  const canFight = (p: { kid: boolean; age: number }) => !p.kid || (p.age >= 15 && adultsN < 2);
  const fightersP = alive.filter(({ p }) => canFight(p));
  const g = gearPosture(s, fightersP.length);
  const daysAfter = s.disaster.kind ? Math.max(0, s.clock.t - s.disaster.hitAt) : 0;
  const late = Math.min(1, daysAfter / 365);
  const armedR = opts.armed !== false;
  const peace = !!opts.peacetime;
  const temper: RaiderTemper = peace ? 'desperate' : opts.temper ?? 'desperate';
  const crewKind: CrewKind = crewKindOf(opts.kind);
  const organized = opts.organized ?? raiders >= 5;
  const difficulty = s.disaster.difficulty ?? 'standard';
  const disposition = dispositionOf(temper, crewKind);
  const n = (k: string) => Math.floor((s.stock as Record<string, number>)[k] ?? 0);
  const powered = s.utilities.lit.length > 0 || (s.utilities.grid && s.disaster.tracks.grid > 0.5);
  // lights in a raid: the armory's yard lights and each tower's mast, by their mode (a raid trips the motion sensors)
  const mastIds = litTowerIds(s, true);
  const mast = mastIds.length > 0;
  const lightsOn = night && ((n('floodlights') > 0 && floodlightLit(s, ARMORY_LIGHTS, true)) || mast);
  const mount = mountReady(s);
  const tw = towerPosture(s);
  const detection = Math.min(100, 25 + (s.gate.forewarned ? 20 : 0) + g.detection + tw.detection + watchDetection(s) + Math.max(0, ...fightersP.map(({ p }) => p.skills.hunter)) * 4);
  const env = envOf(s);
  // ── how the raid begins (sim/raidOpeners.ts): scouts who are or are not spotted, a diversion, an ambush of the people at work outside ──
  const opener = peace || opts.insideBreach || opts.ambush !== undefined || !armedR ? undefined : opts.opener;
  const scoutsSeen = opener?.kind === 'scouts' ? mulberry32(seed * 3301 + 17)() < scoutSpotted(detection, night) : false;
  // the road side: raiders come up from +z, give or take; a way in that is much easier than the road (terrain: sim/terrainFx.ts) draws them round to it
  const lane = opts.terrain === false ? null : raidAngle(s, r);
  const ang0 = lane ? lane.ang : Math.PI / 2 + (r() - 0.5) * 0.8;
  // scouts the watch did not see: the crew knows how the place lies and comes at its weakest wall or its gate, not the near side
  let ang = ang0;
  if (opener?.kind === 'scouts' && !scoutsSeen && !lane?.via) {
    const cand: Array<{ ang: number; score: number }> = [];
    for (let k = -3; k <= 4; k++) {
      const a = ang0 + k * Math.PI / 4, w = wallTarget(s.perimeter, C, { x: Math.cos(a), z: Math.sin(a) }, { width: 0.7, preferGate: true });
      cand.push({ ang: a, score: w ? (w.gate ? 0.4 : (WALL_RESIST[w.kind as keyof typeof WALL_RESIST]?.ram ?? 0.4) * 0.5 + (WALL_RESIST[w.kind as keyof typeof WALL_RESIST]?.blast ?? 0.6) * 0.5) : 1 });
    }
    const best = weakestApproach(cand), base = cand.find(c => c.ang === ang0)!.score, bs = cand.find(c => c.ang === best)!.score;
    if (best !== null && bs < base - 0.05) ang = best;
  }
    const intel = ang !== ang0;
  const ax = Math.cos(ang), az = Math.sin(ang);       // unit vector from the house toward the raiders
  const lx = -az, lz = ax;                            // lateral
  const at = (d: number, lat: number) => ({ x: C.x + ax * d + lx * lat, z: C.z + az * d + lz * lat });
  // the crew walks the lane's own path (round the cliffs, water and walls the terrain pass found), at the pace of the going (sim/laneWalk.ts)
  const route = lane && lane.lane.path.length > 1 && !lane.via && !intel ? lane.lane.path : null;
  const pace = lane ? lanePace(lane.lane.hardness, lane.lane.cliff, lane.lane.fords) : 1;
  const onRoute = (rd: number, lat: number) => { const q = routeAt(route!, rd); return { x: q.x - q.dz * lat, z: q.z + q.dx * lat }; };

  // ── posts ──
  // cover (the share of hits that still land): a prepared position beats what a raider finds in a ditch or behind a tree (0.4).
  // (round 4: a wall post was 0.55 and a log house 0.5–0.6, worse than the raiders' 0.3, so they out-shot a fortified family)
  const posts: PostSpot[] = [];
  for (const tp of towerPosts(s)) posts.push({ kind: 'tower', x: tp.st.x, z: tp.st.z, y: tp.post.y, cover: tp.post.cover, value: tp.post.value, cap: 1, wrecked: false, fire: 0, reach: tp.post.reach + (tp.def ? highBonus(tp.st, tp.def.kind).reach : 0), acc: tp.post.acc, mount: !!(tp.def?.mount && mount) });
  const isPostKind = (k: string) => k.includes('tower') || isTower(k);
  for (let i = 0; i < Math.min(3, n('sandbags')); i++) { const p = at(3, (i - 1) * 2.5); posts.push({ kind: 'sandbags', ...p, y: 0, cover: 0.22, value: 3, cap: 1, wrecked: false, fire: 0 }); }
  // a wall only delays a crew that has to come over it: a gap, an open gate or an unbarred creek in the property line is the way round
  const propLine = enclosure(s);
  const lineClosed = propLine.openShare === 0 && propLine.creekOpen === 0;
  let wallR = 0, wallKind = '', moatR = 0, wallRun: PerimeterRun | undefined;
  for (const run of s.perimeter) {
    if (!runFinished(run) || PERIMETER[run.kind].blocks.people <= 0 || !run.pts.length) continue;
    if (run.kind === 'moat') { moatR = Math.max(moatR, Math.max(4, Math.min(30, Math.min(...run.pts.map(([x, z]) => dist({ x, z }, C)))))); continue; }   // (a moat is crossed, not the line the defenders hold: its water is added below, sim/waterWorks.ts)
    const pts = run.pts.map(([x, z]) => ({ x, z })).sort((a, b) => ((b.x - C.x) * ax + (b.z - C.z) * az) - ((a.x - C.x) * ax + (a.z - C.z) * az));
    const rr = Math.max(4, Math.min(30, dist(pts[0], C)));
    if (rr >= wallR) { wallKind = run.kind; wallRun = run; }   // the outermost wall is the one they meet first
    wallR = Math.max(wallR, rr);
  }
  if (!wallR && moatR) { wallR = moatR; wallKind = 'moat'; wallRun = undefined; }
  // ── how they take the wall (sim/breachMeans.ts) ──
  // what the crew brought (a truck, a satchel charge) and the drawn wall segment or gate its approach crosses: the line is THAT wall, not a radius.
  // (its own random stream: nothing else in the fight is rolled differently)
  const mr = mulberry32(seed * 6151 + 29);
  const noWall = peace || !!opts.insideBreach || opts.ambush !== undefined;
  const drawnMeans = noWall ? { truck: false, satchels: 0 } : crewMeans({ kind: crewKind, men: raiders, organized, armed: armedR, late, difficulty }, mr);
  const means: CrewMeans = { truck: opts.means?.truck ?? drawnMeans.truck, satchels: opts.means?.satchels ?? drawnMeans.satchels };
  const dir = { x: ax, z: az };
  const tWall = noWall ? null : wallTarget(s.perimeter, C, dir, { width: 0.7, preferGate: false });
  const tGate = noWall ? null : wallTarget(s.perimeter, C, dir, { width: 0.7, preferGate: true });
  const ramAt = (t: BreachWhere | null) => (t ? ramOdds({ wallKind: t.kind, gate: t.gate, difficulty, ...countersOf(s, t, C, t.runId) }) : 0);
  const blastAt = (t: BreachWhere | null) => (t ? blastOdds({ wallKind: t.kind, gate: t.gate, difficulty, gateBarrier: countersOf(s, t, C, t.runId).gateBarrier }) : 0);
  const ramBest = tGate && tGate.gate && ramAt(tGate) > ramAt(tWall) ? tGate : tWall;
  const how: BreachHow = noWall || !tWall ? 'climb' : chooseHow(means, ramAt(ramBest), blastAt(tWall));
  const target: BreachWhere | null = how === 'ram' ? ramBest : tWall;
  const farR = wallR;   // the old measure of the wall's size (its farthest corner, capped at 30): how far out the crew stages
  if (target) {
    wallR = Math.max(4, Math.min(45, target.dist)); wallKind = target.kind;
    wallRun = s.perimeter.find(x => x.id === target.runId) ?? wallRun;
  }
  // the top of the outermost wall (electric outriggers, razor coils) and any step-over beside it (sim/wallTops.ts)
  // line of fire (sim/lineOfFire.ts): a ground-level shot never crosses a solid wall or a building; only a height that clears the top does
  const peaceB = !!opts.peacetime;
  const fmap = new FireMap(peaceB ? [] : fireBoxesOf(s));
  const solidSegs: Array<{ ax: number; az: number; bx: number; bz: number; h: number }> = [];
  for (const run of s.perimeter) {
    if (!runFinished(run) || !FIRE_SOLID.has(run.kind)) continue;
    for (let i = 1; i < run.pts.length; i++) solidSegs.push({ ax: run.pts[i - 1][0], az: run.pts[i - 1][1], bx: run.pts[i][0], bz: run.pts[i][1], h: PERIMETER[run.kind].height });
  }
  /** The nearest point on a solid wall within `maxD` of (x, z), the wall's height, and the unit vector from it toward the compound. */
  const snapWall = (x: number, z: number, maxD: number): { x: number; z: number; h: number; ix: number; iz: number } | null => {
    let best: { x: number; z: number; h: number; d: number } | null = null;
    for (const g of solidSegs) {
      const dx = g.bx - g.ax, dz = g.bz - g.az, l2 = dx * dx + dz * dz, tt = l2 > 0 ? Math.max(0, Math.min(1, ((x - g.ax) * dx + (z - g.az) * dz) / l2)) : 0;
      const qx = g.ax + dx * tt, qz = g.az + dz * tt, d = Math.hypot(x - qx, z - qz);
      if (d <= maxD && (!best || d < best.d)) best = { x: qx, z: qz, h: g.h, d };
    }
    if (!best) return null;
    const l = Math.hypot(C.x - best.x, C.z - best.z) || 1;
    return { x: best.x, z: best.z, h: best.h, ix: (C.x - best.x) / l, iz: (C.z - best.z) / l };
  };
  /** A post just inside the wall, where a defender stands behind it (or the spot itself where there is no solid wall near). */
  const behindWall = (p: { x: number; z: number }): { x: number; z: number } => { const q = snapWall(p.x, p.z, 7); return q ? { x: q.x + q.ix * 0.3, z: q.z + q.iz * 0.3 } : p; };
  const wallTop = topClimb(s, wallRun), climbWeak = climbPenaltyK(s, wallRun);   // a moat with no wall behind it is the line itself
  // a patrol deck on the wall (sim/walkway.ts): the posts on it are on the real deck where the raid meets the wall, higher and better covered than a spot behind it
  const decks = walkRuns(s), deckPosts = decks.length ? deckSpots(s, wallR ? [at(wallR, 0).x, at(wallR, 0).z] : [C.x, C.z], 3 + Math.min(2, Math.floor(walkLength(s) / 20))) : [];
  const deck = deckPosts.length > 0;
  if (wallR) {
    if (deck) for (const p of deckPosts) posts.push({ kind: 'wall', x: p.x, z: p.z, y: p.y, cover: WALK_POST.cover, value: WALK_POST.value, cap: 1, wrecked: false, fire: 0, reach: WALK_POST.reach, acc: WALK_POST.acc });
    else for (let i = 0; i < 3; i++) { const p = behindWall(at(wallR, (i - 1) * 4)); posts.push({ kind: 'wall', ...p, y: stepHeight(wallKind, PERIMETER[wallKind as keyof typeof PERIMETER]?.height ?? 0), cover: 0.22, value: 2, cap: 1, wrecked: false, fire: 0 }); }
  }
  // sandbags are laid on the firing step behind a wall that has one (that is where the cover is), not out in the yard where the wall hides what they could shoot at
  if (wallR && !deck && stepHeight(wallKind, 1) > 0) {
    const sy = stepHeight(wallKind, PERIMETER[wallKind as keyof typeof PERIMETER]?.height ?? 0);
    posts.filter(p => p.kind === 'sandbags').forEach((sp, i) => { const q = behindWall(at(wallR, (i - 1) * 4 + 2)); sp.x = q.x; sp.z = q.z; sp.y = sy; });
  }
  const bars = n('window_bars') > 0 ? 0.28 : 0.35;
  for (const st of fin) if (!st.kind.startsWith('bunker_') && !isPostKind(st.kind) && dist(st, C) < 25) posts.push({ kind: 'building', x: st.x + ax * 0.5, z: st.z + az * 0.5, y: 0.3, cover: bars * coverFactor(st.kind) * houseCoverK(s), value: 1, cap: isHome(st.kind) ? 2 : 1, wrecked: false, fire: 0 });
  // a two-storey house has an upper floor to shoot from: eye level clears a wall that a ground-floor window does not
  for (const st of fin) if (TWO_STOREY.has(st.kind) && dist(st, C) < 25) posts.push({ kind: 'building', x: st.x + ax * 0.5, z: st.z + az * 0.5, y: UPPER_FLOOR_Y, cover: bars * coverFactor(st.kind) * houseCoverK(s), value: 1.5, cap: 2, wrecked: false, fire: 0 });
  posts.push({ kind: 'open', x: C.x + ax * 1.5, z: C.z + az * 1.5, y: 0, cover: 1, value: 0, cap: 99, wrecked: false, fire: 0 });
  let lineR = wallR || 2;
  /** Which places the crew comes from a post can hit (0-1): the ground just outside the line, near and far. */
  const viewOf = (p: PostSpot): number => {
    if (peaceB || fmap.boxes.length === 0) return 1;
    const from: Stance = { x: p.x, z: p.z, y: p.y, kneel: p.kind === 'sandbags' };
    let seen = 0, tried = 0;
    for (const d of [3, 10]) for (const lat of [-4, 0, 4]) { tried++; const q = at(lineR + d, lat); if (fireLine(fmap, from, { x: q.x, z: q.z, y: 0 }) !== 'blocked') seen++; }
    return seen / tried;
  };
  // a post that cannot see where they come from is a last choice
  const rankOf = (p: PostSpot) => p.value + (p.view === 0 ? -3 : 0);
  for (const p of posts) p.view = viewOf(p);
  posts.sort((a, b) => rankOf(b) - rankOf(a));
  // (lineR moves in as the defenders fall back ring by ring: sim/ringFallback.ts)
  // manned inner rings (sim/rings.ts, sim/ringFallback.ts): the defenders fall back to each in turn; the crew has to take every wall under fire before the house is breached
  const ringHold = opts.insideBreach ? 0 : wallHoldSeconds(s);   // the tall retaining walls a crew has to climb or go round at the outer line (sim/retaining.ts)
  const ringRs = opts.insideBreach || opts.peacetime ? [] : ringRadii(s, C, lineR);
  const ringStay = ringDelay(s, ringRs.length);
  let ringK = 0;
  const fallTimes: number[] = [];
  // a sally port lets the defenders catch a crew held at the wall from the flank
  const sortie = sortieFactor(s);

  const shelterAt = fin.find(st => BUNKER_ENTRANCES.includes(st.kind)) ?? home;
  const hardShelter = shelterAt !== home || g.safeRoom;

  // ── units ──
  const units: BattleUnit[] = [];
  const ev: BattleEvent[] = [];
  const F: Fighter[] = [];
  const ammo: Partial<Record<Caliber, number>> = { ...s.armory.ammo };
  const spent: Partial<Record<Caliber, number>> = {};
  const free = s.armory.guns.filter(x => (ammo[GUN[x.model].cal] ?? 0) >= 1).sort((a, b) => (ARMS[GUN[b.model].type].acc * ARMS[GUN[b.model].type].range) - (ARMS[GUN[a.model].type].acc * ARMS[GUN[a.model].type].range));
  const medicId = fightersP.filter(({ p }) => p.skills.medic >= 3).sort((a, b) => b.p.skills.medic - a.p.skills.medic)[0]?.p.id;
  for (const { p } of alive) {
    const x = C.x + (r() - 0.5) * 2, z = C.z + (r() - 0.5) * 2;
    // someone in a panic does not stand a post: the shelter (sim/mind.ts)
    const fights = canFight(p) && !fightNerves(s, p).shelter;
    let arm = FISTS, wear = 1;
    if (fights) {
      const gun = free.find(x => x.carrier === p.id) ?? free.find(x => !x.carrier);
      if (gun) { free.splice(free.indexOf(gun), 1); const m = GUN[gun.model]; arm = { ...(ARMS[m.type] ?? ARMS.pistol), cal: m.cal }; if (m.capacity) arm.mag = m.capacity; if (gun.condition < 0.5) arm.acc *= 0.7; wear = gun.condition; }
    }
    const vet = backgroundOf(p) !== null;
    const hp0 = Math.max(20, s.personState.find(q => q.id === p.id)?.needs.health ?? 100);   // already hurt or sick: weaker from the start
    // a wound that has not healed (a sling, a limp) and the weeks of shaken nerves carry into this fight (sim/lingering.ts)
    const lw = woundFx(s.personState.find(q => q.id === p.id)?.needs.hurt), shaken0 = nervesAim(s.mind?.psyche[p.id]);
    if (lw.acc < 1) arm = { ...arm, acc: arm.acc * lw.acc };
    const f: Fighter = { id: `h_${p.id}`, side: 'home', pid: p.id, x, z, y: 0, hp: hp0, out: false, dead: false, arm, skill: Math.max(1, skillOf(s, p.id) - shaken0), ...(lw.limp > 1 ? { limp: lw.limp } : {}), readyAt: Infinity, post: null, cover: 0.8, moving: false, nextMove: 0, shelter: !fights, grenades: n('grenades') && fights ? 1 : 0, rockets: 0, medic: p.id === medicId, kid: p.kid, armor: { plate: false, soft: false, helmet: false }, vet, inGun: arm.mag, spare: arm.feed === 'tube' ? 4 : 2, bleed: 0, supp: 0, nvg: false, wear };
    F.push(f); units.push({ id: f.id, side: 'home', personId: p.id, x: r2(x), z: r2(z), post: 'open' });
  }
  // explosives are rare in an American collapse: a looted Guard armory, a veteran's souvenir. An organized crew may carry
  // a few grenades and, late, a rocket; a pickup of desperate men a grenade now and then, never a rocket
  // (round 4: a rocket came with every other pair of looters after day 120 and one blast took a whole family in the house)
  // a vehicle yard outside the walls draws part of a big crew away from the house (sim/vehicleYard.ts): fewer men at the wall, at the price of the trucks
  const lure = peace || opts.insideBreach ? 0 : lureOf(s, raiders);
  if (lure) raiders -= lure;
  let gLeft = opts.grenades ?? (armedR && !peace ? (organized ? Math.round(raiders * late * 0.4 * r()) : r() < late * 0.15 ? 1 : 0) : 0);
  let rLeft = opts.rockets ?? (armedR && !peace && organized && daysAfter > 120 && r() < late * 0.3 ? 1 : 0);
  // (Hardcore) a crew that has learned the place brings more of it (sim/adaptive.ts; nothing at adapt 0)
  const kit = extraKit(raiders, opts.adapt ?? 0, organized);
  if (armedR && !peace) { gLeft += kit.grenades; if (kit.rocket && daysAfter > 120) rLeft = Math.max(rLeft, 1); }
  // they come up from out of sight, well beyond the line (round 4: they used to start 30–34 out whatever the wall, so a wide palisade had them at it before anyone was up)
  const start = Math.max(30, Math.max(lineR, farR) + 22) + (opts.terrain === false || lane ? 0 : roadStart(s));   // up the road: single file at a bridge, a bore or a ford, they dismount further out (sim/roadFx.ts)
  // openers that change where the crew starts and when the main body moves (sim/raidOpeners.ts)
  const decoyN = opener?.kind === 'diversion' && raiders >= 5 ? Math.max(2, Math.round(raiders * (opener.decoy?.share ?? 0.3))) : 0;
  raiders += decoyN;   // the decoys are extra men: the main body is as strong as the crew on the card
  const angD = ang + 2.2, atD = (d: number, lat: number) => ({ x: C.x + Math.cos(angD) * d - Math.sin(angD) * lat, z: C.z + Math.sin(angD) * d + Math.cos(angD) * lat });
  const mainDelay = decoyN ? opener?.decoy?.delay ?? 16 : 0;   // (scouts do not delay the main body: they are only two men a little ahead of it, who wait for it at the wall)
  for (let i = 0; i < raiders; i++) {
    const isScout = opener?.kind === 'scouts' && raiders >= 4 && (i === 1 || i === 2), isDecoy = decoyN > 0 && i > 0 && i >= raiders - decoyN;
    const arc0 = route && !isScout && !isDecoy && !peace && !opts.insideBreach && opts.ambush === undefined ? spawnArc(route, [C.x, C.z], start + r() * 4) : undefined;
    const p = peace ? at(1.5 + r() * 2, (r() - 0.5) * 3)
      : opts.insideBreach ? at(Math.max(1.5, lineR * 0.55) + r() * 1.5, (r() - 0.5) * 2.5)
      : opts.ambush !== undefined ? at(lineR + 0.8 + r() * 0.8, (r() - 0.5) * 1.2)
      : isScout ? at(start - 6 + r() * 3, (r() - 0.5) * 6)
      : isDecoy ? atD(start - 4 + r() * 4, (r() - 0.5) * 8)
      : arc0 !== undefined ? onRoute(arc0, (r() - 0.5) * 8)
      : at(start + r() * 4, (r() - 0.5) * 8);
    const autoR = armedR && late > 0.5 && r() < 0.3 + kit.auto;
    const arm: Arm = !armedR ? FISTS : peace ? { ...ARMS.pistol, cal: null } : { ...(autoR ? ARMS.auto_rifle : r() < 0.55 ? ARMS.semi_rifle : r() < 0.6 ? ARMS.pump : ARMS.pistol), cal: null };
    const gr = gLeft > 0 ? 1 : 0; gLeft -= gr;
    const rk = rLeft > 0 && i > 0 ? 1 : 0; rLeft -= rk;
    const f: Fighter = { id: `r${i}`, side: 'raider', ...p, ...(arc0 !== undefined ? { rd: arc0 } : {}), y: 0, hp: 100, out: false, dead: false, arm, skill: 3 + Math.floor(r() * 4), readyAt: opts.ambush ?? (lane?.via ? DOOR_DELAY : isScout ? 7 : isDecoy ? 0 : mainDelay), ...(isDecoy ? { decoy: true } : {}), post: null, cover: 1, moving: true, nextMove: 0, shelter: false, grenades: gr, rockets: rk, leader: i === 0, armor: { plate: armedR && !peace && r() < late * 0.35 + kit.plate, soft: armedR && !peace && r() < 0.15 + late * 0.2, helmet: armedR && !peace && r() < late * 0.3 }, inGun: arm.mag, spare: 2 + Math.round(late * 3), bleed: 0, supp: 0, nvg: armedR && !peace && late > 0.6 && r() < 0.25, wear: 0.5 + r() * 0.4 };
    F.push(f); units.push({ id: f.id, side: 'raider', x: r2(p.x), z: r2(p.z), post: 'open' });
  }
  const H = F.filter(f => f.side === 'home'), R = F.filter(f => f.side === 'raider');
  // the driver at the wheel of the truck and the man with the satchel: kill them first and the attempt fails
  const attempts: NonNullable<RaidFacts['breach']>['attempts'] = [];
  let truck: { driver: Fighter; from: { x: number; z: number }; to: { x: number; z: number }; arriveT: number; done: boolean; lastMove: number; odds: number } | null = null;
  let sapper: Fighter | null = null, blowAt = -1, chargeOdds = 0;
  if (target && how === 'ram' && R.length >= 2) {
    const driver = R[1], to = { x: target.x + target.out.x * 0.35, z: target.z + target.out.z * 0.35 };
    driver.veh = true; driver.cover = 0.75; driver.moving = false; driver.readyAt = 0;
    const un = units.find(u => u.id === driver.id); if (un) { un.job = 'driver'; un.inVehicle = true; }
    truck = { driver, from: { x: driver.x, z: driver.z }, to, arriveT: truckSeconds(Math.hypot(to.x - driver.x, to.z - driver.z)), done: false, lastMove: -9, odds: ramAt(target) };
  }
  if (target && how === 'charge' && R.length >= 2 && means.satchels > 0) {
    sapper = R[R.length - 1]; sapper.charge = 1; chargeOdds = blastAt(target);
    const un = units.find(u => u.id === sapper!.id); if (un) un.job = 'sapper';
  }
  { const un = units.find(u => u.id === 'r0'); if (un && !peace) un.leader = true; }
  if (opener?.kind === 'scouts' && raiders >= 4) ev.push({ t: 0, kind: 'scout', units: ['r1', 'r2'], spotted: scoutsSeen, intel });
  const decoys = R.filter(f => f.decoy);
  const charges0 = R.reduce((a, f) => a + f.grenades + f.rockets * 2, 0);      // (what the crew carries in: sim/corridors `sapperBreach`)
  // automated turrets (towers.ts): powered, fed from the armory, nobody on them; never in F (they are not people, nobody hits back at them)
  const T: Fighter[] = [];
  for (const tu of turretsReady(s)) {
    const post = posts.find(p => p.kind === 'tower' && p.x === tu.st.x && p.z === tu.st.z) ?? null;
    const f: Fighter = { id: `t_${tu.st.id}`, side: 'home', x: tu.st.x, z: tu.st.z, y: post?.y ?? 1.4, hp: 100, out: false, dead: false, arm: { ...TURRET_GUN, cal: tu.cal }, skill: 5, readyAt: 0, post, cover: 0.2, moving: false, nextMove: 0, shelter: false, grenades: 0, rockets: 0, armor: { plate: false, soft: false, helmet: false }, inGun: TURRET_GUN.mag, spare: 99, bleed: 0, supp: 0, nvg: true, wear: 1, machine: true };
    T.push(f); units.push({ id: f.id, side: 'home', x: r2(f.x), z: r2(f.z), post: 'tower', y: f.y, machine: 'turret' });
  }
  // the family's armor goes to the fighters, those who served first
  {
    let plates = n('plate_carrier'), soft = n('soft_armor'), helmets = n('helmet'), nvgs = n('nvg') + n('thermal');
    for (const f of [...H].filter(h => !h.shelter).sort((a, b) => Number(!!b.vet) - Number(!!a.vet))) {
      if (plates > 0) { f.armor.plate = true; plates--; if (f.arm.feed === 'mag') f.spare = 6; } else if (soft > 0) { f.armor.soft = true; soft--; }   // a plate carrier has mag pouches
      if (helmets > 0) { f.armor.helmet = true; helmets--; }
      if (nvgs > 0) { f.nvg = true; nvgs--; }
    }
    // the playback draws it
    for (const f of F) if (f.armor.plate || f.armor.soft || f.armor.helmet) { const u = units.find(x => x.id === f.id); if (u) u.armor = { ...f.armor }; }
  }
  // who's talking (the ticker shows the speaker), and how much a wound takes out of a fighter
  const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
  const nameOf = (f: Fighter) => (f.pid ? s.people.find(p => p.id === f.pid)?.first ?? 'They' : 'Raider');
  const say = (t: number, text: string, who?: Fighter) => { ev.push({ t: r2(Math.max(0, t)), kind: 'say', text, ...(who ? { who: who.id } : {}) }); };
  const eff = (f: Fighter) => Math.max(0.15, Math.min(1, f.hp / 100));
  const lead = () => H.find(h => !h.out && !h.shelter);
  /** Civilians under fire swear and panic; those who served keep it short. */
  const v = (f: Fighter | undefined, civ: string[], vet: string[]) => pick(f?.vet ? vet : civ);
  /** A fighter's own line, not more than one every few seconds (nobody narrates every reload). */
  const sayF = (f: Fighter, t: number, civ: string[], vet: string[], gap = 6) => {
    if (f.side === 'home' && f.saidAt != null && t - f.saidAt < gap) return;
    f.saidAt = t; say(t, v(f, civ, vet), f);
  };
  let ifaks = n('ifak');
  let flareFrom = Infinity, flareUntil = -1, smokeFrom = Infinity, flaresUsed = 0;
  const fireList: RaidFacts['fires'] = [];

  // ── detection, alarm, lights ──
  // a moat across the way they come (sim/waterWorks.ts): held at the water, or filed across the covered bridge; only ever adds time and hurt
  const moat = opts.terrain === false || opts.insideBreach ? null : moatFx(s, [C.x, C.z], ang, night, detection);
  // the tunnel-bridge's doors lock at night and on the alarm (a watch good enough to call it before they arrive); by day, unwarned, they stand open
  // (sim/doorBreach.ts) a locked door is a job: tools, a ram, a torch, charges against its tier, slowed by the towers that see it and a sortie from the sally port
  let door: DoorPlan | null = null;
  if (lane?.via && opts.ambush === undefined) {
    const run = s.perimeter.find(x => x.id === lane.via), chokeAt = lane.lane.choke?.at;
    const overwatch = chokeAt ? towerPosts(s).filter(tp => Math.hypot(tp.st.x - chokeAt[0], tp.st.z - chokeAt[1]) <= 14).length : 0;
    door = planBreach({ men: R.length, grenades: R.reduce((a, f) => a + f.grenades, 0), rockets: R.reduce((a, f) => a + f.rockets, 0), organized, late, adapt: opts.adapt ?? 0 },
      { tier: doorTierOf(run?.kind, !!(run && PERIMETER[run.kind].bore)), locked: doorsLocked(night, detection), overwatch, sallyPorts: sallyPorts(s) }, r);
    for (const f of R) f.readyAt = door.secs;
    // what went into the door is not in the fight
    for (let g = door.spent.grenades; g > 0;) { const f = R.find(x => x.grenades > 0); if (!f) break; f.grenades--; g--; }
    if (door.spent.rockets) { const f = R.find(x => x.rockets > 0); if (f) f.rockets--; }
    if (door.method !== 'an open door') ev.push({ t: 0, kind: 'door', what: door.method, open: false, ...(chokeAt ? { x: r2(chokeAt[0]), z: r2(chokeAt[1]) } : {}) });
    if (!door.gaveUp && door.method !== 'an open door') {
      ev.push({ t: r2(door.secs), kind: 'door', what: door.method, open: true, ...(chokeAt ? { x: r2(chokeAt[0]), z: r2(chokeAt[1]) } : {}) });
      if (door.method === 'a charge' && chokeAt) ev.push({ t: r2(door.secs), kind: 'explosion', x: r2(chokeAt[0]), z: r2(chokeAt[1]), radius: 1, hits: [] });
    }
  }
  // by day, people on watch see a group coming up the drive a couple of hundred meters out; at night it's what the gear hears and sees
  const darkBlind = night && !lightsOn && !n('nvg') && !n('thermal') && !n('thermal_cam');
  // (round 4: measured from the line, where the watch stands and the sensors are, not from the house)
  // fog (sim/fog.ts): the towers and the people on watch see a crew a fraction as far out in dense fog (thermal gear keeps its reach, and it is in `detection`)
  const fogEye = fogSightK(s, 'eye');
  const detectAt = lineR + (towerReach(s, night, lightsOn) * fogEye + Math.max(2, (6 + detection * 0.24) * (darkBlind ? 0.7 : 1), night ? 0 : (16 + detection * 0.06) * fogEye)) * env.detect + env.animalNoise;   // (storms deaden the sound, the livestock in the yard add to it: sim/raidConditions.ts)
  const what: 'dog' | 'sensor' | 'tripwire' | 'camera' | 'watch' = dogCount(s) ? 'dog' : n('driveway_alarm') ? 'sensor' : n('tripwire') ? 'tripwire' : powered && (n('cameras') || n('thermal_cam')) ? 'camera' : 'watch';
  let alarmed = false;
  const mines = Math.min(n('mines'), 12);
  let minesLeft = mines;
  const mineR = lineR + 4;

  /** Put the heavy gun in the hand of whoever takes a mounted post, and take it away again when they leave it (or it runs dry). */
  const armFor = (f: Fighter, p: PostSpot | null) => {
    if (p?.mount && mount && !f.shelter) {
      if (!f.mounted) f.mounted = { arm: f.arm, inGun: f.inGun, spare: f.spare, wear: f.wear };
      f.arm = { ...MOUNT_GUN, cal: mount.cal }; f.inGun = MOUNT_GUN.mag; f.spare = 2; f.wear = 0.9; f.dry = false;
    } else if (f.mounted) {
      f.arm = f.mounted.arm; f.inGun = f.mounted.inGun; f.spare = f.mounted.spare; f.wear = f.mounted.wear; f.mounted = undefined; f.dry = false;
    }
  };
  /** How far a fighter's gun reaches from where they stand (a tower adds some). */
  const reachOf = (f: Fighter) => f.arm.range * (f.post?.reach ?? 1);
  /** Where a fighter stands for a shot: a height (tower, walk, upper floor, the top of a wall a climber is on), kneeling if halted behind cover. */
  const stanceOf = (f: Fighter): Stance => ({ x: f.x, z: f.z, y: f.y, kneel: f.side === 'raider' ? !f.moving && f.cover <= 0.5 : f.post?.kind === 'sandbags' });
  /** Can `a` hit `b`? Once the line is broken and they are in each other's faces inside it, the walls no longer matter. */
  const sight = (a: Fighter, b: Fighter): Sight => (breached || wallDown || peaceB || fmap.boxes.length === 0 ? 'clear' : fireLine(fmap, stanceOf(a), stanceOf(b)));
  const used = (p: PostSpot) => H.filter(h => h.post === p && !h.out).length;
  const assignPost = (f: Fighter, t: number, exclude?: PostSpot) => takePost(f, t, posts.find(p => p !== exclude && !p.wrecked && used(p) < p.cap) ?? posts[posts.length - 1]);
  const takePost = (f: Fighter, t: number, p: PostSpot) => {
    f.post = p;
    armFor(f, p);
    const tr = opts.ambush !== undefined || p.kind === 'tower' || p.kind === 'sandbags' ? 0.3 : Math.max(1, dist(f, p) / MOVE) / (0.4 + 0.6 * eff(f)) * (f.limp ?? 1);   // an ambush is already waiting at its posts, and so is the watch up a tower (it is what the tower's detection is), and so are sandbags (laid before the night, nobody runs to them)   // an ambush is already waiting at its posts
    f.x = p.x; f.z = p.z; f.y = p.y; f.cover = p.cover; f.readyAt = t + tr; f.movedAt = t;
    ev.push({ t: r2(t + 0.2), kind: 'move', unit: f.id, x: r2(p.x), z: r2(p.z), ...(p.y ? { y: p.y } : {}) });
  };
  const toShelter = (f: Fighter, t: number) => {
    f.shelter = true; f.x = shelterAt.x; f.z = shelterAt.z; f.y = 0; f.post = null;
    ev.push({ t: r2(t + 0.3), kind: 'move', unit: f.id, x: r2(shelterAt.x), z: r2(shelterAt.z) });
  };

  const hurt = (f: Fighter, sev: number, t: number, by?: Fighter, part?: 'head' | 'torso' | 'arm' | 'leg') => {
    if (f.dead) return;
    if (f.side === 'home') sev *= diffOf(s.disaster).wound;   // the difficulty: Hardcore's bullets hurt more, Cozy's less
    f.hp -= sev;
    const mate = () => H.find(h => h !== f && !h.out && !h.shelter);
    if (f.hp <= 0) {
      f.dead = true; f.out = true; ev.push({ t: r2(t + 0.05), kind: 'death', unit: f.id });
      const m = mate();
      if (f.side === 'home' && m) say(t + 0.4, v(m, [`No! ${nameOf(f)}! NO!`, `Oh God — ${nameOf(f)}! ${nameOf(f)}, get up!`, `They shot ${nameOf(f)} — fuck, fuck, FUCK!`], [`${nameOf(f)}'s down. Keep firing.`, `Man down — ${nameOf(f)}.`]), m);
      else if (f.side === 'raider' && by?.side === 'home' && !by.machine && r() < 0.5) say(t + 0.3, v(by, ['I got one — oh God, I got one.', 'He\'s down! Holy shit, he\'s down!', 'Did I — I think I hit him!'], ['One down.', 'Got him. Next.']), by);
      return;
    }
    ev.push({ t: r2(t + 0.05), kind: 'wound', unit: f.id, sev: Math.round(sev), ...(part ? { part } : {}) });
    if (f.side === 'home' && part === 'leg') say(t + 0.3, sev > 60 ? v(f, ['It\'s pumping — oh God, it\'s pumping! I need a tourniquet!', 'My leg — fuck — there\'s so much blood!'], ['Leg — arterial. Tourniquet, on me, now!']) : v(f, ['Fuck! My leg! I can\'t — I can\'t stand —', 'AHH — shit — my leg!'], ['Hit in the leg. Still in it.']), f);
    else if (f.side === 'home' && part === 'head') say(t + 0.3, v(f, ['Something hit my head — I can\'t see right —', 'My head — oh God, is it bad?'], ['Head wound. I\'m… I\'m okay.']), f);
    else if (f.side === 'home' && !part) say(t + 0.3, v(f, ['AAGH — fuck — the blast!', 'I\'m hit — I\'m hit — shit!'], ['Frag got me. Still up.']), f);
    else if (f.side === 'home') say(t + 0.3, sev < 30 ? v(f, ['Fuck! I\'m hit — I\'m okay, I\'m okay!', 'Shit — it grazed me —'], ['Grazed. I\'m good.']) : sev < 55 ? v(f, ['Ahh — fuck, my arm!', 'They got my arm — shit, shit!'], ['Hit in the arm. Still shooting.']) : v(f, ['I can\'t… can\'t breathe —', 'Help me — please — I\'m hit bad —'], ['I\'m hit bad.']), f);
    else if (by?.side === 'home' && !by.machine && r() < 0.3) say(t + 0.3, v(by, ['I hit him! I think I hit him!', 'He\'s hit — he\'s hit!'], ['Hit.']), by);
    // an open wound to the body or a leg bleeds until someone stops it (the femoral artery fast)
    if (part === 'torso' || (part === 'leg' && sev >= 40) || (!part && sev >= 50)) {
      f.bleed = Math.max(f.bleed, part === 'leg' && sev >= 70 ? 3 : sev / 45);
      f.bleedAt = t; f.bleedPart = part ?? 'frag';
    }
    if (f.hp < (f.side === 'raider' ? 55 : 45)) f.out = true;
  };
  /** Dying of a wound nobody got to in time. */
  const bleedOut = (f: Fighter, t: number) => {
    f.dead = true; f.out = true; f.bleed = 0;
    ev.push({ t: r2(t), kind: 'death', unit: f.id });
    const m = H.find(h => h !== f && !h.out && !h.shelter);
    if (f.side === 'home' && m) say(t + 0.4, v(m, [`${nameOf(f)}? ${nameOf(f)}! Oh God, they're not breathing — they're not breathing!`, `No no no — ${nameOf(f)}, stay with me — STAY WITH ME —`], [`${nameOf(f)}'s gone. Bled out.`]), m);
  };
  /** Stop the bleeding: a tourniquet on a limb, a chest seal or packing on the body. */
  const stopBleed = (f: Fighter, by: Fighter, t: number, medic: boolean) => {
    const kit = ifaks > 0 && f.side === 'home'; if (kit) ifaks--;
    const limb = f.bleedPart === 'leg' || f.bleedPart === 'arm';
    f.bleed = kit && (limb || medic) ? 0 : medic ? f.bleed * 0.2 : f.bleed * (kit ? 0.3 : 0.5);
    ev.push({ t: r2(t), kind: 'aid', unit: f.id, by: by.id, what: limb && kit ? 'tourniquet' : kit ? 'chest seal' : 'pressure' });
  };
  const explode = (x: number, z: number, t: number, radius: number, wreck?: PostSpot) => {
    const hits: string[] = [];
    for (const u of F) {
      if (u.dead || u.escaped || (u.side === 'home' && u.shelter && hardShelter)) continue;
      const d = Math.hypot(u.x - x, u.z - z);
      if (d > radius) continue;
      hits.push(u.id);
      // (round 4) hiding in an inner room or the cellar of the house: the walls between take most of it
      hurt(u, (60 + r() * 50) * (1 - d / radius * 0.6) * (u.side === 'home' && u.shelter ? 0.35 : 1) * (u.post === wreck ? 1 : Math.max(0.4, u.cover)) * (u.armor.plate || u.armor.soft ? 0.7 : 1) * (u.armor.helmet ? 0.85 : 1), t);   // armor takes some of the fragments
    }
    let wrecks: 'post' | 'wall' | undefined;
    if (wreck && wreck.kind !== 'open') { wreck.wrecked = true; smokeFrom = Math.min(smokeFrom, t); wrecks = wreck.kind === 'wall' ? 'wall' : 'post'; if (wreck.kind === 'wall') wallDown = true; }
    ev.push({ t: r2(t), kind: 'explosion', x: r2(x), z: r2(z), radius, hits, ...(wrecks ? { wrecks } : {}) });
  };
  // how organized they are: later in the collapse, armored, more of them carry rifles
  const org = peace ? 0 : Math.min(1, late * 0.7 + R.filter(f => f.armor.plate || f.armor.soft).length / Math.max(1, raiders) * 0.4);
  let shaken = false, heldUp = false;
  let wallDown = !!opts.insideBreach, breached = false, fled = false, end: PlannedBattle['result'] | null = null, endT = 0;
  let breachT = 0, lineSince = -1, houseT = -1;
  let gapOnly = false, pendingHow: BreachHow = 'climb';
  let breachInfo: { method: BreachHow; where: BreachWhere | null; t: number } | null = null;
  let reachedStage: RaidStage = 'wall';

  /**
   * A round that hits: where (cover hides the torso, so more heads and arms
   * get hit from behind a wall), what the armor does, and whether it kills.
   * Plates stop rifle rounds most of the time; a soft vest stops pistol
   * rounds and buckshot, not a rifle; a helmet turns some head shots into
   * a concussion. An unprotected chest or head can kill outright.
   */
  const strike = (b: Fighter, a: Fighter, t: number, partial = false) => {
    const h = hitRoll(r, partial || b.cover < 0.9 || !!(b.post && b.post.kind !== 'open'), a.arm.range >= 30, b.armor);
    const part = h.part;
    const stop = (text: string) => {
      ev.push({ t: r2(t + 0.05), kind: 'wound', unit: b.id, sev: 5, part, stopped: true });
      b.hp -= 4;
      if (b.side === 'home') say(t + 0.3, text, b);
    };
    if (h.kind === 'stopped') return stop(h.by === 'plate' ? v(b, ['It hit my vest — holy shit, it held!', 'Jesus — the plate — I\'m okay, I\'m okay!'], ['Plate caught it. Good.']) : v(b, ['Oh God — the vest stopped it —', 'Something hit me — the vest — I\'m okay!'], ['Vest stopped it.']));
    if (h.kind === 'helmet') {   // the helmet holds: a concussion, not a hole
      b.hp -= 15; ev.push({ t: r2(t + 0.05), kind: 'wound', unit: b.id, sev: 15, part });
      if (b.side === 'home') say(t + 0.4, v(b, ['Jesus Christ — it hit my helmet — my ears —', 'What the — my head — the helmet, it — I\'m okay —'], ['Helmet took it. Ears ringing.']), b);
      return;
    }
    return hurt(b, h.kind === 'kill' ? b.hp + 1 : h.sev, t, a, part);
  };

  /**
   * An empty gun: a fresh magazine (a few seconds; a civilian's hands shake),
   * a tube or cylinder thumbed in a round at a time; out of magazines, a run
   * to the house for more; out of ammunition, nothing.
   */
  const reload = (a: Fighter, t: number) => {
    const cal = a.arm.cal;
    if (a.spare > 0) {
      a.spare--; a.inGun = a.arm.mag;
      const secs = a.arm.feed === 'tube' ? a.arm.mag * (a.vet ? 0.5 : 0.9) : a.vet ? 2 : 3 + r() * 3;
      a.readyAt = t + secs;
      ev.push({ t: r2(t), kind: 'reload', unit: a.id, secs: r2(secs) });
      if (a.side === 'home' && r() < 0.7) sayF(a, t, ['Reloading — reloading! Cover me!', 'I\'m empty — shit — hang on —', 'Mag — where\'s my — got it, got it —', 'Out — loading — come on, come ON —'], ['Reloading!', 'Changing mags.', 'Loading.']);
      else if (a.side === 'raider' && r() < 0.15) say(t, pick(['Reloading!', 'Cover me, I\'m out!']), a);
      return;
    }
    if (a.side === 'home' && cal && (ammo[cal] ?? 0) >= a.arm.mag) {
      a.spare = 2; a.readyAt = t + 12 + r() * 6;
      sayF(a, t, ['I\'m out of mags — I need ammo! I\'m going in for more!', 'That\'s my last one — I\'ve got nothing — getting more from the house!'], ['Last mag. Getting more from the house — cover my sector.'], 0);
      ev.push({ t: r2(t + 0.3), kind: 'move', unit: a.id, x: r2(C.x), z: r2(C.z) });
      ev.push({ t: r2(a.readyAt - 2), kind: 'move', unit: a.id, x: r2(a.x), z: r2(a.z), ...(a.y ? { y: a.y } : {}) });
      return;
    }
    a.dry = true;
    if (a.side === 'home') sayF(a, t, ['I\'m out! I\'m OUT! I\'ve got nothing left!', 'No more — there\'s no more ammo — oh God —'], ['I\'m dry. Out of ammo.'], 0);
  };

  const shoot = (a: Fighter, b: Fighter, t: number) => {
    const cal = a.arm.cal;
    const cost = a.arm.auto ? 3 : 1;
    if (a.dry) return;
    // nobody fires at a wall: a round that could not get there is not fired (the shooter looks for another place: seekLine / crewSeek)
    const sg = sight(a, b);
    if (sg === 'blocked') return;
    if (a.arm.mag && a.inGun < cost) return reload(a, t);
    if (cal && (ammo[cal] ?? 0) < cost) { a.dry = true; return; }
    // a jam: worn guns more, cheap ammo in a hot gun; clearing it takes a vet a second or two, a civilian much longer
    if (a.arm.mag && r() < 0.002 + (1 - a.wear) * 0.015) {
      const secs = a.vet ? 2 + r() : 4 + r() * 6;
      a.readyAt = t + secs;
      ev.push({ t: r2(t), kind: 'jam', unit: a.id, secs: r2(secs) });
      if (a.side === 'home') sayF(a, t, ['It\'s jammed — it won\'t fire — fuck! FUCK!', 'Come on, come on — it\'s stuck — why won\'t it —', 'It just clicked — it\'s not working!'], ['Malfunction. Clearing.', 'Jam — tap, rack — good.'], 0);
      return;
    }
    a.inGun -= cost;
    if (cal) { ammo[cal]! -= cost; spent[cal] = (spent[cal] ?? 0) + cost; }
    const d = dist(a, b);
    const rangeF = Math.max(0.15, 1 - d / (reachOf(a) * 1.2));
    const tgtCover = b.veh ? 0.75 : b.side === 'raider' ? (b.moving ? 1.3 : b.cover) : b.cover;
    // the dark: half the hits, unless they have night vision; rounds snapping past spoil the aim (less so for those who served)
    const see = night && !lightsOn && !(t >= flareFrom && t < flareUntil) ? (a.nvg ? 0.9 : 0.5) : 1;
    const steady = 1 / (1 + a.supp * (a.vet ? 0.07 : 0.16));
    let p = (0.06 + 0.025 * a.skill) * a.arm.acc * rangeF * tgtCover * see * steady * (a.side === 'home' ? a.post?.acc ?? 1 : 1);
    if (a.side === 'home' && a.moving) p *= 0.5;
    if (b.side === 'home' && b.post?.kind === 'tower') p *= TOWER_PARAPET;   // up a tower behind the parapet, shot at from below at a steep angle: fewer rounds find the cab
    if (sortie > 1 && a.side === 'home' && b.side === 'raider' && dist(b, C) <= lineR + 2) p *= sortie;
    if (a.side === 'home') p *= ordFx.acc; else if (b.side === 'home' && !b.machine) p *= ordFx.hit * STAGE_COVER[stage];
    if (a.arm.auto) p *= 1.6;
    p *= env.acc * (t >= smokeFrom ? SMOKE_ACC : 1);   // a storm on the place; smoke from what is burning (sim/raidConditions.ts)
    p *= eff(a);                                   // a wounded shooter shoots worse
    if (sg === 'partial') p *= PARTIAL_HIT;        // only the head shows over the wall
    const hit = r() < Math.min(0.9, p);
    ev.push({ t: r2(t), kind: 'shot', from: a.id, to: b.id, hit, ...(a.arm.auto ? { auto: true } : {}) });
    if (b.post) b.post.fire++;
    b.supp += (a.arm.auto ? 2 : 1) * (b.post && b.post.kind !== 'open' ? 0.7 : 1);   // rounds thudding into logs and sandbags rattle less than ones snapping past
    if (hit) strike(b, a, t, sg === 'partial');
  };

  /** A defender with no line of fire to anyone in reach goes to a post that has one (a tower, the wall walk, an upper window, a spot at the wall where the crew is climbing). */
  const seekLine = (f: Fighter, t: number, rUp: readonly Fighter[]) => {
    if (peaceB || breached || t - (f.seekAt ?? -99) < 3 || f.mounted) return;
    f.seekAt = t;
    let best: PostSpot | null = null, bestN = 0;
    for (const p of posts) {
      if (p === f.post || p.wrecked || p.kind === 'open' || used(p) >= p.cap) continue;
      const reach = f.arm.range * (p.reach ?? 1), from: Stance = { x: p.x, z: p.z, y: p.y, kneel: p.kind === 'sandbags' };
      let seen = 0;
      for (const x of rUp) if (dist(p, x) <= reach && fireLine(fmap, from, stanceOf(x)) !== 'blocked') seen++;
      if (seen > bestN || (seen > 0 && seen === bestN && best && p.value > best.value)) { best = p; bestN = seen; }
    }
    if (!best) return;
    if (r() < 0.6) sayF(f, t, ['I can\'t hit anything from here — moving!', 'The wall is in the way — I\'m going up!'], ['No line from here. Relocating.'], 8);
    takePost(f, t, best);
  };
  /** A raider with no line of fire to any defender steps along the wall (or closer) to a spot that has one, instead of shooting at it. */
  const crewSeek = (f: Fighter, t: number, targets: readonly Fighter[]) => {
    if (peaceB || breached || t < f.nextMove) return;
    f.nextMove = t + 3;
    const d = dist(f, C);
    const tries: Array<[number, number]> = [];
    for (const lat of [0, 2, -2, 4, -4, 6, -6, 9, -9]) for (const rad of [0, 3]) if (lat || rad) tries.push([lat, rad]);
    tries.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
    for (const [lat, rad] of tries) {
      const nd = Math.max(lineR, d - rad), ux = (f.x - C.x) / (d || 1) , uz = (f.z - C.z) / (d || 1);
      const px = C.x + ux * nd + lx * lat, pz = C.z + uz * nd + lz * lat;
      const from: Stance = { x: px, z: pz, y: f.y, kneel: true };
      if (targets.some(h => dist({ x: px, z: pz }, h) <= f.arm.range && fireLine(fmap, from, stanceOf(h)) !== 'blocked')) {
        f.x = px; f.z = pz; f.moving = true; f.cover = 1.3; f.nextMove = t + 4;
        ev.push({ t, kind: 'move', unit: f.id, x: r2(px), z: r2(pz), ...(f.y ? { y: r2(f.y) } : {}) });
        return;
      }
    }
  };

  /** The line is broken: the crew is in the yard. `how`: the ladder, the truck or the charge (sim/breachMeans.ts). The point is the drawn wall segment or gate. */
  const openLine = (t: number, hw: BreachHow, rUp: Fighter[]) => {
    breached = true; breachT = t; if (hw !== 'climb') wallDown = true;
    const w = synth ? null : ringK === 0 ? target : wallTarget(s.perimeter, C, dir, { width: 0.7, preferGate: false, maxD: lineR + 1.2 });
    const p = w ? { x: w.x, z: w.z } : at(lineR, 0);
    breachInfo = { method: hw, where: w, t };
    ev.push({ t, kind: 'breach', x: r2(p.x), z: r2(p.z), method: hw, ...(w ? { where: { ...w, x: r2(w.x), z: r2(w.z) } } : {}) });
    reachedStage = 'yard';
    // arson, first half: hostile crews burn what they can reach in the yard (sheds, coops, barns); the smoke is in the fight
    if (!peace && crewKind !== 'horde') {
      for (const st of fin) {
        if (fireList.length >= 3 || FIREPROOF.test(st.kind) || isPostKind(st.kind) || dist(st, C) > 28 || isHome(st.kind)) continue;
        if (mr() >= arsonOdds(disposition, temper, false, false)) continue;
        const tf = t + 5 + fireList.length * 3.5;
        fireList.push({ structure: st.id, x: r2(st.x), z: r2(st.z) });
        const by = [...rUp].sort((a, b) => Math.hypot(a.x - st.x, a.z - st.z) - Math.hypot(b.x - st.x, b.z - st.z))[0];
        ev.push({ t: r2(tf), kind: 'fire', structure: st.id, x: r2(st.x), z: r2(st.z), ...(by ? { by: by.id } : {}) });
        smokeFrom = Math.min(smokeFrom, tf);
      }
    }
      // the dogs posted inside at the inner gate go for the first men through (sim/laneWalk.ts)
      const gd = guardDogs(livingDogs(s));
      if (gd.n) for (const f of rUp.sort((a, b) => dist(a, C) - dist(b, C)).slice(0, gd.n)) {
        f.readyAt = Math.max(f.readyAt, t) + gd.hold;
        if (r() < 0.6) hurt(f, gd.bite + r() * 10, t + 1, undefined, 'arm');
        if (r() < 0.5) say(t + 0.6, pick(['Dog! Get it off — GET IT OFF!', 'The dog — aah — shoot it, shoot the dog!']), f);
      }
      say(t, v(lead(), ['They\'re inside the fence — fuck! Get to the house!', 'They\'re through — they\'re through! Oh God —'], ['They\'re through the line. Fall back to the house.']), lead());
      // the escape tunnel: whoever's sheltering gets out, away from the fighting
      const tunnel = s.perimeter.find(x => x.kind === 'escape_tunnel' && runFinished(x));
      const out = tunnel?.pts[tunnel.pts.length - 1];
      const fleeing = H.filter(h => h.shelter && !h.dead);
      if (out && fleeing.length) {
        say(t + 1, v(lead(), ['Take the kids — the tunnel — go, go, GO! Don\'t look back!', 'Get them out through the tunnel — NOW!'], ['Shelter group: out through the tunnel. Go.']), lead());
        for (const h of fleeing) { h.escaped = true; h.x = out[0]; h.z = out[1]; ev.push({ t: r2(t + 2 + r()), kind: 'move', unit: h.id, x: r2(out[0]), z: r2(out[1]) }); }
      }
  };
  /**
   * A truck or a charge opened the wall: the gap is there from now on (no ladder, no wire, no ten seconds at the foot of the wall), but the crew still has to
   * come through it under fire and win the fight at the line (the same rule as for a wall they climb), so a stronger lot is never an easier one.
   */
  const breakThrough = (t: number, hw: BreachHow) => {
    wallDown = true; gapOnly = true; pendingHow = hw;
    if (target && ringK === 0) ev.push({ t: r2(t), kind: 'gap', runId: target.runId, at: target.at, w: target.w, x: r2(target.x), z: r2(target.z) });
  };
  /** The crew has broken the line and there is another ring behind it: the defenders fall back, carrying the wounded in to the sickbay. */
  const fallBack = (t: number) => {
    const ring = ringRs[ringK]; ringK++; fallTimes.push(t);
    lineR = ring.r; wallKind = ring.kind; wallDown = false; gapOnly = false; pendingHow = 'climb'; lineSince = -1;
    const here = at(lineR, 0);
    ev.push({ t, kind: 'fallback', ring: ringK, of: ringRs.length, x: r2(here.x), z: r2(here.z) });
    say(t, v(lead(), ['Fall back! Fall back to the inner wall — go, go!', 'They\'re over the outer wall — back, BACK to the next gate!'], ['Outer line is gone. Fall back to the inner ring.']), lead());
    for (const p of posts) if (p.kind === 'wall') p.wrecked = true;
    for (let i = 0; i < 3; i++) { const p = behindWall(at(Math.max(1.5, lineR - 0.4), (i - 1) * Math.min(3, lineR * 0.6))); posts.push({ kind: 'wall', ...p, y: stepHeight(wallKind, PERIMETER[wallKind as keyof typeof PERIMETER]?.height ?? 0), cover: 0.22, value: 2, cap: 1, wrecked: false, fire: 0 }); }
    for (const p of posts) if (!p.wrecked) p.view = viewOf(p);
    posts.sort((a, b) => rankOf(b) - rankOf(a));
    for (const f of R) if (!f.out) f.y = 0;   // across the old line: off the wall
    // the wounded are carried in to the sickbay (the shelter), by whoever is nearest and still on their feet; there someone holds pressure on it
    for (const h of H) {
      if (!h.out || h.dead || h.shelter || h.escaped || h.carried) continue;
      const by = H.filter(x => !x.out && !x.shelter && x !== h).sort((a, b) => dist(a, h) - dist(b, h))[0];
      h.carried = true; h.shelter = true; h.x = shelterAt.x; h.z = shelterAt.z; h.post = null;
      ev.push({ t: r2(t + 1.2), kind: 'move', unit: h.id, x: r2(shelterAt.x), z: r2(shelterAt.z) });
      ev.push({ t: r2(t + 1.2), kind: 'carry', unit: h.id, ...(by ? { by: by.id } : {}) });
      if (by) { by.readyAt = Math.max(by.readyAt, t + 5); say(t + 0.5, v(by, [`Got you — I've got you, ${nameOf(h)}, hang on!`, `Come on — up — we're getting you inside!`], [`Moving ${nameOf(h)} to the sickbay.`]), by); }
      if (h.bleed > 0 && by) stopBleed(h, by, t + 1.5, !!by.medic);
    }
    for (const f of H) if (!f.out && !f.shelter) assignPost(f, t + 1);
  };

  /** Hands up, weapon down. A man still on his feet raises his hands; one hurt too badly to stand is simply in custody (the picture lays him down). */
  const markSurrender = (f: Fighter, t: number) => {
    f.surrendered = true; f.moving = false;
    if (!f.out) { f.cover = 1; ev.push({ t: r2(t), kind: 'surrender', unit: f.id }); }
    else if (f.hp >= 45) ev.push({ t: r2(t), kind: 'surrender', unit: f.id });
  };
  /** The crew gives up: every man still up drops his gun, and the wounded who cannot run are theirs to be held, not left on the drive. */
  const giveUp = (t0: number, rUp: readonly Fighter[]) => {
    fled = true;
    const t = t0 + 1;
    const l1 = lead(), spokesman = R[0].out ? rUp[0] : R[0];
    say(t, v(l1, ['They\'re putting their guns down! They\'re giving up!', 'Hold your fire! Hold your fire — they\'re surrendering!'], ['They\'re surrendering. Hold fire. Watch their hands.']), l1);
    say(t + 0.4, pick(['Don\'t shoot! Don\'t shoot! We give up!', 'We\'re done! We\'re done, don\'t shoot!', 'Okay, okay! Hands up! Hands up!']), spokesman);
    rUp.forEach((f, i) => markSurrender(f, t + 0.6 + i * 0.25));
    for (const f of R) if (f.out && !f.dead && !f.fled && !f.surrendered) markSurrender(f, t + 1.4);
    // each defender answers a surrender for himself: the calm hold fire, the grieving and the angry may not (sim/crewMercy.ts `snapOdds`)
    {
      const kinFell = H.some(h => h.dead || (h.out && !h.shelter));
      const victims = rUp.filter(f => !f.dead);
      for (const h of H) {
        if (snaps.length >= 2 || !victims.length) break;
        if (h.out || h.shelter || h.dead || !h.pid || h.arm === FISTS) continue;
        if (mr() >= snapOdds(temperamentOf(s, h.pid, kinFell))) continue;
        const vic = victims.shift()!;
        vic.surrendered = false; vic.dead = true; vic.out = true; vic.hp = 0;
        ev.push({ t: r2(t + 1.7 + snaps.length * 0.6), kind: 'shot', from: h.id, to: vic.id, hit: true });
        ev.push({ t: r2(t + 1.75 + snaps.length * 0.6), kind: 'death', unit: vic.id });
        say(t + 1.9 + snaps.length * 0.6, pick(['They killed Dad — I don\'t care if his hands are up —', 'You took him from us — you don\'t get to surrender —', 'No. No, you don\'t get to give up.']), h);
        snaps.push({ shooter: h.id, victim: vic.id });
      }
    }
    say(t + 2.2, v(l1, ['On your knees! Hands where I can see them! Nobody move!', 'Drop it! Down — get down on the ground!'], ['Weapons on the ground. Down on your knees. Now.']), l1);
    end = 'repelled'; endT = t + 6;
  };
  // ── orders, stages and the extras ──
  const wallR0 = wallR;
  let ordFx = ORDER_FX.hold, curOrder: RaidOrderKind = 'hold', stage = 'wall' as RaidStage, stageT = -99, synth = false, fbFrom = -1;
  const orderLog: RaidFacts['orders'] = [];
  let leaderRallied = false, offered = false, beatenBack = false;
  let parleyEnd: RaidFacts['ending'] | undefined;
  const snaps: Array<{ shooter: string; victim: string }> = [];
  const spareSaid = new Set<string>();
  const ammo0 = Object.values(ammo).reduce<number>((a, v) => a + (v ?? 0), 0);
  const ammoLeft = () => (ammo0 > 0 ? Object.values(ammo).reduce<number>((a, v) => a + (v ?? 0), 0) / ammo0 : 0);
  /** The family gives up the line and stands at the next place (sim/raidOrders.ts): the wall, then the cover in the yard, then the house. */
  const fallToStage = (t: number, st: RaidStage) => {
    stageT = t;
    if (ringK < ringRs.length) { fallBack(t); stage = nextStage(stage); return; }
    stage = st; synth = true; lineR = stageRadius(st, wallR0); wallKind = ''; wallDown = false; gapOnly = false; pendingHow = 'climb'; lineSince = -1;
    const here = at(lineR, 0);
    ev.push({ t, kind: 'fallback', ring: st === 'yard' ? 1 : 2, of: 2, x: r2(here.x), z: r2(here.z) });
    say(t, st === 'yard' ? v(lead(), ['Back to the yard — behind the cars, the woodpile, GO!', 'Leave the wall — fall back to the yard cover!'], ['Fall back to the yard cover. Keep your lanes.']) : v(lead(), ['Everybody in the house! Bar the doors — NOW!', 'Into the house! Furniture against the doors!'], ['Final line is the house. Barricade the doors.']), lead());
    for (const p of posts) if (p.kind === 'wall' || (st === 'house' && p.kind === 'sandbags')) p.wrecked = true;
    if (st === 'yard') for (let i = 0; i < 3; i++) { const q = at(Math.max(1.5, lineR - 0.4), (i - 1) * Math.min(2.6, lineR * 0.7)); posts.push({ kind: 'sandbags', x: q.x, z: q.z, y: 0, cover: 0.24, value: 2.5, cap: 1, wrecked: false, fire: 0 }); }
    for (const p of posts) if (!p.wrecked) p.view = viewOf(p);
    posts.sort((a, b) => rankOf(b) - rankOf(a));
    for (const f of R) if (!f.out) f.y = 0;
    for (const h of H) {
      if (!h.out || h.dead || h.shelter || h.escaped || h.carried) continue;
      const by = H.filter(x => !x.out && !x.shelter && x !== h).sort((a, b) => dist(a, h) - dist(b, h))[0];
      h.carried = true; h.shelter = true; h.x = shelterAt.x; h.z = shelterAt.z; h.post = null;
      ev.push({ t: r2(t + 1.2), kind: 'move', unit: h.id, x: r2(shelterAt.x), z: r2(shelterAt.z) }); ev.push({ t: r2(t + 1.2), kind: 'carry', unit: h.id, ...(by ? { by: by.id } : {}) });
      if (by) by.readyAt = Math.max(by.readyAt, t + 5);
      if (h.bleed > 0 && by) stopBleed(h, by, t + 1.5, !!by.medic);
    }
    for (const f of H) if (!f.out && !f.shelter) { assignPost(f, t + 1); f.readyAt = Math.max(f.readyAt, t + ORDER_FX.fallback.move); }
  };
  // the people at work outside the wall when the crew arrives (sim/raidOpeners.ts): the ones who are not warned are caught first, and the shooting is the alarm
  let ambushAt = Infinity;
  const ambushVictims: NonNullable<NonNullable<RaidFacts['opener']>['victims']> = [];
  if (opener?.kind === 'worker_ambush' && R.length >= 2) {
    const outside = alive.filter(({ p, i }) => OUTDOOR_TASKS.has(s.personState[i]?.task ?? '') && (!p.kid || p.age >= 12)).map(({ p }) => ({ id: p.id, kid: p.kid, age: p.age }));
    workerAmbush(outside, { detection, hostile: disposition === 'hostile', night }, mr).forEach((x, k) => {
      const f = H.find(h => h.pid === x.id);
      if (!f) return;
      const by = R[1 + (k % Math.max(1, R.length - 1))], tt = 0.8 + k * 1.1;
      ambushVictims.push({ unit: f.id, fate: x.fate });
      ev.push({ t: r2(tt), kind: 'ambush', unit: f.id, by: by.id, fate: x.fate });
      if (x.fate === 'ran') { ev.push({ t: r2(tt + 1), kind: 'move', unit: f.id, x: r2(C.x), z: r2(C.z) }); return; }
      ev.push({ t: r2(tt), kind: 'shot', from: by.id, to: f.id, hit: true });
      if (x.fate === 'taken') { f.taken = true; f.escaped = true; f.out = true; ev.push({ t: r2(tt + 0.3), kind: 'taken', unit: f.id, by: by.id }); ev.push({ t: r2(tt + 0.31), kind: 'hostage', unit: f.id, by: by.id }); }
      else hurt(f, x.fate === 'killed' ? 400 : 28 + mr() * 35, tt, by, mr() < 0.5 ? 'arm' : 'leg');
    });
    ambushAt = 2.5;
  }
  let pulled: Fighter[] = [], pulledBack = false, mainSeenT = -1, decoysGone = false;
  for (let t = 0; t < 300 && !end; t++) {
    const hUp = H.filter(f => !f.out && !f.shelter), rUp = R.filter(f => !f.out && !f.fled);
    // ── the truck and the satchel: kill the driver or the carrier first and the attempt fails ──
    if (truck && !truck.done) {
      const tk = truck, dr = tk.driver, u = Math.min(1, t / tk.arriveT);
      const at0 = { x: tk.from.x + (tk.to.x - tk.from.x) * u, z: tk.from.z + (tk.to.z - tk.from.z) * u };
      const secs = (n: number) => Math.round(n * 100) / 100;
      if (breached) tk.done = true;
      else if (dr.out || dr.dead) {
        // the driver is hit: the truck coasts a little and stops short of the wall
        tk.done = true; dr.veh = false; dr.cover = 0.4;
        const stop = { x: tk.from.x + (tk.to.x - tk.from.x) * Math.min(0.96, u + 0.05), z: tk.from.z + (tk.to.z - tk.from.z) * Math.min(0.96, u + 0.05) };
        dr.x = stop.x; dr.z = stop.z;
        ev.push({ t: 0, kind: 'ram', fromX: r2(tk.from.x), fromZ: r2(tk.from.z), x: r2(target!.x), z: r2(target!.z), secs: secs(t + 1.2), ok: false, why: 'driver_down', stopX: r2(stop.x), stopZ: r2(stop.z), driver: dr.id });
        attempts.push({ how: 'ram', ok: false, why: 'driver_down', t, odds: tk.odds });
        say(t + 0.3, pick(['The driver\'s hit — the truck\'s dead in the road!', 'He got the driver! The truck\'s stopping!']), lead());
      } else if (t >= tk.arriveT) {
        tk.done = true; dr.veh = false; dr.cover = 0.4; dr.x = tk.to.x; dr.z = tk.to.z;
        const ok = mr() < tk.odds, why = ok ? 'ok' : whyRamFailed(countersOf(s, target!, C, target!.runId), target!.gate);
        ev.push({ t: 0, kind: 'ram', fromX: r2(tk.from.x), fromZ: r2(tk.from.z), x: r2(target!.x), z: r2(target!.z), secs: secs(tk.arriveT), ...(ok ? {} : { ok: false, why, stopX: r2(at0.x), stopZ: r2(at0.z) }), driver: dr.id });
        attempts.push({ how: 'ram', ok, why, t, odds: tk.odds });
        ev.push({ t: r2(t), kind: 'move', unit: dr.id, x: r2(dr.x), z: r2(dr.z) });
        if (ok) breakThrough(t, 'ram');
        else { hurt(dr, 12 + r() * 25, t + 0.2, undefined, 'arm'); say(t + 0.5, pick(['It didn\'t go — the truck\'s wedged!', 'We\'re stuck on it — get out, get OUT!']), dr); }
      } else { dr.x = at0.x; dr.z = at0.z; }
    }
    if (sapper && blowAt < 0 && !breached) {
      const sp = sapper;
      if ((sp.out || sp.dead) && sp.charge) {
        // down before he could plant it: the charge lies where he fell (the next man will not pick it up in this fight)
        sp.charge = 0; blowAt = -2;
        ev.push({ t: r2(t), kind: 'charge', x: r2(sp.x), z: r2(sp.z), fuse: 0, ok: false, why: 'carrier_down', carrier: sp.id });
        attempts.push({ how: 'charge', ok: false, why: 'carrier_down', t, odds: chargeOdds });
      } else if (sp.charge && !sp.out && dist(sp, C) <= lineR + 1.4 && t >= sp.readyAt) {
        blowAt = t + FUSE_S; sp.charge = 0;
        const ok = mr() < chargeOdds, pad = { x: target!.x + target!.out.x * 0.12, z: target!.z + target!.out.z * 0.12 };
        sp.x = pad.x; sp.z = pad.z;
        ev.push({ t: r2(t), kind: 'charge', x: r2(pad.x), z: r2(pad.z), fuse: FUSE_S, ...(ok ? {} : { ok: false, why: 'wall_held' }), carrier: sp.id });
        attempts.push({ how: 'charge', ok, why: ok ? 'ok' : target!.gate ? 'gate_held' : 'wall_held', t: t + FUSE_S, odds: chargeOdds });
        const back = { x: pad.x + target!.out.x * 1.4, z: pad.z + target!.out.z * 1.4 };
        sp.x = back.x; sp.z = back.z; ev.push({ t: r2(t + 0.6), kind: 'cover', unit: sp.id, x: r2(back.x), z: r2(back.z) });
        say(t + 0.3, pick(['Fire in the hole! Back, BACK!', 'It\'s set — get away from the wall!']), sp);
      }
    } else if (sapper && blowAt > 0 && t >= blowAt) {
      const a = attempts[attempts.length - 1], ok = !!a && a.how === 'charge' && a.ok;
      blowAt = -3;
      ev.push({ t: r2(t), kind: 'explosion', x: r2(target!.x), z: r2(target!.z), radius: 0.8, hits: [], ...(ok ? { wrecks: 'wall' as const } : {}) });
      if (ok && !breached) breakThrough(t, 'charge');
    }
    // ── the family's orders ──
    {
      const want = orderAt(opts.orders, t);
      if (want !== curOrder) {
        curOrder = want; ordFx = ORDER_FX[want]; fbFrom = want === 'fallback' ? t : -1;
        orderLog.push({ t, order: want, stage });
        ev.push({ t: r2(t), kind: 'order', order: want, stage, units: hUp.map(h => h.id) });
        if (want === 'counter' && !peace) say(t + 0.3, v(lead(), ['We\'re going at them — everybody FORWARD!', 'Push them back — now, NOW — go!'], ['Counterattack. On me. Move.']), lead());
        else if (want === 'hold') say(t + 0.3, v(lead(), ['Hold your ground — nobody leaves the line!', 'Stay where you are! Hold!'], ['Hold the line. Hold your sectors.']), lead());
      }
      if (curOrder === 'fallback' && alarmed && !breached && stage !== 'house' && t >= Math.max(fbFrom, 0) && t - stageT >= 10) fallToStage(t, nextStage(stage));
    }
    // ── the diversion runs its course: the decoys give up the noise, the defenders who ran to it run back ──
    if (decoyN) {
      if (!decoysGone && t >= (opener?.decoy?.until ?? 30)) {
        decoysGone = true;
        for (const f of decoys) if (!f.out && !f.fled) { f.fled = true; const q = atD(36, (mr() - 0.5) * 8); ev.push({ t: r2(t + mr()), kind: 'flee', unit: f.id }); ev.push({ t: r2(t + 1), kind: 'move', unit: f.id, x: r2(q.x), z: r2(q.z) }); }
      }
      if (pulled.length && !pulledBack) {
        // (the pulled defenders are looking the wrong way: they notice the main body only when it is close, unless a tower sees both sides)
        const noticeAt = towerPosts(s).length ? detectAt : lineR + Math.max(4, 12 - detection * 0.08);
        if (mainSeenT < 0 && rUp.some(f => !f.decoy && dist(f, C) <= noticeAt)) mainSeenT = t;
        if ((mainSeenT >= 0 && t >= mainSeenT + 3) || t >= (opener?.decoy?.until ?? 30) + 25) {   // (the noise stopped, but they only know it was a feint when the main body shows)
          pulledBack = true;
          for (const f of pulled) if (!f.out && !f.shelter) { assignPost(f, t + 1); f.readyAt = Math.max(f.readyAt, t + 9); }
          say(t, v(lead(), ['It was a feint — they\'re coming from the road! Back, BACK!', 'The shooting was a decoy — get back to the front!'], ['Feint. Main body from the front. Everybody back to your lanes.']), lead());
        }
      }
    }
    // alarm
    const nearest = Math.min(...rUp.map(f => dist(f, C)));
    const doorNoise = !!door && !door.gaveUp && t >= door.noiseAt && door.noiseAt < Infinity;   // the work on the door carries (a ram, a sledge, a charge going off)
    const truckNoise = !!truck && !truck.done && dist(truck.driver, C) <= detectAt + 10;   // an engine at speed carries
    if (!alarmed && (nearest <= detectAt || doorNoise || truckNoise || t >= ambushAt || t > 0 && rUp.length === 0)) {
      alarmed = true;
      ev.push({ t, kind: 'alarm', what });
      // a dark yard: the family sends up a flare if it has one; an organized crew may send up its own (sim/raidConditions.ts)
      if (night && !lightsOn && !peace) {
        const fam = lead(), ours = fam && env.flares > 0, theirs = !ours && organized && mr() < 0.1;
        const by = ours ? fam : theirs ? R[0] : undefined;
        if (by) {
          const fp = at(lineR + 6, 0);
          flareFrom = t + 2; flareUntil = t + 2 + FLARE.secs;
          if (ours) flaresUsed++;
          ev.push({ t: r2(t + 2), kind: 'flare', x: r2(fp.x), z: r2(fp.z), by: by.id, secs: FLARE.secs });
          say(t + 2, ours ? v(by, ['Flare! Everybody look — there they are!', 'Lighting it up — flare going up!'], ['Flare up. Sectors.']) : pick(['Flare — light \'em up!', 'Put one up so we can see!']), by);
        }
      }
      if (doorNoise && nearest > detectAt) say(t + 0.4, v(lead(), ['That noise — the door! Somebody\'s at the door!', 'Oh God, that banging — they\'re on the gate!'], ['Contact at the tunnel door. Everyone up.']), lead());
      if (lightsOn) {
        const masts = mast ? towerPosts(s).filter(x => x.def?.flood && mastIds.includes(x.st.id)).slice(0, 3).map(x => ({ x: r2(x.st.x), z: r2(x.st.z), y: x.post.y + 0.1 })) : [];
        const aimAt = at(lineR + 8, 0);
        ev.push({ t: t + 1, kind: 'lights', ...(masts.length ? { masts, aim: { x: r2(aimAt.x), z: r2(aimAt.z) } } : {}) });
      }
      const l0 = lead();
      say(t, peace ? v(l0, ['Who\'s there?! Someone\'s in the house — oh God —', 'I hear you down there — I have a gun!'], ['Intruder, downstairs. Everyone stay put.']) : l0?.vet ? (what === 'dog' ? 'Dog\'s alerting. Contact on the drive — everyone to your spots.' : 'Contact. Everyone up, to your spots. Now.')
        : what === 'dog' ? pick(['The dog — shit, there\'s people out there! Get up, get UP!', 'Why is the dog — oh fuck. Fuck! They\'re coming!'])
        : what === 'camera' ? pick(['There\'s people on the camera — oh shit, they\'ve got guns!', 'Fuck — look at the camera — they\'re coming up the drive!'])
        : what === 'tripwire' ? 'That\'s the tripwire — shit — they\'re in the trees!' : pick(['Shit, shit — there\'s people coming up the drive!', 'Fuck! They\'re coming! Everybody up!']), l0);
      if (H.some(h => h.shelter && h.kid)) {
        say(t + 1, v(l0, ['Kids — downstairs, NOW! Don\'t come out till I say!', 'Get the kids in the back — go, go, GO!'], ['Kids to the shelter. Stay down, stay quiet.']), l0);
        say(t + 2.2, pick(['What\'s happening?! Is that — are those guns?!', 'I\'m scared — I\'m scared —', 'Is somebody coming?']), H.find(h => h.shelter && h.kid));
      }
      if (peace) say(t + 1.5, v(l0, ['I called 911! The police are on their way! GET OUT OF MY HOUSE!', 'The sheriff\'s coming — get out, GET OUT!'], ['Sheriff\'s on the way. Leave. Now.']), l0);
      if (peace) say(t + 2, pick(['Shit — somebody\'s home!', 'Go, go — he\'s got a gun!']), R[0]); else say(t + 2, pick(['Spread out! Hit the house!', 'Go, go — flank \'em!', 'Come out and nobody gets hurt! We just want the food!', 'Light \'em up!']), R[0]);
      // where each one sleeps (sim/quarters.ts): guards by the gate are up sooner, those housed far from the house are slower to a post or to the shelter
      const gateAt = gatePoint(s);
      const qDelta = (f: Fighter): number => {
        if (!f.pid) return 0;
        const sp = sleepSpotFor(s, f.pid), st = sp?.where ? fin.find(x => x.id === sp.where) : undefined;
        return raidDelta({ at: st ? { x: st.x, z: st.z } : null, role: st ? (s.quarters?.roles[st.id] ?? null) : null, tower: false, house: C, gate: gateAt, night });
      };
      for (const f of H) if (f.shelter) toShelter(f, t + Math.max(0, qDelta(f))); else { assignPost(f, t); if (!f.vet && opts.ambush === undefined) f.readyAt += 1 + r() * 3 + (f.pid ? fightNerves(s, s.people.find(q => q.id === f.pid)!).freeze : 0); if (opts.ambush === undefined && f.readyAt < Infinity) f.readyAt = Math.max(t, f.readyAt + qDelta(f)); }   // civilians freeze a moment; those who served go straight to it
      // scouts the watch saw: the family is warned and stands ready sooner
      if (scoutsSeen) for (const f of H) if (!f.shelter && f.readyAt < Infinity) f.readyAt = Math.max(t, f.readyAt - 2);
      // a diversion: half the defenders run to the noise on the wrong side (sim/raidOpeners.ts)
      if (decoyN && decoys.length) {
        const cand = H.filter(f => !f.shelter && !f.out && f.arm !== FISTS && f.post?.kind !== 'tower'), k = Math.ceil(cand.length * 0.6);
        const dp: PostSpot[] = [0, 1, 2].map(j2 => { const q = atD(Math.max(1.5, lineR - 0.4), (j2 - 1) * 2.5); return { kind: 'wall' as const, x: q.x, z: q.z, y: 0, cover: 0.22, value: 2, cap: 1, wrecked: false, fire: 0 }; });
        pulled = cand.slice(0, k);
        pulled.forEach((f, j2) => takePost(f, t, dp[j2 % 3]));
        const from = atD(lineR + 6, 0);
        ev.push({ t: r2(t + 0.5), kind: 'diversion', decoys: decoys.map(d => d.id), from: { x: r2(from.x), z: r2(from.z) }, until: opener?.decoy?.until ?? 30, pulled: pulled.map(f => f.id) });
        if (pulled.length) say(t + 1, v(lead(), ['They\'re on the other side — go, go, GO!', 'That\'s the east fence! Everybody to the east!'], ['Contact east. Shift two to the east wall.']), lead());
      }
    }
    for (const p of posts) p.fire *= 0.7;
    for (const f of F) {
      f.supp *= 0.6;
      if (f.dead || f.bleed <= 0) continue;
      if (f.escaped || (f.shelter && f.rescued)) { f.bleed = 0; continue; }
      if (f.shelter) f.bleed = Math.min(f.bleed, 0.3);   // someone in there holds pressure on it
      f.hp -= f.bleed;
      if (f.hp <= 0) { bleedOut(f, t); continue; }
      // still able: put your own tourniquet on (those who served know how and do it fast)
      if (!f.out && !f.aided && f.side === 'home' && t - (f.bleedAt ?? t) >= (f.vet ? 2 : 6) && ifaks > 0) {
        f.aided = true;   // one go at it: what's left of the bleeding is for the medic
        stopBleed(f, f, t, !!f.vet);
        sayF(f, t, f.bleedPart === 'leg' || f.bleedPart === 'arm' ? ['Tourniquet — I got it on — oh God, oh God, tighter —', 'I\'m putting the tourniquet on — fuck, it hurts —'] : ['Pressing on it — I\'m pressing on it —', 'There\'s a hole in me — the seal, where\'s the seal —'], ['Tourniquet\'s on. Back in it.', 'Sealed it. I\'m good.'], 0);
      } else if (!f.out && f.side === 'raider' && t - (f.bleedAt ?? t) >= 5 && r() < 0.15) f.bleed *= 0.3;
    }

    // home side: fire, fall back, medic
    if (alarmed) for (const tu of T) {
      if (tu.dry || t < tu.readyAt || tu.post?.wrecked) continue;
      if (r() > tu.arm.rate) continue;
      const cal = tu.arm.cal!, cost = 3;
      const seenT = rUp.filter(x => dist(x, tu) <= tu.arm.range * (tu.post?.reach ?? 1) && sight(tu, x) !== 'blocked');
      if (!seenT.length) continue;
      if ((ammo[cal] ?? 0) < cost) { tu.dry = true; continue; }
      // a turret can jam; nobody is up there to clear it
      if (r() < TURRET_JAM) { const secs = 7 + r() * 8; tu.readyAt = t + secs; ev.push({ t: r2(t), kind: 'jam', unit: tu.id, secs: r2(secs) }); continue; }
      const tg = seenT.map(x => ({ x, s: -dist(x, tu) + (x.grenades || x.rockets ? 15 : 0) + (x.veh || x.charge ? 14 : 0) + (x.moving ? 8 : 0) })).sort((a, b) => b.s - a.s)[0].x;
      ammo[cal]! -= cost; spent[cal] = (spent[cal] ?? 0) + cost;
      const d = dist(tu, tg), rangeF = Math.max(0.15, 1 - d / (reachOf(tu) * 1.2));
      const tgtCover = tg.veh ? 0.75 : tg.moving ? 1.3 : tg.cover;
      const p = (0.06 + 0.025 * tu.skill) * tu.arm.acc * rangeF * tgtCover * (night && !lightsOn ? 0.8 : 1) * 1.6 * (tu.post?.acc ?? 1);
      const hit = r() < Math.min(0.9, p);
      const part = sight(tu, tg) === 'partial', landed = hit && (!part || r() < PARTIAL_HIT);
      ev.push({ t: r2(t), kind: 'shot', from: tu.id, to: tg.id, hit: landed, auto: true });
      tg.supp += 2;
      if (landed) strike(tg, tu, t, part);
    }
    if (alarmed) for (const f of hUp) {
      if (f.mounted && f.dry) armFor(f, null);
      if (t < f.readyAt) continue;
      // a wrecked post is left at once; one under heavy fire only now and then (moving under fire is worse than staying behind cover)
      if (f.post && f.post.kind !== 'open' && (f.post.wrecked || (f.post.fire > (f.vet ? 14 : 9) && t - (f.movedAt ?? -99) > 20 && r() < 0.15))) { const old = f.post; old.fire = 0; say(t, old.wrecked ? v(f, ['It\'s gone — the whole thing\'s gone — I\'m getting out of here!', 'Shit — it\'s on fire — moving back!'], ['Position\'s gone. Falling back.']) : v(f, ['They\'re all shooting at me — fuck — I\'m moving!', 'I can\'t stay here — I can\'t — moving back!'], ['Too hot. Moving. Cover me.']), f); assignPost(f, t, old); continue; }
      if (f.grenades > 0) {
        const tg = rUp.find(x => dist(x, f) <= GRENADE_RANGE);
        if (tg) { f.grenades--; say(t, v(f, ['Throwing it — get down, get DOWN!', 'Here goes — everybody down!'], ['Frag out!']), f); ev.push({ t, kind: 'throw', from: f.id, x: r2(tg.x), z: r2(tg.z), what: 'grenade' }); explode(tg.x + (r() - 0.5), tg.z + (r() - 0.5), t + 2, 1.5); continue; }
      }
      if (r() > f.arm.rate * (0.5 + 0.5 * eff(f))) continue;     // and slower
      // threat: close, carrying explosives, caught in the open; only those in front of the post and in range
      const inReach = rUp.filter(x => dist(x, f) <= reachOf(f) && (f.post?.kind !== 'building' || (x.x - f.x) * ax + (x.z - f.z) * az > -1));
      if (!inReach.length) continue;
      // only those the round can reach: nobody shoots at a wall (a defender with no line goes where there is one)
      const seen = inReach.filter(x => sight(f, x) !== 'blocked');
      if (!seen.length) { seekLine(f, t, rUp); continue; }
      const tg = seen.map(x => ({ x, s: -dist(x, f) + (x.grenades || x.rockets ? 15 : 0) + (x.veh || x.charge ? 14 : 0) + (x.moving ? 8 : 0) - (sight(f, x) === 'partial' ? 6 : 0) })).sort((a, b) => b.s - a.s)[0].x;
      shoot(f, tg, t + r() * 0.9);
    }
    // the medic drags the wounded in
    const down = H.find(f => f.out && !f.dead && !f.shelter && !f.rescued);
    const helpers = H.filter(f => !f.out && !f.shelter && t >= f.readyAt);
    // the medic goes; without one, whoever's closest (only if it doesn't leave the line empty)
    const med = helpers.find(f => f.medic) ?? (down && helpers.length > 1 ? helpers.sort((a, b) => dist(a, down) - dist(b, down))[0] : undefined);
    if (alarmed && med && down && !breached && !med.medic) {
      down.rescued = true;
      ev.push({ t: r2(t + 0.4), kind: 'move', unit: med.id, x: r2(down.x), z: r2(down.z) });
      say(t + 0.5, v(med, [`${nameOf(down)}!! Oh God — hold on, I'm coming! Somebody shoot!`, `I've got ${nameOf(down)} — I don't know what I'm doing — just keep them back!`], [`Cover me. Getting ${nameOf(down)}.`]), med);
      say(t + 4, v(med, [`Where's it coming from — oh God — I'm pressing, I'm pressing —`, `You're okay, you're okay — look at me — LOOK AT ME —`], [`Pressure's on. You're going to be fine.`]), med);
      stopBleed(down, med, t + 4, !!med.vet);
      toShelter(down, t + 4.5);
      med.readyAt = t + 8;
      ev.push({ t: r2(t + 4.6), kind: 'move', unit: med.id, x: r2(med.post?.x ?? med.x), z: r2(med.post?.z ?? med.z) });
    } else if (alarmed && med && down && !breached) {
      down.rescued = true;
      ev.push({ t: r2(t + 0.4), kind: 'move', unit: med.id, x: r2(down.x), z: r2(down.z) });
      say(t + 0.5, v(med, [`${nameOf(down)}! Hold on — I'm coming! Somebody cover me!`, `I'm getting ${nameOf(down)} — shoot at them, keep them down!`], [`Cover me. Getting ${nameOf(down)}.`]), med);
      say(t + 3.2, v(med, [`Stay with me, ${nameOf(down)}. Stay with me. Press here — hard — HARD.`, `I've got you — you're gonna be okay — oh God, there's so much —`], [`Got you, ${nameOf(down)}. Pressure on it. Don't move.`]), med);
      stopBleed(down, med, t + 3, true);
      toShelter(down, t + 3);
      med.readyAt = t + 6;
      ev.push({ t: r2(t + 3.3), kind: 'move', unit: med.id, x: r2(med.post?.x ?? med.x), z: r2(med.post?.z ?? med.z) });
    }

    // raiders
    // morale: desperate people with guns break at the first real resistance; an organized crew takes losses
    const losses = R.filter(f => f.out || f.dry).length;
    let firstBlood = false;
    if (!shaken && !fled && !breached && org < 0.35 && losses > 0 && t < 40) { shaken = true; firstBlood = r() < 0.4; }
    // a break-in: they run at the first shot from the family, or soon after they find someone awake and facing them
    const peaceBreak = peace && alarmed && (losses > 0 || t >= 10 || ev.some(e => e.kind === 'shot' && e.from.startsWith('h_')));
    // a savage crew doesn't scare: they take more losses before they quit
    // the post-breach fight: a crew in the yard is winning, so it takes more to break it, but a family that holds (or counterattacks) can still beat it back out
    const upArmed = hUp.filter(h => h.arm !== FISTS).length;
    const lossLimit = Math.max(1, raiders * (0.25 + 0.3 * org + (temper === 'savage' ? 0.2 : 0) + (breached ? 0.2 : 0)) * ordFx.morale);
    const leaderBreak = R[0].out && temper !== 'savage' && (!breached || losses >= Math.ceil(raiders * 0.3));
    let rallied = false;
    if (leaderBreak && !leaderRallied && !fled && org > 0.3 && mr() < 0.3 + 0.3 * org) { leaderRallied = true; rallied = true; const lt = rUp.find(f => f !== R[0]); if (lt) { ev.push({ t, kind: 'rally', unit: lt.id }); say(t + 0.3, pick(['I\'ve got them! Hold, HOLD — we\'re not leaving!', 'Stay on it! He\'s down, I\'m in charge — keep moving!']), lt); } }
    if (!fled && (!breached || upArmed > 0) && rUp.length && (losses >= lossLimit || (leaderBreak && !rallied && !leaderRallied) || (!breached && firstBlood && temper === 'desperate') || peaceBreak)) {
      // a crew that has lost heavily and has no way out (cut off, pinned, outgunned) may lay down its arms instead of running (sim/surrender.ts)
      if (!peace && crewSurrenders({ temper, kind: crewKind, lossShare: losses / Math.max(1, R.length), pinnedShare: rUp.filter(f => f.supp > 3).length / Math.max(1, rUp.length), outnumbered: upArmed / Math.max(1, rUp.length), trapped: opts.ambush !== undefined || !!opts.insideBreach, leaderDown: R[0].out }, r)) { giveUp(t, rUp); break; }
      // a hurt crew that still has teeth may offer terms instead of running (sim/raidOutcomes.ts): tribute for leaving, or passage
      if (!peace && !offered && !opts.insideBreach) {
        offered = true;
        const ctx = { disposition, temper, kind: crewKind, crewLoss: losses / Math.max(1, R.length), familyLoss: H.filter(h => h.out || h.dead).length / Math.max(1, H.length), leaderUp: !R[0].out, ammo: ammoLeft(), negotiator: Math.max(0, ...fightersP.map(({ p }) => p.skills.negotiator ?? 0)), talk: diffOf(s.disaster).talk };
        const offer = parleyOffer(ctx, mr);
        if (offer) {
          const ok = parleyAccepted(ctx, mr), tt = t + 1;
          ev.push({ t: r2(tt), kind: 'parley', offer, accepted: ok, ...(offer === 'tribute' ? { what: 'a share of the food and fuel' } : { what: 'to go through' }) });
          say(tt, offer === 'tribute' ? pick(['Give us food and fuel and we walk. Nobody else has to get hurt.', 'Hold your fire! We\'ll go — leave a share at the gate and we\'re gone!']) : pick(['We\'re just passing through! Let us by and we\'ll leave you be!', 'Hold fire! We want the road, not your place!']), R[0].out ? rUp[0] : R[0]);
          if (ok) {
            say(tt + 1.4, v(lead(), ['Okay — okay! Take it and go! Just GO!', 'Don\'t shoot! Let them go — let them take it and go!'], ['Terms accepted. Weapons down. They walk.']), lead());
            fled = true;
            for (const f of rUp) { f.fled = true; const q = at(34, (r() - 0.5) * 10); ev.push({ t: r2(tt + 2 + r()), kind: 'move', unit: f.id, x: r2(q.x), z: r2(q.z), walk: true }); }
            parleyEnd = { kind: offer, at: tt, what: offer === 'tribute' ? 'tribute' : 'passage', units: rUp.map(f => f.id) };
            end = 'fled'; endT = tt + 9; break;
          }
          say(tt + 1.2, v(lead(), ['No! Get off my land!', 'We\'re not paying you anything!'], ['Refused. Stay on your spots.']), lead());
        }
      }
      fled = true;
      const l1 = lead();
      t += 1;   // after this second's shots land
      say(t, v(l1, R[0].out ? ['Their guy\'s down — they\'re running! They\'re RUNNING!', 'They\'re leaving — oh thank God, they\'re leaving —'] : ['They\'re running — they\'re running!', 'Are they — they\'re pulling back!'], ['They\'re breaking contact. Hold your fire, stay on your spots.']), l1);
      if (!R[0].out) say(t + 0.5, pick(['Fall back! Fall back!', 'Fuck this — it\'s not worth it, go!']), R[0]);
      for (const f of rUp) { f.fled = true; const p = at(36, (r() - 0.5) * 10); ev.push({ t: r2(t + r()), kind: 'flee', unit: f.id }); ev.push({ t: r2(t + 1), kind: 'move', unit: f.id, x: r2(p.x), z: r2(p.z) }); }
      // a crew that holds together carries its hurt out with it; the rest are left on the drive
      const hurtOnes = R.filter(f => f.out && !f.dead && !f.surrendered && !f.fled);
      const carryP = temper === 'hard' ? 0.5 : temper === 'savage' ? 0.2 : 0.3;
      const carried: string[] = [];
      for (const f of hurtOnes) if (rUp.length > carried.length && mr() < carryP) { f.carriedOff = true; carried.push(f.id); }
      if (carried.length) ev.push({ t: r2(t + 1), kind: 'withdraw', units: rUp.map(f => f.id), carrying: carried, why: leaderBreak ? 'leader_down' : 'losses' });
      // each hurt man leaves with the crew, on a mate's shoulder (the `withdraw` event says who carries whom; the picture runs them off with the others)
      carried.forEach((id, i) => ev.push({ t: r2(t + 1 + i * 0.2), kind: 'flee', unit: id }));
      if (breached) beatenBack = true;
      end = 'fled'; endT = t + 8; break;
    }
    // a door that will not give: the crew has been at it as long as it will stay
    if (door?.gaveUp && t >= door.secs && !breached && rUp.length) {
      const l1 = lead();
      say(t, v(l1, ['They\'re leaving — they couldn\'t get through the door!', 'They gave up on the door — oh thank God —'], ['They\'re pulling back from the door.']), l1);
      for (const f of rUp) { f.fled = true; const p = at(36, (r() - 0.5) * 10); ev.push({ t: r2(t + r()), kind: 'flee', unit: f.id }); ev.push({ t: r2(t + 1), kind: 'move', unit: f.id, x: r2(p.x), z: r2(p.z) }); }
      end = 'fled'; endT = t + 6; break;
    }
    if (!rUp.length) { end = 'repelled'; endT = t + 3; break; }
    // they can't get over the wall and give up
    if (!breached && wallR && !synth && !wallDown && opts.ambush === undefined && lineSince >= 0 && t - lineSince > 40 && (lineClosed || !propLine.onLine.size)) { say(t, v(lead(), ['They can\'t get over the wall — they\'re giving up — oh my God —'], ['They can\'t breach. They\'re pulling out.']), lead()); for (const f of rUp) { f.fled = true; ev.push({ t: r2(t + r()), kind: 'flee', unit: f.id }); } end = 'fled'; endT = t + 6; break; }
    const climbing0 = wallR > 0 && !synth && !wallDown && opts.ambush === undefined && (lineClosed || !propLine.onLine.size);
    // the weak side: which flank has fewer defenders
    const leftDef = hUp.filter(h => (h.x - C.x) * lx + (h.z - C.z) * lz > 0).length;
    const flank = leftDef > hUp.length / 2 ? -1 : 1;
    for (const [k, f] of rUp.entries()) {
      const d = dist(f, C);
      if (f.veh) continue;   // still in the cab
      if (f.dry) { f.fled = true; ev.push({ t, kind: 'flee', unit: f.id }); if (r() < 0.5) say(t, pick(['I\'m dry! I\'m out!', 'No ammo — I\'m outta here!']), f); continue; }
      if (t < f.readyAt) continue;
      if (breached) {
        f.y = 0;
        // inside: go for the house and the stores. They fight whoever still fights; someone hiding unarmed is
        // mostly found and held at gunpoint, not shot (a panicked shot now and then); the wounded on the ground are left
        if (d > 1.2) { const s2 = Math.min(MOVE, d - 1); f.x += (C.x - f.x) / d * s2; f.z += (C.z - f.z) / d * s2; if (t % 3 === 0) ev.push({ t, kind: 'move', unit: f.id, x: r2(f.x), z: r2(f.z) }); }
        const near = (h: Fighter) => !h.dead && !h.escaped && dist(h, f) <= f.arm.range + 3;
        const fighting: Fighter | undefined = H.filter(h => near(h) && !h.out && !h.shelter).sort((a, b) => dist(a, f) - dist(b, f))[0];
        // greed: with nobody in front of him, a man in the yard goes after what he can carry instead of pressing the house (it thins the push, and the yard is what they take)
        if (f.lootingUntil !== undefined && t < f.lootingUntil) continue;
        if (!fighting && d > 3 && crewKind !== 'horde' && mr() < (crewKind === 'gang' || crewKind === 'militia' || crewKind === 'patrol' ? 0.03 : crewKind === 'refugees' ? 0.05 : 0.07)) { f.lootingUntil = t + 7; continue; }
        const savage = temper === 'savage';
        // a ruthless crew finishes the wounded on the ground (a hard one now and then)
        const downed = fighting ? undefined : H.find(h => near(h) && h.out && !h.dead && !h.shelter && !h.escaped);
        if (downed && r() < (savage ? 0.35 : temper === 'hard' ? 0.06 : 0)) {
          downed.dead = true; downed.bleed = 0;
          ev.push({ t: r2(t + 0.4), kind: 'shot', from: f.id, to: downed.id, hit: true });
          ev.push({ t: r2(t + 0.45), kind: 'death', unit: downed.id, executed: true });
          if (r() < 0.5) say(t, pick(savage ? ['Nobody gets up.', 'Leave nobody.'] : ['That one\'s still moving.']), f);
          continue;
        }
        // (the people hiding in the house are judged when the fight is over, by the crew's temper and by how long the doors held: sim/crewMercy.ts)
        const hiding = !fighting && d <= 2 && r() < (savage ? 0.25 : 0.04) ? H.find(h => near(h) && h.shelter && !hardShelter && (!savage || !h.kid) && disposition === 'hostile' && reachedStage === 'house' && t - houseT >= doorSeconds(s, { barricaded: stage === 'house' })) : undefined;
        const tg = fighting ?? hiding;
        if (tg && r() < f.arm.rate) { if (tg.shelter) tg.cover = 0.5; shoot(f, tg, t + r() * 0.9); }
        if (!fighting && !heldUp && !savage && d <= 2 && r() < 0.3 && H.some(h => h.shelter && !h.dead && !h.escaped && !hardShelter)) {
          heldUp = true;
          say(t, pick(['Hands where I can see them! Don\'t move!', 'On the floor! Nobody be a hero!', 'Where\'s the food? WHERE\'S THE FOOD?']), f);
          const kid = H.find(h => h.shelter && h.kid && !h.dead && !h.escaped);
          if (kid) say(t + 1, pick(['Please don\'t hurt us — please —', 'Mom? Dad? DAD?', 'Take it, take it all, just go —']), kid);
        }
        continue;
      }
      // rockets at the best post in range
      if (f.rockets > 0 && alarmed) {
        const pt = posts.find(p => !p.wrecked && p.kind !== 'open' && H.some(h => h.post === p && !h.out) && dist(p, f) <= ROCKET_RANGE);
        if (pt) {
          f.rockets--; say(t - 0.3, v(lead(), ['Is that — RPG! RPG! GET DOWN!', 'Oh shit — they\'ve got a rocket —'], ['RPG! Get off the tower!']), lead()); ev.push({ t, kind: 'rocket', from: f.id, x: r2(pt.x), z: r2(pt.z), ...(pt.y ? { y: pt.y } : {}) });
          const onTarget = r() < 0.6;
          explode(pt.x + (onTarget ? 0 : (r() - 0.5) * 3), pt.z + (onTarget ? 0 : (r() - 0.5) * 3), t + 1, 1.2, onTarget ? pt : undefined);
          continue;
        }
      }
      // grenades within ~30 m
      if (f.grenades > 0) {
        const tg = hUp.find(h => dist(h, f) <= GRENADE_RANGE);
        if (tg) { f.grenades--; say(t + 0.3, v(tg, ['GRENADE! Oh fuck — get DOWN!', 'Something landed — GRENADE!'], ['Grenade!']), tg); ev.push({ t, kind: 'throw', from: f.id, x: r2(tg.x), z: r2(tg.z), what: 'grenade' }); explode(tg.x + (r() - 0.5), tg.z + (r() - 0.5), t + 2, 1.5, tg.post && r() < 0.4 ? tg.post : undefined); continue; }
      }
      // bounding: half move while half suppress; swap each bound
      const movers = Math.floor(t / 4) % 2 === k % 2;
      const pinned = f.supp > (org > 0.5 ? 5 : 3);   // rounds snapping past: heads down, nobody moves
      if (movers && !pinned && d > lineR + 0.5 && t >= f.nextMove) {
        f.moving = true; f.cover = 1.3;
        const step = Math.min(4, d - lineR);
        const lat = (r() - 0.5) * 2 + flank * 0.8;
        if (f.rd !== undefined && f.rd > 0 && d > lineR + 6) {   // still out on the lane: along its path at the pace of the going, the last stretch is straight
          f.rd = Math.max(0, f.rd - step * pace);
          const q = onRoute(f.rd, lat); f.x = q.x; f.z = q.z;
        } else { f.x += (C.x - f.x) / d * step + lx * lat; f.z += (C.z - f.z) / d * step + lz * lat; }
        f.nextMove = t + 4;
        ev.push({ t, kind: 'move', unit: f.id, x: r2(f.x), z: r2(f.z) });
        const nd = dist(f, C);
        // the mined band
        if (minesLeft > 0 && d > mineR && nd <= mineR && r() < Math.min(0.85, 0.2 + minesLeft * 0.1)) {
          minesLeft--;
          const hits = rUp.filter(o => dist(o, f) <= 1.5).map(o => o.id);
          ev.push({ t: r2(t + 2), kind: 'mine', x: r2(f.x), z: r2(f.z), hits });
          for (const o of rUp) if (hits.includes(o.id)) hurt(o, (70 + r() * 50) * (o === f ? 1 : 0.6), t + 2);
        }
      } else if (f.moving && t >= f.nextMove - 1) {
        f.moving = false;
        // at the wall, going over it, nobody has cover
        if (climbing0 && d <= lineR + 0.8) {
          f.cover = 0.9;
          // at the wall, going over it: up a ladder or a truck bed, on top of the wall, where the defenders behind it can see him
          const q = peaceB ? null : snapWall(f.x, f.z, 7);
          if (q && q.h > 0) { f.x = q.x; f.z = q.z; f.y = q.h; ev.push({ t, kind: 'move', unit: f.id, x: r2(q.x), z: r2(q.z), y: r2(q.h) }); }
        }
        else { f.cover = 0.4; ev.push({ t, kind: 'cover', unit: f.id, x: r2(f.x), z: r2(f.z) }); }
      } else if (alarmed || t > 2) {
        const inRange = hUp.filter(h => dist(h, f) <= f.arm.range && h.readyAt <= t + 2);
        const tg = inRange.filter(h => sight(f, h) !== 'blocked').sort((a, b) => a.cover - b.cover || dist(a, f) - dist(b, f))[0];
        if (tg) { if (r() < f.arm.rate) shoot(f, tg, t + r() * 0.9); }
        else if (inRange.length) crewSeek(f, t, hUp);   // no line from here: find one rather than shoot the wall
      }
    }
    // the line: a breach when they're at it and the defense is down, outnumbered, or the wall is blown
    const atLine = rUp.filter(f => !f.out && !f.decoy && dist(f, C) <= lineR + 0.8);
    if (atLine.length && lineSince < 0) lineSince = t;
    const hNow = H.filter(f => !f.out && !f.shelter && f.arm !== FISTS).length;
    // a wall takes time to get over (a ladder, bolt cutters, a truck): ~10 s at it, exposed, before the first are across
    const climbing = wallR > 0 && !synth && !wallDown && opts.ambush === undefined && (lineClosed || !propLine.onLine.size);
    // the wall bites: a crew at the wire, the hedge or the ditch is hurt getting over it (the ones who go down are left behind),
    // and a crew that isn't set on killing loses heart a man at a time
    if (climbing && atLine.length && !breached) {
      const hz = wallKind === 'electric_steel' && !fenceLive(s) ? WALL_HAZARD.steel_wall : WALL_HAZARD[wallKind];
      let bitten = 0;
      for (const h of [hz, ...wallTop.hazards]) if (h) for (const f of atLine) if (r() < h.p) {
        bitten++;
        ev.push({ t: r2(t + 0.1), kind: 'snag', unit: f.id, x: r2(f.x), z: r2(f.z), what: h.what });
        hurt(f, h.min + r() * (h.max - h.min), t + 0.1, undefined, 'leg');
        if (!f.dead && r() < 0.7) say(t + 0.3, pick(h.lines), f);
      }
      if (moat?.hazard && ringK === 0) for (const f of atLine) if (r() < moat.hazard.p) {
        bitten++;
        ev.push({ t: r2(t + 0.1), kind: 'snag', unit: f.id, x: r2(f.x), z: r2(f.z), what: moat.hazard.what });
        hurt(f, moat.hazard.min + r() * (moat.hazard.max - moat.hazard.min), t + 0.1, undefined, 'leg');
        if (!f.dead && r() < 0.7) say(t + 0.3, pick(moat.frozen ? ['The ice — it went — it went under me —', 'It cracked — get me out — GET ME OUT —'] : ['Cold — Christ, it\'s cold — I can\'t feel my — ', 'It\'s over my head — I\'ve lost the rifle —', 'The bank is slick — I can\'t climb out —']), f);
      }
      if (temper !== 'savage' && !peace && t - lineSince >= 6) for (const f of atLine) if (!f.fled && !f.out && r() < 0.03 + 0.05 * Math.min(1, losses / Math.max(1, raiders)) + 0.03 * bitten) {
        f.fled = true; ev.push({ t, kind: 'flee', unit: f.id });
        if (r() < 0.5) say(t + 0.2, pick(['Fuck this — I\'m not going over that.', 'It\'s not worth it — back, get BACK!', 'No way — I\'m out — I\'m out of here!']), f);
      }
    }
    // (round 4) clubs against rifles need far more of them to rush the line; going over a wall, every rifle at a post on it slows them
    const outnumber = armedR ? 2 : 4;
    const onWall = H.filter(f => !f.out && !f.shelter && f.arm !== FISTS && t >= f.readyAt && f.post?.kind !== 'open' && atLine.some(x => sight(f, x) !== 'blocked')).length;   // (every rifle that bears on the climbers)
    if (!breached && !peace && atLine.length && ((wallDown && !gapOnly) || hNow === 0 || rUp.length > hNow * outnumber) && (opts.ambush === undefined || hNow === 0 || t - lineSince >= 12 + opts.ambush) && (hNow === 0 || t - lineSince >= (synth ? STAGE_HOLD[stage] : ringK === 0 ? ringHold : ringStay)) && (!climbing || (t - lineSince >= 10 + (moat && ringK === 0 ? moat.holdS : 0) && r() < 0.02 * atLine.length * (deck ? WALK_CLIMB_FACTOR : 1) * wallTop.climb * climbWeak / (1 + onWall)))) {
      if (ringK < ringRs.length) fallBack(t);
      else openLine(t, pendingHow, rUp);
    }
    if (breached) {
      // yard or house? the crew at the door of the house has reached the last stage; a barricaded door buys the family time (sim/crewMercy.ts doorSeconds)
      if (reachedStage !== 'house' && rUp.some(f => dist(f, C) <= 1.8)) { reachedStage = 'house'; houseT = t; }
      const standing = H.some(f => !f.out && !f.shelter);
      if (t - breachT >= 20) {
        const doorSecs = doorSeconds(s, { barricaded: stage === 'house' });
        const upA = H.filter(f => !f.out && !f.shelter && f.arm !== FISTS).length;
        const doorGone = reachedStage === 'house' && t - houseT >= doorSecs && upA === 0 && rUp.length >= 3 && doorSecs < 14;   // nobody armed left to hold a weak door
        end = standing && !doorGone ? 'breached' : 'overrun'; endT = t + 2;
        if (H.filter(f => !f.dead && !f.shelter).length === 0 && H.every(f => f.out || f.shelter)) end = 'overrun';
      }
      if (!standing && t - breachT >= 8) { end = 'overrun'; endT = t + 2; }
    }
  }
  if (!end) { end = breached ? 'breached' : 'repelled'; endT = 300; }
  // the line was broken: every defender still on the ground in the breached ring gets an explicit fate (killed, wounded, taken, held at gunpoint, or got away)
  const fates: Array<{ unit: string; fate: Fate }> = [];
  if (breached && (end === 'breached' || end === 'overrun')) {
    const t0 = Math.max(0, endT - 2), left = H.filter(h => !h.dead && !h.escaped && !h.taken && !h.shelter);
    const men = R.filter(f => !f.out && !f.fled);
    const horde = crewKind === 'horde';
    const tunnel = s.perimeter.find(x => x.kind === 'escape_tunnel' && runFinished(x)), tunnelOut = tunnel?.pts[tunnel.pts.length - 1];
    const ageOf = (h: Fighter) => s.people.find(p => p.id === h.pid)?.age ?? 30;
    const picked: Array<{ id: string; fate: Fate }> = breachFates(left.map(h => ({ id: h.id, down: h.out, kid: !!h.kid, age: ageOf(h), armed: h.arm !== FISTS && !h.surrendered })), { temper, kind: crewKind, men: men.length }, r);
    // the people hiding in the rooms: found or not by how long the crew had the house and how long the doors held; then judged like anyone else
    {
      const hiders = H.filter(h => h.shelter && !h.dead && !h.escaped && !h.taken);
      const doorSecs = Math.max(doorSeconds(s, { barricaded: stage === 'house' || curOrder === 'fallback' }), shelterAt !== home ? 240 : 0);
      const workSecs = reachedStage === 'house' ? Math.max(0, endT - houseT) : 0;
      let took = picked.filter(x => x.fate === 'taken').length;
      const cap = takeCap(temper, crewKind, men.length);
      for (const h of hiders) {
        const kid = !!h.kid, canTake = took < cap && (kid ? disposition === 'hostile' && temper === 'savage' : disposition === 'hostile' && temper !== 'savage');
        const f = hidingFate({ kid, age: ageOf(h), armed: false, down: h.out }, { disposition, savage: temper === 'savage' }, { workSecs, doorSecs, canTake }, mr);
        const fate: Fate = f === 'hid' ? 'hid' : f;
        if (fate === 'taken') took++;
        picked.push({ id: h.id, fate });
      }
    }
    picked.forEach(({ id, fate }, i) => {
      const h = H.find(x => x.id === id)!, tt = t0 + 0.4 + i * 0.5;
      const by = [...(men.length ? men : R)].sort((a, b) => dist(a, h) - dist(b, h))[0];
      const savage = temper === 'savage' || horde;
      let done: Fate = fate;
      if (fate === 'killed') {
        if (by) ev.push({ t: r2(tt), kind: 'shot', from: by.id, to: h.id, hit: true });
        hurt(h, (h.hp + 1) / Math.max(0.1, diffOf(s.disaster).wound), tt, by, 'torso');
        if (h.dead && disposition === 'hostile') { const de = ev.slice().reverse().find(e => e.kind === 'death' && e.unit === h.id); if (de && de.kind === 'death') de.executed = true; }   // a hostile crew's kill after the fight is lost is an execution
        if (!h.dead) { done = 'wounded'; h.out = true; }
        if (h.dead && by && !horde && r() < 0.5) say(tt + 0.3, pick(savage ? ['Nobody leaves.', 'Leave nobody.', 'Done.'] : ['I said stay down!', 'Should have stayed down.']), by);
      } else if (fate === 'finished') {
        h.dead = true; h.bleed = 0;
        if (by) ev.push({ t: r2(tt), kind: 'shot', from: by.id, to: h.id, hit: true });
        ev.push({ t: r2(tt + 0.05), kind: 'death', unit: h.id, executed: true });
        if (by && !horde && r() < 0.5) say(tt + 0.3, pick(['That one\'s still moving.', 'Nobody gets up.']), by);
      } else if (fate === 'wounded') {
        if (!h.out) {
          if (by) ev.push({ t: r2(tt), kind: 'shot', from: by.id, to: h.id, hit: true });
          hurt(h, 30 + r() * 35, tt, by, pick(['arm', 'leg', 'torso'] as const));
          if (h.dead) done = 'killed'; else h.out = true;
        }
      } else if (fate === 'taken') {
        h.escaped = true; h.taken = true;
        if (by) { ev.push({ t: r2(tt), kind: 'taken', unit: h.id, by: by.id }); ev.push({ t: r2(tt + 0.01), kind: 'hostage', unit: h.id, by: by.id }); say(tt, pick(h.kid ? ['Grab the kid. Put it in the truck.', 'This one comes with us.'] : ['This one can work. Tie his hands.', 'Up. You\'re coming with us. You can dig.']), by); }
        if (!h.kid) say(tt + 0.8, pick(['No — my family — please —', 'Take the food, take it, just leave me —']), h);
      } else if (fate === 'spared') {
        if (by) { ev.push({ t: r2(tt), kind: 'spare', unit: h.id, by: by.id, why: h.kid ? 'child' : 'complied' }); if (!spareSaid.has(by.id) && r() < 0.5) { spareSaid.add(by.id); say(tt, pick(h.kid ? ['Not the kid. Leave the kid.', 'Get the little one out of the way.'] : ['Stay down and nobody else gets hurt.', 'You. Stay put. We\'re not here for you.']), by); } }
      } else if (fate === 'hid') {
        // never found: nothing happens to them
      } else if (fate === 'held') {
        h.surrendered = true;
        ev.push({ t: r2(tt), kind: 'surrender', unit: h.id });
        if (by && r() < 0.6) say(tt, pick(['Hands where I can see them! Don\'t move!', 'Drop it! On your knees!', 'Nobody be a hero!']), by);
      } else {   // got away: out the tunnel if there is one, else to the shelter
        if (tunnelOut) { h.escaped = true; h.x = tunnelOut[0]; h.z = tunnelOut[1]; ev.push({ t: r2(tt), kind: 'flee', unit: h.id }); ev.push({ t: r2(tt + 0.2), kind: 'move', unit: h.id, x: r2(tunnelOut[0]), z: r2(tunnelOut[1]) }); }
        else { ev.push({ t: r2(tt), kind: 'flee', unit: h.id }); toShelter(h, tt); }
      }
      fates.push({ unit: id, fate: done });
    });
    endT = Math.max(endT, t0 + 0.4 + picked.length * 0.5 + 2);
  }
  // the crew was beaten and some of its hurt could not run: hands up (held), or down where they fell (left on the drive)
  if (end === 'repelled' || end === 'fled') {
    let k = 0;
    for (const f of R) if (f.out && !f.dead && !f.fled && !f.surrendered && !peace && r() < downedSurrenderOdds(temper, crewKind, 100 - f.hp)) markSurrender(f, Math.max(0, endT - 2.2 + 0.3 * k++));
  }
  // ── what the crew took, burned and carried off (sim/raidOutcomes.ts) ──
  const lootList: LootItem[] = [];
  const crewIn = R.filter(f => !f.out && !f.dead && !f.fled && !f.surrendered);
  if ((end === 'breached' || end === 'overrun') && !peace && crewKind !== 'horde') {
    const savageNight = fates.some(f => (f.fate === 'finished') || (f.fate === 'taken' && !!H.find(h => h.id === f.unit)?.kid));
    const share = savageNight ? 0.9 : end === 'overrun' ? 0.6 : 0.4;
    const reached: 'yard' | 'house' = end === 'overrun' || reachedStage === 'house' ? 'house' : 'yard';
    lootList.push(...planLoot(holdingsOf(s as unknown as Parameters<typeof holdingsOf>[0]), { kind: crewKind, men: Math.max(1, crewIn.length), truck: !!truck, reached, share }, mr));
    const near = (x: number, z: number) => [...(crewIn.length ? crewIn : R)].sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
    const t1 = breachT + 3, t2 = Math.max(t1 + 1, endT - 3);
    lootList.forEach((it, i) => { const by = near(C.x, C.z); if (by) ev.push({ t: r2(t1 + (t2 - t1) * (i + 1) / (lootList.length + 1)), kind: 'loot', by: by.id, what: it.what, n: it.n, from: it.from }); });
    // arson, second half: a house burns only when it has fallen (the yard's buildings were rolled when the line broke)
    for (const st of fin) {
      if (fireList.length >= 3 || FIREPROOF.test(st.kind) || isPostKind(st.kind) || dist(st, C) > 28 || !isHome(st.kind) || fireList.some(f => f.structure === st.id)) continue;
      if (end !== 'overrun' || mr() >= arsonOdds(disposition, temper, true, true)) continue;
      fireList.push({ structure: st.id, x: r2(st.x), z: r2(st.z) });
      const by = near(st.x, st.z);
      ev.push({ t: r2(Math.min(endT - 1, breachT + 8 + fireList.length * 3.5)), kind: 'fire', structure: st.id, x: r2(st.x), z: r2(st.z), ...(by ? { by: by.id } : {}) });
    }
  }
  if (!alarmed) ev.push({ t: 0, kind: 'alarm', what });
  let duration = endT;
  for (const e of ev) if (e.t > duration) duration = e.t;
  duration += 1;
  ev.push({ t: duration, kind: 'end', result: end });
  ev.sort((a, b) => a.t - b.t);
  const gone = (f: Fighter) => (f.out && !f.carriedOff) || f.surrendered;
  const dropped = { grenades: R.filter(gone).reduce((a, f) => a + f.grenades, 0), rpg_rounds: R.filter(gone).reduce((a, f) => a + f.rockets, 0) };
  const surrenderedR = R.filter(f => f.surrendered && !f.dead);
  const leftBehind = { wounded: R.filter(f => f.out && !f.dead && !f.surrendered && !f.carriedOff).length, dead: R.filter(f => f.dead).length, surrendered: surrenderedR.length };
  const surrendered = { raiders: surrenderedR.map(f => f.id), defenders: H.filter(h => h.surrendered && !h.dead).map(h => h.id) };
  // ── the explicit facts of the raid: everything the card, the scene and the aftermath read comes from here ──
  let raid: RaidFacts | undefined;
  if (!peace) {
    const linePassed = breached, reached: RaidStage = end === 'overrun' ? 'house' : reachedStage !== 'wall' ? reachedStage : synth && R.some(f => dist(f, C) < wallR0 - 1) ? 'yard' : 'wall';
    const fateOf = (k: Fate) => fates.filter(f => f.fate === k).length;
    const takenBy = new Map<string, string>();
    for (const e of ev) if (e.kind === 'taken') takenBy.set(e.unit, e.by);
    const hostages = [...takenBy].map(([unit, by]) => ({ unit, by }));
    const yardLoot = lootList.filter(l => l.from === 'yard'), houseLoot = lootList.filter(l => l.from === 'house');
    const deadHome = H.filter(h => h.dead).length;
    const bi = breachInfo as { method: BreachHow; where: BreachWhere | null; t: number } | null;
    const partial = { result: end, linePassed, beatenBack: beatenBack && (end === 'fled' || end === 'repelled'), reached, breach: bi ? { method: bi.method, where: bi.where, t: bi.t, attempts, crewHad: { truck: means.truck, satchels: means.satchels } } : attempts.length ? { method: 'climb' as const, where: target, t: -1, attempts, crewHad: { truck: means.truck, satchels: means.satchels } } : undefined, ending: parleyEnd, loot: lootList, fires: fireList, hostages, disposition };
    raid = {
      ...partial,
      ...(opener || opts.opener ? { opener: { kind: (opener ?? opts.opener)!.kind, ...(opener?.kind === 'scouts' ? { spotted: scoutsSeen, intel } : {}), ...(ambushVictims.length ? { victims: ambushVictims } : {}), ...(decoys.length ? { decoys: decoys.map(d => d.id), pulled: pulled.map(f => f.id) } : {}) } } : {}),
      crew: crewKind,
      env: { storm: env.storm, flares: flaresUsed, smoke: smokeFrom < Infinity },
      orders: orderLog, stage, temper, wallR: r2(wallR0),
      leader: { unit: 'r0', name: leaderNameOf(seed, opts.kind), down: R[0].out || R[0].dead, ...(R[0].out ? { downAt: ev.find(e => (e.kind === 'death' || e.kind === 'wound') && e.unit === 'r0')?.t } : {}) },
      snaps,
      loss: {
        yard: [...yardLoot.map(l => `${l.n} ${l.what}`), ...fireList.filter(f => !isHome(fin.find(x => x.id === f.structure)?.kind ?? '')).map(f => `burned: ${f.structure}`)],
        house: [...houseLoot.map(l => `${l.n} ${l.what}`), ...fireList.filter(f => isHome(fin.find(x => x.id === f.structure)?.kind ?? '')).map(f => `burned: ${f.structure}`)],
        people: { killed: deadHome, wounded: H.filter(h => h.out && !h.dead).length, taken: fateOf('taken') + H.filter(h => h.taken && !fates.some(f => f.unit === h.id)).length, held: fateOf('held'), spared: fateOf('spared') },
      },
      text: '',
    } as RaidFacts;
    raid.text = raidText({ ...raid, killed: deadHome, spared: fateOf('spared'), held: fateOf('held') });
  }
  return { night, units, events: ev, duration, spent, ...(surrendered.raiders.length || surrendered.defenders.length ? { surrendered } : {}), ...(fates.length ? { fates } : {}), minesUsed: mines - minesLeft, dropped, result: end, leftBehind, ...(ringRs.length ? { rings: { of: ringRs.length, fell: ringK, losses: lossesByRing(ev, units, fallTimes) } } : {}), ...(lane?.via ? { via: lane.via, charges: charges0 } : {}), ...(lure ? { lure } : {}), organized, ...(raid ? { raid } : {}) };
}

/** Write a fought battle into the game: wounds, deaths, ammo, mines, loot, the tallies. */
export function applyBattle(s: GameState, b: Battle): string[] {
  const out: string[] = [];
  const pb = b as Partial<PlannedBattle>;
  const endEv = b.events.find(e => e.kind === 'end');
  const result = endEv && endEv.kind === 'end' ? endEv.result : 'repelled';
  out.push(...applyCasualties(s, b));
  peopleAfterFight(s, b);   // the mind's toll and the practice a real fight is (sim/people.ts)
  {
    // the dogs on the post: hurt or killed by the fight, never automatically
    const home = new Set(b.units.filter(u => u.personId).map(u => u.id));
    const kidOf = (unit: string) => s.people.find(p => p.id === b.units.find(u => u.id === unit)?.personId)?.kid;
    out.push(...dogsInBattle(s, {
      homeWounds: b.events.filter(e => e.kind === 'wound' && home.has(e.unit)).length, homeDeaths: b.events.filter(e => e.kind === 'death' && home.has(e.unit)).length, result,
      savage: b.events.some(e => (e.kind === 'taken' && kidOf(e.unit)) || (e.kind === 'death' && e.executed)),
    }));
  }
  // a defender who shot a man with his hands up carries it (sim/crewMercy.ts)
  if (pb.raid?.snaps.length) {
    for (const sn of pb.raid.snaps) { const pid = b.units.find(u => u.id === sn.shooter)?.personId; if (pid) shock(s, pid, 'killed', 14); }
    s.gate.humanity = Math.max(0, s.gate.humanity - 4 * pb.raid.snaps.length);
    out.push(`${pb.raid.snaps.length === 1 ? 'Someone' : 'Two of you'} shot a man who had his hands up. It will be talked about.`);
  }
  let rounds = 0;
  for (const [cal, nn] of Object.entries(pb.spent ?? {}) as Array<[Caliber, number]>) { s.armory.ammo[cal] = Math.max(0, (s.armory.ammo[cal] ?? 0) - nn); rounds += nn; }
  if (rounds) {
    out.push(`${pluralize(rounds, 'round')} fired.`);
    for (const gun of s.armory.guns) { gun.fired += Math.round(rounds / Math.max(1, s.armory.guns.length)); gun.condition = Math.max(0, gun.condition - 0.01); }
  }
  if (pb.minesUsed) { s.stock.mines = Math.max(0, (s.stock.mines ?? 0) - pb.minesUsed); out.push(`${pb.minesUsed} mine${pb.minesUsed > 1 ? 's' : ''} went off.`); }
  const flared = b.events.filter(e => e.kind === 'flare' && e.by.startsWith('h_')).length;
  if (flared) s.stock.flares = Math.max(0, (s.stock.flares ?? 0) - flared);
  const thrown = b.events.filter(e => e.kind === 'throw' && e.from.startsWith('h_')).length;
  if (thrown) s.stock.grenades = Math.max(0, (s.stock.grenades ?? 0) - thrown);
  // a crew that came by a tunnel and got in may have brought its portal down behind it (sappers: sim/corridors)
  if (pb.via && (result === 'breached' || result === 'overrun')) out.push(...sapperBreach(s, pb.via, pb.charges ?? 0, result));
  // what stands in a vehicle yard outside the walls is taken whether or not the line held (sim/vehicleYard.ts)
  out.push(...raidYardLosses(s, result, !!pb.organized, pb.duration ? Math.round(pb.duration) : 0));
  // the crew's leader got away alive: he is a man with a story and he will be back (sim/raiderStory.ts)
  if (pb.raid?.leader && !pb.raid.leader.down && (result === 'repelled' || result === 'fled') && pb.raid.crew && !['horde', 'refugees'].includes(pb.raid.crew)) {
    addStory(s, makeStory(s, { treated: 'escaped', crew: crewKindOf(pb.raid.crew), name: `${pb.raid.leader.name.split(' (')[0]} ${raiderName(s.seed + 5).split(' ')[1]}`, men: b.units.filter(u => u.side === 'raider').length }, 3));
  }
  if (result === 'breached' || result === 'overrun') {
    s.gate.raidsLost++;
    const kidOf = (unit: string) => s.people.find(p => p.id === b.units.find(u => u.id === unit)?.personId)?.kid;
    const savage = b.events.some(e => (e.kind === 'taken' && kidOf(e.unit)) || (e.kind === 'death' && e.executed));
    if (pb.raid) {
      // specific items, by what the crew wanted and could reach and carry (sim/raidOutcomes.ts); the yard and the house are different losses
      const took = applyLoot(s, pb.raid.loot);
      if (took.length) out.push(`Taken: ${lootLines(took).join(', ')}.`);
      if (pb.raid.fires.length) out.push(...startFires(s, pb.raid.fires));
      for (const h of pb.raid.hostages) { const pid = b.units.find(u => u.id === h.unit)?.personId; const nm = s.people.find(p => p.id === pid)?.first; if (nm) out.push(`${nm} is a hostage.`); }
    } else {
      const share = savage ? 0.9 : result === 'overrun' ? 0.6 : 0.3;
      const lost: string[] = [];
      for (const k of ['canned', 'staples', 'frozen', 'fuel', 'meds'] as const) { const t = Math.floor((s.stock[k] ?? 0) * share); if (t > 0) { s.stock[k] -= t; lost.push(`${t} ${k}`); } }
      if (lost.length) out.push(`Lost: ${lost.join(', ')}`);
    }
  } else {
    s.gate.raidsHeld++;
    // a talked end in the middle of the fight: the tribute is paid (a share of the food and fuel); passage costs nothing
    if (pb.raid?.ending?.kind === 'tribute') {
      const paid: string[] = [];
      for (const k of ['canned', 'staples', 'frozen', 'fuel'] as const) { const t = Math.floor((s.stock[k] ?? 0) * TRIBUTE_SHARE); if (t > 0) { s.stock[k] -= t; paid.push(`${t} ${k}`); } }
      out.push(paid.length ? `Tribute paid: ${paid.join(', ')}.` : 'Tribute paid: there was little to give.');
    } else if (pb.raid?.ending?.kind === 'passage') out.push('They went through without a shot. Word will go round that you let a crew pass.');
    // the family gave up the wall or the yard and the crew held it for the night (sim/raidOrders.ts): what stood beyond that line was theirs
    if (pb.raid && pb.raid.reached !== 'wall' && pb.raid.stage !== 'wall' && !pb.rings?.fell) {
      const home = s.structures.find(st => isFinished(st) && isHome(st.kind)) ?? { x: 0, z: 0 };
      const x = exposedBeyond(s, home, pb.raid.stage, pb.raid.wallR), took: string[] = [];
      for (const a of ANIMALS) { const n = Math.floor((s.stock[a] ?? 0) * x.animals * OUTSIDE_TAKE); if (n > 0) { s.stock[a] -= n; took.push(`${n} ${a}${n > 1 ? 's' : ''}`); } }
      for (const k of ['canned', 'staples', 'frozen'] as const) { const n = Math.floor((s.stock[k] ?? 0) * x.stores * 0.12); if (n > 0) { s.stock[k] -= n; took.push(`${n} ${k}`); } }
      out.push(`The family fell back to the ${pb.raid.stage === 'house' ? 'house' : 'yard cover'} and held it.${took.length ? ` What stood outside it was lost: ${took.join(', ')}.` : ' Nothing of yours stood outside it.'}`);
    }
    // the line was broken and the family drove the crew out again: the gap is still in the wall
    // (the damage is laid by the caller, sim/encounters.ts, with the breach point)
    // the line fell and the crew was stopped at an inner ring: what stood outside that ring was theirs for the night (sim/ringFallback.ts)
    if (pb.rings?.fell) {
      const x = exposure(s, pb.rings.fell), took: string[] = [];
      for (const a of ANIMALS) { const n = Math.floor((s.stock[a] ?? 0) * x.animals * OUTSIDE_TAKE); if (n > 0) { s.stock[a] -= n; took.push(`${n} ${a}${n > 1 ? 's' : ''}`); } }
      for (const k of ['canned', 'staples', 'frozen'] as const) { const n = Math.floor((s.stock[k] ?? 0) * x.stores * 0.12); if (n > 0) { s.stock[k] -= n; took.push(`${n} ${k}`); } }
      out.push(`The family fell back through ${pb.rings.fell} ring${pb.rings.fell > 1 ? 's' : ''} and held the next.${took.length ? ` What stood outside it was lost: ${took.join(', ')}.` : ' Nothing of yours stood outside it.'}`);
    }
    if (pb.leftBehind) leaveAftermath(s, pb.leftBehind.wounded, pb.leftBehind.dead, pb.leftBehind.surrendered ?? 0);
    const d = pb.dropped;
    if (d && (d.grenades || d.rpg_rounds)) {
      s.stock.grenades = (s.stock.grenades ?? 0) + d.grenades;
      s.stock.rpg_rounds = (s.stock.rpg_rounds ?? 0) + d.rpg_rounds;
      out.push(`Recovered from the fallen: ${[d.grenades ? `${d.grenades} grenade${d.grenades > 1 ? 's' : ''}` : '', d.rpg_rounds ? `${d.rpg_rounds} rocket${d.rpg_rounds > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ')}.`);
    }
  }
  return out;
}

/** The fight's wounds, deaths and children carried off, written into each person's needs (the compound or a rescue raid). */
export function applyCasualties(s: GameState, b: Battle): string[] {
  const out: string[] = [];
  const day = Math.floor(s.clock.t);
  const byUnit = new Map(b.units.filter(u => u.personId).map(u => [u.id, u.personId!]));
  const idx = (unit: string) => s.people.findIndex(p => p.id === byUnit.get(unit));
  const carried = new Set(b.events.filter(e => e.kind === 'carry').map(e => (e as { unit: string }).unit));   // carried in to the sickbay: pressure held on it, cleaned and dressed sooner
  for (const e of b.events) {
    if (e.kind === 'wound' && byUnit.has(e.unit)) {
      const i = idx(e.unit); if (i < 0) continue;
      const nd = s.personState[i].needs;
      if (e.stopped) { if (nd.died == null) { nd.hurt.push({ what: 'bruised ribs (the armor stopped a round)', sev: 8 }); out.push(`${s.people[i].first}'s armor stopped a round.`); } continue; }
      // a tourniquet or chest seal from an IFAK on the spot
      let sev = carried.has(e.unit) ? Math.round(e.sev * 0.8) : e.sev;
      if (s.stock.ifak >= 1) { s.stock.ifak -= 1; sev = Math.round(sev * 0.7); }
      if (nd.died != null) continue;
      nd.hurt.push({ what: !e.part ? 'hit by shrapnel' : e.part === 'head' ? 'head wound' : e.part === 'torso' ? 'shot in the body' : e.sev < 30 ? 'grazed by a bullet' : `shot in the ${e.part}`, sev, trauma: true });
      nd.health = Math.max(s.disaster.difficulty === 'cozy' ? 5 : 1, nd.health - sev * 0.5);
      out.push(`${s.people[i].first} was wounded.`);
    } else if (e.kind === 'taken' && byUnit.has(e.unit)) {
      // carried off: out of the family's life (counted as gone, not dead)
      const i = idx(e.unit); if (i < 0) continue;
      const nd = s.personState[i].needs;
      if (nd.died != null) continue;
      nd.died = day; nd.taken = true; nd.cause = 'raid';
      out.push(`${s.people[i].first} was taken.`);
    } else if (e.kind === 'death' && byUnit.has(e.unit)) {
      const i = idx(e.unit); if (i < 0) continue;
      const nd = s.personState[i].needs;
      if (s.disaster.difficulty === 'cozy') { nd.hurt.push({ what: 'badly wounded in the fight', sev: 80, trauma: true }); nd.health = 5; out.push(`${s.people[i].first} was badly wounded.`); continue; }
      nd.health = 0; nd.died = day; nd.cause = 'raid';
      out.push(`${s.people[i].first} was killed.`);
    }
  }
  return out;
}

/** Take the planned loot out of the game (stock, animals, ammunition, unattended guns). Returns what was really taken. */
export function applyLoot(s: GameState, items: ReadonlyArray<LootItem>): LootItem[] {
  const took: LootItem[] = [];
  for (const it of items) {
    let n = 0;
    if (it.what === 'animals') {
      for (const a of ANIMALS) { const have = Math.floor(s.stock[a] ?? 0), t = Math.min(have, it.n - n); if (t > 0) { s.stock[a] -= t; n += t; } }
    } else if (it.what === 'ammo') {
      for (const [cal, have] of Object.entries(s.armory.ammo).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)) as Array<[Caliber, number]>) { const t = Math.min(have ?? 0, it.n - n); if (t > 0) { s.armory.ammo[cal] = (have ?? 0) - t; n += t; } }
    } else if (it.what === 'guns') {
      for (let i = s.armory.guns.length - 1; i >= 0 && n < it.n; i--) if (!s.armory.guns[i].carrier) { s.armory.guns.splice(i, 1); n++; }
    } else {
      const k = it.what as keyof typeof s.stock, have = Math.floor((s.stock[k] as number) ?? 0), t = Math.min(have, it.n);
      if (t > 0) { (s.stock[k] as number) = have - t; n = t; }
    }
    if (n > 0) took.push({ ...it, n });
  }
  return took;
}
