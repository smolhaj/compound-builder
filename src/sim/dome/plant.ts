/**
 * The machinery a dome with a living ecology needs, as a pure layout (the renderer, game/fx/DomePlant.ts, only draws it): an air-handling and scrubber house,
 * a chiller and cooling-tower yard, a water-recycling shed with tanks, a substation and battery block and the pipes and ducts through the wall, on the
 * ground just inside the shell between two airlocks; and on the structure roof vent hatches with louvers and exhaust stacks, and on the arcology's service
 * band a few rooftop units. How much of it there is depends on the dome's ecology (`Filtering`: none shows almost nothing, the closed ecology the full set) and
 * how big the dome is (the machinery grows with the cube root of its volume, which is its radius). Path lamps along the ways in from the airlocks.
 *
 * Local frame: the dome's center at the origin, +z toward the first airlock, angles from +z toward +x (the sim's). Heights are above the ground at the part.
 * Lengths in world units (SCALE v2: 1 unit = 20 ft, a person 0.28). Pure, deterministic, tested in plant.test.ts.
 */
import type { Filtering } from './air';
import type { DomeTier } from './tiers';
import { TIER } from './tiers';
import { airlockAngles } from './standing';

export type Shape = 'box' | 'cyl';
export interface PlantPart {
  shape: Shape;
  /** Plan position of the part's center (local), and its height above the ground at that spot. */
  x: number; z: number; y0: number;
  /** Box: w across, h up, d along; cylinder: radius r, height h. */
  w: number; h: number; d: number; r: number;
  /** Turn about the vertical (radians). */
  rot: number;
  color: number;
  /** Pitch of a cylinder lying on its side along its own x axis (a pipe or a duct): 0 standing, pi/2 lying along the part's local z. */
  lie?: boolean;
  /** On the shell: the polar angle from the crown (radians) the part sits at (y0 is then the height at the shell, measured from the shell's base). */
  onShell?: { theta: number; phi: number };
  /** Stands on the shell's base band, y0 above the base (not above the ground). */
  high?: boolean;
}
export interface PlantLamp { x: number; z: number; y: number }
export interface Plant { level: number; scale: number; parts: PlantPart[]; lamps: PlantLamp[]; yard: { phi: number; rho: number } | null }

export const LEVEL: Record<Filtering, number> = { none: 0, scrubber: 1, advanced: 2, closed: 3 };

/** The machinery's scale for a shell of radius `r` (world units): the cube root of the volume, which for a hemisphere is the radius. A glass dome (r 6) is 1. */
export const plantScale = (r: number): number => Math.max(0.6, Math.min(1.5, r / 6));

const C = { wall: 0xb9b4a6, roof: 0x6f7378, steel: 0x8d949b, dark: 0x3b4046, louver: 0x4d5258, tank: 0xd8e0e6, tankBlue: 0x4f86ad, conc: 0xa6a8a4, white: 0xe8e9e6, pipe: 0x9aa3ab, warm: 0xc79a4a, red: 0x9a3b32 };

const polar = (rho: number, phi: number): [number, number] => [Math.sin(phi) * rho, Math.cos(phi) * rho];

/** The plant of a dome of `tier` and shell radius `r` running `filtering`. */
export function plantLayout(tier: DomeTier, r: number, filtering: Filtering): Plant {
  const level = LEVEL[filtering], s = plantScale(r), parts: PlantPart[] = [];
  const n = Math.max(1, TIER[tier].airlocks), angles = tier === 'earthen' ? [0] : airlockAngles(n);
  const phi0 = n > 1 ? (angles[0] + angles[1]) / 2 : Math.PI;
  // glass: the yard stands just inside the wall, seen through the glass; the arcology's wall is an opaque armored band, so its service yard stands outside, against it
  const out = tier === 'arcology' ? -1 : 1;
  const rho = (v: number): number => r - out * (0.12 + v * s);
  // a part in the yard frame: u along the wall (units of s, positive toward larger phi), v in from the wall (units of s)
  const at = (u: number, v: number): { x: number; z: number; rot: number } => {
    const rr = rho(v), phi = phi0 + (u * s) / Math.max(1, rr), [x, z] = polar(rr, phi);
    return { x, z, rot: phi };
  };
  const box = (u: number, v: number, w: number, h: number, d: number, color: number, y0 = 0): void => { const p = at(u, v); parts.push({ shape: 'box', x: p.x, z: p.z, y0: y0 * s, w: w * s, h: h * s, d: d * s, r: 0, rot: p.rot, color }); };
  const cyl = (u: number, v: number, rad: number, h: number, color: number, y0 = 0): void => { const p = at(u, v); parts.push({ shape: 'cyl', x: p.x, z: p.z, y0: y0 * s, w: 0, h: h * s, d: 0, r: rad * s, rot: p.rot, color }); };
  // a pipe or duct lying radially (along the yard's v axis), from v0 to v1
  const pipe = (u: number, v0: number, v1: number, rad: number, y: number, color: number): void => {
    const p = at(u, (v0 + v1) / 2);
    parts.push({ shape: 'cyl', x: p.x, z: p.z, y0: y * s, w: 0, h: Math.abs(v1 - v0) * s, d: 0, r: rad * s, rot: p.rot, color, lie: true });
  };

  // ── on the ground ──
  // the plain dome: a transformer by the wall and one pipe stub through it, no more
  box(0, 0.35, 0.36, 0.42, 0.36, C.steel); cyl(0, 0.35, 0.05, 0.12, C.dark, 0.42);
  pipe(1.0, 0.0, 0.6, 0.05, 0.3, C.pipe);
  if (level >= 1) {
    // the air-handling and scrubber house: a long low house with louvers, two ducts through the wall, and a stack (two on the closed loop)
    box(-2.2, 0.8, 1.5, 0.62, 0.8, C.wall);
    box(-2.2, 0.8, 1.56, 0.06, 0.86, C.roof, 0.62);
    for (let i = 0; i < 3; i++) box(-2.9 + i * 0.5, 0.38, 0.3, 0.3, 0.03, C.louver, 0.18);
    const duct = Math.min(0.42, 0.6 / s);
    pipe(-2.55, 0.4, -0.1, 0.09, duct, C.steel); pipe(-1.85, 0.4, -0.1, 0.09, duct, C.steel);
    cyl(-2.7, 0.8, 0.07, 0.95, C.steel, 0.66); if (level >= 3) cyl(-1.7, 0.8, 0.07, 0.95, C.steel, 0.66);
    // the substation: its transformers, insulators and a fenced yard
    box(2.8, 0.7, 0.5, 0.5, 0.45, C.steel); cyl(2.8, 0.7, 0.05, 0.18, C.red, 0.5);
    box(3.5, 0.7, 0.5, 0.5, 0.45, C.steel); cyl(3.5, 0.7, 0.05, 0.18, C.red, 0.5);
  }
  if (level >= 2) {
    // the chiller and cooling-tower yard: a pad, chillers with fan tops, a cooling tower, the pipes between
    box(0.4, 1.0, 2.5, 0.04, 1.4, C.conc);
    box(-0.3, 0.9, 0.9, 0.42, 0.5, C.white, 0.04); cyl(-0.3, 0.9, 0.17, 0.05, C.dark, 0.46);
    if (level >= 3) { box(0.7, 0.9, 0.9, 0.42, 0.5, C.white, 0.04); cyl(0.7, 0.9, 0.17, 0.05, C.dark, 0.46); }
    box(1.45, 1.05, 0.7, 0.78, 0.7, C.tank, 0.04); cyl(1.45, 1.05, 0.26, 0.07, C.dark, 0.82);
    pipe(0.2, 0.5, 1.1, 0.05, 0.3, C.pipe); pipe(1.45, 0.4, 0.8, 0.07, 0.25, C.pipe);
    // the water-recycling shed with its tanks and the manifold
    box(-5.8, 0.9, 1.2, 0.5, 0.65, C.wall); box(-5.8, 0.9, 1.26, 0.05, 0.7, C.roof, 0.5);
    const tanks = level >= 3 ? 4 : 2;
    for (let i = 0; i < tanks; i++) cyl(-4.9 + i * 0.55, 1.1 + (i % 2) * 0.15, 0.22, 0.6, i % 2 ? C.tankBlue : C.tank);
    pipe(-4.4, 0.5, 1.05, 0.04, 0.2, C.pipe);
  }
  if (level >= 3) {
    // the battery block: a row of white containers on a pad, fenced, with the transformer lines to the substation
    box(4.7, 1.0, 2.1, 0.03, 0.8, C.conc);
    for (let i = 0; i < 4; i++) box(3.95 + i * 0.5, 1.0, 0.42, 0.4, 0.62, C.white, 0.03);
    for (let i = 0; i < 6; i++) cyl(3.7 + i * 0.4, 1.55, 0.012, 0.28, C.dark);
  }
  // through the wall: one flanged pipe per level
  for (let i = 0; i < level; i++) { pipe(-0.9 + i * 0.4, 0.1, -0.16, 0.06, Math.min(0.55 + 0.12 * i, 0.62 / s), C.steel); }

  // ── on the structure ──
  const phis = (k: number, off: number): number[] => Array.from({ length: k }, (_, i) => off + i * Math.PI * 2 / k);
  const hatches = level === 0 ? 1 : 2 + level;
  const theta = 0.3 + 0.0 * s;
  for (const [i, phi] of phis(hatches, 0.5).entries()) {
    const [x, z] = polar(r * Math.sin(theta), phi);
    parts.push({ shape: 'box', x, z, y0: r * Math.cos(theta), w: 0.5 * s * 0.8, h: 0.1 * s, d: 0.5 * s * 0.8, r: 0, rot: phi, color: C.steel, onShell: { theta, phi } });
    parts.push({ shape: 'box', x, z, y0: r * Math.cos(theta), w: 0.5 * s * 0.8, h: 0.03 * s, d: 0.36 * s, r: 0, rot: phi, color: C.louver, onShell: { theta, phi } });
    if (level >= 1 && i % 2 === 0) parts.push({ shape: 'cyl', x, z, y0: r * Math.cos(theta), w: 0, h: 0.55 * s, d: 0, r: 0.045 * s, rot: phi, color: C.steel, onShell: { theta, phi } });
  }
  // the arcology's service band carries a few rooftop units
  if (tier === 'arcology' && level >= 2) {
    for (const phi of phis(level === 3 ? 6 : 3, 0.26)) {
      const [x, z] = polar(r + 0.12, phi);
      parts.push({ shape: 'box', x, z, y0: 0.82, w: 0.5 * s * 0.6, h: 0.3 * s * 0.6, d: 0.4 * s * 0.6, r: 0, rot: phi, color: C.white, high: true });
      parts.push({ shape: 'cyl', x, z, y0: 0.82 + 0.3 * s * 0.6, w: 0, h: 0.04 * s, d: 0, r: 0.12 * s * 0.6, rot: phi, color: C.dark, high: true });
    }
  }

  // ── path lamps: along the ways in from each airlock, both sides, warm heads (the renderer lights them with the night) ──
  const lamps: PlantLamp[] = [], step = 1.15;
  for (const a of angles) {
    for (let d = r * 0.9, k = 0; d > r * 0.32 && lamps.length < 90; d -= step, k++) {
      const side = k % 2 ? 1 : -1, [x, z] = polar(d, a), off = 0.42 * side;
      lamps.push({ x: x + Math.cos(a) * off, z: z - Math.sin(a) * off, y: 0.6 });
    }
  }
  if (level >= 1) { const p = at(0, 2.1); lamps.push({ x: p.x, z: p.z, y: 0.6 }); for (const u of [-3.4, 3.6]) { const q = at(u, 2.0); lamps.push({ x: q.x, z: q.z, y: 0.6 }); } }
  return { level, scale: s, parts, lamps, yard: tier === 'earthen' ? null : { phi: phi0, rho: r } };
}
