/**
 * The hardened service yard of a glass or arcology dome (owner decision of 2026-11-18): cooling-tower fans, chillers and the substation need open
 * air, so they stand outside the shell, but inside a walled yard of their own: a poured-concrete wall that is continuous on its outside (NO gate: owner
 * decision of 2026-11-18), a camera mast and a pad for a tower. The yard is reached only from INSIDE the dome: a service airlock on the inside of the shell,
 * a short sealed passage through the footing and the band (or ring beam) and an inner door on the yard side (`portal`). The yard is a closed ring in the
 * same wall model as the fences (`PerimeterRun` of `concrete_wall`, no gates), so the wall tier, guards and towers apply the way they do anywhere else
 * (`plantStrike.ts` reads it); a crew gets in only by breaching the wall or by forcing an airlock and walking the passage. It is built with the dome (its materials ride in the
 * dome's finish stage, `domeCost`) and laid into a raid copy of the state, never saved as a run of its own.
 *
 * Local frame: the dome's center at the origin; angles from +z toward +x; `rot` quarter turns like the airlocks. Pure (tested in plantUnits.test.ts).
 */
import type { DomeTier } from './tiers';
import { TIER } from './tiers';
import type { MaterialId } from '../materials';

/** Airlock angles (the same rule as standing.ts, kept here so the cost table does not import the world state). */
const airlockAngles = (n: number): number[] => Array.from({ length: n }, (_, i) => i * Math.PI * 2 / Math.max(1, n));
/** The plant machinery's scale with the dome (the cube-root rule of the drawing): a glass dome 0.6, the big arcology 1.5. */
export const plantSize = (r: number): number => Math.max(0.6, Math.min(1.5, r / 6));
/** Does a dome of this tier have a hardened yard outside (glass and arcology: the big domes with real heat rejection)? */
export const hasYard = (tier: DomeTier): boolean => tier === 'glass' || tier === 'arcology';

/** The wall kind of the yard (the same table as every other wall: `PERIMETER.concrete_wall`) and its drawn height, thickness. */
export const YARD_WALL = 'concrete_wall' as const;
export const YARD_H = 0.58, YARD_T = 0.08;
/** How far the yard's inner wall stands from the shell (world units): the armored band, or the ring beam, and a service strip. */
export const YARD_GAP = 0.35;
/** Where the passage meets the yard, as a share of the yard's width from its middle (the aisle in from the inner door runs clear of the equipment). */
export const PORTAL_U = 0.4;
/** Width of the sealed passage and of the service airlock (world units), the length of the airlock chamber inside the shell and its height. */
export const PORTAL_W = 0.4, CHAMBER_LEN = 0.5, PORTAL_H = 0.46;

export interface YardGeom {
  /** The angle from +z toward +x the yard sits at, and the shell radius. */
  phi: number; r: number;
  /** Width along the shell and depth out from it (world units). */
  W: number; D: number;
  /** Unit vectors (x, z): outward from the dome, and along the shell toward larger phi. */
  er: [number, number]; et: [number, number];
  /** Corner points of the wall ring, in run order (inner-left, inner-right, outer-right, outer-left), and the center of the yard. */
  corners: Array<[number, number]>; center: [number, number];
  /**
   * The only way in: a service airlock on the inside of the shell (`chamber`, its middle), the sealed passage (`from` the airlock's outer door on the shell
   * to `to` the inner door at the yard's inner wall), at arc offset `u` along the shell. `len` is the passage length; `w` its width.
   */
  portal: { u: number; w: number; len: number; chamber: [number, number]; from: [number, number]; to: [number, number] };
  /** Distance round the ring. */
  length: number;
  /** Where the camera mast stands and where a tower could (a pad outside the outer corner). */
  camera: [number, number]; towerSlot: [number, number];
  size: number;
}

/** Local point at `u` along the shell and `v` out from the yard's inner wall. */
export function yardPoint(g: Pick<YardGeom, 'phi' | 'r' | 'er' | 'et'>, u: number, v: number): [number, number] {
  const rho = g.r + YARD_GAP + v;
  return [Math.sin(g.phi) * rho + g.et[0] * u, Math.cos(g.phi) * rho + g.et[1] * u];
}

/** The yard of a dome of this tier and shell radius `r`, or null (no yard on a geodesic or earthen dome: the plant is packaged inside). */
export function yardGeometry(tier: DomeTier, r: number, rot = 0): YardGeom | null {
  if (!hasYard(tier)) return null;
  const n = Math.max(1, TIER[tier].airlocks), angles = airlockAngles(n), s = plantSize(r);
  const phi = (n > 1 ? (angles[0] + angles[1]) / 2 : Math.PI) + rot * Math.PI / 2;
  const span = n > 1 ? (angles[1] - angles[0]) * r : 2 * Math.PI * r;
  const W = Math.max(1.6, Math.min(5.4 * s, span - 2.8)), D = Math.max(1.2, 2.0 * s);
  const er: [number, number] = [Math.sin(phi), Math.cos(phi)], et: [number, number] = [Math.cos(phi), -Math.sin(phi)];
  const base = { phi, r, er, et };
  const P = (u: number, v: number): [number, number] => yardPoint(base, u, v);
  const corners: Array<[number, number]> = [P(-W / 2, 0), P(W / 2, 0), P(W / 2, D), P(-W / 2, D)];
  // the shell at arc offset u lies `sag` nearer the dome's center than the straight line of the yard's inner wall at the middle: the passage is that much longer
  const u = PORTAL_U * W, sag = r - Math.sqrt(Math.max(0, r * r - u * u)), vShell = -(YARD_GAP + sag);
  const portal = { u, w: PORTAL_W, len: YARD_GAP + sag + 0.12, chamber: P(u, vShell - 0.03 - CHAMBER_LEN / 2), from: P(u, vShell - 0.03 - CHAMBER_LEN), to: P(u, 0.12) };
  return {
    ...base, W, D, corners, center: P(0, D / 2), portal, length: 2 * (W + D),
    camera: P(W / 2 - 0.1, D - 0.1), towerSlot: P(W / 2 + 0.45, D + 0.45), size: s,
  };
}

/**
 * What the yard costs: the continuous concrete wall (rebar, concrete), the service airlock (`dome_airlock`), the sealed passage (concrete, rebar) with its
 * inner door (hardware) and the sleeves for the buried lines (cable, pipe), and the person-hours. Zero for a dome with no yard.
 */
export function yardBill(tier: DomeTier, r: number): { bill: Partial<Record<MaterialId, number>>; hours: number } {
  const y = yardGeometry(tier, r);
  if (!y) return { bill: {}, hours: 0 };
  const wall = y.length, pass = (y.portal.len + CHAMBER_LEN) * 2;   // (the passage is a poured box, about two wall lengths a unit)
  return {
    bill: { rebar: Math.ceil(3.4 * (wall + pass)), concrete: Math.ceil(9 * (wall + pass)), hardware: Math.ceil(0.3 * wall) + 8, dome_airlock: 1, cable: Math.ceil(6 * y.size), pipe: Math.ceil(5 * y.size) },
    hours: Math.round(44 * (wall + pass) / 3) + 60,
  };
}

/** How the yard is reached: only from inside the dome, whether the dome is open or sealed (the passage and its airlock are inside the shell). Never from outside. */
export const yardAccess = (): { fromInside: true; outsideGate: false } => ({ fromInside: true, outsideGate: false });

/** The closed ring of the yard as wall-run data: `PerimeterRun` minus the bookkeeping the caller adds. No gates: the wall is continuous. */
export function yardRunData(g: YardGeom, ox: number, oz: number): { pts: Array<[number, number]>; gates: Array<{ at: number; w: number }> } {
  const pts = [...g.corners, g.corners[0]].map(([x, z]) => [x + ox, z + oz] as [number, number]);
  return { pts, gates: [] };
}

/** Is the world point inside the yard's wall ring plus `pad` (for clearing the brush and trees round it)? */
export function inYard(g: YardGeom, ox: number, oz: number, x: number, z: number, pad = 0): boolean {
  const dx = x - ox - g.center[0], dz = z - oz - g.center[1], t = dx * g.et[0] + dz * g.et[1], v = dx * g.er[0] + dz * g.er[1];
  return Math.abs(t) <= g.W / 2 + pad && Math.abs(v) <= g.D / 2 + pad;
}

/** How deep the passage's sleeve is cast: into the footing, at the skirt's own depth (ft), so the skirt and tunnel rules cover it like the rest of the wall. */
export const passageDepthFt = (tier: DomeTier): number => TIER[tier].skirtFt;
