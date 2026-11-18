/**
 * The machinery a dome with a living ecology needs, as a pure layout (the renderer, game/fx/DomePlant.ts, only draws it). Owner decision of 2026-11-18:
 * everything that does not need open air stands INSIDE the protective shell, and what does need it stands in a hardened yard.
 *
 *   glass dome     the plant yard just inside the wall, in two spans between the airlocks: the air-handling and scrubber house (and a spare), the control room;
 *                  the water-recycling shed with its tanks, the pump house and the battery block. Chillers, the cooling tower and the substation stand
 *                  outside in the walled yard (plantYard.ts), which also has the gate, a camera mast and a pad for a tower.
 *   arcology       the same set built into the thickness of the armored band as a service gallery (machinery bays, an access door for each from inside, armored
 *                  louvers and intake slots in the band's outer face). Only the hardened yard stands outside, against the band.
 *   geodesic       the plant is packaged under the berm (nothing is drawn: the dome is small).
 *
 * What exists depends on the ecology (`Filtering`), the water loop and the spares bought (plantUnits.ts); how big it is on the dome's radius. Pipes and cables between
 * the yard, the plant bays and the compound are `lines`: buried (drawn in the underground view), crossing the footing only in sealed sleeves at the yard.
 *
 * Local frame: the dome's center at the origin, +z toward the first airlock, angles from +z toward +x (the sim's), `rot` quarter turns like the airlocks. Heights are above
 * the ground at the part. Lengths in world units (SCALE v2: 1 unit = 20 ft, a person 0.28). Pure, deterministic, tested in plant.test.ts.
 */
import type { Filtering } from './air';
import type { DomeTier } from './tiers';
import { TIER } from './tiers';
import type { WaterLoop } from './waterLoop';
import type { PlantKind, PlantPlace } from './plantUnits';
import { plantSize, yardGeometry, yardPoint, YARD_H, YARD_T, GATE_U, type YardGeom } from './plantYard';

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
  /** The plant unit it belongs to (`chiller`, `chiller2`, `air`...): a damaged unit is drawn burned. */
  unit?: string;
}
export interface PlantLamp { x: number; z: number; y: number }
/** A buried line: its kind, depth below the ground (world units) and the plan points. */
export interface PlantLine { kind: 'power' | 'chill' | 'water' | 'feeder'; depth: number; pts: Array<[number, number]> }
export interface PlantUnitSpot { id: string; kind: PlantKind; place: PlantPlace; x: number; z: number }
export interface Plant {
  level: number; scale: number; parts: PlantPart[]; lamps: PlantLamp[]; lines: PlantLine[]; units: PlantUnitSpot[];
  /** The hardened yard (glass and arcology), with its camera mast and tower slot, or null. */
  yard: YardGeom | null;
  /** The span angles (radians) the inside plant stands at, for the tests and the shots. */
  spans: number[];
}

export const LEVEL: Record<Filtering, number> = { none: 0, scrubber: 1, advanced: 2, closed: 3 };

/** Re-exported: the machinery's scale for a shell of radius `r` (world units). A glass dome (r 6) is 1. */
export { plantSize as plantScale };

const C = { wall: 0xb9b4a6, roof: 0x6f7378, steel: 0x8d949b, dark: 0x3b4046, louver: 0x4d5258, tank: 0xd8e0e6, tankBlue: 0x4f86ad, conc: 0xa6a8a4, concDark: 0x8f918d, cap: 0xc4c5c0, white: 0xe8e9e6, pipe: 0x9aa3ab, warm: 0xc79a4a, red: 0x9a3b32, gate: 0x4b5257, teal: 0x5f9c97, armor: 0x7b8087 };
/** Accent of each bay's door in the service gallery. */
const BAY: Record<string, number> = { air: C.teal, water: C.tankBlue, battery: C.warm, control: C.steel, pumps: C.pipe };

const polar = (rho: number, phi: number): [number, number] => [Math.sin(phi) * rho, Math.cos(phi) * rho];

export interface PlantOpts { loop?: WaterLoop; spares?: readonly PlantKind[]; rot?: number }

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
  const push = (p: PlantPart): void => { parts.push(p); };

  // ── helpers: a part in the plant frame just inside the wall, at arc offset `a` (world units, along the span) and depth `v` inward ──
  const inRho = (v: number): number => r - (tier === 'arcology' ? 0.03 : 0.12) - v;
  const spot = (span: number, a: number, v: number): { x: number; z: number; rot: number } => { const rho = inRho(v), phi = span + a / Math.max(1, rho), [x, z] = polar(rho, phi); return { x, z, rot: phi }; };
  const ibox = (span: number, a: number, v: number, w: number, h: number, d: number, color: number, y0 = 0, unit?: string): void => { const p = spot(span, a, v); push({ shape: 'box', x: p.x, z: p.z, y0, w, h, d, r: 0, rot: p.rot, color, ...(unit ? { unit } : {}) }); };
  const icyl = (span: number, a: number, v: number, rad: number, h: number, color: number, y0 = 0, unit?: string): void => { const p = spot(span, a, v); push({ shape: 'cyl', x: p.x, z: p.z, y0, w: 0, h, d: 0, r: rad, rot: p.rot, color, ...(unit ? { unit } : {}) }); };
  // a part in the yard frame (a rigid rectangle turned to the yard's angle): u along the shell, v out from the inner wall
  const ybox = (g: YardGeom, u: number, v: number, w: number, h: number, d: number, color: number, y0 = 0, unit?: string): void => { const [x, z] = yardPoint(g, u, v); push({ shape: 'box', x, z, y0, w, h, d, r: 0, rot: g.phi, color, ...(unit ? { unit } : {}) }); };
  const ycyl = (g: YardGeom, u: number, v: number, rad: number, h: number, color: number, y0 = 0, unit?: string): void => { const [x, z] = yardPoint(g, u, v); push({ shape: 'cyl', x, z, y0, w: 0, h, d: 0, r: rad, rot: g.phi, color, ...(unit ? { unit } : {}) }); };
  const seg = (ax: number, az: number, bx: number, bz: number, h: number, th: number, color: number, y0: number): void => {
    const len = Math.hypot(bx - ax, bz - az); if (len < 1e-4) return;
    push({ shape: 'box', x: (ax + bx) / 2, z: (az + bz) / 2, y0, w: len, h, d: th, r: 0, rot: Math.atan2(-(bz - az), bx - ax), color });
  };
  // a wall run in short pieces so it follows the ground (each is sunk a little at its foot), with a cap
  const wallRun = (ax: number, az: number, bx: number, bz: number): void => {
    const len = Math.hypot(bx - ax, bz - az), k = Math.max(1, Math.ceil(len / 0.9));
    for (let i = 0; i < k; i++) {
      const x0 = ax + (bx - ax) * i / k, z0 = az + (bz - az) * i / k, x1 = ax + (bx - ax) * (i + 1) / k, z1 = az + (bz - az) * (i + 1) / k;
      seg(x0, z0, x1, z1, YARD_H + 0.14, YARD_T, C.conc, -0.14);
      seg(x0, z0, x1, z1, 0.03, YARD_T + 0.04, C.cap, YARD_H);
    }
  };

  // ── the inside plant: spans between the airlocks, sequential with a fit factor so nothing reaches an airlock ──
  interface Item { id: string; w: number; draw: (span: number, a: number, f: number) => void; bay?: string; unit?: string }
  const avail = (span: number): number => { void span; return Math.max(1.2, step * inRho(0.5) - 2.4); };
  const airHouse = (unit: string): Item => ({ id: unit, unit, bay: 'air', w: 1.5 * s, draw: (sp, a, f) => {
    ibox(sp, a, 0.8 * s, 1.5 * s * f, 0.62 * s, 0.8 * s, C.wall, 0, unit); ibox(sp, a, 0.8 * s, 1.56 * s * f, 0.06 * s, 0.86 * s, C.roof, 0.62 * s, unit);
    for (let i = 0; i < 3; i++) ibox(sp, a - 0.5 * s * f + i * 0.5 * s * f, 0.38 * s, 0.3 * s * f, 0.3 * s, 0.03, C.louver, 0.18 * s, unit);
    icyl(sp, a - 0.5 * s * f, 0.8 * s, 0.07 * s, 0.95 * s, C.steel, 0.66 * s, unit); if (level >= 3) icyl(sp, a + 0.5 * s * f, 0.8 * s, 0.07 * s, 0.95 * s, C.steel, 0.66 * s, unit);
  } });
  const control: Item = { id: 'control', bay: 'control', w: 0.9 * s, draw: (sp, a, f) => {
    ibox(sp, a, 0.7 * s, 0.9 * s * f, 0.55 * s, 0.6 * s, C.wall); ibox(sp, a, 0.7 * s, 0.96 * s * f, 0.05 * s, 0.66 * s, C.roof, 0.55 * s);
    ibox(sp, a, 0.38 * s, 0.5 * s * f, 0.16 * s, 0.02, 0x2d3a44, 0.26 * s);   // the window of the control room
    ibox(sp, a + 0.28 * s * f, 0.38 * s, 0.14 * s * f, 0.34 * s, 0.025, C.dark, 0);   // its door
  } };
  const pumps: Item = { id: 'pumps', bay: 'pumps', w: 0.8 * s, unit: hasWater ? 'water' : undefined, draw: (sp, a, f) => {
    ibox(sp, a, 0.7 * s, 0.8 * s * f, 0.4 * s, 0.55 * s, C.wall, 0, hasWater ? 'water' : undefined); ibox(sp, a, 0.7 * s, 0.86 * s * f, 0.04 * s, 0.6 * s, C.roof, 0.4 * s, hasWater ? 'water' : undefined);
    icyl(sp, a - 0.2 * s * f, 0.25 * s, 0.06 * s, 0.22 * s, C.tankBlue, 0, hasWater ? 'water' : undefined);
  } };
  const waterShed: Item = { id: 'water', unit: 'water', bay: 'water', w: (1.2 + (hasBank ? 2.2 : 1.1)) * s, draw: (sp, a, f) => {
    const w0 = a - (hasBank ? 1.1 : 0.55) * s * f;
    ibox(sp, w0, 0.9 * s, 1.2 * s * f, 0.5 * s, 0.65 * s, C.wall, 0, 'water'); ibox(sp, w0, 0.9 * s, 1.26 * s * f, 0.05 * s, 0.7 * s, C.roof, 0.5 * s, 'water');
    const tanks = hasBank ? 4 : 2;
    for (let i = 0; i < tanks; i++) icyl(sp, w0 + (1.2 + 0.1 + i * 0.55) * s * f, (1.0 + (i % 2) * 0.15) * s, 0.22 * s * f, 0.6 * s, i % 2 ? C.tankBlue : C.tank, 0, 'water');
  } };
  const battery: Item = { id: 'battery', unit: 'battery', bay: 'battery', w: 2.1 * s, draw: (sp, a, f) => {
    ibox(sp, a, 1.0 * s, 2.1 * s * f, 0.03, 0.8 * s, C.conc);
    for (let i = 0; i < 4; i++) ibox(sp, a + (i - 1.5) * 0.5 * s * f, 1.0 * s, 0.42 * s * f, 0.4 * s, 0.62 * s, C.white, 0.03, 'battery');
  } };

  const spanItems = (idx: 0 | 1): Item[] => {
    const out: Item[] = [];
    if (idx === 0) { if (hasAir) { out.push(airHouse('air')); if (spare('air')) out.push(airHouse('air2')); out.push(control); } else out.push(control); }
    else { if (hasWater) out.push(waterShed, pumps); if (hasBank) out.push(battery); }
    return out;
  };
  const spotOf = new Map<string, { x: number; z: number }>();
  const noteUnit = (id: string, x: number, z: number): void => { if (!spotOf.has(id)) spotOf.set(id, { x, z }); };
  if (tier === 'glass' || tier === 'geodesic') {
    ([0, 1] as const).forEach(idx => {
      if (idx === 1 && n < 2) return;
      const items = spanItems(idx), sp = spans[idx] ?? spans[0];
      if (!items.length) return;
      const gap = 0.3 * s, total = items.reduce((a, it) => a + it.w, 0) + gap * (items.length - 1), f = Math.min(1, avail(sp) / total);
      let cur = -total * f / 2;
      for (const it of items) {
        const mid = cur + it.w * f / 2; it.draw(sp, mid, f);
        const p = spot(sp, mid, 0.8 * s); if (it.unit) noteUnit(it.unit, p.x, p.z);
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
      // one bay per item, two for the battery block and the water plant with its tanks
      const bays: Array<{ it: Item; unit?: string; key: string }> = [];
      for (const it of items) { const count = it.id === 'battery' || it.id === 'water' ? 2 : 1; for (let k = 0; k < count; k++) bays.push({ it, unit: it.unit, key: it.bay ?? it.id }); }
      const bw = Math.min(0.95 * s, avail(sp) / bays.length), total = bw * bays.length;
      bays.forEach((b, i) => {
        const a = -total / 2 + bw * (i + 0.5), vC = depth / 2;
        const body = spot(sp, a, vC), door = spot(sp, a, depth + 0.012), roofP = spot(sp, a, vC);
        push({ shape: 'box', x: body.x, z: body.z, y0: 0, w: bw * 0.98, h: bandH, d: depth, r: 0, rot: body.rot, color: C.armor, ...(b.unit ? { unit: b.unit } : {}) });
        push({ shape: 'box', x: roofP.x, z: roofP.z, y0: bandH, w: bw, h: 0.05, d: depth + 0.04, r: 0, rot: roofP.rot, color: C.roof, ...(b.unit ? { unit: b.unit } : {}) });
        push({ shape: 'box', x: door.x, z: door.z, y0: 0, w: bw * 0.6, h: 0.4, d: 0.03, r: 0, rot: door.rot, color: C.dark, ...(b.unit ? { unit: b.unit } : {}) });
        const stripe = spot(sp, a, depth + 0.02);
        push({ shape: 'box', x: stripe.x, z: stripe.z, y0: 0.42, w: bw * 0.6, h: 0.05, d: 0.03, r: 0, rot: stripe.rot, color: BAY[b.key] ?? C.steel, ...(b.unit ? { unit: b.unit } : {}) });
        const lamp = spot(sp, a, depth + 0.03);
        push({ shape: 'box', x: lamp.x, z: lamp.z, y0: 0.5, w: 0.06, h: 0.04, d: 0.04, r: 0, rot: lamp.rot, color: C.white });
        // the intake and exhaust slots in the band's outer face for the bays that breathe
        const slots = b.key === 'air' ? 3 : b.key === 'battery' ? 2 : b.key === 'water' ? 1 : 0, phi = sp + a / r, [lx, lz] = polar(r + 0.03, phi);
        for (let k = 0; k < slots; k++) push({ shape: 'box', x: lx, z: lz, y0: 0.18 + k * 0.17, w: bw * 0.55, h: 0.07, d: 0.045, r: 0, rot: phi, color: C.louver, high: true, ...(b.unit ? { unit: b.unit } : {}) });
        if (b.unit) noteUnit(b.unit, body.x, body.z);
      });
    });
  }

  // ── outside: the hardened yard ──
  if (yard) {
    const g = yard, W = g.W, D = g.D;
    ybox(g, 0, D / 2, W - 0.2, 0.025, D - 0.2, C.concDark);   // the yard's slab
    // the wall: four sides, the gate gap on the outer one
    const P = (u: number, v: number): [number, number] => yardPoint(g, u, v), gw = g.gate.w, gu = GATE_U * W;
    const [a0, a1, a2, a3] = [P(-W / 2, 0), P(W / 2, 0), P(W / 2, D), P(-W / 2, D)];
    wallRun(a0[0], a0[1], a1[0], a1[1]); wallRun(a1[0], a1[1], a2[0], a2[1]); wallRun(a3[0], a3[1], a0[0], a0[1]);
    const gl = P(gu - gw / 2, D), gr = P(gu + gw / 2, D);
    wallRun(a2[0], a2[1], gr[0], gr[1]); wallRun(gl[0], gl[1], a3[0], a3[1]);
    // pilasters at the corners and at the gate, and the two steel gate leaves
    for (const [x, z] of [a0, a1, a2, a3, gl, gr]) push({ shape: 'box', x, z, y0: -0.14, w: 0.16, h: YARD_H + 0.3, d: 0.16, r: 0, rot: g.phi, color: C.cap });
    for (const sgn of [-1, 1]) { const c = P(gu + sgn * gw / 4, D); push({ shape: 'box', x: c[0], z: c[1], y0: 0, w: gw / 2 - 0.02, h: 0.5, d: 0.04, r: 0, rot: g.phi, color: C.gate }); const m = P(gu + sgn * gw / 4, D + 0.02); push({ shape: 'box', x: m[0], z: m[1], y0: 0.5, w: gw / 2 - 0.02, h: 0.03, d: 0.05, r: 0, rot: g.phi, color: C.dark }); }
    // the camera mast at the outer corner, and the pad where a tower can stand
    push({ shape: 'cyl', x: g.camera[0], z: g.camera[1], y0: 0, w: 0, h: 0.95, d: 0, r: 0.016, rot: g.phi, color: C.dark });
    push({ shape: 'box', x: g.camera[0], z: g.camera[1], y0: 0.93, w: 0.07, h: 0.045, d: 0.12, r: 0, rot: g.phi + 0.6, color: C.louver });
    push({ shape: 'box', x: g.towerSlot[0], z: g.towerSlot[1], y0: 0, w: 0.46, h: 0.025, d: 0.46, r: 0, rot: g.phi, color: C.concDark });
    for (const [du, dv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const [bx, bz] = [g.towerSlot[0] + (du * g.et[0] + dv * g.er[0]) * 0.17, g.towerSlot[1] + (du * g.et[1] + dv * g.er[1]) * 0.17]; push({ shape: 'cyl', x: bx, z: bz, y0: 0.02, w: 0, h: 0.04, d: 0, r: 0.018, rot: 0, color: C.steel }); }
    // the equipment: a cooling tower and the chillers on the left, the substation in the middle, the aisle in from the gate on the right
    const bw = Math.min(0.9 * s, W * 0.18), dd = Math.min(0.5 * s, D * 0.34), v1 = D * 0.32, v2 = D * 0.7;
    const chill = (id: string, v: number): void => { ybox(g, -0.14 * W, v, bw, 0.42 * s, dd, C.white, 0.025, id); ycyl(g, -0.14 * W, v, Math.min(0.17 * s, bw * 0.35), 0.05, C.dark, 0.025 + 0.42 * s, id); };
    chill('chiller', v1); if (spare('chiller')) chill('chiller2', v2);
    ybox(g, -0.37 * W, D / 2, Math.min(0.7 * s, W * 0.17), 0.78 * s, Math.min(0.7 * s, D * 0.5), C.tank, 0.025, 'chiller'); ycyl(g, -0.37 * W, D / 2, Math.min(0.26 * s, W * 0.07), 0.07, C.dark, 0.025 + 0.78 * s, 'chiller');
    const xfmr = (id: string, v: number): void => { ybox(g, 0.06 * W, v, Math.min(0.55 * s, W * 0.14), 0.5 * s, dd, C.steel, 0.025, id); for (const k of [-1, 0, 1]) ycyl(g, 0.06 * W + k * Math.min(0.14 * s, W * 0.035), v, 0.04 * s, 0.2 * s, C.red, 0.025 + 0.5 * s, id); };
    xfmr('substation', v1); if (spare('substation')) xfmr('substation2', v2);
    // the pipes and bus bars lying across the slab
    ybox(g, -0.255 * W, v1, 0.22 * W, 0.03, 0.05, C.pipe, 0.03, 'chiller');
    ybox(g, -0.04 * W, D / 2, 0.02, 0.03, D * 0.5, C.dark, 0.03, 'substation');
    const gy = P(gu, D - 0.4);
    // units' spots
    for (const id of ['chiller', 'chiller2', 'substation', 'substation2']) { const q = parts.filter(p => p.unit === id); if (q.length) noteUnit(id, q.reduce((a, p) => a + p.x, 0) / q.length, q.reduce((a, p) => a + p.z, 0) / q.length); }
    void gy;
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

  // ── buried lines: power from the substation, chilled water from the chillers, both under the footing in sealed sleeves; the compound feeder ──
  const sleeve = (g: YardGeom, u: number): Array<[number, number]> => [yardPoint(g, u, D_OF(g) * 0.5), yardPoint(g, u, -0.1), polar(r - 0.4, g.phi + u / r)];
  const D_OF = (g: YardGeom): number => g.D;
  if (yard && spotOf.size) {
    const sp0 = spans[0];
    lines.push({ kind: 'power', depth: 0.12, pts: [...sleeve(yard, 0.06 * yard.W), polar(r - 0.9, sp0)] });
    lines.push({ kind: 'chill', depth: 0.1, pts: [...sleeve(yard, -0.14 * yard.W), polar(r - 0.9, sp0 - 0.1)] });
    lines.push({ kind: 'feeder', depth: 0.14, pts: [polar(r - 0.9, sp0), polar(r * 0.45, sp0)] });
    if (n > 1 && (hasWater || hasBank)) lines.push({ kind: 'water', depth: 0.1, pts: [polar(r - 0.9, spans[1]), polar(r * 0.45, spans[1])] });
  }

  // ── path lamps: along the ways in from each airlock, both sides, warm heads (the renderer lights them with the night) ──
  const lamps: PlantLamp[] = [], stepL = 1.15;
  for (const a of angles) {
    for (let d = r * 0.9, k = 0; d > r * 0.32 && lamps.length < 90; d -= stepL, k++) {
      const side = k % 2 ? 1 : -1, [x, z] = polar(d, a), off = 0.42 * side;
      lamps.push({ x: x + Math.cos(a) * off, z: z - Math.sin(a) * off, y: 0.6 });
    }
  }
  if (yard) { const p = yardPoint(yard, GATE_U * yard.W, yard.D + 0.35); lamps.push({ x: p[0], z: p[1], y: 0.6 }); }
  if (tier === 'glass' && level >= 1) { const q = spot(spans[0], 0, 2.1 * s); lamps.push({ x: q.x, z: q.z, y: 0.6 }); }

  const unitSpots: PlantUnitSpot[] = [];
  for (const [id, p] of spotOf) { const kind = id.replace(/2$/, '') as PlantKind; unitSpots.push({ id, kind, place: tier === 'arcology' && kind !== 'vents' && kind !== 'chiller' && kind !== 'substation' ? 'gallery' : kind === 'chiller' || kind === 'substation' ? (yard ? 'yard' : 'inside') : 'inside', x: p.x, z: p.z }); }
  void YARD_T;
  return { level, scale: s, parts, lamps, lines, units: unitSpots, yard, spans };
}
