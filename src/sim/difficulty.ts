/**
 * Difficulty presets in one table (GDS: Cozy / Standard / Hardcore). Every
 * knob is a multiplier, 1 at Standard, read by the system it names. Standard
 * is the intended game and the bot playtest's baseline, so a knob at 1 must
 * leave a Standard run exactly as it was. Pure (tested).
 *
 *  warn       days of warning signs before the hit (disaster.ts)
 *  raid       strength of a raiding crew (encounters.gateDay)
 *  cadence    days between visits at the gate (longer = fewer raids; encounters.cadence)
 *  wound      how hard a fight or a scavenging run hurts (encounters.wound, scavenge)
 *  storms     chance of a severe storm in a season (weatherThreats)
 *  price      how far prices climb above list in the panic and the scarcity after (disaster.priceFactor)
 *  recovery   how long the outside world takes to come back: stores, deliveries, banks, grid (disaster.fateBack)
 *  permits    days the county takes to review a permit (paperwork.reviewDays)
 *  money      the savings left after buying the land (state.newGame)
 *
 * Cozy also never lets anyone die for good (see needs / battle / body), and
 * Hardcore is permadeath: those rules read `difficulty === 'cozy'` directly.
 */
export type Difficulty = 'cozy' | 'standard' | 'hardcore';

export interface DifficultyDef {
  warn: number; raid: number; cadence: number; wound: number; storms: number; price: number; recovery: number; permits: number; money: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyDef> = {
  cozy: { warn: 1.6, raid: 0.6, cadence: 1.35, wound: 0.7, storms: 0.5, price: 0.6, recovery: 0.75, permits: 0.5, money: 1.15 },
  standard: { warn: 1, raid: 1, cadence: 1, wound: 1, storms: 1, price: 1, recovery: 1, permits: 1, money: 1 },
  hardcore: { warn: 0.4, raid: 1.35, cadence: 0.8, wound: 1.25, storms: 1.25, price: 1.4, recovery: 1.3, permits: 1.5, money: 0.85 },
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
  add('raider crews', pct(k.raid));
  add('raids at the gate', pct(1 / k.cadence));
  add('wound severity', pct(k.wound));
  add('severe storms', pct(k.storms));
  add('price spikes', pct(k.price));
  add('time for the outside world to return', pct(k.recovery));
  add('county permit waits', pct(k.permits));
  add('savings after the land', pct(k.money));
  if (d === 'cozy') out.push('nobody dies for good');
  if (d === 'hardcore') out.push('permadeath');
  return out.length ? out : ['the intended game'];
}
