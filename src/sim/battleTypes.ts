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
}

export type BattleEvent =
  | { t: number; kind: 'alarm'; what: 'dog' | 'sensor' | 'tripwire' | 'camera' | 'watch' }
  | { t: number; kind: 'lights' }
  | { t: number; kind: 'move'; unit: string; x: number; z: number; y?: number }
  | { t: number; kind: 'shot'; from: string; to: string; hit: boolean; auto?: boolean }
  | { t: number; kind: 'mine'; x: number; z: number; hits: string[] }
  | { t: number; kind: 'wound'; unit: string; sev: number }
  | { t: number; kind: 'death'; unit: string }
  | { t: number; kind: 'breach'; x: number; z: number }
  | { t: number; kind: 'flee'; unit: string }
  | { t: number; kind: 'say'; text: string }
  | { t: number; kind: 'end'; result: 'repelled' | 'fled' | 'breached' | 'overrun' };

export interface Battle {
  /** Night or day (lights matter at night). */
  night: boolean;
  units: BattleUnit[];
  /** In time order. */
  events: BattleEvent[];
  duration: number;
}
