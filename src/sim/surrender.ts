/**
 * Surrender (pure). A crew that has lost heavily and has no way out may give up instead of fighting on or running; a raider who was hit and
 * cannot run may drop the gun and raise his hands instead of lying where he fell. Temper and kind decide:
 *
 *   savage       almost never (only a last stand: every man pinned and trapped, four in five down)
 *   hard         rarely (a gang does not give up to a family; a disciplined crew sometimes does)
 *   desperate    often: families, hungry looters, men who came for food and did not come to die
 *   by kind      refugees > patrol > looters > requisition > militia > tunnelers > gang (militia and patrols by discipline: they give up when
 *                outgunned and the officer is down, and they expect to be treated by the rules)
 *
 * The battle sim (sim/battle.ts) rolls these; the aftermath choices (sim/aftermath.ts) say what the family does with them.
 */
export type CrewKind = 'looters' | 'gang' | 'militia' | 'patrol' | 'requisition' | 'refugees' | 'tunnelers' | 'horde' | 'other';
export type Temper = 'desperate' | 'hard' | 'savage';

/** The kinds of encounter that field a fighting crew, as a crew kind (anything else is `other`). */
export function crewKindOf(kind: string | undefined): CrewKind {
  switch (kind) {
    case 'looters': case 'gang': case 'militia': case 'patrol': case 'requisition': case 'refugees': case 'tunnelers': case 'horde': return kind;
    default: return 'other';
  }
}

/** How readily each kind gives up when it is beaten, before temper. */
export const KIND_YIELD: Record<CrewKind, number> = { refugees: 0.75, patrol: 0.4, looters: 0.4, requisition: 0.3, militia: 0.3, tunnelers: 0.22, other: 0.3, gang: 0.12, horde: 0 };
const TEMPER_YIELD: Record<Temper, number> = { desperate: 1.25, hard: 0.5, savage: 0 };

export interface CrewSurrenderCtx {
  temper: Temper;
  kind?: CrewKind;
  /** The share of the crew down, dead or run (0-1). */
  lossShare: number;
  /** The share of those still up who are pinned down by fire (0-1). */
  pinnedShare: number;
  /** Defenders still fighting per raider still fighting. */
  outnumbered: number;
  /** Cut off: came up out of a hole into a waiting family, or has the wall at its back. */
  trapped: boolean;
  /** The leader is down. */
  leaderDown: boolean;
}

/** No way out: cut off, or pinned where they stand, or outgunned by two and a half to one. */
export function noWayOut(c: Pick<CrewSurrenderCtx, 'trapped' | 'pinnedShare' | 'outnumbered'>): boolean {
  return c.trapped || c.pinnedShare >= 0.6 || c.outnumbered >= 2.5;
}

/** The chance the crew lays down its arms rather than run (0 when it has not lost heavily or can still get away). */
export function crewSurrenderOdds(c: CrewSurrenderCtx): number {
  const kind = c.kind ?? 'other';
  if (c.lossShare < 0.4 || !noWayOut(c)) return 0;
  if (c.temper === 'savage' || kind === 'horde') return c.trapped && c.pinnedShare >= 0.8 && c.lossShare >= 0.8 && kind !== 'horde' ? 0.04 : 0;   // a last stand, no more
  const p = KIND_YIELD[kind] * TEMPER_YIELD[c.temper] * (0.6 + 0.8 * c.lossShare) * (c.trapped ? 1.3 : 1) * (c.leaderDown ? 1.25 : 1);
  return Math.max(0, Math.min(0.9, p));
}

export function crewSurrenders(c: CrewSurrenderCtx, r: () => number): boolean {
  const p = crewSurrenderOdds(c);
  return p > 0 && r() < p;
}

const KIND_DOWNED: Record<CrewKind, number> = { refugees: 1.4, patrol: 1.2, militia: 1.1, looters: 1, requisition: 1, other: 1, tunnelers: 0.8, gang: 0.6, horde: 0 };

/** The chance a raider who was hit and cannot run puts his hands up rather than lying where he fell (`sev`: 100 minus what is left of him; a man hurt this badly lies down). */
export function downedSurrenderOdds(temper: Temper, kind: CrewKind | undefined, sev: number): number {
  const base = temper === 'savage' ? 0 : temper === 'hard' ? 0.25 : 0.6;
  return Math.min(0.9, base * KIND_DOWNED[kind ?? 'other'] * (sev < 70 ? 1 : 0.3));
}
