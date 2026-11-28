/**
 * A cutscene ladder's life after its climber is done with it (pure, tested). A ladder is put up for one raider (or defender) and until now stood
 * there for the rest of the scene: after a retreat it was left upright and alone in open ground. Now, once the owner has used it and then died,
 * left the scene or walked away from its foot, it tips over sideways onto the ground, lies there a while and is gone (the crew picks it up).
 * A ladder with no owner named (an old timeline) never changes.
 */
export interface LadderLife {
  /** The unit that climbs it (absent: it stands for the whole scene). */
  owner?: string;
  /** The owner has been at the foot or on the rungs. */
  engaged: boolean;
  /** Seconds since it began to fall (null: standing). */
  fell: number | null;
}

/** Seconds a ladder takes to tip over, lies flat, and its size after that (the mesh is collapsed to nothing). */
export const FALL_SECS = 0.7, LIE_SECS = 3;
/** How near the foot (world units, 1 u = 20 ft) counts as "at the ladder", and how far on the owner is done with it. */
export const NEAR_FOOT = 1.0, AWAY_FROM_FOOT = 1.8;

export interface OwnerAt { x: number; y: number; z: number; dead: boolean; gone: boolean }

export const newLadder = (owner?: string): LadderLife => ({ ...(owner ? { owner } : {}), engaged: false, fell: null });

/** Advance one ladder by `dt` seconds given where its owner is now (null: not in the scene). */
export function stepLadder(l: LadderLife, dt: number, owner: OwnerAt | null, foot: { x: number; z: number }): LadderLife {
  if (l.fell !== null) return { ...l, fell: l.fell + dt };
  if (!l.owner) return l;
  const d = owner ? Math.hypot(owner.x - foot.x, owner.z - foot.z) : Infinity;
  const engaged = l.engaged || (!!owner && !owner.dead && !owner.gone && (d <= NEAR_FOOT || owner.y > 0.05));
  if (!engaged) return l;
  const done = !owner || owner.dead || owner.gone || (d >= AWAY_FROM_FOOT && owner.y <= 0.05);
  return { ...l, engaged, fell: done ? 0 : null };
}

/** 0 standing .. 1 flat on the ground. */
export const tipOf = (l: LadderLife): number => (l.fell === null ? 0 : Math.min(1, l.fell / FALL_SECS));
/** Is the ladder gone from the scene (picked up)? */
export const ladderGone = (l: LadderLife): boolean => l.fell !== null && l.fell >= FALL_SECS + LIE_SECS;
