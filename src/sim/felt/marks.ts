/**
 * FL2: persistent world state on the map (docs/FELT_LAYER.md 5.2). Pure: the marks for the active kind today, a function of the state and the
 * day since the hit, deterministic from the seed. A mark says WHAT is on the ground (a crack, a flood level, a checkpoint, a dark house) and
 * roughly WHERE (an anchor); `game/felt/markPlacement.ts` resolves anchors to coordinates and `game/felt/FeltWorld.ts` draws them.
 *
 * Order of resolution: the kind's own `FeltSpec.marks` (a content package may supply one), else the recipe table below (so the content packages
 * that own `kinds/<kind>.ts` cannot conflict with this file), else the generic recipe, so every kind shows at least one change from peacetime.
 * Reads of per-kind state (`disaster.fx.<kind>`, `disaster.fx.physical`) are defensive: a missing bag means "use the kind's baseline".
 * Road anchors: `s` is world units along the county road from the gate (negative toward the town, north).
 */
import type { Track } from '../disaster';
import { skylineAz } from '../collapseLook';
import { mulberry32 } from '../rng';
import type { GameState } from '../state';
import type { Anchor, FeltKind, FeltSpec, MarkKind, WorldMark } from './types';

export type MarkTier = 'low' | 'medium' | 'high';
/** Marks per quality tier (docs/FELT_LAYER.md section 6). */
export const MARK_CAP: Record<MarkTier, number> = { low: 40, medium: 120, high: 240 };
/** 1 world unit is about 6 m, or 19.7 feet. */
export const FT_PER_UNIT = 19.7;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
/** 1 until `hold` days, then easing to 0 over `fade` days. */
export const decay = (day: number, hold: number, fade: number): number => (day <= hold ? 1 : clamp01(1 - (day - hold) / Math.max(1, fade)));
/** 0 at day 0 rising to 1 at `rise` days. */
export const ramp = (day: number, rise: number): number => clamp01(day / Math.max(0.01, rise));

interface Ctx {
  s: GameState; day: number; kind: FeltKind; hitAt: number; seed: number; tr: Record<Track, number>; r: () => number;
  out: WorldMark[]; n: Map<string, number>;
}
type Recipe = (c: Ctx) => void;

const anchorKey = (a: Anchor): string => {
  switch (a.at) {
    case 'structure': return 's' + a.id;
    case 'neighbor': return 'n' + a.i;
    case 'road': return 'r' + a.s;
    case 'field': return 'f' + a.i;
    case 'sky': return 'k';
    case 'lowland': return 'l';
    default: return a.at;
  }
};
/** Add `n` marks; a `sev` below 0.02 adds nothing (a mark that has faded away is simply gone). */
function put(c: Ctx, kind: MarkKind, anchor: Anchor, sev: number, n = 1): void {
  if (sev < 0.02) return;
  const key = kind + '.' + anchorKey(anchor);
  for (let k = 0; k < n; k++) {
    const i = c.n.get(key) ?? 0; c.n.set(key, i + 1);
    c.out.push({ id: `${key}.${i}`, kind, anchor, sev: Math.round(clamp01(sev) * 100) / 100, since: c.hitAt, seed: Math.floor(c.r() * 1e9) });
  }
}

// ── reading the state ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const bag = <T,>(s: GameState, key: string): Partial<T> | undefined => s.disaster.fx?.[key] as Partial<T> | undefined;
interface Dmg { level: number; hazard?: string; t?: number }
/** The shock damage records (sim/physical.ts, WP6): none until that package lands or until something is damaged. */
const damageOf = (s: GameState): Record<string, Dmg> => ((s.disaster.fx?.physical as { damage?: Record<string, Dmg> } | undefined)?.damage) ?? {};

/** The households with a farmstead on the map, in farm order (the same list `neighborLife.burnedFarms` uses). */
export function nativeNeighbors(s: GameState): GameState['neighbors'] {
  return s.neighbors.filter(n => (s.locals?.lives[n.id]?.origin ?? 'native') === 'native');
}
export const FARMS_SHOWN = 3;

interface NeighborOpts { dark?: (i: number) => number; boarded?: (i: number) => number; camp?: (i: number) => number; empty?: (i: number) => number }
/** What each neighbor household looks like now, by status and the life record (burned, left), common to every kind. */
function neighborBase(c: Ctx, o: NeighborOpts = {}): void {
  const { s, day } = c;
  nativeNeighbors(s).slice(0, FARMS_SHOWN).forEach((n, i) => {
    const life = s.locals?.lives[n.id];
    const a: Anchor = { at: 'neighbor', i };
    if (life?.farm === 'burned' && life.history.some(h => h.known)) {
      const age = s.clock.t - (life.burnedDay ?? s.clock.t);
      put(c, 'ruin', a, 1 - clamp01(age / 200) * 0.4);
      put(c, 'pyre', a, decay(age, 3, 12));
      return;
    }
    if (n.status === 'left' || n.status === 'gone') { put(c, 'open_door', a, 0.6 + 0.4 * c.r()); if (day > 8) put(c, 'boarded', a, 0.7); return; }
    const want = (f?: (i: number) => number): boolean => !!f && c.r() < clamp01(f(i));
    if (want(o.empty)) { put(c, 'open_door', a, 0.7); return; }
    if (want(o.boarded)) put(c, 'boarded', a, 0.8);
    else if (want(o.dark)) put(c, 'dark_house', a, 0.8);
    if (want(o.camp)) put(c, 'camp', a, 0.7);
  });
}

/** Marks every kind gets from the real service tracks: a dead grid darkens the neighbors, a dead state leaves a hand-lettered sign at the gate. */
function trackBase(c: Ctx, o: { skipDark?: boolean } = {}): void {
  const dark = clamp01((0.6 - c.tr.grid) / 0.6);
  if (!o.skipDark) neighborBase(c, { dark: () => dark });
  const worst = Math.min(...(['stores', 'deliveries', 'law', 'banks', 'medical', 'fuel'] as Track[]).map(t => c.tr[t]));
  put(c, 'sign', { at: 'road', s: -9 }, clamp01(0.4 + (1 - worst)));
  if (c.tr.fuel < 0.6) put(c, 'stalled', { at: 'road', s: 0 }, clamp01(1 - c.tr.fuel), 2);
}

/** Damaged finished structures: tarp on a lost roof, a cracked foundation (a crack beside it), a red tag when badly damaged, a wreck. */
function structureMarks(c: Ctx): void {
  const dmg = damageOf(c.s);
  for (const st of c.s.structures) {
    if (st.unplaced || (st.stage <= 0 && !st.lost)) continue;
    const d = dmg[st.id]?.level ?? 0, a: Anchor = { at: 'structure', id: st.id };
    if (d >= 3 || st.lost) { put(c, 'ruin', a, 1); put(c, 'red_tag', a, 1); continue; }
    if (d >= 2) { put(c, 'red_tag', a, 0.9); put(c, 'tarp', a, 0.8); put(c, 'crack', a, 0.9, 2); continue; }
    if (d >= 1) put(c, 'crack', a, 0.6, 1);
    if (st.roofLost) put(c, 'tarp', a, 0.7);
  }
}

/** The home fields and gardens (structures): the dead, yellow or bare look sits on each (a `dead_field` decal on the plot, the crop tint). */
function fieldBlight(c: Ctx, sev: number): void {
  for (const st of c.s.structures) if (!st.unplaced && (st.kind === 'field' || st.kind === 'garden')) put(c, 'dead_field', { at: 'structure', id: st.id }, sev, 1);
}

const skyFire = (c: Ctx): number => skylineAz(c.s.seed).fire;
const skyTown = (c: Ctx): number => skylineAz(c.s.seed).town;
const skyWar = (c: Ctx): number => skylineAz(c.s.seed).war;

// ── per-kind recipes ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const wildfire: Recipe = c => {
  const k = decay(c.day, 4, 24);
  for (let i = 0; i < 3; i++) put(c, 'smoke', { at: 'field', i }, k * (0.95 - i * 0.15));
  put(c, 'smoke', { at: 'sky', bearing: skyFire(c) }, k, 2);
  put(c, 'pyre', { at: 'field', i: 3 }, k * decay(c.day, 2, 6));
  put(c, 'burn_scar', { at: 'compound' }, 0.6 + 0.4 * ramp(c.day, 3), Math.round(6 + 10 * ramp(c.day, 5)));
  put(c, 'dead_field', { at: 'field', i: 0 }, ramp(c.day, 3), 6);
  fieldBlight(c, 0.8 * ramp(c.day, 3));
  put(c, 'ash', { at: 'compound' }, k * 0.9);
  put(c, 'ash_drift', { at: 'compound' }, k * 0.8, Math.round(4 + 8 * k));
  neighborBase(c, { dark: () => 0.4 * k, empty: i => (i === 1 ? 0.6 * ramp(c.day, 2) : 0) });
  put(c, 'barricade', { at: 'road', s: -18 }, 0.85 * decay(c.day, 14, 30), 2);   // the county's road closure (sandbags, cones, a sign)
  put(c, 'zone', { at: 'road', s: -14 }, 0.8 * decay(c.day, 14, 30));
  put(c, 'column', { at: 'road', s: -26 }, 0.6 * decay(c.day, 6, 14));              // evacuees walking out
  put(c, 'burn_scar', { at: 'compound' }, 0.9 * decay(c.day, 60, 120), 6);           // a black scar that stays into month 1
  put(c, 'sign', { at: 'road', s: -9 }, 0.8);
};

const megaQuake: Recipe = c => {
  const q = bag<{ mmi: number; band: string }>(c.s, 'mega_quake');
  const band = q?.band ?? 'A', sev = band === 'A' ? 1 : band === 'B' ? 0.65 : 0.3;
  put(c, 'crack', { at: 'compound' }, sev, Math.round(8 + 16 * sev));
  put(c, 'slump', { at: 'compound' }, sev * 0.9, Math.round(2 + 4 * sev));
  put(c, 'road_cut', { at: 'road', s: -14 }, sev, 1);
  put(c, 'road_cut', { at: 'road', s: 22 }, sev * 0.8, 1);
  put(c, 'barricade', { at: 'road', s: -14 }, sev * decay(c.day, 40, 60), 2);
  put(c, 'debris', { at: 'compound' }, sev * 0.7 * decay(c.day, 20, 60), Math.round(3 + 5 * sev));
  put(c, 'smoke', { at: 'sky', bearing: skyTown(c) }, sev * decay(c.day, 3, 10));   // dust and a gas fire in town
  structureMarks(c);
  neighborBase(c, { camp: () => sev * decay(c.day, 20, 40), boarded: i => (i === 2 ? sev : 0.3 * sev), dark: () => 0.5 * sev * decay(c.day, 5, 20) });
  put(c, 'sign', { at: 'road', s: -9 }, 0.6);
};

const damFlood: Recipe = c => {
  const f = bag<{ variant: string; stage: number; hold: number; roadOut: number }>(c.s, 'dam_flood');
  const variant = f?.variant ?? (c.s.site.region === 'pnw' || c.s.site.region === 'plains' ? 'levee_flood' : 'dam_breach');
  const stage = f?.stage ?? (variant === 'levee_flood' ? 10 : 12);
  const hold = f?.hold ?? (variant === 'levee_flood' ? 20 : 2), roadOut = f?.roadOut ?? 30;
  const drain = Math.max(4, hold * 0.8);
  // it rises in half a day, stands, drains, and leaves standing pools in the low ground for weeks (the high-water line is the mud and debris)
  const drained = stage * (c.day < 0.5 ? c.day / 0.5 : c.day <= hold ? 1 : clamp01(1 - (c.day - hold) / drain));
  const level = c.day <= hold ? drained : Math.max(drained, stage * 0.16 * decay(c.day, 18, 30));
  if (level > 0.05) put(c, 'flood', { at: 'lowland', level: Math.round(level * 10) / 10 }, clamp01(level / Math.max(1, stage)));
  const after = c.day > hold ? 1 : 0.3 * ramp(c.day, hold);
  put(c, 'mud_line', { at: 'creek' }, clamp01(after) * decay(c.day, 70, 60), Math.round(14 + 14 * clamp01(stage / 20)));
  put(c, 'mud_line', { at: 'compound' }, 0.9 * clamp01(after) * decay(c.day, 45, 60), 5);   // silt on the yard
  put(c, 'debris', { at: 'creek' }, 0.9 * decay(c.day, 40, 60), 8);
  put(c, 'debris', { at: 'compound' }, 0.8 * clamp01(after) * decay(c.day, 40, 60), 4);
  if (c.day < roadOut) { put(c, 'road_cut', { at: 'road', s: 14 }, 1); put(c, 'barricade', { at: 'road', s: 6 }, 1, 2); put(c, 'sign', { at: 'road', s: 3 }, 1); }
  put(c, 'dead_field', { at: 'field', i: 1 }, 0.6 * clamp01(after), 4);
  structureMarks(c);
  neighborBase(c, { camp: i => (i === 0 ? 0.9 : 0.3) * decay(c.day, 14, 30), boarded: i => (i === 1 ? 0.7 : 0), dark: () => 0.25 });
  put(c, 'sign', { at: 'road', s: -9 }, 0.5);
};

/** Ash from a supervolcano or a long winter: it builds over days, lies for months. */
const ashfall = (plume: boolean, pace: number): Recipe => c => {
  const k = ramp(c.day, pace) * decay(c.day, 300, 300);
  put(c, 'ash', { at: 'compound' }, k);
  put(c, 'ash_drift', { at: 'compound' }, k, Math.round(8 + 22 * k));
  put(c, 'dead_field', { at: 'field', i: 0 }, k, Math.round(4 + 8 * k));
  fieldBlight(c, 0.4 + 0.6 * k);
  if (plume) put(c, 'smoke', { at: 'sky', bearing: skyFire(c) }, decay(c.day, 20, 60) * 0.9, 2);
  structureMarks(c);
  for (const st of c.s.structures) if (!st.unplaced && st.stage > 0 && c.day > 5 && c.r() < 0.5 * k) put(c, 'tarp', { at: 'structure', id: st.id }, 0.5 * k);
  neighborBase(c, { dark: () => 0.15 + 0.7 * ramp(c.day, 30), boarded: () => 0.5 * ramp(c.day, 40), empty: () => 0.3 * ramp(c.day, 60) });
  put(c, 'sign', { at: 'road', s: -9 }, 0.6);
  if (c.tr.fuel < 0.6) put(c, 'stalled', { at: 'road', s: 0 }, 0.8, 3);
};

const zombies: Recipe = c => {
  const k = decay(c.day, 60, 200);
  put(c, 'barricade', { at: 'road', s: -15 }, 1, 2);
  put(c, 'barricade', { at: 'road', s: 19 }, 0.9);
  put(c, 'pyre', { at: 'field', i: 0 }, k * decay(c.day, 5, 25));
  put(c, 'pyre', { at: 'field', i: 2 }, k * decay(c.day, 2, 20));
  put(c, 'smoke', { at: 'sky', bearing: skyTown(c) }, k);
  put(c, 'column', { at: 'compound' }, k * 0.9, 2);              // a crowd at the wall
  put(c, 'column', { at: 'road', s: -30 }, 0.6 + 0.4 * c.r());   // the shambling ones, down the road
  put(c, 'column', { at: 'road', s: 54 }, 0.5);
  put(c, 'sign', { at: 'road', s: -9 }, 0.8);
  put(c, 'zone', { at: 'road', s: -15 }, 0.7);
  neighborBase(c, { boarded: i => (i === 0 ? 0.9 : 0.5) * ramp(c.day, 3), dark: () => 0.6, empty: i => (i === 2 ? 0.6 * ramp(c.day, 6) : 0) });
  put(c, 'debris', { at: 'compound' }, 0.4, 3);
  trackBase(c, { skipDark: true });
};

/** Checkpoints, columns and burning towns: the county under a flag (or two). */
const warZone = (kind: 'invasion' | 'civil_war'): Recipe => c => {
  const k = decay(c.day, 120, 300);
  put(c, 'checkpoint', { at: 'road', s: -20 }, k, 1);
  put(c, 'checkpoint', { at: 'road', s: 30 }, 0.85 * k, 1);
  put(c, 'queue', { at: 'road', s: -26 }, 0.7 * k);
  put(c, 'banner', { at: 'road', s: -20 }, k, 2);
  put(c, 'column', { at: 'road', s: 48 }, 0.9 * k, 1);          // refugees on the road
  put(c, 'column', { at: 'road', s: -60 }, 0.6 * k, 1);
  put(c, 'camp', { at: 'road', s: 36 }, 0.6 * k);
  put(c, 'smoke', { at: 'sky', bearing: skyWar(c) }, k * decay(c.day, 30, 90), 2);
  put(c, 'smoke', { at: 'field', i: 1 }, 0.5 * k * decay(c.day, 10, 30));
  if (kind === 'invasion') { put(c, 'zone', { at: 'road', s: 30 }, 0.8); put(c, 'debris', { at: 'road', s: 54 }, 0.5, 2); }
  else put(c, 'burn_scar', { at: 'field', i: 0 }, 0.6, 4);
  neighborBase(c, { dark: () => 0.45, boarded: i => (i === 1 ? 0.8 : 0.3), empty: i => (i === 2 ? 0.5 * ramp(c.day, 15) : 0) });
  put(c, 'sign', { at: 'road', s: -9 }, 0.8);
  trackBase(c, { skipDark: true });
};

/** The grid is out: dark farmhouses by night, cars dead on the road, a sign at the gate. */
const gridOut = (hold: number): Recipe => c => {
  const dark = clamp01((0.7 - c.tr.grid) / 0.7) * decay(c.day, hold, hold * 3);
  neighborBase(c, { dark: () => dark * 0.95 });
  put(c, 'sign', { at: 'road', s: -9 }, 0.7);
  put(c, 'stalled', { at: 'road', s: 0 }, 0.9 * decay(c.day, 20, 40), 3);
  if (c.day > 6) put(c, 'queue', { at: 'road', s: 24 }, clamp01(1 - c.tr.fuel));   // a line at the one pump that still turns
};

/** Disease kinds: cordon posts and signs on the road, houses shut up, pyres for the herd. */
const quarantine = (pyres: boolean): Recipe => c => {
  const k = decay(c.day, 90, 200);
  put(c, 'zone', { at: 'road', s: -18 }, k, 2);
  put(c, 'zone', { at: 'road', s: 26 }, 0.8 * k);
  put(c, 'sign', { at: 'road', s: -9 }, k);
  put(c, 'checkpoint', { at: 'road', s: -32 }, 0.7 * k);
  if (pyres) { put(c, 'pyre', { at: 'field', i: 0 }, k * decay(c.day, 14, 40)); put(c, 'pyre', { at: 'field', i: 1 }, 0.7 * k * decay(c.day, 10, 30)); put(c, 'dead_field', { at: 'field', i: 2 }, 0.6, 3); }
  neighborBase(c, { boarded: () => 0.45 * ramp(c.day, 10), dark: () => 0.3 });
  trackBase(c, { skipDark: true });
};

/** Dry and failed land: dead fields, cracked mud where the creek ran, a queue at the feed store. */
const barren = (c: Ctx): void => {
  const k = ramp(c.day, 20) * decay(c.day, 250, 300);
  put(c, 'dead_field', { at: 'field', i: 0 }, k, 6);
  put(c, 'dead_field', { at: 'field', i: 1 }, k, 4);
  put(c, 'dead_field', { at: 'compound' }, 0.8 * k, 10);
  fieldBlight(c, c.kind === 'crop_blight' ? ramp(c.day, 6) : 0.5 + 0.5 * k);
  if (c.kind !== 'crop_blight') put(c, 'dry_bed', { at: 'creek' }, 0.7 + 0.3 * k, Math.round(6 + 14 * k));   // cracked mud where the creek ran (the water layer is lowered too: `streamDrop`)
  put(c, 'mud_line', { at: 'creek' }, 0.8 * k, 8);
  put(c, 'queue', { at: 'road', s: 24 }, 0.6 * k);
  neighborBase(c, { boarded: () => 0.3 * k, empty: i => (i === 2 ? 0.7 * k : 0), dark: () => 0.2 });
  trackBase(c, { skipDark: true });
};

/** A blast, a falling rock or a reactor: smoke on the horizon, ash on the ground, glass and cracks; a fallout kind adds a plume and dead ground. */
const blastOf = (fallout: boolean): Recipe => c => {
  const k = decay(c.day, 6, 60);
  if (fallout) {
    const f = ramp(c.day, 2) * decay(c.day, 120, 200);
    put(c, 'plume', { at: 'sky', bearing: skyTown(c) }, f);
    put(c, 'dead_field', { at: 'compound' }, 0.9 * f, 12);
    fieldBlight(c, f);      // scorched, grey ground
    put(c, 'zone', { at: 'road', s: -12 }, 0.9 * f, 2);          // an exclusion line
    put(c, 'barricade', { at: 'road', s: -14 }, 0.9 * f, 1);
    put(c, 'column', { at: 'road', s: -26 }, 0.7 * decay(c.day, 14, 30));
  }
  put(c, 'smoke', { at: 'sky', bearing: skyTown(c) }, k, 2);
  put(c, 'smoke', { at: 'field', i: 1 }, 0.7 * k);
  put(c, 'ash', { at: 'compound' }, 0.8 * decay(c.day, 20, 120));
  put(c, 'ash_drift', { at: 'compound' }, 0.7 * decay(c.day, 20, 120), 10);
  put(c, 'crack', { at: 'compound' }, 0.6, 6);
  put(c, 'debris', { at: 'compound' }, 0.6, 4);
  put(c, 'zone', { at: 'road', s: -18 }, 0.8, 2);
  structureMarks(c);
  neighborBase(c, { dark: () => 0.7, boarded: () => 0.4, empty: i => (i === 0 ? 0.5 * ramp(c.day, 10) : 0) });
  trackBase(c, { skipDark: true });
};

/** Money, fuel, satellites: lines and closed signs, dead cars, houses going dark. */
const supply: Recipe = c => {
  const k = ramp(c.day, 14) * decay(c.day, 200, 300);
  put(c, 'queue', { at: 'road', s: 24 }, k, 1);
  put(c, 'queue', { at: 'road', s: -30 }, 0.6 * k);
  put(c, 'sign', { at: 'road', s: -9 }, 0.5 + 0.5 * k);
  put(c, 'stalled', { at: 'road', s: 0 }, 0.8 * k, 3);
  neighborBase(c, { dark: () => 0.4 * k, empty: i => (i === 2 ? 0.5 * k : 0), boarded: () => 0.25 * k });
  trackBase(c, { skipDark: true });
};

/** The roads fill with people on foot. */
const exodus: Recipe = c => {
  const k = decay(c.day, 40, 160);
  put(c, 'column', { at: 'road', s: -14 }, k, 2);
  put(c, 'column', { at: 'road', s: 30 }, 0.8 * k, 1);
  put(c, 'camp', { at: 'road', s: -26 }, 0.8 * k);
  put(c, 'camp', { at: 'road', s: 34 }, 0.7 * k);
  put(c, 'sign', { at: 'road', s: -9 }, 0.8);
  neighborBase(c, { empty: i => (i === 1 ? 0.9 : 0.5) * ramp(c.day, 14), boarded: () => 0.4, dark: () => 0.4 });
  trackBase(c, { skipDark: true });
};

/** Lawless and cults: roadblocks of the wrong kind, burned places, banners. */
const unrest: Recipe = c => {
  const k = ramp(c.day, 20) * decay(c.day, 200, 300);
  put(c, 'barricade', { at: 'road', s: -22 }, k, 2);
  put(c, 'checkpoint', { at: 'road', s: 32 }, 0.7 * k);
  put(c, 'banner', { at: 'road', s: 32 }, 0.7 * k, 2);
  put(c, 'burn_scar', { at: 'field', i: 2 }, 0.6 * k, 4);
  put(c, 'smoke', { at: 'sky', bearing: skyTown(c) }, 0.6 * k);
  neighborBase(c, { boarded: () => 0.5 * k, dark: () => 0.4, empty: i => (i === 1 ? 0.5 * k : 0) });
  trackBase(c, { skipDark: true });
};

/** The Order: banners at the road, tithe boxes (posts and signs) at the gate, a banner at every farm gate it holds. */
const cult: Recipe = c => {
  unrest(c);
  const k = ramp(c.day, 14);
  put(c, 'banner', { at: 'road', s: -12 }, 0.9 * k, 2);
  put(c, 'sign', { at: 'road', s: -16 }, 0.9 * k, 1);     // "tithe here"
  put(c, 'camp', { at: 'road', s: -22 }, 0.6 * k);         // the faithful camped at the gate
};

/** Anything without a recipe: what the tracks say. A sign at the gate, dark houses as the grid fails, dead cars as fuel fails, a barrier as law fails. */
const generic: Recipe = c => {
  trackBase(c);
  const law = clamp01(1 - c.tr.law);
  put(c, 'barricade', { at: 'road', s: -18 }, law, 1);
  put(c, 'zone', { at: 'road', s: 24 }, clamp01(1 - c.tr.medical));
  put(c, 'queue', { at: 'road', s: 44 }, clamp01(1 - c.tr.stores) * 0.8);
  if (c.out.length < 3) { put(c, 'sign', { at: 'road', s: -9 }, 0.6); put(c, 'barricade', { at: 'road', s: -18 }, 0.5); put(c, 'dark_house', { at: 'neighbor', i: 0 }, 0.5); }
};

/** The recipe table: every kind of the registry, so a content package's own `spec.marks` is the only thing that overrides it. */
export const RECIPES: Partial<Record<FeltKind, Recipe>> = {
  wildfire, mega_quake: megaQuake, dam_flood: damFlood,
  supervolcano: ashfall(true, 3), ash_winter: ashfall(false, 6),
  zombies, invasion: warZone('invasion'), civil_war: warZone('civil_war'),
  grid_down: gridOut(30), solar_flare: gridOut(6), emp: gridOut(180), cyberattack: gridOut(40),
  pandemic: quarantine(false), bioweapon: quarantine(false), livestock_plague: quarantine(true),
  drought: barren, crop_blight: barren, global_famine: barren,
  nuclear: blastOf(true), asteroid: blastOf(false), reactor_meltdown: blastOf(true),
  financial: supply, oil_shock: supply, satellite_loss: supply,
  mass_exodus: exodus, lawless: unrest, cult_takeover: cult,
  water_war: c => { barren(c); put(c, 'barricade', { at: 'creek' }, 0.85, 3); put(c, 'debris', { at: 'creek' }, 0.8, 4); },
  unknown: generic,
};

// ── the fields and the water: the world reads them directly (HomesteadWorld.setCropLook, StreamRenderer.setDrop) ─────────────────────────

/** How the home fields look: `dead` 0 (green) to 1 (dead and yellow), `empty` (nothing standing: famine, a burn). Pure; by kind and day since the hit. */
export function cropLook(kind: FeltKind | null, day: number): { dead: number; empty: boolean } {
  if (!kind || day < 0) return { dead: 0, empty: false };
  switch (kind) {
    case 'crop_blight': return { dead: ramp(day, 6) * decay(day, 260, 300), empty: day > 45 };
    case 'drought': return { dead: 0.85 * ramp(day, 20) * decay(day, 250, 300), empty: false };
    case 'global_famine': return { dead: 0.85 * ramp(day, 8), empty: day > 24 };
    case 'wildfire': return { dead: 0.6 * ramp(day, 3), empty: day > 6 };
    case 'ash_winter': case 'supervolcano': return { dead: 0.9 * ramp(day, 10), empty: day > 40 };
    case 'nuclear': case 'reactor_meltdown': return { dead: 0.8 * ramp(day, 4), empty: day > 30 };
    case 'dam_flood': return { dead: 0.6 * ramp(day, 3) * decay(day, 60, 60), empty: day < 20 };
    case 'water_war': return { dead: 0.5 * ramp(day, 20), empty: false };
    case 'solar_flare': case 'asteroid': return { dead: 0.3 * ramp(day, 10), empty: false };
    default: return { dead: 0, empty: false };
  }
}

/** How far the creek's water is lowered, 0 (as it runs) to 1 (a dry bed). Drought and water war; a dust-bowl famine half. */
export function streamDrop(kind: FeltKind | null, day: number): number {
  if (!kind || day < 0) return 0;
  switch (kind) {
    case 'drought': return ramp(day, 14) * decay(day, 250, 300);
    case 'water_war': return 0.75 * ramp(day, 10);
    case 'global_famine': return 0.5 * ramp(day, 30);
    case 'crop_blight': return 0.15 * ramp(day, 20);
    default: return 0;
  }
}

// ── the entry points ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Days since the hit for the marks (fractional: a flood rises within the first day). */
export const markDay = (s: Pick<GameState, 'disaster' | 'clock'>): number => s.clock.t - s.disaster.hitAt;

function hash(str: string): number { let h = 7; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h); }

/**
 * The marks for the active kind `day` days after the hit (`day` may be fractional), capped for the tier. Pure and deterministic: the same
 * state and day give the same list. Nothing before the hit and nothing with no kind.
 */
export function feltMarks(s: GameState, day: number, spec: FeltSpec | null, tier: MarkTier = 'high'): WorldMark[] {
  const kind = s.disaster.kind as FeltKind | null;
  if (!kind || day < 0) return [];
  const cap = MARK_CAP[tier];
  const own = spec?.marks?.(s, day);
  if (own) return own.slice(0, cap);
  const c: Ctx = { s, day, kind, hitAt: s.disaster.hitAt, seed: s.seed, tr: s.disaster.tracks, r: mulberry32(s.seed * 7919 + hash(kind) + Math.floor(day) * 31), out: [], n: new Map() };
  (RECIPES[kind] ?? generic)(c);
  // a recipe the curves drove to nothing still leaves the generic trace
  if (c.out.length === 0) generic(c);
  return c.out.slice(0, cap);
}

/** A signature of a mark list: it changes when a mark appears, goes, or moves a tenth in severity. The world rebuilds only when this changes. */
export function marksSignature(marks: readonly WorldMark[]): string {
  let h = 5381;
  for (const m of marks) {
    const t = `${m.id}:${Math.round(m.sev * 10)}:${m.anchor.at === 'lowland' ? Math.round(m.anchor.level) : ''};`;
    for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) | 0;
  }
  return `${marks.length}.${(h >>> 0).toString(36)}`;
}

export type FarmVariant = 'ok' | 'dark' | 'boarded' | 'burned' | 'empty';
export interface FarmLook { variant: FarmVariant; /** Windows lit at night (a neighbor at home with the lights on, or a candle). */ lit: boolean }

/**
 * What each of the first `n` neighbor farmsteads looks like given the marks: burned beats boarded beats empty beats dark. A farm with no
 * mark is as it always was (lit when its household is home; a dead grid leaves a candle in about one in four).
 */
export function farmLooks(s: GameState, marks: readonly WorldMark[], n = FARMS_SHOWN): FarmLook[] {
  const by = new Map<number, Set<MarkKind>>();
  for (const m of marks) if (m.anchor.at === 'neighbor') { const set = by.get(m.anchor.i) ?? new Set<MarkKind>(); set.add(m.kind); by.set(m.anchor.i, set); }
  const natives = nativeNeighbors(s);
  return Array.from({ length: n }, (_, i) => {
    const k = by.get(i);
    const gone = !!natives[i] && (natives[i].status === 'left' || natives[i].status === 'gone');
    let variant: FarmVariant = 'ok';
    if (k?.has('ruin') || k?.has('pyre')) variant = 'burned';
    else if (k?.has('boarded')) variant = 'boarded';
    else if (k?.has('open_door') || gone) variant = 'empty';
    else if (k?.has('dark_house')) variant = 'dark';
    const candle = variant === 'dark' && ((s.seed * 13 + i * 7) % 4 === 0);
    return { variant, lit: !!natives[i] && (variant === 'ok' || candle) };
  });
}

/** Is the marks layer in play (a kind, past its hit)? */
export const marksActive = (s: Pick<GameState, 'disaster' | 'clock'>): boolean => !!s.disaster.kind && s.clock.t >= s.disaster.hitAt;
