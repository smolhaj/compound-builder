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
import { FRAME_SPANS } from './tiers';
import type { WaterLoop } from './waterLoop';
import type { PlantKind, PlantPlace } from './plantUnits';
import { ROOF_SLIDE as ST_SLIDE, type RoofState } from './yardRoof';
import { geoField } from './geothermal';
import { CHAMBER_LEN, PORTAL_H, PORTAL_W, inYard, plantSize, yardGeometry, yardPoint, YARD_GAP, YARD_H, YARD_T, type YardGeom } from './plantYard';

export type Shape = 'box' | 'cyl';
export type AirlockLook = 'sealed' | 'dome' | 'yard' | 'both' | 'cycling';
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
  /** On the yard's level plane: y0 is measured from the plane (the highest ground inside the yard's footprint), not from the ground, so a roof is one flat plane on sloping land. */
  lvl?: boolean;
  /** A wall run: its top is `wallTop` above the yard's level plane whatever the ground does (bottom: the lowest ground under the run, y0 below it), so the wall tops are level. */
  wallTop?: number;
  /** Ground is read at this point instead of the part's own center (a prop made of several parts on a slope stands on one level: the fitted tower). */
  gat?: [number, number];
  /** The plant unit it belongs to (`chiller`, `chiller2`, `air`...): a damaged unit is drawn burned. */
  unit?: string;
  /** Part of the sealed passage (drawn in the cutaway and underground views). */
  passage?: boolean;
  /** An armored wall or door: drawn with the dome's own panel steel material (the shared kit material, opaque), not the plant's vertex-colored mesh. */
  steel?: boolean;
  /** Texture instead of geometry: the box's faces (`x`, `y`, `z` for the big pair, or `px`...`nz`) show a cell of the plant's decal atlas (game/fx/plantDecals.ts): louvers, fins, warning and data plates, a lit lamp panel. */
  decal?: { cell: string; face: string; flip?: boolean };
  /** A soft dark frame round a footprint (contact shadow, stain): the box's top only, its vertex colors fading from `color` at the rim to this color at the inner edge. */
  soft?: number;
  /** Drawn self-lit (a ceiling that no light reaches): the work sheet with a glow of its own. */
  selfLit?: boolean;
  /** Leave out the underside (a roof part whose underside is covered by another part). */
  noBottom?: boolean;
  /** Only the top face (a paving joint, a stain). */
  topOnly?: boolean;
}
export interface PlantLamp { x: number; z: number; y: number; /** A ceiling lamp (a flat lit disc hanging under a roof, no post): `lvl` measures y from the yard's level plane (under its roof), `gnd` from the ground (inside the sealed passage). */ ceil?: 'lvl' | 'gnd'; /** Pool radius scale (default by kind). */ k?: number }
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
  white: 0xe8e9e6, pipe: 0x9aa3ab, warm: 0xc79a4a, red: 0x9a3b32, armor: 0x7b8087, teal: 0x5f9c97, grille: 0x25282b, coil: 0x6d7479, skid: 0x6a4f3f, xfmr: 0x7d8790, porc: 0xb98a63,
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

export interface PlantOpts { loop?: WaterLoop; spares?: readonly PlantKind[]; rot?: number; /** The arcology's plant yard roof (sim/dome/yardRoof.ts); default closed. */ roof?: RoofState; /** QA look of the yard's service airlock: both doors shut and the lamps red (`sealed`, the default), the dome-side door slid open (`dome`), the yard-side door slid open (`yard`), or cycling (amber, both shut). */ airlock?: AirlockLook; /** The geothermal purchases drawn in the yard and on the ground outside it (sim/dome/geothermal.ts, save v107): a tower on the pad, the loop's header vault and bore field (`bores`: how many the field has), the deep well's head. */ geo?: GeoLook }
export interface GeoLook { tower?: boolean; loop?: boolean; bores?: number; well?: boolean; /** Water or creek bank at a point of the dome's local frame (with its margin): no bore cap is placed there. */ wet?: (x: number, z: number) => boolean }

/** A frame: a point on the ground and a turn; `dx` runs along the shell (tangent), `dz` outward from the dome. */
interface Fr { x: number; z: number; rot: number }
const loc = (f: Fr, dx: number, dz: number): [number, number] => [f.x + dx * Math.cos(f.rot) + dz * Math.sin(f.rot), f.z - dx * Math.sin(f.rot) + dz * Math.cos(f.rot)];

/** The plant of a dome of `tier` and shell radius `r` running `filtering`. */
export function plantLayout(tier: DomeTier, r: number, filtering: Filtering, o: PlantOpts = {}): Plant {
  const level = LEVEL[filtering], s = plantSize(r), parts: PlantPart[] = [], lines: PlantLine[] = [], lamps: PlantLamp[] = [];
  const loop = o.loop ?? 'none', spares = o.spares ?? [], rot = o.rot ?? 0;
  const n = FRAME_SPANS[tier], tau = Math.PI * 2, step = tau / n;
  const angles = tier === 'earthen' ? [0] : Array.from({ length: n }, (_, i) => i * step + rot * Math.PI / 2);
  const spanMid = (i: number): number => angles[i % n] + step / 2;
  const spans = n > 1 ? [spanMid(0), spanMid(1)] : [Math.PI + rot * Math.PI / 2];
  const hasAir = level >= 1, hasWater = loop !== 'none', hasBank = level >= 3;
  const yard = yardGeometry(tier, r, rot);
  const spare = (k: PlantKind): boolean => spares.includes(k);
  const push = (p: PlantPart): void => { parts.push(p.onShell || p.high || p.lvl ? p : { ...p, color: weather(p.color, p.x, p.z) }); };

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
    Cy(f, dx, dz, rad * 1.04, 0.02, C.coil, y0 - 0.008, unit);                                             // the guard ring
    const [x, z] = loc(f, dx, dz); push({ shape: 'cyl', x, z, y0: y0 + 0.004, w: 0, h: 0.01, d: 0, r: rad, rot: f.rot, color: 0xffffff, ...(unit ? { unit } : {}), decal: { cell: 'grille', face: 'cap' } });   // the grille: one textured disc
  };
  /** Louvers: `count` thin slats stacked across a face, each its own thin box. */
  const slatsH = (f: Fr, dx: number, dz: number, w: number, h: number, count: number, color: number, y0: number, unit?: string, d = 0.016): void => {
    void count; void color; void d;
    B(f, dx, dz, w, h, 0.012, 0xc4cad0, y0, unit, 0, { decal: { cell: 'louver', face: 'z' } });      // one quad of louver texture (a stack of slat boxes before)
  };
  /** A plate of the decal atlas: a warning label, a data plate, a door, a fin bank (box w by h, thin in `face`'s axis). */
  const DP = (f: Fr, dx: number, dz: number, w: number, h: number, y0: number, cell: string, unit?: string, face = 'z', thick = 0.006, color = 0xffffff, yaw = 0): void => {
    B(f, dx, dz, face === 'x' ? thick : w, h, face === 'x' ? w : thick, color, y0, unit, yaw, { decal: { cell, face } });
  };
  /** A soft contact shadow under a footprint, and paving stains: top-only frames that fade from the slab's color to dark. */
  const SH = (f: Fr, dx: number, dz: number, w: number, d: number, y0: number, rim: number, core: number, m = 0.06): void => { B(f, dx, dz, w + 2 * m, 0.001, d + 2 * m, rim, y0, undefined, 0, { soft: core, topOnly: true }); };
  const plate = (f: Fr, dx: number, dz: number, y0: number, unit?: string, w = 0.07): void => DP(f, dx, dz, w, w * 0.5, y0, 'plate', unit, 'z', 0.008);   // a nameplate
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
    B(Fy, 0, D / 2, W, 0.3, D, C.concDark, -0.255);      // (the slab follows the ground under its middle; its footing is buried so the edge never floats)
    for (const [dx, dz, w, d] of [[0, 0.1, W - 0.14, 0.05], [0, D - 0.1, W - 0.14, 0.05], [-(W - 0.2) / 2, D / 2, 0.05, D - 0.14], [(W - 0.2) / 2, D / 2, 0.05, D - 0.14]] as const) B(Fy, dx, dz, w, 0.075, d, C.cap, 0);
    // paving: expansion joints across the slab (top-only strips) and a few oil and rain stains (soft frames); equipment plinths get their own contact shadows
    for (let i = 1; i < 6; i++) B(Fy, -W / 2 + W * i / 6, D / 2, 0.012, 0.001, D - 0.16, 0x4a4c4a, 0.0455, undefined, 0, { topOnly: true });
    B(Fy, 0, D / 2, W - 0.16, 0.001, 0.012, 0x4a4c4a, 0.0455, undefined, 0, { topOnly: true });
    for (const [su, sv, sw, sd2] of [[-0.31, 0.24, 0.7, 0.34], [0.12, 0.62, 0.55, 0.3], [0.33, 0.28, 0.4, 0.5], [-0.05, 0.86, 0.6, 0.2]] as const) B(Fy, su * W, sv * D, sw, 0.001, sd2, C.concDark, 0.0458, undefined, 0.3, { soft: 0x55564f, topOnly: true });
    const pu = g.portal.u;
    B(Fy, pu, 0.5 * D * 0.5, g.portal.w + 0.1, 0.05, D * 0.5, C.conc, 0);                                    // the walkway in from the inner door
    const seg = (ax: number, az: number, bx: number, bz: number, h: number, th: number, color: number, y0: number, top?: number, lvl = false): void => {
      const len = Math.hypot(bx - ax, bz - az); if (len < 1e-4) return;
      push({ shape: 'box', x: (ax + bx) / 2, z: (az + bz) / 2, y0, w: len, h, d: th, r: 0, rot: Math.atan2(-(bz - az), bx - ax), color, ...(top !== undefined ? { wallTop: top } : {}), ...(lvl ? { lvl: true } : {}), ...(tier === 'arcology' && color === C.armor ? { steel: true } : {}) });
    };
    // the arcology's yard is ARMORED AND ROOFED (owner, 2026-11-21): armored walls as tall as the plant, a closed roof, no outside gate (it is entered only from inside, through its own airlock)
    const WALL_H = tier === 'arcology' ? Math.max(1.5, 1.6 * Math.min(s, W / 5.4)) : YARD_H, WALL_C = tier === 'arcology' ? C.armor : C.conc;
    const wallRun = (ax: number, az: number, bx: number, bz: number): void => {
      const len = Math.hypot(bx - ax, bz - az), k = Math.max(1, Math.ceil(len / 0.9));
      for (let i = 0; i < k; i++) {
        const x0 = ax + (bx - ax) * i / k, z0 = az + (bz - az) * i / k, x1 = ax + (bx - ax) * (i + 1) / k, z1 = az + (bz - az) * (i + 1) / k;
        seg(x0, z0, x1, z1, WALL_H + 0.14, YARD_T, WALL_C, -0.14, tier === 'arcology' ? WALL_H : undefined); seg(x0, z0, x1, z1, 0.03, YARD_T + 0.04, C.cap, WALL_H, undefined, tier === 'arcology');
      }
    };
    const [a0, a1, a2, a3] = [P(-W / 2, 0), P(W / 2, 0), P(W / 2, D), P(-W / 2, D)];
    // the outer, left and right sides are continuous; the inner side (against the band) is split at the portal's opening
    wallRun(a1[0], a1[1], a2[0], a2[1]); wallRun(a2[0], a2[1], a3[0], a3[1]); wallRun(a3[0], a3[1], a0[0], a0[1]);
    const gl = P(pu - g.portal.w / 2 - 0.05, 0), gr = P(pu + g.portal.w / 2 + 0.05, 0);
    wallRun(a0[0], a0[1], gl[0], gl[1]); wallRun(gr[0], gr[1], a1[0], a1[1]);
    seg(gl[0], gl[1], gr[0], gr[1], 0.1, YARD_T, C.conc, 0.1 + PORTAL_H);                                       // the lintel over the opening
    if (tier === 'arcology') seg(gl[0], gl[1], gr[0], gr[1], WALL_H - (0.2 + PORTAL_H), YARD_T, WALL_C, 0.2 + PORTAL_H, WALL_H);      // (armored infill over the lintel up to the roof beam: no strip of sky above the portal)
    if (tier === 'arcology') seg(gl[0], gl[1], gr[0], gr[1], 0.03, YARD_T + 0.04, C.cap, WALL_H, undefined, true);      // (and the same cap on it as on every wall top, so the top of the inner wall has no step)
    for (const [x, z] of [a0, a1, a2, a3, gl, gr]) push({ shape: 'box', x, z, y0: -0.14, w: 0.16, h: WALL_H + 0.3, d: 0.16, r: 0, rot: g.phi, color: C.cap, ...(tier === 'arcology' ? { wallTop: WALL_H + 0.16 } : {}) });
    if (tier === 'arcology') {
      // the retractable roof (sim/dome/yardRoof.ts): FOUR identical leaves, each W/4 wide and spanning wall to wall across the yard, on a continuous armored perimeter beam that sits on
      // the wall tops. One regular pane grid; every seam (between leaves and over the wall tops) is covered by a gasketed cover plate, so nothing shows through when it is closed.
      // The two inner leaves slide out over the two outer ones (raised a deck's height, resting on them): vent slides them part way (a gasketed gap), open parks them fully.
      const BL = (f: Fr, dx: number, dz: number, w: number, h: number, d: number, color: number, y0: number, yaw = 0, ex: Partial<PlantPart> = {}): void => B(f, dx, dz, w, h, d, color, y0, undefined, yaw, { lvl: true, ...ex });
      const st = o.roof ?? 'closed', y0 = WALL_H + 0.07, GLASS = 0x4c8d96, GASKET = 0x16181a, lw = W / 4, DECK = 0.075;
      const nu = Math.max(1, Math.round(lw / 1.0)), nv = Math.max(2, Math.round(D / 1.0)), cw = lw / nu, cd = D / nv;
      // the perimeter beam: a continuous armored ring on the wall tops that the leaves seal against, and its end caps
      BL(Fy, 0, -0.02, W + 0.2, 0.07, 0.16, C.armor, WALL_H); BL(Fy, 0, D + 0.02, W + 0.2, 0.07, 0.16, C.armor, WALL_H);
      for (const sd of [-1, 1]) BL(Fy, sd * (W / 2 + 0.02), D / 2, 0.16, 0.07, D + 0.24, C.armor, WALL_H);
      for (const sd of [-1, 1]) for (const v of [-0.1, D + 0.1]) BL(Fy, sd * (W / 2 + 0.2), v, 0.26, 0.2, 0.2, C.dark, WALL_H - 0.02);   // the drive housings at the rail ends
      const slide = ST_SLIDE[st] * W;
      const leaf = (cu: number, lift: number): void => {
        const yb = y0 + lift;
        B(Fy, cu, D / 2, lw + 0.04, 0.02, D + 0.04, 0xc2ccd2, yb - 0.012, undefined, 0, { lvl: true, selfLit: true });                                                      // a solid underlay under every leaf: no ground or sky shows through a pane edge
        for (let a = 0; a < nu; a++) for (let b = 0; b < nv; b++) {
          const px = cu - lw / 2 + (a + 0.5) * cw, pv = (b + 0.5) * cd;
          BL(Fy, px, pv, cw, 0.02, cd, GLASS, yb, 0, { noBottom: true });                                                                                  // the glazed pane, filling its whole cell
          BL(Fy, px, pv, Math.hypot(cw, cd), 0.022, 0.028, C.steel, yb + 0.02, Math.atan2(cd, cw), { noBottom: true });                        // its diagonal strut
        }
        for (let a = 0; a <= nu; a++) BL(Fy, cu - lw / 2 + a * cw, D / 2, 0.05, 0.045, D, C.armor, yb, 0, { noBottom: true });                              // the mullions along the leaf (a bar over every pane edge)
        for (let b = 0; b <= nv; b++) BL(Fy, cu, b * cd, lw, 0.045, 0.05, C.armor, yb, 0, { noBottom: true });                                               // and across it
      };
      // inner leaves ride a deck above the outer ones when slid out; the outer leaves stay put over the end bays
      leaf(-3 * W / 8, 0); leaf(3 * W / 8, 0);
      const lift = slide > 0 ? DECK : 0;
      leaf(-W / 8 - slide, lift); leaf(W / 8 + slide, lift);
      // the gasketed cover plates over every seam between leaves: a black gasket under an armored strip, full width of the yard
      if (st !== 'open') {      // the underside: structural ribs and lit panels (the lit cell glows by day and night)
        for (let i = 0; i < 6; i++) BL(Fy, -W / 2 + W * (i + 0.5) / 6, D / 2, 0.07, 0.035, D + 0.1, C.armor, y0 - 0.047);
        for (const u of [-W / 3, 0, W / 3]) for (const v of [D * 0.3, D * 0.7]) { BL(Fy, u, v, 1.0, 0.014, 0.44, C.dark, y0 - 0.026); BL(Fy, u, v, 0.92, 0.006, 0.36, 0xffffff, y0 - 0.032, 0, { decal: { cell: 'light', face: 'ny' } }); }
      }
      const seams = slide > 0 ? [-W / 4, W / 4] : [-W / 4, 0, W / 4];
      for (const u of seams) { BL(Fy, u, D / 2, 0.07, 0.02, D, GASKET, y0 - 0.005); BL(Fy, u, D / 2, 0.15, 0.03, D + 0.04, C.armor, y0 + 0.045); }
      // when slid back, the centre gap is lined with gasket strips on the leaf edges (a gasketed vent) and the parked leaves stand on spacer blocks over the beam
      if (slide > 0) for (const sd of [-1, 1]) { BL(Fy, sd * (W / 8 + slide - lw / 2), D / 2, 0.05, 0.03, D, GASKET, y0 + lift + 0.02); for (const v of [0.05, D - 0.05]) BL(Fy, sd * (3 * W / 8), v, lw, DECK - 0.005, 0.06, C.armor, y0 + 0.045); }
    }
    if (tier === 'arcology') for (const u of [-W / 3, 0, W / 3]) for (const v of [D * 0.3, D * 0.7]) { const q = P(u, v); lamps.push({ x: q[0], z: q[1], y: WALL_H + 0.05, ceil: 'lvl', k: 1.5 }); }      // (the roof's underside is lit: pale panels and ceiling lamps, so the closed yard reads as a lit hall)
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
      SH(Fy, dx, v, bw + 0.05, dd + 0.05, y + 0.001, C.concDark, 0x3c3e3b, 0.09);                                  // contact shadow
      for (const sd of [-1, 1]) DP(Fy, dx + sd * (bw / 2 + 0.006), v, dd * 0.92, bh * 0.72, y + 0.03 * s + bh * 0.1, 'fins', u, 'x', 0.012, 0xaab2b8);   // coil fins on both ends (texture)
      DP(Fy, dx - 0.3 * bw, v - dd / 2 - 0.006, 0.16 * s, 0.08 * s, y + 0.2 * s, 'danger', u);                          // fan warning label
      for (const fx of [-0.24, 0.24]) fan(Fy, dx + fx * bw, v, Math.min(0.17 * s, bw * 0.2), y + 0.03 * s + bh, u);   // two fan grilles on top
      DP(Fy, dx + 0.25 * bw, v - dd / 2 - 0.006, 0.1 * s, 0.05 * s, y + 0.3 * s, 'plate', u, 'z', 0.01);              // nameplate
      B(Fy, dx - bw / 2 - 0.035, v + dd * 0.25, 0.05, 0.13 * s, 0.07 * s, C.steel, y + 0.1 * s, u); Ly(Fy, dx - bw / 2 - 0.035, v + dd * 0.25 + 0.05 * s, 0.006, 0.1 * s, C.dark, y + 0.05 * s, 'r', u);   // disconnect and conduit
      Ly(Fy, dx + bw / 2 + 0.06, v - dd * 0.2, 0.014 * s, 0.14, C.copper, y + 0.12 * s, 't', u); Ly(Fy, dx + bw / 2 + 0.06, v + dd * 0.2, 0.014 * s, 0.14, C.pipe, y + 0.12 * s, 't', u);   // refrigerant stubs
    };
    chill('chiller', v1); if (spare('chiller')) chill('chiller2', v2);
    // the sealed, filtered emergency air intake (sim/dome/intake.ts) of the arcology stands in the yard with the rest of the plant: armored housing on a plinth, a hooded cap,
    // two filter canisters with clamp bands, a locked service hatch and a status lamp, and an armored duct run back to a flanged collar on the shell. Nothing on it is open.
    if (tier === 'arcology') {
      const ix = 0.24 * W, iv = D * 0.72, k = kk, y = 0.045, face = iv + 0.1 * k;
      B(Fy, ix, iv, 0.5 * k, 0.04, 0.34 * k, C.concDark, y);                                                    // the plinth
      B(Fy, ix, iv, 0.34 * k, 0.46 * k, 0.2 * k, C.armor, y + 0.04);                                             // the armored housing
      B(Fy, ix, iv, 0.4 * k, 0.04 * k, 0.26 * k, C.roof, y + 0.04 + 0.46 * k);                                   // the hooded cap, wider than the body
      for (const sd of [-1, 1]) {
        Cy(Fy, ix + sd * 0.12 * k, face + 0.05 * k, 0.055 * k, 0.4 * k, C.steel, y + 0.04);                      // the filter canisters stand proud of the face
        for (const hh of [0.1, 0.32]) Cy(Fy, ix + sd * 0.12 * k, face + 0.05 * k, 0.06 * k, 0.025 * k, C.dark, y + 0.04 + hh * k);   // clamp bands
        Cy(Fy, ix + sd * 0.12 * k, face + 0.05 * k, 0.045 * k, 0.03 * k, C.cap, y + 0.04 + 0.4 * k);               // capped crown
      }
      DP(Fy, ix, face - 0.004, 0.1 * k, 0.14 * k, y + 0.04 + 0.16 * k, 'door', undefined, 'z', 0.012);                           // the locked service hatch between the canisters
      DP(Fy, ix, iv - 0.1 * k - 0.004, 0.2 * k, 0.1 * k, y + 0.04 + 0.34 * k, 'airin');                                   // AIR IN label on the housing
      SH(Fy, ix, iv, 0.5 * k, 0.34 * k, y + 0.001, C.concDark, 0x34363a, 0.08);
      B(Fy, ix, face + 0.004, 0.03 * k, 0.02 * k, 0.016, C.steel, y + 0.04 + 0.14 * k);                          // its lock
      B(Fy, ix, face, 0.04 * k, 0.025 * k, 0.014, 0x4fa04f, y + 0.04 + 0.34 * k);                                 // the status lamp (green: the intake is ready and sealed)
      // the duct run: an armored conduit back along the yard floor to the shell, on three pipe hangers, ending in a flanged collar
      const dl = Math.max(0.2, iv - 0.1 * k - 0.07), dc = (iv - 0.1 * k + 0.07) / 2, dy = y + 0.04 + 0.12 * k;
      Ly(Fy, ix, dc, 0.035 * k, dl, C.armor, dy, 'r');
      for (const t of [0.2, 0.5, 0.8]) { const z = 0.07 + dl * t; Cy(Fy, ix, z, 0.012 * k, dy - y, C.steel, y); B(Fy, ix, z, 0.09 * k, 0.012, 0.03, C.steel, dy + 0.03 * k); }
      B(Fy, ix, 0.07, 0.14 * k, 0.14 * k, 0.03, C.cap, dy - 0.07 * k);                                           // the flanged collar on the shell
      // the closed blast-and-flood valve on the duct: an armored housing with a hand wheel and a red CLOSED band
      const vz = 0.07 + dl * 0.5;
      B(Fy, ix, vz, 0.17 * k, 0.2 * k, 0.17 * k, C.armor, dy - 0.1 * k); B(Fy, ix, vz, 0.19 * k, 0.025, 0.19 * k, C.cap, dy + 0.1 * k); B(Fy, ix, vz + 0.095 * k, 0.1 * k, 0.03 * k, 0.012, C.red, dy - 0.02 * k);
      Cy(Fy, ix, vz, 0.05 * k, 0.012, C.steel, dy + 0.125 * k); Cy(Fy, ix, vz, 0.008, 0.06 * k, C.steel, dy + 0.105 * k);
      noteUnit('intake', Fy.x, Fy.z);
      // the exhaust beside it: the same sealed stack, its valve housing and duct to its own collar (nothing opens to the yard)
      const ex = 0.31 * W;
      B(Fy, ex, iv, 0.5 * k, 0.04, 0.34 * k, C.concDark, y); B(Fy, ex, iv, 0.3 * k, 0.4 * k, 0.2 * k, C.armor, y + 0.04); B(Fy, ex, iv, 0.38 * k, 0.04 * k, 0.26 * k, C.roof, y + 0.04 + 0.4 * k);
      Cy(Fy, ex, face + 0.02 * k, 0.07 * k, 0.34 * k, C.steel, y + 0.04); Cy(Fy, ex, face + 0.02 * k, 0.075 * k, 0.025 * k, C.dark, y + 0.04 + 0.28 * k); DP(Fy, ex, face - 0.004, 0.09 * k, 0.12 * k, y + 0.04 + 0.14 * k, 'grille', undefined, 'z', 0.012);
      Ly(Fy, ex, dc, 0.035 * k, dl, C.armor, dy, 'r');
      B(Fy, ex, vz, 0.17 * k, 0.2 * k, 0.17 * k, C.armor, dy - 0.1 * k); B(Fy, ex, vz, 0.19 * k, 0.025, 0.19 * k, C.cap, dy + 0.1 * k); B(Fy, ex, vz + 0.095 * k, 0.1 * k, 0.03 * k, 0.012, C.red, dy - 0.02 * k);
      Cy(Fy, ex, vz, 0.05 * k, 0.012, C.steel, dy + 0.125 * k);
      B(Fy, ex, 0.07, 0.14 * k, 0.14 * k, 0.03, C.cap, dy - 0.07 * k);
      // power, water and data enter the shell through armored, flanged, valved sleeves: a flange on the skin, a short conduit, an isolation valve housing with a colored band
      for (const [cx, band] of [[-0.31 * W, 0xe3b92a], [-0.25 * W, 0x2a6fc2], [-0.19 * W, 0x3aa856]] as const) {
        B(Fy, cx, 0.07, 0.13 * k, 0.13 * k, 0.03, C.cap, y + 0.12 * k); Ly(Fy, cx, 0.2, 0.025 * k, 0.26, C.armor, y + 0.12 * k, 'r');
        B(Fy, cx, 0.36, 0.1 * k, 0.12 * k, 0.1 * k, C.armor, y + 0.06 * k); B(Fy, cx, 0.36, 0.11 * k, 0.025 * k, 0.11 * k, band, y + 0.16 * k); Cy(Fy, cx, 0.36, 0.03 * k, 0.01, C.steel, y + 0.18 * k);
      }
    }
    // the cooling tower: basin, body with fill louvers, a fan stack with a grille, a platform with rails, a ladder and a drift plume
    {
      const tx = -0.37 * W, tz = D * 0.5, u = 'chiller', tw = Math.min(0.7 * kk, W * 0.17), td = Math.min(0.62 * kk, D * 0.45), y = 0.045;
      B(Fy, tx, tz, tw + 0.08, 0.15 * kk, td + 0.08, C.concDark, y, u);                                           // basin
      B(Fy, tx, tz, tw, 0.5 * kk, td, C.tower, y + 0.15 * kk, u);                                                  // body
      for (const sd of [-1, 1]) DP(Fy, tx, tz + sd * (td / 2 + 0.006), tw * 0.9, 0.38 * kk, y + 0.2 * kk, 'louver', u, 'z', 0.012, 0xc4cad0);   // fill louvers (texture)
      SH(Fy, tx, tz, tw + 0.08, td + 0.08, y + 0.001, C.concDark, 0x3c3e3b, 0.1);
      DP(Fy, tx - tw * 0.3, tz - td / 2 - 0.014, 0.1, 0.05, y + 0.09 * kk, 'hot', u);                                    // hot-surface label on the basin side
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
      for (let i = 0; i < 3; i++) B(Fy, dx - tw / 2 + (i + 0.5) * tw / 3, v - td / 2 - 0.007, 0.014, th * 0.8, 0.016, C.steel, y + 0.05, u);      // vertical stiffener ribs on the tank (panel relief)
      DP(Fy, dx + tw / 2 + 0.03, v, td * 0.82, th * 0.85, y + 0.06 * kk, 'fins', u, 'x', 0.05, 0x9aa4ad);              // radiator bank (fin texture)
      SH(Fy, dx, v, tw + 0.1, td + 0.1, y + 0.001, C.concDark, 0x34363a, 0.12);
      DP(Fy, dx - 0.18 * tw, v - td / 2 - 0.012, 0.13 * kk, 0.065 * kk, y + 0.28 * kk, 'hv', u);                         // high-voltage warning
      Ly(Fy, dx, v + td * 0.1, 0.055 * kk, tw * 0.9, C.xfmr, y + 0.03 + th + 0.1 * kk, 't', u);                    // the conservator
      for (const k of [-1, 0, 1]) {
        const bx = dx + k * tw * 0.3;
        Cy(Fy, bx, v - td * 0.2, 0.034 * kk, 0.26 * kk, C.porc, y + 0.03 + th + 0.02 * kk, u, 0.024 * kk);        // HV bushings
        for (const hh of [0.07, 0.13, 0.19]) Cy(Fy, bx, v - td * 0.2, 0.048 * kk, 0.01, C.porc, y + 0.03 + th + hh * kk, u);
        Cy(Fy, bx, v - td * 0.2, 0.012 * kk, 0.03 * kk, C.copper, y + 0.03 + th + 0.28 * kk, u);
      }
      for (const k of [-1.5, -0.5, 0.5, 1.5]) Cy(Fy, dx + k * tw * 0.2, v + td * 0.33, 0.016 * kk, 0.09 * kk, C.porc, y + 0.03 + th + 0.02 * kk, u);   // LV bushings
      DP(Fy, dx + 0.167 * tw, v - td / 2 - 0.012, 0.085 * kk, 0.042 * kk, y + 0.13 * kk, 'plate', u, 'z', 0.01);                         // nameplate
      for (const sd of [-1, 1]) B(Fy, dx + sd * (tw * 0.65), v - td * 0.2, 0.025, 0.62 * kk, 0.025, C.steel, y + 0.03, u);   // gantry posts
      B(Fy, dx, v - td * 0.2, tw * 1.35, 0.025, 0.03, C.steel, y + 0.03 + 0.6 * kk, u);                             // crossbeam
      for (const k of [-1, 0, 1]) Cy(Fy, dx + k * tw * 0.3, v - td * 0.2, 0.01 * kk, 0.12 * kk, C.porc, y + 0.03 + 0.48 * kk, u);   // insulator strings
      // the fence line round the pad
      const fw = tw + 0.4, fd = td + 0.4;
      for (const sd of [-1, 1]) { B(Fy, dx + sd * fw / 2, v, 0.012, 0.012, fd, C.pipe, y + 0.2 * kk, u); B(Fy, dx + sd * fw / 2, v, 0.012, 0.012, fd, C.pipe, y + 0.34 * kk, u); B(Fy, dx, v + sd * fd / 2, fw, 0.012, 0.012, C.pipe, y + 0.2 * kk, u); B(Fy, dx, v + sd * fd / 2, fw, 0.012, 0.012, C.pipe, y + 0.34 * kk, u); }
      for (const [px, pz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1]]) Cy(Fy, dx + px * fw / 2, v + pz * fd / 2, 0.01, 0.4 * kk, C.steel, y, u);
    };
    xfmr('substation', v1); if (spare('substation')) xfmr('substation2', v2);
    // ── geothermal purchases (save v107): the header vault and the well head stand in the aisle side of the yard; the tower on its pad; the bore field outside ──
    const geo = o.geo ?? {};
    if (geo.loop) {
      // the loop's header vault: a curbed slab, a flush steel lid, supply (blue) and return (red) headers on stands with isolation valves and a flow plate, and the pipe down into the ground
      const hx = (tier === 'arcology' ? 0.2 : 0.25) * W, hv = D * (tier === 'arcology' ? 0.9 : 0.2), y = 0.045, u = 'chiller';   // (the arcology's intake and exhaust ducts fill the middle of its yard: the loop and the well go past them at the outer end)
      B(Fy, hx, hv, 0.5 * kk, 0.03, 0.4 * kk, C.concDark, y, u); SH(Fy, hx, hv, 0.5 * kk, 0.4 * kk, y + 0.001, C.concDark, 0x34363a, 0.08);
      B(Fy, hx, hv, 0.32 * kk, 0.025, 0.24 * kk, C.steel, y + 0.03, u); DP(Fy, hx, hv - 0.121 * kk - 0.004, 0.1 * kk, 0.05 * kk, y + 0.032, 'plate', u, 'z', 0.008);
      for (const [off, col] of [[-0.06, 0x2f7fb5], [0.06, C.valve]] as const) {
        Ly(Fy, hx, hv + off * kk, 0.014 * kk, 0.4 * kk, col, y + 0.09 * kk, 't', u);
        for (const sx of [-0.15, 0.15]) { Cy(Fy, hx + sx * kk, hv + off * kk, 0.012 * kk, 0.09 * kk, C.steel, y + 0.03, u); Cy(Fy, hx + sx * kk, hv + off * kk, 0.03 * kk, 0.012, C.valve, y + 0.11 * kk, u); }
      }
      DP(Fy, hx + 0.26 * kk, hv, 0.18 * kk, 0.09 * kk, y + 0.02, 'pleats', u, 'x', 0.01);                // the buried-header marker plate on the vault's end
      B(Fy, hx, hv + 0.23 * kk, 0.1 * kk, 0.04 * kk, 0.008, 0x2a7fd0, y + 0.1 * kk, u);                  // a flow-meter band
      noteUnit('loop', Fy.x, Fy.z);
    }
    if (geo.well) {
      // the deep well's head: a concrete pad, the steel casing and its sanitary cap, the pump control cabinet with a door decal and warning label, a pressure tank on saddles, and the supply line
      const wx = (tier === 'arcology' ? 0.32 : 0.27) * W, wv = D * (tier === 'arcology' ? 0.9 : 0.5), y = 0.045;
      B(Fy, wx, wv, 0.46 * kk, 0.03, 0.4 * kk, C.concDark, y); SH(Fy, wx, wv, 0.46 * kk, 0.4 * kk, y + 0.001, C.concDark, 0x34363a, 0.08);
      Cy(Fy, wx - 0.1 * kk, wv, 0.04 * kk, 0.22 * kk, C.steel, y + 0.03); Cy(Fy, wx - 0.1 * kk, wv, 0.05 * kk, 0.02, C.cap, y + 0.03 + 0.22 * kk); Cy(Fy, wx - 0.1 * kk, wv, 0.012 * kk, 0.05 * kk, C.dark, y + 0.05 + 0.22 * kk);
      B(Fy, wx + 0.1 * kk, wv - 0.1 * kk, 0.12 * kk, 0.22 * kk, 0.08 * kk, 0xd5d8d8, y + 0.03); DP(Fy, wx + 0.1 * kk, wv - 0.1 * kk - 0.044 * kk, 0.09 * kk, 0.15 * kk, y + 0.06 * kk, 'door', undefined, 'z', 0.008); DP(Fy, wx + 0.1 * kk, wv - 0.1 * kk - 0.046 * kk, 0.06 * kk, 0.03 * kk, y + 0.2 * kk, 'hv', undefined, 'z', 0.008);
      Ly(Fy, wx + 0.02 * kk, wv + 0.1 * kk, 0.045 * kk, 0.26 * kk, C.tankBlue, y + 0.07 * kk, 't'); for (const sx of [-0.08, 0.08]) B(Fy, wx + 0.02 * kk + sx * kk, wv + 0.1 * kk, 0.02 * kk, 0.05 * kk, 0.06 * kk, C.steel, y + 0.03);
      Ly(Fy, wx - 0.1 * kk, wv + 0.05 * kk, 0.01 * kk, 0.22 * kk, C.pipe, y + 0.1 * kk, 'r'); Cy(Fy, wx - 0.1 * kk, wv + 0.14 * kk, 0.026 * kk, 0.012, C.valve, y + 0.12 * kk);
      for (const [px, pz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) Cy(Fy, wx + px * 0.24 * kk, wv + pz * 0.21 * kk, 0.008, 0.12 * kk, C.yellow, y);
      noteUnit('well', Fy.x, Fy.z);
    }
    if (geo.tower) {
      // the fitted tower on the pad at the yard's outer corner (it is the one unit outside the wall): a fenced basin, a two-cell body with fill louvers, two fan stacks with grilles, a platform and a plume
      const [tx, tz] = g.towerSlot, tw = 0.5, td = 0.36, y = 0.025, u = 'chiller', Ft: Fr = { x: tx, z: tz, rot: g.phi }, n0 = parts.length;
      B(Ft, 0, 0, tw + 0.06, 0.12 * kk + 0.1, td + 0.06, C.concDark, y - 0.1, u); B(Ft, 0, 0, tw, 0.4 * kk, td, C.tower, y + 0.12 * kk, u);
      for (const sd of [-1, 1]) DP(Ft, 0, sd * (td / 2 + 0.006), tw * 0.92, 0.3 * kk, y + 0.16 * kk, 'louver', u, 'z', 0.012, 0xc4cad0);
      for (const sx of [-1, 1]) { Cy(Ft, sx * tw * 0.24, 0, tw * 0.2, 0.1 * kk, C.tower, y + 0.52 * kk, u, tw * 0.23); fan(Ft, sx * tw * 0.24, 0, tw * 0.19, y + 0.62 * kk, u); Cy(Ft, sx * tw * 0.24 + 0.01, 0, 0.07 * kk, 0.14 * kk, C.plume, y + 0.635 * kk, u, 0.13 * kk); }
      B(Ft, 0, td / 2 + 0.2, 0.2, 0.012, 0.012, C.pipe, y + 0.05, u); Ly(Ft, -tw / 2 - 0.1, 0, 0.02 * kk, 0.2, C.pipe, y + 0.06, 'r', u);
      DP(Ft, -tw * 0.3, -td / 2 - 0.014, 0.1, 0.05, y + 0.07 * kk, 'hot', u);
      for (const sd of [-1, 1]) Cy(Ft, sd * (tw / 2 + 0.05), td / 2 + 0.05, 0.008, 0.14 * kk, C.steel, y, u);
      for (let i = n0; i < parts.length; i++) parts[i].gat = [tx, tz];
    }
    if (geo.loop && (geo.bores ?? 0) > 0) {
      // the bore field outside the yard: a header trench strip out from the wall and a true 20 ft grid of flush caps (drawn up to a cap; the rest of the field is the same pattern)
      const f = geoField(g, geo.bores!, geo.wet ? (u, v) => { const [wx, wz] = yardPoint(g, u, v); return geo.wet!(wx, wz); } : undefined);
      const hu = (tier === 'arcology' ? 0.2 : 0.25) * W, [tx0, tz0] = yardPoint(g, hu, D + 0.02), [tx1, tz1] = yardPoint(g, hu, f.v0);
      push({ shape: 'box', x: (tx0 + tx1) / 2, z: (tz0 + tz1) / 2, y0: 0.002, w: 0.07, h: 0.012, d: Math.hypot(tx1 - tx0, tz1 - tz0), r: 0, rot: g.phi, color: 0x5d5646 });
      for (const c of f.caps) {
        const [bx, bz] = yardPoint(g, c.u, c.v);
        push({ shape: 'cyl', x: bx, z: bz, y0: 0.0, w: 0, h: 0.02, d: 0, r: 0.05, rot: 0, color: 0x6e7479 });
        push({ shape: 'cyl', x: bx, z: bz, y0: 0.02, w: 0, h: 0.008, d: 0, r: 0.034, rot: 0, color: 0x2e3338 });
      }
      const [fx, fz] = yardPoint(g, f.uMid, f.vMid);
      lines.push({ kind: 'chill', depth: 0.1, pts: [yardPoint(g, hu, D * (tier === 'arcology' ? 0.9 : 0.2)), yardPoint(g, hu, D + 0.02), [tx1, tz1], [fx, fz]] });
    }
    // pipe and conduit runs across the slab, bollards by the walkway, a light pole at the outer corner
    Ly(Fy, -0.255 * W, v1, 0.012, 0.22 * W, C.pipe, 0.08, 't', 'chiller');
    Ly(Fy, -0.04 * W, D / 2, 0.01, D * 0.5, C.dark, 0.06, 'r', 'substation');
    for (const k of [0, 1, 2]) bollard(Fy, pu + (k - 1) * 0.0 + 0.3 + (k % 2) * 0.0, D * 0.2 + k * D * 0.25);
    for (const k of [-1, 1]) Cy(Fy, -W / 2 + 0.2, D * (k > 0 ? 0.85 : 0.2), 0.012, 0.72, C.dark, 0);
    for (const id of ['chiller', 'chiller2', 'substation', 'substation2']) { const q = parts.filter(p => p.unit === id); if (q.length) noteUnit(id, q.reduce((a, p) => a + p.x, 0) / q.length, q.reduce((a, p) => a + p.z, 0) / q.length); }

    // ── the portal: the service airlock inside the shell, the sealed passage and the inner door: a real hollow tunnel (steel lining, floor, ceiling lamps) with two sliding leaves ──
    {
      const Pf: Fr = { x: loc(Fy, pu, 0)[0], z: loc(Fy, pu, 0)[1], rot: g.phi };
      const shellDz = -g.portal.len + 0.12, pw = PORTAL_W, ph = PORTAL_H, cl = CHAMBER_LEN, look = o.airlock ?? 'sealed';
      const P1 = (extra: Partial<PlantPart> = {}): Partial<PlantPart> => ({ passage: true, ...extra });
      const S1 = (extra: Partial<PlantPart> = {}): Partial<PlantPart> => ({ passage: true, steel: true, ...extra });      // (an armored wall or leaf: the dome's panel steel)
      const LIN = 0xb7c1c7, LIN2 = 0x98a3aa, FLR = 0x6c757b, tw = 0.04;
      const lampCol = (open: boolean): number => (look === 'cycling' ? 0xffb020 : open ? 0x30d070 : 0xd0382a);
      // the passage: a poured tunnel through the footing and the band, up to the inner door (walls, ceiling and a floor; the lining faces are a lighter steel so the inside reads)
      const plen = g.portal.len, pz = 0.12 - plen / 2;
      for (const sd of [-1, 1]) B(Pf, sd * (pw / 2 - tw / 2), pz, tw, ph, plen, LIN, 0, undefined, 0, S1());
      B(Pf, 0, pz, pw, tw, plen, LIN2, ph - tw, undefined, 0, S1());
      { const [lx, lz] = loc(Pf, 0, pz); lamps.push({ x: lx, z: lz, y: ph - 0.012, ceil: 'gnd', k: 0.42 }); }
      B(Pf, 0, pz, pw * 0.5, 0.004, 0.14, 0xffffff, ph - tw - 0.004, undefined, 0, P1({ decal: { cell: 'light', face: 'ny' } }));      // a lit ceiling panel (glows by day too)
      // the inner door on the yard side: a steel leaf with a hazard stripe, a handle and its state lamp; it slides aside when open
      const inOpen = look === 'yard' || look === 'both', ix = inOpen ? pw * 0.82 : 0;
      B(Pf, ix, 0.115, pw * 0.8, ph * 0.9, 0.025, C.gate, 0, undefined, 0, S1()); B(Pf, ix, 0.13, pw * 0.8, 0.03, 0.01, C.hazard, ph * 0.55, undefined, 0, P1());
      if (inOpen) B(Pf, pw * 0.5, 0.115, pw * 1.7, 0.03, 0.05, C.cap, ph * 0.92, undefined, 0, P1());       // (its track)
      B(Pf, -pw * 0.62, 0.135, 0.045, 0.045, 0.014, lampCol(inOpen), ph * 0.75, undefined, 0, P1());
      // the airlock chamber on the inside of the shell: armored walls, ceiling and floor with a steel lining and a lamp, the dome-side leaf with a wheel and its state lamp, jambs, a hood and bollards
      const cl2 = cl + 0.03, cz = shellDz - cl / 2 - 0.03 + 0.015, dzC = shellDz - cl - 0.03 - 0.012;
      for (const sd of [-1, 1]) B(Pf, sd * (pw / 2 + 0.03), cz, 0.06, ph + 0.06, cl2, 0x7b858c, 0, undefined, 0, S1());
      B(Pf, 0, cz, pw + 0.12, 0.06, cl2, C.armor, ph, undefined, 0, S1());
      B(Pf, 0, (cz - cl2 / 2 + 0.12) / 2, pw, 0.012, 0.12 - (cz - cl2 / 2), FLR, 0, undefined, 0, P1());      // (one floor for the chamber and the passage)
      { const [lx, lz] = loc(Pf, 0, cz); lamps.push({ x: lx, z: lz, y: ph - 0.012, ceil: 'gnd', k: 0.42 }); }
      B(Pf, 0, cz, pw * 0.5, 0.004, 0.2, 0xffffff, ph - 0.004, undefined, 0, P1({ decal: { cell: 'light', face: 'ny' } }));
      B(Pf, -pw * 0.5, dzC, 0.04, ph, 0.04, C.cap, 0, undefined, 0, P1()); B(Pf, pw * 0.5, dzC, 0.04, ph, 0.04, C.cap, 0, undefined, 0, P1());
      const dOpen = look === 'dome' || look === 'both', dx = dOpen ? pw * 0.9 : 0;
      B(Pf, dx, dzC + 0.004, pw * 0.8, ph * 0.9, 0.025, C.gate, 0, undefined, 0, S1()); B(Pf, dx, dzC - 0.01, pw * 0.8, 0.03, 0.01, C.hazard, ph * 0.5, undefined, 0, P1());
      B(Pf, -pw * 0.62, dzC - 0.012, 0.045, 0.045, 0.012, lampCol(dOpen), ph * 0.75, undefined, 0, P1());   // wheel and the state lamp
      if (dOpen) B(Pf, pw * 0.5, dzC, pw * 1.7, 0.03, 0.05, C.cap, ph * 0.92, undefined, 0, P1());
      B(Pf, 0, dzC - 0.04, pw * 0.95, 0.025, 0.08, C.roof, ph * 0.97, undefined, 0, P1());
      bollard(Pf, -pw * 0.8, dzC - 0.12); bollard(Pf, pw * 0.8, dzC - 0.12);
      void shellDz;
    }
  }

  // ── on the structure: roof vent hatches (armored louvers on the arcology) ──
  const phis = (k: number, off: number): number[] => Array.from({ length: k }, (_, i) => off + i * Math.PI * 2 / k);
  const hatches = level === 0 ? 1 : 2 + level, theta = 0.3;
  // (the arcology has no roof vent hatches: the plant breathes through the filtered, valved intake and exhaust in its armored yard, nothing opens in the skin)
  if (tier !== 'earthen' && tier !== 'arcology') for (const [i, phi] of phis(hatches, 0.5).entries()) {
    const [x, z] = polar(r * Math.sin(theta), phi), vc = C.steel;
    parts.push({ shape: 'box', x, z, y0: r * Math.cos(theta), w: 0.5 * s * 0.8, h: 0.1 * s, d: 0.5 * s * 0.8, r: 0, rot: phi, color: vc, onShell: { theta, phi }, unit: 'vents' });
    parts.push({ shape: 'box', x, z, y0: r * Math.cos(theta), w: 0.5 * s * 0.8, h: 0.03 * s, d: 0.36 * s, r: 0, rot: phi, color: C.louver, onShell: { theta, phi }, unit: 'vents' });
    if (level >= 1 && i % 2 === 0) parts.push({ shape: 'cyl', x, z, y0: r * Math.cos(theta), w: 0, h: 0.55 * s, d: 0, r: 0.045 * s, rot: phi, color: C.steel, onShell: { theta, phi }, unit: 'vents' });
  }
  if (tier !== 'earthen' && tier !== 'arcology') noteUnit('vents', polar(r * Math.sin(theta), 0.5)[0], polar(r * Math.sin(theta), 0.5)[1]);

  // ── buried lines: power from the substation, chilled water from the chillers, both under the footing in sealed sleeves; the compound feeder; the passage ──
  if (yard) {
    const sp0 = spans[0], pu = yard.portal.u;
    const line = (k: PlantLine['kind'], depth: number, ...pts: Array<[number, number]>): void => { lines.push({ kind: k, depth, pts }); };
    const inner = (u: number): [number, number] => polar(r - 0.9, sp0 + u / r);
    line('power', 0.12, yardPoint(yard, 0.06 * yard.W, yard.D / 2), yardPoint(yard, 0.06 * yard.W, -0.1), inner(0.06 * yard.W));
    line('chill', 0.1, yardPoint(yard, -0.14 * yard.W, yard.D / 2), yardPoint(yard, -0.14 * yard.W, -0.1), inner(-0.14 * yard.W));
    line('feeder', 0.14, inner(0.06 * yard.W), polar(r * 0.45, sp0));
    if (n > 1 && (hasWater || hasBank)) line('water', 0.1, polar(r - 0.9, spans[1]), polar(r * 0.45, spans[1]));
    line('passage', 0.1, yard.portal.from, yard.portal.to);
    void pu;
  }

  // ── path lamps: along the ways in from each airlock, both sides, warm heads (the renderer lights them with the night); yard lights ──
  const stepL = 1.15;
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
  // the yard is a graded pad: its equipment, slab and curbs stand on the one level plane (the walls and roof already do), so the slab never lies under the ground at a corner
  if (yard) for (const q of parts) if (!q.lvl && !q.high && !q.onShell && q.wallTop === undefined && !q.passage && inYard(yard, 0, 0, q.x, q.z)) q.lvl = true;
  return { level, scale: s, parts, lamps, lines, units: unitSpots, yard, spans };
}
