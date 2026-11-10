/**
 * The road post as a roster duty (docs/DECISIONS.md, "Road post"): who is tied up at the drive, and when. Pure and light (it is read from the
 * daily scheduler, sim/daily.ts `dutyAt`, so it imports nothing but types).
 *
 *  Block crew   a roadblock needs one named adult on the line, a checkpoint two, from `POST_FROM` to `POST_TO` (the day's traffic). Outside those hours
 *               the pole is down and the sawhorses are only an obstacle (they slow a vehicle, nothing more). The crew is named when the block goes
 *               up and re-named each morning if one of them is hurt, away or gone.
 *  Greeter      the adult sent down to the drive to meet a visitor (sim/roadWarn.ts) is on the post from the moment they go until that card is answered.
 *
 * Both read as the duty `post` in the schedule grid and as a line on the compound board; the person is not available for the other chores meanwhile.
 */
import { hourOf, type GameState } from './state';

export const POST_FROM = 8, POST_TO = 17;
/** Adults on the line: a barrier one, a checkpoint two. */
export const postNeed = (kind: 'barrier' | 'checkpoint'): number => (kind === 'checkpoint' ? 2 : 1);
export const postHour = (h: number): boolean => { const x = Math.floor(((h % 24) + 24) % 24); return x >= POST_FROM && x < POST_TO; };

/** Why this person is at the road post at this hour (null: not). */
export function onPost(s: GameState, pid: string, hour: number): 'block' | 'greeter' | null {
  const r = s.road;
  if (!r) return null;
  if (r.prep?.kind === 'greeter' && r.prep.pid === pid) return 'greeter';
  const b = r.block;
  if (b && postHour(hour) && b.crew?.includes(pid)) return 'block';
  return null;
}

/** Is the block staffed at this hour: the whole crew named, on their feet, and the hours are the day's? */
export function blockManned(s: GameState, hour: number, able: (pid: string) => boolean): boolean {
  const b = s.road?.block;
  if (!b || !postHour(hour)) return false;
  const crew = b.crew ?? [];
  return crew.length >= postNeed(b.kind) && crew.every(able);
}

const nameOf = (s: GameState, id: string): string => s.people.find(p => p.id === id)?.first ?? 'Someone';

/** One line for the compound board: who is on the road post right now, or why the pole is down (null: nothing at the drive). */
export function roadPostLine(s: GameState): string | null {
  const r = s.road;
  if (!r) return null;
  const parts: string[] = [];
  if (r.prep?.kind === 'greeter' && r.prep.pid) parts.push(`${nameOf(s, r.prep.pid)} is down at the drive to meet a visitor`);
  const b = r.block;
  if (b) {
    const crew = (b.crew ?? []).map(id => nameOf(s, id)).join(' and ') || 'nobody';
    const hour = hourOf(s.clock.t);
    parts.push(postHour(hour) ? `${crew} ${b.crew?.length >= postNeed(b.kind) ? `man the ${b.kind === 'checkpoint' ? 'checkpoint' : 'roadblock'} until 5 PM` : `are short-handed: the ${b.kind === 'checkpoint' ? 'checkpoint' : 'roadblock'} is unmanned`}` : `The ${b.kind === 'checkpoint' ? 'checkpoint' : 'roadblock'} is unmanned until 8 AM (${crew} on the line by day)`);
  }
  return parts.length ? `Road post: ${parts.join('; ')}.` : null;
}

/** Days a delivery truck loses at a block on the county road: a manned checkpoint looks it over, a manned barrier is moved aside, an unmanned one waits for somebody to come down. Once per order. Neighbors are never stopped. */
export const HOLD_DAYS = { checkpoint: 0.15, barrier: 0.25, unmanned: 0.5 } as const;
export function truckHold(s: GameState, o: { held?: boolean }): number {
  const b = s.road?.block;
  if (!b || o.held) return 0;
  o.held = true;
  const up = blockManned(s, hourOf(s.clock.t), pid => { const i = s.people.findIndex(p => p.id === pid); return i >= 0 && s.personState[i]?.needs.died == null; });
  return up ? HOLD_DAYS[b.kind] : HOLD_DAYS.unmanned;
}
