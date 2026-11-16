/**
 * The physical-shock state and the one place it is written (WP6). Quake, flood, ash fall and impact all damage finished buildings the same
 * way (structureDamage.ts rolls a state 0 to 3; `applyLevel` here carries it out on the real structure), pay (or do not pay) the same
 * insurance, make the same crews wait, and keep their peacetime choices (riders, retrofits) and decision cards in one JSON-safe bag:
 * `disaster.fx.physical` (save v98 `fx`, no save bump).
 */
import { log } from './economy';
import { blueprintOf, isFinished, knockBack } from './construction';
import { addFix } from './improvements';
import { insuranceClaim, materialsValue } from './paperwork';
import { isHome } from './blueprints';
import { mulberry32 } from './rng';
import { FOOD, takeFood, type FoodItemId } from './pantry';
import { LEVEL_NAME, LOST_SHARE, repairLeadDays, crewSurge, wealthFrom, type DamageLevel, type Hazard } from './structureDamage';
import type { GameState, Structure } from './state';

export interface DamageRec { level: 1 | 2 | 3; hazard: Hazard; t: number; /** Flood: the day mold starts if it is not mucked out. */ moldAt?: number; dried?: boolean }
export interface Rider { from: number; until: number }
export interface Lead { hitT: number; share: number; hazard: string; jumpUntil?: number }
export interface Physical {
  damage: Record<string, DamageRec>;
  retrofit: Record<string, string[]>;
  riders: { quake?: Rider; flood?: Rider };
  straps?: boolean; wellCap?: boolean;
  lead?: Lead;
  /** Decision cards: when offered and how it was settled. */
  cards: Record<string, { t: number; done?: string }>;
  /** Flags the kinds set (goal chain and cards read them). */
  flags: Record<string, number | boolean | string>;
}

export function physicalOf(s: GameState): Physical {
  const fx = (s.disaster.fx ??= {});
  return (fx.physical ??= { damage: {}, retrofit: {}, riders: {}, cards: {}, flags: {} }) as Physical;
}
/** A kind's own state bag. */
export function kindBag<T extends object>(s: GameState, key: string, init: () => T): T {
  const fx = (s.disaster.fx ??= {});
  return (fx[key] ??= init()) as T;
}

const label = (k: string) => k.replace(/_/g, ' ');
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

// ── applying a state ─────────────────────────────────────────────────────────────────────────────────────────────────

const MINOR_PART: Record<string, Array<'roof' | 'plumbing' | 'wiring' | 'glass'>> = {
  quake: ['plumbing', 'roof'], flood: ['wiring', 'plumbing'], blast: ['glass', 'roof'], ash_load: ['roof'], wind: ['roof', 'glass'], fire: ['roof'], emp: [],
};
const WELLS = ['well_hand', 'well_drilled'];

/** Which stage a state-2 hit knocks a building back to. */
function stageFor(st: Structure, hazard: Hazard): number {
  const stages = blueprintOf(st).stages;
  const at = (id: string) => { const i = stages.findIndex(x => x.id === id); return i < 0 ? stages.length - 1 : i; };
  if (WELLS.includes(st.kind)) return at('frame');
  return hazard === 'flood' ? at('finish') : hazard === 'quake' ? at('roof') : at('roof');
}

/** Carry out a damage state on a finished structure. Returns the log line (empty when nothing happened). */
export function applyLevel(s: GameState, st: Structure, level: DamageLevel, hazard: Hazard, why: string): string {
  if (level === 0 || !isFinished(st)) return '';
  const P = physicalOf(s), name = label(st.kind), prev = P.damage[st.id]?.level ?? 0;
  let text: string;
  if (level === 1) {
    const parts = MINOR_PART[hazard] ?? ['roof'];
    const done = parts.some(p => addFix(st, { part: p, cond: 'fair', done: 0, hours: p === 'glass' ? 12 : p === 'roof' ? 30 : 20, supplied: false }));
    text = `${why} The ${name} is ${LEVEL_NAME[1]}${done ? ': a repair job is in Projects' : ' (the damage is already on the repair list)'}.`;
  } else if (level === 2) {
    const stage = stageFor(st, hazard), stages = blueprintOf(st).stages;
    knockBack(s, st, stage);
    if (stages[stage]?.id === 'roof' && isHome(st.kind)) st.kept = true;
    text = `${why} The ${name} is ${LEVEL_NAME[2]}: it goes back to ${stages[stage]?.name.toLowerCase() ?? 'the frame'} and has to be redone.`;
  } else {
    // a wreck: salvage a third of what the later stages put in, then start from the footing (a well keeps its bore)
    const stages = blueprintOf(st).stages;
    if (WELLS.includes(st.kind)) { knockBack(s, st, 2); text = `${why} The ${name}'s casing is sheared: the bore has to be redone from the frame.`; }
    else {
      for (let i = 1; i < Math.min(st.stage, stages.length); i++) for (const [k, n] of Object.entries(stages[i].materials) as Array<[keyof GameState['stock'], number]>) s.stock[k] += n * 0.33;
      st.lost = true; st.stage = 0; st.done = 0; st.supplied = false; st.finishedAt = null; st.roofLost = true; st.roofLostAt = s.clock.t;
      text = `${why} The ${name} is ${LEVEL_NAME[3]}: clear the wreck and rebuild from the footing.`;
    }
  }
  P.damage[st.id] = { level: Math.max(prev, level) as 1 | 2 | 3, hazard, t: s.clock.t };
  const paid = physicalClaim(s, st, hazard, level);
  if (paid) text += ' ' + paid;
  return text;
}

// ── insurance ───────────────────────────────────────────────────────────────────────────────────────────────────────

export const RIDER = { quake: { name: 'earthquake rider', deductible: 0.15, wait: 0, cap: Infinity }, flood: { name: 'flood policy', deductible: 0.1, wait: 30, cap: 250_000 } } as const;
const riderActive = (s: GameState, k: 'quake' | 'flood', at = s.clock.t): boolean => { const r = physicalOf(s).riders[k]; return !!r && at >= r.from + RIDER[k].wait && at <= r.until; };
export const hasRider = (s: GameState, k: 'quake' | 'flood'): boolean => { const r = physicalOf(s).riders[k]; return !!r && s.clock.t <= r.until; };

/** Yearly price: dear where the hazard is (a Northwest quake, an Appalachian creek), scaled by what there is to insure. */
export function riderQuote(s: GameState, k: 'quake' | 'flood'): number {
  const homes = s.structures.filter(x => isFinished(x) && isHome(x.kind)).length;
  const reg: Record<string, number> = k === 'quake' ? { pnw: 1.5, mountain_west: 1.0, ozarks: 0.9, desert: 0.7 } : { appalachia: 1.4, rust_belt: 1.2, ozarks: 1.1, hill_country: 1.1, new_england: 1.0 };
  const base = k === 'quake' ? 1800 : 900;
  return Math.round(base * (reg[s.site.region] ?? 0.5) * (0.6 + 0.4 * Math.min(2, Math.max(1, homes))) / 10) * 10;
}
export function buyRider(s: GameState, k: 'quake' | 'flood'): string | null {
  if (hasRider(s, k)) return 'already covered';
  if (!s.paper.insured) return 'insure the place first (an ordinary policy excludes it)';
  const usd = riderQuote(s, k);
  if (s.money < usd) return 'not enough money';
  s.money -= usd;
  physicalOf(s).riders[k] = { from: s.clock.t, until: s.clock.t + 365 };
  log(s, `Took out the ${RIDER[k].name}: ${money(usd)} for a year${RIDER[k].wait ? `, and it pays after a ${RIDER[k].wait}-day wait` : ''}.`);
  return null;
}

/** What the insurer pays for a state, and the line for it. Ordinary policies exclude quake and flood; a space object is excluded outright. */
export function physicalClaim(s: GameState, st: Structure, hazard: Hazard, level: DamageLevel): string | null {
  if (level === 0) return null;
  const value = materialsValue(st.kind);
  if (hazard === 'quake' || hazard === 'flood') {
    const k = hazard === 'quake' ? 'quake' : 'flood';
    if (!riderActive(s, k, physicalOf(s).lead?.hitT ?? s.clock.t)) return `(Ordinary insurance excludes ${k === 'quake' ? 'earthquake' : 'flood'}: nothing paid.)`;
    if (level < 2 || s.disaster.tracks.banks < 0.5) return level < 2 ? null : 'The insurer cannot pay while the banks are shut.';
    const pay = Math.round(Math.min(RIDER[k].cap, value * LOST_SHARE[level]) * (1 - RIDER[k].deductible));
    s.money += pay;
    return `The ${RIDER[k].name} paid ${money(pay)} toward the ${label(st.kind)}.`;
  }
  if (hazard === 'blast') return level >= 2 ? '(Insurers exclude acts of war and space objects: nothing paid.)' : null;
  return level >= 2 ? insuranceClaim(s, st, LOST_SHARE[level]) : null;
}

// ── retrofits (peacetime choices) ───────────────────────────────────────────────────────────────────────────────────

export const RETROFIT = {
  sill: { name: 'Bolt the sill and brace the cripple wall', does: 'cuts earthquake damage to the building by more than half', usd: (kind: string) => (isHome(kind) ? 650 : 300) },
  rafters: { name: 'Brace the rafters and tie the roof down', does: 'a roof holds about a third more ash, snow or wind load', usd: (kind: string) => (isHome(kind) ? 900 : 450) },
  anchor: { name: 'Anchor it to the footing and add flood vents', does: 'it will not float off its footing, and takes moving water a step milder', usd: (kind: string) => (isHome(kind) ? 1200 : 500) },
} as const;
export type RetrofitId = keyof typeof RETROFIT;
export const retrofitsOf = (s: GameState, id: string): string[] => physicalOf(s).retrofit[id] ?? [];
export function buyRetrofit(s: GameState, st: Structure, r: RetrofitId): string | null {
  if (!isFinished(st)) return 'finish it first';
  if (retrofitsOf(s, st.id).includes(r)) return 'already done';
  const usd = RETROFIT[r].usd(st.kind);
  if (s.money < usd) return 'not enough money';
  s.money -= usd;
  (physicalOf(s).retrofit[st.id] ??= []).push(r);
  log(s, `${RETROFIT[r].name} on the ${label(st.kind)}: ${money(usd)}.`);
  return null;
}
export const STRAPS_USD = 90;
export function buyStraps(s: GameState): string | null {
  const P = physicalOf(s);
  if (P.straps) return 'already done';
  if (s.money < STRAPS_USD) return 'not enough money';
  s.money -= STRAPS_USD; P.straps = true;
  log(s, `Strapped the water heater and tanks, lipped the pantry shelves and moved the heavy things low: ${money(STRAPS_USD)}.`);
  return null;
}

// ── crews wait after a regional event ───────────────────────────────────────────────────────────────────────────────

/** A regional event: hired crews are booked for `3 x (1 + 8 x share)` days (README); a later, bigger one extends it. */
export function setRepairLead(s: GameState, share: number, hazard: string): void {
  const P = physicalOf(s);
  if (!P.lead || s.clock.t > P.lead.hitT + 60 || share > P.lead.share) P.lead = { hitT: s.clock.t, share, hazard };
}
/** What the crew market does now: days until crews can start, the rate multiplier, and a reason line (null: no wait). */
export function repairMarket(s: GameState): { leadDays: number; rate: number; why: string | null } {
  const L = s.disaster.fx ? (s.disaster.fx.physical as Physical | undefined)?.lead : undefined;
  if (!L) return { leadDays: 0, rate: 1, why: null };
  const since = s.clock.t - L.hitT, jumped = (L.jumpUntil ?? -1) > s.clock.t;
  const lead = jumped ? 0 : Math.max(0, Math.ceil(repairLeadDays(L.share) - since));
  return { leadDays: lead, rate: crewSurge(since, jumped), why: lead > 0 ? `every crew in the county is booked after the ${label(L.hazard)}: about ${lead} more day${lead === 1 ? '' : 's'}, or pay the premium to jump the queue` : null };
}
/** Pay the premium: crews come at once for 30 days at 1.5 times the market. */
export function jumpQueue(s: GameState): string | null {
  const L = physicalOf(s).lead;
  if (!L || repairMarket(s).leadDays <= 0) return 'no wait to skip';
  L.jumpUntil = s.clock.t + 30;
  log(s, 'Paid the premium: a crew will start now. They cost half again as much for the next 30 days.');
  return null;
}

// ── rolling every structure ─────────────────────────────────────────────────────────────────────────────────────────

/** Wealth for repair speed (cash on hand). */
export const wealthOf = (s: GameState): number => wealthFrom(s.money);

/** Dice for one hit, unique to (seed, day, salt). */
export const dice = (s: GameState, salt: number, day = Math.floor(s.clock.t)) => mulberry32(s.seed * 7907 + day * 31 + salt);

/** Finished and part-built structures the shocks can reach (not pre-placed ghosts). */
export const reachable = (s: GameState): Structure[] => s.structures.filter(x => !x.unplaced && x.stage > 0);
export const unfinishedWalls = (st: Structure): boolean => { if (isFinished(st)) return false; const id = blueprintOf(st).stages[st.stage]?.id; return id === 'frame' || id === 'roof'; };

/** A part-built frame shaken or soaked: the work on the stage in hand is lost in part. */
export function hitUnfinished(st: Structure, level: DamageLevel): string {
  if (level < 2) return '';
  st.done = Math.floor(st.done * (level === 3 ? 0.2 : 0.55)); st.supplied = st.supplied && level < 3;
  return `The half-built ${label(st.kind)} was racked: part of the work on it is lost.`;
}

export function resetPhysicalForNewKind(s: GameState): void {
  const P = physicalOf(s);
  P.damage = {}; P.cards = {}; P.flags = {}; delete P.lead;
}

/** Lose a share of the pantry's items (jars broken, a cellar flooded). `cats` limits it to food categories; returns the share's units lost. */
export function loseFood(s: GameState, share: number, cats: ReadonlyArray<'staples' | 'canned' | 'frozen'>): number {
  let lost = 0;
  for (const [id, e] of Object.entries(s.pantry?.items ?? {}) as Array<[FoodItemId, { q: number }]>) {
    if (!cats.includes(FOOD[id].cat as 'staples' | 'canned' | 'frozen')) continue;
    lost += takeFood(s, id, e.q * share);
  }
  return Math.round(lost * 10) / 10;
}
