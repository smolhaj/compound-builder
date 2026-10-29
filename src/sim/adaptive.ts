/**
 * The adaptive world (Hardcore only; user: "harden Hardcore for a prepper
 * audience, modestly: a well-prepared family should not walk through").
 *
 * Standard is the intended game and stays as it is. On Hardcore the outside
 * world LEARNS: after the first year, the better a place is defended, the
 * more the crews that come for it have prepared. Every rule below is named,
 * scaled by one number (`adaptation`, 0 to 1, from `defensiveStrength`) and by the
 * difficulty table's `adapt` weight (0.1 Cozy, 0.3 Standard, 1 Hardcore: an arms
 * race everywhere, gentle where the game is gentle; probes, rockets and the
 * first winter only reach Hardcore). Pure and seeded (tested).
 *
 *   1. Crews grow            more heads in the crews that come (up to +HEADS).
 *   2. Crews come oftener    the gap between visits shrinks (up to -CADENCE).
 *   3. Crews bring more      grenades, a rocket, plate and automatic rifles.
 *   4. Probing raids         a pair of men test the wire; the crew that
 *                            follows them knows where it is thin.
 *   5. More tunnelers        walls get dug under more often (up to +DIG).
 *   6. The first hard winter a deep freeze after the hit burns the woodpile
 *                            and fuel, and the thaw spoils fresh and frozen
 *                            stores (no scaling: a flat tax on everyone).
 *
 * WHY (the text the player reads): "word gets round about a place that holds;
 * the crews that are left are the ones that learn." The log and the gate card
 * say so, so it reads as an adaptive world and not as arbitrary numbers.
 */
import { diffOf } from './difficulty';
import type { GameState } from './state';

export const ADAPT = {
  /** Days after the hit when crews start to read the place, and when they know it. */
  FROM_DAY: 365,
  FULL_DAY: 730,
  /** The defense number (encounters.defenseOf: wall, rifles, watch) where it starts to matter, and where it counts in full. */
  DEFENSE_FLOOR: 40,
  DEFENSE_FULL: 100,
  /** The other way to be worth the trouble: days of food on hand. A year in the bunker is a prize the county talks about, walls or no walls. */
  PRIZE_FLOOR: 120,
  PRIZE_FULL: 360,
  /** Up to this share more heads in a crew at full adaptation. */
  HEADS: 0.45,
  /** Up to this share shorter the gap between visits. */
  CADENCE: 0.3,
  /** Extra grenades per raider (before the crew's own roll), and the added chance of plate, an automatic rifle. */
  GRENADES: 0.35,
  PLATE: 0.25,
  AUTO: 0.2,
  /**
   * Crews that have learned the place look harder for a family that hides: this many points more on the chance they find it, and this much more
   * of the stores they dig for below (a bunker is not a secret to someone who has been watching it for a year). Both at full adaptation.
   */
  FIND: 30,
  BELOW: 0.4,
  /** More chance, at full adaptation, that a crew that finds the place empty puts a torch to an outbuilding. */
  TORCH: 0.2,
  /** A rocket for an organized crew once adaptation passes this. */
  ROCKET_AT: 0.6,
  /** Up to this much more often a crew starts a dig (1 = twice as often). */
  DIG: 1,
  /** Probing raids: begin at this adaptation, this chance per crew visit, at most one in this many days. */
  PROBE_AT: 0.35,
  PROBE_CHANCE: 0.45,
  PROBE_COOLDOWN: 60,
  /** Two or three men test the wire; the crew behind them follows within a week or so, with their report. */
  PROBE_HEADS: 2,
  PROBE_FOLLOW_MIN: 4,
  PROBE_FOLLOW_SPREAD: 6,
  /** Extra heads in the crew a probe brings (they know where it is thin). */
  PROBE_FOLLOW_BONUS: 2,
} as const;

/** The first hard winter (named numbers; flat, not scaled by adaptation). */
export const WINTER = {
  /** The freeze starts in the first deep-winter window at least this many days after the hit (day of year, wrapping the new year). */
  AFTER_HIT: 30,
  FROM_DOY: 350,
  TO_DOY: 20,
  /** The freeze lasts this many days (min, spread). */
  LASTS: 6,
  LASTS_SPREAD: 4,
  /** Ricks of firewood burned over and above the stove, per day of the freeze; the share of fuel burned running the generator and the truck. */
  RICKS_PER_DAY: 0.9,
  FUEL_SHARE: 0.35,
  /** The thaw, this many days after the freeze lifts: the share of fresh and frozen food that spoils (a power cut, a cellar that froze), and of canned and staples burst or ruined. */
  THAW_AFTER: 2,
  SPOIL_FRESH: 0.5,
  SPOIL_FROZEN: 0.45,
  SPOIL_CANNED: 0.06,
  SPOIL_STAPLES: 0.04,
} as const;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** The difficulty's weight for crew adaptation: small on Cozy and Standard, 1 on Hardcore. */
export const adaptLevel = (s: Pick<GameState, 'disaster'>): number => diffOf(s.disaster).adapt;

/** What the sim knows about how hard a place is to take; `terrain` is the hook for a terrain / fortification layer (high ground, choke points, rings): defense-equivalent points added to `defense`. */
export interface StrengthParts { defense: number; foodDays?: number; terrain?: number }

/**
 * How much a place has earned the crews' attention, 0 to 1 (the shared
 * "defensive strength" every crew-scaling rule reads): how well it is
 * defended (nothing under DEFENSE_FLOOR, full at DEFENSE_FULL; terrain points
 * count as defense), or how much food it sits on (nothing under PRIZE_FLOOR
 * days, full at PRIZE_FULL), whichever is more. A weak, hungry place is left
 * alone; a strong one, or one with a year in the cellar, is worth learning.
 * Extend it here (more terms into `StrengthParts`) and every rule follows.
 */
export const defensiveStrength = (p: StrengthParts): number =>
  Math.max(clamp01((p.defense + (p.terrain ?? 0) - ADAPT.DEFENSE_FLOOR) / (ADAPT.DEFENSE_FULL - ADAPT.DEFENSE_FLOOR)), clamp01(((p.foodDays ?? 0) - ADAPT.PRIZE_FLOOR) / (ADAPT.PRIZE_FULL - ADAPT.PRIZE_FLOOR)));

/**
 * How much the crews have learned, 0 to 1: time since the hit (nothing before
 * FROM_DAY, full by FULL_DAY) times the place's defensive strength, times the
 * difficulty's weight (gentle on Cozy and Standard, full on Hardcore). It
 * scales crews by at most HEADS (+45 %) at weight 1, far less than a strong
 * defense takes off the odds, so defending still pays. Zero before the hit.
 */
export function adaptation(level: number, sinceHit: number, parts: StrengthParts): number {
  if (level <= 0 || sinceHit <= ADAPT.FROM_DAY) return 0;
  const time = clamp01((sinceHit - ADAPT.FROM_DAY) / (ADAPT.FULL_DAY - ADAPT.FROM_DAY));
  return clamp01(level * time * defensiveStrength(parts));
}

/** Days since the hit (0 before it or with no disaster). */
export const sinceHit = (s: Pick<GameState, 'disaster' | 'clock'>): number => s.disaster.kind ? Math.max(0, s.clock.t - s.disaster.hitAt) : 0;

/** Points added to the chance a crew finds a hiding family. */
export const findBonus = (a: number): number => ADAPT.FIND * a;
/** More chance a crew that goes through an empty place burns an outbuilding. */
export const torchBonus = (a: number): number => ADAPT.TORCH * a;
/** Extra share of the stores below a crew digs for (added to the share left above ground when the family hides in a bunker). */
export const belowExtra = (a: number): number => ADAPT.BELOW * a;

/** Heads in a crew after adaptation (never fewer than before). */
export const adaptedHeads = (size: number, a: number): number => a <= 0 ? size : Math.max(size, Math.round(size * (1 + ADAPT.HEADS * a)));
/** The gap between visits after adaptation (a factor on the days; 1 = unchanged). */
export const cadenceFactor = (a: number): number => 1 - ADAPT.CADENCE * a;
/** More often a dig starts (a factor on the daily chance; 1 = unchanged). */
export const digFactor = (a: number): number => 1 + ADAPT.DIG * a;

/** What an adapted crew carries, as additions to the battle's own rolls (all zero at a = 0). */
export function extraKit(raiders: number, a: number, organized: boolean): { grenades: number; plate: number; auto: number; rocket: boolean } {
  if (a <= 0) return { grenades: 0, plate: 0, auto: 0, rocket: false };
  return { grenades: Math.round(raiders * ADAPT.GRENADES * a * (organized ? 1 : 0.4)), plate: ADAPT.PLATE * a, auto: ADAPT.AUTO * a, rocket: organized && a >= ADAPT.ROCKET_AT };
}

/** Whether today's crew is a probe: adapted enough, no probe lately, and the dice say so. `roll` is a 0-1 draw. */
export function probes(a: number, lastProbe: number | undefined, day: number, roll: number): boolean {
  return a >= ADAPT.PROBE_AT && (lastProbe === undefined || day - lastProbe >= ADAPT.PROBE_COOLDOWN) && roll < ADAPT.PROBE_CHANCE;
}
/** The probe's two or three men. */
export const probeHeads = (roll: number): number => ADAPT.PROBE_HEADS + Math.floor(roll * 2);
/** Days until the crew behind the probe turns up. */
export const followDays = (roll: number): number => ADAPT.PROBE_FOLLOW_MIN + Math.floor(roll * ADAPT.PROBE_FOLLOW_SPREAD);

/** The line the dossier carries so the player knows why (null while nothing has adapted). */
export function whyBigger(a: number): string | null {
  if (a <= 0) return null;
  if (a < 0.34) return 'Word has gone round that this place is held. They came in a few more than they used to.';
  if (a < 0.67) return 'Word has gone round that this place is held, and the crews that are left have learned from the ones who failed: more of them, better armed.';
  return 'Everybody in the county knows this place is held. The crews that still come come ready: many hands, plate, and what it takes to get through.';
}

// ── the first hard winter ────────────────────────────────────────────────

export interface Winter { /** Day the freeze begins, and the last day of it. */ from: number; to: number; /** Day of the thaw. */ thaw: number }

const doyOf = (c: GameState['clock'], day: number) => (((c.startDoy - 1 + day) % 365) + 365) % 365 + 1;
const inWinter = (doy: number) => doy >= WINTER.FROM_DOY || doy <= WINTER.TO_DOY;

/**
 * The first hard winter: the first deep-winter day at least AFTER_HIT days
 * after the hit, plus a seeded offset into the window. Derived from the seed
 * and the hit day alone, so it needs no saved state. Null with no disaster.
 */
export function firstWinter(s: Pick<GameState, 'disaster' | 'clock' | 'seed'>): Winter | null {
  const d = s.disaster;
  if (!d.kind) return null;
  const hit = Math.floor(d.hitAt);
  let day = hit + WINTER.AFTER_HIT;
  while (!inWinter(doyOf(s.clock, day)) && day < hit + WINTER.AFTER_HIT + 400) day++;
  // a seeded start within the window's first days, so it is not always New Year's Eve
  const r = Math.abs(Math.sin((s.seed + 1) * 12.9898 + hit * 0.01) * 43758.5453) % 1;
  const lasts = WINTER.LASTS + Math.floor(r * (WINTER.LASTS_SPREAD + 1));
  const from = day + Math.floor(r * 10);
  return { from, to: from + lasts - 1, thaw: from + lasts - 1 + WINTER.THAW_AFTER };
}

/** True on a day of the first hard winter's freeze. */
export function inFreeze(s: Pick<GameState, 'disaster' | 'clock' | 'seed'>, day: number): boolean {
  if (diffOf(s.disaster).winter <= 0) return false;
  const w = firstWinter(s);
  return !!w && day >= w.from && day <= w.to;
}

/**
 * Once a day: the first hard winter. A deep freeze (the stove eats the
 * woodpile, the generator and the truck eat the fuel), then the thaw (a
 * power cut and a cellar that froze: fresh and frozen food spoils, a few
 * jars burst). Returns the log lines. Nothing at Cozy and Standard.
 */
export function winterDay(s: GameState, day: number): string[] {
  const k = diffOf(s.disaster).winter;
  if (k <= 0) return [];
  const w = firstWinter(s);
  if (!w || day < w.from || day > w.thaw) return [];
  const out: string[] = [];
  if (day >= w.from && day <= w.to) {
    const i = day - w.from;
    // the ricks over and above the stove, spread over the days (whole ricks)
    const ricks = Math.floor((i + 1) * WINTER.RICKS_PER_DAY * k) - Math.floor(i * WINTER.RICKS_PER_DAY * k);
    let burned = 0;
    for (let n = 0; n < ricks; n++) { if (s.stock.firewood >= 1) { s.stock.firewood--; burned++; } else break; }
    const first = day === w.from;
    let fuel = 0;
    if (first) { fuel = Math.floor(s.stock.fuel * WINTER.FUEL_SHARE * k); s.stock.fuel -= fuel; }
    if (first) out.push(`A deep freeze has come down on the county and it will not lift for ${w.to - w.from + 1} days: the stove runs night and day${fuel ? `, and the generator and the truck burn ${fuel} gallons of fuel keeping ahead of it` : ''}. (The first hard winter: it takes wood, fuel and food, not people. Stock up before it.)`);
    else if (burned === 0 && ricks > 0 && s.stock.firewood < 1) out.push('The woodpile is bare in the middle of the freeze.');
  }
  if (day === w.thaw) {
    const lose = (key: 'fresh' | 'frozen' | 'canned' | 'staples', share: number) => { const n = Math.floor((s.stock[key] ?? 0) * share * k); if (n > 0) s.stock[key] -= n; return n; };
    const f = lose('fresh', WINTER.SPOIL_FRESH), z = lose('frozen', WINTER.SPOIL_FROZEN), c = lose('canned', WINTER.SPOIL_CANNED), m = lose('staples', WINTER.SPOIL_STAPLES);
    const parts = [f && `${f} fresh`, z && `${z} frozen`, c && `${c} canned`, m && `${m} staples`].filter(Boolean);
    out.push(parts.length ? `The thaw: with the power out, the cellar frozen and the cold in the pantry, ${parts.join(', ')} went to waste or burst.` : 'The thaw came, and there was little in the house to spoil.');
  }
  return out;
}
