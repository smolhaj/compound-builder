/**
 * "Lay out a starter compound" (docs/DECISIONS.md, "Starter compound"): one proposal for a new player, a small house that sleeps the
 * family, a well, solar and a battery, a garden and a root cellar, a privy and a first fence round the yard with a gate on the drive,
 * sited for THIS lot with the same rules a hand placement meets (the kit's placement problems, the graded-pad clash, the camp and the
 * drive, the privy kept 30 m from the well, everything inside the 70 m the utilities reach by themselves). Nothing is new here: it is a
 * smart batch over the existing placement, the existing blueprints (so slope grading, permits and the stock all count the usual way),
 * and the existing "wall my property" planner for the fence. Pieces the cash cannot cover are listed as "later", never blocking.
 * Deterministic: the same game, lot and query give the same layout. Pure; the HUD shows it as a ghost preview and the store lays it.
 */
import { CELL, KIT, footprint, snapCenter, type SiteQuery } from '../game/buildkit/kit';
import { siteProblem } from '../game/buildkit/underground';
import { padClash } from '../game/buildkit/padRules';
import { HOME_BEDS, isHome, totalBill } from './blueprints';
import { blueprintOf } from './construction';
import { stampGrade } from './slope';
import { stampStyle } from './housingStyles';
import { orderCost } from './economy';
import { MATERIALS, type MaterialId } from './materials';
import { drillExtra } from './site';
import { countyWorks, needsPermit, permitFee } from './paperwork';
import { PERIMETER, type PerimeterKind } from './perimeter';
import { planPropertyWall, type PropertyGeometry, type WallPlan } from './propertyWall';
import { SAFE_M } from './sanitation';
import { mulberry32 } from './rng';
import type { Rect } from './land';
import type { GameState, Structure } from './state';

export type StarterRole = 'shelter' | 'water' | 'power' | 'sanitation' | 'food' | 'defense';

export interface StarterPiece {
  /** Stable within a plan ("home", "well", "solar", "battery", "garden", "cellar", "privy"). */
  key: string;
  kind: string;
  role: StarterRole;
  name: string;
  x: number; z: number; rot: number;
  /** Materials to buy (net of the stockpile), plus a permit fee and the well's drilling extra, dollars; and the work, hours. */
  usd: number; permit: number; hours: number;
  /** True: not laid by "Place all" (cash, no room, or dropped by the player). */
  later: boolean;
  /** Why it is later (null when it is going in). */
  laterWhy: string | null;
  /** One line: what it is for. */
  why: string;
}

export interface StarterYard {
  kind: PerimeterKind;
  rect: Rect;
  plan: WallPlan;
  usd: number; hours: number;
  later: boolean; laterWhy: string | null;
}

export interface StarterPlan {
  pieces: StarterPiece[];
  yard: StarterYard | null;
  /** Totals for what goes in now: dollars (materials + permits), hours of work, permit fees. */
  usd: number; hours: number; permits: number;
  cash: number;
  /** Cash kept back for living costs while the family builds. */
  reserve: number;
  /** One line: "7 pieces · ~$102,000 · 2,600 h · permits $1,200" */
  line: string;
  /** Why nothing can be laid (null = something can). */
  problem: string | null;
}

export interface StarterOpts {
  query: SiteQuery;
  geo: PropertyGeometry;
  /** Piece keys the player dropped from the proposal ("yard" drops the fence). */
  skip?: readonly string[];
}

/** The reason a piece has no spot (it is not a cash matter). */
export const NO_ROOM = 'no clear, level enough ground near the house';
const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

/** The 70 m the utilities reach by themselves, in world units, less the room the pieces take: nothing stands farther than this from the house. */
export const STARTER_REACH = 10;
/** Pieces keep this much clear air between footprints (u, 4.5 m): room to walk and to carry. */
const GAP = 0.75, GAP_TIGHT = 0.5;
/** Share of the cash kept for living costs while the family builds, and its floor. */
export const RESERVE_SHARE = 0.25, RESERVE_MIN = 15000;

interface Spec {
  kind: string; key: string; role: StarterRole; why: string;
  /** Where to look: around the house, or around another piece (its key). */
  around: string; r: readonly [number, number]; ideal: number;
  slopeW: number;
}

const SPECS = {
  well: { key: 'well', role: 'water', around: 'home', r: [2, 7], ideal: 3, slopeW: 4 },
  solar: { key: 'solar', role: 'power', around: 'home', r: [3, 9], ideal: 4.5, slopeW: 10 },
  battery: { key: 'battery', role: 'power', around: 'solar', r: [1.5, 4], ideal: 2.5, slopeW: 6 },
  garden: { key: 'garden', role: 'food', around: 'home', r: [3, 9], ideal: 4.5, slopeW: 14 },
  cellar: { key: 'cellar', role: 'food', around: 'garden', r: [2, 6], ideal: 3, slopeW: 4 },
  privy: { key: 'privy', role: 'sanitation', around: 'home', r: [2.5, 9], ideal: 4, slopeW: 4 },
} as const;

const rectOverlap = (a: Rect, b: Rect, m: number) => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.z0 < b.z1 + m && a.z1 > b.z0 - m;

/** Grade over a footprint (rise over run across it), from the natural ground. */
function gradeOver(h: SiteQuery['height'], fp: Rect): number {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i <= 2; i++) for (let j = 0; j <= 2; j++) { const y = h(fp.x0 + (fp.x1 - fp.x0) * i / 2, fp.z0 + (fp.z1 - fp.z0) * j / 2); lo = Math.min(lo, y); hi = Math.max(hi, y); }
  return (hi - lo) / Math.max(0.5, Math.max(fp.x1 - fp.x0, fp.z1 - fp.z0));
}

/** The smallest home that gives the missing beds, or two of the biggest when the family is large. */
export function homeKinds(missing: number): string[] {
  if (missing <= 0) return [];
  const opts = ['cottage', 'timber_cabin', 'log_house'];
  const fit = opts.find(k => HOME_BEDS[k] >= missing);
  if (fit) return [fit];
  return ['log_house', ...homeKinds(missing - HOME_BEDS.log_house)];
}

const WATER = ['well_hand', 'well_drilled', 'cistern', 'water_tower'];
const POWER = ['solar_array', 'solar_farm', 'garage_solar', 'lodge_solar', 'generator_shed', 'battery_shed', 'battery_bank', 'micro_hydro', 'wind_turbine'];
const FOOD = ['garden', 'field', 'greenhouse', 'greenhouse_heated', 'polytunnel', 'high_tunnel', 'orchard', 'orchard_grove', 'orchard_terraced', 'aquaponics'];

/** What a piece costs here: the graded blueprint's buyable bill net of the stockpile, the permit fee, the work. Mutates `left` (the stock still unspent). */
function priceOf(s: GameState, kind: string, x: number, z: number, rot: number, left: Record<string, number>): { usd: number; permit: number; hours: number } {
  const st: Structure = { id: 'starter', kind, x, z, rot, stage: 0, done: 0, supplied: false, finishedAt: null };
  stampGrade(s, st);
  stampStyle(s, st);
  const bp = blueprintOf(st), bill = totalBill(bp);
  const lines = (Object.entries(bill) as Array<[MaterialId, number]>).filter(([m]) => MATERIALS[m].price !== null).map(([material, q]) => {
    const have = Math.min(left[material] ?? 0, q);
    left[material] = (left[material] ?? 0) - have;
    return { material, qty: Math.ceil(q - have - 1e-9) };
  }).filter(l => l.qty > 0);
  const permit = needsPermit(kind) && s.paper.permits && countyWorks(s) ? permitFee(s, kind) : 0;
  const extra = kind === 'well_drilled' ? drillExtra(s.site) : 0;
  return { usd: (lines.length ? orderCost(lines, 1) : 0) + extra, permit, hours: Math.round(bp.stages.reduce((a, g) => a + g.hours, 0)) };
}

/** Is there anything left for a starter compound to propose (a home, water, privy, power or food still missing)? Cheap: no siting. */
export function starterWanted(s: GameState): boolean {
  const k = s.structures.filter(st => !st.unplaced).map(st => st.kind), has = (l: string[]) => k.some(x => l.includes(x));
  const beds = s.structures.reduce((a, st) => a + (HOME_BEDS[st.kind] ?? 0), 0);
  return beds < s.people.length || !has(WATER) || !has(['outhouse', 'septic']) || !has(POWER) || !has(FOOD);
}

export function planStarter(s: GameState, o: StarterOpts): StarterPlan {
  const { query: site, geo } = o, skip = new Set(o.skip ?? []);
  const rnd = mulberry32(s.seed * 7919 + 17);
  const phase = rnd() * Math.PI * 2, rotBias = Math.floor(rnd() * 2);
  const standing = s.structures.filter(st => !st.unplaced && KIT[st.kind]);
  const placed: Array<{ id: string; kind: string; x: number; z: number; rot: number }> = standing.map(st => ({ id: st.id, kind: st.kind, x: st.x, z: st.z, rot: st.rot }));
  const spots = new Map<string, { x: number; z: number }>();
  const h = s.site.home;
  const has = (kinds: string[]) => standing.some(st => kinds.includes(st.kind));

  // where the house is (or goes): an existing home is the center; else the camp
  const existingHome = standing.find(st => isHome(st.kind));
  const camp = geo.center ?? [(h.x0 + h.x1) / 2, (h.z0 + h.z1) / 2];
  if (existingHome) spots.set('home', { x: existingHome.x, z: existingHome.z });

  /** The best clear spot for a kind around a center (null: none). Lower score wins; the seeded jitter breaks ties the same way every time. */
  const findPass = (relaxed: boolean, kind: string, c: { x: number; z: number }, r: readonly [number, number], ideal: number, slopeW: number, extra?: (x: number, z: number) => number | null, maxD = Infinity, from: { x: number; z: number } = c): { x: number; z: number; rot: number } | null => {
    const def = KIT[kind];
    let best: { x: number; z: number; rot: number; sc: number } | null = null;
    // (a crowded lot, a farmstead with its barn and yard: the second pass looks a little farther, within what the utilities still reach, and keeps 3 m of air instead of 4.5)
    const R = relaxed ? Math.max(r[1], Math.min(maxD, STARTER_REACH + 1)) : r[1], step = CELL * 2, gap = relaxed ? GAP_TIGHT : GAP, edge = relaxed ? 0.5 : 1;
    for (let dx = -R; dx <= R; dx += step) for (let dz = -R; dz <= R; dz += step) {
      const d = Math.hypot(dx, dz);
      if (d < r[0] || d > R) continue;
      for (const rot of [rotBias, 1 - rotBias]) {
        const [x, z] = snapCenter(def, c.x + dx, c.z + dz, rot);
        if (Math.hypot(x - from.x, z - from.z) > (relaxed ? Math.min(maxD, STARTER_REACH + 1) : maxD)) continue;
        const fp = footprint(def, x, z, rot);
        if (fp.x0 < h.x0 + edge || fp.z0 < h.z0 + edge || fp.x1 > h.x1 - edge || fp.z1 > h.z1 - edge) continue;
        // clear air round every other footprint (the new piece's whole footprint, front included)
        if (placed.some(p => KIT[p.kind] && KIT[p.kind].level !== 'underground' && rectOverlap(footprint(def, x, z, rot), footprint(KIT[p.kind], p.x, p.z, p.rot), gap))) continue;
        if (siteProblem(def, x, z, rot, site, placed as never) !== null) continue;
        if (padClash(def, x, z, rot, site.height, placed as never)) continue;
        const ex = extra ? extra(x, z) : 0;
        if (ex === null) continue;
        const sc = Math.abs(Math.hypot(x - c.x, z - c.z) - ideal) + gradeOver(site.height, fp) * slopeW + ex + Math.sin((x * 12.9898 + z * 78.233) + phase) * 0.15;
        if (!best || sc < best.sc) best = { x, z, rot, sc };
      }
    }
    return best;
  };
  const find = (...a: Parameters<typeof findPass> extends [boolean, ...infer A] ? A : never) => findPass(false, ...a) ?? findPass(true, ...a);

  const pieces: StarterPiece[] = [];
  const left: Record<string, number> = { ...s.stock };
  const add = (key: string, kind: string, role: StarterRole, why: string, spot: { x: number; z: number; rot: number } | null) => {
    const base = { key, kind, role, name: KIT[kind].name, why };
    if (!spot) { pieces.push({ ...base, x: 0, z: 0, rot: 0, usd: 0, permit: 0, hours: 0, later: true, laterWhy: NO_ROOM }); return; }
    const p = priceOf(s, kind, spot.x, spot.z, spot.rot, left);
    placed.push({ id: `starter_${key}`, kind, x: spot.x, z: spot.z, rot: spot.rot });
    spots.set(key, { x: spot.x, z: spot.z });
    pieces.push({ ...base, x: spot.x, z: spot.z, rot: spot.rot, ...p, later: false, laterWhy: null });
  };

  // 1. the home: beds for everyone, counting homes already staked
  const people = s.people.length, beds = standing.reduce((a, st) => a + (HOME_BEDS[st.kind] ?? 0), 0);
  const homes = homeKinds(people - beds);
  homes.forEach((kind, i) => {
    const key = i === 0 ? 'home' : `home${i + 1}`;
    const c = i === 0 ? (spots.get('home') ?? { x: camp[0], z: camp[1] }) : spots.get('home')!;
    // a first home goes beside the camp; it is flat ground first, then near the drive
    const spot = find(kind, c, i === 0 && !existingHome ? [0, 8] : [2, 8], i === 0 && !existingHome ? 2 : 4, 18, undefined, Infinity);
    add(key, kind, 'shelter', `${HOME_BEDS[kind]} beds for the family of ${people}`, spot);
    if (i === 0 && spot && !existingHome) spots.set('home', spot);
  });
  const home = spots.get('home');
  if (!home) {
    return finish(s, pieces, null, [], 'There is no clear ground by the camp to start from. Place the first building by hand.');
  }

  const near = (key: string) => spots.get(key) ?? home;
  const put = (spec: Spec, kind: string, wanted: boolean, extra?: (x: number, z: number) => number | null) => {
    if (!wanted) return;
    const c = near(spec.around);
    add(spec.key, kind, spec.role, spec.why, find(kind, c, spec.r, spec.ideal, spec.slopeW, extra, STARTER_REACH, home));
  };

  // 2. water: a drilled well where the water is deep, a hand-dug one where it is near
  const deep = s.site.gwDepth > 9;
  put({ ...SPECS.well, kind: deep ? 'well_drilled' : 'well_hand', why: deep ? `water is ${s.site.gwDepth} m down: drilled and cased` : 'water is near: dug by hand, with a pump' }, deep ? 'well_drilled' : 'well_hand', !has(WATER),
    (x, z) => (site.height(x, z) - site.height(home.x, home.z)) * -0.5);
  // 3. the privy, uphill-of-nothing: downhill of the well and 30 m from it
  const wells = () => [...standing.filter(st => st.kind.startsWith('well_')).map(st => ({ x: st.x, z: st.z })), ...(['well'].map(k => spots.get(k)).filter(Boolean) as Array<{ x: number; z: number }>)];
  put({ ...SPECS.privy, kind: 'outhouse', why: 'a privy, well away from the well' }, 'outhouse', !has(['outhouse', 'septic']),
    (x, z) => (wells().some(w => Math.hypot(w.x - x, w.z - z) < SAFE_M / 6 + 0.3) ? null : Math.max(0, site.height(x, z) - Math.min(...wells().map(w => site.height(w.x, w.z)), 9e9)) * 2));
  // 4. power: solar with a battery beside it
  if (!has(POWER)) {
    const grid = !!s.site.improvements?.power;
    put({ ...SPECS.solar, kind: 'solar_array', why: grid ? 'your own power for when the grid goes down' : 'power for the pump, lights and the freezer' }, 'solar_array', true);
    if (spots.has('solar')) put({ ...SPECS.battery, kind: 'battery_shed', why: 'keeps it running through the night' }, 'battery_shed', true);
  }
  // 5. food: a garden, and a root cellar to keep what it grows
  if (!has(FOOD)) put({ ...SPECS.garden, kind: 'garden', why: 'the first food, on the flattest ground by the house' }, 'garden', true);
  if (!has(['root_cellar']) && (spots.has('garden') || has(FOOD))) put({ ...SPECS.cellar, kind: 'root_cellar', why: 'somewhere cool to keep it' }, 'root_cellar', true);

  // 6. the first defense step: a fence round the yard, with a gate where the drive comes in
  const live = pieces.filter(p => !p.later && !skip.has(p.key));
  let yard: StarterYard | null = null;
  const around = [...live.map(p => footprint(KIT[p.kind], p.x, p.z, p.rot)), ...standing.filter(st => Math.hypot(st.x - home.x, st.z - home.z) < 12 && KIT[st.kind].level !== 'underground').map(st => footprint(KIT[st.kind], st.x, st.z, st.rot))];
  if (live.length && !skip.has('yard') && s.perimeter.every(r => PERIMETER[r.kind].blocks.people <= 0.1 || r.pts.length < 2)) {
    const pad = 1.3;
    const rect: Rect = {
      x0: Math.max(h.x0 + 0.5, Math.min(...around.map(r => r.x0)) - pad), z0: Math.max(h.z0 + 0.5, Math.min(...around.map(r => r.z0)) - pad),
      x1: Math.min(h.x1 - 0.5, Math.max(...around.map(r => r.x1)) + pad), z1: Math.min(h.z1 - 0.5, Math.max(...around.map(r => r.z1)) + pad),
    };
    yard = { kind: 'woven_wire', rect, plan: null as never, usd: 0, hours: 0, later: false, laterWhy: null };
  }
  return finish(s, pieces, yard, [...skip], null, geo);
}

/** Totals, affordability (in priority order), the one-line summary. */
function finish(s: GameState, pieces: StarterPiece[], yard: StarterYard | null, skip: string[], problem: string | null, geo: PropertyGeometry = {}): StarterPlan {
  const cash = Math.max(0, s.money), reserve = Math.max(RESERVE_MIN, Math.round(cash * RESERVE_SHARE));
  let room = cash - reserve;
  const order: StarterRole[] = ['shelter', 'water', 'sanitation', 'power', 'food', 'defense'];
  const ranked = [...pieces].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
  for (const p of ranked) {
    if (p.later) continue;
    if (skip.includes(p.key)) { p.later = true; p.laterWhy = 'left out by you'; continue; }
    const cost = p.usd + p.permit;
    if (cost > room) { p.later = true; p.laterWhy = `${usd(cost)} is more than the ${usd(Math.max(0, room))} to spare`; continue; }
    room -= cost;
  }
  if (yard) {
    const tiers: PerimeterKind[] = ['woven_wire', 'barbed_wire', 'split_rail'];
    let chosen: { kind: PerimeterKind; plan: WallPlan; cost: number } | null = null;
    for (const kind of tiers) {
      const plan = planPropertyWall(s, kind, geo, { rects: [yard.rect] });
      if (!plan.runs.length) continue;
      const cost = plan.cost;
      chosen = { kind, plan, cost };
      if (cost <= room) break;
    }
    if (!chosen) yard = null;
    else {
      yard.kind = chosen.kind; yard.plan = chosen.plan; yard.usd = chosen.cost; yard.hours = chosen.plan.hours;
      if (chosen.cost > room) { yard.later = true; yard.laterWhy = `${usd(chosen.cost)} is more than the ${usd(Math.max(0, room))} to spare`; }
      else room -= chosen.cost;
    }
  }
  const now = pieces.filter(p => !p.later);
  const total = now.reduce((a, p) => a + p.usd + p.permit, 0) + (yard && !yard.later ? yard.usd : 0);
  const hours = now.reduce((a, p) => a + p.hours, 0) + (yard && !yard.later ? yard.hours : 0);
  const permits = now.reduce((a, p) => a + p.permit, 0);
  const count = now.length + (yard && !yard.later ? 1 : 0), later = pieces.length - now.length + (yard?.later ? 1 : 0);
  const noRoom = pieces.filter(p => p.laterWhy === NO_ROOM).length, cashLater = pieces.filter(p => p.later && p.laterWhy !== NO_ROOM && p.laterWhy !== 'left out by you').length + (yard?.later ? 1 : 0);
  const none = count === 0 ? (noRoom > 0 && cashLater === 0 ? 'there is no clear, level ground left by the house for what is missing. Place it by hand from the Build list' : cashLater === 0 && noRoom === 0 ? 'everything is left out' : 'nothing fits the cash yet') : null;
  const line = problem ?? (none ? `${none[0].toUpperCase()}${none.slice(1)}${noRoom > 0 && cashLater === 0 ? '.' : ': see the list below.'}` : `${count} ${count === 1 ? 'piece' : 'pieces'} · ~${usd(total)} · ${hours.toLocaleString('en-US')} h${permits ? ` · permits ${usd(permits)}` : ''}${later ? ` · ${later} later` : ''}`);
  return { pieces, yard, usd: total, hours, permits, cash, reserve, line, problem: problem ?? none };
}
