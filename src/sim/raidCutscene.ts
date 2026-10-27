/**
 * Staging a raid as a cutscene: decide first, then watch. Pure.
 *
 *  stageRaid   the player picked a stance on the gate card; resolve it on a copy
 *              (the same `resolve` as ever), lay the siege out in scenes with the
 *              battle each one plays, and hold the result back. The visible game
 *              is untouched, and its clock stands still, until the cutscene commits.
 *  commitRaid  the cutscene is over (watched or skipped): put the staged result on
 *              the clock, advanced by exactly the siege's length, ONCE.
 *  raidReport  what the aftermath card says: who was hurt, killed or taken, what
 *              was lost, how many raiders are left on the drive.
 */
import type { Battle } from './battleTypes';
import { resolve, type Outcome, type Stance } from './encounters';
import { commitDays, gateScene, planSiege, probeBattle, type SiegePlan } from './siege';
import { step } from './engine';
import { hourOf, type GameState } from './state';

export interface StagedRaid {
  /** The game with the stance resolved but the clock still at the arrival. */
  staged: GameState;
  plan: SiegePlan;
  /** One battle per scene, in order. */
  battles: Battle[];
  outcome: Outcome;
  /** The stance that was played (a failed parley or a failed hide turns into a fight). */
  played: Stance;
  report: RaidReport;
  /** Game time (days) of the arrival. */
  t0: number;
}

export interface RaidReport {
  title: string;
  text: string;
  tone: Outcome['tone'];
  killed: string[];
  wounded: string[];
  taken: string[];
  /** Stock lost, [what, how many]. */
  lost: Array<[string, number]>;
  /** Raiders left on the drive after a fight the family won. */
  raidersWounded: number;
  raidersDead: number;
  /** Rounds fired by the family in the fight and the scenes before it. */
  rounds: number;
  /** The rest of the outcome card's lines (ammunition, mines, recovered explosives, ...). */
  lines: string[];
  /** Whether the card is followed by the aftermath choices (wounded or dead raiders on the drive). */
  aftermath: boolean;
}

const STOCK_LOSSES = ['fresh', 'frozen', 'canned', 'staples', 'fuel', 'meds', 'ifak'] as const;

/** Resolve the player's stance on a copy and lay out the cutscene. */
export function stageRaid(game: GameState, stance: Stance): StagedRaid {
  const e = game.gate.pending;
  if (!e) throw new Error('no one at the gate');
  const g = structuredClone(game);
  const t0 = g.clock.t, hour = hourOf(t0);
  g.gate.battle = undefined;
  const outcome = resolve(g, stance);
  const battle = (g.gate.battle as Battle | undefined) ?? null;
  const seed = game.seed * 131 + e.day * 7 + 1;
  const played: Stance = battle ? 'defend' : stance;
  const plan = planSiege({ kind: e.kind, size: e.size, temper: e.temper ?? 'desperate', hour, seed, fought: !!battle, fightSeconds: battle?.duration ?? null });
  // the scenes before the assault are cosmetic fights that cost rounds, never blood
  let rounds = 0;
  const battles: Battle[] = plan.scenes.map(sc => {
    if (sc.kind === 'assault' && battle) return battle;
    if (sc.kind === 'gate') return gateScene(game, e, stance, outcome.tone, seed);
    const p = probeBattle(game, sc.kind, e.size, seed + sc.index * 977);
    for (const [cal, n] of Object.entries(p.spent)) {
      const have = g.armory.ammo[cal as keyof typeof g.armory.ammo] ?? 0, take = Math.min(have, n);
      if (take > 0) { g.armory.ammo[cal as keyof typeof g.armory.ammo] = have - take; rounds += take; }
    }
    return p;
  });
  if (rounds > 0) outcome.lines.push(`${rounds} more rounds went out in the earlier scenes.`);
  g.gate.card = outcome;
  return { staged: g, plan, battles, outcome, played, report: raidReport(game, g, outcome, rounds), t0 };
}

/** Put the staged result on the clock: the siege's length, once. */
export function commitRaid(st: Pick<StagedRaid, 'staged' | 'plan'>): GameState {
  return step(st.staged, commitDays(st.plan));
}

/** What changed for the family and the stores between `before` and `after`, in the card's words. */
export function raidReport(before: GameState, after: GameState, outcome: Outcome, extraRounds = 0): RaidReport {
  const killed: string[] = [], wounded: string[] = [], taken: string[] = [];
  after.people.forEach((p, i) => {
    const b = before.personState.find(x => x.id === p.id)?.needs, a = after.personState[i]?.needs;
    if (!b || !a) return;
    if (a.died != null && b.died == null) (a.taken ? taken : killed).push(p.first);
    else if (a.died == null && a.hurt.length > b.hurt.length) wounded.push(p.first);
  });
  const lost: Array<[string, number]> = [];
  for (const k of STOCK_LOSSES) { const d = Math.floor((before.stock[k] ?? 0) - (after.stock[k] ?? 0)); if (d > 0) lost.push([k, d]); }
  const am = after.gate.aftermath;
  const b = after.gate.battle;
  const rounds = (b ? b.events.filter(e => e.kind === 'shot' && e.from.startsWith('h_')).length : 0) + extraRounds;
  return {
    title: outcome.title, text: outcome.text, tone: outcome.tone, killed, wounded, taken, lost,
    raidersWounded: am?.wounded ?? 0, raidersDead: am?.dead ?? 0, rounds, lines: outcome.lines, aftermath: !!am,
  };
}
