/**
 * A fight at the compound, as a timeline you watch (the user: "you watch the
 * family/compound residents actually go and defend the compound … automated
 * so you're just watching"). sim/battle.ts builds one from the game state;
 * the world plays it back (residents run to their posts, alarms, lights,
 * shots, mines, wounds, a breach). Times are seconds of playback.
 */
export type Side = 'home' | 'raider';

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
}

export type BattleEvent =
  | { t: number; kind: 'alarm'; what: 'dog' | 'sensor' | 'tripwire' | 'camera' | 'watch' }
  | { t: number; kind: 'lights' }
  | { t: number; kind: 'move'; unit: string; x: number; z: number; y?: number }
  | { t: number; kind: 'shot'; from: string; to: string; hit: boolean; auto?: boolean }
  | { t: number; kind: 'mine'; x: number; z: number; hits: string[] }
  /** `part`: where the round struck (shrapnel has none); `stopped`: armor caught it (a bruise, not a wound). */
  | { t: number; kind: 'wound'; unit: string; sev: number; part?: 'head' | 'torso' | 'arm' | 'leg'; stopped?: boolean }
  | { t: number; kind: 'death'; unit: string }
  | { t: number; kind: 'breach'; x: number; z: number }
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
  | { t: number; kind: 'end'; result: 'repelled' | 'fled' | 'breached' | 'overrun' };

export interface Battle {
  /** Night or day (lights matter at night). */
  night: boolean;
  units: BattleUnit[];
  /** In time order. */
  events: BattleEvent[];
  duration: number;
}
