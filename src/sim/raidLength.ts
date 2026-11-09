/**
 * How long a raid plays (user: a skirmish about a minute, a serious raid 3 to 4 minutes, a full invasion up to about 6; skip and speed controls stay).
 * Pure. The fight itself is the sim's battle played 1:1; what scales is the approach before it and the quiet after, and the house fight of an invasion.
 */
import type { Scene } from './siege';

export type RaidClass = 'skirmish' | 'serious' | 'invasion';

/** Which kind of raid a staged siege is. */
export function raidClass(o: { scenes: number; crew: number; broke: boolean }): RaidClass {
  if (o.broke) return 'invasion';
  if (o.scenes > 1 || o.crew >= 8) return 'serious';
  return 'skirmish';
}

/** The stretch of the approach and the aftermath, by class. */
export const PACE: Record<RaidClass, number> = { skirmish: 1, serious: 4.5, invasion: 5 };

/** Seconds added to the house fight of an invasion (sim/houseAssault.ts reads this). */
export const INVASION_FIGHT_EXTRA = 70;

export function withPace(scenes: readonly Scene[], cls: RaidClass): Scene[] {
  return scenes.map(sc => ({ ...sc, pace: PACE[cls] }));
}
