/**
 * First-time-player guidance (docs/DECISIONS.md, "UX pass"): which Build
 * items are usable right now and why not, what the next sensible one is,
 * what the bunker needs, what the plans still lack, and how the Perimeter
 * list groups by price. Pure (tested); the HUD only draws it.
 */
import { KIT } from '../game/buildkit/kit';
import { BLUEPRINTS, isHome } from './blueprints';
import { hardenCost } from './hardening';
import { isFinished, planProblem } from './construction';
import { countyWorks, needsPermit, permitFee, reviewDays } from './paperwork';
import { onOrder, orderCost } from './economy';
import { MATERIAL_IDS, MATERIALS, type MaterialId } from './materials';
import { PERIMETER, PERIMETER_ORDER, UPGRADE_NEXT, fenceLive, runBill, runFinished, wallLength, type PerimeterKind } from './perimeter';
import type { GameState, OrderLine } from './state';

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

// ── what the plans still need ──

/** Materials the plans still lack: every unbuilt stage, run and hardening job, less the stockpile and what is on order. */
export function plansNeed(s: GameState): Partial<Record<MaterialId, number>> {
  const need: Partial<Record<MaterialId, number>> = {};
  const add = (bill: Partial<Record<MaterialId, number>>) => { for (const [k, n] of Object.entries(bill) as Array<[MaterialId, number]>) need[k] = (need[k] ?? 0) + n; };
  for (const st of s.structures) {
    if (isFinished(st)) continue;
    BLUEPRINTS[st.kind].stages.forEach((sg, i) => {
      if (i < st.stage || (i === st.stage && st.supplied)) return;
      add(sg.materials);
    });
  }
  for (const r of s.perimeter) if (!runFinished(r) && !r.supplied) add(runBill(r.kind, wallLength(r)));
  for (const j of s.hardenJobs) {
    const st = s.structures.find(x => x.id === j.building);
    if (j.finishedAt !== null || j.supplied || !st) continue;
    add(hardenCost(st.kind, j.upgrade, j.tier).materials);
  }
  const pending = onOrder(s);
  const out: Partial<Record<MaterialId, number>> = {};
  for (const k of MATERIAL_IDS) {
    const n = Math.max(0, (need[k] ?? 0) - s.stock[k] - (pending[k] ?? 0));
    if (n > 0) out[k] = n;
  }
  return out;
}

/** The buyable part of `plansNeed` as order lines (own logs and spoil are not for sale). */
export function plansNeedLines(s: GameState): OrderLine[] {
  const need = plansNeed(s);
  return MATERIAL_IDS.filter(k => (need[k] ?? 0) > 0 && MATERIALS[k].price !== null).map(k => ({ material: k, qty: need[k]! }));
}

export const plansNeedCost = (s: GameState, factor = 1): number => orderCost(plansNeedLines(s), factor);

// ── the bunker ──

export const BUNKER_ENTRANCES: readonly string[] = ['bunker_hatch', 'bunker_stairs'];
const bunkerKinds = (s: GameState) => s.structures.filter(st => st.kind.startsWith('bunker_'));

export interface BunkerCheck { id: string; label: string; done: boolean; /** What to build for it. */ kind: string; detail: string }

/** What the bunker needs right now, in the order to do it: the way down, beds for everyone, air, food, a medic's corner. */
export function bunkerChecklist(s: GameState): BunkerCheck[] {
  const rooms = bunkerKinds(s);
  const has = (...kinds: string[]) => rooms.some(r => kinds.includes(r.kind));
  const beds = rooms.reduce((a, r) => a + (KIT[r.kind]?.shelters ?? 0), 0);
  const people = Math.max(1, s.people.length);
  return [
    { id: 'entrance', label: 'A way down', done: has(...BUNKER_ENTRANCES), kind: 'bunker_hatch', detail: 'a hatch or a stairwell; every room grows from it' },
    { id: 'beds', label: `Beds for ${people}`, done: beds >= people, kind: people <= 4 ? 'bunker_container' : 'bunker_dorm', detail: `${beds} of ${people} places so far` },
    { id: 'air', label: 'Clean air and power', done: has('bunker_plant'), kind: 'bunker_plant', detail: 'the plant room: NBC filter, batteries, a 2,000 L water tank' },
    { id: 'food', label: 'Food and water put by', done: has('bunker_stores', 'bunker_galley'), kind: 'bunker_stores', detail: 'a storeroom (or a galley)' },
    { id: 'medical', label: 'A medic\'s corner', done: has('bunker_medical'), kind: 'bunker_medical', detail: 'a medical bay, for wounds in a long stay' },
  ];
}

/** The first thing the bunker still lacks (null = it has everything on the list). */
export const bunkerNext = (s: GameState): BunkerCheck | null => bunkerChecklist(s).find(c => !c.done) ?? null;

// ── the Build list: greyed or ready, and the next step ──

export interface BuildAdvice {
  /** A short reason it cannot be staked yet (null = it can). */
  off: string | null;
  /** The one to do next in its group. */
  next: boolean;
  /** A line under the name (a hint, a permit, what is missing), or null. */
  note: string | null;
}

const hasKind = (s: GameState, ...kinds: string[]) => s.structures.some(st => kinds.includes(st.kind));
const hasPower = (s: GameState) => !!s.site.improvements?.power || hasKind(s, 'solar_array', 'garage_solar', 'generator_shed', 'battery_shed');

/** The family's route through the Build list, first undone first: roof, water, a toilet, food, power, then the watch. */
export interface Step { id: string; kind: (s: GameState) => string; done: (s: GameState) => boolean; why: string }
export const STEPS: readonly Step[] = [
  { id: 'home', kind: () => 'timber_cabin', done: s => s.structures.some(st => isHome(st.kind)), why: 'a roof first' },
  { id: 'water', kind: s => (s.site.gwDepth > 9 ? 'well_drilled' : 'well_hand'), done: s => hasKind(s, 'well_hand', 'well_drilled', 'cistern', 'water_tower'), why: 'water is next: nothing lasts without it' },
  { id: 'toilet', kind: () => 'outhouse', done: s => hasKind(s, 'outhouse', 'septic'), why: 'somewhere to go' },
  { id: 'food', kind: () => 'garden', done: s => hasKind(s, 'garden', 'field', 'greenhouse', 'orchard'), why: 'grow food' },
  { id: 'power', kind: () => 'solar_array', done: hasPower, why: 'power for the pump, lights and the freezer' },
  { id: 'cellar', kind: () => 'root_cellar', done: s => hasKind(s, 'root_cellar'), why: 'somewhere cool to keep what you grow' },
  { id: 'watch', kind: () => 'rise_lookout', done: s => s.structures.some(st => st.kind === 'rise_lookout' || st.kind.startsWith('watchtower')), why: 'a place to watch the road from' },
];

/** The next kit piece to stake, with the reason; null when the list is done. */
export function nextStep(s: GameState): { kind: string; why: string } | null {
  for (const st of STEPS) {
    if (st.done(s)) continue;
    const kind = st.kind(s);
    if (!planProblem(s, kind) && !buildOff(s, kind)) return { kind, why: st.why };
  }
  return null;
}

/** Why a kit piece cannot be staked now (null = it can): the site, the bunker's entrance, the permit fee. */
export function buildOff(s: GameState, kind: string): string | null {
  const site = planProblem(s, kind);
  if (site) return site;
  if (kind.startsWith('bunker_') && !BUNKER_ENTRANCES.includes(kind) && !bunkerKinds(s).some(st => BUNKER_ENTRANCES.includes(st.kind))) return 'needs a hatch or stairwell first: the way down';
  if (needsPermit(kind) && s.paper.permits && countyWorks(s) && s.money < permitFee(s, kind)) return `needs a ${usd(permitFee(s, kind))} county permit: you have ${usd(s.money)}`;
  return null;
}

export function buildAdvice(s: GameState, kind: string): BuildAdvice {
  const off = buildOff(s, kind);
  const step = nextStep(s);
  const bn = kind.startsWith('bunker_') ? bunkerNext(s) : null;
  const next = !off && (step?.kind === kind || (!!bn && bn.kind === kind));
  let note: string | null = null;
  if (next) note = bn && bn.kind === kind ? `next for the bunker: ${bn.detail}` : `next step: ${step!.why}`;
  else if (!off && needsPermit(kind) && s.paper.permits && countyWorks(s)) note = `county permit ${usd(permitFee(s, kind))}, about ${reviewDays(s, kind)} days`;
  return { off, next, note };
}

/** Wall kinds that cannot be laid now, and why (null = fine). Soft hints (power, years) go in `perimeterNote`. */
export function perimeterOff(s: GameState, kind: PerimeterKind): string | null {
  if (kind === 'creek_bars' && !s.site.creek) return 'no creek runs through this land';
  if (kind === 'escape_tunnel' && !bunkerKinds(s).length) return 'needs a bunker room first: the tunnel starts at its wall';
  return null;
}

export function perimeterNote(s: GameState, kind: PerimeterKind): string | null {
  if (kind === 'escape_tunnel') return 'opens only from inside';
  if (kind === 'electric_steel' && !fenceLive(s)) return 'needs power running, or it is only a steel wall';
  if (PERIMETER[kind].growYears) return `takes ${PERIMETER[kind].growYears} years to grow into a wall`;
  const up = UPGRADE_NEXT[kind];
  return up ? `upgrades to ${PERIMETER[up].name.toLowerCase()}` : null;
}

// ── the Perimeter list by price ──

export interface PerimeterTier { id: string; title: string; hint: string; kinds: PerimeterKind[] }
const WALL_KINDS: readonly PerimeterKind[] = PERIMETER_ORDER.filter(k => k !== 'creek_bars');

/** Dollars per 100 m of a kind (the buyable materials; your own labor and logs cost nothing here). */
export function costPer100m(kind: PerimeterKind): number {
  const len = 100 / 6, bill = runBill(kind, len);
  return orderCost(Object.entries(bill).map(([material, qty]) => ({ material: material as MaterialId, qty: qty as number })).filter(l => MATERIALS[l.material].price !== null));
}

/** The Perimeter list in price tiers, cheapest first, with the upgrade chain hinted on each. */
export function perimeterTiers(): PerimeterTier[] {
  const cost = new Map(WALL_KINDS.map(k => [k, costPer100m(k)] as const));
  const cuts = [1000, 5000, 20000];
  const bucket = (k: PerimeterKind) => cuts.filter(c => cost.get(k)! >= c).length;
  const meta = [
    { id: 'cheap', title: 'Cheap in cash', hint: 'under $1,000 per 100 m: hedges and your own labor' },
    { id: 'fence', title: 'Fences', hint: '$1,000 to $5,000 per 100 m: they turn people round' },
    { id: 'hard', title: 'Hard walls', hint: '$5,000 to $20,000 per 100 m: hard to climb or cut' },
    { id: 'premium', title: 'Premium', hint: 'over $20,000 per 100 m' },
  ];
  const tiers: PerimeterTier[] = meta.map((m, i) => ({ ...m, kinds: WALL_KINDS.filter(k => bucket(k) === i).sort((a, b) => cost.get(a)! - cost.get(b)!) }));
  const bars: PerimeterTier = { id: 'creek', title: 'Creek', hint: 'bars where the creek crosses your line', kinds: ['creek_bars'] };
  return [...tiers.filter(t => t.kinds.length), bars];
}

/** The upgrade chain a kind sits in, from its first link: split rail → barbed wire → ... */
export function upgradeChain(kind: PerimeterKind): PerimeterKind[] {
  let start = kind;
  for (let guard = 0; guard < 20; guard++) {
    const prev = (Object.keys(UPGRADE_NEXT) as PerimeterKind[]).find(k => UPGRADE_NEXT[k] === start);
    if (!prev) break;
    start = prev;
  }
  const out: PerimeterKind[] = [start];
  for (let guard = 0; guard < 20; guard++) { const n = UPGRADE_NEXT[out[out.length - 1]]; if (!n) break; out.push(n); }
  return out;
}
