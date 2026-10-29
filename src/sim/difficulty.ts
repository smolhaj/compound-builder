/**
 * Difficulty presets in one table (GDS: Cozy / Standard / Hardcore). Every
 * knob is a multiplier, 1 at Standard, read by the system it names. Standard
 * is the intended game and the bot playtest's baseline, so a knob at 1 must
 * leave a Standard run exactly as it was. Pure (tested).
 *
 *  warn       days of warning signs before the hit (disaster.ts)
 *  hunt       points added to the chance a crew finds a family hiding (encounters.hideFoundChance)
 *  raid       heads in a raiding crew (encounters.gateDay; the battle counts heads)
 *  cadence    days between visits at the gate (longer = fewer raids; encounters.cadence)
 *  wound      how hard a fight or a scavenging run hurts (battle hits on the family, encounters.wound, scavenge)
 *  storms     chance of a severe storm in a season (weatherThreats)
 *  price      how far prices climb above list in the panic and the scarcity after (disaster.priceFactor)
 *  recovery   how long the outside world takes to come back: stores, deliveries, banks, grid (disaster.fateBack)
 *  permits    days the county takes to review a permit (paperwork.reviewDays)
 *  money      the savings left after buying the land (state.newGame)
 *  adapt      0.1 / 0.3 / 1: the world learns (crews grow and come oftener against a defended place after year one; Hardcore also probes, equips, digs)
 *  winter     1 on Hardcore: the first hard winter after the hit takes wood, fuel and fresh stores
 *
 * (Hardcore is harder once it hits, never harder with money: price, permits and
 * money stay at 1 there; Cozy is a little kinder on all three.)
 *
 * Cozy also never lets anyone die for good (see needs / battle / body), and
 * Hardcore is permadeath: those rules read `difficulty === 'cozy'` directly.
 */
export type Difficulty = 'cozy' | 'standard' | 'hardcore';

export interface DifficultyDef {
  /** Points added to the chance a crew finds the family hiding (0 at Standard, not a multiplier). */
  hunt: number;
  warn: number; raid: number; cadence: number; wound: number; storms: number; price: number; recovery: number; permits: number; money: number;
  /** Weight 0.1 / 0.3 / 1, not a multiplier: the world learns from a place that holds (sim/adaptive.ts: bigger, better-equipped, more frequent crews against a defended place after the first year, probing raids, more tunnelers). */
  adapt: number;
  /** 0 or 1, not a multiplier: the first hard winter after the hit (sim/adaptive.ts: a deep freeze that burns wood and fuel, and a thaw that spoils fresh and frozen stores). */
  winter: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyDef> = {
  cozy: { hunt: -8, warn: 1.6, raid: 0.7, cadence: 1.35, wound: 0.7, storms: 0.5, price: 0.6, recovery: 0.75, permits: 0.5, money: 1.15, adapt: 0.1, winter: 0 },
  standard: { hunt: 0, warn: 1, raid: 1, cadence: 1, wound: 1, storms: 1, price: 1, recovery: 1, permits: 1, money: 1, adapt: 0.3, winter: 0 },
  hardcore: { hunt: 12, warn: 0.4, raid: 1.3, cadence: 0.65, wound: 1.5, storms: 1.5, price: 1, recovery: 1.6, permits: 1, money: 1, adapt: 1, winter: 1 },
};

/** The table row for a run (a save from before the table has none: Standard). */
export const diffOf = (d: { difficulty?: Difficulty } | undefined): DifficultyDef => DIFFICULTY[d?.difficulty ?? 'standard'];

/** One signed percent: "+35%", "-40%", or null when it is Standard. */
const pct = (k: number): string | null => (Math.abs(k - 1) < 0.005 ? null : `${k > 1 ? '+' : '-'}${Math.round(Math.abs(k - 1) * 100)}%`);

/** What a level changes, in plain words (the setup screen's description under the chips). Standard says so. */
export function difficultySummary(d: Difficulty): string[] {
  const k = DIFFICULTY[d], out: string[] = [];
  const add = (label: string, v: number | string | null) => { if (v) out.push(`${label} ${v}`); };
  add('warning before the hit', pct(k.warn));
  add('size of raiding crews', pct(k.raid));
  add('raids at the gate', pct(1 / k.cadence));
  add('wound severity', pct(k.wound));
  if (k.hunt) out.push(`a crew finds a hiding family ${Math.abs(k.hunt)} points ${k.hunt > 0 ? 'more' : 'less'} often`);
  add('severe storms', pct(k.storms));
  add('price spikes', pct(k.price));
  add('time for the outside world to return', pct(k.recovery));
  add('county permit waits', pct(k.permits));
  add('savings after the land', pct(k.money));
  if (k.adapt >= 1) out.push('after the first year the crews that come for a well-defended place are bigger, better armed and come oftener, and probe the wire first');
  else if (k.adapt > 0 && d === 'standard') out.push('after the first year crews are a little bigger against a well-defended place');
  if (k.winter) out.push('the first winter after the hit brings a deep freeze that burns the woodpile and fuel, then a thaw that spoils fresh and frozen food');
  if (d === 'cozy') out.push('nobody dies for good');
  if (d === 'hardcore') out.push('permadeath');
  return out.length ? out : ['the intended game'];
}
