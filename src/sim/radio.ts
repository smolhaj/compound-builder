/**
 * Radio and rumors after the collapse. Once it hits, word from outside comes
 * one of three ways:
 *
 *  Ham radio (HF)   $1,200, needs power and someone with the radio skill.
 *                   Hears the most and the truest: nets in other states,
 *                   the county's emergency net. The license is a peacetime
 *                   thing and optional.
 *  Emergency radio  $60, hand-crank AM/FM/shortwave. Hears what's still on
 *                   the air: less often, less reliably.
 *  Nothing          only gossip over the fence: mostly rumor.
 *
 * True news hints at the disaster's hidden fate before it shows (a service
 * coming back on a full or partial fate; "nobody's coming" on never) and
 * warns of raiders in the area (`forewarned` adds to detection at the gate).
 * False rumors run the other way. Lines go into the news ticker. Pure and
 * seeded per day.
 */
import type { GameState } from './state';
import { TRACK_NAME, TRACKS, type Track } from './disaster';
import { powered } from './gear';
import { mulberry32 as rng } from './rng';
import { dayIndex } from './state';
import { fogRadioLine } from './fogFx';
import { fogHash } from './fog';

export interface RadioState {
  /** Day index until which the watch is up after a raider warning, and its detection bonus. */
  warnedUntil: number;
  bonus: number;
  /** Counts of true news and false rumors heard. */
  truths: number;
  rumors: number;
}

export type RadioSet = 'ham' | 'shortwave' | 'none';

function radio(s: GameState): RadioState {
  return (s.radio ??= { warnedUntil: -1, bonus: 0, truths: 0, rumors: 0 });
}

/** Best radio skill among the living. */
export function radioSkill(s: GameState): number {
  return Math.max(0, ...s.people.filter((_, i) => s.personState[i]?.needs.died == null).map(p => p.skills.radio ?? 0));
}

/** What the family listens on. */
export function radioSet(s: GameState): RadioSet {
  if ((s.stock.ham_rig ?? 0) >= 1 && powered(s) && radioSkill(s) >= 2) return 'ham';
  if ((s.stock.sw_radio ?? 0) >= 1 || (s.stock.ham_rig ?? 0) >= 1) return 'shortwave';
  return 'none';
}

/** Chance a day of hearing something, and of it being true. */
export function reception(s: GameState): { hear: number; truth: number } {
  const set = radioSet(s), k = radioSkill(s);
  if (set === 'ham') return { hear: 0.6, truth: Math.min(0.95, 0.65 + 0.04 * k) };
  if (set === 'shortwave') return { hear: 0.35, truth: Math.min(0.8, 0.5 + 0.03 * k) };
  return { hear: s.neighbors.some(n => n.status === 'home') ? 0.15 : 0.04, truth: 0.3 };
}

/** Detection bonus at the gate while a raider warning is fresh. */
export function forewarned(s: GameState): number {
  const r = s.radio;
  return r && dayIndex(s.clock.t) <= r.warnedUntil ? r.bonus : 0;
}

const pick = <T>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)];

const SOURCE: Record<RadioSet, string[]> = {
  ham: ['On the 40-meter net:', 'The county emergency net:', 'A ham in the next state over:'],
  shortwave: ['On the shortwave:', 'A station out of the city, faint:', 'The emergency broadcast loop:'],
  none: ['Over the fence:', 'Word from down the road:', 'Someone at the crossroads says'],
};

/** One day of radio after the hit; returns lines for the log. */
export function radioDay(s: GameState): string[] {
  const d = s.disaster;
  if (d.phase !== 'impact' && d.phase !== 'survival') return [];
  const t = s.clock.t, day = dayIndex(t), since = t - d.hitAt;
  if (since < 1) return [];
  const st = radio(s);
  const r = rng(s.seed * 7919 + day * 31 + 5);
  const set = radioSet(s), { hear, truth } = reception(s);
  if (r() > hear) return [];
  const src = pick(r, SOURCE[set]);
  const say = (text: string, tone: 0 | 1 | 2 | 3) => {
    d.news.push({ t, text, tone });
    if (d.news.length > 40) d.news.splice(0, d.news.length - 40);
    return [text];
  };
  const warn = (days: number) => { st.warnedUntil = day + days; st.bonus = set === 'ham' ? 15 : set === 'shortwave' ? 10 : 5; };
  const lawless = 1 - (d.tracks.law ?? 1);
  // the weather loop: a fog or low-cloud forecast for tomorrow (own random stream, so the rest of the day's news is unchanged)
  if (set !== 'none') { const fl = fogRadioLine(s); if (fl && fogHash(s.seed * 6007 + day, 11) < 0.4) return say(`${src} ${fl.replace(/^Forecast: /, 'the weather: ')}`, 0); }

  if (r() < truth) {
    st.truths++;
    // a raider warning, likelier the more the law has gone
    if (r() < 0.15 + 0.4 * lawless) { warn(3); return say(`${src} a group raiding farms is working this side of the county. Keep a watch.`, 2); }
    // the fate, before it shows: something coming back soon …
    const soon = (Object.entries(d.back) as Array<[Track, number]>).filter(([, b]) => b > since && b - since <= 14);
    if (d.fate !== 'never' && soon.length) {
      const [k] = pick(r, soon);
      return say(`${src} crews are working on ${TRACK_NAME[k].toLowerCase()}; they say it'll be back within a couple of weeks.`, 0);
    }
    // … or nobody coming
    if (d.fate === 'never' && since >= 30) return say(`${src} there is no relief plan for this area. Nobody's coming.`, 2);
    if (d.fate === 'partial' && since >= 30) return say(`${src} the state is rebuilding, but only the cities and main roads for now.`, 1);
    const k = pick(r, TRACKS);
    const lvl = d.tracks[k];
    return say(`${src} ${TRACK_NAME[k].toLowerCase()} ${lvl > 0.8 ? 'is working' : lvl > 0.3 ? 'is on and off' : 'is still out'} around here.`, lvl > 0.3 ? 0 : 1);
  }
  st.rumors++;
  const k = pick(r, TRACKS);
  return say(pick(r, [
    `${src} FEMA trucks are coming through on Tuesday with food and water.`,
    `${src} ${TRACK_NAME[k].toLowerCase()} is back on next week, for sure this time.`,
    `${src} the army is taking guns and food at checkpoints.`,
    `${src} the city is open and handing out rations; folks are walking in.`,
    `${src} raiders burned out a place near here last night.`,
    `${src} the water's poisoned downstream; don't drink from the creek.`,
  ]), 1);
}
