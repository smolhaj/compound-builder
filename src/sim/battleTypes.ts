/**
 * A fight at the compound, as a timeline you watch (the user: "you watch the
 * family/compound residents actually go and defend the compound … automated
 * so you're just watching"). sim/battle.ts builds one from the game state;
 * the world plays it back (residents run to their posts, alarms, lights,
 * shots, mines, wounds, a breach). Times are seconds of playback.
 */
export type Side = 'home' | 'raider';

/** How a raider is drawn in the cutscene (sim/raiderKinds.ts): the crew's style, the part he plays, and whether he carries a light. Cosmetic only. */
export interface RaiderLook {
  style: 'scouts' | 'crowd' | 'crew' | 'families' | 'opportunists';
  role: 'scout' | 'shouter' | 'rabble' | 'leader' | 'soldier' | 'parent' | 'kid' | 'driver' | 'looter';
  torch: boolean;
  /** Picks a color from the style's palette. */
  tone: number;
}

export interface BattleUnit {
  id: string;
  side: Side;
  /** A resident's person id (home side). */
  personId?: string;
  /** Where they start (world x/z, same units as structures). */
  x: number;
  z: number;
  /** A post: a watch tower, a window of a building, the wall, a sandbag position (for the picture). */
  post?: 'tower' | 'building' | 'wall' | 'sandbags' | 'open';
  /** Height above ground when on a post (tower ≈ 0.9). */
  y?: number;
  /** What they're wearing (drawn: a plate carrier, a soft vest, a helmet). */
  armor?: { plate: boolean; soft: boolean; helmet: boolean };
  /** Not a person: a remote turret on a tower (drawn as part of the tower, not as a figure). */
  machine?: 'turret';
  /** A raider's job in the breach (sim/breachMeans.ts): the one at the wheel of the truck, the one carrying the satchel charge. Set on the sim's own units. */
  job?: 'driver' | 'sapper';
  /** The raider is in the truck until it arrives (or is stopped): draw him in the cab, not as a walker. */
  inVehicle?: boolean;
  /** The crew's named leader (the first raider, `r0`): `name` is what the scene and the card call him. */
  leader?: boolean;
  /** A raider's role and look in the cutscene (set by `decorateRaiders`). */
  look?: RaiderLook;
  /** A resident who is not fighting: a child pulled indoors, a hand on the porch (`sim/defenderMoments.ts`). */
  civilian?: boolean;
  /** Drawn but not part of the fight, so the cutscene camera never frames it (a guard at the post, a child in the yard). */
  bystander?: boolean;
}

export type BattleEvent =
  | { t: number; kind: 'alarm'; what: 'dog' | 'sensor' | 'tripwire' | 'camera' | 'watch' }
  /** `masts`: floodlights on towers (sim/towers.ts), aimed at `aim`; absent, the yard lights come on round the house. */
  | { t: number; kind: 'lights'; masts?: Array<{ x: number; z: number; y: number }>; aim?: { x: number; z: number } }
  /** `walk`: at a walking pace (the wake). `near`: go to the point `r` away from another unit's place now, at angle `a` (a body that fell where it fell). */
  | { t: number; kind: 'move'; unit: string; x: number; z: number; y?: number; walk?: boolean; near?: { unit: string; r: number; a: number } }
  | { t: number; kind: 'shot'; from: string; to: string; hit: boolean; auto?: boolean }
  | { t: number; kind: 'mine'; x: number; z: number; hits: string[] }
  /** A raider hurt getting over the wall (the wire, the thorns, the ditch, the sharpened logs): `what` is what caught him. */
  | { t: number; kind: 'snag'; unit: string; x: number; z: number; what: string }
  /** `part`: where the round struck (shrapnel has none); `stopped`: armor caught it (a bruise, not a wound). */
  | { t: number; kind: 'wound'; unit: string; sev: number; part?: 'head' | 'torso' | 'arm' | 'leg'; stopped?: boolean }
  /** `executed`: killed on the ground after the fight was lost (a ruthless crew). */
  | { t: number; kind: 'death'; unit: string; executed?: boolean }
  /** Carried off by the raiders (a ruthless crew takes the children). */
  | { t: number; kind: 'taken'; unit: string; by: string }
  /**
   * The line is broken. `x`/`z` is the real break point: on the drawn wall segment or gate (`where`), not a radius. `method`: how (sim/breachMeans.ts);
   * absent on a battle from before save v87 (then the point is the old abstract line). */
  | { t: number; kind: 'breach'; x: number; z: number; method?: 'climb' | 'ram' | 'charge'; where?: BreachWhere }
  /** The defenders fall back to the `ring`-th inner ring (of `of`): the crew has broken the line before it. */
  | { t: number; kind: 'fallback'; ring: number; of: number; x: number; z: number }
  /** A wounded defender carried in to the sickbay by `by`. */
  | { t: number; kind: 'carry'; unit: string; by?: string }
  /** A crew working the steel door of a tunnel (sim/doorBreach.ts): `open` is the moment it gives. */
  | { t: number; kind: 'door'; what: 'hand tools' | 'a ram' | 'a cutting torch' | 'a charge' | 'an open door'; open: boolean; x?: number; z?: number }
  | { t: number; kind: 'flee'; unit: string }
  /** A line spoken in the fight: `who` is the unit speaking (a resident or a raider), absent for narration. */
  | { t: number; kind: 'say'; text: string; who?: string; /** The moment it belongs to (sim/raidDialogue.ts): approach, first_shots, retreat, ... */ ctx?: string }
  | { t: number; kind: 'throw'; from: string; x: number; z: number; what: 'grenade' }
  | { t: number; kind: 'rocket'; from: string; x: number; z: number; y?: number }
  | { t: number; kind: 'explosion'; x: number; z: number; y?: number; radius: number; hits: string[]; wrecks?: 'post' | 'wall' }
  | { t: number; kind: 'cover'; unit: string; x: number; z: number; walk?: boolean; near?: { unit: string; r: number; a: number } }
  /**
   * Presentation only (sim/raidDrama.ts): a held beat. `aim`/`fall` slow the playback (`rate` for `secs` of battle time) and the camera cuts to `unit`;
   * `vigil` / `tend` / `prisoner` / `carry` cut to the people gathered round `unit` (`with`) in the quiet after the fight.
   */
  | { t: number; kind: 'beat'; role: 'aim' | 'fall' | 'vigil' | 'tend' | 'prisoner' | 'carry'; unit?: string; with?: string[]; rate?: number; secs?: number }
  /** `by` takes `unit` up in their arms (a wounded friend, or the fallen) and walks; `lower` sets them down where the carrier stands. `lay`: down on the ground, alive. */
  | { t: number; kind: 'lift'; unit: string; by: string }
  | { t: number; kind: 'lower'; unit: string }
  | { t: number; kind: 'lay'; unit: string }
  /** Hands up, weapon down (a beaten crew's man, or a family held at gunpoint): stands where they are with their hands raised. */
  | { t: number; kind: 'surrender'; unit: string }
  /** Changing magazines (or thumbing rounds into a tube) / clearing a jam: no shots for `secs`. */
  | { t: number; kind: 'reload'; unit: string; secs: number }
  | { t: number; kind: 'jam'; unit: string; secs: number }
  /** First aid under fire: a tourniquet, a chest seal, or just hands pressing on it. */
  | { t: number; kind: 'aid'; unit: string; by: string; what: 'tourniquet' | 'chest seal' | 'pressure' }
  /**
   * Invasion presentation (cinematic only; sim/breach.ts): a raiders' truck runs at the wall from (fromX, fromZ) and hits it at (x, z) `secs` later
   * (this event's `t` is the start of the run), or a charge is planted at (x, z) and goes off `fuse` seconds later. The sim's own `breach` event
   * is what lets the crew in; these only show how the wall came down.
   */
  | { t: number; kind: 'ram'; fromX: number; fromZ: number; x: number; z: number; secs: number; /** false: the truck did not get through (see `why`); it stops at (stopX, stopZ). Absent = it did. */ ok?: boolean; why?: string; stopX?: number; stopZ?: number; driver?: string }
  | { t: number; kind: 'charge'; x: number; z: number; fuse: number; /** false: the charge went off and the wall held (or the carrier was down before it was planted: then it never goes off). */ ok?: boolean; why?: string; carrier?: string }
  /** The wall run is open here from now on (a live gap, drawn until the cutscene ends): run id, distance along it, width. */
  | { t: number; kind: 'gap'; runId: string; at: number; w: number; x: number; z: number }
  /** Raid depth (save v87, sim/raidOrders.ts): the family's order takes effect; the stage the defenders now hold. */
  | { t: number; kind: 'order'; order: RaidOrderKind; stage: RaidStage; units: string[] }
  /** A raid's extra outcomes (sim/raidOutcomes.ts). */
  | { t: number; kind: 'hostage'; unit: string; by: string; demand?: string }
  | { t: number; kind: 'spare'; unit: string; by: string; why: 'child' | 'complied' | 'unfound' }
  | { t: number; kind: 'fire'; structure: string; x: number; z: number; by?: string }
  | { t: number; kind: 'loot'; by: string; what: string; n: number; from: 'yard' | 'house' }
  | { t: number; kind: 'parley'; offer: 'tribute' | 'passage'; accepted: boolean; what?: string }
  | { t: number; kind: 'withdraw'; units: string[]; carrying: string[]; why: 'leader_down' | 'greed' | 'losses' | 'tribute' }
  | { t: number; kind: 'rally'; unit: string }
  | { t: number; kind: 'end'; result: 'repelled' | 'fled' | 'breached' | 'overrun' };

export type RaidOrderKind = 'hold' | 'fallback' | 'counter';
/** Where the defenders make their stand: the wall, the cover in the yard, the main house. */
export type RaidStage = 'wall' | 'yard' | 'house';

/** The drawn wall segment or gate that gives way (sim/breachMeans.ts `wallTarget`). */
export interface BreachWhere {
  runId: string;
  /** The wall kind (a PerimeterKind). */
  kind: string;
  /** A gate: the leaves went, not the wall. */
  gate: boolean;
  /** Distance along the run, and the width of the opening (world units). */
  at: number;
  w: number;
  x: number;
  z: number;
  /** Direction of the wall there (radians about +y), and the unit vector pointing from inside to outside. */
  heading: number;
  out: { x: number; z: number };
  /** Distance from the house. */
  dist: number;
}

/** A vehicle left standing in the scene (the opportunists' pickup): where, and which way its nose points (radians about +y, front toward +z). */
export interface BattleVehicle { kind: 'pickup'; x: number; z: number; rot: number }

/** What the invasion presentation decided for a scene (sim/breach.ts, sim/houseAssault.ts). Cinematic only. */
export interface InvasionMeta {
  method: 'ram' | 'charge';
  /** The break, for the camera: where the wall falls, which way is out, and the stretch of the scene it is shown in (s). */
  breach?: { x: number; z: number; ox: number; oz: number; from: number; to: number; at: number };
  /** The house the crew fights in, if it was found: its footprint box (world units), the door and the inside point just past it. */
  house?: { x0: number; z0: number; x1: number; z1: number; door: { x: number; z: number }; inside: { x: number; z: number } };
  /** The stretch of the battle played inside the house (s): the camera goes to the cutaway view for it. */
  interior?: { from: number; to: number };
}
/** What became of a defender left on the ground when the crew broke the line (sim/breachFates.ts). */
export type BreachFateKind = 'killed' | 'finished' | 'wounded' | 'taken' | 'held' | 'fled'
  /** Found and left alone (a child, or an unarmed adult who complied, by a merciful crew; sim/crewMercy.ts). */
  | 'spared'
  /** Never found: a hiding family the crew did not break in to (a barricaded room, or they left first). */
  | 'hid';

/**
 * The explicit data of a fought raid (save v87): every number the result card, the scene and the aftermath read, from the live sim (sim/battle.ts),
 * never invented by the scene. Absent on a battle made before v87 and on a peacetime break-in.
 */
export interface RaidFacts {
  /** `breached`: raiders in the yard (still beatable); `overrun`: the houses fell. `repelled`/`fled`: never past the line, or beaten back out of it. */
  result: 'repelled' | 'fled' | 'breached' | 'overrun';
  /** The crew got through the line at some point (even if it was then beaten back out of the yard). */
  linePassed: boolean;
  /** Raiders in the yard were driven back out (result `repelled` or `fled` after the line was passed). */
  beatenBack: boolean;
  /** The furthest stage the crew reached: the wall, the yard, the main house. */
  reached: RaidStage;
  /** How the line was broken and where, with every attempt (a failed ram, a charge that did not go). */
  breach?: { method: 'climb' | 'ram' | 'charge'; where: BreachWhere | null; t: number; attempts: Array<{ how: 'ram' | 'charge'; ok: boolean; why: string; t: number; odds: number }>; crewHad: { truck: boolean; satchels: number } };
  /** The family's orders as they took effect, and the stage they held at the end. */
  orders: Array<{ t: number; order: RaidOrderKind; stage: RaidStage }>;
  stage: RaidStage;
  /** The crew's temper, its disposition (`hostile` kills everyone it finds and sometimes takes captives; `merciful` spares children and the unarmed who comply) and its leader. */
  temper: 'desperate' | 'hard' | 'savage';
  disposition: 'hostile' | 'merciful';
  leader: { unit: string; name: string; down: boolean; downAt?: number } | null;
  /** The outer wall's distance from the house (world units), for what stands beyond each stage. */
  wallR: number;
  /** A defender who shot a man with his hands up (sim/crewMercy.ts `snapOdds`). */
  snaps: Array<{ shooter: string; victim: string }>;
  /** Explicit losses, by kind: what the yard cost and what the houses cost. */
  loss: { yard: string[]; house: string[]; people: { killed: number; wounded: number; taken: number; held: number; spared: number } };
  loot: Array<{ what: string; n: number; from: 'yard' | 'house' }>;
  hostages: Array<{ unit: string; by: string; demand?: string }>;
  fires: Array<{ structure: string; x: number; z: number }>;
  /** A talked end in the middle of the fight, or a part of the crew pulling out. */
  ending?: { kind: 'tribute' | 'passage' | 'partial_retreat' | 'rout'; at: number; what?: string; units?: string[] };
  /** The result in plain words, for the card. */
  text: string;
}

export interface Battle {
  /** The live raid facts (save v87). */
  raid?: RaidFacts;
  invasion?: InvasionMeta;
  /** Night or day (lights matter at night). */
  night: boolean;
  /** Who gave up (sim/surrender.ts): raiders (the crew, or a hurt man who could not run) and defenders (held at gunpoint at a breach). The picture draws hands up and a dropped weapon. */
  surrendered?: { raiders: string[]; defenders: string[] };
  /** Every defender still on the ground when a breach ended, and what became of them (sim/breachFates.ts): never standing unhurt among raiders. */
  fates?: Array<{ unit: string; fate: BreachFateKind }>;
  /** A parked vehicle (sim/raiderKinds.ts). */
  vehicle?: BattleVehicle;
  units: BattleUnit[];
  /** In time order. */
  events: BattleEvent[];
  duration: number;
}
