/**
 * The ground works under a dome (sim/dome/dig.ts says what stage the work is at; this draws it). Procedural, merged by material, built only while there is
 * something to see:
 *
 *   buildBuried(tier, cells)   the buried skirt (a concrete ring with a footing flare) and the utilities and sleeves laid on the pit floor before it. Permanent:
 *                              drawn part by part while it is poured (`showBuried`), hidden under the earth once the pit is filled, shown again in the Underground
 *                              view, the Cutaway moat and the Skirt section.
 *   buildDigSite(opts)         the open crater: a benched pit with strata in its walls (vertex colors), a haul road winding down it, spoil mounds, and the crew
 *                              (excavators, dump trucks, a dozer, rebar cage and forms, concrete pump and mixers). `mode: 'moat'` is the same pit as a ring
 *                              round a finished dome's skirt (the Cutaway view).
 *   buildSection(opts)         the Skirt section: a vertical slab of ground cut through the dome's center, strata, skirt in cross-section, a depth ruler.
 *
 * Frame: the dome's center at the origin, y = 0 at the pad (the dome group's own frame, no turn), `ground(x, z)` the terrain relative to the pad.
 * SCALE v2: 1 unit = 20 ft, a person 0.28. Triangles are counted in dig.test.ts / domeDig.test.ts (no inside-out faces, no NaN).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { kitMaterial, type KitMaterialId } from './materials';
import { box, worldUV } from './shell';
import { pipe } from './interior';
import { buildDumpTruck, buildExcavator, buildTubeSegments, earthMound } from '../props/digSite';
import { FT_PER_UNIT } from '../../sim/dome/standing';
import { DIG_DEPTH_FT, SKIRT_MARGIN_FT } from '../../sim/dome/siting';
import { DIG_DEEPER } from '../../sim/dome/crossing';
import { STRATA, digVolumes, pitProfile, pitShape, skirtParams, strataAt, strataBreaks, utilityRuns, type DigState, type PitShape, type UtilKind, type UtilRun } from '../../sim/dome/dig';
import { TIER, type DomeTier } from '../../sim/dome/tiers';

const TAU = Math.PI * 2;
type Pt3 = [number, number, number];
export type Ground = (x: number, z: number) => number;
const at = (r: number, a: number, y: number): Pt3 => [r * Math.sin(a), y, r * Math.cos(a)];
const hash = (a: number, b: number): number => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

/** Merge by material: one mesh each. */
class Bits {
  private readonly map = new Map<string, { m: KitMaterialId; layer: string; list: THREE.BufferGeometry[] }>();
  add(m: KitMaterialId, g: THREE.BufferGeometry, layer = ''): void {
    const k = layer + '|' + m; let e = this.map.get(k);
    if (!e) this.map.set(k, e = { m, layer, list: [] });
    e.list.push(worldUV(g));
  }
  finish(cast = true): THREE.Group {
    const out = new THREE.Group();
    for (const { m, layer, list } of this.map.values()) {
      const g = mergeGeometries(list);
      list.forEach(x => x.dispose());
      if (!g) continue;
      const mesh = new THREE.Mesh(g, kitMaterial(m));
      mesh.castShadow = cast && m !== 'glass'; mesh.receiveShadow = true;
      mesh.userData = { layer, mat: m, vertexCount: g.getAttribute('position').count, own: true };
      mesh.name = `dig_${layer || 'prop'}_${m}`;
      out.add(mesh);
    }
    return out;
  }
}

// ── the buried works ──

/** Concentric bands round the ring, emitted segment by segment, so a part-drawn mesh is a wedge poured round the ring. */
function ringBands(bands: Array<{ r0: number; r1: number; top: number; bot: number }>, n: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const quad = (a: Pt3, b: Pt3, c: Pt3, d: Pt3): void => { pos.push(...a, ...b, ...c, ...a, ...c, ...d); };
  for (let i = 0; i < n; i++) {
    const a0 = i * TAU / n, a1 = (i + 1) * TAU / n;
    for (const { r0, r1, top, bot } of bands) {
      quad(at(r0, a0, top), at(r1, a0, top), at(r1, a1, top), at(r0, a1, top));
      quad(at(r1, a0, top), at(r1, a0, bot), at(r1, a1, bot), at(r1, a1, top));
      quad(at(r0, a1, top), at(r0, a1, bot), at(r0, a0, bot), at(r0, a0, top));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

const UTIL_MAT: Record<UtilKind, KitMaterialId> = { power: 'paint_red', water: 'blue_tank', sewer: 'poly_tank', data: 'paint_yellow', sleeve: 'rust' };

/** A flat slab lying from a to b, `w` wide and `h` thick, its base at a's height. */
function slab(a: Pt3, b: Pt3, w: number, h: number): THREE.BufferGeometry {
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]), ang = Math.atan2(b[0] - a[0], b[2] - a[2]);
  return box(w, h, len, 0, 0, len / 2).rotateY(ang).translate(a[0], a[1], a[2]);
}

/** The skirt ring and the lines under it, built whole (a mesh per layer x material, tagged `userData.layer`: 'skirt' or 'utilities'). */
export function buildBuried(tier: DomeTier, cells: number): THREE.Group {
  const b = new Bits(), k = skirtParams(tier, cells), floor = -k.depthU;
  // (the top overlaps the stem wall, so the ring and the wall read as one)
  b.add('concrete', ringBands([{ r0: k.rIn, r1: k.rOut, top: 0.01, bot: floor }, { r0: k.rIn - k.toeU, r1: k.rOut + 0.02, top: floor + k.toeH, bot: floor }], k.segments), 'skirt');
  for (const r of utilityRuns(tier, cells)) {
    const ux = Math.sin(r.a), uz = Math.cos(r.a), vx = Math.cos(r.a), vz = -Math.sin(r.a);
    const pt = (rho: number, lam: number, y: number): Pt3 => [ux * rho + vx * lam, floor + y, uz * rho + vz * lam];
    const rows = r.kind === 'power' ? 2 : 1, perRow = Math.ceil(r.n / rows);
    const lamC = r.off + (r.kind === 'power' ? 0 : 0);
    const wide = r.n > 1 ? r.gap * (perRow - 1) + r.pipe * 2.6 : r.pipe * 2.6;
    if (r.kind !== 'sleeve') b.add('gravel', slab(pt(r.r0, lamC, 0), pt(r.r1, lamC, 0), wide, 0.014), 'utilities');
    for (let i = 0; i < r.n; i++) {
      const row = Math.floor(i / perRow), col = i % perRow;
      const lam = r.off + (col - (perRow - 1) / 2) * r.gap, y = r.y + row * r.gap;
      b.add(UTIL_MAT[r.kind], pipe(pt(r.r0, lam, y), pt(r.r1, lam, y), r.pipe, r.kind === 'sleeve' ? 14 : 8), 'utilities');
      if (r.kind === 'sleeve') for (const rho of [k.rIn - 0.04, k.rOut + 0.02]) b.add('steel', pipe(pt(rho - 0.02, lam, y), pt(rho + 0.02, lam, y), r.pipe * 1.2, 14), 'utilities');
    }
    // a marker stake at the run's far end, flagged in the line's color
    if (r.kind !== 'sleeve') {
      const [mx, , mz] = pt(r.r1, lamC, 0);
      b.add('paint_yellow', box(0.012, 0.15, 0.012, mx, floor, mz), 'utilities');
      b.add(UTIL_MAT[r.kind], box(0.07, 0.04, 0.008, mx, floor + 0.11, mz), 'utilities');
    }
  }
  const g = b.finish(false);
  g.userData.buried = true;
  return g;
}

/** Draw the buried works as far as `st` says (or whole when `all`); `show` false hides them (they are under the earth). */
export function showBuried(g: THREE.Group, st: Pick<DigState, 'poured' | 'utilities'>, show: boolean, all = false): void {
  let any = false;
  for (const o of g.children) {
    const m = o as THREE.Mesh, layer = m.userData.layer as string, n = m.userData.vertexCount as number;
    const k = all ? 1 : layer === 'skirt' ? st.poured : st.utilities;
    m.visible = show && k > 0.001; any ||= m.visible;
    m.geometry.setDrawRange(0, k >= 0.999 ? Infinity : Math.floor(n * k / 3) * 3);
  }
  g.visible = any;
}

// ── the crater ──

/** The depth (units below the pad) of the crater wall at radius `r`, read off the profile (the floor deeper in, nothing outside the rim). */
export function depthAtRadius(prof: ReadonlyArray<readonly [number, number]>, r: number): number {
  if (r >= prof[0][0]) return 0;
  for (let i = 1; i < prof.length; i++) {
    const [r0, d0] = prof[i - 1], [r1, d1] = prof[i];
    if (r <= r0 && r >= r1) return r0 - r1 < 1e-9 ? Math.max(d0, d1) : d0 + (d1 - d0) * (r0 - r) / (r0 - r1);
  }
  return prof[prof.length - 1][1];
}

const STRATA_COLOR = STRATA.map(s => new THREE.Color(s.color));

/**
 * The pit's skin: the profile swept round the axis, colored by the stratum each face lies in (topsoil, clay, sand and gravel, weathered rock), darker toward the floor,
 * flat-shaded (a triangle a color). `mode 'pit'` closes the floor to the center; `'moat'` leaves the middle (a finished dome stands in it) and ends at the skirt.
 * Wound so every face looks into the pit (tested). Heights follow the hill: the rim sits on the ground, the floor is level.
 */
export function pitSkin(s: PitShape, depthU: number, ground: Ground, mode: 'pit' | 'moat' = 'pit'): THREE.BufferGeometry {
  const prof = pitProfile(s, depthU), dCur = Math.max(1e-6, Math.min(s.depthU, depthU));
  // split the risers where one stratum gives way to the next, so a band shows on the wall
  const pts: Array<[number, number]> = [[s.rTop + 0.12, 0]];
  for (let i = 0; i < prof.length; i++) {
    if (i > 0) {
      const [r0, d0] = prof[i - 1], [r1, d1] = prof[i];
      for (const bd of strataBreaks(d0 * FT_PER_UNIT, d1 * FT_PER_UNIT)) { const t = (bd / FT_PER_UNIT - d0) / (d1 - d0); pts.push([r0 + (r1 - r0) * t, bd / FT_PER_UNIT]); }
    }
    pts.push([prof[i][0], prof[i][1]]);
  }
  if (mode === 'moat') { const last = pts[pts.length - 1]; if (last[0] > s.rSkirt - 0.06) pts.push([s.rSkirt - 0.06, last[1]]); else pts[pts.length - 1] = [s.rSkirt - 0.06, last[1]]; }
  const N = Math.max(48, Math.min(168, Math.round(s.rTop * 11)));
  const rim = (a: number): number => ground(s.rTop * Math.sin(a), s.rTop * Math.cos(a));
  const yAt = (r: number, a: number, dep: number, lip: boolean): number => {
    const x = r * Math.sin(a), z = r * Math.cos(a), g = ground(x, z);
    if (lip) return g - 0.035;
    const y = dep <= 0 ? g - 0.002 : -dep + rim(a) * (1 - dep / dCur);
    return Math.min(y, g - 0.002);
  };
  const pos: number[] = [], col: number[] = [];
  const tmp = new THREE.Color(), A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), nrm = new THREE.Vector3(), ref = new THREE.Vector3();
  const tri = (p: Pt3, q: Pt3, r2: Pt3, color: THREE.Color, mx: number, mz: number): void => {
    A.set(...p); B.set(...q); C.set(...r2);
    nrm.copy(B).sub(A).cross(C.clone().sub(A));
    const m = Math.hypot(mx, mz) || 1;
    ref.set(-mx / m * 0.6, 1, -mz / m * 0.6);   // looks up and in toward the axis
    const flip = nrm.dot(ref) < 0;
    if (flip) pos.push(...p, ...r2, ...q); else pos.push(...p, ...q, ...r2);
    for (let i = 0; i < 3; i++) col.push(color.r, color.g, color.b);
  };
  const colorOf = (depA: number, depB: number, i: number, j: number, floorFace: boolean): THREE.Color => {
    const mid = (depA + depB) / 2 * FT_PER_UNIT, st = strataAt(mid + 0.01);
    tmp.copy(STRATA_COLOR[STRATA.indexOf(st)]);
    const n = floorFace ? 0.96 + 0.08 * hash(7, Math.floor(j / 6)) : 0.88 + 0.24 * hash(i * 7 + 1, j * 13 + 3), shade = 1 - 0.4 * Math.min(1, (mid / FT_PER_UNIT) / dCur);
    tmp.multiplyScalar(n * shade * (floorFace ? 0.95 : 0.85));
    if (floorFace) tmp.lerp(STRATA_COLOR[1], 0.12);
    return tmp.clone();
  };
  for (let i = 0; i + 1 < pts.length; i++) {
    const [r0, d0] = pts[i], [r1, d1] = pts[i + 1], lip = i === 0;
    for (let j = 0; j < N; j++) {
      const a0 = j * TAU / N, a1 = (j + 1) * TAU / N;
      const P = (r: number, a: number, d: number, l: boolean): Pt3 => [r * Math.sin(a), yAt(r, a, d, l), r * Math.cos(a)];
      const p00 = P(r0, a0, d0, lip), p01 = P(r0, a1, d0, lip), p10 = P(r1, a0, d1, false), p11 = P(r1, a1, d1, false);
      const c = lip ? STRATA_COLOR[0].clone() : colorOf(d0, d1, i, j, Math.abs(d1 - d0) < 1e-9 && d1 > dCur - 1e-6);
      const am = (a0 + a1) / 2, rm = (r0 + r1) / 2, mx = rm * Math.sin(am), mz = rm * Math.cos(am);
      tri(p00, p01, p11, c, mx, mz); tri(p00, p11, p10, c, mx, mz);
    }
  }
  if (mode === 'pit') {
    const [rl] = pts[pts.length - 1];
    for (let j = 0; j < N; j++) {
      const a0 = j * TAU / N, a1 = (j + 1) * TAU / N, y = -dCur;
      tri([rl * Math.sin(a0), y, rl * Math.cos(a0)], [rl * Math.sin(a1), y, rl * Math.cos(a1)], [0, y, 0], colorOf(dCur, dCur, 99, j, true), 0, 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

let _skin: THREE.MeshStandardMaterial | null = null;
const skinMat = (): THREE.MeshStandardMaterial => (_skin ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, name: 'dig_skin' }));

// ── the crew ──

const M = 1 / 6;
/** A crawler dozer (about 4 m long), blade forward, facing +z. */
export function buildDozer(): THREE.Group {
  const b = new Bits();
  for (const sx of [-1, 1]) { b.add('iron', box(0.55 * M, 0.9 * M, 3.6 * M, sx * 1.05 * M, 0, 0)); b.add('steel', box(0.35 * M, 0.5 * M, 3.2 * M, sx * 1.05 * M, 0.5 * M, 0)); }
  b.add('paint_yellow', box(1.9 * M, 0.9 * M, 2.6 * M, 0, 0.7 * M, -0.2 * M));
  b.add('paint_yellow', box(1.3 * M, 1.5 * M, 1.2 * M, 0, 1.55 * M, -0.5 * M));
  b.add('glass', box(1.2 * M, 0.9 * M, 1.1 * M, 0, 1.9 * M, -0.5 * M));
  b.add('paint_yellow', box(3.4 * M, 1.1 * M, 0.3 * M, 0, 0.2 * M, 2.4 * M));        // the blade
  for (const sx of [-1, 1]) b.add('iron', box(0.18 * M, 0.2 * M, 1.6 * M, sx * 1.4 * M, 0.7 * M, 1.6 * M));   // push arms
  b.add('iron', box(1.6 * M, 0.4 * M, 0.8 * M, 0, 0.7 * M, -2.1 * M));                  // ripper
  const g = b.finish(); g.traverse(o => { o.userData.own = true; });
  return g;
}

/** A concrete mixer truck (the drum tilted back), facing +z. */
export function buildMixer(): THREE.Group {
  const b = new Bits();
  b.add('iron', box(1.1 * M, 0.3 * M, 6 * M, 0, 0.55 * M, 0));
  for (const z of [-2.2, -1.2, 2.0]) for (const sx of [-1, 1]) b.add('iron', new THREE.CylinderGeometry(0.5 * M, 0.5 * M, 0.38 * M, 12).rotateZ(Math.PI / 2).translate(sx * 1.05 * M, 0.5 * M, z * M));
  b.add('paint_green', box(2.3 * M, 1.5 * M, 1.5 * M, 0, 0.7 * M, 2.4 * M));
  b.add('glass', box(2.1 * M, 0.7 * M, 0.02 * M, 0, 1.45 * M, 3.16 * M));
  b.add('concrete', new THREE.CylinderGeometry(1.15 * M, 1.15 * M, 4.2 * M, 14).rotateX(Math.PI / 2 - 0.2).translate(0, 2.0 * M, -0.7 * M));
  const g = b.finish(); g.traverse(o => { o.userData.own = true; });
  return g;
}

/** A concrete pump truck with its boom reaching to (dx, dy, dz) from the truck's origin; the truck faces +z. */
export function buildPump(dx: number, dy: number, dz: number): THREE.Group {
  const b = new Bits();
  b.add('iron', box(1.2 * M, 0.3 * M, 7 * M, 0, 0.55 * M, 0));
  for (const z of [-2.6, -1.6, 2.4]) for (const sx of [-1, 1]) b.add('iron', new THREE.CylinderGeometry(0.5 * M, 0.5 * M, 0.38 * M, 12).rotateZ(Math.PI / 2).translate(sx * 1.05 * M, 0.5 * M, z * M));
  b.add('paint_yellow', box(2.3 * M, 1.5 * M, 1.5 * M, 0, 0.7 * M, 2.9 * M));
  b.add('glass', box(2.1 * M, 0.7 * M, 0.02 * M, 0, 1.45 * M, 3.66 * M));
  b.add('paint_yellow', box(2.4 * M, 1.0 * M, 3.6 * M, 0, 0.85 * M, -1.0 * M));
  for (const sx of [-1, 1]) b.add('steel', box(0.15 * M, 0.15 * M, 2.4 * M, sx * 2.0 * M, 0.25 * M, -2.4 * M));   // outriggers
  // the boom in three links from a turret on the truck to the target, with the delivery hose hanging at the end
  const base: Pt3 = [0, 1.9 * M, -1.0 * M], tip: Pt3 = [dx, dy + 0.5, dz];
  const p1: Pt3 = [base[0] + (tip[0] - base[0]) * 0.35, base[1] + 0.12 + (tip[1] - base[1]) * 0.2, base[2] + (tip[2] - base[2]) * 0.35];
  const p2: Pt3 = [base[0] + (tip[0] - base[0]) * 0.7, base[1] + 0.12 + (tip[1] - base[1]) * 0.55, base[2] + (tip[2] - base[2]) * 0.7];
  for (const [p, q] of [[base, p1], [p1, p2], [p2, tip]] as Array<[Pt3, Pt3]>) b.add('paint_yellow', pipe(p, q, 0.014, 6));
  b.add('iron', pipe(tip, [tip[0], tip[1] - 0.4, tip[2]], 0.01, 5));
  const g = b.finish(); g.traverse(o => { o.userData.own = true; });
  return g;
}

/** The rebar cage and the plywood forms round the ring, from `a0` to `a1` radians (the cage ahead of the pour, the forms behind the cage until the pour reaches them). */
function cageAndForms(b: Bits, k: ReturnType<typeof skirtParams>, rebarTo: number, pouredTo: number): void {
  const H = k.depthU, floor = -H, tipTop = 0.0;
  const barsN = Math.max(24, Math.round(k.segments * 1.6));
  const cage = (a0: number, a1: number): void => {
    if (a1 - a0 < 1e-3) return;
    const n = Math.max(1, Math.ceil(barsN * (a1 - a0) / TAU));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n;
      for (const r of [k.rIn + 0.02, k.rOut - 0.02]) b.add('rust', box(0.01, H, 0.01, ...(([x, , z]) => [x, floor, z] as Pt3)(at(r, a, 0))));
    }
    const hoops = Math.max(3, Math.round(H / 0.4)), segs = Math.max(2, Math.ceil(36 * (a1 - a0) / TAU));
    for (let h = 0; h <= hoops; h++) {
      const y = floor + 0.03 + (H - 0.06) * h / hoops;
      for (const r of [k.rIn + 0.02, k.rOut - 0.02]) for (let s = 0; s < segs; s++) {
        const aa = a0 + (a1 - a0) * s / segs, bb = a0 + (a1 - a0) * (s + 1) / segs;
        b.add('rust', slab([...at(r, aa, y)] as Pt3, [...at(r, bb, y)] as Pt3, 0.01, 0.01));
      }
    }
  };
  cage(pouredTo * TAU, rebarTo * TAU);
  // forms: plywood panels on both faces of the ring between the pour front and the cage's far end, held off the earth by braces
  const f0 = pouredTo * TAU, f1 = Math.min(TAU, rebarTo * TAU + 0.0), fs = Math.max(2, Math.ceil(k.segments * (f1 - f0) / TAU / 2));
  for (let s = 0; s < fs; s++) {
    const aa = f0 + (f1 - f0) * s / fs, bb = f0 + (f1 - f0) * (s + 1) / fs;
    if (f1 - f0 < 1e-3) break;
    for (const [r, sg] of [[k.rIn - 0.015, -1], [k.rOut + 0.015, 1]] as Array<[number, number]>) {
      b.add('frame', slab([...at(r, aa, floor)] as Pt3, [...at(r, bb, floor)] as Pt3, 0.012, H));
      if (s % 2 === 0) { const mid = (aa + bb) / 2; b.add('wood_mid', pipe([...at(r + sg * 0.01, mid, floor + H * 0.2)] as Pt3, [...at(r + sg * 0.32, mid, floor)] as Pt3, 0.007, 4)); b.add('wood_mid', pipe([...at(r + sg * 0.01, mid, floor + H * 0.7)] as Pt3, [...at(r + sg * 0.32, mid, floor + 0.02)] as Pt3, 0.007, 4)); }
    }
  }
  void tipTop;
}

export interface DigSiteOpts {
  tier: DomeTier; cells: number; state: DigState;
  /** The terrain relative to the pad, in the dome's frame. */
  ground: Ground;
  seed: number;
  /** `pit` (the dig in progress), `moat` (a finished dome's skirt, laid bare). */
  mode?: 'pit' | 'moat';
  /** Quarter turns of the structure: where the first airlock and the plant lie. */
  rot?: number;
  /** Ground sensors fitted (stock): posts round the skirt in the moat. */
  sensors?: number;
}
export interface DigSite {
  group: THREE.Group;
  /** The circle cut out of the ground: outer radius (the rim) and inner (0 for a pit; the skirt for a moat). */
  hole: { r: number; rIn: number };
  /** The faces (for the tests): the pit skin geometry. */
  skin: THREE.BufferGeometry;
}

/** The crater, its road, spoil and crew at the state's moment. */
export function buildDigSite(o: DigSiteOpts): DigSite {
  const { tier, cells, state: st, ground } = o, mode = o.mode ?? 'pit', s = pitShape(tier, cells), k = skirtParams(tier, cells);
  const depthU = mode === 'moat' ? s.depthU : st.depthFt / FT_PER_UNIT;
  const group = new THREE.Group();
  group.name = 'domeDig';
  const skin = pitSkin(s, depthU, ground, mode);
  const mesh = new THREE.Mesh(skin, skinMat());
  mesh.receiveShadow = true; mesh.userData = { own: true, dig: 'skin' };
  group.add(mesh);
  const prof = pitProfile(s, depthU), big = tier === 'arcology' ? 2.0 : tier === 'glass' ? 1.5 : tier === 'geodesic' ? 1.15 : 0.8;
  const roadA = 0.9 + (o.rot ?? 0) * Math.PI / 2 + Math.PI * 0.5;       // the haul road starts here and winds round
  const b = new Bits();

  // the haul road: a gravel ribbon winding down the wall, half a turn and a bit, with fill under it where it stands out from the bench
  const roadPts: Array<{ a: number; ro: number; ri: number; y: number }> = [];
  if (mode === 'pit' && depthU > 0.03) {
    const sweep = Math.PI * (tier === 'arcology' ? 1.3 : 1.0), n = 56, wide = Math.min(s.roadW, (s.rTop - s.rWork) * 0.8 + 0.2);
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = roadA + sweep * t;
      const ro = s.rTop - 0.1 - (s.rTop - s.rWork - wide - 0.1) * t, ri = ro - wide;
      const x = ro * Math.sin(a), z = ro * Math.cos(a);
      const lin = -(depthU * t) + ground(s.rTop * Math.sin(a), s.rTop * Math.cos(a)) * (1 - t);
      // never below the wall at its outer edge (that would bury the road): the deck stands on the bench where the line would cut in
      const wall = -depthAtRadius(prof, ro) + ground(x, z) * (depthAtRadius(prof, ro) > 0 ? 0.0 : 1);
      roadPts.push({ a, ro, ri, y: Math.max(lin, Math.min(wall, ground(x, z) - 0.002)) + 0.004 });
    }
    const pos: number[] = [];
    const tri = (p: Pt3, q: Pt3, r: Pt3): void => { pos.push(...p, ...q, ...r); };
    const fill: number[] = [];
    for (let i = 0; i < roadPts.length - 1; i++) {
      const A = roadPts[i], B2 = roadPts[i + 1];
      const a0 = at(A.ro, A.a, A.y), a1 = at(A.ri, A.a, A.y), b0 = at(B2.ro, B2.a, B2.y), b1 = at(B2.ri, B2.a, B2.y);
      tri(a0, b0, b1); tri(a0, b1, a1);   // upward (checked by the audit)
      // the fill's inner flank down to the wall / floor under the inner edge
      const dI = (r: number): number => -depthAtRadius(prof, r) * 1 + 0;
      const fa = at(A.ri, A.a, Math.min(A.y - 0.01, dI(A.ri) + ground(A.ri * Math.sin(A.a), A.ri * Math.cos(A.a)) * (1 - depthAtRadius(prof, A.ri) / Math.max(depthU, 1e-6)))), fb = at(B2.ri, B2.a, Math.min(B2.y - 0.01, dI(B2.ri) + ground(B2.ri * Math.sin(B2.a), B2.ri * Math.cos(B2.a)) * (1 - depthAtRadius(prof, B2.ri) / Math.max(depthU, 1e-6))));
      fill.push(...a1, ...fa, ...fb, ...a1, ...fb, ...b1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    // the gravel deck faces up: flip any triangle that does not
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i + 2 < p.count; i += 3) {
      const ax = p.getX(i), ay = p.getY(i), az = p.getZ(i);
      const u1 = [p.getX(i + 1) - ax, p.getY(i + 1) - ay, p.getZ(i + 1) - az], u2 = [p.getX(i + 2) - ax, p.getY(i + 2) - ay, p.getZ(i + 2) - az];
      if (u1[2] * u2[0] - u1[0] * u2[2] < 0) { const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1); p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, x, y, z); }
    }
    g.computeVertexNormals();
    b.add('gravel', g);
    void fill;
  }

  // spoil mounds on the ground round the rim (what has been dug, less what the trucks have hauled off): lumpy heaps, never on the road's mouth
  if (mode === 'pit') {
    const v = digVolumes(tier, cells, st.depthFt), want = st.phase === 'backfill' ? v.total * 0.35 * (1 - st.filled) : v.done * 0.45;
    const heaps = Math.min(10, Math.max(0, Math.ceil(want / Math.max(1500, v.total / 14))));
    for (let i = 0; i < heaps; i++) {
      const a = roadA + 1.2 + (TAU - 2.4) * (i + hash(o.seed, i)) / Math.max(1, heaps), r = s.rTop + 0.5 + 0.35 * big + hash(i, o.seed) * 0.5;
      const cy = want / heaps, vol = cy / 296.3;                       // cubic yards to cubic units
      const w = Math.max(0.5, Math.cbrt(vol) * 1.3 * (0.85 + 0.3 * hash(i, 3))), h = Math.max(0.1, Math.min(0.6, w * 0.16));
      const x = r * Math.sin(a), z = r * Math.cos(a);
      b.add('soil', earthMound(w, w * 0.7, h).rotateY(a).translate(x, ground(x, z) - 0.02, z));
    }
  }

  // the crew
  const place = (g: THREE.Object3D, x: number, y: number, z: number, yaw: number, sc = big): void => { g.position.set(x, y, z); g.rotation.y = yaw; g.scale.setScalar(sc); g.traverse(q => { q.userData.own = true; }); group.add(g); };
  const toward = (x: number, z: number, tx: number, tz: number): number => Math.atan2(tx - x, tz - z);
  const floorY = -depthU;
  const onRoad = (t: number): { x: number; y: number; z: number; yaw: number } | null => {
    if (roadPts.length < 2) return null;
    const i = Math.min(roadPts.length - 2, Math.floor(t * (roadPts.length - 1))), A = roadPts[i], B2 = roadPts[i + 1];
    const rc = (A.ro + A.ri) / 2, rd = (B2.ro + B2.ri) / 2, pa = at(rc, A.a, A.y), pb = at(rd, B2.a, B2.y);
    return { x: pa[0], y: pa[1], z: pa[2], yaw: Math.atan2(pb[0] - pa[0], pb[2] - pa[2]) };
  };
  if (mode === 'pit') {
    if (st.crew.excavator && depthU > 0.05) {
      const a = roadA + Math.PI * 1.1, r = Math.max(s.rWork * 0.55, (s.rWork + (s.rTop - s.rWork) * 0.15)), x = r * Math.sin(a), z = r * Math.cos(a);
      place(buildExcavator(0.3 * big), x, floorY, z, toward(x, z, (s.rTop * 0.9) * Math.sin(a + 0.4), (s.rTop * 0.9) * Math.cos(a + 0.4)));
      if (tier === 'arcology' || tier === 'glass') {
        const a2 = a + 2.1, r2 = s.rWork * 0.7, x2 = r2 * Math.sin(a2), z2 = r2 * Math.cos(a2);
        place(buildExcavator(0.3 * big), x2, floorY, z2, toward(x2, z2, 0, 0));
      }
    }
    if (st.crew.dozer && depthU > 0.05) { const a = roadA + 2.9, r = s.rWork * 0.45, x = r * Math.sin(a), z = r * Math.cos(a); place(buildDozer(), x, floorY, z, toward(x, z, 0, 0) + 0.6); }
    if (st.crew.trucks) {
      for (const t of [0.22, 0.5, 0.78]) { const p = onRoad(t); if (p) place(buildDumpTruck(0, st.phase !== 'backfill'), p.x, p.y, p.z, p.yaw + (st.phase === 'backfill' ? Math.PI : 0)); }
      const a = roadA - 0.3, r = s.rTop + 0.6 + 0.35 * big, x = r * Math.sin(a), z = r * Math.cos(a);
      place(buildDumpTruck(0.6, false), x, ground(x, z), z, a + Math.PI / 2);
    }
    if (st.crew.compactor && depthU > 0.05) { const a = roadA + 1.7, r = s.rWork + 0.2, x = r * Math.sin(a), z = r * Math.cos(a); place(buildDozer(), x, Math.max(floorY, -depthU), z, a + 1.2); }
    if (st.crew.layers) {
      const a = roadA + 0.5, r = s.rWork + 0.6, x = r * Math.sin(a), z = r * Math.cos(a);
      place(buildTubeSegments(2), x, floorY + 0.02, z, a, big * 0.8);
      const a2 = roadA + 1.5, r2 = s.rWork * 0.8, x2 = r2 * Math.sin(a2), z2 = r2 * Math.cos(a2);
      place(buildExcavator(0.15 * big), x2, floorY, z2, toward(x2, z2, 0, 0), big * 0.9);
    }
    // the rebar cage and forms (the pour front is the skirt's poured share; the cage runs ahead of it)
    if ((st.phase === 'skirt' || st.phase === 'utilities') && st.rebar > 0) {
      cageAndForms(b, k, st.rebar, st.poured);
    }
    if (st.crew.pump && st.poured > 0) {
      const aPour = st.poured * TAU, tx = ((k.rIn + k.rOut) / 2) * Math.sin(aPour), tz = ((k.rIn + k.rOut) / 2) * Math.cos(aPour);
      const ap = aPour + 0.05, rp = s.rTop + 0.8 + 0.4 * big, px = rp * Math.sin(ap), pz = rp * Math.cos(ap), py = ground(px, pz);
      const yaw = toward(px, pz, tx, tz);
      // the boom is given in the truck's frame, which is turned by `yaw`: rotate the target back into it
      const c = Math.cos(yaw), sn = Math.sin(yaw), dx = tx - px, dz = tz - pz;
      const ex = (dx * c - dz * sn) / big, ez = (dx * sn + dz * c) / big;
      const pg = buildPump(ex, (floorY + 0.35 - py) / big, ez);
      place(pg, px, py, pz, yaw);
      for (const dA of [-0.12, 0.12]) { const ax = rp * Math.sin(ap + dA * 1.2 + (dA > 0 ? 0.1 : -0.1)), az = rp * Math.cos(ap + dA * 1.2 + (dA > 0 ? 0.1 : -0.1)); place(buildMixer(), ax + (dA > 0 ? 0.6 : -0.6) * Math.cos(ap), ground(ax, az), az - (dA > 0 ? 0.6 : -0.6) * Math.sin(ap), yaw + 0.3); }
    }
  }
  if (mode === 'moat' && (o.sensors ?? 0) > 0) {
    const n = Math.min(24, o.sensors!);
    for (let i = 0; i < n; i++) { const a = (i + 0.5) * TAU / n, r = k.rOut + 0.025, d = -s.depthU * (0.25 + 0.5 * hash(i, 5)); const [x, , z] = at(r, a, 0); b.add('led_green', box(0.03, 0.03, 0.03, x, d, z)); b.add('iron', pipe([x, d, z], at(r + 0.12, a, d), 0.006, 4)); }
  }
  const props = b.finish();
  props.traverse(q => { q.userData.own = true; });
  group.add(props);
  const hole = mode === 'moat' ? { r: s.rTop, rIn: k.rOut } : { r: s.rTop, rIn: 0 };
  return { group, hole, skin };
}

/** Free everything a dig site made (its own geometry; materials are the kit's and shared). */
export function disposeSite(g: THREE.Object3D): void {
  g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m.userData.own) m.geometry.dispose(); });
}

// ── the skirt section ──

export interface SectionOpts { tier: DomeTier; cells: number; ground: Ground; sensors?: number }
const rulerTex = new Map<string, THREE.Texture>();
function label(text: string, w = 256, h = 64, fg = '#f6efe0', bg = 'rgba(20,28,40,0.78)'): THREE.Texture {
  const key = `${text}|${fg}|${bg}`;
  let t = rulerTex.get(key);
  if (t) return t;
  if (typeof document === 'undefined') return new THREE.Texture();
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.fillStyle = fg; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 2);
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  rulerTex.set(key, t);
  return t;
}

/**
 * The Skirt section: the face of ground cut through the dome's center along the x axis, looking from +z. Strata bands (the same colors as the pit), the skirt in cross-section
 * (concrete, its footing flare), the ruler in feet down the left edge, and the crew dig depths (the plain crew's 6 to 14 ft and the learned crew's, from the skirt page's numbers).
 * Side walls and a floor close the slab. Everything faces into the cut. Pure geometry plus a few label sprites; the world clips the dome and the ground's near half.
 */
export function buildSection(o: SectionOpts): THREE.Group {
  const { tier, cells, ground } = o, s = pitShape(tier, cells), k = skirtParams(tier, cells), g = new THREE.Group();
  g.name = 'domeSection';
  const half = s.rTop + 0.6, D = Math.max(k.depthU * 1.25, (TIER[tier].skirtFt + 14) / FT_PER_UNIT), nx = 64;
  const pos: number[] = [], col: number[] = [];
  const tmp = new THREE.Color();
  const quad = (a: Pt3, b: Pt3, c: Pt3, d: Pt3, color: THREE.Color): void => { pos.push(...a, ...b, ...c, ...a, ...c, ...d); for (let i = 0; i < 6; i++) col.push(color.r, color.g, color.b); };
  // face at z = 0, facing +z; strata bands step across x so the ground's surface shows
  const bandEdges = [0, ...STRATA.slice(0, -1).map(x => x.toFt / FT_PER_UNIT), D].filter((v, i, a) => i === 0 || v > a[i - 1] + 1e-6 && v <= D + 1e-6);
  for (let i = 0; i < nx; i++) {
    const x0 = -half + 2 * half * i / nx, x1 = -half + 2 * half * (i + 1) / nx, g0 = ground(x0, 0), g1 = ground(x1, 0);
    for (let b = 0; b + 1 < bandEdges.length; b++) {
      const d0 = bandEdges[b], d1 = bandEdges[b + 1], st = strataAt((d0 + d1) / 2 * FT_PER_UNIT);
      tmp.copy(STRATA_COLOR[STRATA.indexOf(st)]).multiplyScalar(0.92 + 0.12 * hash(i, b));
      quad([x0, g0 - d0, 0], [x0, g0 - d1, 0], [x1, g1 - d1, 0], [x1, g1 - d0, 0], tmp.clone());
    }
  }
  // side and back walls (into the cut): the block's own sides, so the removed slab reads as a dug box
  const zq = 5.5;
  for (const sgn of [-1, 1]) {
    const xs = sgn * half;
    for (let b = 0; b + 1 < bandEdges.length; b++) {
      const d0 = bandEdges[b], d1 = bandEdges[b + 1], st = strataAt((d0 + d1) / 2 * FT_PER_UNIT);
      tmp.copy(STRATA_COLOR[STRATA.indexOf(st)]).multiplyScalar(0.8);
      const gg = ground(xs, 0), ga = ground(xs, zq);
      if (sgn < 0) quad([xs, gg - d0, 0], [xs, gg - d1, 0], [xs, ga - d1, zq], [xs, ga - d0, zq], tmp.clone()); else quad([xs, ga - d0, zq], [xs, ga - d1, zq], [xs, gg - d1, 0], [xs, gg - d0, 0], tmp.clone());
    }
  }
  tmp.copy(STRATA_COLOR[4]).multiplyScalar(0.6);
  quad([-half, -D, 0], [-half, -D, zq], [half, -D, zq], [half, -D, 0], tmp.clone());
  const faceG = new THREE.BufferGeometry();
  faceG.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  faceG.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  faceG.computeVertexNormals();
  // wound for the camera in front: make every triangle face +z / up / inward by flipping those that do not
  const p = faceG.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i + 2 < p.count; i += 3) {
    const ax = p.getX(i), ay = p.getY(i), az = p.getZ(i), u = [p.getX(i + 1) - ax, p.getY(i + 1) - ay, p.getZ(i + 1) - az], v = [p.getX(i + 2) - ax, p.getY(i + 2) - ay, p.getZ(i + 2) - az];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const cx = (ax + p.getX(i + 1) + p.getX(i + 2)) / 3;
    // the interior of the dug box is its own middle: face toward (0, +, zq/2)
    const m = [(ax + p.getX(i + 1) + p.getX(i + 2)) / 3, (ay + p.getY(i + 1) + p.getY(i + 2)) / 3, (az + p.getZ(i + 1) + p.getZ(i + 2)) / 3];
    const to = [-cx * 0.0 + (0 - m[0]) * 0.3, 1.2, zq * 0.6 - m[2]];
    if (n[0] * to[0] + n[1] * to[1] + n[2] * to[2] < 0) { const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1); p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, x, y, z); }
  }
  faceG.computeVertexNormals();
  const face = new THREE.Mesh(faceG, skinMat()); face.userData = { own: true }; face.receiveShadow = true;
  g.add(face);
  // the skirt and the footing, cut through at x = +-R (concrete, with the flare), slightly proud of the face
  const b = new Bits();
  for (const sg of [-1, 1]) {
    const x0 = sg > 0 ? k.rIn : -k.rOut, x1 = sg > 0 ? k.rOut : -k.rIn, top = ground(sg * (k.rIn + k.rOut) / 2, 0), fl = -k.depthU;
    b.add('concrete', box(x1 - x0, top - fl, 0.012, x0, fl, 0.002));
    b.add('concrete', box(x1 - x0 + k.toeU * 1.1, k.toeH, 0.012, sg > 0 ? x0 - k.toeU : x0, fl, 0.003));
    b.add('rust', box(0.01, top - fl - 0.04, 0.004, sg * (k.rIn + 0.025), fl + 0.02, 0.009)); b.add('rust', box(0.01, top - fl - 0.04, 0.004, sg * (k.rOut - 0.025), fl + 0.02, 0.009));
  }
  // the ruler, in feet, down the left edge: ticks every 10 ft, a long tick every 50
  const rx = -half - 0.02, rulerTop = ground(-half, 0);
  b.add('steel', box(0.012, D, 0.012, rx - 0.02, -D, 0.01));
  for (let ft = 0; ft * 1 <= D * FT_PER_UNIT + 1e-6; ft += 10) b.add('steel', box(ft % 50 === 0 ? 0.18 : 0.1, 0.008, 0.012, rx - 0.02 - (ft % 50 === 0 ? 0.18 : 0.1) / 2 + 0.006, rulerTop - ft / FT_PER_UNIT, 0.01));
  // dig depth lines: the plain crew's reach (6 to 14 ft) and the learned crew's (about 6 ft deeper), across the face
  const band = (ft0: number, ft1: number, m: KitMaterialId): void => { b.add(m, box(2 * half, (ft1 - ft0) / FT_PER_UNIT, 0.004, -half, rulerTop - ft1 / FT_PER_UNIT, 0.0015)); };
  band(DIG_DEPTH_FT[0], DIG_DEPTH_FT[0] + 0.25, 'paint_yellow'); band(DIG_DEPTH_FT[1], DIG_DEPTH_FT[1] + 0.25, 'paint_yellow');
  band(DIG_DEPTH_FT[1] + DIG_DEEPER, DIG_DEPTH_FT[1] + DIG_DEEPER + 0.25, 'paint_red');
  void SKIRT_MARGIN_FT;
  if ((o.sensors ?? 0) > 0) for (const sg of [-1, 1]) for (const f of [0.3, 0.6]) b.add('led_green', box(0.03, 0.03, 0.03, sg * (k.rOut + 0.04), -k.depthU * f, 0.004));
  const props = b.finish(false); props.traverse(q => { q.userData.own = true; });
  g.add(props);
  // labels: depth marks and the lines' names (sprites that always face the camera, drawn over the face)
  const sprite = (text: string, x: number, y: number, z: number, w = 0.9, bg?: string): void => {
    const m = new THREE.SpriteMaterial({ map: label(text, 256, 64, '#f6efe0', bg), depthTest: false, transparent: true });
    const sp = new THREE.Sprite(m); sp.scale.set(w, w / 4, 1); sp.position.set(x, y, z); sp.renderOrder = 20; sp.userData.own = true; g.add(sp);
  };
  for (let ft = 10; ft <= D * FT_PER_UNIT + 1e-6; ft += ft < 50 ? 10 : 20) sprite(`${ft} ft`, rx - 0.52, rulerTop - ft / FT_PER_UNIT, 0.02, 0.55);
  sprite('grade', rx - 0.52, rulerTop, 0.02, 0.55);
  sprite(`Skirt: ${TIER[tier].skirtFt} ft deep, ${TIER[tier].skirtThickFt} ft thick`, 0, rulerTop - k.depthU - 0.35, 0.03, 2.4, 'rgba(110,112,118,0.85)');
  sprite(`A plain crew digs ${DIG_DEPTH_FT[0]} to ${DIG_DEPTH_FT[1]} ft`, half - 1.4, rulerTop - DIG_DEPTH_FT[1] / FT_PER_UNIT - 0.14, 0.03, 2.4, 'rgba(120,90,10,0.85)');
  sprite(`A crew that has learned the ground: ${DIG_DEPTH_FT[0] + DIG_DEEPER} to ${DIG_DEPTH_FT[1] + DIG_DEEPER} ft`, half - 2.1, rulerTop - (DIG_DEPTH_FT[1] + DIG_DEEPER) / FT_PER_UNIT - 0.14, 0.03, 3.6, 'rgba(150,40,30,0.85)');
  let ys = 0; for (const st of STRATA.slice(0, 4)) { const mid = (st.fromFt + Math.min(st.toFt, D * FT_PER_UNIT)) / 2; if (st.fromFt < D * FT_PER_UNIT) sprite(st.name, -half + 1.0, rulerTop - mid / FT_PER_UNIT, 0.02, 1.4); ys++; }
  void ys;
  return g;
}

export { STRATA };
export type { DigState, PitShape, UtilRun };
