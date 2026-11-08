/**
 * A raider with a story (coordinator decision 3). Pure and seeded; the saved state is `GameState.raiderStories` (save v88, at most `MAX_STORIES`).
 *
 * Some raiders are not forgotten. A crew's named leader who got away, a hurt man you patched up and let go, one you left on the drive: each gets a
 * story (a name, a reason he was out there, how you treated him) and, some weeks later, comes back. What he does depends on how he was treated:
 *
 *   warn      a man you let go, patched: he walks up the road and tells you a crew is coming (the gate is forewarned).
 *   gift      the same man, with something to repay: a few cans left at the gate.
 *   revenge   a man left to crawl off, or a leader who got away: he comes back with more men (a bigger crew, named in the card, `gate.comeBack`).
 *   nothing   the road took him.
 */
import type { CrewKind } from './surrender';
import { dayIndex, type GameState } from './state';
import { mulberry32 } from './rng';
import { log } from './economy';

export const MAX_STORIES = 8;
export type Treated = 'released' | 'left' | 'escaped';
export type Motive = 'hunger' | 'debt' | 'loyalty' | 'fear';
export type StoryPlan = 'warn' | 'gift' | 'revenge' | 'nothing';
export interface RaiderStory {
  id: string;
  name: string;
  /** What kind of crew he rode with. */
  crew: CrewKind;
  motive: Motive;
  treated: Treated;
  /** Day the story began, and the day he comes back. */
  day: number;
  returns: number;
  plan: StoryPlan;
  /** The crew he brings (revenge), as a head count. */
  men?: number;
  done?: boolean;
}

const FIRST = ['Dale', 'Rusty', 'Cole', 'Mack', 'Boone', 'Hank', 'Dutch', 'Tate', 'Walker', 'Vance', 'Deke', 'Pruitt', 'Slade', 'Ray', 'Eli', 'Wade'];
const LAST = ['Hobbs', 'Kincaid', 'Moreno', 'Pruitt', 'Doyle', 'Ruiz', 'Ames', 'Baker', 'Cho', 'Lund', 'Tolliver', 'Reese'];
export const raiderName = (seed: number): string => { const h = Math.abs(Math.imul(seed ^ 0x85ebca6b, 2246822519)) >>> 0; return `${FIRST[h % FIRST.length]} ${LAST[(h >>> 8) % LAST.length]}`; };
const MOTIVES: Motive[] = ['hunger', 'debt', 'loyalty', 'fear'];

/** His reason, in a line. */
export const motiveLine = (m: Motive): string => m === 'hunger' ? 'He had not eaten in days.' : m === 'debt' ? 'He owed the man who led them.' : m === 'loyalty' ? 'He would not leave his brother.' : 'He was more afraid of them than of you.';

/** Roll the story of one raider (null: he leaves no story). */
export function makeStory(s: Pick<GameState, 'seed' | 'clock' | 'nextId'>, c: { treated: Treated; crew: CrewKind; name?: string; men: number }, salt: number): RaiderStory | null {
  const r = mulberry32(s.seed * 4219 + dayIndex(s.clock.t) * 31 + salt * 7 + 3), day = dayIndex(s.clock.t);
  const u = r();
  let plan: StoryPlan;
  if (c.treated === 'released') plan = u < 0.55 ? 'warn' : u < 0.8 ? 'gift' : 'nothing';
  else if (c.treated === 'left') plan = u < 0.4 ? 'revenge' : 'nothing';
  else plan = u < 0.6 ? 'revenge' : u < 0.7 ? 'warn' : 'nothing';
  if (plan === 'nothing') return null;
  return { id: `rs${s.nextId++}`, name: c.name ?? raiderName(s.seed + salt * 13 + day), crew: c.crew, motive: MOTIVES[Math.floor(r() * 4)], treated: c.treated, day, returns: day + 12 + Math.floor(r() * 40), plan, ...(plan === 'revenge' ? { men: Math.max(3, Math.round(c.men * (1.2 + r() * 0.5))) } : {}) };
}

/** Keep him: the list never grows past the cap (a finished story goes first). */
export function addStory(s: GameState, st: RaiderStory | null): void {
  if (!st) return;
  const list = (s.raiderStories ??= []);
  list.push(st);
  while (list.length > MAX_STORIES) { const i = list.findIndex(x => x.done); list.splice(i >= 0 ? i : 0, 1); }
}

/** Once a day: whoever's day has come comes back. Returns lines for the log. */
export function storyDay(s: GameState): string[] {
  const list = s.raiderStories;
  if (!list?.length) return [];
  const day = dayIndex(s.clock.t), out: string[] = [];
  for (const st of list) {
    if (st.done || day < st.returns) continue;
    st.done = true;
    if (st.plan === 'warn') {
      s.gate.forewarned = true;
      out.push(`${st.name}, the man you let go, walked up the road and told the gate a crew is coming and from which side. ${motiveLine(st.motive)}`);
    } else if (st.plan === 'gift') {
      s.stock.canned = (s.stock.canned ?? 0) + 3;
      out.push(`${st.name} left three cans of food at the gate, and no note. ${motiveLine(st.motive)}`);
    } else {
      const men = st.men ?? 5;
      s.gate.comeBack = { kind: st.crew === 'refugees' || st.crew === 'horde' ? 'gang' : (st.crew as 'gang'), size: men, armed: true, temper: 'hard', until: day + 30 };
      s.gate.next = Math.min(s.gate.next, day + 3 + Math.floor(mulberry32(s.seed + day)() * 6));
      out.push(`${st.name} is back, with ${men} men, and he knows the place. You left him on the road once.`);
    }
  }
  s.raiderStories = list.filter(x => !x.done || day - x.returns < 60);
  if (!s.raiderStories.length) delete s.raiderStories;
  for (const l of out) log(s, l);
  return out;
}
