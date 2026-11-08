/**
 * Questioning a prisoner (user answer: "a conversation with choices: ask about the next crew, who sent them, the loot stash; harsh vs kind changes what
 * you learn and humanity"). Pure and seeded; the saved state is `Prisoner.asked` (save v89). Sim/aftermath.ts already lets a prisoner talk on his own after
 * a while (`prisonersDay`); this is the player's turn at him.
 *
 *   questions   next_crew (who is coming next, so the gate is forewarned), who_sent (who runs them and where: a lead on the taken, or the boss shaken),
 *               stash (where the crew cached what it took: food and rounds, or a wasted trip when he lies)
 *   kind        a meal, a chair, the time: he speaks less often (and more with trust), and when he does it is true nine times in ten. Humanity +1, trust +6.
 *   harsh       rope, cold, the threat of worse: he speaks more often, and half of it is what he thinks you want to hear. Humanity -4, trust -12, and he
 *               may be hurt. Everyone on the place hears it (a small weight on morale).
 *   limits      each prisoner can be asked each question once, and at most three times; a man who has been hurt twice tells you nothing.
 */
import { log } from './economy';
import { prisonerLead, openCaptives } from './rescue';
import { mulberry32 } from './rng';
import type { GameState } from './state';
import type { Prisoner } from './aftermath';

export type Question = 'next_crew' | 'who_sent' | 'stash';
export type Approach = 'kind' | 'harsh';
export const QUESTIONS: readonly Question[] = ['next_crew', 'who_sent', 'stash'];
export const QUESTION_NAME: Record<Question, string> = { next_crew: 'Who is coming next?', who_sent: 'Who sent you?', stash: 'Where is the loot?' };
export const MAX_QUESTIONS = 3;
export const HARSH = { humanity: -4, trust: -12, hurt: 0.3, morale: 2 } as const;
export const KIND = { humanity: 1, trust: 6 } as const;

/** What the man would say and whether it is true. */
export function askOdds(p: Pick<Prisoner, 'trust' | 'sev'>, approach: Approach, temper: 'desperate' | 'hard' | 'savage'): { speaks: number; truth: number } {
  const fear = temper === 'desperate' ? 0.12 : temper === 'savage' ? -0.2 : 0;   // a loyal gang's man says less
  const speaks = approach === 'kind' ? 0.3 + p.trust * 0.004 + fear : 0.62 - p.trust * 0.002 + fear + p.sev / 100 * 0.1;
  return { speaks: Math.max(0.05, Math.min(0.92, speaks)), truth: approach === 'kind' ? 0.9 : 0.5 };
}

export interface AskResult { ok: boolean; lines: string[]; refused?: string }

/** Why a question cannot be asked now (null: it can). */
export function askProblem(p: Prisoner, q: Question): string | null {
  const asked = p.asked ?? [];
  if (asked.includes(q)) return 'already asked';
  if (asked.length >= MAX_QUESTIONS) return 'he has nothing more to say';
  if (p.hurtTwice) return 'he has been hurt too badly to say anything you could believe';
  return null;
}

/** Ask. Mutates the game (humanity, trust, stock, the gate's warning); one line each in the log. */
export function interrogate(s: GameState, id: string, q: Question, approach: Approach): AskResult {
  const ps = s.gate.prisoners ?? [], p = ps.find(x => x.id === id) as Prisoner | undefined;
  if (!p) return { ok: false, lines: [], refused: 'no such prisoner' };
  const why = askProblem(p, q);
  if (why) return { ok: false, lines: [], refused: why };
  const day = Math.floor(s.clock.t), r = mulberry32(s.seed * 2677 + day * 19 + id.length * 7 + QUESTIONS.indexOf(q) * 3 + (approach === 'harsh' ? 1 : 0) + (p.asked?.length ?? 0) * 101);
  const raid = (s.gate.battle as { raid?: { temper?: 'desperate' | 'hard' | 'savage'; crew?: string; leader?: { name: string } | null } } | undefined)?.raid;
  const temper = raid?.temper ?? 'hard', lines: string[] = [];
  (p.asked ??= []).push(q);
  const g = s.gate;
  if (approach === 'harsh') {
    g.humanity = Math.max(0, g.humanity + HARSH.humanity); p.trust = Math.max(0, p.trust - 12);
    for (const ps2 of s.personState) if (ps2.needs.died == null) ps2.needs.morale = Math.max(0, ps2.needs.morale - HARSH.morale);
    if (r() < HARSH.hurt) { p.sev = Math.min(100, p.sev + 12); if (p.sev > 60) p.hurtTwice = true; lines.push('It got rough. He has a new bruise and he is watching the door.'); }
  } else { g.humanity = Math.min(100, g.humanity + KIND.humanity); p.trust = Math.min(100, p.trust + KIND.trust); }
  const o = askOdds(p, approach, temper);
  if (r() >= o.speaks) { lines.push(`${p.name} looked at the floor and said nothing.`); for (const l of lines) log(s, l); return { ok: false, lines }; }
  const truthful = r() < o.truth;
  p.talked = true;
  const boss = raid?.leader?.name.split(' (')[0];
  if (q === 'next_crew') {
    if (truthful) {
      g.forewarned = true;
      const cb = g.comeBack;
      lines.push(cb ? `${p.name} says the same crew is coming back, about ${cb.size} of them, within the month. You will see them coming earlier.` : `${p.name} says there is another outfit working the county, a dozen or so, from the north. You will see them coming earlier.`);
    } else { lines.push(`${p.name} says they are coming tonight, from the creek. You sat up all night with every gun loaded. Nobody came.`); for (const ps2 of s.personState) if (ps2.needs.died == null) ps2.needs.morale = Math.max(0, ps2.needs.morale - 1); }
  } else if (q === 'who_sent') {
    if (truthful) {
      const lead = openCaptives(s).length ? prisonerLead(s, r) : null;
      if (lead) lines.push(`${p.name} knows the crew that took your people: ${lead}`);
      else { g.next = g.next + 6; lines.push(`${p.name} says ${boss ? `${boss} runs them` : 'a man called the Colonel runs them'}, out of a camp up the highway. ${boss ?? 'He'} will hear that you know. The next visit will be a week later than it would have been.`); }
    } else lines.push(`${p.name} gives you a name and a place. Nobody on the radio has heard of either.`);
  } else {
    if (truthful) {
      const canned = 6 + Math.floor(r() * 9), rounds = 20 + Math.floor(r() * 40);
      s.stock.canned += canned; s.armory.ammo['556'] = (s.armory.ammo['556'] ?? 0) + rounds;
      lines.push(`${p.name} told you where his crew cached what it took. You brought back ${canned} cases of canned food and ${rounds} rounds of 5.56.`);
    } else { s.stock.fuel = Math.max(0, s.stock.fuel - 1); lines.push(`${p.name} sent you to a culvert off the county road. It was empty. A can of fuel and an afternoon gone.`); }
  }
  for (const l of lines) log(s, l);
  return { ok: truthful, lines };
}
