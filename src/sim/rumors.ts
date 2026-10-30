/**
 * Checking a rumor (GDS §10.6: "rumors that may be false, which scouting can
 * confirm"). Everything heard on the radio or over the fence is kept for a
 * while (`radio.heard`) with whether it was true, hidden from the player. Send
 * an adult to see for themselves: they are away for a day, on foot, and
 * the roads are not safe once the law is gone. They come back and say what is
 * there. A confirmed raider warning puts the watch up (a bigger bonus at the
 * gate than the radio alone gives), and a false one is put to rest. The
 * trip can go wrong: a fall or worse, rarer with a hunter's eye. Pure.
 */
import { canGo } from './rescue';
import { log } from './economy';
import { mulberry32 } from './rng';
import { dayIndex, type GameState } from './state';
import type { Heard, RadioState } from './radio';

const radioOf = (s: GameState): RadioState => (s.radio ??= { warnedUntil: -1, bonus: 0, truths: 0, rumors: 0 });

/** What has been heard and not yet checked. */
export const openRumors = (s: GameState): Heard[] => (s.radio?.heard ?? []).filter(h => h.status === 'open' || h.status === 'unclear');

/** Chance the scout sees clearly enough to say true or false: 70 % plus 4 % a point of their hunter skill. */
export const clarity = (hunter: number): number => Math.min(0.97, 0.7 + 0.04 * hunter);
/** Chance of getting hurt on the road: 2 %, up to 8 % with the law gone, less with a hunter's eye. */
export function roadRisk(s: GameState, hunter: number): number {
  const lawless = 1 - (s.disaster.tracks.law ?? 1);
  return (0.02 + 0.06 * lawless) / (1 + 0.12 * hunter);
}

export function scoutProblem(s: GameState, rumorId: string, pid: string): string | null {
  const h = (s.radio?.heard ?? []).find(x => x.id === rumorId);
  if (!h) return 'no such word';
  if (h.status === 'confirmed' || h.status === 'false') return 'already checked';
  if (s.radio?.scout) return 'someone is already out';
  const p = s.people.find(x => x.id === pid);
  if (!p || p.age < 16 || !canGo(s, p)) return 'they can\'t go';
  return null;
}

/** Send `pid` to see for themselves. Back tomorrow. Returns an error or null. */
export function sendScout(s: GameState, rumorId: string, pid: string): string | null {
  const why = scoutProblem(s, rumorId, pid);
  if (why) return why;
  const st = radioOf(s), day = dayIndex(s.clock.t);
  st.scout = { pid, rumor: rumorId, back: day + 1 };
  const ps = s.personState.find(x => x.id === pid);
  if (ps) { ps.task = 'away'; ps.target = null; }
  const p = s.people.find(x => x.id === pid)!;
  log(s, `${p.first} set out on foot to see if it's true.`);
  return null;
}

/** The day they come back. */
export function scoutDay(s: GameState): string[] {
  const st = s.radio, sc = st?.scout, day = dayIndex(s.clock.t);
  if (!st || !sc || day < sc.back) return [];
  st.scout = undefined;
  const p = s.people.find(x => x.id === sc.pid), h = st.heard?.find(x => x.id === sc.rumor);
  const ps = s.personState.find(x => x.id === sc.pid);
  if (ps?.task === 'away') ps.task = 'idle';
  if (!p || !h || !ps || ps.needs.died != null) return [];
  const r = mulberry32(s.seed * 4423 + day * 13 + 1);
  const hunter = p.skills.hunter ?? 0, out: string[] = [];
  if (r() < roadRisk(s, hunter)) {
    ps.needs.hurt.push({ what: 'a fall on the road', sev: 14 + Math.floor(r() * 18) });
    out.push(`${p.first} came back limping: a fall on the road.`);
  }
  if (r() >= clarity(hunter)) {
    h.status = 'unclear';
    out.push(`${p.first} couldn't tell: nobody to ask and nothing to see. The rumor is still a rumor.`);
    return out;
  }
  if (h.truth) {
    h.status = 'confirmed';
    out.push(`${p.first} confirms it: ${h.text.replace(/^[^:]*:\s*/, '')}`);
    if (h.kind === 'raiders') { st.warnedUntil = Math.max(st.warnedUntil, day + 5); st.bonus = Math.max(st.bonus, 12); out.push('The watch is up for the week.'); }
  } else {
    h.status = 'false';
    out.push(`${p.first} found nothing to it. ${h.kind === 'raiders' ? 'No burned place, no tracks.' : h.kind === 'poison' ? 'The creek runs clear.' : h.kind === 'relief' || h.kind === 'city' ? 'Nobody has seen a truck or a convoy.' : 'Nobody had heard of it.'} Put it out of mind.`);
  }
  return out;
}
