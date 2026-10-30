/**
 * What a retaining wall does (docs/DECISIONS.md, "Retaining walls and terraces"). The wall behind a graded pad (sim/retainPlan.ts, drawn by
 * game/terrain/RetainWalls.ts) is not a second purchase: it is what the foundation stage's fieldstone pays for (`gradedBlueprint`, sim/slope.ts: 2 pallets at
 * the gentlest, 32 on a terraced hillside), and it goes up with that stage. Once it stands:
 *  - it holds the slope: no runoff mud behind it (the cut-slope rule of sim/drainage.ts and sim/terrainFx.ts), unless it is a tall wall (2.4 m or more),
 *    which holds only with a drainage channel near it;
 *  - a tall wall with no channel can let go in the thaw and in a rain storm (`slumpDay`): the pad is mud again until the family restacks it (a quarter of the
 *    pallets the wall cost, after a few days, as the stone comes);
 *  - people walk round it to its stairs (game/HomesteadWorld `hard`), and a raid has to get over the tall ones (`wallHoldSeconds`, a few seconds each, at most two).
 * Pure; the plan is a function of the lot and the structures, so there is no new state but one optional day on the structure.
 */
import { siteLot } from './lotListing';
import { KIT, footprint } from '../game/buildkit/kit';
import { BLUEPRINTS } from './blueprints';
import { RW, WALLLESS, planPad, type PadPlan, type Rect } from './retainPlan';
import { gradeBucket, gradedBlueprint } from './slope';
import { nearDrain } from './drainage';
import { diffOf } from './difficulty';
import { mulberry32 } from './rng';
import { calendarOf, dayIndex, type GameState, type Structure } from './state';

export const WALL = {
  /** Chance a day in the spring thaw (days 60-150) that a tall, undrained wall lets go (before the height factor). */
  SLUMP_THAW: 0.0035,
  /** The same on a day of rain storm. */
  SLUMP_STORM: 0.07,
  /** The family restacks a fallen wall after this many days, if the stone is in the yard. */
  RESTACK_DAYS: 4,
  /** A fall takes this share of the stone the wall cost to put back. */
  RESTACK_SHARE: 0.25,
  /** A tall standing wall makes a raid spend this long getting over it, and at most this many count. */
  HOLD: 3, HOLD_MAX: 2,
  /** A pallet of fieldstone faces this much wall (m^2), for a wall that came with no staked grade. */
  FACE_PER_PALLET: 3.5,
} as const;

export type WallState = 'planned' | 'building' | 'standing' | 'slumped';

export interface WallInfo {
  plan: PadPlan;
  /** The tallest part of the wall (m), its length (m), its face (m^2). */
  heightM: number; lenM: number; faceM2: number;
  tall: boolean;
  stairs: number;
  state: WallState;
  /** Pallets of fieldstone the foundation paid for it. */
  pallets: number;
}

const memo = new WeakMap<object, { sig: number; field: object; plans: Map<string, PadPlan | null> }>();
const NONE = new Map<string, PadPlan | null>();

/** The retaining-wall plan of every placed building on this place (null where the pad is gentle), in the order they stand. Cached. */
export function plansOf(s: GameState): Map<string, PadPlan | null> {
  const lot = siteLot(s.site);
  if (!lot) return NONE;
  let sig = s.structures.length;
  for (const st of s.structures) sig = (sig * 31 + st.x * 7 + st.z * 13 + st.rot + st.id.length) % 1000000007;
  const have = memo.get(s.structures);
  if (have && have.sig === sig && have.field === lot.field) return have.plans;
  const plans = new Map<string, PadPlan | null>(), others: Rect[] = [];
  for (const st of s.structures) {
    if (st.unplaced) continue;
    const def = KIT[st.kind];
    if (!def || def.level === 'underground' || WALLLESS.test(st.kind)) continue;
    const r = footprint(def, st.x, st.z, st.rot);
    const plan = planPad(r, lot.field.h, others);
    plans.set(st.id, plan.runs.length ? plan : null);
    others.push(plan.runs.length ? plan.rect : r);
  }
  memo.set(s.structures, { sig, field: lot.field, plans });
  return plans;
}

/** Index of the foundation stage in a building's blueprint (the stage that pays for the wall; the first stage when it has none). */
function foundationIndex(st: Structure): number {
  const bp = BLUEPRINTS[st.kind];
  return bp ? Math.max(0, bp.stages.findIndex(x => x.id === 'foundation')) : 0;
}

/** Pallets of fieldstone the foundation paid for the wall: the retaining-wall band of sim/slope.ts, or an estimate from the face for a building that came with the land. */
export function wallPallets(st: Pick<Structure, 'grade'>, faceM2: number): number {
  if (st.grade) { const b = gradeBucket(st.grade); if (b > 0) return 2 * b * b; }
  return Math.max(1, Math.round(faceM2 / WALL.FACE_PER_PALLET));
}

/** The wall behind a building's pad: how big, and where it is in its life; null on level ground or a place with no lot. */
export function wallOf(s: GameState, st: Structure): WallInfo | null {
  const plan = plansOf(s).get(st.id);
  if (!plan) return null;
  const bp = st.grade ? gradedBlueprint(BLUEPRINTS[st.kind], st.grade) : BLUEPRINTS[st.kind], fi = foundationIndex(st);
  const done = st.stage >= (bp?.stages.length ?? 1);
  const state: WallState = st.slumpedAt !== undefined ? 'slumped' : done || st.stage > fi ? 'standing' : st.stage === fi ? 'building' : 'planned';
  return { plan, heightM: plan.maxH * RW.M, lenM: plan.lenU * RW.M, faceM2: plan.faceM2, tall: plan.tall, stairs: plan.stairs.length, state, pallets: wallPallets(st, plan.faceM2) };
}

/** Does a finished wall hold the slope under the structure at (x, z): standing, not slumped, and (if tall) with a drainage channel near it? */
export function wallHoldsAt(s: GameState, x: number, z: number): boolean {
  const st = s.structures.find(q => q.x === x && q.z === z && !q.unplaced);
  const w = st && wallOf(s, st);
  if (!w || w.state !== 'standing') return false;
  return !w.tall || nearDrain(s, st!.x, st!.z);
}

/** Every building with a retaining wall, with its wall. */
export function walls(s: GameState): Array<{ st: Structure; w: WallInfo }> {
  const out: Array<{ st: Structure; w: WallInfo }> = [];
  for (const st of s.structures) { if (st.unplaced) continue; const w = wallOf(s, st); if (w) out.push({ st, w }); }
  return out;
}

/** Standing tall walls (2.4 m or more) with no drainage channel near them: the ones that can let go. */
export const slumpRisks = (s: GameState): Array<{ st: Structure; w: WallInfo }> => walls(s).filter(({ st, w }) => w.state === 'standing' && w.tall && !nearDrain(s, st.x, st.z));

/** The walls that have come down and wait for stone. */
export const slumped = (s: GameState): Array<{ st: Structure; w: WallInfo }> => walls(s).filter(({ w }) => w.state === 'slumped');

/** Pallets to restack a fallen wall. */
export const restackPallets = (w: WallInfo): number => Math.max(1, Math.ceil(w.pallets * WALL.RESTACK_SHARE));

const label = (k: string) => k.replace(/_/g, ' ');

/**
 * Once a day: a tall wall with no drainage channel behind it may let go in the thaw (days 60-150) or on a day of rain storm, more likely the taller it
 * is; a fallen wall is restacked after a few days when the stone is in the yard. Returns the log lines. `rain` is whether a rain storm is on today.
 */
export function slumpDay(s: GameState, rain: boolean): string[] {
  const out: string[] = [];
  const day = dayIndex(s.clock.t), { doy } = calendarOf(s.clock), thaw = doy >= 60 && doy <= 150;
  const scale = diffOf(s.disaster).storms;
  walls(s).forEach(({ st, w }, i) => {
    if (w.state === 'slumped') {
      const need = restackPallets(w);
      if (day - (st.slumpedAt ?? day) >= WALL.RESTACK_DAYS && s.stock.fieldstone >= need) {
        s.stock.fieldstone -= need;
        delete st.slumpedAt;
        out.push(`The family restacked the retaining wall behind the ${label(st.kind)} (${need} pallet${need > 1 ? 's' : ''} of fieldstone).`);
      }
      return;
    }
    if (w.state !== 'standing' || !w.tall || nearDrain(s, st.x, st.z) || !(thaw || rain)) return;
    const p = ((thaw ? WALL.SLUMP_THAW : 0) + (rain ? WALL.SLUMP_STORM : 0)) * Math.min(2, w.heightM / RW.TALL_M) * scale;
    if (mulberry32(s.seed * 7919 + day * 131 + i * 17 + 3)() >= p) return;
    st.slumpedAt = day;
    out.push(`The retaining wall behind the ${label(st.kind)} let go in the ${rain ? 'rain' : 'thaw'}: ${Math.round(w.heightM * 10) / 10} m of stone is down across the pad. It needs ${restackPallets(w)} pallet${restackPallets(w) > 1 ? 's' : ''} of fieldstone to restack, and a drainage channel above it so it does not happen again.`);
  });
  return out;
}

/** Seconds a raid spends getting over the tall retaining walls round the place (0 with none): a few seconds each, at most two count. */
export function wallHoldSeconds(s: GameState): number {
  let n = 0;
  for (const { w } of walls(s)) if (w.state === 'standing' && w.tall) n++;
  return Math.min(WALL.HOLD_MAX, n) * WALL.HOLD;
}

/** Plain lines for the Defense tab's ground section. */
export function retainingLines(s: GameState): string[] {
  const all = walls(s).filter(({ w }) => w.state === 'standing' || w.state === 'slumped');
  if (!all.length) return [];
  const out: string[] = [];
  const stand = all.filter(({ w }) => w.state === 'standing'), tallest = Math.max(0, ...stand.map(({ w }) => w.heightM)), metres = stand.reduce((a, { w }) => a + w.lenM, 0);
  if (stand.length) out.push(`${stand.length} dry-stack retaining wall${stand.length > 1 ? 's' : ''} standing (${Math.round(metres)} m, the tallest ${Math.round(tallest * 10) / 10} m): the slope behind ${stand.length > 1 ? 'them is' : 'it is'} held, and a crew has to go round to the stairs${wallHoldSeconds(s) ? ` or climb (a tall wall holds a raid ${wallHoldSeconds(s)} s)` : ''}.`);
  const risk = slumpRisks(s);
  if (risk.length) out.push(`${risk.length} tall wall${risk.length > 1 ? 's have' : ' has'} no drainage channel above ${risk.length > 1 ? 'them' : 'it'}: in the thaw and in rain storms ${risk.length > 1 ? 'they' : 'it'} can let go.`);
  for (const { st, w } of slumped(s)) out.push(`The wall behind the ${label(st.kind)} is down: ${restackPallets(w)} pallet${restackPallets(w) > 1 ? 's' : ''} of fieldstone to restack it.`);
  return out;
}
