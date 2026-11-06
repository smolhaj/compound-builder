/**
 * "Where we left off": the card shown when a saved game is picked up again. One read-only selector over the loaded state (nothing is
 * saved or simulated here): the date, cash, how the family is, what is in progress, the top three next steps and the next clock.
 * Pure.
 */
import { calendarOf, dayIndex, hourOf, type GameState } from './state';
import { suggestions } from './guidance';
import { operational } from './operational';
import { holdReason, isFinished, progress } from './construction';
import { runFinished, runProgress, PERIMETER } from './perimeter';
import { waveStatus } from './waveStatus';
import { collapseChip } from './collapseChip';
import { DISASTERS } from './disaster';
import { KIT } from '../game/buildkit/kit';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

export interface RecapStep { title: string; why: string }
export interface Recap {
  /** "Jan 12, Year 2, 6:00 AM". */
  date: string;
  /** Days since the family arrived (day 1 is the first). */
  dayNumber: number;
  money: number;
  /** "All 4 are well", "2 of 5 need care", ... */
  family: string;
  familyTone: 'good' | 'warn' | 'bad';
  /** Short lines: what is being built, ordered, or stuck. */
  inProgress: string[];
  /** At most three. */
  nextSteps: RecapStep[];
  /** The next clock (wave or collapse), or null when nothing is counting down. */
  threat: { text: string; tone: 'good' | 'warn' | 'bad' } | null;
}

const alive = (s: GameState): number[] => s.personState.flatMap((ps, i) => (ps.needs.died == null && !ps.needs.left && !ps.needs.taken ? [i] : []));
export const dateText = (s: GameState): string => {
  const cal = calendarOf(s.clock), h = hourOf(s.clock.t);
  let m = 11;
  while (m > 0 && cal.doy <= MONTH_START[m]) m--;
  const hh = Math.floor(h), ap = hh >= 12 ? 'PM' : 'AM';
  return `${MONTHS[m]} ${cal.doy - MONTH_START[m]}, Year ${cal.year - s.clock.startYear + 1}, ${hh % 12 === 0 ? 12 : hh % 12}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')} ${ap}`;
};

export function familyLine(s: GameState): { text: string; tone: Recap['familyTone'] } {
  const live = alive(s);
  const total = s.people.filter((_, i) => !s.personState[i]?.needs.left).length;
  if (live.length === 0) return { text: 'Nobody is left on the place', tone: 'bad' };
  const hurt = live.filter(i => { const n = s.personState[i].needs; return n.health < 40 || n.hurt.length > 0; }).length;
  const hungry = live.filter(i => s.personState[i].needs.hunger > 5000).length;
  const care = new Set(live.filter(i => { const n = s.personState[i].needs; return n.health < 40 || n.hurt.length > 0 || n.hunger > 5000; })).size;
  const lost = total - live.length;
  const bits: string[] = [];
  if (hurt) bits.push(`${hurt} hurt or sick`);
  if (hungry) bits.push(`${hungry} hungry`);
  const head = care === 0 ? (live.length === 1 ? 'The one of you is well' : `All ${live.length} are well`) : `${care} of ${live.length} need care (${bits.join(', ')})`;
  return { text: lost > 0 ? `${head}. ${lost} lost.` : head, tone: care === 0 ? 'good' : hurt || care > live.length / 2 ? 'bad' : 'warn' };
}

function progressLines(s: GameState): string[] {
  const out: string[] = [];
  for (const st of s.structures) {
    if (isFinished(st) || st.unplaced) continue;
    const name = KIT[st.kind]?.name ?? st.kind.replace(/_/g, ' ');
    const hold = holdReason(s, st);
    out.push(`${name}: ${Math.round(progress(st) * 100)}% built.${hold ? ` ${hold[0].toUpperCase()}${hold.slice(1)}` : ''}`);
  }
  for (const r of s.perimeter) if (!runFinished(r)) out.push(`${PERIMETER[r.kind].name}: ${Math.round(runProgress(r) * 100)}% built`);
  const n = s.orders.filter(x => x.status === 'ordered').length;
  if (n > 0) out.push(`${n} ${n === 1 ? 'order' : 'orders'} on the way`);
  if (s.crews.length) out.push(`${s.crews.length} hired ${s.crews.length === 1 ? 'crew' : 'crews'} at work`);
  return out;
}

function threatOf(s: GameState): Recap['threat'] {
  const w = waveStatus(s);
  if (w && w.phase !== 'over') return { text: `${w.chip}. ${w.expect || w.explain}`, tone: w.tone };
  const c = collapseChip(s);
  if (c && s.clock.t < s.disaster.hitAt) return { text: `${c.chip}. ${DISASTERS[s.disaster.kind!]?.name ?? 'Trouble'}: the warning signs are showing.`, tone: c.tone === 'dim' ? 'warn' : c.tone };
  if (c) return { text: `${c.chip} since the collapse.`, tone: c.tone === 'bad' ? 'bad' : 'warn' };
  return null;
}

/** A reason cut at the first sentence and at most `words` words, ending cleanly (an ellipsis only when something was cut). */
export const short = (t: string, words = 12): string => {
  const first = t.split(/(?<=[.!?])\s/)[0].replace(/[.!?]$/, '');
  const w = first.split(/\s+/);
  return w.length <= words ? first : w.slice(0, words).join(' ').replace(/[,;:(\-]+$/, '') + '…';
};

export function resumeRecap(s: GameState): Recap {
  const f = familyLine(s);
  let steps: RecapStep[] = suggestions(s, 3).map(x => ({ title: x.title ?? KIT[x.kind]?.name ?? x.kind, why: short(x.why) }));
  if (steps.length < 3) {
    for (const o of operational(s)) {
      if (steps.length >= 3) break;
      if (!o.done && !steps.some(x => x.title === o.label)) steps.push({ title: o.label, why: o.line });
    }
  }
  steps = steps.slice(0, 3);
  return { date: dateText(s), dayNumber: dayIndex(s.clock.t) + 1, money: Math.round(s.money), family: f.text, familyTone: f.tone, inProgress: progressLines(s).slice(0, 4), nextSteps: steps, threat: threatOf(s) };
}
