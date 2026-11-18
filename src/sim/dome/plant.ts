/**
 * The machinery a dome with a living ecology needs, as a pure layout (the renderer, game/fx/DomePlant.ts, only draws it). Owner decision of 2026-11-18:
 * everything that does not need open air stands INSIDE the protective shell, and what does need it stands in a hardened yard that is reached only from inside.
 *
 *   glass dome     the plant yard just inside the wall, in two spans between the airlocks: the air-handling and scrubber house (and a spare), the control room;
 *                  the water-recycling shed with its tanks, the pump house and the battery block. Chillers, the cooling tower and the substation stand
 *                  outside in the walled yard (plantYard.ts): a continuous concrete wall, no gate, a camera mast and a pad for a tower.
 *   arcology       the same set built into the thickness of the armored band as a service gallery (machinery bays, an access door for each from inside, armored
 *                  louvers and intake slots in the band's outer face). Only the hardened yard stands outside, against the band.
 *   geodesic       the plant is packaged under the berm (nothing is drawn: the dome is small).
 *
 * The yard is entered from inside: a service airlock on the inside of the shell (in the span of the first plant), a short sealed passage through the footing and
 * the band, and an inner door in the yard's inner wall (`yard.portal`). What exists depends on the ecology (`Filtering`), the water loop and the spares bought
 * (plantUnits.ts); how big it is on the dome's radius. Pipes and cables between the yard, the plant bays and the compound are `lines`: buried (drawn in the
 * underground view), crossing the footing only in sealed sleeves at the yard; the passage is drawn there too.
 *
 * Real-equipment cues (a realism pass): air-cooled chillers with coil fins, fan grilles and a disconnect; a cooling tower with fill louvers, a drift plume, a
 * ladder and a platform; a transformer with radiator fins, a conservator, ribbed bushings, a bus gantry on insulator strings, a fence line and bollards; slabs
 * with curbs; louvered doors, hoods, nameplates, conduit and pipe runs, and a little weathering (every part's color is jittered by its own place).
 *
 * Local frame: the dome's center at the origin, +z toward the first airlock, angles from +z toward +x (the sim's), `rot` quarter turns like the airlocks. Heights are above
 * the ground at the part. Lengths in world units (SCALE v2: 1 unit = 20 ft, a person 0.28). Pure, deterministic, tested in plant.test.ts.
 */
import type { Filtering } from './air';
import type { DomeTier } from './tiers';
import { TIER } from './tiers';
import type { WaterLoop } from './waterLoop';
import type { PlantKind, PlantPlace } from './plantUnits';
import { CHAMBER_LEN, PORTAL_H, PORTAL_W, plantSize, yardGeometry, yardPoint, YARD_GAP, YARD_H, YARD_T, type YardGeom } from './plantYard';

export type Shape = 'box' | 'cyl';
export interface PlantPart {
  shape: Shape;
  /** Plan position of the part's center (local), and its height above the ground at that spot. */
  x: number; z: number; y0: number;
  /** Box: w across, h up, d along; cylinder: radius r, height h. */
  w: number; h: number; d: number; r: number;
  /** A cylinder's top radius when it tapers (a stack, a bushing, a plume); default r. */
  r2?: number;
  /** Turn about the vertical (radians). */
  rot: number;
  color: number;
  /** Pitch of a cylinder lying on its side along its own x axis (a pipe or a duct): 0 standing, pi/2 lying along the part's local z. */
  lie?: boolean;
  /** On the shell: the polar angle from the crown (radians) the part sits at (y0 is then the height at the shell, measured from the shell's base). */
  onShell?: { theta: number; phi: number };
  /** Stands on the shell's base band, y0 above the base (not above the ground). */
  high?: boolean;
  /** The plant unit it belongs to (`chiller`, `chiller2`, `air`...): a damaged unit is drawn burned. */
  unit?: string;
  /** Part of the sealed passage (drawn in the cutaway and underground views). */
  passage?: boolean;
}
export interface PlantLamp { x: number; z: number; y: number }
/** A buried line: its kind, depth below the ground (world units) and the plan points. The passage is a fat teal tube. */
export interface PlantLine { kind: 'power' | 'chill' | 'water' | 'feeder' | 'passage'; depth: number; pts: Array<[number, number]> }
export interface PlantUnitSpot { id: string; kind: PlantKind; place: PlantPlace; x: number; z: number }
export interface Plant {
  level: number; scale: number; parts: PlantPart[]; lamps: PlantLamp[]; lines: PlantLine[]; units: PlantUnitSpot[];
  /** The hardened yard (glass and arcology), with its camera mast, tower slot and portal, or null. */
  yard: YardGeom | null;
  /** The span angles (radians) the inside plant stands at, for the tests and the shots. */
  spans: number[];
}

export const LEVEL: Record<Filtering, number> = { none: 0, scrubber: 1, advanced: 2, closed: 3 };

/** Re-exported: the machinery's scale for a shell of radius `r` (world units). A glass dome (r 6) is 1. */
export { plantSize as plantScale };

const C = {
  wall: 0xb9b4a6, roof: 0x6f7378, steel: 0x8d949b, dark: 0x3b4046, louver: 0x4d5258, tank: 0xd8e0e6, tankBlue: 0x4f86ad, conc: 0xa6a8a4, concDark: 0x8f918d, cap: 0xc4c5c0,
  white: 0xe8e9e6, pipe: 0x9aa3ab, warm: 0xc79a4a, red: 0x9a3b32, armor: 0x7b8087, teal: 0x5f9c97, grille: 0x25282b, coil: 0x6d7479, skid: 0x6a4f3f, xfmr: 0x5d7566, porc: 0xb98a63,
  yellow: 0xd2a82a, glass: 0x2d3a44, tower: 0xcfd6da, plume: 0xe9eef0, copper: 0xb0734a, hazard: 0xd8b02a, valve: 0xa23a2e, gate: 0x4b5257,
};
/** Accent of each bay's door in the service gallery. */
const BAY: Record<string, number> = { air: C.teal, water: C.tankBlue, battery: C.warm, control: C.steel, pumps: C.pipe };

const polar = (rho: number, phi: number): [number, number] => [Math.sin(phi) * rho, Math.cos(phi) * rho];

/** A little weathering: the color nudged darker or lighter by a hash of where the part stands (deterministic). */
function weather(color: number, x: number, z: number, amt = 0.08): number {
  const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453, f = (h - Math.floor(h)) * 2 - 1, k = 1 + f * amt;
  const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 255) * k))), g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 255) * k))), b = Math.max(0, Math.min(255, Math.round((color & 255) * k)));
  return (r << 16) | (g << 8) | b;
}

export interface PlantOpts { loop?: WaterLoop; spares?: readonly PlantKind[]; rot?: number }

/** A frame: a point on the ground and a turn; `dx` runs along the shell (tangent), `dz` outward from the dome. */
interface Fr { x: number; z: number; rot: number }
const loc = (f: Fr, dx: number, dz: number): [number, number] => [f.x + dx * Math.cos(f.rot) + dz * Math.sin(f.rot), f.z - dx * Math.sin(f.rot) + dz * Math.cos(f.rot)];

/** The plant of a dome of `tier` and shell radius `r` running `filtering`. */
export function plantLayout(tier: DomeTier, r: number, filtering: Filtering, o: PlantOpts = {}): Plant {
  const level = LEVEL[filtering], s = plantSize(r), parts: PlantPart[] = [], lines: PlantLine[] = [];
  const loop = o.loop ?? 'none', spares = o.spares ?? [], rot = o.rot ?? 0;
  const n = Math.max(1, TIER[tier].airlocks), tau = Math.PI * 2, step = tau / n;
  const angles = tier === 'earthen' ? [0] : Array.from({ length: n }, (_, i) => i * step + rot * Math.PI / 2);
  const spanMid = (i: number): number => angles[i % n] + step / 2;
  const spans = n > 1 ? [spanMid(0), spanMid(1)] : [Math.PI + rot * Math.PI / 2];
  const hasAir = level >= 1, hasWater = loop !== 'none', hasBank = level >= 3;
  const yard = yardGeometry(tier, r, rot);
  const spare = (k: PlantKind): boolean => spares.includes(k);
  const push = (p: PlantPart): void => { parts.push(p.onShell || p.high ? p : { ...p, color: weather(p.color, p.x, p.z) }); };

  // ── frame helpers ──
  const B = (f: Fr, dx: number, dz: number, w: number, h: number, d: number, color: number, y0 = 0, unit?: string, yaw = 0, extra: Partial<PlantPart> = {}): void => {
    const [x, z] = loc(f, dx, dz); push({ shape: 'box', x, z, y0, w, h, d, r: 0, rot: f.rot + yaw, color, ...(unit ? { unit } : {}), ...extra });
  };
  const Cy = (f: Fr, dx: number, dz: number, rad: number, h: number, color: number, y0 = 0, unit?: string, r2?: number): void => {
    const [x, z] = loc(f, dx, dz); push({ shape: 'cyl', x, z, y0, w: 0, h, d: 0, r: rad, ...(r2 !== undefined ? { r2 } : {}), rot: f.rot, color, ...(unit ? { unit } : {}) });
  };
  /** A cylinder lying along the tangent (`t`) or the radial (`r`) direction, its axis at height y0. */
  const Ly = (f: Fr, dx: number, dz: number, rad: number, len: number, color: number, y0: number, along: 't' | 'r' = 't', unit?: string): void => {
    const [x, z] = loc(f, dx, dz); push({ shape: 'cyl', x, z, y0, w: 0, h: len, d: 0, r: rad, rot: f.rot + (along === 't' ? Math.PI / 2 : 0), color, lie: true, ...(unit ? { unit } : {}) });
  };
  /** A round fan grille: a dark disk, a guard ring, two crossbars and a hub, at height y0 on the top of a unit. */
  const fan = (f: Fr, dx: number, dz: number, rad: number, y0: number, unit?: string): void => {
    Cy(f, dx, dz, rad, 0.012, C.grille, y0, unit);
    Cy(f, dx, dz, rad * 1.04, 0.02, C.coil, y0 - 0.008, unit);
    B(f, dx, dz, rad * 1.9, 0.01, 0.014, C.pipe, y0 + 0.012, unit); B(f, dx, dz, 0.014, 0.01, rad * 1.9, C.pipe, y0 + 0.012, unit);
    Cy(f, dx, dz, rad * 0.2, 0.025, C.steel, y0 + 0.008, unit);
  };
  /** Louvers: `count` thin slats stacked across a face, each its own thin box. */
  const slatsH = (f: Fr, dx: number, dz: number, w: number, h: number, count: number, color: number, y0: number, unit?: string, d = 0.016): void => {
    for (let i = 0; i < count; i++) B(f, dx, dz, w, h / count * 0.5, d, color, y0 + (i + 0.5) * h / count, unit);
  };
  const plate = (f: Fr, dx: number, dz: number, y0: number, unit?: string, w = 0.07): void => B(f, dx, dz, w, w * 0.5, 0.008, C.white, y0, unit);   // a nameplate
  const bollard = (f: Fr, dx: number, dz: number): void => { Cy(f, dx, dz, 0.022, 0.15, C.yellow, 0); Cy(f, dx, dz, 0.026, 0.02, C.hazard, 0.13); };
  const note = new Map<string, { x: number; z: number }>();
  const noteUnit = (id: string, x: number, z: number): void => { if (!note.has(id)) note.set(id, { x, z }); };

  // ── the inside plant: spans between the airlocks, sequential with a fit factor so nothing reaches an airlock ──
  const inRho = (v: number): number => r - (tier === 'arcology' ? 0.03 : 0.12) - v;
  const spot = (span: number, a: number, v: number): Fr => { const rho = inRho(v), phi = span + a / Math.max(1, rho), [x, z] = polar(rho, phi); return { x, z, rot: phi }; };
  /** An inside item sits on frame `spot(span, a, 0)` (the wall line); its depth `v` inward is -dz. */
  const avail = (): number => Math.max(1.2, step * inRho(0.5) - 2.4);
  // the first span carries the service airlock: the items keep to the side away from it (`a1` is where they must stop)
  const aPortal = yard ? yard.portal.u : null;
  const region = (idx: 0 | 1): { a0: number; a1: number } => {
    const half = avail() / 2;
    return idx === 0 && aPortal !== null ? { a0: -half, a1: Math.min(half, aPortal - 0.62) } : { a0: -half, a1: half };
  };

  interface Item { id: string; w: number; draw: (span: number, a: number, f: number) => void; bay?: string; unit?: string }
  const airHouse = (unit: string): Item => ({ id: unit, unit, bay: 'air', w: 1.5 * s, draw: (sp, a, f) => {
    const F = spot(sp, a, 0), ww = 1.5 * s * f;
    B(F, 0, -0.8 * s, ww + 0.06, 0.03 * s, 0.86 * s, C.concDark, 0, unit);                      // curbed pad
    B(F, 0, -0.8 * s, ww, 0.62 * s, 0.8 * s, C.wall, 0.03 * s, unit);                             // the house
    B(F, 0, -0.8 * s, ww + 0.06 * s, 0.05 * s, 0.86 * s, C.roof, 0.65 * s, unit);                  // roof
    for (let i = -1; i <= 1; i++) B(F, i * ww * 0.3, -0.8 * s, 0.02, 0.025 * s, 0.84 * s, C.dark, 0.7 * s, unit);   // standing seams
    // louvered double doors on the dome-facing side, with handles, a hood and a nameplate
    const dz = -1.2 * s;   // the interior face
    slatsH(F, -0.3 * ww, dz, 0.4 * ww, 0.42 * s, 7, C.louver, 0.1 * s, unit); slatsH(F, 0.3 * ww, dz, 0.4 * ww, 0.42 * s, 7, C.louver, 0.1 * s, unit);
    B(F, 0, dz, 0.012, 0.46 * s, 0.02, C.dark, 0.08 * s, unit); B(F, 0, dz - 0.012, 0.05, 0.03, 0.02, C.steel, 0.3 * s, unit);
    B(F, 0, dz - 0.03, 0.9 * ww, 0.025 * s, 0.05, C.roof, 0.56 * s, unit);
    plate(F, 0.42 * ww, dz - 0.01, 0.4 * s, unit);
    // the rooftop ventilator, the exhaust stack with a rain cap, and the duct to the wall
    Cy(F, 0.15 * ww, -0.7 * s, 0.06 * s, 0.07 * s, C.steel, 0.7 * s, unit); Cy(F, 0.15 * ww, -0.7 * s, 0.085 * s, 0.015, C.dark, 0.77 * s, unit);
    Cy(F, -0.32 * ww, -0.8 * s, 0.07 * s, 0.95 * s, C.steel, 0.7 * s, unit); Cy(F, -0.32 * ww, -0.8 * s, 0.1 * s, 0.02, C.dark, 0.7 * s + 0.95 * s, unit);
    if (level >= 3) { Cy(F, 0.32 * ww, -0.8 * s, 0.07 * s, 0.95 * s, C.steel, 0.7 * s, unit); Cy(F, 0.32 * ww, -0.8 * s, 0.1 * s, 0.02, C.dark, 0.7 * s + 0.95 * s, unit); }
    Ly(F, 0.1 * ww, -0.42 * s, 0.05 * s, 0.5 * s, C.steel, 0.5 * s, 'r', unit);
    B(F, -0.58 * ww, -1.28 * s, 0.1, 0.06 * s, 0.1, C.steel, 0, unit);                            // a step
  } });
  const control: Item = { id: 'control', bay: 'control', w: 0.9 * s, draw: (sp, a, f) => {
    const F = spot(sp, a, 0), ww = 0.9 * s * f;
    B(F, 0, -0.7 * s, ww + 0.04, 0.03 * s, 0.66 * s, C.concDark, 0);
    B(F, 0, -0.7 * s, ww, 0.55 * s, 0.6 * s, C.wall, 0.03 * s); B(F, 0, -0.7 * s, ww + 0.05 * s, 0.05 * s, 0.66 * s, C.roof, 0.58 * s);
    const dz = -1.0 * s;
    B(F, -0.18 * ww, dz - 0.002, 0.42 * ww, 0.16 * s, 0.014, C.glass, 0.28 * s); B(F, -0.18 * ww, dz - 0.006, 0.02, 0.16 * s, 0.01, C.steel, 0.28 * s); B(F, -0.18 * ww, dz - 0.006, 0.42 * ww, 0.014, 0.01, C.steel, 0.35 * s);   // window and mullions
    B(F, 0.3 * ww, dz, 0.16 * ww, 0.34 * s, 0.02, C.dark, 0.03 * s); B(F, 0.36 * ww, dz - 0.012, 0.02, 0.03, 0.012, C.steel, 0.2 * s);   // door and handle
    B(F, 0.5 * ww + 0.01, -0.7 * s, 0.05, 0.12 * s, 0.14 * s, C.white, 0.2 * s); fan(F, 0.5 * ww + 0.04, -0.7 * s, 0.035 * s, 0.32 * s);   // a wall air conditioner
    Cy(F, -0.35 * ww, -0.85 * s, 0.006, 0.4 * s, C.steel, 0.63 * s); B(F, -0.35 * ww, -0.85 * s, 0.1, 0.006, 0.006, C.steel, 0.9 * s);        // a mast and antenna
    Ly(F, 0.2 * ww, dz - 0.02, 0.008, 0.3 * s, C.dark, 0.1 * s, 'r');                                                                              // conduit
  } };
  const pumps: Item = { id: 'pumps', bay: 'pumps', w: 0.8 * s, unit: hasWater ? 'water' : undefined, draw: (sp, a, f) => {
    const F = spot(sp, a, 0), u = hasWater ? 'water' : undefined, ww = 0.8 * s * f;
    B(F, 0, -0.7 * s, ww + 0.04, 0.03 * s, 0.6 * s, C.concDark, 0, u);
    B(F, 0, -0.7 * s, ww, 0.4 * s, 0.55 * s, C.wall, 0.03 * s, u); B(F, 0, -0.7 * s, ww + 0.05 * s, 0.04 * s, 0.6 * s, C.roof, 0.43 * s, u);
    B(F, -0.2 * ww, -0.975 * s, 0.3 * ww, 0.3 * s, 0.014, C.dark, 0.05 * s, u); slatsH(F, 0.25 * ww, -0.975 * s, 0.3 * ww, 0.24 * s, 5, C.louver, 0.08 * s, u);
    Cy(F, 0.2 * ww, -0.9 * s, 0.045 * s, 0.14 * s, C.tankBlue, 0.43 * s, u); plate(F, -0.4 * ww, -0.975 * s, 0.3 * s, u, 0.05);
  } };
  const waterShed: Item = { id: 'water', unit: 'water', bay: 'water', w: (1.2 + (hasBank ? 2.2 : 1.1)) * s, draw: (sp, a, f) => {
    const u = 'water', w0 = -(hasBank ? 1.1 : 0.55) * s * f, F = spot(sp, a, 0), sw = 1.2 * s * f;
    B(F, w0, -0.9 * s, sw + 0.04, 0.03 * s, 0.7 * s, C.concDark, 0, u);
    B(F, w0, -0.9 * s, sw, 0.5 * s, 0.65 * s, C.wall, 0.03 * s, u); B(F, w0, -0.9 * s, sw + 0.05 * s, 0.05 * s, 0.7 * s, C.roof, 0.53 * s, u);
    Cy(F, w0 + 0.3 * sw, -0.9 * s, 0.045 * s, 0.07 * s, C.steel, 0.58 * s, u); Cy(F, w0 + 0.3 * sw, -0.9 * s, 0.065 * s, 0.012, C.dark, 0.65 * s, u);   // a roof vent
    B(F, w0 - 0.15 * sw, -1.225 * s, 0.3 * sw, 0.34 * s, 0.014, C.dark, 0.05 * s, u); slatsH(F, w0 + 0.22 * sw, -1.225 * s, 0.32 * sw, 0.3 * s, 5, C.louver, 0.07 * s, u); plate(F, w0 + 0.42 * sw, -1.225 * s, 0.32 * s, u);
    const tanks = hasBank ? 4 : 2;
    for (let i = 0; i < tanks; i++) {
      const tx = w0 + (0.6 + 0.1 + i * 0.55 + 0.6) * s * f, tz = -(1.0 + (i % 2) * 0.15) * s, col = i % 2 ? C.tankBlue : C.tank, rr = 0.22 * s * f;
      Cy(F, tx, tz, rr, 0.6 * s, col, 0, u);
      for (const hh of [0.15, 0.3, 0.45]) Cy(F, tx, tz, rr * 1.03, 0.014, C.coil, hh * s, u);          // hoop bands
      Cy(F, tx, tz, 0.05 * s, 0.03 * s, C.steel, 0.6 * s, u); Cy(F, tx + rr * 0.9, tz, 0.008, 0.45 * s, C.pipe, 0.08 * s, u);   // manway and a level gauge
    }
    // the manifold with valve handwheels
    Ly(F, w0 + 0.9 * s * f, -0.5 * s, 0.018 * s, 1.4 * s * f, C.pipe, 0.2 * s, 't', u);
    for (let i = 0; i < 3; i++) { Cy(F, w0 + (0.5 + i * 0.5) * s * f, -0.5 * s, 0.03 * s, 0.012, C.valve, 0.25 * s, u); Cy(F, w0 + (0.5 + i * 0.5) * s * f, -0.5 * s, 0.008, 0.05 * s, C.steel, 0.2 * s, u); }
  } };
  const battery: Item = { id: 'battery', unit: 'battery', bay: 'battery', w: 2.1 * s, draw: (sp, a, f) => {
    const u = 'battery', F = spot(sp, a, 0), ww = 2.1 * s * f;
    B(F, 0, -1.0 * s, ww + 0.05, 0.03 * s, 0.8 * s, C.concDark, 0);
    for (let i = 0; i < 4; i++) {
      const dx = (i - 1.5) * 0.5 * s * f, cw = 0.42 * s * f;
      B(F, dx, -1.0 * s, cw, 0.4 * s, 0.62 * s, C.white, 0.03 * s, u);
      for (let k = 0; k < 6; k++) B(F, dx - cw / 2 + (k + 0.5) * cw / 6, -1.0 * s + 0.31 * s + 0.006, cw / 6 * 0.4, 0.34 * s, 0.01, C.concDark, 0.06 * s, u);    // corrugation
      B(F, dx, -1.0 * s - 0.31 * s - 0.01, 0.12 * s * f, 0.3 * s, 0.014, C.dark, 0.06 * s, u); B(F, dx, -1.0 * s - 0.31 * s - 0.02, 0.014, 0.05, 0.01, C.steel, 0.2 * s, u);   // door and handle
      B(F, dx + cw * 0.28, -1.0 * s, 0.12 * s * f, 0.05 * s, 0.1 * s, C.louver, 0.43 * s, u); fan(F, dx + cw * 0.28, -1.0 * s, 0.035 * s * f, 0.485 * s, u);    // roof HVAC
      B(F, dx - cw * 0.36, -1.0 * s - 0.31 * s - 0.012, 0.035, 0.03, 0.008, C.red, 0.34 * s, u);                 // a fire placard
    }
    for (let i = 0; i < 3; i++) bollard(F, (i - 1) * 0.7 * s * f, -0.38 * s);
    Ly(F, 0, -0.65 * s, 0.008, ww, C.dark, 0.05 * s, 't');                                                          // a cable run along the pad
  } };

  const spanItems = (idx: 0 | 1): Item[] => {
    const out: Item[] = [];
    if (idx === 0) { if (hasAir) { out.push(airHouse('air')); if (spare('air')) out.push(airHouse('air2')); } out.push(control); }
    else { if (hasWater) out.push(waterShed, pumps); if (hasBank) out.push(battery); }
    return out;
  };
  if (tier === 'glass' || tier === 'geodesic') {
    ([0, 1] as const).forEach(idx => {
      if (idx === 1 && n < 2) return;
      const items = spanItems(idx), sp = spans[idx] ?? spans[0];
      if (!items.length) return;
      const { a0, a1 } = region(idx), gap = 0.3 * s, total = items.reduce((a, it) => a + it.w, 0) + gap * (items.length - 1), f = Math.min(1, (a1 - a0) / total);
      let cur = (a0 + a1) / 2 - total * f / 2;
      for (const it of items) {
        const mid = cur + it.w * f / 2; it.draw(sp, mid, f);
        const F = spot(sp, mid, 0.8 * s); if (it.unit) noteUnit(it.unit, F.x, F.z);
        cur += it.w * f + gap * f;
      }
    });
  }

  // ── the arcology's service gallery: bays built into the thickness of the band, door on the inside, louvers and intake slots in the outer face ──
  if (tier === 'arcology') {
    const bandH = 0.62, depth = 0.5 * s;
    ([0, 1] as const).forEach(idx => {
      if (idx === 1 && n < 2) return;
      const items = spanItems(idx), sp = spans[idx] ?? spans[0];
      if (!items.length) return;
      const bays: Array<{ it: Item; unit?: string; key: string }> = [];
      for (const it of items) { const count = it.id === 'battery' || it.id === 'water' ? 2 : 1; for (let k = 0; k < count; k++) bays.push({ it, unit: it.unit, key: it.bay ?? it.id }); }
      const { a0, a1 } = region(idx), bw = Math.min(0.95 * s, (a1 - a0) / bays.length), total = bw * bays.length, start = (a0 + a1) / 2 - total / 2;
      bays.forEach((b, i) => {
        const a = start + bw * (i + 0.5), F = spot(sp, a, 0), u = b.unit;
        B(F, 0, -depth / 2, bw * 0.98, bandH, depth, C.armor, 0, u);                                               // the bay, armored
        B(F, 0, -depth / 2, bw, 0.05, depth + 0.04, C.roof, bandH, u);                                              // its roof slab
        // the access door: concrete jambs and lintel, a roll-up shutter of slats, a hood, a status lamp in a cage
        const dz = -depth - 0.012;
        B(F, -bw * 0.32, dz, 0.035, 0.42, 0.04, C.cap, 0, u); B(F, bw * 0.32, dz, 0.035, 0.42, 0.04, C.cap, 0, u); B(F, 0, dz, bw * 0.67, 0.035, 0.04, C.cap, 0.4, u);
        B(F, 0, dz + 0.005, bw * 0.6, 0.38, 0.02, C.dark, 0, u); slatsH(F, 0, dz - 0.006, bw * 0.6, 0.36, 6, C.louver, 0.01, u, 0.012);
        B(F, 0, dz - 0.03, bw * 0.75, 0.025, 0.07, C.roof, 0.45, u);
        B(F, 0, dz - 0.012, bw * 0.6, 0.05, 0.012, BAY[b.key] ?? C.steel, 0.5, u);                                  // the bay's color stripe
        B(F, bw * 0.38, dz - 0.012, 0.05, 0.04, 0.04, C.white, 0.35, u); Cy(F, bw * 0.38, dz - 0.012, 0.022, 0.05, C.dark, 0.33, u);
        if (i % 2 === 0) { bollard(F, -bw * 0.45, dz - 0.14); }
        // the outer face: a framed louver with slats for the bays that breathe, and its intake slot
        const slots = b.key === 'air' ? 3 : b.key === 'battery' ? 2 : b.key === 'water' ? 1 : 0, phi = sp + a / r, [lx, lz] = polar(r + 0.03, phi);
        for (let k = 0; k < slots; k++) {
          push({ shape: 'box', x: lx, z: lz, y0: 0.16 + k * 0.17, w: bw * 0.58, h: 0.09, d: 0.05, r: 0, rot: phi, color: C.dark, high: true, ...(u ? { unit: u } : {}) });
          for (let q = 0; q < 3; q++) push({ shape: 'box', x: lx, z: lz, y0: 0.175 + k * 0.17 + q * 0.025, w: bw * 0.5, h: 0.012, d: 0.065, r: 0, rot: phi, color: C.louver, high: true, ...(u ? { unit: u } : {}) });
        }
        if (u) noteUnit(u, F.x + 0, F.z + 0);
      });
    });
  }

  // ── outside: the hardened yard, with no gate ──
  if (yard) {
    const g = yard, W = g.W, D = g.D, P = (u: number, v: number): [number, number] => yardPoint(g, u, v);
    const o0 = P(0, 0), Fy: Fr = { x: o0[0], z: o0[1], rot: g.phi };
    // slab with a curb all round (it also keeps the field brush out), the walkway strip from the inner door, and the wall
    B(Fy, 0, D / 2, W - 0.14, 0.045, D - 0.14, C.concDark, 0);
    for (const [dx, dz, w, d] of [[0, 0.1, W - 0.14, 0.05], [0, D - 0.1, W - 0.14, 0.05], [-(W - 0.2) / 2, D / 2, 0.05, D - 0.14], [(W - 0.2) / 2, D / 2, 0.05, D - 0.14]] as const) B(Fy, dx, dz, w, 0.075, d, C.cap, 0);
    const pu = g.portal.u;
    B(Fy, pu, 0.5 * D * 0.5, g.portal.w + 0.1, 0.05, D * 0.5, C.conc, 0);                                    // the walkway in from the inner door
    const seg = (ax: number, az: number, bx: number, bz: number, h: number, th: number, color: number, y0: number): void => {
      const len = Math.hypot(bx - ax, bz - az); if (len < 1e-4) return;
      push({ shape: 'box', x: (ax + bx) / 2, z: (az + bz) / 2, y0, w: len, h, d: th, r: 0, rot: Math.atan2(-(bz - az), bx - ax), color });
    };
    const wallRun = (ax: number, az: number, bx: number, bz: number): void => {
      const len = Math.hypot(bx - ax, bz - az), k = Math.max(1, Math.ceil(len / 0.9));
      for (let i = 0; i < k; i++) {
        const x0 = ax + (bx - ax) * i / k, z0 = az + (bz - az) * i / k, x1 = ax + (bx - ax) * (i + 1) / k, z1 = az + (bz - az) * (i + 1) / k;
        seg(x0, z0, x1, z1, YARD_H + 0.14, YARD_T, C.conc, -0.14); seg(x0, z0, x1, z1, 0.03, YARD_T + 0.04, C.cap, YARD_H);
      }
    };
    const [a0, a1, a2, a3] = [P(-W / 2, 0), P(W / 2, 0), P(W / 2, D), P(-W / 2, D)];
    // the outer, left and right sides are continuous; the inner side (against the band) is split at the portal's opening
    wallRun(a1[0], a1[1], a2[0], a2[1]); wallRun(a2[0], a2[1], a3[0], a3[1]); wallRun(a3[0], a3[1], a0[0], a0[1]);
    const gl = P(pu - g.portal.w / 2 - 0.05, 0), gr = P(pu + g.portal.w / 2 + 0.05, 0);
    wallRun(a0[0], a0[1], gl[0], gl[1]); wallRun(gr[0], gr[1], a1[0], a1[1]);
    seg(gl[0], gl[1], gr[0], gr[1], 0.1, YARD_T, C.conc, 0.1 + PORTAL_H);                                       // the lintel over the opening
    for (const [x, z] of [a0, a1, a2, a3, gl, gr]) push({ shape: 'box', x, z, y0: -0.14, w: 0.16, h: YARD_H + 0.3, d: 0.16, r: 0, rot: g.phi, color: C.cap });
    // the camera mast at the outer corner (with a lamp), and the pad where a tower can stand
    push({ shape: 'cyl', x: g.camera[0], z: g.camera[1], y0: 0, w: 0, h: 0.95, d: 0, r: 0.016, rot: g.phi, color: C.dark });
    push({ shape: 'box', x: g.camera[0], z: g.camera[1], y0: 0.93, w: 0.07, h: 0.045, d: 0.12, r: 0, rot: g.phi + 0.6, color: C.louver });
    push({ shape: 'box', x: g.towerSlot[0], z: g.towerSlot[1], y0: 0, w: 0.46, h: 0.025, d: 0.46, r: 0, rot: g.phi, color: C.concDark });
    for (const [du, dv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const [bx, bz] = [g.towerSlot[0] + (du * g.et[0] + dv * g.er[0]) * 0.17, g.towerSlot[1] + (du * g.et[1] + dv * g.er[1]) * 0.17]; push({ shape: 'cyl', x: bx, z: bz, y0: 0.02, w: 0, h: 0.04, d: 0, r: 0.018, rot: 0, color: C.steel }); }

    // equipment: the cooling tower and the chillers on the left, the substation in the middle; the aisle from the inner door runs along the right
    const bw = Math.min(0.9 * s, W * 0.19), dd = Math.min(0.55 * s, D * 0.36), v1 = D * 0.4, v2 = D * 0.74, kk = Math.min(s, W / 5.4);
    const chill = (id: string, v: number): void => {
      const dx = -0.14 * W, u = id, bh = 0.42 * s, y = 0.045;
      B(Fy, dx, v, bw + 0.05, 0.03 * s, dd + 0.05, C.skid, y, u);                                               // the skid
      B(Fy, dx, v, bw, bh, dd, C.white, y + 0.03 * s, u);                                                       // the cabinet
      for (const sd of [-1, 1]) for (let i = 0; i < 6; i++) B(Fy, dx + sd * (bw / 2 + 0.004), v - dd * 0.4 + i * dd * 0.16, 0.012, bh * 0.72, dd * 0.07, C.coil, y + 0.03 * s + bh * 0.1, u);   // coil fins on both ends
      for (const fx of [-0.24, 0.24]) fan(Fy, dx + fx * bw, v, Math.min(0.17 * s, bw * 0.2), y + 0.03 * s + bh, u);   // two fan grilles on top
      B(Fy, dx + 0.1 * bw, v - dd / 2 - 0.006, 0.1 * s, 0.05 * s, 0.01, C.white, y + 0.28 * s, u);              // nameplate
      B(Fy, dx - bw / 2 - 0.035, v + dd * 0.25, 0.05, 0.13 * s, 0.07 * s, C.steel, y + 0.1 * s, u); Ly(Fy, dx - bw / 2 - 0.035, v + dd * 0.25 + 0.05 * s, 0.006, 0.1 * s, C.dark, y + 0.05 * s, 'r', u);   // disconnect and conduit
      Ly(Fy, dx + bw / 2 + 0.06, v - dd * 0.2, 0.014 * s, 0.14, C.copper, y + 0.12 * s, 't', u); Ly(Fy, dx + bw / 2 + 0.06, v + dd * 0.2, 0.014 * s, 0.14, C.pipe, y + 0.12 * s, 't', u);   // refrigerant stubs
    };
    chill('chiller', v1); if (spare('chiller')) chill('chiller2', v2);
    // the cooling tower: basin, body with fill louvers, a fan stack with a grille, a platform with rails, a ladder and a drift plume
    {
      const tx = -0.37 * W, tz = D * 0.5, u = 'chiller', tw = Math.min(0.7 * kk, W * 0.17), td = Math.min(0.62 * kk, D * 0.45), y = 0.045;
      B(Fy, tx, tz, tw + 0.08, 0.15 * kk, td + 0.08, C.concDark, y, u);                                           // basin
      B(Fy, tx, tz, tw, 0.5 * kk, td, C.tower, y + 0.15 * kk, u);                                                  // body
      for (const sd of [-1, 1]) for (let i = 0; i < 8; i++) B(Fy, tx - tw * 0.4 + i * tw * 0.8 / 7, tz + sd * (td / 2 + 0.005), tw * 0.04, 0.38 * kk, 0.012, C.louver, y + 0.2 * kk, u);   // fill louvers
      Cy(Fy, tx, tz, Math.min(0.24 * kk, tw * 0.4), 0.18 * kk, C.tower, y + 0.65 * kk, u, Math.min(0.28 * kk, tw * 0.46));   // the fan stack
      fan(Fy, tx, tz, Math.min(0.22 * kk, tw * 0.4), y + 0.83 * kk, u);
      B(Fy, tx, tz, tw * 1.05, 0.015, td * 1.05, C.steel, y + 0.65 * kk - 0.01, u);                               // platform
      for (const [px, pz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) Cy(Fy, tx + px * tw * 0.52, tz + pz * td * 0.52, 0.008, 0.1 * kk, C.steel, y + 0.65 * kk, u);
      for (const sd of [-1, 1]) B(Fy, tx, tz + sd * td * 0.52, tw * 1.04, 0.008, 0.008, C.steel, y + 0.73 * kk, u);
      for (const sd of [-1, 1]) Cy(Fy, tx + tw / 2 + 0.03, tz + sd * 0.03, 0.006, 0.5 * kk, C.steel, y + 0.15 * kk, u);   // ladder rails
      for (let i = 0; i < 5; i++) B(Fy, tx + tw / 2 + 0.03, tz, 0.012, 0.008, 0.06, C.steel, y + 0.2 * kk + i * 0.09 * kk, u);
      Cy(Fy, tx, tz, 0.16 * kk, 0.14 * kk, C.plume, y + 1.03 * kk, u, 0.22 * kk); Cy(Fy, tx + 0.02, tz, 0.12 * kk, 0.1 * kk, C.plume, y + 1.17 * kk, u, 0.16 * kk);   // drift off the top
      Ly(Fy, tx + tw / 2 + 0.2, tz, 0.022 * kk, 0.34, C.pipe, y + 0.06, 't', u); Cy(Fy, tx + tw / 2 + 0.2, tz, 0.03 * kk, 0.012, C.valve, y + 0.1 * kk, u);       // the supply pipe to the chiller with a valve
    }
    // the substation: a curbed pad, the transformer with radiator fins, a conservator, ribbed bushings, a bus gantry on insulator strings, a fence line, bollards
    const xfmr = (id: string, v: number): void => {
      const dx = 0.06 * W, u = id, tw = Math.min(0.55 * kk, W * 0.14), td = Math.min(0.46 * kk, D * 0.3), y = 0.045, th = 0.4 * kk;
      B(Fy, dx, v, tw + 0.1, 0.03, td + 0.1, C.concDark, y, u);                                                   // plinth
      B(Fy, dx, v, tw, th, td, C.xfmr, y + 0.03, u); B(Fy, dx, v, tw + 0.02, 0.02 * kk, td + 0.02, C.xfmr, y + 0.03 + th, u);   // tank and lid
      for (let i = 0; i < 7; i++) B(Fy, dx + tw / 2 + 0.03 + (i % 2) * 0.012, v - td * 0.4 + i * td * 0.13, 0.016, th * 0.85, 0.06 * kk, C.xfmr, y + 0.06 * kk, u);    // radiator fins
      Ly(Fy, dx, v + td * 0.1, 0.055 * kk, tw * 0.9, C.xfmr, y + 0.03 + th + 0.1 * kk, 't', u);                    // the conservator
      for (const k of [-1, 0, 1]) {
        const bx = dx + k * tw * 0.3;
        Cy(Fy, bx, v - td * 0.2, 0.034 * kk, 0.26 * kk, C.porc, y + 0.03 + th + 0.02 * kk, u, 0.024 * kk);        // HV bushings
        for (const hh of [0.07, 0.13, 0.19]) Cy(Fy, bx, v - td * 0.2, 0.048 * kk, 0.01, C.porc, y + 0.03 + th + hh * kk, u);
        Cy(Fy, bx, v - td * 0.2, 0.012 * kk, 0.03 * kk, C.copper, y + 0.03 + th + 0.28 * kk, u);
      }
      for (const k of [-1.5, -0.5, 0.5, 1.5]) Cy(Fy, dx + k * tw * 0.2, v + td * 0.33, 0.016 * kk, 0.09 * kk, C.porc, y + 0.03 + th + 0.02 * kk, u);   // LV bushings
      B(Fy, dx, v - td / 2 - 0.006, 0.12 * kk, 0.06 * kk, 0.01, C.white, y + 0.2 * kk, u);                         // nameplate
      for (const sd of [-1, 1]) B(Fy, dx + sd * (tw * 0.65), v - td * 0.2, 0.025, 0.62 * kk, 0.025, C.steel, y + 0.03, u);   // gantry posts
      B(Fy, dx, v - td * 0.2, tw * 1.35, 0.025, 0.03, C.steel, y + 0.03 + 0.6 * kk, u);                             // crossbeam
      for (const k of [-1, 0, 1]) Cy(Fy, dx + k * tw * 0.3, v - td * 0.2, 0.01 * kk, 0.12 * kk, C.porc, y + 0.03 + 0.48 * kk, u);   // insulator strings
      // the fence line round the pad
      const fw = tw + 0.4, fd = td + 0.4;
      for (const sd of [-1, 1]) { B(Fy, dx + sd * fw / 2, v, 0.012, 0.012, fd, C.pipe, y + 0.2 * kk, u); B(Fy, dx + sd * fw / 2, v, 0.012, 0.012, fd, C.pipe, y + 0.34 * kk, u); B(Fy, dx, v + sd * fd / 2, fw, 0.012, 0.012, C.pipe, y + 0.2 * kk, u); B(Fy, dx, v + sd * fd / 2, fw, 0.012, 0.012, C.pipe, y + 0.34 * kk, u); }
      for (const [px, pz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1]]) Cy(Fy, dx + px * fw / 2, v + pz * fd / 2, 0.01, 0.4 * kk, C.steel, y, u);
    };
    xfmr('substation', v1); if (spare('substation')) xfmr('substation2', v2);
    // pipe and conduit runs across the slab, bollards by the walkway, a light pole at the outer corner
    Ly(Fy, -0.255 * W, v1, 0.012, 0.22 * W, C.pipe, 0.08, 't', 'chiller');
    Ly(Fy, -0.04 * W, D / 2, 0.01, D * 0.5, C.dark, 0.06, 'r', 'substation');
    for (const k of [0, 1, 2]) bollard(Fy, pu + (k - 1) * 0.0 + 0.3 + (k % 2) * 0.0, D * 0.2 + k * D * 0.25);
    for (const k of [-1, 1]) Cy(Fy, -W / 2 + 0.2, D * (k > 0 ? 0.85 : 0.2), 0.012, 0.72, C.dark, 0);
    for (const id of ['chiller', 'chiller2', 'substation', 'substation2']) { const q = parts.filter(p => p.unit === id); if (q.length) noteUnit(id, q.reduce((a, p) => a + p.x, 0) / q.length, q.reduce((a, p) => a + p.z, 0) / q.length); }

    // ── the portal: the service airlock inside the shell, the sealed passage and the inner door ──
    {
      const Pf: Fr = { x: loc(Fy, pu, 0)[0], z: loc(Fy, pu, 0)[1], rot: g.phi };
      const shellDz = -g.portal.len + 0.12, pw = PORTAL_W, ph = PORTAL_H, cl = CHAMBER_LEN;
      const P1 = (extra: Partial<PlantPart> = {}): Partial<PlantPart> => ({ passage: true, ...extra });
      // the passage: a poured box through the footing and the band, up to the inner door
      const plen = g.portal.len - 0.0;
      B(Pf, 0, 0.12 - plen / 2, pw, ph, plen, C.conc, 0, undefined, 0, P1()); B(Pf, 0, 0.12 - plen / 2, pw + 0.06, 0.05, plen, C.cap, ph, undefined, 0, P1());
      B(Pf, 0, 0.12 - plen / 2, pw * 0.6, 0.006, plen * 0.9, C.concDark, 0.001, undefined, 0, P1());   // its floor strip
      B(Pf, 0, 0.12 - plen / 2, 0.05, 0.02, 0.05, C.white, ph - 0.02, undefined, 0, P1());                     // a ceiling lamp
      // the inner door on the yard side: steel, with a hazard stripe and a handle
      B(Pf, 0, 0.115, pw * 0.8, ph * 0.9, 0.025, C.gate, 0, undefined, 0, P1()); B(Pf, 0, 0.13, pw * 0.8, 0.03, 0.01, C.hazard, ph * 0.55, undefined, 0, P1()); B(Pf, pw * 0.25, 0.135, 0.03, 0.03, 0.012, C.steel, ph * 0.4, undefined, 0, P1());
      // the airlock chamber on the inside of the shell: armored box, the dome-side door with a wheel, a status lamp and a hazard stripe, jambs, a hood and bollards
      const cz = shellDz - cl / 2 - 0.03;
      B(Pf, 0, cz, pw + 0.12, ph + 0.06, cl, C.armor, 0, undefined, 0, P1()); B(Pf, 0, cz, pw + 0.18, 0.05, cl + 0.04, C.roof, ph + 0.06, undefined, 0, P1());
      const dzC = cz - cl / 2 - 0.012;
      B(Pf, -pw * 0.5, dzC, 0.04, ph, 0.04, C.cap, 0, undefined, 0, P1()); B(Pf, pw * 0.5, dzC, 0.04, ph, 0.04, C.cap, 0, undefined, 0, P1());
      B(Pf, 0, dzC + 0.004, pw * 0.8, ph * 0.9, 0.025, C.gate, 0, undefined, 0, P1()); B(Pf, 0, dzC - 0.01, pw * 0.8, 0.03, 0.01, C.hazard, ph * 0.5, undefined, 0, P1());
      Cy(Pf, pw * 0.2, dzC - 0.015, 0.035, 0.012, C.steel, ph * 0.45, undefined); B(Pf, -pw * 0.28, dzC - 0.012, 0.045, 0.045, 0.012, 0x4fa04f, ph * 0.75, undefined, 0, P1());   // wheel and the green lamp
      B(Pf, 0, dzC - 0.04, pw * 0.95, 0.025, 0.08, C.roof, ph * 0.97, undefined, 0, P1());
      bollard(Pf, -pw * 0.8, dzC - 0.12); bollard(Pf, pw * 0.8, dzC - 0.12);
      void shellDz;
    }
  }

  // ── on the structure: roof vent hatches (armored louvers on the arcology) ──
  const phis = (k: number, off: number): number[] => Array.from({ length: k }, (_, i) => off + i * Math.PI * 2 / k);
  const hatches = level === 0 ? 1 : 2 + level, theta = 0.3;
  if (tier !== 'earthen') for (const [i, phi] of phis(hatches, 0.5).entries()) {
    const [x, z] = polar(r * Math.sin(theta), phi), vc = tier === 'arcology' ? C.armor : C.steel;
    parts.push({ shape: 'box', x, z, y0: r * Math.cos(theta), w: 0.5 * s * 0.8, h: 0.1 * s, d: 0.5 * s * 0.8, r: 0, rot: phi, color: vc, onShell: { theta, phi }, unit: 'vents' });
    parts.push({ shape: 'box', x, z, y0: r * Math.cos(theta), w: 0.5 * s * 0.8, h: 0.03 * s, d: 0.36 * s, r: 0, rot: phi, color: C.louver, onShell: { theta, phi }, unit: 'vents' });
    if (level >= 1 && i % 2 === 0 && tier !== 'arcology') parts.push({ shape: 'cyl', x, z, y0: r * Math.cos(theta), w: 0, h: 0.55 * s, d: 0, r: 0.045 * s, rot: phi, color: C.steel, onShell: { theta, phi }, unit: 'vents' });
  }
  if (tier !== 'earthen') noteUnit('vents', polar(r * Math.sin(theta), 0.5)[0], polar(r * Math.sin(theta), 0.5)[1]);

  // ── buried lines: power from the substation, chilled water from the chillers, both under the footing in sealed sleeves; the compound feeder; the passage ──
  if (yard) {
    const sp0 = spans[0], pu = yard.portal.u;
    const line = (k: PlantLine['kind'], depth: number, ...pts: Array<[number, number]>): void => { lines.push({ kind: k, depth, pts }); };
    const inner = (u: number): [number, number] => polar(r - 0.9, sp0 + u / r);
    line('power', 0.12, yardPoint(yard, 0.06 * yard.W, yard.D / 2), yardPoint(yard, 0.06 * yard.W, -0.1), inner(0.06 * yard.W));
    line('chill', 0.1, yardPoint(yard, -0.14 * yard.W, yard.D / 2), yardPoint(yard, -0.14 * yard.W, -0.1), inner(-0.14 * yard.W));
    line('feeder', 0.14, inner(0.06 * yard.W), polar(r * 0.45, sp0));
    if (n > 1 && (hasWater || hasBank)) line('water', 0.1, polar(r - 0.9, spans[1]), polar(r * 0.45, spans[1]));
    line('passage', 0.02, yard.portal.from, yard.portal.to);
    void pu;
  }

  // ── path lamps: along the ways in from each airlock, both sides, warm heads (the renderer lights them with the night); yard lights ──
  const lamps: PlantLamp[] = [], stepL = 1.15;
  for (const a of angles) {
    for (let d = r * 0.9, k = 0; d > r * 0.32 && lamps.length < 90; d -= stepL, k++) {
      const side = k % 2 ? 1 : -1, [x, z] = polar(d, a), off = 0.42 * side;
      lamps.push({ x: x + Math.cos(a) * off, z: z - Math.sin(a) * off, y: 0.6 });
    }
  }
  if (yard) {
    for (const k of [-1, 1]) { const p = yardPoint(yard, -yard.W / 2 + 0.2, yard.D * (k > 0 ? 0.85 : 0.2)); lamps.push({ x: p[0], z: p[1], y: 0.72 }); }
    lamps.push({ x: yard.portal.chamber[0] + yard.et[0] * 0.5, z: yard.portal.chamber[1] + yard.et[1] * 0.5, y: 0.5 });
  }
  if (tier === 'glass' && level >= 1) { const q = spot(spans[0], 0, 2.1 * s); lamps.push({ x: q.x, z: q.z, y: 0.6 }); }

  const unitSpots: PlantUnitSpot[] = [];
  for (const [id, p] of note) { const kind = id.replace(/2$/, '') as PlantKind; unitSpots.push({ id, kind, place: tier === 'arcology' && kind !== 'vents' && kind !== 'chiller' && kind !== 'substation' ? 'gallery' : kind === 'chiller' || kind === 'substation' ? (yard ? 'yard' : 'inside') : 'inside', x: p.x, z: p.z }); }
  void YARD_GAP; void tau;
  return { level, scale: s, parts, lamps, lines, units: unitSpots, yard, spans };
}
