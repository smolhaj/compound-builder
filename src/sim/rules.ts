/**
 * House rules by vote (GDS §5.4 Governance, light, from the hamlet stage).
 * Once the place is a hamlet (15 or more people) the decisions are not only
 * the family's: the grown residents vote on a few standing rules. Rules only,
 * no council and no factions (user decision; docs/DECISIONS.md). Pure (tested).
 *
 *  Rations      open table (nothing changes) / shared by need (kids, elders and the
 *               sick eat first: they feel looked after, the strong feel a little
 *               short) / tight (everything counted: everyone grumbles, but in a
 *               shortage the table trusts the books).
 *  Night watch  volunteers (nothing changes) / a rota (every grown person takes
 *               a night in turn: a better watch, a tired household).
 *  Who is admitted  the family decides each time (nothing changes) / open door
 *               (newcomers feel welcome, a crowded house grumbles) / kin only
 *               (relatives are glad; newcomers feel it; taking a stranger in
 *               anyway breaks the rule, and the rule lapses on the second break).
 *
 * A vote: each grown resident is for or against the change from what they
 * are (kin or newcomer, fed or hungry, fighter, elder, sick, kid at home) and
 * from the play style the place has taken (Haven leans open, Clan and Ark lean
 * closed). A majority adopts it; the losing side is overruled for two weeks
 * (morale, newcomers' loyalty), the winning side glad. Nothing is voted unless
 * the player calls it, so a run that never does plays exactly as before.
 */
import { log } from './economy';
import { mulberry32 } from './rng';
import { dayIndex, type GameState } from './state';
import { stageNow, styleNow, type Stage } from './settlement';
import type { Person } from './family';

export type RuleId = 'rations' | 'watch' | 'admission';
export type RationsRule = 'open' | 'shared' | 'tight';
export type WatchRule = 'volunteers' | 'rota';
export type AdmissionRule = 'ask' | 'open' | 'kin';
export interface Adopted { rations: RationsRule; watch: WatchRule; admission: AdmissionRule }

export const RULE_IDS: RuleId[] = ['rations', 'watch', 'admission'];
export const RULES: Record<RuleId, { name: string; blurb: string; options: Array<{ id: string; name: string; blurb: string }> }> = {
  rations: { name: 'Rations', blurb: 'How the food is shared out.', options: [
    { id: 'open', name: 'Open table', blurb: 'Everyone eats what they need. Nothing changes.' },
    { id: 'shared', name: 'Shared by need', blurb: 'Kids, elders and the sick eat first. They feel looked after; the strong feel a little short.' },
    { id: 'tight', name: 'Tight and counted', blurb: 'Every portion counted. Everyone grumbles, but in a shortage the table trusts the books.' },
  ] },
  watch: { name: 'Night watch', blurb: 'Who stands the watch.', options: [
    { id: 'volunteers', name: 'Volunteers', blurb: 'Those who want to. Nothing changes.' },
    { id: 'rota', name: 'A rota', blurb: 'Every grown person takes a night in turn: a better watch, a tired household.' },
  ] },
  admission: { name: 'Who is admitted', blurb: 'Who may join the place.', options: [
    { id: 'ask', name: 'The family decides', blurb: 'Each case on its own. Nothing changes.' },
    { id: 'open', name: 'Open door', blurb: 'Newcomers feel welcome; a crowded house grumbles.' },
    { id: 'kin', name: 'Kin only', blurb: 'Relatives are glad and newcomers feel it. Taking a stranger in anyway breaks the rule.' },
  ] },
};

export const DEFAULT_RULES: Adopted = { rations: 'open', watch: 'volunteers', admission: 'ask' };

export interface VoteRecord { day: number; rule: RuleId; option: string; yes: number; no: number; passed: boolean }
export interface RulesState {
  adopted: Adopted;
  /** Day of the last vote on any rule, and on each rule. */
  lastVote: number;
  lastOn: Partial<Record<RuleId, number>>;
  /** Who is glad / overruled, until the day. */
  mood: { until: number; glad: string[]; sore: string[] } | null;
  /** Times the kin-only rule has been broken. */
  broken: number;
  history: VoteRecord[];
}
export const newRules = (): RulesState => ({ adopted: { ...DEFAULT_RULES }, lastVote: -999, lastOn: {}, mood: null, broken: 0, history: [] });
export const rulesOf = (s: GameState): RulesState => (s.rules ??= newRules());

export const VOTE_STAGE: Stage = 'hamlet';
const STAGE_ORDER: Stage[] = ['homestead', 'compound', 'hamlet', 'walled_village', 'small_town'];
export const atVoteStage = (st: Stage): boolean => STAGE_ORDER.indexOf(st) >= STAGE_ORDER.indexOf(VOTE_STAGE);
export const VOTE_GAP_DAYS = 30, RULE_GAP_DAYS = 90, MOOD_DAYS = 14;

const alive = (s: GameState, i: number) => { const n = s.personState[i]?.needs; return !!n && n.died == null && !n.left && !n.taken; };

/** The grown residents who vote: living, not kids, not guests sheltering for a night. */
export function voters(s: GameState): Person[] {
  return s.people.filter((p, i) => alive(s, i) && !p.kid && p.age >= 16 && p.origin?.kind !== 'guest');
}

/** Why a vote cannot be called now (null = it can). */
export function voteProblem(s: GameState, rule: RuleId, option: string): string | null {
  const R = rulesOf(s), day = dayIndex(s.clock.t);
  if (!atVoteStage(stageNow(s))) return 'The place is not yet a hamlet: with fewer than 15 people the decisions are still yours.';
  if (R.adopted[rule] === option) return 'That is already the rule.';
  if (!RULES[rule].options.some(o => o.id === option)) return 'No such choice.';
  if (day - R.lastVote < VOTE_GAP_DAYS) return `The table voted ${Math.max(1, day - R.lastVote)} days ago; give it ${VOTE_GAP_DAYS - (day - R.lastVote)} more.`;
  if (day - (R.lastOn[rule] ?? -999) < RULE_GAP_DAYS) return `${RULES[rule].name} was voted on lately.`;
  if (voters(s).length < 3) return 'Too few grown people to hold a vote.';
  return null;
}

/** How one resident leans on a change to `option`: -1 against to +1 for. Pure; the seeded jitter only breaks near-ties. */
export function lean(s: GameState, p: Person, rule: RuleId, option: string): number {
  const ps = s.personState[s.people.indexOf(p)];
  const hungry = (ps?.needs.hunger ?? 0) > 2500, sick = (p.conditions?.length ?? 0) > 0 || (ps?.needs.hurt?.length ?? 0) > 0;
  const kinfolk = !!p.kin || !p.origin, newcomer = !!p.origin && !p.kin;
  const fighter = (p.skills.hunter ?? 0) >= 4 || !!p.guard, style = styleNow(s);
  const cur = rulesOf(s).adopted[rule];
  let v = 0;
  if (rule === 'rations') {
    const needy = !!p.elder || sick || hungry;
    if (option === 'shared') v = (needy ? 0.55 : -0.1) + (hungry ? 0.2 : 0) + (fighter ? -0.1 : 0);
    else if (option === 'tight') v = (hungry ? 0.3 : -0.25) + (s.newcomers && s.newcomers.strain > 0 ? 0.5 : 0) + (p.elder ? 0.1 : 0);
    else v = (hungry ? -0.2 : 0.3) + (cur === 'tight' ? 0.3 : 0);   // back to an open table
  } else if (rule === 'watch') {
    if (option === 'rota') v = (fighter ? -0.15 : 0.35) + (newcomer ? 0.15 : 0) + (p.elder ? -0.5 : 0) + (stageRank(s) >= 3 ? 0.2 : 0);
    else v = (p.elder ? 0.4 : 0) + (fighter ? 0.1 : 0.2);
  } else {
    if (option === 'open') v = (newcomer ? 0.6 : -0.15) + (style === 'haven' ? 0.3 : style === 'clan' || style === 'ark' ? -0.3 : 0);
    else if (option === 'kin') v = (kinfolk ? 0.45 : -0.6) + (style === 'clan' ? 0.4 : style === 'ark' ? 0.2 : style === 'haven' ? -0.4 : 0);
    else v = (cur === 'open' ? (newcomer ? -0.3 : 0.25) : cur === 'kin' ? (newcomer ? 0.4 : -0.1) : 0) + 0.1;
  }
  return Math.max(-1, Math.min(1, v));
}
const stageRank = (s: GameState) => STAGE_ORDER.indexOf(stageNow(s));

export interface Tally { yes: number; no: number; rows: Array<{ id: string; name: string; yes: boolean; lean: number }> }
/** Everyone's ballot (deterministic for the day and the seed). */
export function tally(s: GameState, rule: RuleId, option: string): Tally {
  const day = dayIndex(s.clock.t), rows: Tally['rows'] = [];
  for (const p of voters(s)) {
    const r = mulberry32(s.seed * 6151 + day * 31 + p.id.length * 7 + (p.id.charCodeAt(p.id.length - 1) || 0) + RULE_IDS.indexOf(rule) * 101)();
    const l = lean(s, p, rule, option);
    rows.push({ id: p.id, name: p.first, yes: Math.abs(l) < 0.15 ? r < 0.5 : l > 0, lean: l });
  }
  const yes = rows.filter(r => r.yes).length;
  return { yes, no: rows.length - yes, rows };
}

/** Call the vote. Returns the log line (and applies the result), or null with `voteProblem` explaining. */
export function callVote(s: GameState, rule: RuleId, option: string): { passed: boolean; yes: number; no: number; line: string } | null {
  if (voteProblem(s, rule, option)) return null;
  const R = rulesOf(s), day = dayIndex(s.clock.t), t = tally(s, rule, option);
  const passed = t.yes > t.no;
  const opt = RULES[rule].options.find(o => o.id === option)!.name;
  R.lastVote = day; R.lastOn[rule] = day;
  R.history.push({ day, rule, option, yes: t.yes, no: t.no, passed });
  if (R.history.length > 8) R.history.shift();
  const win = t.rows.filter(r => r.yes === passed).map(r => r.id), lose = t.rows.filter(r => r.yes !== passed).map(r => r.id);
  R.mood = { until: day + MOOD_DAYS, glad: win, sore: lose };
  if (passed) { (R.adopted as unknown as Record<string, string>)[rule] = option; if (rule === 'admission') R.broken = 0; }
  const line = passed
    ? `The table voted ${t.yes} to ${t.no}: ${RULES[rule].name.toLowerCase()} is now "${opt.toLowerCase()}".`
    : `The table voted ${t.no} to ${t.yes} against "${opt.toLowerCase()}" for ${RULES[rule].name.toLowerCase()}; it stays as it was.`;
  log(s, line);
  // newcomers who were overruled take it to heart, the winners are glad (loyalty, once)
  for (const b of Object.values(s.newcomers?.bonds ?? {})) {
    if (b.kind === 'guest') continue;
    if (lose.includes(b.id)) b.loyalty = Math.max(0, b.loyalty - 4);
    else if (win.includes(b.id)) b.loyalty = Math.min(100, b.loyalty + 2);
  }
  return { passed, yes: t.yes, no: t.no, line };
}

/** Morale (strain points toward the baseline) a resident gets from the rules in force and the last vote. */
export function ruleMorale(s: GameState, id: string): number {
  const R = s.rules;
  if (!R) return 0;
  const i = s.people.findIndex(p => p.id === id), p = s.people[i];
  if (!p) return 0;
  const day = dayIndex(s.clock.t);
  const ps = s.personState[i], sick = (p.conditions?.length ?? 0) > 0 || (ps?.needs.hurt?.length ?? 0) > 0;
  let m = 0;
  const a = R.adopted;
  if (a.rations === 'shared') m += p.kid || p.elder || sick ? 1.2 : p.age >= 16 ? -0.3 : 0;
  if (a.rations === 'tight') m += (s.newcomers?.strain ?? 0) > 0 ? 0.8 : -1.2;
  if (a.watch === 'rota' && !p.kid && p.age >= 16 && !p.elder && (p.skills.hunter ?? 0) < 4 && !p.guard) m -= 0.7;
  if (a.admission === 'open' && (s.newcomers?.strain ?? 0) > 0 && !p.origin) m -= 0.8;
  if (a.admission === 'kin') m += p.kin || !p.origin ? 0.5 : -0.8;
  if (R.mood && day < R.mood.until) m += R.mood.glad.includes(id) ? 1.5 : R.mood.sore.includes(id) ? -2 : 0;
  return m;
}

/** A newcomer's daily loyalty change from the rules (added in newcomersDay). */
export function ruleLoyalty(s: GameState, kin: boolean): number {
  const a = s.rules?.adopted;
  if (!a) return 0;
  let d = 0;
  if (a.admission === 'open') d += 0.15;
  if (a.admission === 'kin' && !kin) d -= 0.2;
  if (a.rations === 'tight') d += (s.newcomers?.strain ?? 0) > 0 ? 0.1 : -0.1;
  if (a.rations === 'shared') d += 0.1;
  return d;
}

/** Detection points a rota adds to the watch (sim/encounters.ts postureOf). */
export const ruleWatch = (s: GameState): number => (s.rules?.adopted.watch === 'rota' ? Math.min(6, 2 + voters(s).length / 6) : 0);

/** Someone from outside was taken in. Under "kin only" that breaks the rule; the second break lets it lapse. Returns a log line or null. */
export function noteAdmission(s: GameState, n: number, kinds: Array<'neighbor' | 'stranger' | 'guest'>): string | null {
  const R = s.rules;
  if (!R || R.adopted.admission !== 'kin' || !n || kinds.every(k => k === 'guest')) return null;
  R.broken++;
  const day = dayIndex(s.clock.t);
  const sore = voters(s).filter(p => !p.origin || p.kin).map(p => p.id);
  R.mood = { until: day + MOOD_DAYS, glad: R.mood?.glad ?? [], sore };
  if (R.broken >= 2) { R.adopted.admission = 'ask'; R.broken = 0; return 'Taking them in against the house rule was the second time. The table drops "kin only"; the family decides again.'; }
  return 'Taking them in goes against the "kin only" rule. The old hands are sore about it; do it again and the rule goes.';
}
