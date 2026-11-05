/**
 * Fortress reputation (docs/DECISIONS.md "Fortress reputation"): what the county road says about the place. Pure, derived from state the
 * game already keeps (so no save change), one table of tunables.
 *
 *  Hardness  0-1, how hard the compound looks and is known to be: the look of the walls (`Posture.fortress`), the word that this place
 *            shoots back (`gate.respect`), guards at the gate, and warning signs (a live electric fence). Opportunists weigh it:
 *            looters and daytime burglars come less often (at most 35 % and 30 % fewer). Organized crews do not: a gang, a militia, a
 *            requisition party plans around a wall (their own weight already rises with the fortress look and is untouched here).
 *  Neighbors a fortress look cools neighbors who do not yet know you (disposition under the ally line, never below the floor); a good-
 *            neighbor record (humanity, taking people in rather than turning them away) warms every neighbor slowly, less so behind a
 *            fortress look. Neighbors who are already allies are never cooled, so a wall never costs a raid its help.
 *
 * Monotone: reputation only removes opportunist visits and moves neighbor goodwill by small, capped steps; it changes nothing inside a
 * fight, and never takes an ally away. Fortress-looking defenses can only raise hardness (property tests, sim/reputation.test.ts).
 */
import type { GameState } from './state';
import { guardCount } from './guards';

/** Every number here is tunable. */
export const REP = {
  /** Weights of the drivers of hardness (sum 1). */
  W_LOOK: 0.5, W_WORD: 0.25, W_GUARDS: 0.15, W_SIGNS: 0.1,
  /** Share of looters, and of peacetime burglaries, a fully hard place turns away. */
  LOOT: 0.35, BREAKIN: 0.3,
  /** The fortress look (fortress / 100) above which neighbors read it as a closed door. */
  LOOK_LINE: 0.5,
  /** Disposition points a day: cooling at a full fortress look, warming at a full good record. */
  COOL: 0.04, WARM: 0.05,
  /** Cooling touches only neighbors between the floor and this line (the lowest ally line is 30); warming stops at the cap. */
  COOL_FLOOR: -30, COOL_BELOW: 25, WARM_CAP: 70,
  /** A good record at or above this outweighs the cooling. */
  GOOD_RECORD: 0.3,
} as const;

export interface Look { fortress: number; signs?: number }
export interface Driver { id: 'look' | 'word' | 'guards' | 'signs'; label: string; points: number; note: string }

/** How hard the place looks and is known to be, 0-1, with its drivers (points sum to 100 x hardness). */
export function hardness(s: GameState, p: Look): { hard: number; drivers: Driver[] } {
  const look = Math.max(0, Math.min(1, p.fortress / 100));
  const word = Math.max(0, Math.min(1, s.gate.respect ?? 0));
  const guards = Math.min(1, guardCount(s) / 2);
  const signs = (p.signs ?? 0) > 0 ? 1 : 0;
  const drivers: Driver[] = [
    { id: 'look', label: 'The look of the walls', points: 100 * REP.W_LOOK * look, note: look < 0.05 ? 'nothing to see from the road' : `${Math.round(look * 100)} % of a fortress` },
    { id: 'word', label: 'Word that this place shoots back', points: 100 * REP.W_WORD * word, note: word < 0.05 ? 'nobody has been turned back here yet' : 'raids that were beaten; fades over months' },
    { id: 'guards', label: 'Guards at the gate', points: 100 * REP.W_GUARDS * guards, note: guards ? `${guardCount(s)} contract guard${guardCount(s) > 1 ? 's' : ''}` : 'none' },
    { id: 'signs', label: 'Warning signs', points: 100 * REP.W_SIGNS * signs, note: signs ? 'a live electric fence, posted' : 'none posted' },
  ];
  return { hard: Math.min(1, drivers.reduce((a, d) => a + d.points, 0) / 100), drivers };
}
/** Multiplier on how often looters come, and on the chance of a peacetime burglary. Never above 1. */
export const opportunistK = (hard: number): number => 1 - REP.LOOT * hard;
export const burglarK = (hard: number): number => 1 - REP.BREAKIN * hard;

/** The family's good-neighbor record, -1 to 1: how it has treated people (humanity), and who it took in against who it turned away. */
export function goodRecord(s: GameState): number {
  const g = s.gate, took = g.tookIn ?? 0, away = g.turnedAway ?? 0;
  const humane = Math.max(-1, Math.min(1, (g.humanity - 70) / 30));
  const open = (took - away) / (took + away + 4);
  return Math.max(-1, Math.min(1, 0.5 * humane + 0.5 * open));
}

/** How closed the look reads to a neighbor, 0-1 (0 until the fortress look passes the line). */
export const closedLook = (p: Look): number => Math.max(0, Math.min(1, (p.fortress / 100 - REP.LOOK_LINE) / (1 - REP.LOOK_LINE)));

export type RepLabel = 'A fortress' | 'Hard-looking' | 'Closed up' | 'An open place';
export const labelOf = (hard: number): RepLabel => (hard >= 0.65 ? 'A fortress' : hard >= 0.4 ? 'Hard-looking' : hard >= 0.2 ? 'Closed up' : 'An open place');
export const neighborWord = (record: number, closed: number): string =>
  record >= REP.GOOD_RECORD ? (closed > 0 ? 'good neighbors behind a high wall' : 'good neighbors') : record <= -REP.GOOD_RECORD ? 'hard on the neighbors' : closed > 0 ? 'keeps to itself behind a high wall' : 'keeps to itself';

export interface Reputation {
  hard: number; label: RepLabel; drivers: Driver[];
  /** Share fewer looters and burglars. */
  looters: number; burglars: number;
  record: number; closed: number; neighbors: string;
  /** Average goodwill of the households still home (null: none). */
  goodwill: number | null;
  /** One line for each effect on the neighbors. */
  lines: string[];
}
export function reputation(s: GameState, p: Look): Reputation {
  const { hard, drivers } = hardness(s, p);
  const record = goodRecord(s), closed = closedLook(p);
  const home = s.neighbors.filter(n => n.status === 'home' && n.members > 0);
  const goodwill = home.length ? Math.round(home.reduce((a, n) => a + n.disposition, 0) / home.length) : null;
  const lines: string[] = [];
  lines.push(`Opportunists: ${Math.round(REP.LOOT * hard * 100)} % fewer looters and ${Math.round(REP.BREAKIN * hard * 100)} % fewer burglaries. A gang or a militia plans around a wall and is not put off.`);
  if (closed > 0 && record < REP.GOOD_RECORD) lines.push('Neighbors who do not know you yet read the wall as a closed door: their goodwill cools (allies are never cooled).');
  else if (closed > 0) lines.push('Behind a high wall, but a good-neighbor record outweighs it: goodwill still warms, more slowly.');
  if (record >= 0.05) lines.push('A good-neighbor record (people taken in, kindness kept) warms the neighbors a little each day.');
  else if (record <= -0.05) lines.push('Turning people away and hard choices have given the place a name on the road; the neighbors do not warm.');
  return { hard, label: labelOf(hard), drivers, looters: REP.LOOT * hard, burglars: REP.BREAKIN * hard, record, closed, neighbors: neighborWord(record, closed), goodwill, lines };
}

/** Once a day: the neighbors' goodwill drifts with the look of the place and the record behind it. Returns log lines (none: it is slow). */
export function reputationDay(s: GameState, p: Look): string[] {
  const record = goodRecord(s), closed = closedLook(p);
  for (const n of s.neighbors) {
    if (n.status !== 'home' || n.members <= 0) continue;
    if (record > 0 && n.disposition < REP.WARM_CAP) n.disposition = Math.min(REP.WARM_CAP, n.disposition + REP.WARM * record * (1 - 0.6 * closed));
    if (closed > 0 && record < REP.GOOD_RECORD && n.disposition < REP.COOL_BELOW && n.disposition > REP.COOL_FLOOR) n.disposition = Math.max(REP.COOL_FLOOR, n.disposition - REP.COOL * closed);
  }
  return [];
}
