/**
 * The vehicle sally port of a dome (owner request 2026-11-19, "the road leading into the dome is graphically logical"). A dome that trucks, tractors and
 * deliveries use gets one vehicle airlock: a larger `Airlock` (role `vehicle`) with two sliding gates on an interlock and a lock chamber as long as a
 * truck, bollards, a camera and a light on the outside, and a paved apron the access road ends at. It uses the same rules as a person airlock (the outer
 * gate shuts before the inner one opens, a raid at the gate faces a kill zone at the inner one) with a longer hold, because a truck takes longer to
 * clear than a person. Pure, no state and no THREE (tested in vehiclePort.test.ts). Every number marked PROPOSED waits for the owner's sign-off
 * (docs/DECISIONS.md, 2026-11-19 "Vehicle sally port").
 *
 *  Where it stands   on the shell, on the side that faces the approach road, shifted along the shell to the nearest free arc: never in the plant yard's span,
 *                    never inside the inside plant's spans, never within a person airlock's, a link airlock's or a bunker hatch's lane (`blockedArcs`). Deterministic:
 *                    the angle is stamped on the structure when the dome is staked (`Structure.portAngle`, optional, so no save bump); a dome staked before this
 *                    existed takes the same rule with the road taken to come in from the east (the county road runs along the east line).
 *  The road          `approachRoute` re-plans the last stretch of the drive: it leaves the old drive where it first meets the dome's keep-out (shell, berm, yard
 *                    wall), goes round the yard when it must, and meets the port's axis in a straight final approach of three truck lengths or more that ends in the apron.
 *  Inside            a paved lane from the inner gate to a pad (`insideLane`): vehicles stop on pavement, never on the lawn.
 *  Other tiers       earthen: no port (a low door; a pickup stops at a gravel apron outside and carries in); geodesic: a pickup-length port; glass: a box-truck port;
 *                    arcology: a large vehicle bay. A link between domes is a walkway or a tunnel for people: it is not a vehicle entrance (links.ts), a vehicle always uses its
 *                    dome's own port.
 */
import { FRAME_SPANS, TIER, type DomeTier } from './tiers';
import { plantSize, yardGeometry, type YardGeom } from './plantYard';
import type { Vestibule } from './vestibule';
import type { MaterialId } from '../materials';
import { MATERIALS } from '../materials';

export type Pt = [number, number];
const TAU = Math.PI * 2;
/** Person airlock chamber widths (the same table as standing.ts, kept here so this module stays below it in the import order). */
const VESTIBULE: Record<DomeTier, { w: number }> = { earthen: { w: 0.24 }, geodesic: { w: 0.42 }, glass: { w: 0.55 }, arcology: { w: 1.7 } };

/** The vehicles the port is sized for (world units, SCALE v2: 20 ft a unit). A pickup is 0.92 long (`game/perimeter/gateKitLayout`), a box truck about 1.2, the motorhome 0.44 wide. */
export const TRUCK = { LEN: 1.2, WIDTH: 0.43, PICKUP: 0.95 } as const;

/** The paved apron outside the gate, and the straight run before it (units): three truck lengths or more of straight road in all, apron included (PROPOSED). */
export const APRON_LEN = 1.6, APPROACH_LEN = 2.4;
export const STRAIGHT_LEN = APRON_LEN + APPROACH_LEN;
/** How far clear of the other lanes on the shell the port stands (units of arc): a gap each side of the chamber (PROPOSED). */
export const PORT_CLEAR = 0.35;
/** The drive's own width (game/region/access `DRIVE_W`), kept here so the planner is pure. */
export const DRIVE_WIDTH = 0.55;
/** A dome whose keep-out lies within this of the drive's end takes the road to its port (units, 8 = 160 ft) even when the old drive did not touch it. */
export const ATTACH = 8;

/** The shape of each tier's port chamber (the same fields as a person airlock's `Vestibule`): outside width, run in from the shell, wall, height, door height, door share of the width. Earthen has none. */
const BASE: Record<Exclude<DomeTier, 'earthen'>, { w: number; len: number; t: number; h: number; dh: number; door: number; holdK: number; bollards: number }> = {
  geodesic: { w: 0.78, len: 1.0, t: 0.03, h: 0.46, dh: 0.38, door: 0.9, holdK: 1.5, bollards: 4 },
  glass: { w: 1.0, len: 1.4, t: 0.03, h: 0.55, dh: 0.46, door: 0.88, holdK: 1.5, bollards: 6 },
  arcology: { w: 2.7, len: 3.0, t: 0.06, h: 1.5, dh: 1.3, door: 0.85, holdK: 1.5, bollards: 12 },
};

/** Does a dome of this tier carry a vehicle port? Earthen: no (a low door and a gravel apron). */
export const hasVehiclePort = (tier: DomeTier): boolean => tier !== 'earthen';

/** The vehicle chamber of a dome of this tier whose shell stands at radius `r`: never longer than 70 percent of the radius (a small dome keeps its floor). Null for earthen. */
export function portVestibule(tier: DomeTier, r: number): Vestibule | null {
  if (tier === 'earthen') return null;
  const b = BASE[tier], len = Math.max(b.t * 4 + b.w * 0.5, Math.min(b.len, r * 0.7)), cw = b.w - 2 * b.t;
  return { w: b.w, len, cw, dw: cw * b.door, t: b.t, h: b.h, dh: b.dh };
}
/** The earthen dome's low door, as a frame for the apron (no chamber: a pickup stops outside). */
const EARTHEN_DOOR: Vestibule = { w: 0.24, len: 0.2, cw: 0.18, dw: 0.13, t: 0.03, h: 0.2, dh: 0.18 };
/** Does a vehicle drive in (the chamber holds a pickup)? A small dome's port is a vehicle gate with the lot outside and a handcart inside. */
export const vehicleFits = (v: Vestibule): boolean => v.len >= TRUCK.PICKUP && v.dw >= TRUCK.WIDTH + 0.2;

/** Seconds the port takes to cycle for a vehicle: both gates, the interlock and the clear (PROPOSED: a person airlock's 6 s times 3 for a truck's length and the gate's travel). */
export const PERSON_CYCLE_S = 6;
export const portCycleSeconds = (tier: DomeTier): number => (tier === 'earthen' ? 0 : Math.round(PERSON_CYCLE_S * BASE[tier].holdK * 2));
/** Seconds of kill-zone hold at the inner gate of a vehicle port: the person airlock's hold (siege.ts `SALLY_HOLD`) times the hold factor. */
export const portHoldSeconds = (tier: DomeTier, personHold: number): number => (tier === 'earthen' ? personHold : Math.round(personHold * BASE[tier].holdK));

// ── where it stands ──

/** The shortest angle between two world angles. */
export const angDist = (a: number, b: number): number => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return Math.abs(d); };
export const normAngle = (a: number): number => { const t = a % TAU; return t < 0 ? t + TAU : t; };

/** A stretch of the shell the port may not stand in: a centre angle and a half width (radians). */
export interface Arc { angle: number; half: number; why: string }
export interface PortCtx {
  tier: DomeTier;
  /** Shell radius, units. */
  r: number;
  /** Quarter turns of the dome. */
  rot: number;
  /** Angles of the link airlocks on the shell. */
  links?: readonly number[];
  /** Other lanes to keep clear (a bunker's hatch: angle and its half width in units of arc). */
  avoid?: ReadonlyArray<{ angle: number; width: number; why?: string }>;
}

/** The inside plant's span width, as `plant.ts` lays it: the equipment fills this much arc round the middle of each of the first two spans (units). */
function plantSpan(tier: DomeTier, r: number): number {
  const n = FRAME_SPANS[tier], step = TAU / n, inRho = r - (tier === 'arcology' ? 0.03 : 0.12) - 0.5;
  return Math.max(1.2, step * inRho - 2.4);
}

/**
 * The entrance module (owner, 2026-11-21): the person airlock and the vehicle port are two PARALLEL chambers side by side on one baseline, sharing one party wall, with the
 * outer doors in one plane, the inner doors in line and one roofline. Both axes point the same way (the port's `angle`, radially out from the dome's center); the person chamber
 * stands `personLateral` to the larger-angle side of the port's axis. The chambers touch (a wall each, no gap), so they cannot overlap inside the dome whatever the radius.
 * The doors stand in the plane `entryR` (the shell's radius at the far edge of the module), so a little behind the skin where the shell curves away.
 */
export function personLateral(tier: DomeTier, r: number): number {
  const v = portVestibule(tier, r);
  return v && moduleFits(tier, r) ? (v.w + VESTIBULE[tier].w) / 2 : 0;
}
/** Does the whole module (the port's chamber and the person's, side by side) fit inside the shell with room for its chambers? A tiny dome keeps the older layout: two radial chambers with a gap. */
export function moduleFits(tier: DomeTier, r: number): boolean {
  const v = portVestibule(tier, r);
  if (!v || tier === 'earthen' || TIER[tier].airlocks < 1) return false;
  return (v.w + VESTIBULE[tier].w) / 2 + VESTIBULE[tier].w / 2 <= 0.62 * r;
}
/** The gap (units) between the chambers of the older radial layout (tiny domes): the nav stubs need a ring step between them. */
function legacyGap(tier: DomeTier, r: number): number {
  const ring = tier === 'glass' ? 56 : Math.max(24, Math.min(72, Math.round(r * 8)));
  return Math.max(0.2, 2 * Math.PI * r / ring + 0.05);
}
/** The radius of the module's door plane: the shell's radius at the person chamber's far edge (the whole module then stands inside the skin). */
export function entryR(tier: DomeTier, r: number): number {
  if (!moduleFits(tier, r)) return r;
  const far = personLateral(tier, r) + VESTIBULE[tier].w / 2;
  return Math.sqrt(Math.max(r * r * 0.25, r * r - far * far));
}
/** The angle between the port's axis and the person airlock's axis (radians): zero in the module (the axes are parallel), the old radial offset for a tiny dome. */
export function personAngleOffset(tier: DomeTier, r: number): number {
  const v = portVestibule(tier, r);
  if (!v || tier === 'earthen' || TIER[tier].airlocks < 1 || moduleFits(tier, r)) return 0;
  return (v.w / 2 + VESTIBULE[tier].w / 2 + legacyGap(tier, r)) / r;
}
/** The angle between the port's axis and the person airlock's door center as seen from the dome's center (a compatibility figure for lanes and arcs). */
export function personOffset(tier: DomeTier, r: number): number {
  return moduleFits(tier, r) ? Math.atan2(personLateral(tier, r), entryR(tier, r)) : personAngleOffset(tier, r);
}
/**
 * The public entrances of a dome: the person airlock beside the vehicle port (one module, on the one approach). The arcology has this one entrance only (owner, 2026-11-21: no second
 * door; the escape tunnel is its sealed, egress-only emergency exit). `port` is the port's axis, which the person chamber shares (it stands at `personLateral` to its side).
 */
export function personAngles(tier: DomeTier, r: number, port: number): number[] {
  const n = TIER[tier].airlocks;
  if (!n || tier === 'earthen') return [];
  return [port + personAngleOffset(tier, r)];
}

/** Every stretch of the shell the gate complex must keep out of (centered on the port's axis; wide enough for the person airlock on either side). */
export function blockedArcs(c: PortCtx): Arc[] {
  const v = portVestibule(c.tier, c.r);
  if (!v) return [];
  const out: Arc[] = [], reach = v.w / 2 + personLateral(c.tier, c.r) + VESTIBULE[c.tier].w / 2;   // widest the complex reaches from the port's axis
  const turn = c.rot * Math.PI / 2;
  // the plant yard outside and the plant inside: the spans of the reference frame (glass and arcology)
  const y = yardGeometry(c.tier, c.r, c.rot);
  const arcs: Arc[] = [];
  if (y) {
    arcs.push({ angle: y.phi, half: (y.W / 2 + reach + PORT_CLEAR) / c.r, why: 'plant yard' });
    const span = plantSpan(c.tier, c.r), step = TAU / FRAME_SPANS[c.tier];
    for (const k of [0, 1]) arcs.push({ angle: k * step + step / 2 + turn, half: (span / 2 + reach + PORT_CLEAR) / c.r, why: 'plant spans' });
  }
  for (const l of c.links ?? []) arcs.push({ angle: l, half: (0.17 + reach + PORT_CLEAR) / c.r, why: 'link airlock' });
  for (const a of c.avoid ?? []) arcs.push({ angle: a.angle, half: (a.width + reach + PORT_CLEAR) / c.r, why: a.why ?? 'bunker hatch' });
  out.push(...arcs);
  // the second entrance stands opposite the complex: the same lanes must be clear there too
  if (TIER[c.tier].airlocks > 1) for (const a of arcs) out.push({ angle: a.angle + Math.PI, half: a.half, why: a.why + ' (second entrance)' });
  return out;
}

/** Clear angular room of an angle against the blocked arcs (negative inside one). */
const margin = (a: number, arcs: readonly Arc[]): number => arcs.reduce((m, b) => Math.min(m, angDist(a, b.angle) - b.half), Infinity);

/**
 * The port's angle: the free angle nearest to `want` (the bearing of the approach road from the dome, radians from +z toward +x). When no arc is free
 * (a tiny dome with every lane taken) it is the angle with the most room. Deterministic: ties go to the larger angle.
 */
export function choosePortAngle(c: PortCtx, want: number): { angle: number; free: boolean } {
  const arcs = blockedArcs(c), w = normAngle(want);
  if (!arcs.length || margin(w, arcs) >= 0) return { angle: w, free: true };
  const N = 720;
  let best = -1, bd = Infinity;
  for (let k = 0; k < N; k++) {
    const a = k * TAU / N;
    if (margin(a, arcs) < 0) continue;
    const d = angDist(a, w);
    if (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && a > best)) { bd = d; best = a; }
  }
  if (best >= 0) return { angle: best, free: true };
  let roomy = 0, mm = -Infinity;
  for (let k = 0; k < N; k++) { const a = k * TAU / N, m = margin(a, arcs); if (m > mm + 1e-9) { mm = m; roomy = a; } }
  return { angle: roomy, free: false };
}

/** The bearing a dome's port prefers when no road is known: the county road runs along the east line (+x), so the approach comes from the east. */
export const DEFAULT_BEARING = Math.PI / 2;

/** The bearing from a dome's centre to the nearest point of a drive (the side that faces the road). */
export function bearingToRoad(x: number, z: number, drive: readonly Pt[]): number {
  let best = DEFAULT_BEARING, bd = Infinity;
  for (let i = 1; i < drive.length; i++) {
    const [ax, az] = drive[i - 1], [bx, bz] = drive[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0, px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - x, pz - z);
    if (d < bd - 1e-9) { bd = d; best = Math.atan2(px - x, pz - z); }
  }
  return best;
}

// ── the port's frame in the world ──

export interface PortFrame {
  angle: number;
  /** Unit vector outward from the dome's centre (x, z). */
  u: Pt;
  /** The chamber and its doors. */
  v: Vestibule;
  /** Centre of the dome, shell radius. */
  cx: number; cz: number; r: number;
  /** The outer gate (on the shell), the inner gate, the middle of the chamber. */
  outer: Pt; inner: Pt; mid: Pt;
  /** Where the apron ends (its far edge on the axis) and where the straight run starts. */
  apronEnd: Pt; straightStart: Pt;
  /** The apron rectangle: centre, half length along the axis, half width across. */
  apron: { c: Pt; hl: number; hw: number };
  /** Bollard posts across the apron's mouth, a camera pole and a light, a guard booth beside the gate (world x, z). */
  bollards: Pt[]; camera: Pt; light: Pt; booth: Pt;
  /** Does a vehicle drive in (a chamber the length of a truck)? */
  fits: boolean;
  /** The main person airlock of the gate complex beside the port: its door outside (x, z) and axis angle (null: none). */
  person: { angle: number; outer: Pt } | null;
}

const at = (cx: number, cz: number, u: Pt, rho: number, lam = 0): Pt => [cx + u[0] * rho + u[1] * lam, cz + u[1] * rho - u[0] * lam];

/** The frame of the port of the dome at (cx, cz) whose shell has radius r, at `angle`. The earthen dome has only its low door: the frame is that door with a gravel apron (no gates, no lane). */
export function portFrame(tier: DomeTier, cx: number, cz: number, r: number, angle: number): PortFrame | null {
  const v = portVestibule(tier, r) ?? EARTHEN_DOOR;
  const u: Pt = [Math.sin(angle), Math.cos(angle)], lat = tier === 'earthen' ? 0 : personLateral(tier, r), r0 = r, off = tier === 'earthen' ? 0 : lat || personAngleOffset(tier, r0) * r0;
  r = entryR(tier, r0);
  // the apron reaches across the port's door and the person airlock's beside it (the larger-angle side)
  const hw = v.dw / 2 + 0.45 + off / 2;
  const apronC = at(cx, cz, u, r + APRON_LEN / 2, off / 2);
  const bollards: Pt[] = [];
  const nb = tier === 'earthen' ? 0 : BASE[tier].bollards;
  for (let i = 0; i < nb; i++) { const s = (i + 0.5) / nb * 2 - 1; bollards.push(at(cx, cz, u, r + APRON_LEN - 0.12, off / 2 + s * (hw + 0.1))); }
  return {
    angle, u, v, cx, cz, r,
    outer: at(cx, cz, u, r), inner: at(cx, cz, u, r - v.len), mid: at(cx, cz, u, r - v.len / 2),
    apronEnd: at(cx, cz, u, r + APRON_LEN), straightStart: at(cx, cz, u, r + STRAIGHT_LEN),
    apron: { c: apronC, hl: APRON_LEN / 2, hw },
    bollards, camera: at(cx, cz, u, r + 0.35, -(v.cw / 2 + 0.3)), light: at(cx, cz, u, r + 0.35, -(v.cw / 2 + 0.55)), booth: at(cx, cz, u, r + 0.55, -(v.cw / 2 + 0.85)),
    fits: tier !== 'earthen' && vehicleFits(v),
    person: tier === 'earthen' ? null : lat ? { angle, outer: at(cx, cz, u, r, lat) } : (() => { const pa = angle + personAngleOffset(tier, r0); return { angle: pa, outer: [cx + Math.sin(pa) * r, cz + Math.cos(pa) * r] as Pt }; })(),
  };
}

/** Is a world point on the apron (with `pad` to spare)? */
export function onApron(f: PortFrame, x: number, z: number, pad = 0): boolean {
  const dx = x - f.apron.c[0], dz = z - f.apron.c[1], a = dx * f.u[0] + dz * f.u[1], b = dx * f.u[1] - dz * f.u[0];
  return Math.abs(a) <= f.apron.hl + pad && Math.abs(b) <= f.apron.hw + pad;
}

// ── inside: the paved lane ──

export interface InsideLane {
  /** The centre line from the inner gate to the pad. */
  pts: Pt[];
  /** The pad's centre, and its half size (a square of the vehicle's turning). */
  pad: Pt; half: number;
  /** Width of the lane. */
  w: number;
}

/** The paved lane that continues the drive inside: from the inner gate straight in along the axis to a pad. Null when the chamber does not hold a vehicle or the dome is too small to have a floor beyond it. */
export function insideLane(f: PortFrame): InsideLane | null {
  if (!f.fits) return null;
  const reach = f.r - f.v.len - 0.5, len = Math.min(2.6, reach);
  if (len < 0.7) return null;
  const rhoPad = f.r - f.v.len - len;
  return { pts: [f.inner, at(f.cx, f.cz, f.u, f.r - f.v.len - len * 0.5), at(f.cx, f.cz, f.u, rhoPad)], pad: at(f.cx, f.cz, f.u, rhoPad), half: 0.55, w: Math.min(f.v.dw, 0.7) };
}

// ── the road ──

export interface Keepout {
  /** The dome: centre and the radius of its footprint (shell plus berm). */
  cx: number; cz: number; footR: number;
  /** The plant yard's four corners in world coordinates (null: none). */
  yard?: ReadonlyArray<Pt> | null;
}
const KEEP_PAD = 0.3 + DRIVE_WIDTH / 2;

const inPoly = (poly: ReadonlyArray<Pt>, x: number, z: number): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};
const distSeg = (p: Pt, a: Pt, b: Pt): number => {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dz * t));
};
/** Is a point inside the keep-out: the footprint, or the yard's wall plus a margin (the road never goes through either)? */
export function inKeepout(k: Keepout, x: number, z: number, pad = KEEP_PAD): boolean {
  if (Math.hypot(x - k.cx, z - k.cz) < k.footR + pad) return true;
  if (!k.yard) return false;
  if (inPoly(k.yard, x, z)) return true;
  for (let i = 0; i < k.yard.length; i++) if (distSeg([x, z], k.yard[i], k.yard[(i + 1) % k.yard.length]) < pad) return true;
  return false;
}

/** The yard's wall ring as world corners for a dome, or null. */
export function yardCorners(tier: DomeTier, cx: number, cz: number, r: number, rot: number): Pt[] | null {
  const g: YardGeom | null = yardGeometry(tier, r, rot);
  return g ? g.corners.map(([x, z]) => [x + cx, z + cz] as Pt) : null;
}

export interface Approach {
  /** The whole new drive: the old one up to where it was cut, then the new stretch, ending on the port's outer gate. */
  route: Pt[];
  /** Index in `route` where the old drive ends and the new stretch starts. */
  joinAt: number;
  /** The old drive met the keep-out and was cut, or only ended near the dome and was extended. */
  cut: boolean;
}

const sampleOk = (k: Keepout, a: Pt, b: Pt, exempt: (x: number, z: number) => boolean): boolean => {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 0.2));
  for (let i = 0; i <= n; i++) { const x = a[0] + (b[0] - a[0]) * i / n, z = a[1] + (b[1] - a[1]) * i / n; if (!exempt(x, z) && inKeepout(k, x, z)) return false; }
  return true;
};

/** Catmull-Rom resample of a polyline (the same as game/region/access `smoothLine`, kept here so this module stays pure). */
export function smooth(pts: readonly Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * Re-plan the last stretch of `drive` (from the county road to the yard) so it meets the port. The old drive is kept up to the last point before it enters the dome's
 * keep-out (the footprint or the yard wall, plus the drive's own width and a margin); from there a new stretch runs straight at the port's axis when that is clear,
 * else round the dome (and its yard) on a ring and then in along the axis, ending on the outer gate. The last `STRAIGHT_LEN` units are exactly the axis. A drive that
 * never meets the keep-out but ends within `ATTACH` of it is extended the same way; one that ends farther away is left alone (null). `gateIndex` is the first point
 * that may be cut (the gate on the property line stays).
 */
export function approachRoute(drive: readonly Pt[], k: Keepout, f: PortFrame, gateIndex = 0): Approach | null {
  if (drive.length < 2) return null;
  let first = -1;
  for (let i = Math.max(1, gateIndex + 1); i < drive.length; i++) if (inKeepout(k, drive[i][0], drive[i][1])) { first = i; break; }
  const cut = first >= 0;
  let j = cut ? first - 1 : drive.length - 1;
  if (!cut) {
    let near = Infinity;
    for (const p of drive) near = Math.min(near, Math.hypot(p[0] - k.cx, p[1] - k.cz) - k.footR);
    if (near > ATTACH) return null;
  }
  // the ring's radius: out past the yard (the farthest corner) or the footprint, and the straight run starts beyond it
  const yardOut = k.yard ? Math.max(...k.yard.map(([x, z]) => Math.hypot(x - k.cx, z - k.cz))) : 0;
  const ringBase = Math.max(k.footR + 0.5, yardOut + 0.6);
  const exemptApron = (x: number, z: number): boolean => onApron(f, x, z, 0.15) || (Math.abs((x - f.cx) * f.u[1] - (z - f.cz) * f.u[0]) < 0.2 && (x - f.cx) * f.u[0] + (z - f.cz) * f.u[1] > f.r - 0.1);
  const startJ = cut ? Math.max(gateIndex + 1, j - 3) : j;
  let body: Pt[] | null = null, aDist = f.r + STRAIGHT_LEN;
  // a gentle curve from a station of the old drive (leaving in its heading) onto the axis (arriving along it): a cubic with handles a third of the way. The join is the first
  // station, walking back from the keep-out, from which the turn is under 55 degrees and the curve is clear: a road that has to double back joins farther up instead
  for (let q = startJ; q > gateIndex && q >= startJ - 60 && !body; q--) {
    const B = drive[q];
    if (inKeepout(k, B[0], B[1])) continue;
    const prev = drive[Math.max(0, q - 1)], A = at(f.cx, f.cz, f.u, aDist);
    const dx = B[0] - prev[0], dz = B[1] - prev[1], l = Math.hypot(dx, dz) || 1, hd: Pt = [dx / l, dz / l], dist = Math.hypot(A[0] - B[0], A[1] - B[1]);
    const turn = Math.acos(Math.max(-1, Math.min(1, (hd[0] * (A[0] - B[0]) + hd[1] * (A[1] - B[1])) / (dist || 1))));
    // (a drive whose end already lies at the port needs no limit on the turn)
    if (turn > 0.96 && q > gateIndex + 1) continue;
    for (const hk of [0.38, 0.25, 0.55, 0.18]) {
      const h = Math.max(0.4, dist * hk), P1: Pt = [B[0] + hd[0] * h, B[1] + hd[1] * h], P2: Pt = [A[0] + f.u[0] * h, A[1] + f.u[1] * h], curve: Pt[] = [];
      for (let i = 0; i <= 14; i++) {
        const t = i / 14, s = 1 - t;
        curve.push([s * s * s * B[0] + 3 * s * s * t * P1[0] + 3 * s * t * t * P2[0] + t * t * t * A[0], s * s * s * B[1] + 3 * s * s * t * P1[1] + 3 * s * t * t * P2[1] + t * t * t * A[1]]);
      }
      // gentle: no bend over about 35 degrees between samples (a loop or a kink is refused)
      let bend = 0;
      for (let i = 2; i < curve.length; i++) bend = Math.max(bend, angDist(Math.atan2(curve[i - 1][0] - curve[i - 2][0], curve[i - 1][1] - curve[i - 2][1]), Math.atan2(curve[i][0] - curve[i - 1][0], curve[i][1] - curve[i - 1][1])));
      if (bend < 0.6 && curve.every((p, i) => i === 0 || sampleOk(k, curve[i - 1], p, exemptApron))) { body = curve; j = q; break; }
    }
  }
  if (!body) {
    // round the dome on a ring (the shorter way), then out or in along the axis
    j = startJ; while (j > gateIndex + 1 && inKeepout(k, drive[j][0], drive[j][1])) j--;
    const B = drive[j], prev = drive[Math.max(0, j - 1)], ring = Math.max(ringBase, f.r + STRAIGHT_LEN + 1.4, Math.hypot(B[0] - k.cx, B[1] - k.cz));
    aDist = f.r + STRAIGHT_LEN;
    const A = at(f.cx, f.cz, f.u, aDist), tB = Math.atan2(B[0] - k.cx, B[1] - k.cz), tA = f.angle;
    let d = normAngle(tA - tB); if (d > Math.PI) d -= TAU;
    // the arc stops a little short of the axis (`lead` radians before it), and a cubic carries the road in from there onto the axis, heading in along it
    const lead = Math.min(Math.abs(d), 1.3 / ring) * Math.sign(d), dArc = d - lead, steps = Math.max(1, Math.ceil(Math.abs(dArc) / 0.12)), pts: Pt[] = [B];
    for (let i = 1; i <= steps; i++) { const a = tB + dArc * i / steps; pts.push([k.cx + Math.sin(a) * ring, k.cz + Math.cos(a) * ring]); }
    const X = pts[pts.length - 1], tx: Pt = [Math.cos(tB + dArc) * Math.sign(d), -Math.sin(tB + dArc) * Math.sign(d)], hh = 0.8;
    const P1: Pt = [X[0] + tx[0] * hh, X[1] + tx[1] * hh], P2: Pt = [A[0] + f.u[0] * hh, A[1] + f.u[1] * hh];
    for (let i = 1; i <= 8; i++) { const t = i / 8, s = 1 - t; pts.push([s * s * s * X[0] + 3 * s * s * t * P1[0] + 3 * s * t * t * P2[0] + t * t * t * A[0], s * s * s * X[1] + 3 * s * s * t * P1[1] + 3 * s * t * t * P2[1] + t * t * t * A[1]]); }
    // (smoothed with the old drive's last station ahead of it for the heading; the samples up to B are dropped)
    body = smooth([prev, ...pts], 0.4).slice(Math.max(1, Math.ceil(Math.hypot(B[0] - prev[0], B[1] - prev[1]) / 0.4)));
  } else {
    // the curve reached A at aDist; the straight finish below carries on from there
    aDist = Math.hypot(body[body.length - 1][0] - f.cx, body[body.length - 1][1] - f.cz);
  }
  // the exact straight finish: A, the apron's far edge, the outer gate
  const finish: Pt[] = [];
  for (let d = aDist - 0.5; d > f.r + 0.001; d -= 0.5) finish.push(at(f.cx, f.cz, f.u, d));
  // (a port a truck drives into ends on the outer gate; the earthen door and a chamber too small for a truck end on the apron, where the truck stops)
  const stop = f.fits ? f.r : f.r + APRON_LEN * 0.6, O = at(f.cx, f.cz, f.u, stop), route: Pt[] = [...drive.slice(0, j + 1), ...body.slice(1), ...finish.filter(p => (p[0] - f.cx) * f.u[0] + (p[1] - f.cz) * f.u[1] > stop + 1e-6), O];
  return { route, joinAt: j, cut };
}

/** The straight run of the route: how long its last stretch is, exactly on the axis (units). */
export function straightRun(route: readonly Pt[], f: PortFrame): number {
  let len = 0;
  for (let i = route.length - 1; i > 0; i--) {
    const a = route[i - 1], b = route[i];
    const off = (p: Pt): number => Math.abs((p[0] - f.cx) * f.u[1] - (p[1] - f.cz) * f.u[0]), ahead = (p: Pt): number => (p[0] - f.cx) * f.u[0] + (p[1] - f.cz) * f.u[1];
    if (off(a) > 1e-6 || off(b) > 1e-6 || ahead(a) < ahead(b)) break;
    len += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return len;
}

/** The way a vehicle drives from the outer gate through the chamber to the pad inside (the delivery truck's tail). Just the outer gate when the chamber does not hold a vehicle. */
export function vehicleTail(f: PortFrame): Pt[] {
  const lane = insideLane(f);
  return lane ? [f.outer, ...lane.pts] : [f.outer];
}

// ── the bill ──

/** Anchors and goods: a vehicle airlock is more than one person airlock's kit: wide, long, two sliding gates on an interlock, sealed for the air plant. Plus bollards, a camera and the paving (PROPOSED). */
const KITS: Record<Exclude<DomeTier, 'earthen'>, number> = { geodesic: 2, glass: 3, arcology: 5 };
export interface PortBill { bill: Partial<Record<MaterialId, number>>; hours: number }

/** The goods and the person-hours of a tier's port (zero for earthen). The apron and the lane are concrete and rebar. */
export function portBill(tier: DomeTier, r: number): PortBill {
  if (tier === 'earthen') return { bill: {}, hours: 0 };
  const v = portVestibule(tier, r)!, b = BASE[tier];
  const apronSf = (APRON_LEN * (v.dw + 0.9)) * 400, laneSf = vehicleFits(v) ? Math.min(2.6, Math.max(0, r - v.len - 0.5)) * Math.min(v.dw, 0.7) * 400 : 0;
  const cy = Math.ceil((apronSf + laneSf) * 0.5 / 27);
  return {
    bill: { dome_airlock: KITS[tier], bollards: b.bollards, gate_intercom: 1, concrete: cy, rebar: Math.ceil(cy / 2.2) },
    hours: Math.round(120 * (v.w / 0.78) * (v.len / 1.0) + 40),
  };
}
export const portGoodsUsd = (bill: PortBill['bill']): number => (Object.entries(bill) as Array<[MaterialId, number]>).reduce((a, [m, n]) => a + (MATERIALS[m].price ?? 0) * n, 0);

/** What the port is, in one line for the card. */
export function portWords(tier: DomeTier, r: number): string {
  const v = portVestibule(tier, r);
  if (!v) return 'No vehicle port: a low door and a gravel apron outside; a pickup stops there and carries in';
  const ft = (u: number): number => Math.round(u * 20);
  return `Vehicle sally port: two interlocked sliding gates, a ${ft(v.len)} ft lock chamber ${ft(v.dw)} ft wide${vehicleFits(v) ? '' : ' (a handcart, not a truck)'}, bollards, a camera and a light, a paved apron outside${vehicleFits(v) ? ' and a paved lane inside' : ''}`;
}

export { plantSize };
