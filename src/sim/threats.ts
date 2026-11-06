/**
 * Yearly small threats for a world that has not recovered (long game, GDS §10.11: "a world that stays broken, with new
 * threats arriving over the years (warlords, plague, famine, hard winters)"). Decided with the user: scaled by difficulty,
 * Cozy off. No new machinery: each threat leans on what is already there.
 *
 *  plague       fevers at home (effects.infect) and a worse year for the neighbors (neighborLife sickness)
 *  famine       the growing season (effects.climate grow)
 *  hard_winter  the deep freeze and thaw (adaptive.winterDay), now on a window of its own
 *  warlord      raid pressure (opsec.raidPressure)
 *
 * One roll a year, in the autumn, from a year after the hit and only while the world has not come back as far as it is
 * going to (stats.okSince < 0, which is always so where it never comes back). One threat at a time. Pure and seeded.
 */
import type { GameState } from './state';
import { calendarOf, dayIndex } from './state';
import { mulberry32 } from './rng';
import { infect } from './effects';
import { WINTER } from './adaptive';
import { THREAT_NAME, threatOn, type Threat, type ThreatKind } from './threatState';

/** Strength by difficulty: Cozy has none. */
export const THREAT_K = { cozy: 0, standard: 0.5, hardcore: 1 } as const;
/** Chance of a threat in a year, at full strength, by what the world did: never back, partly back, back but not yet there. */
export const THREAT_ODDS = { never: 0.7, partial: 0.5, full: 0.3 } as const;
/** Days a threat lasts (plague, famine, warlord); a hard winter is the freeze and the thaw after it. */
export const THREAT_DAYS = { plague: 60, famine: 300, warlord: 45 } as const;
export const THREAT_FROM_DOY = 250, THREAT_SPREAD = 40;
/** The first year after a hit is the era's own; threats start once it is over. */
export const THREAT_AFTER_HIT = 365;

export const threatK = (s: Pick<GameState, 'disaster'>): number => THREAT_K[s.disaster.difficulty ?? 'standard'];

/** The day of year this year's roll falls on (autumn). */
export const rollDoy = (seed: number, year: number): number => THREAT_FROM_DOY + Math.floor(mulberry32(seed * 7919 + year * 31 + 5)() * THREAT_SPREAD);

/** Whether the world is still waiting on its recovery (the era is on, and it has not come back as far as it will). */
export function brokenWorld(s: GameState): boolean {
  const d = s.disaster;
  if (!d.kind || s.clock.t < d.hitAt + THREAT_AFTER_HIT) return false;
  if (s.ending && !s.ending.continued) return false;
  if (s.lineage.settling) return false;
  return s.stats.okSince < 0;
}

/** What kind this year: the world's state leans the odds (no doctors → plague, empty shelves → famine, no law → warlords). */
export function pickThreat(s: GameState, u: number): ThreatKind {
  const t = s.disaster.tracks;
  const w: Array<[ThreatKind, number]> = [
    ['plague', t.medical < 0.3 ? 1.6 : 1],
    ['famine', t.stores < 0.3 ? 1.6 : 1],
    ['hard_winter', 1],
    ['warlord', t.law < 0.3 ? 1.6 : 1],
  ];
  let x = u * w.reduce((a, [, n]) => a + n, 0);
  for (const [kind, n] of w) { if (x < n) return kind; x -= n; }
  return 'hard_winter';
}

/** The next deep-winter day (350 on) at or after `day`, and the window of a freeze plus its thaw. */
export function winterWindow(clock: GameState['clock'], day: number, r: () => number): { from: number; to: number } {
  const doyOf = (d: number) => (((clock.startDoy - 1 + d) % 365) + 365) % 365 + 1;
  let from = day + 1;
  while (doyOf(from) !== WINTER.FROM_DOY && from < day + 400) from++;
  from += Math.floor(r() * 10);
  const lasts = WINTER.LASTS + Math.floor(r() * (WINTER.LASTS_SPREAD + 1));
  return { from, to: from + lasts - 1 + WINTER.THAW_AFTER };
}

const LINE_ON: Record<ThreatKind, string> = {
  plague: 'A sickness is going around the county. Fevers, and nobody to see them: keep the sick apart and the medicine close.',
  famine: 'The harvest is failing across the county. Whatever the fields give this year, it will be less.',
  hard_winter: 'The old-timers say it will be a hard winter. Wood and fuel in before the freeze.',
  warlord: 'A man with trucks and a few dozen guns is taking the county road by road. His scouts have been seen.',
};
const LINE_OFF: Record<ThreatKind, string> = {
  plague: 'The fever has run its course through the county.',
  famine: 'The famine year is behind them.',
  hard_winter: 'The winter has let go.',
  warlord: 'The warlord has moved on, or been put down. The county road is quiet again.',
};

/** The sickness at home: fevers, now and then, while a plague is on. */
const PLAGUE_PER_DAY = 0.06;

/**
 * Once a day: end a threat that is over, roll the year's, run a plague. `say` writes to the chronicle. Returns lines for the log.
 * The famine, winter and warlord effects are read where they bite (effects.climate, adaptive.winterDay, opsec.raidPressure).
 */
export function threatsDay(s: GameState, say: (kind: 'threat', text: string) => void): string[] {
  const L = s.lineage, out: string[] = [];
  const day = dayIndex(s.clock.t), { doy, year } = calendarOf(s.clock);
  const speak = (text: string) => { say('threat', text); out.push(text); };
  if (L.threat && day > L.threat.to) { speak(LINE_OFF[L.threat.kind]); L.threat = null; }
  const r = mulberry32(s.seed * 6007 + day * 13 + 11);
  if (!L.threat) {
    const k = threatK(s);
    if (k <= 0 || L.threatYear === year || doy < rollDoy(s.seed, year) || !brokenWorld(s)) return out;
    L.threatYear = year;
    const odds = THREAT_ODDS[s.disaster.fate] * k;
    if (r() >= odds) return out;
    const kind = pickThreat(s, r());
    const win = kind === 'hard_winter' ? winterWindow(s.clock, day, r) : { from: day, to: day + THREAT_DAYS[kind] - 1 };
    L.threat = { kind, from: win.from, to: win.to, k } as Threat;
    speak(`${THREAT_NAME[kind]}. ${LINE_ON[kind]}`);
    return out;
  }
  if (threatOn(s, 'plague') > 0 && r() < PLAGUE_PER_DAY * L.threat.k) {
    const line = infect(s, r, 'the sickness going around the county');
    if (line) out.push(line);
  }
  return out;
}
