/**
 * How a dome reads from the county road, wired into who comes (owner decision 4: a very visible target that can be well defended). One reader
 * (`domeRead`) of the finished domes on the place feeds the posture (visibility, the fortress look), the encounter weights (looters, gangs, curious
 * arrivals), the scouts a crew sends ahead, and the Reputation readout on the Defense page. Pure (tested in siege.test.ts).
 *
 *   visibility  miles seen (exposure.domeVisibility: the day shape, the night glow with the lights on, the sun's glint), as posture points.
 *   look        points on the fortress look (exposure.LOOK): an armored dome looks like a fortress, a glass one like a prize.
 *   attraction  visibility the wall does not answer: seen x (1 - hardness) (exposure.attract), where hardness is the road's word for the place
 *               (sim/reputation.ts), so a well-defended dome deters opportunists and a bare one invites them.
 *
 * Monotone: more hardness never raises attraction; a taller tier is never seen less (property tests).
 */
import { LOOK, attract, domeVisibility, gangWeight, looterWeight } from './exposure';
import { domesOf } from './standing';
import { tierRank, type DomeTier } from './tiers';
import type { GameState } from '../state';

/** Posture points of visibility per mile seen, and the most a dome adds. */
export const VIS_PER_MILE = 2.4, VIS_CAP = 32;
/** The share of the most visible dome (miles / 12) that reads as a scout's reason to come, and the weight of a curious passer-by. */
export const CURIOUS_K = 0.8, SCOUT_K = 1.2;

export interface DomeRead {
  tier: DomeTier;
  /** Miles seen at the best of day, lit night and glint. */
  seenMi: number;
  /** 0..1 of the 12-mile reference. */
  seen: number;
  visibilityPts: number;
  lookPts: number;
  /** Visibility the wall does not answer (0..1). */
  attraction: number;
  looterK: number;
  gangK: number;
  /** Multiplier on curious passers-by (arrivals), and on the chance a crew sends scouts. */
  curiousK: number;
  scoutK: number;
  /** One line for the Defense page. */
  line: string;
}

/** The tallest finished dome on the place, as the county road sees it; null with none. `hard` is the road's hardness (0..1). */
export function domeRead(s: Pick<GameState, 'structures' | 'utilities' | 'opsec' | 'raidDamage'>, hard: number): DomeRead | null {
  const domes = domesOf(s).filter(d => d.tier !== 'earthen');
  if (!domes.length) return null;
  const top = domes.reduce((a, d) => (tierRank(d.tier) > tierRank(a.tier) ? d : a));
  const lit = (s.utilities?.lit?.length ?? 0) > 0;
  const v = domeVisibility(top.tier, { shades: !!s.opsec?.blackout });
  const seenMi = Math.max(v.dayMi, lit ? v.nightMi : 0, v.glintMi);
  const seen = Math.min(1, seenMi / 12);
  const a = attract(top.tier, hard, { shades: !!s.opsec?.blackout });
  const damaged = 0.5 + 0.5 * top.health;
  const line = `A ${top.tier === 'arcology' ? 'sci-fi arcology' : top.tier === 'glass' ? 'glass dome' : 'geodesic dome'} seen from about ${seenMi < 10 ? seenMi.toFixed(1) : Math.round(seenMi)} miles: ${a >= 0.5 ? 'an open invitation' : a >= 0.2 ? 'it draws attention, and the walls answer part of it' : 'it draws eyes, and the defenses answer it'}`;
  return {
    tier: top.tier, seenMi, seen, visibilityPts: Math.min(VIS_CAP, seenMi * VIS_PER_MILE), lookPts: LOOK[top.tier] * damaged, attraction: a,
    looterK: looterWeight(a), gangK: gangWeight(a), curiousK: 1 + CURIOUS_K * seen, scoutK: 1 + SCOUT_K * seen, line,
  };
}
