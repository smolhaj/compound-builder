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
import { pipe } from './interior';
import { box, Parts, type BuildOpts } from './shell';
import { CELL_FT, TIER, tierOfKind, type DomeTier } from '../../sim/dome/tiers';
import { airlockAngles } from '../../sim/dome/standing';

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

/** An airlock vestibule at angle `a` on a shell of radius R: a concrete box through the wall with a door on the outside and a lamp over it. */
function airlock(p: Parts, tier: DomeTier, R: number, a: number, y0: number): void {
  // the vestibule stands inside the shell, its outer door in the wall (so everything stays inside the footprint)
  const L = LOOK[tier], len = L.vestL, rc = R - len / 2 + 0.02, w = L.vestW, h = L.vestH;
  const place = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.rotateY(a);
  p.layer = 'walls';
  const body = place(box(w, h, len, 0, y0, rc));
  p.add(tier === 'arcology' ? 'steel' : 'concrete', body);
  p.add('trim', place(box(w + 0.02, 0.02, len + 0.02, 0, y0 + h, rc)));
  p.layer = 'openings';
  p.add('door', place(box(w * 0.62, h * 0.82, 0.012, 0, y0, rc + len / 2 + 0.006)));
  p.add('lamp', place(box(w * 0.3, 0.012, 0.012, 0, y0 + h * 0.88, rc + len / 2 + 0.008)));
  p.layer = 'interior';
  p.add('gravel', place(box(w * 1.1, 0.006, 0.5, 0, y0 - L.stem * 0.2 + 0.001, rc - len / 2 - 0.3)));
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
  out.userData.chimneyTop = null; out.userData.keep = ['frame', 'roof'];
  return out;
}

/** The shared build of a triangulated dome (geodesic and arcology). */
function triShell(def: KitPieceDef, tier: 'geodesic' | 'arcology', seed: number, opts: BuildOpts, N: number, airlocks: number, panelMat: 'polycarb' | 'arcology', frameMat: 'aluminum' | 'steel'): THREE.Group {
  const p = new Parts(seed, opts), L = LOOK[tier], R = def.cellsX * CELL / 2 - 0.03 - bermU(tier), y0 = L.stem, g = opts.ground ?? (() => 0);
  const rim = (a: number) => g(R * Math.sin(a), R * Math.cos(a));
  const nWall = Math.max(36, Math.min(120, Math.round(R * 14)));
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * (def.cellsX * CELL / 2 - 0.03), -0.02, sz * (def.cellsZ * CELL / 2 - 0.03)));
  p.layer = 'foundation';
  p.add('concrete', ringWall(R - 0.05, R + 0.04, y0, a => Math.min(y0 - 0.03, rim(a) - 0.08), nWall));
  if (tier === 'geodesic') p.add('earth', berm(R, bermU(tier) - 0.04, 0.12, g, y0 - 0.005, nWall));
  const { rings, tris } = triDome(N);
  const th = (k: number) => k / N * Math.PI / 2;
  const phi = (k: number, j: number) => j * TAU / rings[k].length;
  const V = (k: number, j: number): Pt3 => dir(R - 0.02, th(k), phi(k, j), y0);
  const centre: Pt3 = [0, y0, 0];
  // the armored skirt of the arcology: an opaque band round the foot, with a light line along its top
  const band = tier === 'arcology' ? 0.8 : 0;
  p.layer = 'frame';
  const seen = new Set<string>(), seg = tier === 'arcology' ? 4 : 5;
  const edge = (A: [number, number], B: [number, number]) => {
    const k = [A, B].map(([r, j]) => `${r}:${j}`).sort().join('|');
    if (seen.has(k)) return; seen.add(k);
    p.add(frameMat, strut(V(...A), V(...B), L.strut, seg));
  };
  for (const [A, B, C] of tris) { edge(A, B); edge(B, C); edge(C, A); }
  p.layer = 'roof';
  for (const [A, B, C] of tris) p.add(panelMat, tri(V(...A), V(...B), V(...C), centre, 0.07));
  if (band) {
    p.layer = 'walls';
    const lowN = rings[N].length;
    for (let j = 0; j < lowN; j++) {
      const a0 = phi(N, j), a1 = phi(N, j + 1), r = R - 0.02;
      p.add('steel', quad(at(r + 0.012, a0, y0), at(r + 0.012, a1, y0), at(r + 0.012, a1, y0 + band), at(r + 0.012, a0, y0 + band), centre));
    }
    for (let j = 0; j < lowN; j++) { const a0 = phi(N, j), a1 = phi(N, j + 1), r = R + 0.002; p.add('lamp', quad(at(r + 0.014, a0, y0 + band - 0.07), at(r + 0.014, a1, y0 + band - 0.07), at(r + 0.014, a1, y0 + band), at(r + 0.014, a0, y0 + band), centre)); }
    // the crown spire: a mast with a lit tip
    p.layer = 'frame';
    p.add('steel', pipe([0, y0 + R * 0.98, 0], [0, y0 + R * 1.18, 0], 0.025, 6));
    p.add('lamp', new THREE.SphereGeometry(0.05, 8, 6).translate(0, y0 + R * 1.18 + 0.03, 0));
  }
  for (const a of airlockAngles(airlocks)) airlock(p, tier, R, a, y0);
  // colliders: the shell ring as short boxes, none at the airlocks (people cross only through them)
  const ring = Math.max(24, Math.min(72, Math.round(R * 8))), gaps = airlockAngles(airlocks);
  for (let i = 0; i < ring; i++) {
    const a = (i + 0.5) * TAU / ring;
    if (gaps.some(ga => Math.abs(Math.atan2(Math.sin(a - ga), Math.cos(a - ga))) < (L.vestW * 0.62) / R)) continue;
    const x = R * Math.sin(a), z = R * Math.cos(a), h = Math.PI * R / ring;
    p.collide({ x0: x - h * Math.abs(Math.cos(a)) - 0.03, z0: z - h * Math.abs(Math.sin(a)) - 0.03, x1: x + h * Math.abs(Math.cos(a)) + 0.03, z1: z + h * Math.abs(Math.sin(a)) + 0.03 });
  }
  const out = p.finish();
  out.userData.chimneyTop = null; out.userData.keep = ['frame', 'roof'];
  return out;
}

function geodesic(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group { return triShell(def, 'geodesic', seed, opts, 5, 2, 'polycarb', 'aluminum'); }
function arcology(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group { return triShell(def, 'arcology', seed, opts, 12, 6, 'arcology', 'steel'); }

function glass(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  const p = new Parts(seed, opts), L = LOOK.glass, R = def.cellsX * CELL / 2 - 0.03, y0 = L.stem, g = opts.ground ?? (() => 0);
  const rim = (a: number) => g(R * Math.sin(a), R * Math.cos(a));
  const M = 32, P = 8;                       // meridians and parallels
  const centre: Pt3 = [0, y0, 0];
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * (def.cellsX * CELL / 2 - 0.03), -0.02, sz * (def.cellsZ * CELL / 2 - 0.03)));
  p.layer = 'foundation';
  p.add('concrete', ringWall(R - 0.08, R + 0.06, y0, a => Math.min(y0 - 0.03, rim(a) - 0.1), 72));
  const th = (i: number) => i / P * Math.PI / 2 * 0.985;             // parallels from the crown (i = 0 is the oculus ring) down to the foot
  const V = (i: number, m: number): Pt3 => dir(R - 0.03, i === P ? Math.PI / 2 : th(i), m * TAU / M, y0);
  p.layer = 'frame';
  for (let i = 1; i <= P; i++) for (let m = 0; m < M; m++) p.add('steel', strut(V(i, m), V(i, m + 1), L.strut, 4));         // the parallels
  for (let i = 1; i < P; i++) for (let m = 0; m < M; m++) p.add('steel', strut(V(i, m), V(i + 1, m), L.strut, 4));          // the meridians
  const top = dir(R - 0.03, th(1) * 0.0, 0, y0);
  for (let m = 0; m < M; m += 2) p.add('steel', strut(top, V(1, m), L.strut, 4));                                              // the oculus spokes
  p.add('steel', new THREE.TorusGeometry(0.1, 0.012, 5, 16).rotateX(Math.PI / 2).translate(0, y0 + R - 0.03 - 0.01, 0));      // the crown ring
  p.layer = 'roof';
  for (let i = 1; i < P; i++) for (let m = 0; m < M; m++) p.add('glass', quad(V(i, m), V(i, m + 1), V(i + 1, m + 1), V(i + 1, m), centre, 0.06));
  for (let m = 0; m < M; m++) p.add('glass', tri(top, V(1, m), V(1, m + 1), centre, 0.06));
  p.layer = 'walls';
  // the ring beam's glazed kerb: a low opaque band so the foot of the glass reads
  for (let m = 0; m < M; m++) p.add('steel', quad(V(P, m), V(P, m + 1), [V(P, m + 1)[0], y0 + 0.07, V(P, m + 1)[2]], [V(P, m)[0], y0 + 0.07, V(P, m)[2]], centre));
  for (const a of airlockAngles(3)) airlock(p, 'glass', R, a, y0);
  const ring = 56, gaps = airlockAngles(3);
  for (let i = 0; i < ring; i++) {
    const a = (i + 0.5) * TAU / ring;
    if (gaps.some(ga => Math.abs(Math.atan2(Math.sin(a - ga), Math.cos(a - ga))) < (L.vestW * 0.62) / R)) continue;
    const x = R * Math.sin(a), z = R * Math.cos(a), h = Math.PI * R / ring;
    p.collide({ x0: x - h * Math.abs(Math.cos(a)) - 0.03, z0: z - h * Math.abs(Math.sin(a)) - 0.03, x1: x + h * Math.abs(Math.cos(a)) + 0.03, z1: z + h * Math.abs(Math.sin(a)) + 0.03 });
  }
  const out = p.finish();
  out.userData.chimneyTop = null; out.userData.keep = ['frame', 'roof'];
  return out;
}

export const DOME_BUILDERS: Record<string, (def: KitPieceDef, seed?: number, opts?: BuildOpts) => THREE.Group> = {
  dome_earthen: earthen, dome_geodesic: geodesic, dome_glass: glass, dome_arcology: arcology,
};
export const domeTierOf = tierOfKind;
