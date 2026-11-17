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
import { MAST, hasMast } from './richSinks';
import { mulberry32 as rng } from './rng';
import { dayIndex } from './state';
import { fogRadioLine } from './fogFx';
import { fogHash } from './fog';
import { passerRumor } from './roadPassers';
import { fxCtxFor, fxRadio } from './disasterFx';
import { feltRadioLine } from './felt/feltRadio';
import type { Claim } from './felt/claims';

export interface RadioState {
  /** Day index until which the watch is up after a raider warning, and its detection bonus. */
  warnedUntil: number;
  bonus: number;
  /** Counts of true news and false rumors heard. */
  truths: number;
  rumors: number;
  /** What was heard lately and whether anyone has checked it (rumors.ts). */
  heard?: Heard[];
  /** Someone out checking a rumor, back on `back` (a day index). */
  scout?: { pid: string; rumor: string; back: number };
}

export type RumorKind = 'raiders' | 'service' | 'relief' | 'city' | 'checkpoint' | 'poison' | 'travelers';
export interface Heard { id: string; day: number; text: string; kind: RumorKind; truth: boolean; status: 'open' | 'confirmed' | 'false' | 'unclear';
  /** FL3: the checkable fact the line asserted; scouting resolves it from the live world (sim/rumors.ts). */
  claim?: Claim }

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
  const m = hasMast(s);   // a mast and a repeater (sim/richSinks.ts) lift a real set; they do nothing for no radio
  if (set === 'ham') return { hear: 0.6 + (m ? MAST.hear : 0), truth: Math.min(MAST.truthCap, 0.65 + 0.04 * k + (m ? MAST.truthHam : 0)) };
  if (set === 'shortwave') return { hear: 0.35 + (m ? MAST.hear : 0), truth: Math.min(0.8 + (m ? 0.1 : 0), 0.5 + 0.03 * k + (m ? MAST.truthSw : 0)) };
  return { hear: s.neighbors.some(n => n.status === 'home') ? 0.15 : 0.04, truth: 0.3 };
}

/**
 * How often the set picks something up on a day `since` the hit: the first week everybody is listening and the air is busy, the next three
 * weeks it settles, and after that it is the plain `reception` rate (kept calm). A hit-week day lifts a set a lot and the fence line some.
 */
export function hearToday(s: GameState, since: number): number {
  const base = reception(s).hear, set = radioSet(s);
  let lift = since < 8 ? (set === 'none' ? 0.3 : 0.4) : since < 30 ? 0.1 : 0;
  // after a pulse nobody's set works: word of mouth (a neighbor's boxed set, walkers on the road) is the only wire, so it runs busier
  if (s.disaster.kind === 'emp' && set === 'none' && since < 30) lift += 0.25;
  return Math.min(0.95, base + lift);
}

/** Kinds where raiders working the county fit the story (anywhere else the "a group raiding farms" warning is the wrong disaster's talk). */
const RAIDERS_FIT = new Set<string>(['lawless', 'financial', 'grid_down', 'cyberattack', 'solar_flare', 'emp', 'civil_war', 'invasion', 'oil_shock', 'global_famine', 'mass_exodus', 'water_war', 'unknown', 'satellite_loss']);
const ARMY_FIT = new Set<string>(['lawless', 'civil_war', 'invasion', 'zombies', 'mass_exodus', 'cult_takeover', 'water_war', 'financial', 'unknown']);
const FOUL_FIT = new Set<string>(['nuclear', 'bioweapon', 'reactor_meltdown', 'supervolcano', 'asteroid']);

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

/** Is this ticker line something the radio said (so the feed leaves it out: only the radio can be wrong)? */
export const isRadioNews = (text: string): boolean => text.startsWith('You have no working radio') || Object.values(SOURCE).some(xs => xs.some(p => text.startsWith(p)));

/** One day of radio after the hit; returns lines for the log. */
export function radioDay(s: GameState): string[] {
  const d = s.disaster;
  if (d.phase !== 'impact' && d.phase !== 'survival') return [];
  const t = s.clock.t, day = dayIndex(t), since = t - d.hitAt;
  if (since < 1) return [];
  const st = radio(s);
  const r = rng(s.seed * 7919 + day * 31 + 5);
  const set = radioSet(s), { truth } = reception(s);
  // no set at all: one plain line says so, and from then on it is the fence line
  const told = ((d.fx ??= {}).feltRadio ??= { recent: [] as string[] }) as { recent: string[]; noSet?: boolean };
  if (set === 'none' && !told.noSet) {
    told.noSet = true;
    const text = d.kind === 'emp' ? 'You have no working radio: the pulse burned it out. A boxed, unplugged set would have survived. All you hear now is what the neighbors pass along.' : 'You have no working radio. All you hear now is what the neighbors pass along over the fence.';
    d.news.push({ t, text, tone: 1 });
    if (d.news.length > 40) d.news.splice(0, d.news.length - 40);
    return [text];
  }
  if (r() > hearToday(s, since)) return [];
  const src = pick(r, SOURCE[set]);
  const say = (text: string, tone: 0 | 1 | 2 | 3, meta?: { kind: RumorKind; truth: boolean; claim?: Claim }) => {
    d.news.push({ t, text, tone });
    if (d.news.length > 40) d.news.splice(0, d.news.length - 40);
    if (meta) remember(st, { id: `h${day}`, day, text, ...meta, status: 'open' });
    return [text];
  };
  const warn = (days: number) => { st.warnedUntil = day + days; st.bonus = set === 'ham' ? 15 : set === 'shortwave' ? 10 : 5; };
  const lawless = 1 - (d.tracks.law ?? 1);
  // the weather loop: a fog or low-cloud forecast for tomorrow (own random stream, so the rest of the day's news is unchanged)
  if (set !== 'none') { const fl = fogRadioLine(s); if (fl && fogHash(s.seed * 6007 + day, 11) < 0.4) return say(`${src} ${fl.replace(/^Forecast: /, 'the weather: ')}`, 0); }

  // what went by on the county road is what people talk about (sim/roadPassers.ts; its own random stream)
  const pr = passerRumor(s, src, truth);
  if (pr) { if (pr.truth) st.truths++; else st.rumors++; if (pr.warn) warn(3); return say(pr.text, pr.tone, { kind: pr.kind, truth: pr.truth }); }
  // the kind's own bulletin (sim/disasters/<kind>.ts radioBulletins); its own dice, so the rest of the day's news is unchanged
  const fb = fxRadio(s, fxCtxFor(s, 13));
  // the kind's bulletin takes about 6 days in 10, so the felt lines (rumors with a checkable claim) still get the other days
  if (fb && fogHash(s.seed * 6011 + day, 19) < 0.6 && !(st.heard ?? []).some(h => h.text.endsWith(fb.text))) return say(`${src} ${fb.text}`, fb.tone, d.kind ? { kind: 'service', truth: true, claim: { id: 'kind_active', a: d.kind } } : undefined);
  const want = r() < truth;
  // FL3: a felt line for the active kind, tied to a checkable claim (sim/felt/feltRadio.ts); the rest of the day is the usual news
  const fl = feltRadioLine(s, set, want, fxCtxFor(s, 17));
  if (fl) { if (want) st.truths++; else st.rumors++; return say(`${src} ${fl.text}`, fl.tone, { kind: fl.kind, truth: fl.truth, claim: fl.claim }); }
  if (want) {
    st.truths++;
    // a raider warning, likelier the more the law has gone
    if (RAIDERS_FIT.has(d.kind ?? '') && r() < 0.15 + 0.4 * lawless) { warn(3); return say(`${src} a group raiding farms is working this side of the county. Keep a watch.`, 2, { kind: 'raiders', truth: true }); }
    // the fate, before it shows: something coming back soon …
    const soon = (Object.entries(d.back) as Array<[Track, number]>).filter(([, b]) => b > since && b - since <= 14);
    if (d.fate !== 'never' && soon.length) {
      const [k] = pick(r, soon);
      return say(`${src} crews are working on ${TRACK_NAME[k].toLowerCase()}; they say it'll be back within a couple of weeks.`, 0, { kind: 'service', truth: true });
    }
    // … or nobody coming
    if (d.fate === 'never' && since >= 30) return say(`${src} there is no relief plan for this area. Nobody's coming.`, 2, { kind: 'relief', truth: true });
    if (d.fate === 'partial' && since >= 30) return say(`${src} the state is rebuilding, but only the cities and main roads for now.`, 1, { kind: 'relief', truth: true });
    const k = pick(r, TRACKS);
    const lvl = d.tracks[k];
    return say(`${src} ${TRACK_NAME[k].toLowerCase()} ${lvl > 0.8 ? 'is working' : lvl > 0.3 ? 'is on and off' : 'is still out'} around here.`, lvl > 0.3 ? 0 : 1, { kind: 'service', truth: true });
  }
  st.rumors++;
  const k = pick(r, TRACKS);
  const RUMORS: Array<[RumorKind, string]> = [
    ['relief', `${src} FEMA trucks are coming through on Tuesday with food and water.`],
    ['service', `${src} ${TRACK_NAME[k].toLowerCase()} is back on next week, for sure this time.`],
    ['checkpoint', `${src} the army is taking guns and food at checkpoints.`],
    ['city', `${src} the city is open and handing out rations; folks are walking in.`],
    ['raiders', `${src} raiders burned out a place near here last night.`],
    ['poison', `${src} the water's poisoned downstream; don't drink from the creek.`],
  ];
  const fits = RUMORS.filter(([k]) => k === 'raiders' ? RAIDERS_FIT.has(d.kind ?? '') : k === 'checkpoint' ? ARMY_FIT.has(d.kind ?? '') : k === 'poison' ? !FOUL_FIT.has(d.kind ?? '') : true);
  const [kind, text] = pick(r, fits);
  return say(text, 1, { kind, truth: false });
}

/** Keep the last eight things heard (remember), newest last. */
function remember(st: RadioState, h: Heard): void {
  const list = (st.heard ??= []);
  if (list.some(x => x.id === h.id)) return;
  list.push(h);
  if (list.length > 8) list.splice(0, list.length - 8);
}
