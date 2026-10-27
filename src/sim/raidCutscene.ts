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
import { breakInScene, commitDays, finishPlan, gateScene, planSiege, probeBattle, siegeStrain, type Scene, type SiegePlan } from './siege';
import { step } from './engine';
import { hourOf, type GameState } from './state';

export interface StagedRaid {
  /** The game with the stance resolved but the clock still at the arrival. */
  staged: GameState;
  plan: SiegePlan;
  /** One battle per scene, in order. */
  battles: Battle[];
  /** Rounds spent in each scene's cosmetic fight (the assault's are in its battle). */
  spent: Array<Record<string, number>>;
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

/** Scenes already settled when the stance changes mid-siege (the ones played, and any cosmetic ones still to come). */
interface Keep { prev: StagedRaid; played: number }

/** Resolve the player's stance on a copy and lay out the cutscene. */
export function stageRaid(game: GameState, stance: Stance, keep?: Keep): StagedRaid {
  const e = game.gate.pending;
  if (!e) throw new Error('no one at the gate');
  const g = structuredClone(game);
  const t0 = g.clock.t, hour = hourOf(t0);
  g.gate.battle = undefined;
  const outcome = resolve(g, stance);
  const battle = (g.gate.battle as Battle | undefined) ?? null;
  const seed = game.seed * 131 + e.day * 7 + 1;
  const played: Stance = battle ? 'defend' : stance;
  const fresh = planSiege({ kind: e.kind, size: e.size, temper: e.temper ?? 'desperate', hour, seed, fought: !!battle, fightSeconds: battle?.duration ?? null });
  const finalScene = fresh.scenes[fresh.scenes.length - 1];
  const finalBattle = (): Battle => {
    if (battle) return battle;
    if (e.kind === 'break_in') return breakInScene(game, e, stance, outcome.tone, seed);
    return gateScene(game, e, stance, outcome.tone, seed);
  };
  let scenes: Scene[], battles: Battle[], spent: Array<Record<string, number>>;
  if (keep) {
    // a fight still to come leaves the cosmetic scenes in place; anything else ends the siege after the scenes played
    const n = keep.prev.plan.scenes.length, upto = battle ? n - 1 : keep.played;
    scenes = [...keep.prev.plan.scenes.slice(0, upto), { ...finalScene, gap: keep.prev.plan.scenes[battle ? n - 1 : keep.played].gap }];
    battles = [...keep.prev.battles.slice(0, upto), finalBattle()];
    spent = [...keep.prev.spent.slice(0, upto), {}];
  } else {
    scenes = fresh.scenes; battles = []; spent = [];
    for (const sc of scenes) {
      if (sc.index === scenes.length - 1) { battles.push(finalBattle()); spent.push({}); continue; }
      const p = probeBattle(game, sc.kind, e.size, seed + sc.index * 977);
      battles.push(p); spent.push(p.spent);
    }
  }
  const plan = finishPlan(e.kind, hour, scenes);
  // the scenes before the assault are cosmetic fights that cost rounds, never blood
  let rounds = 0;
  for (const sp of spent) for (const [cal, n] of Object.entries(sp)) {
    const k = cal as keyof typeof g.armory.ammo;
    const have = g.armory.ammo[k] ?? 0, take = Math.min(have, n);
    if (take > 0) { g.armory.ammo[k] = have - take; rounds += take; }
  }
  if (rounds > 0) outcome.lines.push(`${rounds} more rounds went out in the earlier scenes.`);
  // a night under siege: lost sleep and morale for everyone still on the place
  const strain = siegeStrain(plan);
  let strained = false;
  for (const ps of g.personState) if (ps.needs.died == null && !ps.needs.taken) {
    ps.needs.morale = Math.max(0, ps.needs.morale - strain.morale);
    ps.needs.tired = (ps.needs.tired ?? 0) + strain.sleep;
    strained = true;
  }
  if (strained && (plan.scenes.length > 1 || strain.morale >= 3)) outcome.lines.push(plan.scenes.length > 1 ? `Nobody slept: about ${strain.sleep} hours owed, and the family is shaken (morale -${strain.morale}).` : `Nobody will sleep after that (morale -${strain.morale}).`);
  g.gate.card = outcome;
  return { staged: g, plan, battles, spent, outcome, played, report: raidReport(game, g, outcome, rounds), t0 };
}

/**
 * The player changed their stance between scenes `0..played-1` and the next (once): replay the
 * resolution from the untouched game with the new stance, keeping the scenes already shown (and,
 * if the new stance is still a fight, the cosmetic scenes still to come). The clock timeline up
 * to now is identical, so the virtual clock does not jump; only what follows changes.
 */
export function restageRaid(game: GameState, prev: StagedRaid, played: number, stance: Stance): StagedRaid {
  return stageRaid(game, stance, { prev, played });
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
