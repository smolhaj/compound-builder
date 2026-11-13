/**
 * Family rituals (the oasis: a sense of safety and warmth inside the walls of a well-built, defended compound). Pure; the
 * engine calls `ritualHour` at every game-hour mark and `ritualDay` at midnight, the world reads `ritualKind` / `returnsAt`.
 *
 * The rituals are not extra duties. They are what the existing day plan (sim/daily.ts) already schedules for the evening,
 * given a place to happen and a reason to skip:
 *
 *   dinner     the plan's `meal` hour, 6 to 7 p.m.: everyone at the table in the home, from the real pantry
 *   fireside   the free evening after dinner, 7 p.m. to bedtime: the chairs and the hearth rug
 *   play       the kids' free hours after school, 2 to 6 p.m.: the yard when it is fine, the rug when it is not
 *   (bed)      the plan's `sleep` hours: in a real bed (game/people/sleepPlan.ts), the dog curled by the stove
 *
 * Safety. The shared `homeSafety` level (game/atmosphere/homeSafety.ts) feeds `calm`, which falls the moment the level does
 * and climbs back slowly (`CALM_RISE`). The rituals run only while `calm` is at or above the person's own return point
 * (`returnsAt`): below it the family stops, scatters and goes on alert, and as calm recovers they come back to the table one
 * at a time (the return points are spread over `RETURN_BAND`), not all in one frame.
 *
 * Mental health. A completed ritual raises the person's `score` (an average that fades over about three days). The score is
 * read by mind.ts as one more help ("family evenings", `ritualHelp`) and by daily.ts `lifeMorale` (`ritualMorale`). The
 * numbers are small on purpose: a steady household gets about 3 points off its strain target and 2 morale, less than a
 * rest day or a gathering.
 *
 * Stories. A few rituals write a line in the chronicle (birthday supper, first harvest, the mended fence, a quiet winter
 * evening), each once, and at most `STORIES_PER_YEAR` a year.
 */
import { calendarOf, dayIndex, type GameState } from './state';
import { chronicle } from './lineage';
import { FOOD_CATS, pantryKcal } from './pantry';
import { hostileAtGate } from '../game/livestock/livestockPlan';
import { collapseProgress, homeSafety, homeSafetyInput } from '../game/atmosphere/homeSafety';
import { openDamage } from './raidDamage';

export type RitualKind = 'dinner' | 'fireside' | 'play';
export const RITUAL_KINDS: readonly RitualKind[] = ['dinner', 'fireside', 'play'];

/** Hours of the day (0-24) each ritual covers. */
export const WINDOW: Record<RitualKind, readonly [number, number]> = { dinner: [17.5, 19.5], fireside: [19, 23], play: [14, 18] };

/** Rituals run for a person only while the household's calm is at least this (plus their own offset, `returnsAt`). */
export const CALM_MIN = 0.6;
/** The spread of return points: the first person sits down at CALM_MIN, the sixth at CALM_MIN + RETURN_BAND. */
export const RETURN_BAND = 0.15;
/** Below this the household is on alert (stands at the windows, the little ones down low); between this and the return point it is wary. */
export const ALERT_BELOW = 0.35;
/** Calm climbs this much per game hour once the level allows it (it falls at once). */
export const CALM_RISE = 0.12;

/** Points one completed ritual adds to a person's score (the kids' play is worth a little less than the grown-ups' evening). */
export const LIFT: Record<RitualKind, number> = { dinner: 1, fireside: 1, play: 0.8 };
/** The score fades by this much a day; today's lift counts for the rest. */
export const SCORE_KEEP = 0.7;
/** Strain points a steady score is worth (mind.ts help) and the cap; morale points the same score is worth (daily.ts) and the cap. */
export const HELP_PER_SCORE = 1.5, HELP_CAP = 3.5;
export const MORALE_PER_SCORE = 1, MORALE_CAP = 2;

/** Hours of free evening or play it takes to count as a ritual done. */
export const HOURS_TO_COUNT: Record<'fireside' | 'play', number> = { fireside: 2, play: 1 };
/** Chronicle stories in a year, at most. */
export const STORIES_PER_YEAR = 4;
/** Calories of food a person needs on hand tonight for a table to be set (about one plate). */
export const PLATE_KCAL = 600;

export interface RitualState {
  /** 0 (alarm) to 1 (at peace): the household's calm, from the safety level. Falls at once, climbs slowly. */
  calm: number;
  /** The last game-hour mark the calm was updated at (clock ticks / 4). */
  hourMark: number;
  /** The level the last full read gave (what the sim saw; the world reads its own live one). */
  level: number;
  /** Today's tally by person id: hours of fireside and play, and whether dinner was done. */
  today: Record<string, { dinner?: boolean; fireside?: number; play?: number }>;
  /** A person's faded score (see `SCORE_KEEP`). */
  score: Record<string, number>;
  /** Day index the tally belongs to. */
  day: number;
  /** Stories already told (one-offs by key) and this year's count. */
  told: string[];
  storyYear: number;
  storyCount: number;
  /** Breaks to mend at the last midnight (the fence story fires when it falls to nothing). */
  breaks: number;
  /** Days of dinners in a row (a streak of ten wins a line; kept for the Family tab). */
  streak: number;
}

export const newRituals = (): RitualState => ({ calm: 1, hourMark: -1, level: 1, today: {}, score: {}, day: -1, told: [], storyYear: -1, storyCount: 0, breaks: 0, streak: 0 });
/** The ritual state (lazily made: a state built by hand in a test has none). */
export const ritualsOf = (s: GameState): RitualState => (s.rituals ??= newRituals());

/** Where in the household's order a person sits (their index among the people), as a return point on the calm scale. */
export const returnsAt = (i: number): number => CALM_MIN + RETURN_BAND * ((i * 7) % 6) / 5;

/** How the household stands, for a person: settled at the table, wary (up and watching), or on alert. */
export type Stance = 'settled' | 'wary' | 'alert';
export function stanceOf(calm: number, i: number): Stance {
  if (calm >= returnsAt(i)) return 'settled';
  return calm >= ALERT_BELOW ? 'wary' : 'alert';
}

/** Which ritual the plan's task at this hour is, for a person (null: none, they are at work, asleep or away). */
export function ritualKind(task: string, kid: boolean, hour: number): RitualKind | null {
  const h = ((hour % 24) + 24) % 24;
  if (task === 'meal' && h >= WINDOW.dinner[0] && h < WINDOW.dinner[1]) return 'dinner';
  if ((task === 'leisure' || task === 'study') && h >= WINDOW.fireside[0] && h < WINDOW.fireside[1]) return 'fireside';
  if (task === 'leisure' && kid && h >= WINDOW.play[0] && h < WINDOW.play[1]) return 'play';
  return null;
}

/** The calm after `hours` of game time at a safety `level`: it drops straight to the level and climbs `CALM_RISE` an hour. */
export function calmStep(calm: number, level: number, hours = 1): number {
  const l = Math.max(0, Math.min(1, level));
  if (l < calm) return l;
  return Math.min(l, calm + CALM_RISE * Math.max(0, hours));
}

/** The strain points a person's score is worth (mind.ts reads it as the help "family evenings"). */
export const ritualHelp = (score: number): number => Math.min(HELP_CAP, HELP_PER_SCORE * Math.max(0, score));
/** The morale points a person's score is worth (daily.ts `lifeMorale`). */
export const ritualMorale = (score: number): number => Math.min(MORALE_CAP, MORALE_PER_SCORE * Math.max(0, score));

/** Today's lift for a person (what the day's tally adds to the average). */
export function dayLift(t: { dinner?: boolean; fireside?: number; play?: number } | undefined, kid: boolean): number {
  if (!t) return 0;
  let v = 0;
  if (t.dinner) v += LIFT.dinner;
  if ((t.fireside ?? 0) >= HOURS_TO_COUNT.fireside) v += LIFT.fireside;
  if (kid && (t.play ?? 0) >= HOURS_TO_COUNT.play) v += LIFT.play;
  return v;
}

/** The faded score after a day: the old average and today's lift. */
export const nextScore = (score: number, lift: number): number => score * SCORE_KEEP + lift * (1 - SCORE_KEEP);

/** Is there a plate for everyone tonight? Reads the real pantry (the aggregate stock is what the sim eats). */
export function tableSet(s: GameState): boolean {
  const heads = s.personState.filter(ps => ps.needs.died == null).length;
  if (heads === 0) return false;
  const kcal = s.pantry ? FOOD_CATS.reduce((a, c) => a + pantryKcal(s.pantry!, c), 0) : 0;
  const agg = (s.stock.staples ?? 0) * 80000 + (s.stock.canned ?? 0) * 6000 + (s.stock.frozen ?? 0) * 10000;
  return Math.max(kcal, agg) >= heads * PLATE_KCAL;
}

/**
 * The safety level the sim reads: the shared homeSafety, held at the floor while a crew that means harm stands at the gate.
 * Before the collapse starts the walls and the utilities do not count in it (homeSafety scales them by how far the world has
 * fallen), so the read skips the costly walk of the property line and only looks at the house itself.
 */
export function simSafety(s: GameState): number {
  const hostile = hostileAtGate(s.gate.pending);
  const raid = hostile ? 'attack' as const : undefined;
  let input = collapseProgress(s) === 0 ? null : homeSafetyInput(s, raid ? { raid } : {});
  if (!input) {
    let hurt = 0, alive = 0;
    s.people.forEach((_, i) => { const n = s.personState[i]?.needs; if (!n || n.died != null) return; alive++; if (n.health < 45) hurt++; });
    input = { perimeter: 1, breaches: openDamage(s).filter(d => d.kind !== 'burn').length + (s.raidFires?.length ?? 0), raid: raid ?? (s.gate.pending ? 'knock' : 'none'), power: true, heat: true, collapse: 0, hurt, missing: 0, people: alive };
  }
  const base = homeSafety(input).level;
  return hostile ? Math.min(base, 0.2) : base;
}

/** Game hours at which the full safety read is made (it walks the property line, so not all day). */
const FULL_READ = (h: number) => h >= 14 && h <= 21;

/**
 * The hour mark. Called before the people's tasks are set for the new hour, so `ps.task` is still what they did in the hour
 * that just ended (`h` is its end). Updates the calm, then credits the hour that ended to whoever was at it.
 */
export function ritualHour(s: GameState, h: number): void {
  const R = ritualsOf(s);
  const mark = Math.floor(s.clock.ticks / 4);
  if (R.hourMark === mark) return;
  const hours = R.hourMark < 0 ? 1 : Math.max(1, Math.min(24, mark - R.hourMark));
  R.hourMark = mark;
  const hostile = hostileAtGate(s.gate.pending);
  // the full read is costly (it walks the wall), so it runs in the afternoon and evening; the cheap read is the rest of the day
  if (hostile) R.level = 0.2;
  else if (FULL_READ(h)) R.level = simSafety(s);
  else if (R.level < 1 && !s.gate.pending && h < 14) R.level = 1;   // the day's trouble is over by morning: the full read at 2 p.m. sets it again
  R.calm = calmStep(R.calm, R.level, hours);
  // the hour that ended: h-1 .. h. Credit those who spent it at a ritual and were settled.
  const end = h === 0 ? 24 : h;
  const mid = end - 0.5;
  const set = tableSet(s);
  s.people.forEach((p, i) => {
    const ps = s.personState[i];
    if (!ps || ps.needs.died != null) return;
    const kind = ritualKind(ps.task, p.kid, mid);
    if (!kind || stanceOf(R.calm, i) !== 'settled') return;
    const t = (R.today[p.id] ??= {});
    if (kind === 'dinner') { if (set) t.dinner = true; }
    else t[kind] = (t[kind] ?? 0) + 1;
  });
}

/** The chronicle line for a story, with who it is about. */
const STORY = {
  birthday: (name: string, age: number) => `${name} turned ${age}. The family sang at supper and there was a cake, of a sort.`,
  harvest: () => 'The first supper from their own ground: everything on the table but the salt came from the place.',
  fence: () => 'The last gap in the fence was mended. Supper that night ran long and loud.',
  winter: () => 'A quiet winter evening. Snow on the roof, the stove ticking, everyone in the front room until bedtime.',
};

/** Once a day at midnight, before the mind pass: roll today's tally into the scores and write the stories. */
export function ritualDay(s: GameState): string[] {
  const R = ritualsOf(s), day = dayIndex(s.clock.t);
  if (R.day === day) return [];
  const out: string[] = [];
  const doneDinner = s.people.filter(p => R.today[p.id]?.dinner);
  const heads = s.personState.filter(ps => ps.needs.died == null).length;
  const fireside = s.people.filter(p => (R.today[p.id]?.fireside ?? 0) >= HOURS_TO_COUNT.fireside);
  s.people.forEach(p => {
    const ps = s.personState.find(x => x.id === p.id);
    if (!ps || ps.needs.died != null) { delete R.score[p.id]; return; }
    R.score[p.id] = nextScore(R.score[p.id] ?? 0, dayLift(R.today[p.id], p.kid));
  });
  const together = heads > 0 && doneDinner.length >= Math.ceil(heads * 0.75);
  R.streak = together ? R.streak + 1 : 0;
  // the stories: rare, tied to something that happened, never more than STORIES_PER_YEAR
  const { doy, year } = calendarOf(s.clock, s.clock.t - 0.5);
  if (R.storyYear !== year) { R.storyYear = year; R.storyCount = 0; }
  const tell = (key: string | null, text: string): boolean => {
    if (R.storyCount >= STORIES_PER_YEAR) return false;
    if (key) { if (R.told.includes(key)) return false; R.told.push(key); if (R.told.length > 60) R.told.shift(); }
    chronicle(s, 'home', text);
    R.storyCount++;
    out.push(text);
    return true;
  };
  if (together) {
    const bday = s.people.find(p => p.kin !== false && p.bday === doy && s.personState.find(x => x.id === p.id)?.needs.died == null && R.today[p.id]?.dinner);
    if (bday) tell(`bday:${bday.id}:${year}`, STORY.birthday(bday.first, bday.age));
    else if (s.stats.kcalGrown >= heads * 2000 && s.structures.some(st => st.kind === 'field' && st.finishedAt !== null)) tell('harvest', STORY.harvest());
    else if (R.breaks > 0 && openDamage(s).filter(d => d.kind !== 'burn').length === 0) tell(null, STORY.fence());
  }
  const inWinter = doy >= 345 || doy <= 50;
  if (inWinter && fireside.length >= Math.ceil(heads * 0.75) && R.calm >= 0.9) tell(`winter:${doy >= 345 ? year : year - 1}`, STORY.winter());
  R.breaks = openDamage(s).filter(d => d.kind !== 'burn').length;
  R.today = {};
  R.day = day;
  return out;
}
