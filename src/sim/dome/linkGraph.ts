/**
 * Dome links, the record and the graph (docs/DOME_LINKS.md): a tunnel or an enclosed walkway between two domes (or a dome and a building or a walled
 * yard). The link is saved as a small record that points at its run (`planRun` of an underground passage or a covered walkway), so the wall, ring,
 * tunneler and route models that already read runs see it for free. This file holds only the types and the graph questions, so `compounds.ts` and
 * `standing.ts` can read them without a cycle. Pure (tested in links.test.ts).
 */
import { PERIMETER, runFinished, type PerimeterKind, type PerimeterRun } from '../perimeter';
import type { GameState } from '../state';
import type { DomeTier } from './tiers';

export type LinkKind = 'tunnel' | 'walkway';
export type LinkEndType = 'dome' | 'building' | 'yard';
export type DownWhy = 'collapse' | 'storm' | 'fire' | 'ram' | 'snow' | 'charge';

export interface LinkEnd {
  type: LinkEndType;
  /** The dome or building structure id, or the yard ring's run id. */
  id: string;
  /** Where the line leaves the end (the point in the open air outside a dome's link airlock), world units. */
  x: number; z: number;
  /** Dome ends only: the world angle (from +z toward +x) of the link airlock on the shell. */
  angle?: number;
}

/** A link that is out of service: collapsed, storm-wrecked, burned or rammed. `clearsAt` is the game time a contractor finishes (null: not ordered). */
export interface LinkDown { at: number; why: DownWhy; clearsAt: number | null; repairUsd: number }

export interface DomeLink {
  id: string;
  kind: LinkKind;
  ends: [LinkEnd, LinkEnd];
  /** The run (underground passage or covered walkway) that is the link's body. */
  runId: string;
  /** Walkways: the shell tier it is clad in, the stronger of the two domes' (its wall, ram, blast and weather ratings are that tier's). */
  shell?: DomeTier;
  /** What the link is worth (materials plus fit-out, US dollars): a repair is a share of it. Absent in a link ordered before it was saved: the fit-out. */
  valueUsd?: number;
  /** Tunnels: depth to the crown of the lining, feet. */
  depthFt?: number;
  lenFt: number;
  orderedAt: number;
  /** What the dome-side fit-out cost (airlock sleeves, lining, lights), US dollars: the repair price scales with it. */
  feeUsd: number;
  /** Weathering and wear, 0 (new) to 1. */
  wear: number;
  down?: LinkDown;
  /** A crew has dug into it, or found it: its sleeves are no secret. */
  revealed?: boolean;
}

export const linksOf = (s: Partial<Pick<GameState, 'domeLinks'>>): DomeLink[] => s.domeLinks ?? [];

export const linkRun = (s: Pick<GameState, 'perimeter'>, l: DomeLink): PerimeterRun | undefined => s.perimeter.find(r => r.id === l.runId);

export type LinkState = 'building' | 'open' | 'down';
export function linkState(s: Pick<GameState, 'perimeter'>, l: DomeLink): LinkState {
  if (l.down) return 'down';
  const r = linkRun(s, l);
  return r && runFinished(r) && !r.dropped ? 'open' : 'building';
}
export const linkOpen = (s: Pick<GameState, 'perimeter'>, l: DomeLink): boolean => linkState(s, l) === 'open';

/** How much of its work a link still does at this wear: never rises as wear rises (property test), and nothing while it is down. */
export function linkCapacity(wear: number, down: boolean): number {
  return down ? 0 : Math.max(0.25, 1 - Math.max(0, Math.min(1, wear)) * 0.75);
}
export const capacityOf = (s: Pick<GameState, 'perimeter'>, l: DomeLink): number => (linkState(s, l) === 'open' ? linkCapacity(l.wear, false) : 0);

/** Is the run of this kind one a link may own? (Used by the sim to keep the link's run out of the dig-target list as a plain wall.) */
export const isLinkRun = (s: Partial<Pick<GameState, 'domeLinks'>>, runId: string): boolean => linksOf(s).some(l => l.runId === runId);

/** The structure id at each end that is a dome, else null. */
export const domeEnds = (l: DomeLink): Array<string | null> => l.ends.map(e => (e.type === 'dome' ? e.id : null));

/** Groups of nodes (dome or building ids, yard run ids) joined by open links, optionally counting only one kind. Each node is in exactly one group. */
export function linkGroups(s: Pick<GameState, 'perimeter'> & Partial<Pick<GameState, 'domeLinks'>>, only?: LinkKind): string[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => { if (!parent.has(x)) parent.set(x, x); while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; } return x; };
  for (const l of linksOf(s)) {
    find(l.ends[0].id); find(l.ends[1].id);
    if (linkOpen(s, l) && (!only || l.kind === only)) parent.set(find(l.ends[0].id), find(l.ends[1].id));
  }
  const groups = new Map<string, string[]>();
  for (const k of [...parent.keys()]) { const root = find(k); groups.set(root, [...(groups.get(root) ?? []), k]); }
  return [...groups.values()];
}

/** The ids joined to `id` through open links (itself included). */
export function groupOf(s: Pick<GameState, 'perimeter'> & Partial<Pick<GameState, 'domeLinks'>>, id: string, only?: LinkKind): string[] {
  return linkGroups(s, only).find(g => g.includes(id)) ?? [id];
}

/** Open links that join two nodes (either way round). More than one means the pair has redundancy. */
export function linksBetween(s: Pick<GameState, 'perimeter'> & Partial<Pick<GameState, 'domeLinks'>>, a: string, b: string, openOnly = true): DomeLink[] {
  return linksOf(s).filter(l => ((l.ends[0].id === a && l.ends[1].id === b) || (l.ends[0].id === b && l.ends[1].id === a)) && (!openOnly || linkOpen(s, l)));
}

/** Can a person get from one node to another through open links alone? */
export const joined = (s: Pick<GameState, 'perimeter'> & Partial<Pick<GameState, 'domeLinks'>>, a: string, b: string): boolean => a === b || groupOf(s, a).includes(b);

/** Is this run the body of a tunnel link (hidden, underground)? */
export const isTunnelRun = (r: Pick<PerimeterRun, 'kind'>): boolean => r.kind === 'underground_passage';
export const runKindOf = (k: LinkKind, shell: DomeTier = 'glass'): PerimeterKind => (k === 'tunnel' ? 'underground_passage' : (`link_walk_${shell}` as PerimeterKind));
export const linkName = (k: LinkKind): string => (k === 'tunnel' ? 'underground tunnel' : 'above-ground walkway');
export const linkRunName = (k: LinkKind, shell?: DomeTier): string => PERIMETER[runKindOf(k, shell)].name;
