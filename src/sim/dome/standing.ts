/**
 * The domes that stand on the place, as the rest of the sim sees them: where the shell is, where its airlocks are, how many panels are down.
 * One reader (`domesOf`) for the tunneler, the tunnel-crossing rule, the raid shell and the visibility readout, so the geometry of a dome is
 * written once. Pure (tested in siege.test.ts); a dome is a structure of a dome kind, so nothing here is saved.
 */
import { vestibuleOf } from './vestibule';
import { DEFAULT_BEARING, choosePortAngle, hasVehiclePort, portVestibule } from './vehiclePort';
import { CELL_FT, TIER, cellsOfKind, shellFt, tierOfKind, type DomeTier } from './tiers';
import { isFinished } from '../construction';
import type { GameState, Structure } from '../state';

/** Feet in a world unit (SCALE v2: a unit is 20 ft; a build cell is half a unit). */
export const FT_PER_UNIT = 2 * CELL_FT;
const TAU = Math.PI * 2;

/** Airlock angles (radians from +z toward +x, before the structure's own quarter turns): evenly spread, the first at the front. */
export function airlockAngles(n: number): number[] { return Array.from({ length: n }, (_, i) => i * TAU / Math.max(1, n)); }

/** The airlock vestibule: width of the door (world units) and how far the chamber runs in from the shell, by tier (the room itself is in vestibule.ts). */
export const VESTIBULE: Record<DomeTier, { w: number; len: number }> = { earthen: { w: 0.24, len: 0.2 }, geodesic: { w: 0.42, len: 0.5 }, glass: { w: 0.55, len: 0.7 }, arcology: { w: 1.1, len: 1.4 } };

export interface Airlock {
  index: number;
  /** World angle from +z toward +x. */
  angle: number;
  /** The outer door, on the shell. */
  x: number; z: number;
  /** A point in the open air just outside the door, and the inner door (the chamber's far end). */
  outX: number; outZ: number; inX: number; inZ: number;
  /** Outside width of the chamber, and the width of each door's opening (world units). */
  w: number; dw: number;
  /** `link`: a dedicated airlock for a tunnel or walkway to another dome (sim/dome/links.ts), separate from the person airlocks; absent: a person airlock. */
  role?: 'link' | 'vehicle';
  /** The link this airlock serves (role `link`). */
  linkId?: string;
}

export interface Dome {
  id: string;
  tier: DomeTier;
  /** Centre, world units. */
  x: number; z: number;
  /** Radius of the shell (units) and of the footprint, shell plus berm. */
  r: number; footR: number;
  airlocks: Airlock[];
  /** 0.2 to 1: the share of the shell's panels still whole (open panel damage lowers it). */
  health: number;
  /** The structure it is. */
  structure: Structure;
}

/** Panels in each tier's shell (a triangulated or gridded skin): what one lost panel is worth of the shell's health. */
export const PANELS: Record<DomeTier, number> = { earthen: 1, geodesic: 150, glass: 288, arcology: 864 };

/** One airlock at a world angle on a shell of radius `r` centered at (x, z). */
export function airlockAt(tier: DomeTier, x: number, z: number, r: number, angle: number, index: number): Airlock {
  const v = vestibuleOf(tier, r), s = Math.sin(angle), c = Math.cos(angle);
  return { index, angle, x: x + s * r, z: z + c * r, outX: x + s * (r + 0.45), outZ: z + c * (r + 0.45), inX: x + s * (r - v.len), inZ: z + c * (r - v.len), w: v.w, dw: v.dw };
}

/** The airlocks of a dome of this tier at (x, z) turned `rot` quarter turns. */
export function airlocksOf(tier: DomeTier, x: number, z: number, r: number, rot = 0): Airlock[] {
  const angles = tier === 'earthen' ? [0] : airlockAngles(TIER[tier].airlocks);
  return angles.map((a0, index) => airlockAt(tier, x, z, r, a0 + rot * Math.PI / 2, index));
}

/**
 * The vehicle sally port of a dome (sim/dome/vehiclePort.ts): a larger airlock, role `vehicle`, at the angle stamped when the dome was staked (`Structure.portAngle`),
 * else the free angle nearest the east (a dome staked before the port existed). Null for the earthen dome (a low door only).
 */
export function vehicleAirlockOf(tier: DomeTier, st: Pick<Structure, 'x' | 'z' | 'rot' | 'portAngle'>, r: number, person: readonly Airlock[], links: readonly Airlock[], index: number): Airlock | null {
  const v = portVestibule(tier, r);
  if (!v || !hasVehiclePort(tier)) return null;
  const angle = st.portAngle ?? choosePortAngle({ tier, r, rot: st.rot, links: links.map(a => a.angle) }, DEFAULT_BEARING).angle;
  const s = Math.sin(angle), c = Math.cos(angle);
  void person;
  return { index, angle, x: st.x + s * r, z: st.z + c * r, outX: st.x + s * (r + 0.45), outZ: st.z + c * (r + 0.45), inX: st.x + s * (r - v.len), inZ: st.z + c * (r - v.len), w: v.w, dw: v.dw, role: 'vehicle' };
}

/** The link airlocks a dome carries (one per link end that meets it), from the saved links (`GameState.domeLinks`). */
export function linkAirlocksOf(s: Partial<Pick<GameState, 'domeLinks'>>, tier: DomeTier, st: Pick<Structure, 'id' | 'x' | 'z'>, r: number, first: number): Airlock[] {
  const out: Airlock[] = [];
  for (const l of s.domeLinks ?? []) for (const e of l.ends) if (e.type === 'dome' && e.id === st.id && e.angle !== undefined) out.push({ ...airlockAt(tier, st.x, st.z, r, e.angle, first + out.length), role: 'link', linkId: l.id });
  return out;
}

/** Share of the panels whole, from the panels the family has not yet replaced on this dome (the open 'panel' jobs of sim/raidDamage.ts). */
export function shellHealth(tier: DomeTier, panelsDown: number): number { return Math.max(0.2, Math.min(1, 1 - panelsDown / PANELS[tier])); }

/** One dome, from its structure (null when the kind is not a dome). */
export function domeFrom(st: Structure, panelsDown = 0, links: Partial<Pick<GameState, 'domeLinks'>> = {}): Dome | null {
  const tier = tierOfKind(st.kind);
  if (!tier) return null;
  const cells = cellsOfKind(st.kind) ?? TIER[tier].cells, r = shellFt(tier, cells) / 2 / FT_PER_UNIT - 0.03;
  const person = airlocksOf(tier, st.x, st.z, r, st.rot);
  const linkLocks = linkAirlocksOf(links, tier, st, r, person.length), veh = vehicleAirlockOf(tier, st, r, person, linkLocks, person.length + linkLocks.length);
  return { id: st.id, tier, x: st.x, z: st.z, r, footR: cells * CELL_FT / 2 / FT_PER_UNIT, airlocks: [...person, ...linkLocks, ...(veh ? [veh] : [])], health: shellHealth(tier, panelsDown), structure: st };
}

/** Every finished dome on the place. `staked` (default false) also returns the ones still going up. */
export function domesOf(s: Pick<GameState, 'structures'> & Partial<Pick<GameState, 'raidDamage' | 'domeLinks'>>, staked = false): Dome[] {
  const down = new Map<string, number>();
  for (const d of s.raidDamage ?? []) if (d.kind === 'panel' && d.structure && d.done < d.hours) down.set(d.structure, (down.get(d.structure) ?? 0) + (d.panels ?? 1));
  const out: Dome[] = [];
  for (const st of s.structures) { if (!staked && !isFinished(st)) continue; const d = domeFrom(st, down.get(st.id) ?? 0, s); if (d) out.push(d); }
  return out;
}

/** The dome whose shell a point is under (inside the shell circle), or null. */
export function domeAt(domes: readonly Dome[], x: number, z: number): Dome | null {
  return domes.find(d => Math.hypot(x - d.x, z - d.z) < d.r) ?? null;
}
export const insideDome = (domes: readonly Dome[], x: number, z: number): boolean => domeAt(domes, x, z) !== null;
