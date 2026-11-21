/**
 * The four enclosures (sim/dome/): an earthen dome, a geodesic dome, a glass-and-steel dome and the arcology. Procedural, layered for construction
 * (shell.ts Parts: stakes, foundation, frame, roof panels, airlocks, interior), merged per layer x material so a dome is a handful of draw calls.
 * SCALE v2: 1 unit = 20 ft, a person 0.28. A dome is a circle inscribed in its square footprint, stands on a stem wall that follows the hill
 * (`opts.ground`), and takes no pad: what the family builds under it keeps its own.
 *
 *  Earthen   20 ft: plastered earthbag courses, a sod crown, one low arched door.
 *  Geodesic  60 ft: a triangulated aluminum frame with twin-wall polycarbonate panes, a berm round its foot, two airlocks.
 *  Glass     150 ft: a steel gridshell (meridians and parallels) glazed in laminated glass, a ring beam, an oculus, three airlocks.
 *  Arcology  360 ft: a dark space frame holding clear armored panels, an armored skirt band with a light line, six airlock towers, a crown spire.
 */
import * as THREE from 'three';
import { CELL, type KitPieceDef } from './kit';
import { detailTier, type DetailTier } from './buildingDetail';
import { pipe } from './interior';
import { box, Parts, type BuildOpts } from './shell';
import type { KitMaterialId } from './materials';
import { CELL_FT, TIER, tierOfKind, type DomeTier } from '../../sim/dome/tiers';
import { airlockAngles } from '../../sim/dome/standing';
import { digState } from '../../sim/dome/dig';
import type { BuildLayer } from './shell';
import { intakeAngles } from '../../sim/dome/intake';
import { DEFAULT_BEARING, choosePortAngle, personAngles, portVestibule } from '../../sim/dome/vehiclePort';

/** The public entrances of a dome in its own frame (turn 0): the person airlock(s) of the gate complex and the vehicle port beside them (sim/dome/vehiclePort.ts). */
const entrancesFor = (tier: DomeTier, R: number, port: number | undefined): { port: number; persons: number[] } => {
  const p = port ?? choosePortAngle({ tier, r: R, rot: 0 }, DEFAULT_BEARING).angle;
  return { port: p, persons: personAngles(tier, R, p) };
};
import { SHELL_INSET, SURROUND_PAD, axisOf, chamberColliders, chamberRho, ringSkipped, vestibuleOf, type Vestibule } from '../../sim/dome/vestibule';

/** World units of berm banked round a dome's shell inside its footprint (the footprint is shell plus berm). */
const bermU = (t: DomeTier): number => TIER[t].bermFt / (CELL_FT / CELL);

type Pt3 = [number, number, number];
const TAU = Math.PI * 2;

/** Tier look: strut radius, stem wall height, shell base height, vestibule size. */
const LOOK: Record<DomeTier, { strut: number; stem: number; vestW: number; vestH: number; vestL: number }> = {
  earthen: { strut: 0, stem: 0.04, vestW: 0.24, vestH: 0.2, vestL: 0.2 },
  geodesic: { strut: 0.011, stem: 0.06, vestW: 0.42, vestH: 0.4, vestL: 0.5 },
  glass: { strut: 0.014, stem: 0.08, vestW: 0.55, vestH: 0.5, vestL: 0.7 },
  arcology: { strut: 0.03, stem: 0.14, vestW: 1.7, vestH: 1.55, vestL: 2.0 },
};

/** Airlock angles (radians from +z, the side the family arrives on): evenly spread, the first at the front. */
export { airlockAngles };
const at = (r: number, a: number, y: number): Pt3 => [r * Math.sin(a), y, r * Math.cos(a)];

/** A ring wall (annulus between r0 and r1) from `lo(a)` up to `top`, as one geometry; the bottom follows the ground. */
function ringWall(r0: number, r1: number, top: number, lo: (a: number) => number, n: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const quad = (a: Pt3, b: Pt3, c: Pt3, d: Pt3) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < n; i++) {
    const a0 = i * TAU / n, a1 = (i + 1) * TAU / n, l0 = lo(a0), l1 = lo(a1);
    // top (up), outer face (out), inner face (in): wound so the normals face away from the wall
    quad(at(r0, a0, top), at(r1, a0, top), at(r1, a1, top), at(r0, a1, top));
    quad(at(r1, a0, top), at(r1, a0, l0), at(r1, a1, l1), at(r1, a1, top));
    quad(at(r0, a1, top), at(r0, a1, l1), at(r0, a0, l0), at(r0, a0, top));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** A turfed berm round the foot of a dome: a sloped ring from the stem wall out to the natural ground, draped on it. */
function berm(R: number, reach: number, rise: number, ground: (x: number, z: number) => number, base: number, n: number): THREE.BufferGeometry {
  const pos: number[] = [], rings = 4;
  const rr = (k: number): number => R + 0.02 + reach * k / rings;
  const hh = (k: number): number => rise * Math.pow(1 - k / rings, 1.4);
  const P = (k: number, a: number): Pt3 => { const r = rr(k), x = r * Math.sin(a), z = r * Math.cos(a); return [x, k === rings ? ground(x, z) + 0.003 : Math.max(base, ground(x, z) + hh(k)), z]; };
  for (let i = 0; i < n; i++) for (let k = 0; k < rings; k++) {
    const a0 = i * TAU / n, a1 = (i + 1) * TAU / n;
    const A = P(k, a0), B = P(k, a1), C = P(k + 1, a1), D = P(k + 1, a0);
    pos.push(...A, ...D, ...C, ...A, ...C, ...B);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * An earth embankment under the foot of a big dome on a slope: the shell stands level, so on the downhill side the stem wall would show as a tall dark cliff
 * (a 600 ft dome on a 2 percent grade shows a 40 ft wall). This ring slopes from the stem wall's top out to the natural ground, as wide as the drop needs
 * (about 2.4 units out per unit down, capped), draped on the terrain; where the ground is at or above the wall it is nothing. Returns null on level ground.
 */
function embankment(R: number, ground: (x: number, z: number) => number, top: number, n: number): THREE.BufferGeometry | null {
  const pos: number[] = [], rings = 6, MAXR = 8;
  const drop = (a: number): number => Math.max(0, top - ground(R * Math.sin(a), R * Math.cos(a)));
  let any = false;
  // (the stem wall is itself `top` tall over level ground: an embankment is only for ground that falls away more than a stem's height below the base)
  for (let i = 0; i < n && !any; i++) { const a = i * TAU / n; if (ground(R * Math.sin(a), R * Math.cos(a)) < -0.12) any = true; }
  if (!any) return null;
  // the reach is smoothed round the ring so the slope does not crease between neighbours
  const raw = Array.from({ length: n }, (_, i) => Math.min(MAXR, drop(i * TAU / n) * 2.4));
  const reach = raw.map((_, i) => { let m = 0, c = 0; for (let k = -3; k <= 3; k++) { m += raw[(i + k + n) % n]; c++; } return m / c; });
  const P = (k: number, i: number): Pt3 => {
    const a = (i % n) * TAU / n, r = R + 0.05 + reach[i % n] * k / rings, x = r * Math.sin(a), z = r * Math.cos(a), t = k / rings;
    const lerp = top - (top - (ground(R * Math.sin(a) + 0, R * Math.cos(a) + 0) - 0.0)) * (t * t * (3 - 2 * t));
    return [x, k === 0 ? top : Math.max(ground(x, z) + 0.004, Math.min(top, lerp)), z];
  };
  for (let i = 0; i < n; i++) for (let k = 0; k < rings; k++) {
    const A = P(k, i), B = P(k, i + 1), C = P(k + 1, i + 1), D = P(k + 1, i);
    pos.push(...A, ...D, ...C, ...A, ...C, ...B);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Triangulated hemisphere: ring k has n*k vertices (k = 0 is the crown); returns vertices per ring and triangles as ring/index triples. */
function triDome(N: number, n = 6): { rings: number[][]; tris: Array<[[number, number], [number, number], [number, number]]> } {
  const rings: number[][] = [];
  for (let k = 0; k <= N; k++) rings.push(Array.from({ length: k === 0 ? 1 : n * k }, (_, j) => j));
  const tris: Array<[[number, number], [number, number], [number, number]]> = [];
  for (let k = 0; k < N; k++) {
    const mk = rings[k].length, mb = rings[k + 1].length;
    for (let s = 0; s < n; s++) {
      if (k === 0) { for (let i = 0; i < n; i++) tris.push([[0, 0], [1, i], [1, (i + 1) % n]]); break; }
      for (let i = 0; i <= k; i++) tris.push([[k, (s * k + i) % mk], [k + 1, (s * (k + 1) + i) % mb], [k + 1, (s * (k + 1) + i + 1) % mb]]);
      for (let i = 0; i < k; i++) tris.push([[k, (s * k + i) % mk], [k + 1, (s * (k + 1) + i + 1) % mb], [k, (s * k + i + 1) % mk]]);
    }
  }
  return { rings, tris };
}

const dir = (R: number, th: number, ph: number, y0: number): Pt3 => [R * Math.sin(th) * Math.sin(ph), y0 + R * Math.cos(th), R * Math.sin(th) * Math.cos(ph)];

/** A flat triangle, wound outward from the dome's center. */
function tri(a: Pt3, b: Pt3, c: Pt3, center: Pt3, inset = 0): THREE.BufferGeometry {
  let [A, B, C] = [a, b, c];
  if (inset) { const m: Pt3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]; const f = (p: Pt3): Pt3 => [m[0] + (p[0] - m[0]) * (1 - inset), m[1] + (p[1] - m[1]) * (1 - inset), m[2] + (p[2] - m[2]) * (1 - inset)]; [A, B, C] = [f(a), f(b), f(c)]; }
  const ab = new THREE.Vector3(B[0] - A[0], B[1] - A[1], B[2] - A[2]), ac = new THREE.Vector3(C[0] - A[0], C[1] - A[1], C[2] - A[2]), n = ab.cross(ac);
  const out = new THREE.Vector3((A[0] + B[0] + C[0]) / 3 - center[0], (A[1] + B[1] + C[1]) / 3 - center[1], (A[2] + B[2] + C[2]) / 3 - center[2]);
  const flip = n.dot(out) < 0;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(flip ? [...A, ...C, ...B] : [...A, ...B, ...C], 3));
  g.computeVertexNormals();
  return g;
}
/** A flat quad (a, b, c, d in order), wound outward. */
function quad(a: Pt3, b: Pt3, c: Pt3, d: Pt3, center: Pt3, inset = 0): THREE.BufferGeometry {
  const t1 = tri(a, b, c, center, inset), t2 = tri(a, c, d, center, inset);
  const pos = [...(t1.getAttribute('position').array as Float32Array), ...(t2.getAttribute('position').array as Float32Array)];
  t1.dispose(); t2.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
/** A strut: a pipe with `seg` sides between two points. */
const strut = (a: Pt3, b: Pt3, r: number, seg: number): THREE.BufferGeometry => pipe(a, b, r, seg);

/**
 * Where each airlock's doorway is cut in the shell. A shell is a lattice of panels, so a door cannot be cut along its own edge: every panel whose center falls in
 * the doorway window is left out and the hole's bounds grow to take in what was removed, then the airlock's surround plate (below) closes the gap round the
 * door. The struts along the removed edges go too. One `Doorways` per dome.
 */
class Doorways {
  readonly holes: Array<{ a: number; v: Vestibule; lam0: number; lam1: number; y1: number; vehicle?: boolean }> = [];
  private readonly R: number;
  private readonly y0: number;
  constructor(angles: number[], tier: DomeTier, R: number, y0: number, port: number | null = null) {
    this.R = R; this.y0 = y0;
    for (const a of angles) { const v = vestibuleOf(tier, R); this.holes.push({ a, v, lam0: -(v.cw / 2 + v.t), lam1: v.cw / 2 + v.t, y1: y0 + v.dh }); }
    // the vehicle sally port (sim/dome/vehiclePort.ts): a longer, wider chamber at its own angle on the shell
    const pv = port === null ? null : portVestibule(tier, R);
    if (pv && port !== null) this.holes.push({ a: port, v: pv, lam0: -(pv.cw / 2 + pv.t), lam1: pv.cw / 2 + pv.t, y1: y0 + pv.dh, vehicle: true });
  }
  private at(h: Doorways['holes'][number], x: number, z: number): [number, number] { const k = axisOf(h.a); return [x * k.ux + z * k.uz, x * k.vx + z * k.vz]; }
  /** Does this panel (its corners) sit in a doorway window? Grows the hole to cover it when it does. */
  takes(pts: Pt3[]): boolean {
    const cx = pts.reduce((q, c) => q + c[0], 0) / pts.length, cy = pts.reduce((q, c) => q + c[1], 0) / pts.length, cz = pts.reduce((q, c) => q + c[2], 0) / pts.length;
    for (const h of this.holes) {
      const [rho, lam] = this.at(h, cx, cz);
      if (rho < this.R * 0.5 || Math.abs(lam) > h.v.cw / 2 + h.v.t + 0.06 || cy - this.y0 > h.v.dh + 0.12) continue;
      for (const c of pts) { const [, l] = this.at(h, c[0], c[2]); h.lam0 = Math.min(h.lam0, l); h.lam1 = Math.max(h.lam1, l); h.y1 = Math.max(h.y1, c[1]); }
      return true;
    }
    return false;
  }
  /** A strut whose midpoint is inside a hole's bounds (the panel beside it was taken). */
  cuts(a: Pt3, b: Pt3): boolean {
    const m: Pt3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    return this.holes.some(h => { const [rho, lam] = this.at(h, m[0], m[2]); return rho > this.R * 0.5 && lam > h.lam0 - 0.01 && lam < h.lam1 + 0.01 && m[1] < h.y1 + 0.01; });
  }
  /** The shell's own radius at a distance `lam` off an airlock's axis (the surround plate follows the curve in short strips). */
  shellRho(lam: number): number { return Math.sqrt(Math.max(0.01, (this.R - SHELL_INSET) ** 2 - lam * lam)); }
}

/**
 * An airlock at angle `a` on a shell of radius R: a real two-door chamber inside the shell (sim/dome/vestibule.ts): an outer door in the shell's plane, a
 * hollow room between a pair of side walls with a lit, glazed ceiling, an inner door at its far end, the two doors standing ajar so the room reads from
 * outside and from above. A surround plate closes the ragged shell lattice around the outer door. The nav colliders are the same walls (`chamberColliders`).
 */
/**
 * QA and state: how the doors of every airlock built from now on are drawn. `open`: the outer door stands ajar or slid back and the inner one is sealed (the two are never open
 * together); `sealed`: both shut. The shots set it before the dome is placed; the game builds `open`.
 */
let doorLook: 'open' | 'sealed' = 'open';
export const setDoorLook = (d: 'open' | 'sealed'): void => { doorLook = d; };
export const getDoorLook = (): 'open' | 'sealed' => doorLook;

function airlock(p: Parts, tier: DomeTier, R: number, hole: Doorways['holes'][number], doors: Doorways, y0: number): void {
  const a = hole.a, v = hole.v, { outer, inner } = chamberRho(R, v), mid = (outer + inner) / 2, L = LOOK[tier];
  const place = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.rotateY(a);
  // the lining by tier: aluminum for the light geodesic, steel for the glass dome, dark armored steel for the arcology (never stucco)
  const wall: 'panel_light' | 'panel_steel' | 'panel_dark' = tier === 'geodesic' ? 'panel_light' : 'panel_steel';
  const rib: 'panel_light' | 'panel_steel' | 'panel_dark' = tier === 'arcology' ? 'panel_steel' : 'panel_dark';
  const half = v.cw / 2 + v.t / 2, stubW = v.cw / 2 + v.t - v.dw / 2, veh = !!hole.vehicle, len = outer - inner;
  const foot = y0 - 0.1, big = tier === 'arcology' ? 1.6 : 1;
  const X = (m: KitMaterialId, w: number, h: number, d: number, lam: number, y: number, rho: number): void => p.add(m, place(box(w, h, d, lam, y, rho)));
  p.layer = 'walls';
  // ── the sealed lining: floor plate, side walls and jambs, all steel, never stucco ──
  X('concrete', v.cw + 2 * v.t - 0.012, 0.01, len + v.t - 0.012, 0, foot + 0.02, mid);                                               // the floor plate: neutral grey concrete, never tan
  for (const s of [-1, 1]) X(wall, v.t, v.h + y0 - foot, len + v.t, s * half, foot, mid);                        // the side walls
  for (const rho of [inner, outer]) {
    for (const s of [-1, 1]) X(wall, stubW, v.h + y0 - foot, v.t, s * (v.dw / 2 + stubW / 2), foot, rho);        // the door jambs
    X(wall, v.dw, v.h - v.dh, v.t, 0, y0 + v.dh, rho);                                                           // the lintel
  }
  // panelled inner faces: a rib every few inches, a band at mid height, a hazard-striped kick plate, a vent grille and the air-shower strip
  const pitch = (tier === 'arcology' ? 0.45 : 0.6), nRib = Math.max(2, Math.floor(len / pitch)), inFace = v.cw / 2 - 0.004;
  for (let k = 0; k < nRib; k++) { const rho = inner + (k + 0.5) * len / nRib; for (const s of [-1, 1]) X(rib, 0.01, v.h - 0.08, 0.014, s * inFace, y0 + 0.05, rho); }
  for (const s of [-1, 1]) {
    X('panel_light', 0.018, 0.016, len, s * inFace, y0 + v.h * 0.5, mid);                                           // the band
    X('paint_yellow', 0.016, 0.035, len, s * inFace, y0, mid);   // hazard kick plate
    X('panel_dark', 0.024, v.dh * 0.22, Math.min(0.3, len * 0.3), s * inFace, y0 + v.dh * 0.52, mid + len * 0.18);       // the vent grille...
  }
  p.layer = 'roof';
  // the ceiling: glazed so the chamber reads from above, with aluminum panel joints, the air-shower strip (a row of nozzles) and lamp strips
  p.add(tier === 'geodesic' ? 'dome_polycarb' : tier === 'glass' ? 'dome_glass' : 'arcology', place(box(v.cw + 2 * v.t, 0.012, len + v.t, 0, y0 + v.h, mid)));
  for (const k of [0.1, 0.35, 0.6, 0.85]) X('panel_light', v.cw + 2 * v.t + 0.01, 0.016, 0.014, 0, y0 + v.h + 0.001, inner + len * k);
  const nz = 2;
  for (const s of [-1, 1]) { X('panel_light', 0.016, 0.012, len, s * v.cw * 0.28, y0 + v.h - 0.014, mid); for (let k = 0; k < nz; k++) X('panel_dark', 0.012, 0.014, 0.012, s * v.cw * 0.28, y0 + v.h - 0.026, inner + (k + 0.5) * len / nz); }
  X('lamp', v.cw * 0.5, 0.008, 0.03, 0, y0 + v.h - 0.02, mid - len * 0.22); X('lamp', v.cw * 0.5, 0.008, 0.03, 0, y0 + v.h - 0.02, mid + len * 0.22);
  // ── the surround: steel plates in the shell's plane round the outer door, as wide as the hole the doorway took out of the lattice; a heavy bulkhead frame where it meets the skin ──
  p.layer = 'walls';
  const lam0 = Math.min(hole.lam0, -(v.cw / 2 + v.t + SURROUND_PAD)), lam1 = Math.max(hole.lam1, v.cw / 2 + v.t + SURROUND_PAD), top = Math.max(hole.y1, y0 + v.h) + 0.02;
  const n = Math.max(2, Math.ceil((lam1 - lam0) / 0.11)), skin = tier === 'geodesic' ? 'panel_light' : 'panel_steel', glaze = tier === 'geodesic' ? 'dome_polycarb' : tier === 'glass' ? 'dome_glass' : 'arcology', capY = y0 + v.h + 0.02;
  for (let i = 0; i < n; i++) {
    const l = lam0 + (lam1 - lam0) * (i + 0.5) / n, w = (lam1 - lam0) / n + 0.004, rho = doors.shellRho(l) + 0.017, lo = Math.abs(l) < v.dw / 2 ? y0 + v.dh + 0.004 : y0;
    p.add(skin, place(box(w, capY - lo, 0.026, l, lo, rho)));                                                                    // the plate, up to the chamber's roof line
    if (top > capY) p.add(glaze, place(box(w, top - capY, 0.008, l, capY, rho - 0.008)));                                        // above it the hole the lattice lost is glazed again
  }
  const R0 = doors.shellRho(0) + 0.017;
  X('panel_light', lam1 - lam0, 0.016, 0.034, (lam0 + lam1) / 2, capY, R0);                                                         // the cap along the roof line
  for (const s of [-1, 1]) X('panel_dark', 0.022, capY - y0, 0.04, s === -1 ? lam0 : lam1, y0, doors.shellRho(s === -1 ? lam0 : lam1) + 0.017);    // sealed bulkhead rims at the skin
  // ── the doors ──
  p.layer = 'openings';
  const ds = Math.max(0.01, 0.02 * big), yb = Math.min(y0, foot + 0.03), dhb = v.dh + (y0 - yb);   // (the doors stand on the chamber floor, not on the stem wall's sill)
  /** The door frame: a recessed steel frame round the opening with a black gasket just inside it and bolt heads on its face. */
  const frame = (rho: number, face: 1 | -1): void => {
    const z = rho + face * (v.t / 2 + 0.004);
    X('panel_dark', 0.026, dhb + 0.02, 0.02, -(v.dw / 2 + 0.013), yb, z); X('panel_dark', 0.026, dhb + 0.02, 0.02, v.dw / 2 + 0.013, yb, z); X('panel_dark', v.dw + 0.052, 0.026, 0.02, 0, yb + dhb - 0.006, z);
    const gz = rho + face * 0.002;
    X('panel_dark', 0.012, dhb - 0.01, 0.014, -(v.dw / 2 - 0.004), yb, gz); X('panel_dark', 0.012, dhb - 0.01, 0.014, v.dw / 2 - 0.004, yb, gz); X('panel_dark', v.dw - 0.01, 0.012, 0.014, 0, yb + dhb - 0.016, gz);   // the gasket
  };
  /** The state panel over a door: a dark plate with three lamp windows (red sealed, amber cycling, green open); the world lights the one that is on (game/fx/VehiclePorts). */
  const panel = (rho: number, face: 1 | -1): void => {
    const z = rho + face * (v.t / 2 + 0.018), yy = y0 + v.dh + 0.035;
    X('panel_dark', 0.14 * big, 0.05 * big, 0.012, 0, yy, z);
    ([['paint_red', -0.04], ['paint_yellow', 0], ['paint_green', 0.04]] as const).forEach(([m, dx]) => X(m, 0.026 * big, 0.026 * big, 0.008, dx * big, yy + 0.012 * big, z + face * 0.008));
    X('panel_light', 0.14 * big, 0.008, 0.012, 0, yy - 0.012, z);   // the readout strip: pressure and air quality
  };
  /** A hatch-style leaf: a thick steel slab with a gasketed edge, a viewport, a latch wheel, locking bars and a hazard border. */
  const leaf = (g0: { w: number; lam: number; shut: boolean; rho: number; phi: number; pivot: number }): void => {
    const geoms: Array<[KitMaterialId, THREE.BufferGeometry]> = [];
    const w = g0.w, h = dhb * 0.97, put = (m: KitMaterialId, bw: number, bh: number, bd: number, x: number, y: number, z: number): void => { geoms.push([m, box(bw, bh, bd, x, y, z)]); };
    put('panel_steel', w, h, ds * 1.6, 0, 0, 0);                                                                // the leaf
    put('panel_dark', w * 0.9, 0.012, ds * 2.1, 0, h - 0.02, 0); put('panel_dark', w * 0.9, 0.012, ds * 2.1, 0, 0.02, 0);    // top and bottom rails
    put('paint_yellow', 0.014, h * 0.9, ds * 2.2, -w / 2 + 0.01, h * 0.05, 0); put('paint_yellow', 0.014, h * 0.9, ds * 2.2, w / 2 - 0.01, h * 0.05, 0);   // hazard edge bands
    put('panel_dark', 0.1 * big, 0.1 * big, ds * 2.4, w * 0.18, h * 0.62, 0);                                  // the viewport bezel
    put('glass', 0.07 * big, 0.07 * big, ds * 2.6, w * 0.18, h * 0.62 + 0.015 * big, 0);                 // ...and its glass
    for (let k = 0; k < 3; k++) { put('panel_dark', 0.05, 0.012, ds * 2.2, -w / 2 + 0.03, h * (0.22 + 0.25 * k), 0); put('panel_dark', 0.05, 0.012, ds * 2.2, w / 2 - 0.03, h * (0.22 + 0.25 * k), 0); }   // locking bars
    const wheel = new THREE.TorusGeometry(0.045 * big, 0.007, 5, 14).translate(-w * 0.18, h * 0.46, ds * 1.6); geoms.push(['panel_light', wheel]);   // the latch wheel
    put('panel_light', 0.09 * big, 0.008, 0.008, -w * 0.18, h * 0.46, ds * 1.8); put('panel_light', 0.008, 0.09 * big, 0.008, -w * 0.18, h * 0.46, ds * 1.8);
    for (const [m, g] of geoms) p.add(m, place((g0.phi ? g.translate(-w / 2, 0, 0) : g).rotateY(g0.phi).translate(g0.pivot + (g0.phi ? 0 : g0.lam), yb, g0.rho)));
  };
  /** A blast gate: two heavy plates that meet in the middle (or slide apart), a gasket seam, hazard bands on the leading edges, a track and a bottom guide. */
  const gate = (rho: number, face: 1 | -1, shut: boolean): void => {
    const z = rho + face * 0.026, w = v.dw / 2, open = shut ? 0 : w * 0.82;
    for (const s of [-1, 1]) {
      const cx = s * (w / 2 + open) , geoms: Array<[KitMaterialId, THREE.BufferGeometry]> = [];
      const put = (m: KitMaterialId, bw: number, bh: number, bd: number, x: number, y: number, zz: number): void => { geoms.push([m, box(bw, bh, bd, x, y, zz)]); };
      // a barred gate: a heavy frame, a solid kick plate below, vertical bars above (so it never reads as a plank wall) and a mid rail
      const gh = dhb * 0.97, nb = Math.max(4, Math.floor(w / 0.1)), plate = gh * 0.3;
      put('panel_dark', w, 0.03, 0.026, 0, 0, 0); put('panel_dark', w, 0.03, 0.026, 0, gh - 0.03, 0);
      put('panel_steel', w, plate, 0.02, 0, 0.03, 0);
      put('panel_dark', w, 0.016, 0.03, 0, gh * 0.62, 0);
      for (let k = 0; k < nb; k++) put('panel_light', 0.012, gh - 0.06 - plate, 0.016, -w / 2 + 0.03 + k * (w - 0.06) / (nb - 1), 0.03 + plate, 0);
      put('paint_yellow', 0.02, dhb * 0.97 - 0.01, 0.03, -s * (w / 2 - 0.012), 0.005, 0);                                     // hazard band on the leading edge
      put('panel_dark', 0.012, dhb * 0.97 - 0.02, 0.034, -s * (w / 2), 0.01, 0);                                                    // the gasket seam
      for (const [m, g] of geoms) p.add(m, place(g.translate(cx, yb, z)));
    }
    X('panel_dark', v.dw * (shut ? 1 : 1.9) + 0.1, 0.022, 0.04, 0, y0 + v.dh, z);                                          // the track
    X('panel_dark', v.dw + 0.2, 0.01, 0.03, 0, yb, z);                                                                    // the bottom guide
  };
  const outerShut = doorLook === 'sealed', innerShut = true;
  const personSwing = (rho: number, shut: boolean, into: 1 | -1): void => {
    const w = v.dw * 0.96;
    if (shut) leaf({ w, lam: 0, shut: true, rho: rho - into * 0.0, phi: 0, pivot: 0 });
    else leaf({ w, lam: 0, shut: false, rho, phi: into * 1.35, pivot: v.dw / 2 });
  };
  if (veh) { frame(outer, 1); frame(inner, -1); gate(outer, -1, outerShut); gate(inner, 1, innerShut); }
  else { frame(outer, 1); frame(inner, -1); personSwing(outer, outerShut, -1); personSwing(inner, innerShut, 1); }
  panel(outer, 1); panel(inner, -1);
  // the outer face: a hazard-chevron sign plate and the interlock lamp
  X('paint_yellow', 0.22 * big, 0.04 * big, 0.01, 0, y0 + v.dh + 0.09 * big, outer + v.t / 2 + 0.02);
  for (let k = 0; k < 3; k++) X('panel_dark', 0.018 * big, 0.04 * big, 0.012, (-0.04 + 0.04 * k) * big, y0 + v.dh + 0.09 * big, outer + v.t / 2 + 0.022);
  if (!veh && tier === 'arcology') {     // a lit door: light strips up both jambs and across the head, so the entrance reads at night and from far off
    const zf = outer + v.t / 2 + 0.03;
    for (const sx of [-1, 1]) X('lamp', 0.022, v.dh * 0.92, 0.012, sx * (v.dw / 2 + 0.03), y0 + v.dh / 2, zf);
    X('lamp', v.dw + 0.08, 0.022, 0.012, 0, y0 + v.dh + 0.035, zf);
  }
  p.layer = 'interior';
  p.add('concrete', place(box(v.cw * 1.1, 0.006, 0.5, 0, y0 - L.stem * 0.2 + 0.001, inner - 0.3)));   // (a steel threshold plate inside the inner door: no gravel or other brown)
}

/**
 * One bulkhead frame for a person airlock that abuts the vehicle port (the entrance complex): a continuous roof cap and base plinth across both chambers at one height, and a
 * heavy end post at each outer edge, so the two doors read as two openings in one armored structure. Short boxes along the arc, each squared to the shell.
 */
function bulkheadFrame(p: Parts, R: number, y0: number, holes: Doorways['holes']): void {
  const veh = holes.find(h => h.vehicle);
  if (!veh) return;
  for (const h of holes) {
    if (h.vehicle || Math.abs(Math.atan2(Math.sin(h.a - veh.a), Math.cos(h.a - veh.a))) * R > (h.v.w + veh.v.w) / 2 + 0.06) continue;
    const d = Math.atan2(Math.sin(h.a - veh.a), Math.cos(h.a - veh.a));
    const edgeA = veh.a - Math.sign(d) * veh.v.w / 2 / R, edgeB = h.a + Math.sign(d) * h.v.w / 2 / R, span = Math.atan2(Math.sin(edgeB - edgeA), Math.cos(edgeB - edgeA));
    const rho = Math.max(chamberRho(R, h.v).outer, chamberRho(R, veh.v).outer) + h.v.t / 2 + 0.016, top = y0 + Math.max(h.v.h, veh.v.h), n = 10, chord = Math.abs(span) * R / n + 0.01;
    p.layer = 'walls';
    for (let k = 0; k < n; k++) {
      const a = edgeA + span * (k + 0.5) / n;
      p.add('panel_dark', box(chord, 0.034, 0.05, 0, top - 0.02, rho).rotateY(a));          // the roof cap
      p.add('panel_dark', box(chord, 0.115, 0.05, 0, y0 - 0.1, rho).rotateY(a));             // the base plinth
    }
    for (const e of [edgeA, edgeB]) { p.add('panel_steel', box(0.05, top - y0 + 0.085, 0.06, 0, y0 - 0.095, rho).rotateY(e)); p.add('lamp', box(0.012, 0.05, 0.01, 0, top - 0.09, rho + 0.032).rotateY(e)); }   // the end posts with a lamp each
  }
}

/** The shell's colliders: the ring as short boxes with the airlocks' gaps left out, and each chamber's walls (so the chamber is a room and the doors are the only ways in). */
function shellColliders(p: Parts, R: number, ring: number, doors: Doorways): void {
  const gaps = doors.holes;
  for (let i = 0; i < ring; i++) {
    const a = (i + 0.5) * TAU / ring, h = Math.PI * R / ring;
    if (gaps.some(g => ringSkipped(a, R, g.a, g.v, h / R))) continue;
    const x = R * Math.sin(a), z = R * Math.cos(a);
    p.collide({ x0: x - h * Math.abs(Math.cos(a)) - 0.03, z0: z - h * Math.abs(Math.sin(a)) - 0.03, x1: x + h * Math.abs(Math.cos(a)) + 0.03, z1: z + h * Math.abs(Math.sin(a)) + 0.03 });
  }
  // (the shell ring leaves out every box that reaches the door's window, so the outer door's stubs run as far as those boxes did)
  for (const g of gaps) p.collide(...chamberColliders(R, g.a, g.v, 2 * Math.PI * R / ring + 0.02));
}


// ── the buried works: the skirt ring and the utilities laid on the pit floor before it (sim/dome/dig.ts) ──

/** The layers a dome times by its dig state (everything else follows the cabin timing in shell.layerFractions): the stem wall is poured at the end of the foundation stage, the stakes come out when the digging starts. The pit, skirt and utilities are drawn by buildkit/domeDig.ts. */
export function domeLayerFractions(tier: DomeTier): (stage: number, f: number, supplied: boolean) => Partial<Record<BuildLayer, number>> {
  return (stage, f, supplied) => {
    const d = digState(tier, stage, f, supplied);
    return { foundation: d.stem, stakes: stage === 0 && d.phase === 'layout' ? 1 : 0 };
  };
}

// ── the four builders ──

function earthen(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  const p = new Parts(seed, opts), R = def.cellsX * CELL / 2 - 0.02, L = LOOK.earthen, g = opts.ground ?? (() => 0);
  const rim = (a: number) => g(R * Math.sin(a), R * Math.cos(a));
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * (def.cellsX * CELL / 2 - 0.03), -0.02, sz * (def.cellsZ * CELL / 2 - 0.03)));
  p.layer = 'foundation';
  p.add('fieldstone', ringWall(R - 0.05, R + 0.03, L.stem, a => Math.min(L.stem - 0.02, rim(a) - 0.06), 24));
  p.layer = 'frame';
  // earthbag courses: the shell as stacked rings, each a little smaller (plaster over them reads as soft ridges)
  const prof: Array<[number, number]> = [];
  const rows = 14;
  for (let i = rows; i >= 0; i--) { const th = i / rows * Math.PI / 2, ridge = i < rows ? 0.008 * (i % 2 ? 1 : 0) : 0; prof.push([(R - 0.03 + ridge) * Math.sin(th) + 1e-4, L.stem + R * 0.95 * Math.cos(th)]); }   // (foot to crown: the lathe's faces then look outward)
  p.layer = 'roof';
  const lathe = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 40);
  p.add('adobe', lathe);
  // the sod crown: a thin green cap over the top fifth, standing a hair proud of the plaster
  const cap: Array<[number, number]> = [];
  for (let i = 5; i >= 0; i--) { const th = i / 5 * 0.62; cap.push([(R - 0.03) * 1.006 * Math.sin(th) + 1e-4, L.stem + R * 0.95 * 1.006 * Math.cos(th)]); }
  p.add('hedge', new THREE.LatheGeometry(cap.map(([x, y]) => new THREE.Vector2(x, y)), 28));
  p.layer = 'openings';
  // one low arched door on the front (+z): a dark recess, a lintel stone, a plank door
  // (a plastered entry porch standing out of the wall, so the door is a real six foot door and not a hole in a curve)
  p.add('adobe', box(0.3, 0.3, 0.2, 0, L.stem, R - 0.1));
  p.add('door', box(0.17, 0.26, 0.012, 0, L.stem, R + 0.003));
  p.add('fieldstone', box(0.34, 0.04, 0.22, 0, L.stem + 0.3, R - 0.1));
  p.add('metal_roof', new THREE.CylinderGeometry(0.02, 0.02, 0.05, 8).translate(0, L.stem + R * 0.95 + 0.02, 0));   // the vent pipe
  p.collide({ x0: -R * 0.85, z0: -R * 0.85, x1: R * 0.85, z1: R * 0.6 });
  const out = p.finish();
  out.userData.chimneyTop = null; out.userData.keep = ['frame', 'roof']; out.userData.layerFr = domeLayerFractions('earthen'); out.userData.digTier = 'earthen';
  return out;
}


/**
 * A sealed, filtered emergency intake on the arcology (sim/dome/intake.ts): an armored housing against the skirt with a hooded cap, two filter canisters
 * with clamp bands, a locked service hatch and a status lamp. Nothing on it is open: no louvres, no grille, no mouth.
 */
function intakeStack(p: Parts, R: number, y0: number, a: number): void {
  const rho = R + 0.075, yb = y0 - 0.02;
  const put = (m: 'panel_dark' | 'panel_steel' | 'panel_light' | 'steel' | 'lamp', g: THREE.BufferGeometry) => p.add(m, g.rotateY(a));
  put('panel_dark', box(0.34, 0.46, 0.14, 0, yb + 0.23, rho));                       // the armored housing
  put('panel_steel', box(0.4, 0.04, 0.2, 0, yb + 0.48, rho));                        // the hooded cap, wider than the body (it sheds rain and ash)
  put('panel_steel', box(0.42, 0.05, 0.22, 0, yb + 0.02, rho));                      // the footing plinth
  for (const sx of [-1, 1]) {
    put('steel', new THREE.CylinderGeometry(0.055, 0.055, 0.4, 10).translate(sx * 0.12, yb + 0.24, rho + 0.115));                // the filter canisters stand proud of the face
    put('panel_dark', new THREE.CylinderGeometry(0.06, 0.06, 0.025, 10).translate(sx * 0.12, yb + 0.12, rho + 0.115));         // their clamp bands
    put('panel_dark', new THREE.CylinderGeometry(0.06, 0.06, 0.025, 10).translate(sx * 0.12, yb + 0.36, rho + 0.115));
    put('panel_steel', new THREE.CylinderGeometry(0.045, 0.058, 0.03, 10).translate(sx * 0.12, yb + 0.455, rho + 0.115));      // the capped crowns
  }
  put('panel_light', box(0.1, 0.14, 0.012, 0, yb + 0.2, rho + 0.076));               // the locked service hatch between them
  put('steel', box(0.03, 0.02, 0.016, 0, yb + 0.18, rho + 0.082));                   // its lock
  put('lamp', box(0.04, 0.025, 0.014, 0, yb + 0.38, rho + 0.078));                   // the status lamp
}

/** The shared build of a triangulated dome (geodesic and arcology). */
function triShell(def: KitPieceDef, tier: 'geodesic' | 'arcology', seed: number, opts: BuildOpts, N: number, panelMat: 'dome_polycarb' | 'arcology', frameMat: 'aluminum' | 'steel'): THREE.Group {
  const p = new Parts(seed, opts), L = LOOK[tier], R = def.cellsX * CELL / 2 - 0.03 - bermU(tier), y0 = L.stem, g = opts.ground ?? (() => 0);
  const rim = (a: number) => g(R * Math.sin(a), R * Math.cos(a));
  const nWall = Math.max(36, Math.min(120, Math.round(R * 14)));
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * (def.cellsX * CELL / 2 - 0.03), -0.02, sz * (def.cellsZ * CELL / 2 - 0.03)));
  p.layer = 'foundation';
  p.add('concrete', ringWall(R - 0.05, R + 0.04, y0, a => Math.min(y0 - 0.03, rim(a) - 0.08), nWall));
  if (tier === 'geodesic') p.add('earth', berm(R, bermU(tier) - 0.04, 0.12, g, y0 - 0.005, nWall));
  else { const emb = embankment(R + 0.04, g, y0 - 0.005, nWall); if (emb) p.add('earth', emb); }
  const { rings, tris } = triDome(N);
  const th = (k: number) => k / N * Math.PI / 2;
  const phi = (k: number, j: number) => j * TAU / rings[k].length;
  const V = (k: number, j: number): Pt3 => dir(R - 0.02, th(k), phi(k, j), y0);
  const centre: Pt3 = [0, y0, 0];
  // the armored skirt of the arcology: an opaque band round the foot, with a light line along its top
  const band = tier === 'arcology' ? 0.8 : 0;
  p.layer = 'frame';
  const seen = new Set<string>(), seg = tier === 'arcology' ? 3 : 5;
  const ent = entrancesFor(tier, R, opts.port), doors = new Doorways(ent.persons, tier, R, y0, ent.port);
  // the panels that sit in a doorway window are left out first (the holes grow to cover them), then the struts that run along the hole
  const kept = tris.filter(([A, B, C]) => !doors.takes([V(...A), V(...B), V(...C)]));
  const edge = (A: [number, number], B: [number, number]) => {
    const k = [A, B].map(([r, j]) => `${r}:${j}`).sort().join('|');
    if (seen.has(k)) return; seen.add(k);
    if (doors.cuts(V(...A), V(...B))) return;
    p.add(frameMat, strut(V(...A), V(...B), L.strut, seg));
  };
  for (const [A, B, C] of tris) { edge(A, B); edge(B, C); edge(C, A); }
  p.layer = 'roof';
  for (const [A, B, C] of kept) p.add(panelMat, tri(V(...A), V(...B), V(...C), centre, 0.07));
  if (band) {
    p.layer = 'walls';
    const lowN = rings[N].length;
    for (let j = 0; j < lowN; j++) {
      const a0 = phi(N, j), a1 = phi(N, j + 1), r = R - 0.02;
      if (doors.takes([at(r, a0, y0), at(r, a1, y0), at(r, a1, y0 + band), at(r, a0, y0 + band)])) continue;     // (the airlock's own surround closes the band there)
      p.add('steel', quad(at(r + 0.012, a0, y0), at(r + 0.012, a1, y0), at(r + 0.012, a1, y0 + band), at(r + 0.012, a0, y0 + band), centre));
      const rl = R + 0.002; p.add('lamp', quad(at(rl + 0.014, a0, y0 + band - 0.07), at(rl + 0.014, a1, y0 + band - 0.07), at(rl + 0.014, a1, y0 + band), at(rl + 0.014, a0, y0 + band), centre));
    }
    // a continuous armored base ring where the band meets the foundation, and a gasket seam along the band's top where the panels meet it: no gap shows between skin and footing
    p.layer = 'walls';
    p.add('panel_dark', ringWall(R - 0.03, R + 0.05, y0 + 0.06, () => y0 - 0.03, nWall));
    p.add('panel_dark', ringWall(R - 0.025, R + 0.018, y0 + band + 0.012, () => y0 + band - 0.012, nWall));
    // the crown spire: a mast with a lit tip
    p.layer = 'frame';
    p.add('steel', pipe([0, y0 + R * 0.98, 0], [0, y0 + R * 1.18, 0], 0.025, 6));
    p.add('lamp', new THREE.SphereGeometry(0.05, 8, 6).translate(0, y0 + R * 1.18 + 0.03, 0));
  }
  for (const h of doors.holes) airlock(p, tier, R, h, doors, y0);
  bulkheadFrame(p, R, y0, doors.holes);
  if (tier === 'arcology') {     // sealed filtered emergency intakes, spaced round the skirt and clear of every entrance
    p.layer = 'walls';
    for (const a of intakeAngles(ent.port, doors.holes.map(h => h.a), R, def.cellsX * CELL / 2 - 0.03)) intakeStack(p, R, y0, a);
  }
  // colliders: the shell ring as short boxes, none at the airlocks (people cross only through them), and the chamber walls
  shellColliders(p, R, Math.max(24, Math.min(72, Math.round(R * 8))), doors);
  const out = p.finish();
  out.userData.chimneyTop = null; out.userData.keep = ['frame', 'roof']; out.userData.layerFr = domeLayerFractions(tier); out.userData.digTier = tier;
  return out;
}

function geodesic(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group { return triShell(def, 'geodesic', seed, opts, 5, 'dome_polycarb', 'aluminum'); }
/**
 * The arcology lattice's frequency by detail tier: 12 on High (a strut every ~30 ft at the default size), 8 on Medium and Low. The struts are the arcology's
 * biggest shadow caster (about 1,300 of them), and Medium's shadow-triangle budget (scripts/perfBudget.json, never raised) has room for the coarser lattice only.
 */
export const arcologyFrequency = (t: DetailTier): number => (t === 'high' ? 12 : 8);

function arcology(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group { return triShell(def, 'arcology', seed, opts, arcologyFrequency(detailTier()), 'arcology', 'steel'); }

function glass(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  const p = new Parts(seed, opts), L = LOOK.glass, R = def.cellsX * CELL / 2 - 0.03, y0 = L.stem, g = opts.ground ?? (() => 0);
  const rim = (a: number) => g(R * Math.sin(a), R * Math.cos(a));
  const M = 32, P = 8;                       // meridians and parallels
  const centre: Pt3 = [0, y0, 0];
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * (def.cellsX * CELL / 2 - 0.03), -0.02, sz * (def.cellsZ * CELL / 2 - 0.03)));
  p.layer = 'foundation';
  p.add('concrete', ringWall(R - 0.08, R + 0.06, y0, a => Math.min(y0 - 0.03, rim(a) - 0.1), 72));
  { const emb = embankment(R + 0.06, g, y0 - 0.005, 96); if (emb) p.add('earth', emb); }
  const th = (i: number) => i / P * Math.PI / 2 * 0.985;             // parallels from the crown (i = 0 is the oculus ring) down to the foot
  const V = (i: number, m: number): Pt3 => dir(R - 0.03, i === P ? Math.PI / 2 : th(i), m * TAU / M, y0);
  const ent = entrancesFor('glass', R, opts.port), doors = new Doorways(ent.persons, 'glass', R, y0, ent.port);
  // panes in a doorway window first (the hole grows to cover them), then the members along it
  const cell = (i: number, m: number): Pt3[] => [V(i, m), V(i, m + 1), V(i + 1, m + 1), V(i + 1, m)];
  const keptCells: Array<[number, number]> = [];
  for (let i = 1; i < P; i++) for (let m = 0; m < M; m++) if (!doors.takes(cell(i, m))) keptCells.push([i, m]);
  const kerb: number[] = [];
  for (let m = 0; m < M; m++) { const c = V(P, m), d = V(P, m + 1); if (!doors.takes([c, d, [d[0], y0 + 0.07, d[2]], [c[0], y0 + 0.07, c[2]]])) kerb.push(m); }
  p.layer = 'frame';
  const bar = (A: Pt3, B: Pt3, sides: number) => { if (!doors.cuts(A, B)) p.add('steel', strut(A, B, L.strut, sides)); };
  for (let i = 1; i <= P; i++) for (let m = 0; m < M; m++) bar(V(i, m), V(i, m + 1), 4);                // the parallels
  for (let i = 1; i < P; i++) for (let m = 0; m < M; m++) bar(V(i, m), V(i + 1, m), 4);                 // the meridians
  const top = dir(R - 0.03, th(1) * 0.0, 0, y0);
  for (let m = 0; m < M; m += 2) p.add('steel', strut(top, V(1, m), L.strut, 4));                       // the oculus spokes
  p.add('steel', new THREE.TorusGeometry(0.1, 0.012, 5, 16).rotateX(Math.PI / 2).translate(0, y0 + R - 0.03 - 0.01, 0));      // the crown ring
  p.layer = 'roof';
  for (const [i, m] of keptCells) p.add('dome_glass', quad(...(cell(i, m) as [Pt3, Pt3, Pt3, Pt3]), centre, 0.06));
  for (let m = 0; m < M; m++) p.add('dome_glass', tri(top, V(1, m), V(1, m + 1), centre, 0.06));
  p.layer = 'walls';
  // the ring beam's glazed kerb: a low opaque band so the foot of the glass reads
  for (const m of kerb) p.add('steel', quad(V(P, m), V(P, m + 1), [V(P, m + 1)[0], y0 + 0.07, V(P, m + 1)[2]], [V(P, m)[0], y0 + 0.07, V(P, m)[2]], centre));
  for (const h of doors.holes) airlock(p, 'glass', R, h, doors, y0);
  bulkheadFrame(p, R, y0, doors.holes);
  shellColliders(p, R, 56, doors);
  const out = p.finish();
  out.userData.chimneyTop = null; out.userData.keep = ['frame', 'roof']; out.userData.layerFr = domeLayerFractions('glass'); out.userData.digTier = 'glass';
  return out;
}

export const DOME_BUILDERS: Record<string, (def: KitPieceDef, seed?: number, opts?: BuildOpts) => THREE.Group> = {
  dome_earthen: earthen, dome_geodesic: geodesic, dome_glass: glass, dome_arcology: arcology,
};
export const domeTierOf = tierOfKind;
