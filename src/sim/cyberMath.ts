/**
 * The cyberattack's teeth (WP2, docs/scenarios/cyberattack.md): smart devices that brick (55%; Cozy 35%, Hardcore 70%), the cash window, a
 * flicker on the grid, phone and banks, the rumor feed with hidden truth, and the ham "Verify" action. Pure; dice are passed in.
 */
import type { GameState } from './state';
import { dayIndex } from './state';
import { isFinished } from './construction';
import { kfx } from './techFx';
import { radioSet } from './radio';
import type { Heard, RadioState, RumorKind } from './radio';
import { mulberry32 } from './rng';

export interface CyberState {
  struck: boolean;
  /** Did the family fit a manual override on the well controller (a card), or hold a spare controller? */
  override: boolean;
  wellBricked: boolean;
  /** Cameras and driveway alarms bricked (taken out of the stock), and the day since the hit they are reflashed. */
  lost: { cameras: number; driveway_alarm: number };
  restoreDay: number;
  cashWindowDays: number;
  /** Rumor ids already read out on the radio. */
  announced: string[];
  /** Ham checks used today. */
  ham: { day: number; n: number };
}
export const cyberOf = (s: GameState): CyberState => kfx<CyberState>(s, 'cyberattack', () => ({ struck: false, override: false, wellBricked: false, lost: { cameras: 0, driveway_alarm: 0 }, restoreDay: 0, cashWindowDays: 7, announced: [], ham: { day: -1, n: 0 } }));

/** Chance a smart device bricks, by difficulty. */
export const BRICK = { cozy: 0.35, standard: 0.55, hardcore: 0.7 } as const;
export const brickChance = (s: GameState): number => BRICK[s.disaster.difficulty ?? 'standard'];

/** Does the family hold a manual path to the well (a fitted override, a spare controller kept offline, or a hand pump)? */
export const wellSafe = (s: GameState): boolean => cyberOf(s).override || s.stock.pump >= 1 || s.stock.hand_pump >= 1 || s.structures.some(st => st.kind === 'well_hand' && isFinished(st));

export interface SmartDevice { id: string; label: string; status: 'ok' | 'safe' | 'bricked' | 'at risk'; note: string }
/** The "smart devices" panel: what the attack can reach and what protects it. */
export function smartDevices(s: GameState): SmartDevice[] {
  const c = cyberOf(s), out: SmartDevice[] = [];
  const hit = c.struck;
  const well = s.structures.find(st => st.kind === 'well_drilled' && isFinished(st));
  if (well) out.push({ id: 'well', label: 'Well pump controller', status: hit ? (c.wellBricked ? 'bricked' : 'safe') : wellSafe(s) ? 'safe' : 'at risk', note: wellSafe(s) ? 'a manual path to water' : 'smart controller, no spare' });
  const cams = Math.floor(s.stock.cameras) + c.lost.cameras;
  if (cams) out.push({ id: 'cameras', label: 'Wi-Fi cameras', status: hit ? (c.lost.cameras ? 'bricked' : 'ok') : 'at risk', note: hit && c.lost.cameras ? `${c.lost.cameras} bricked until reflashed` : 'app-tied' });
  const alarms = Math.floor(s.stock.driveway_alarm) + c.lost.driveway_alarm;
  if (alarms) out.push({ id: 'alarm', label: 'Driveway alarm', status: hit ? (c.lost.driveway_alarm ? 'bricked' : 'ok') : 'at risk', note: 'app-tied' });
  return out;
}

const bin = (n: number, p: number, r: () => number): number => { let k = 0; for (let i = 0; i < n; i++) if (r() < p) k++; return k; };

/** The hit: roll the smart devices. Returns log lines. */
export function cyberStrike(s: GameState, r: () => number): string[] {
  const c = cyberOf(s), out: string[] = [];
  if (c.struck) return out;
  c.struck = true;
  const p = brickChance(s);
  const well = s.structures.find(st => st.kind === 'well_drilled' && isFinished(st));
  if (well) {
    if (wellSafe(s)) out.push('The smart well controller went dark, but the manual path to water held: the pump runs.');
    else if (r() < p) { c.wellBricked = true; if (!s.utilities.fried.includes(well.id)) s.utilities.fried.push(well.id); out.push('The well controller bricked: "firmware update failed". The pump will not start until a spare controller goes in.'); }
    else out.push('The well controller flickered and came back: it was lucky.');
  }
  for (const k of ['cameras', 'driveway_alarm'] as const) {
    const n = bin(Math.floor(s.stock[k]), p, r);
    if (n) { s.stock[k] -= n; c.lost[k] += n; out.push(`${n} ${k === 'cameras' ? 'Wi-Fi camera' : 'driveway alarm'}${n > 1 ? 's' : ''} bricked: the app will not log in.`); }
  }
  c.restoreDay = 14 + Math.floor(r() * 21);
  c.cashWindowDays = 7;
  out.push('Cards and ATMs are dead. For about a week the stores take cash only; after that the shelves are bare. Small bills buy things now.');
  return out;
}

/** Once a day: bricked devices come back (a month of rebuilding trust and firmware), 60% of them. */
export function cyberRestore(s: GameState, day: number): string[] {
  const c = cyberOf(s);
  if (!c.struck || !c.restoreDay || day < c.restoreDay) return [];
  c.restoreDay = 0;
  const n = Math.floor(c.lost.cameras * 0.6), a = Math.floor(c.lost.driveway_alarm * 0.6);
  s.stock.cameras += n; s.stock.driveway_alarm += a;
  c.lost.cameras -= n; c.lost.driveway_alarm -= a;
  return n + a ? [`A neighbor with a laptop and a serial cable reflashed ${n + a} of your bricked devices.`] : [];
}

/** The flicker: grid, phone and banks wobble by +-15% for the first 30 days (a day's multiplier). */
export function flicker(seed: number, day: number): number {
  return day >= 30 ? 1 : 1 + 0.15 * Math.sin(day * 1.7 + seed);
}

/** Price level during the panic: fuel and food spike for a week, then scarcity takes over. */
export function cyberPrice(day: number): number {
  return day < 0 ? 1 : day < 4 ? 1.4 : day < 8 ? 1.2 : 1;
}

// ── the rumor feed ──────────────────────────────────────────────────────────────────────────────────

export interface RumorPlan { id: string; day: number; kind: RumorKind; truth: number; text: string }
/** What goes round after the hit (docs section 7); `truth` is the odds it is real. The roll is fixed by the seed. */
export const RUMOR_PLAN: RumorPlan[] = [
  { id: 'cy3', day: 3, kind: 'relief', truth: 0.35, text: 'A distribution point at the county fairgrounds, 8 a.m. tomorrow: water, food and fuel for every family.' },
  { id: 'cy8', day: 8, kind: 'checkpoint', truth: 0.25, text: 'An emergency alert on the radio: shelter in place for 48 hours, a chemical release on the highway.' },
  { id: 'cy14', day: 14, kind: 'city', truth: 0.45, text: 'The county depot has a tanker of diesel it will sell by the can to anyone with cash.' },
  { id: 'cy30', day: 30, kind: 'service', truth: 0.6, text: 'Another attack: the lights went out again in the east. Crews are walking the lines by hand.' },
  { id: 'cy45', day: 45, kind: 'city', truth: 0.4, text: 'The bank in town reopens Monday with a $200 limit. Bring ID.' },
];
export const rumorTruth = (s: GameState, p: RumorPlan): boolean => mulberry32(s.seed * 3119 + p.day * 13)() < p.truth;

const radioOf = (s: GameState): RadioState => (s.radio ??= { warnedUntil: -1, bonus: 0, truths: 0, rumors: 0 });
/** Put a planned rumor into what the family has heard (once), as an open item they can check. */
export function hear(s: GameState, p: RumorPlan): Heard {
  const st = radioOf(s);
  const list = (st.heard ??= []);
  let h = list.find(x => x.id === p.id);
  if (!h) { h = { id: p.id, day: dayIndex(s.clock.t), text: p.text, kind: p.kind, truth: rumorTruth(s, p), status: 'open' }; list.push(h); if (list.length > 8) list.splice(0, list.length - 8); }
  return h;
}

/** The next planned rumor due (within three days of its day, not read out yet). */
export function nextRumor(s: GameState, day: number): RumorPlan | null {
  const c = cyberOf(s);
  return RUMOR_PLAN.find(p => day >= p.day && day < p.day + 3 && !c.announced.includes(p.id)) ?? null;
}

/** The ham operator checks a rumor against another net: it becomes confirmed or false. Two checks a day. */
export function verifyRumor(s: GameState, id: string): string | null {
  const st = radioOf(s);
  const h = st.heard?.find(x => x.id === id);
  if (!h || (h.status !== 'open' && h.status !== 'unclear')) return 'nothing to check';
  if (radioSet(s) !== 'ham') return 'needs a ham set with power and someone who knows radio';
  const c = cyberOf(s), day = dayIndex(s.clock.t);
  if (c.ham.day !== day) c.ham = { day, n: 0 };
  if (c.ham.n >= 2) return 'the operator has done two checks today: an hour each';
  c.ham.n++;
  h.status = h.truth ? 'confirmed' : 'false';
  return null;
}
