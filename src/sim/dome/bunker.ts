/**
 * A bunker under a dome (owner request 2026-11-19). Pure rules, no state and no THREE (tested in bunker.test.ts). Every number marked PROPOSED waits
 * for the owner's accept or cut (docs/DECISIONS.md "Bunker under a dome").
 *
 * Where it may go. Bunker rooms and entrances may stand wholly inside the skirt ring, with one build cell (10 ft) of clear ground between the ring's
 * inner face and the room, so the buried utility lines, the airlock sleeves and the plant passage that run inside the footing never meet a room.
 * A room that would cross the ring, or sit in an airlock's lane, is refused. Tiers that make sense: geodesic, glass and arcology (a geodesic dome has about 36 ft
 * across to use, so a hatch and a corridor or one room; the bigger two hold whole bunkers). The earthen dome is a solid hut on its own pad with no floor to open a
 * hatch in and a 4 ft skirt, so a bunker is refused under it with a message that says to build beside it (PROPOSED).
 *
 * Protected by the skirt. The ring reaches `skirtFt` deep; a bunker floor lies `floorFt` below the ground (the entrance's shaft depth plus the floor slab).
 * The skirt must reach the floor plus the usual margin (`SKIRT_MARGIN_FT`), or the room's outer side is a weak spot. A tier whose skirt is shallower than
 * that may be deepened by a priced "deep footing" (PROPOSED: up to `FOOTING_MAX_FT` more); deeper than that the room is refused. The footing is poured
 * and paid for by the piece that needs it (`Structure.underDome`), so the dome's depth is derived: its tier plus the footings of the finished pieces.
 *
 * Order. A bunker may be staked WITH the dome while the crater is open (before backfill: `craterOpen`), so it shares the dig, the haul road and the spoil
 * (`WITH_DOME`), or AFTER, by excavating under the finished floor with extra shoring (`AFTER_DOME`). A piece built with the dome waits for the crater to
 * be dug as deep as it needs, and the dome waits to backfill until every such piece has its walls and roof (`holdFor`, `holdDome`).
 */
import { choosePortAngle, DEFAULT_BEARING, moduleFits, personAngles, personOffset, portVestibule } from './vehiclePort';
import { TIER, CELL_FT, shellFt, cellsOfKind, tierOfKind, type DomeTier, FRAME_SPANS } from './tiers';
import { domeGeometry } from './geometry';
import { SKIRT_MARGIN_FT, DIG_DEPTH_FT, rectVsCircle, type Rect } from './siting';
import { vestibuleOf } from './vestibule';
import { digState, hasUtilities, utilityRuns } from './dig';
import { domeCost } from './cost';
import type { Blueprint } from '../blueprints';

const FT_PER_UNIT = 2 * CELL_FT;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Tunables (all PROPOSED). */
export const BUNKER_DOME = {
  /** Thickness of the floor slab under a room (ft): the floor of the bunker is the shaft depth plus this. */
  SLAB_FT: 1,
  /** Clear ground between the skirt's inner face and a room (ft): the utility runs, sleeves and plant passage live in the footing. */
  RING_CLEAR_FT: CELL_FT, RING_CLEAR_EARTHEN_FT: 2,
  /** The most a skirt may be deepened for a bunker (ft beyond the tier's own depth). */
  FOOTING_MAX_FT: 20,
  /** Built with the dome: the share of the standalone hours (the crater, haul road and spoil handling are shared), and of the excavator hire. */
  WITH_HOURS: 0.5, WITH_EXCAVATOR: 0.75,
  /** Built after the dome, under the finished floor: shoring makes the dig, walls and roof take longer, and needs lumber (one pallet per this many m3 of spoil). */
  AFTER_HOURS: 1.25, SHORING_M3_PER_LUMBER: 30,
  /** Footing labor: hours per cubic yard of poured skirt. */
  FOOTING_HOURS_PER_YD: 2.5,
} as const;

/** What a staked piece remembers of its dome (optional on the structure, so no save bump). */
export interface UnderDome {
  /** The dome's structure id. */
  id: string;
  /** Staked with the dome while the crater was open (true), or dug under a staked dome's floor later (false). */
  with: boolean;
  /** Feet of deep footing this piece pays for (beyond the tier's skirt and what other pieces already paid), and its poured concrete (cu yd). */
  footFt: number;
  footYd: number;
  /** The footing's goods and price: the difference between the dome's own bill at the deeper skirt and at the tier's depth (concrete, rebar, the skirt crew, the deeper crater and shoring), so it is priced exactly as the dome prices its own skirt and nothing is charged twice. */
  footGoods?: Record<string, number>; footUsd?: number;
  /** How far down its floor lies (ft), as staked: what the crater must reach before it digs, and what the skirt must cover. */
  floorFt: number;
}

export interface DomeAt { tier: DomeTier; cells: number; x: number; z: number; rot: number; /** The vehicle port's stamped angle (Structure.portAngle); absent: the free angle nearest the east. */ portAngle?: number }

/** The dome a kit id and a place make, or null (not a dome). */
export function domeAt(kind: string, x: number, z: number, rot = 0, portAngle?: number): DomeAt | null {
  const tier = tierOfKind(kind);
  return tier ? { tier, cells: cellsOfKind(kind) ?? TIER[tier].cells, x, z, rot, portAngle } : null;
}

/** Radius (world units) of the shell and of the ring's inner face and of the ground a room may use. */
export const shellR = (d: DomeAt): number => shellFt(d.tier, d.cells) / 2 / FT_PER_UNIT;
export const ringInnerR = (d: DomeAt): number => shellR(d) - TIER[d.tier].skirtThickFt / FT_PER_UNIT;
/** (The earthen dome has no buried utility lines or sleeves, so it keeps only a short clear strip: its room is small.) */
export const clearFt = (tier: DomeTier): number => tier === 'earthen' ? BUNKER_DOME.RING_CLEAR_EARTHEN_FT : BUNKER_DOME.RING_CLEAR_FT;
export const usableR = (d: DomeAt): number => ringInnerR(d) - clearFt(d.tier) / FT_PER_UNIT;

/** Where a rectangle (a room, an entrance) stands against the skirt: wholly in the usable ground, clear of the ring outside, or on or too near the ring. */
export function againstSkirt(d: DomeAt, r: Rect): 'inside' | 'outside' | 'straddles' {
  const inner = rectVsCircle({ x: d.x, z: d.z, r: usableR(d) }, r);
  if (inner === 'inside') return 'inside';
  return rectVsCircle({ x: d.x, z: d.z, r: shellR(d) + 0.05 }, r) === 'outside' ? 'outside' : 'straddles';
}

/** Does a rectangle stand in the lane of an entrance (the chamber, its doors and the sleeve's way in): the person airlocks and the vehicle port of the gate complex? */
export function inAirlockLane(d: DomeAt, r: Rect): boolean {
  const R = shellR(d), v = vestibuleOf(d.tier, R), pv = portVestibule(d.tier, R);
  // (each lane: its angle, the chamber's width and length in from the shell)
  const lanes: Array<{ a: number; w: number; len: number }> = [];
  if (d.tier === 'earthen') lanes.push({ a: d.rot * Math.PI / 2, w: v.w, len: v.len });
  else {
    const port = d.portAngle ?? choosePortAngle({ tier: d.tier, r: R, rot: d.rot }, DEFAULT_BEARING).angle;
    for (const a of personAngles(d.tier, R, port)) lanes.push({ a: moduleFits(d.tier, R) ? a + personOffset(d.tier, R) : a, w: v.w, len: v.len });      // (the person chamber is parallel to the port's: its lane as seen from the center)
    if (pv) lanes.push({ a: port, w: pv.w, len: pv.len });
  }
  for (const l of lanes) {
    const half = l.w / 2 + 0.1, from = R - l.len - 0.1, s = Math.sin(l.a), c = Math.cos(l.a);
    for (let k = 0; k <= 8; k++) {
      const t = from + (R - from) * k / 8, px = d.x + s * t, pz = d.z + c * t;
      const nx = Math.max(r.x0, Math.min(px, r.x1)), nz = Math.max(r.z0, Math.min(pz, r.z1));
      if (Math.hypot(nx - px, nz - pz) < half) return true;
    }
  }
  return false;
}

/** Does a rectangle stand on the buried power, water, sewer and data lines (laid across the pit floor from the plant out to the ring before anything else goes in)? */
export function inUtilityLane(d: DomeAt, r: Rect): boolean {
  if (!hasUtilities(d.tier)) return false;
  const R = shellR(d), a0 = (d.tier === 'earthen' ? 0 : 0) + d.rot * Math.PI / 2, n = FRAME_SPANS[d.tier];
  for (const u of utilityRuns(d.tier, d.cells)) {
    if (u.kind === 'sleeve') continue;
    // (the runs lie at the angle between the first two airlocks, turned with the dome; each is offset sideways by `off`)
    const a = u.a + a0, s = Math.sin(a), c = Math.cos(a), half = u.pipe * (u.n > 1 ? 1 + u.n : 1) + 0.12, to = Math.min(u.r1, R);
    for (let k = 0; k <= 12; k++) {
      const t = u.r0 + (to - u.r0) * k / 12, px = d.x + s * t + c * u.off, pz = d.z + c * t - s * u.off;
      const nx = Math.max(r.x0, Math.min(px, r.x1)), nz = Math.max(r.z0, Math.min(pz, r.z1));
      if (Math.hypot(nx - px, nz - pz) < half) return true;
    }
  }
  void n;
  return false;
}

// ── depth: the skirt against the bunker floor ──

/** Depth of a bunker floor below the ground (ft): ground height less the room's datum, in world units, plus the slab. */
export const floorFt = (groundY: number, datumY: number): number => Math.round(((groundY - datumY) * FT_PER_UNIT + BUNKER_DOME.SLAB_FT) * 10) / 10;
/** How deep the skirt must reach to cover a floor `fl` ft down: the floor plus the margin, to the whole foot. */
export const skirtNeedFt = (fl: number): number => Math.ceil(fl + SKIRT_MARGIN_FT - 1e-9);

export interface Cover {
  /** Depth the skirt must reach (ft), the depth it has (tier plus the footings already paid), and the extra footing still to pour. */
  need: number; have: number; extra: number;
  /** Covered as it stands, covered once the extra footing is poured, or refused (the footing would pass the cap). */
  state: 'covered' | 'footing' | 'refused';
}
/** The skirt against a bunker floor `fl` ft down, with `paid` ft of deep footing already poured or staked under this dome. */
export function coverOf(tier: DomeTier, fl: number, paid = 0): Cover {
  const need = skirtNeedFt(fl), base = TIER[tier].skirtFt, have = base + paid, extra = Math.max(0, need - have);
  return { need, have, extra, state: need - base > BUNKER_DOME.FOOTING_MAX_FT ? 'refused' : extra > 0 ? 'footing' : 'covered' };
}

/**
 * What `extraFt` more depth of the skirt costs, the dome's own way (sim/dome/pricing.ts: skirt concrete at the new rebar rate, the skirt crew, and the deeper
 * crater and shoring that go with it): the difference of two `domeCost` bills. Goods and dollars; the bunker piece that needs it carries them in its foundation
 * stage, so the dome's own bill and the card's `domeCostSummary(...).extras` line never count it twice (PROPOSED: priced as the dome prices it).
 */
export function footingBill(d: Pick<DomeAt, 'tier' | 'cells'>, extraFt: number): { goods: Record<string, number>; usd: number } {
  if (extraFt <= 0) return { goods: {}, usd: 0 };
  const a = domeCost(d.tier, d.cells), b = domeCost(d.tier, d.cells, { skirtFt: TIER[d.tier].skirtFt + extraFt }), goods: Record<string, number> = {};
  for (const st of ['site', 'foundation'] as const) for (const [k, n] of Object.entries(b.stages[st]) as Array<[string, number]>) { const dn = n - ((a.stages[st] as Record<string, number>)[k] ?? 0); if (dn > 0) goods[k] = (goods[k] ?? 0) + dn; }
  return { goods, usd: Math.max(0, b.materialsUsd - a.materialsUsd) };
}

/** Cubic yards of concrete in `extraFt` more depth of the ring. */
export function footingYd(d: Pick<DomeAt, 'tier' | 'cells'>, extraFt: number): number {
  return extraFt <= 0 ? 0 : Math.ceil(domeGeometry(d.tier, shellFt(d.tier, d.cells)).ringFt * extraFt * TIER[d.tier].skirtThickFt / 27);
}

export type BunkerProblem = 'straddles_skirt' | 'airlock_lane' | 'utility_lane' | 'skirt_too_shallow' | 'earthen_hut';
export const BUNKER_PROBLEM_TEXT: Record<BunkerProblem, string> = {
  straddles_skirt: 'The dome\'s buried skirt is in the way: keep a bunker wholly inside it, a cell of clear ground from the ring (or wholly outside the dome)',
  airlock_lane: 'That is the way in to an airlock: keep the bunker clear of it',
  utility_lane: 'The dome\'s buried power, water, sewer and data lines run here: keep the bunker clear of them',
  earthen_hut: 'An earthen dome is a solid hut with no floor to open a hatch in, and its 4 ft skirt is too shallow to guard a bunker: build the bunker beside it, or under a geodesic, glass or arcology dome',
  skirt_too_shallow: 'The bunker floor would lie deeper than the dome\'s skirt can be taken down: choose ground that is not so low here',
};

/**
 * Why a bunker piece (its rectangle and the floor depth it would have) cannot go inside this dome, or null. A piece wholly outside the ring is an
 * ordinary bunker. `paid` is the deep footing already staked under this dome (ft).
 */
export function bunkerProblemUnder(d: DomeAt, r: Rect, fl: number): BunkerProblem | null {
  const where = againstSkirt(d, r);
  if (where === 'outside') return null;
  if (d.tier === 'earthen') return 'earthen_hut';
  if (where === 'straddles') return 'straddles_skirt';
  if (inAirlockLane(d, r)) return 'airlock_lane';
  if (inUtilityLane(d, r)) return 'utility_lane';
  if (coverOf(d.tier, fl).state === 'refused') return 'skirt_too_shallow';
  return null;
}

// ── the plan: with the dome, or after it ──

/** The crater is open: nothing has been backfilled yet (the dome's stage 0 or 1, the site and foundation stages). */
export const craterOpen = (domeStage: number): boolean => domeStage <= 1;

/** Does a dome's hours at the site and foundation stages leave room for more combined work? `domeHours` are the stage hours of the dome's blueprint. */
export function combinedRoom(domeSiteFoundationHours: number, linkedHours: number): number { return Math.max(0, Math.round(domeSiteFoundationHours - linkedHours)); }

/** The bunker piece's blueprint under a dome: halved hours riding on the open crater, or shored hours under the finished floor, plus any deep footing. Never free: every stage keeps at least an hour and its goods. */
export function bunkerBlueprint(bp: Blueprint, ud: UnderDome): Blueprint {
  const k = ud.with ? BUNKER_DOME.WITH_HOURS : BUNKER_DOME.AFTER_HOURS;
  return {
    ...bp,
    stages: bp.stages.map(st => {
      const m = { ...st.materials }, hours = Math.max(1, Math.round(st.hours * k));
      if (st.id === 'foundation') {
        if (ud.with && m.excavator) m.excavator = Math.max(1, Math.ceil(m.excavator * BUNKER_DOME.WITH_EXCAVATOR));
        if (!ud.with) m.lumber = (m.lumber ?? 0) + Math.max(1, Math.ceil((st.yields?.spoil ?? 0) / BUNKER_DOME.SHORING_M3_PER_LUMBER));
        for (const [g, n] of Object.entries(ud.footGoods ?? {})) (m as Record<string, number>)[g] = ((m as Record<string, number>)[g] ?? 0) + n;
        return { ...st, hours: hours + Math.round(ud.footYd * BUNKER_DOME.FOOTING_HOURS_PER_YD), materials: m };
      }
      return { ...st, hours, materials: m };
    }),
  };
}

/** A dome placed over a bunker already there pays for the deep footing the bunker needs: its foundation stage gets the concrete and the labor. */
export function footedBlueprint(bp: Blueprint, footYd: number, goods: Record<string, number> = {}): Blueprint {
  if (footYd <= 0) return bp;
  return { ...bp, stages: bp.stages.map(st => { if (st.id !== 'foundation') return st; const m = { ...st.materials } as Record<string, number>; for (const [g, n] of Object.entries(goods)) m[g] = (m[g] ?? 0) + n; return { ...st, hours: st.hours + Math.round(footYd * BUNKER_DOME.FOOTING_HOURS_PER_YD), materials: m }; }) };
}

/** Total on-site hours of a blueprint. */
export const bpHours = (bp: Blueprint): number => bp.stages.reduce((a, s) => a + s.hours, 0);

/** Hours of the whole project: the dome plus each bunker piece (standalone hours), built with the dome or after it. Built with it never takes longer than apart. */
export function projectHours(domeHours: number, bunkers: readonly number[], mode: 'with' | 'apart' | 'after'): number {
  const k = mode === 'with' ? BUNKER_DOME.WITH_HOURS : mode === 'after' ? BUNKER_DOME.AFTER_HOURS : 1;
  return domeHours + bunkers.reduce((a, h) => a + h * k, 0);
}

/** A staked piece, as far as the order rules need to see it. */
export interface Piece { id: string; kind: string; stage: number; done: number; underDome?: UnderDome }
const STAGES_TO_SHELL = 4;   // the dig, walls and roof slab are stages 1 to 3; the fit-out (4) may go on under the backfill

/** The share (0..1) of a piece's walls and roof that stands: hours done over the hours of its shell stages (the stake-out, dig, walls and roof). */
export function shellShare(bp: Blueprint, stage: number, done: number): number {
  const shell = bp.stages.slice(0, STAGES_TO_SHELL), total = shell.reduce((a, s) => a + s.hours, 0);
  if (total <= 0) return 1;
  let h = 0;
  for (let i = 0; i < shell.length; i++) h += i < stage ? shell[i].hours : i === stage ? Math.min(done, shell[i].hours) : 0;
  return clamp01(h / total);
}
/** The shell progress of the bunker pieces built with a dome (hours-weighted), or null when there are none. */
export function bunkerShellShare(pieces: ReadonlyArray<{ bp: Blueprint; stage: number; done: number }>): number | null {
  if (!pieces.length) return null;
  let h = 0, t = 0;
  for (const p of pieces) { const tot = p.bp.stages.slice(0, STAGES_TO_SHELL).reduce((a, s) => a + s.hours, 0); h += shellShare(p.bp, p.stage, p.done) * tot; t += tot; }
  return t > 0 ? clamp01(h / t) : 1;
}

/** Why a bunker piece built with its dome cannot start its dig yet (null: it can). It waits until the crater is down to the depth it needs. */
export function holdFor(piece: Piece, dome: { tier: DomeTier; stage: number; f: number } | null, floorNeedFt: number): string | null {
  const ud = piece.underDome;
  if (!ud?.with || piece.stage !== 1 || !dome) return null;
  const st = digState(dome.tier, dome.stage, dome.f), want = Math.min(floorNeedFt, st.fullFt);
  if (st.filled > 0 || st.depthFt + 1e-6 >= want) return null;
  return `waiting for the dome's crater to be dug ${Math.round(want)} ft down (now ${Math.round(st.depthFt)} ft)`;
}
/** Why a dome cannot begin its backfill and frame stage yet: the bunker pieces built with it have no walls and roof (null: it can). */
export function holdDome(domeStage: number, linked: readonly Piece[]): string | null {
  if (domeStage !== 2) return null;
  const open = linked.filter(p => p.underDome?.with && p.stage < STAGES_TO_SHELL);
  return open.length ? `waiting for the bunker under it to get its walls and roof before the crater is backfilled (${open.length} room${open.length === 1 ? '' : 's'} still open)` : null;
}

// ── the skirt against a dig, and the bunker as a refuge ──

/** A crew that has learned the place digs this much deeper (ft): the same number as crossing.ts `DIG_DEEPER` (a test holds them equal). */
export const LEARNED_DEEPER_FT = 12;
/** Share of dig attempts the ring turns round (the same formula as crossing.ts `digStops`, which this module cannot import without a cycle). */
export function skirtTurns(skirtFt: number, adapt = 0): number {
  const [lo, hi] = DIG_DEPTH_FT, k = clamp01(adapt) * LEARNED_DEEPER_FT;
  return Math.max(0, Math.min(0.995, (skirtFt - SKIRT_MARGIN_FT - (lo + k)) / (hi - lo)));
}
/**
 * The chance a dig that starts outside ends in a bunker under the dome. Zero from outside when the ring is poured and reaches the floor plus the margin
 * against what the crew can dig; with a shallower ring only the share the ring does not turn gets through; with no ring poured yet, every dig that reaches
 * the room does. `sensorDetect` (0..1) is the chance the dig is heard first. A deeper skirt, a poured ring or more sensors never raise it.
 */
export function digReach(o: { ringBuilt: boolean; skirtFt: number; adapt?: number; sensorDetect?: number }): number {
  const through = o.ringBuilt ? 1 - skirtTurns(o.skirtFt, o.adapt ?? 0) : 1;
  return through * (1 - clamp01(o.sensorDetect ?? 0));
}

/** Beds and standing room a finished bunker room gives (PROPOSED: standing room two a room for any other finished room). */
export const ROOM_BEDS: Record<string, number> = { bunker_container: 4, bunker_dorm: 8, bunker_galley: 2, bunker_medical: 1, bunker_comms: 1 };
export const STANDING_PER_ROOM = 2;
const ENTRANCES = ['bunker_hatch', 'bunker_stairs', 'bunker_floorhatch'];
export type Hazard = 'breach' | 'fire' | 'fallout' | 'siege';

export interface Refuge {
  /** Can people get down at all: a finished entrance under the dome. */
  open: boolean;
  /** Places (beds and standing room), people who fit, and people left in the dome. */
  places: number; sheltered: number; left: number;
  /** Power: the dome plant's feed (when its substation is up), the bunker's own plant room, or none. */
  power: 'dome' | 'own' | 'none';
  /** Air: the bunker's own filter (a plant room), or what is in the room (hours of it, no more). */
  air: 'filtered' | 'stale';
}
/** The bunker as one more refuge for a dome: during a breach, fire, fallout or siege the people under the shell can drop into it. */
export function refuge(o: { hazard: Hazard; people: number; rooms: readonly string[]; domePowered: boolean }): Refuge {
  const open = o.rooms.some(k => ENTRANCES.includes(k));
  const places = open ? o.rooms.filter(k => !ENTRANCES.includes(k)).reduce((a, k) => a + (ROOM_BEDS[k] ?? 0) + STANDING_PER_ROOM, 0) : 0;
  const sheltered = Math.min(Math.max(0, o.people), places), plant = o.rooms.includes('bunker_plant');
  return {
    open, places, sheltered, left: Math.max(0, o.people) - sheltered,
    power: o.domePowered ? 'dome' : plant ? 'own' : 'none',
    air: plant ? 'filtered' : 'stale',
  };
}
