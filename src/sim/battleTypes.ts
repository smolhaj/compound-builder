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
  | { t: number; kind: 'move'; unit: string; x: number; z: number; y?: number }
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
  | { t: number; kind: 'breach'; x: number; z: number }
  /** The defenders fall back to the `ring`-th inner ring (of `of`): the crew has broken the line before it. */
  | { t: number; kind: 'fallback'; ring: number; of: number; x: number; z: number }
  /** A wounded defender carried in to the sickbay by `by`. */
  | { t: number; kind: 'carry'; unit: string; by?: string }
  /** A crew working the steel door of a tunnel (sim/doorBreach.ts): `open` is the moment it gives. */
  | { t: number; kind: 'door'; what: 'hand tools' | 'a ram' | 'a cutting torch' | 'a charge' | 'an open door'; open: boolean; x?: number; z?: number }
  | { t: number; kind: 'flee'; unit: string }
  /** A line spoken in the fight: `who` is the unit speaking (a resident or a raider), absent for narration. */
  | { t: number; kind: 'say'; text: string; who?: string }
  | { t: number; kind: 'throw'; from: string; x: number; z: number; what: 'grenade' }
  | { t: number; kind: 'rocket'; from: string; x: number; z: number; y?: number }
  | { t: number; kind: 'explosion'; x: number; z: number; y?: number; radius: number; hits: string[]; wrecks?: 'post' | 'wall' }
  | { t: number; kind: 'cover'; unit: string; x: number; z: number }
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
  | { t: number; kind: 'ram'; fromX: number; fromZ: number; x: number; z: number; secs: number }
  | { t: number; kind: 'charge'; x: number; z: number; fuse: number }
  /** The wall run is open here from now on (a live gap, drawn until the cutscene ends): run id, distance along it, width. */
  | { t: number; kind: 'gap'; runId: string; at: number; w: number; x: number; z: number }
  | { t: number; kind: 'end'; result: 'repelled' | 'fled' | 'breached' | 'overrun' };

/** A vehicle left standing in the scene (the opportunists' pickup): where, and which way its nose points (radians about +y, front toward +z). */
export interface BattleVehicle { kind: 'pickup'; x: number; z: number; rot: number }

/** What the invasion presentation decided for a scene (sim/breach.ts, sim/houseAssault.ts). Cinematic only. */
export interface InvasionMeta {
  method: 'ram' | 'charge';
  /** The house the crew fights in, if it was found: its footprint box (world units), the door and the inside point just past it. */
  house?: { x0: number; z0: number; x1: number; z1: number; door: { x: number; z: number }; inside: { x: number; z: number } };
  /** The stretch of the battle played inside the house (s): the camera goes to the cutaway view for it. */
  interior?: { from: number; to: number };
}

export interface Battle {
  invasion?: InvasionMeta;
  /** Night or day (lights matter at night). */
  night: boolean;
  /** A parked vehicle (sim/raiderKinds.ts). */
  vehicle?: BattleVehicle;
  units: BattleUnit[];
  /** In time order. */
  events: BattleEvent[];
  duration: number;
}
