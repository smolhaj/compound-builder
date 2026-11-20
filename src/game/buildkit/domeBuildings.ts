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
import { CELL_FT, TIER, tierOfKind, type DomeTier } from '../../sim/dome/tiers';
import { airlockAngles } from '../../sim/dome/standing';
import { digState } from '../../sim/dome/dig';
import type { BuildLayer } from './shell';
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
  arcology: { strut: 0.03, stem: 0.14, vestW: 1.1, vestH: 0.9, vestL: 1.4 },
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
function airlock(p: Parts, tier: DomeTier, R: number, hole: Doorways['holes'][number], doors: Doorways, y0: number): void {
  const a = hole.a, v = hole.v, { outer, inner } = chamberRho(R, v), mid = (outer + inner) / 2, L = LOOK[tier];
  const place = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.rotateY(a);
  const wall = tier === 'arcology' ? 'steel' : 'concrete', half = v.cw / 2 + v.t / 2, stubW = v.cw / 2 + v.t - v.dw / 2;
  p.layer = 'walls';
  // (the dome's floor is the natural ground, below the stem wall's top at y0: the chamber's walls reach down to it and its floor slab lies on it)
  const foot = y0 - 0.1;
  p.add(wall, place(box(v.cw + 2 * v.t, 0.01, outer - inner + v.t, 0, foot + 0.02, mid)));                                    // the chamber's floor slab
  for (const s of [-1, 1]) p.add(wall, place(box(v.t, v.h + y0 - foot, outer - inner + v.t, s * half, foot, mid)));              // the side walls
  for (const rho of [inner, outer]) {
    for (const s of [-1, 1]) p.add(wall, place(box(stubW, v.h + y0 - foot, v.t, s * (v.dw / 2 + stubW / 2), foot, rho)));         // the door jambs
    p.add(wall, place(box(v.dw, v.h - v.dh, v.t, 0, y0 + v.dh, rho)));                                                         // the lintel
  }
  // the surround: steel plates in the shell's plane round the outer door, as wide as the hole the doorway took out of the lattice
  const lam0 = Math.min(hole.lam0, -(v.cw / 2 + v.t + SURROUND_PAD)), lam1 = Math.max(hole.lam1, v.cw / 2 + v.t + SURROUND_PAD), top = Math.max(hole.y1, y0 + v.h) + 0.02;
  const n = Math.max(2, Math.ceil((lam1 - lam0) / 0.11)), skin = tier === 'geodesic' ? 'aluminum' : 'steel', glaze = tier === 'geodesic' ? 'dome_polycarb' : tier === 'glass' ? 'dome_glass' : 'arcology', capY = y0 + v.h + 0.02;
  for (let i = 0; i < n; i++) {
    const l = lam0 + (lam1 - lam0) * (i + 0.5) / n, w = (lam1 - lam0) / n + 0.004, rho = doors.shellRho(l) + 0.017, lo = Math.abs(l) < v.dw / 2 ? y0 + v.dh + 0.004 : y0;
    p.add(skin, place(box(w, capY - lo, 0.026, l, lo, rho)));                                                                    // the plate, up to the chamber's roof line
    if (top > capY) p.add(glaze, place(box(w, top - capY, 0.008, l, capY, rho - 0.008)));                                        // above it the hole the lattice lost is glazed again
  }
  p.add('trim', place(box(lam1 - lam0, 0.016, 0.03, (lam0 + lam1) / 2, capY, doors.shellRho(0) + 0.017)));                       // the cap along the roof line
  p.layer = 'roof';
  p.add(tier === 'geodesic' ? 'dome_polycarb' : tier === 'glass' ? 'dome_glass' : 'arcology', place(box(v.cw + 2 * v.t, 0.012, outer - inner + v.t, 0, y0 + v.h, mid)));   // a glazed ceiling: the chamber reads from above
  for (const k of [0.1, 0.5, 0.9]) p.add('trim', place(box(v.cw + 2 * v.t + 0.01, 0.016, 0.02, 0, y0 + v.h, inner + (outer - inner) * k)));
  p.layer = 'openings';
  // each door leaf stands ajar, swung into the chamber about the jamb on the right as you face it
  const swing = (rho: number, into: 1 | -1) => {
    const sh = 1, len = v.dw * 0.96, phi = into * sh * 1.35;
    const g = box(len, v.dh * 0.97, 0.012, -sh * len / 2, 0, 0).rotateY(phi).translate(sh * v.dw / 2, y0, rho);
    p.add('door', place(g));
  };
  // a vehicle port's gates slide: each leaf rides back along the wall on the chamber side of its door line, half open; an interlock lamp over each (red: shut behind, green: clear)
  const slide = (rho: number, side: 1 | -1) => {
    const len = v.dw * 0.56, g = box(len, v.dh * 0.96, 0.016, side * (v.dw / 2 - len / 2 + 0.02), 0, 0).translate(0, y0, rho + (rho === outer ? -0.03 : 0.03));
    p.add('door', place(g));
    p.add('trim', place(box(v.dw + 0.1, 0.02, 0.03, 0, y0 + v.dh + 0.004, rho + (rho === outer ? -0.03 : 0.03))));   // the gate's track
    p.add('lamp', place(box(0.05, 0.03, 0.02, -side * (v.dw / 2 + 0.06), y0 + v.dh - 0.04, rho + (rho === outer ? 0.03 : -0.03))));
  };
  if (hole.vehicle) { slide(outer, 1); slide(inner, -1); } else { swing(outer, -1); swing(inner, 1); }
  p.add('lamp', place(box(v.cw * 0.5, 0.012, 0.04, 0, y0 + v.h - 0.014, mid)));                                                // a lamp down the middle of the ceiling
  p.add('lamp', place(box(v.dw * 0.4, 0.012, 0.012, 0, y0 + v.dh + 0.02, outer + 0.022)));                                      // and one over the outer door
  p.layer = 'interior';
  p.add('gravel', place(box(v.cw * 1.1, 0.006, 0.5, 0, y0 - L.stem * 0.2 + 0.001, inner - 0.3)));
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
    // the crown spire: a mast with a lit tip
    p.layer = 'frame';
    p.add('steel', pipe([0, y0 + R * 0.98, 0], [0, y0 + R * 1.18, 0], 0.025, 6));
    p.add('lamp', new THREE.SphereGeometry(0.05, 8, 6).translate(0, y0 + R * 1.18 + 0.03, 0));
  }
  for (const h of doors.holes) airlock(p, tier, R, h, doors, y0);
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
  shellColliders(p, R, 56, doors);
  const out = p.finish();
  out.userData.chimneyTop = null; out.userData.keep = ['frame', 'roof']; out.userData.layerFr = domeLayerFractions('glass'); out.userData.digTier = 'glass';
  return out;
}

export const DOME_BUILDERS: Record<string, (def: KitPieceDef, seed?: number, opts?: BuildOpts) => THREE.Group> = {
  dome_earthen: earthen, dome_geodesic: geodesic, dome_glass: glass, dome_arcology: arcology,
};
export const domeTierOf = tierOfKind;
