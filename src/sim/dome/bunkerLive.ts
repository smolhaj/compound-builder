/**
 * The bunker under a dome, read off the game state (pure of rendering; the rules and numbers are in bunker.ts, every PROPOSED one marked there).
 * Which dome a bunker piece stands under, what the placing card says about the skirt against the bunker floor, the stamp a staked piece keeps
 * (`Structure.underDome`), the skirt's real depth (tier plus deep footings), the rows the Dome panel and the Projects panel show, and the refuge.
 * Not exported from `dome/index.ts` (it reads GameState).
 */
import type { GameState, Structure } from '../state';
import { BLUEPRINTS } from '../blueprints';
import { blueprintOf, isFinished } from '../construction';
import { TIER, tierOfKind, shellFt, cellsOfKind, type DomeTier } from './tiers';
import {
  againstSkirt, usableR, bpHours, bunkerBlueprint, bunkerShellShare, combinedRoom, coverOf, craterOpen, domeAt, footingBill, footingYd, refuge,
  type Cover, type DomeAt, type Hazard, type Refuge, type UnderDome,
} from './bunker';
import type { Rect } from './siting';

const isBunkerKind = (k: string): boolean => k.startsWith('bunker_');
export const isDomeStructure = (st: Structure): boolean => tierOfKind(st.kind) !== null;

const at = (st: Structure): DomeAt => domeAt(st.kind, st.x, st.z, st.rot)!;
/** Pieces staked for this dome (they remember it). */
const pieces = (s: GameState, domeId: string): Structure[] => s.structures.filter(x => x.underDome?.id === domeId);
/** Every bunker piece standing inside a dome's ring, staked with it or not (derived from where it stands: nothing is saved for a bunker that was there first). */
export function under(s: GameState, dome: Structure): Structure[] {
  const d = at(dome), r = usableR(d);
  return s.structures.filter(x => isBunkerKind(x.kind) && Math.hypot(x.x - d.x, x.z - d.z) < r + 0.25);
}

/** Feet of deep footing paid under a dome: its own (staked over a bunker) and every piece's, finished or not when `all`. */
export function footingPaid(s: GameState, dome: Structure, all = true): number {
  return (dome.domeFoot && (all || isFinished(dome)) ? dome.domeFoot.ft : 0) + pieces(s, dome.id).reduce((a, p) => a + (all || isFinished(p) ? p.underDome!.footFt : 0), 0);
}
/** How deep the buried skirt of a dome really goes (ft): its tier's depth plus the deep footings that are poured (a finished piece or dome). What the tunnelers and the cutaway read. */
export function skirtDepthFt(s: GameState, dome: Structure): number {
  const tier = tierOfKind(dome.kind);
  return tier ? TIER[tier].skirtFt + footingPaid(s, dome, false) : 0;
}

export interface BunkerSite {
  dome: string; tier: DomeTier; domeName: string;
  /** Floor depth (ft), the skirt's own depth, and the cover against it. */
  floorFt: number; skirtFt: number; cover: Cover; footYd: number; footUsd: number;
  /** The dome's crater is open (before backfill): the bunker may be built with it. */
  craterOpen: boolean;
  /** Whole hours of combined work still free in this crater, and the hours this piece would take with the dome. */
  room: number; withHours: number;
  /** Can it be built with the dome now. */
  canWith: boolean;
  /** One line on skirt depth against bunker depth for the placing card. */
  line: string;
}

/** The staked dome whose ring a piece's rectangle stands wholly inside (usable ground), or null. */
export function domeOver(s: GameState, rect: Rect): Structure | null {
  for (const st of s.structures) if (isDomeStructure(st) && tierOfKind(st.kind) !== 'earthen' && againstSkirt(at(st), rect) === 'inside') return st;
  return null;
}

/** What a bunker piece `kind` at `rect` with a floor `floorFt` down would be under its dome (null: not under one). */
export function bunkerSite(s: GameState, kind: string, rect: Rect, floorFt: number): BunkerSite | null {
  const dome = domeOver(s, rect), tier = dome && tierOfKind(dome.kind);
  if (!dome || !tier || !isBunkerKind(kind) || !BLUEPRINTS[kind]) return null;
  const cover = coverOf(tier, floorFt, footingPaid(s, dome)), dd = { tier, cells: cellsOfKind(dome.kind)! }, yd = footingYd(dd, cover.extra), fb = footingBill(dd, cover.extra);
  const dbp = blueprintOf(dome), domeHours = dbp.stages.filter(x => x.id === 'site' || x.id === 'foundation').reduce((a, x) => a + x.hours, 0);
  const linked = pieces(s, dome.id).filter(p => p.underDome!.with).reduce((a, p) => a + bpHours(blueprintOf(p)), 0);
  const ud: UnderDome = { id: dome.id, with: true, footFt: cover.extra, footYd: yd, footGoods: fb.goods, footUsd: fb.usd, floorFt };
  const withHours = bpHours(bunkerBlueprint(BLUEPRINTS[kind], ud));
  const room = combinedRoom(domeHours, linked), open = craterOpen(dome.stage) && !isFinished(dome);
  const sk = TIER[tier].skirtFt;
  const line = cover.state === 'refused'
    ? `The skirt is ${sk} ft deep and this floor lies ${Math.round(floorFt)} ft down: too deep to cover (a deep footing goes at most 20 ft further).`
    : `Protected by the skirt: the ring is ${sk}${cover.have > sk ? ` (${cover.have} ft with the footings staked)` : ''} ft deep, this bunker's floor is ${Math.round(floorFt)} ft down, and the skirt must reach ${cover.need} ft (floor plus 3 ft).`
      + (cover.extra > 0 ? ` A deep footing takes it ${cover.extra} ft further: $${Math.round(fb.usd).toLocaleString('en-US')} of concrete, steel, crew and crater work, priced as the dome prices its own skirt, on this piece's bill.` : '');
  return { dome: dome.id, tier, domeName: TIER[tier].name, floorFt, skirtFt: sk, cover, footYd: yd, footUsd: fb.usd, craterOpen: open, room, withHours, canWith: open && room >= withHours, line };
}

/** Stamp a newly staked bunker piece with its dome: built with it (when the crater is open and the crew has room and the player chose it) or dug under its floor. */
export function stampUnderDome(s: GameState, st: Structure, site: Pick<BunkerSite, 'dome' | 'floorFt'>, withDome: boolean): void {
  const dome = s.structures.find(x => x.id === site.dome), tier = dome && tierOfKind(dome.kind);
  if (!dome || !tier) return;
  const cover = coverOf(tier, site.floorFt, footingPaid(s, dome)), dd = { tier, cells: cellsOfKind(dome.kind)! }, yd = footingYd(dd, cover.extra), fb = footingBill(dd, cover.extra);
  const probe: UnderDome = { id: dome.id, with: true, footFt: cover.extra, footYd: yd, footGoods: fb.goods, footUsd: fb.usd, floorFt: site.floorFt };
  const w = bunkerSite(s, st.kind, { x0: st.x, z0: st.z, x1: st.x, z1: st.z }, site.floorFt);
  const room = w ? w.room : 0, withHrs = bpHours(bunkerBlueprint(BLUEPRINTS[st.kind], probe));
  st.underDome = { ...probe, with: withDome && craterOpen(dome.stage) && !isFinished(dome) && room >= withHrs };
}

/** A dome staked over bunker pieces already there: the deep footing its foundation pays (ft) from the deepest floor under it. */
export function stampDomeFoot(st: Structure, tier: DomeTier, cells: number, deepestFloorFt: number | null): void {
  if (deepestFloorFt === null) { delete st.domeFoot; return; }
  const c = coverOf(tier, deepestFloorFt);
  if (c.extra > 0) { const fb = footingBill({ tier, cells }, c.extra); st.domeFoot = { ft: c.extra, yd: footingYd({ tier, cells }, c.extra), goods: fb.goods, usd: fb.usd }; } else delete st.domeFoot;
}

// ── the rows the panels show ──

export interface BunkerRow { id: string; name: string; state: 'staked' | 'building' | 'finished'; mode: 'with' | 'after' | 'before'; pct: number }
export const nameOf = (kind: string): string => kind.replace(/^bunker_/, '').replace(/_/g, ' ');

/** The bunker pieces under a dome and how far each has got. */
export function bunkerRows(s: GameState, domeId: string): BunkerRow[] {
  const dome = s.structures.find(x => x.id === domeId);
  return (dome ? under(s, dome) : []).map(p => {
    const bp = blueprintOf(p), tot = bpHours(bp), done = bp.stages.reduce((a, x, i) => a + (i < p.stage ? x.hours : i === p.stage ? Math.min(p.done, x.hours) : 0), 0);
    return { id: p.id, name: nameOf(p.kind), state: isFinished(p) ? 'finished' : p.stage > 0 || p.done > 0 ? 'building' : 'staked', mode: !p.underDome ? 'before' : p.underDome.with ? 'with' : 'after', pct: tot > 0 ? Math.round(100 * done / tot) : 0 };
  });
}

/** "Bunker shell: 60 percent" for the Projects panel: the walls and roof of the pieces being built with a dome (null when none). */
export function bunkerShellPct(s: GameState, domeId: string): number | null {
  const linked = pieces(s, domeId).filter(p => p.underDome!.with);
  const v = bunkerShellShare(linked.map(p => ({ bp: blueprintOf(p), stage: p.stage, done: p.done })));
  return v === null ? null : Math.round(v * 100);
}

/** The bunker as a refuge for one dome. `domePowered`: the dome plant's substation is up. */
export function domeRefuge(s: GameState, domeId: string, hazard: Hazard, people: number, domePowered: boolean): Refuge {
  return refuge({ hazard, people, domePowered, rooms: (s.structures.find(x => x.id === domeId) ? under(s, s.structures.find(x => x.id === domeId)!) : []).filter(isFinished).map(p => p.kind) });
}
export const ringPoured = (dome: Structure): boolean => dome.stage >= 2;
export { shellFt };
