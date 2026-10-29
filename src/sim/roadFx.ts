/**
 * What the road does (docs/DECISIONS.md, "Roads follow the land"): small,
 * documented effects of the planned alignment (sim/roadPlan.ts) on systems
 * that already exist. One place, so the balance is one read:
 *
 *  - Quote: the planned length, grade, cut and fill, structures and walls are
 *    the driveway quote (sim/improvements.ts driveQuote reads `plan.usd`).
 *  - Winter: difficulty = the steepest stretch past 6 %, plus 0.12 a hairpin
 *    (cap 0.6) and 0.25 a km of road; a bridge or a ford adds 0.1 (ice). The
 *    altitude term stays in sim/slope.ts.
 *  - Response: deputies, ambulance and fire take longer: +35 % a km past 300 m
 *    (cap +50 %), +3 % a hairpin, +15 % past 10 % grade, +25 % more past 16 %,
 *    +5 % each single-file structure.
 *  - Heavy loads (concrete, tanks, containers, an excavator) are shuttled
 *    across a one-lane bridge posted at 10 tons: 2 more days; a low-water
 *    crossing is out for the days of a flood.
 *  - Raids: a vehicle crew comes up the road; a one-lane bridge, a bore, a ford
 *    or a hairpin chain is single file, so the crew bunches and dismounts at
 *    the choke, 3 units further out per choke and 1.5 per hairpin (cap 12) than
 *    on open ground, so the watch sees it that much longer. Hold the choke (a
 *    tower or wall within 4 units) and it counts as a held choke in the shared
 *    defensive strength, small: at most 25 % of the terrain's share.
 * Scope: the quote and the drawing read the plan on every place; the raid, delivery and winter effects
 * (and the response time) read it on a place on a lot archetype, the hill country where the road has real
 * relief, like sim/slope.ts (the plan costs a search, and every battle and test seed would pay it); a
 * flood still takes a low-water crossing on any place. Pure.
 */
import type { GameState, RoadBridgeState } from './state';
import { log } from './economy';
import { dayIndex } from './state';
import type { Pt } from './perimeter';
import type { RoadPlan, RoadStructure } from './roadPlan';
import { roadPlanOf } from './roadState';

export const RFX = {
  /** Winter difficulty. */
  HAIRPIN_WINTER: 0.12, HAIRPIN_WINTER_CAP: 0.6, PER_KM_WINTER: 0.25, ICE: 0.1,
  /** Response time. */
  KM_RESPONSE: 0.35, KM_RESPONSE_CAP: 0.5, HAIRPIN_RESPONSE: 0.03, GRADE10: 0.15, GRADE16: 0.25, SINGLE_FILE: 0.05,
  /** Raids: extra distance (units) before the line per choke / hairpin, and the cap. */
  CHOKE_START: 3, HAIRPIN_START: 1.5, START_CAP: 12,
  /** The road choke's share of the terrain defense. */
  DEFENSE_SHARE: 0.25,
} as const;

const planOf = (s: Pick<GameState, 'site' | 'seed'>): RoadPlan => roadPlanOf(s);

/** The structures a vehicle passes one at a time. */
export const singleFile = (p: RoadPlan): RoadStructure[] => p.structures.filter(x => x.choke);

/** Winter difficulty from the road alone (1 or more: the road closes on heavy snow days). */
export function winterOf(p: RoadPlan): number {
  return Math.max(0, (p.maxGradePct / 100 - 0.06) / 0.08)
    + Math.min(RFX.HAIRPIN_WINTER_CAP, p.hairpins.length * RFX.HAIRPIN_WINTER)
    + (p.lengthM / 1000) * RFX.PER_KM_WINTER
    + (p.structures.some(x => x.kind === 'bridge' || x.kind === 'bridge1' || x.kind === 'ford' || x.kind === 'low_water') ? RFX.ICE : 0);
}
export const roadWinter = (s: Pick<GameState, 'site' | 'seed'>): number => winterOf(planOf(s));

/** Multiplier on the deputy, ambulance and fire response time from the road alone. */
export function responseOf(p: RoadPlan): number {
  const g = p.maxGradePct;
  let k = 1 + Math.min(RFX.KM_RESPONSE_CAP, Math.max(0, (p.lengthM - 300) / 1000 * RFX.KM_RESPONSE));
  k += p.hairpins.length * RFX.HAIRPIN_RESPONSE + (g > 10 ? RFX.GRADE10 : 0) + (g > 16 ? RFX.GRADE16 : 0) + singleFile(p).length * RFX.SINGLE_FILE;
  return Math.round(k * 100) / 100;
}
export const roadResponse = (s: Pick<GameState, 'site' | 'seed'>): number => responseOf(planOf(s));

const HEAVY = ['concrete', 'tank', 'container', 'septic_tank', 'excavator', 'drilling'];
export const BRIDGE_TEXT = 'the one-lane bridge is posted at 10 tons: the heavy load is shuttled across in pieces';
export const CROSSING_OUT_TEXT = 'the low-water crossing is under the creek';

/** Extra days on a delivery that the road's structures cost. */
export function structureDelayOf(p: RoadPlan, materials: readonly string[]): { days: number; why: string | null } {
  return materials.some(m => HEAVY.includes(m)) && p.structures.some(x => x.kind === 'bridge1') ? { days: 2, why: BRIDGE_TEXT } : { days: 0, why: null };
}
export function structureDelay(s: Pick<GameState, 'site' | 'seed'>, materials: readonly string[]): { days: number; why: string | null } {
  if (!s.site.lot || !materials.some(m => HEAVY.includes(m))) return { days: 0, why: null };   // (cheap first: the plan is only read for a heavy load, on a lot)
  return structureDelayOf(planOf(s), materials);
}

/** Days left that a flood has the low-water crossing under (0: open). A bridge or a culvert stays open. */
export function crossingOutFor(s: GameState, day = dayIndex(s.clock.t)): number {
  const a = s.weather?.active;
  if (!a || (a.kind !== 'flood' && a.kind !== 'flash_flood' && a.kind !== 'hurricane_remnants')) return 0;
  if (!planOf(s).structures.some(x => x.kind === 'low_water' || x.kind === 'ford')) return 0;
  return day >= a.at && day <= a.until + 1 ? Math.max(1, Math.min(3, a.until + 1 - day + 1)) : 0;
}

// ── raids ──

export interface RoadChoke { kind: RoadStructure['kind'] | 'hairpins'; at: Pt; /** Width of the way there, units (a one-lane structure is ~0.6). */ width: number }

/** Where the road is single file (a bridge that is down is no choke: nothing crosses there). */
export function chokesOf(p: RoadPlan, bridgeDown = false): RoadChoke[] {
  const out: RoadChoke[] = singleFile(p).filter(x => !(bridgeDown && (x.kind === 'bridge1' || x.kind === 'bridge'))).map(x => ({ kind: x.kind, at: [x.x, x.z] as Pt, width: 0.6 }));
  if (p.hairpins.length >= 2) { const h = p.hairpins[Math.floor(p.hairpins.length / 2)]; out.push({ kind: 'hairpins', at: [h.x, h.z], width: 0.8 }); }
  return out;
}
/**
 * Only a place on a lot archetype (the hill country, where the ground has relief) reads the road in a raid: the
 * plan costs a search over the land, and every battle, every raid dossier and every test seed would pay it; the
 * classic ground's road is a short level drive.
 */
export const roadChokes = (s: Pick<GameState, 'site' | 'seed'> & Partial<Pick<GameState, 'roadBridge'>>): RoadChoke[] => (s.site.lot ? chokesOf(planOf(s), s.roadBridge?.down) : []);

/** Extra distance (units) a vehicle crew's approach adds before the line: the watch sees it that much longer. */
export const startOf = (p: RoadPlan, bridgeDown = false): number => Math.min(RFX.START_CAP, chokesOf(p, bridgeDown).filter(c => c.kind !== 'hairpins').length * RFX.CHOKE_START + p.hairpins.length * RFX.HAIRPIN_START);
export const roadStart = (s: Pick<GameState, 'site' | 'seed'> & Partial<Pick<GameState, 'roadBridge'>>): number => (s.site.lot ? startOf(planOf(s), s.roadBridge?.down) : 0);

/** How much easier than open ground the road side is for a crew (the terrain's ROAD_EASE 0.75), eased back toward 1 as the road gets slow: +0.1 for each time its drive exceeds a straight level road's (cap 1). */
export function easeOf(p: RoadPlan, base: number): number {
  const slow = p.straightMin > 0 ? p.driveMin / p.straightMin : 1;
  return Math.round(Math.min(1, base + 0.1 * Math.max(0, slow - 1)) * 100) / 100;
}
export const roadEase = (s: Pick<GameState, 'site' | 'seed'>, base: number): number => (s.site.lot ? easeOf(planOf(s), base) : base);

/** Words for the Defense card and the log. */
export function roadChokeLines(s: Pick<GameState, 'site' | 'seed'> & Partial<Pick<GameState, 'roadBridge'>>): string[] {
  const p = planOf(s);
  const kind: Record<string, string> = { bridge1: 'a one-lane bridge', bridge: 'a bridge', tunnel: 'a rock bore', ford: 'a ford', low_water: 'a low-water crossing', hairpins: `${p.hairpins.length} hairpins` };
  return roadChokes(s).map(c => `The road is single file at ${kind[c.kind]}: a crew's trucks stop there and walk`);
}

// ── words ──

/** One line for the Land / Supplies card: what the way in is like. */
export function roadLine(s: Pick<GameState, 'site' | 'seed'>): string {
  const p = planOf(s);
  const km = p.lengthM >= 1000 ? `${(p.lengthM / 1000).toFixed(1)} km` : `${p.lengthM} m`;
  const bits = [`${km} of ${p.style}`, `steepest ${Math.round(p.maxGradePct)} %`];
  if (p.hairpins.length) bits.push(`${p.hairpins.length} hairpin${p.hairpins.length === 1 ? '' : 's'}`);
  for (const k of ['bridge', 'bridge1', 'tunnel', 'low_water', 'ford'] as const) { const n = p.structures.filter(x => x.kind === k).length; if (n) bits.push(`${n > 1 ? n + ' ' : 'a '}${{ bridge: 'bridge', bridge1: 'one-lane bridge', tunnel: 'rock bore', low_water: 'low-water crossing', ford: 'ford' }[k]}${n > 1 ? 's' : ''}`); }
  return bits.join(', ');
}

// ── the bridge on the way in ──

/** The bridge on this place's planned road, if it has one. */
export function roadBridgeOf(s: Pick<GameState, 'site' | 'seed'>): RoadStructure | null {
  return planOf(s).structures.find(x => x.kind === 'bridge1' || x.kind === 'bridge') ?? null;
}
export const bridgeDown = (s: Pick<GameState, 'roadBridge'>): boolean => !!s.roadBridge?.down;

/** What a crew's trucks (and yours) find at a bridge that is down: it stops them at the creek. A held choke is worth this much to the road's share of the defense. */
export const DROPPED_SCORE = 0.6;

/**
 * Bring the bridge on the way in down on purpose: nothing with wheels crosses until it is rebuilt (the delivery truck
 * leaves its load at the creek, and the family carries it in), a crew's trucks stop there and they ford on foot, and the
 * road's share of the defense counts it like a held choke. Null on success, else why not.
 */
export function dropRoadBridge(s: GameState): string | null {
  const b = roadBridgeOf(s);
  if (!b) return 'the way in has no bridge';
  if (!s.site.improvements.drive) return 'there is no drive in yet';
  if (s.roadBridge.down) return s.roadBridge.due !== null ? 'it is being rebuilt' : 'it is already down';
  s.roadBridge = { down: true, due: null };
  log(s, 'The bridge on the way in is down. Nothing with wheels crosses the creek until it is rebuilt: deliveries stop at the creek and get carried in, and a crew has to ford it on foot.');
  return null;
}

/** What rebuilding it costs: the structure's price from the one table, and the days it takes. */
export function rebuildQuote(s: Pick<GameState, 'site' | 'seed'>): { usd: number; days: number } | null {
  const b = roadBridgeOf(s);
  return b ? { usd: b.usd, days: b.days } : null;
}

/** Order the rebuilding (the crew comes, the money goes); null on success, else why not. */
export function rebuildRoadBridge(s: GameState): string | null {
  const q = rebuildQuote(s);
  if (!q) return 'the way in has no bridge';
  if (!s.roadBridge.down) return 'it is standing';
  if (s.roadBridge.due !== null) return 'it is already being rebuilt';
  if (s.money < q.usd) return 'not enough money';
  s.money -= q.usd;
  s.roadBridge = { down: true, due: s.clock.t + q.days };
  log(s, `A crew is rebuilding the bridge on the way in ($${q.usd.toLocaleString('en-US')}, about ${q.days} days).`);
  return null;
}

/** Once a day: a bridge being rebuilt is finished when its days are up. */
export function roadBridgeDay(s: GameState): void {
  const rb: RoadBridgeState | undefined = s.roadBridge;
  if (!rb || !rb.down || rb.due === null || s.clock.t < rb.due) return;
  s.roadBridge = { down: false, due: null };
  log(s, 'The bridge on the way in is rebuilt: trucks cross again.');
}
