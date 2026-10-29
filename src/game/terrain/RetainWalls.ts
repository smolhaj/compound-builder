/**
 * Dry-stack retaining walls, drawn (sim/retainPlan.ts is the plan). Each graded pad with a wall gets one merged mesh: courses of fieldstone laid in a
 * running bond with a batter (the face leans back), lower courses greener, a flat coping on top, a weep-hole every couple of metres at the foot, and a flight
 * of steps set through the wall where the plan has one (the cheeks are the wall's ends). A wall rises with the foundation work on its building. Two
 * levels of detail per wall (stones near; a battered slab with the same stair far) swap by distance; one draw call per wall, vertex colours, no textures.
 * Sizes are in world units (1 u = 6 m): courses 33 cm, stones 60-130 cm, coping 8 cm.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Quality } from '../../engine/world/WorldScene';
import { mulberry32 } from '../../sim/rng';
import { RW, blocksWalk, inStair, wallStretches, type PadPlan, type WallRun, type WallStair } from '../../sim/retainPlan';

type Ground = (x: number, z: number) => number;

/** Tangent of each side (clockwise seen from above) and its outward normal (the same as sim/retainPlan). */
const TAN: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const NOR: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

const DEPTH = 0.11;         // a stone is 66 cm into the wall
const COURSE = 0.055;       // 33 cm
const EMBED = 0.03;         // the footing is bedded below the ground
const BATTER = 0.14;        // the face leans back 1 : 7
const COPING_T = 0.014;

/** A coloured box, merged into the wall mesh. */
function box(parts: THREE.BufferGeometry[], cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, yaw: number, c: THREE.Color, roll = 0): void {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  if (roll) g.rotateZ(roll);
  g.rotateY(yaw).translate(cx, cy, cz);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  parts.push(g.toNonIndexed());
  g.dispose();
}

/** The exclusion along a run's side where a stair is set through it: [s0, s1]. */
function stairGaps(run: WallRun, stairs: readonly WallStair[]): Array<[number, number]> {
  const [tx, tz] = TAN[run.side], [px, pz] = run.pts[0], hw = RW.STAIR_W / 2 + RW.CHEEK + 0.004;
  const out: Array<[number, number]> = [];
  for (const s of stairs) {
    if (s.side !== run.side) continue;
    const sc = (s.x - px) * tx + (s.z - pz) * tz;
    out.push([sc - hw, sc + hw]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

const stone = (r: () => number, low: number): THREE.Color => {
  const c = new THREE.Color();
  // warm gray-buff fieldstone; the foot is darker and greener (damp, moss), now and then a rust-stained or pale block
  const mossy = low > 0 && r() < 0.35 * low;
  const t = r();
  if (mossy) c.setHSL(0.2 + 0.05 * r(), 0.14 + 0.1 * r(), 0.08 + 0.04 * r());
  else if (t < 0.12) c.setHSL(0.06 + 0.03 * r(), 0.22 + 0.08 * r(), 0.11 + 0.05 * r());
  else if (t < 0.25) c.setHSL(0.1, 0.06, 0.19 + 0.05 * r());
  else c.setHSL(0.07 + 0.04 * r(), 0.09 + 0.09 * r(), 0.09 + 0.11 * r() - 0.04 * low);
  return c;
};

/** The flight of steps through a wall, in boxes (treads, risers, cheeks). */
function stairParts(parts: THREE.BufferGeometry[], s: WallStair, ground: Ground, r: () => number): void {
  const yaw = Math.atan2(-s.dz, s.dx), px = -s.dz, pz = s.dx, W = RW.STAIR_W, n = s.steps, rise = (s.topY - s.footY) / n;
  for (let k = 1; k <= n; k++) {
    const d0 = k === n ? 0 : RW.SKIRT + (n - k) * RW.RUN, d1 = RW.SKIRT + (n - k + 1) * RW.RUN, dm = (d0 + d1) / 2, ld = d1 - d0;
    const T = s.topY - (n - k) * rise, cx = s.x + s.dx * dm, cz = s.z + s.dz * dm;
    const gy = Math.min(ground(cx, cz), ground(cx + px * W / 2, cz + pz * W / 2), ground(cx - px * W / 2, cz - pz * W / 2), ground(s.x + s.dx * d1, s.z + s.dz * d1));
    const low = Math.min(gy, T - 0.03) - 0.03;
    // riser block, the tread slab on it, a cheek stone at each side stepping up with the flight
    box(parts, cx, (low + T - 0.016) / 2, cz, ld - 0.004, T - 0.016 - low, W - 0.012, yaw, stone(r, 0.6));
    box(parts, cx, T - 0.008, cz, ld + 0.008, 0.016, W, yaw + (r() - 0.5) * 0.03, new THREE.Color().setHSL(0.09, 0.05, 0.19 + 0.05 * r()));
    for (const sg of [-1, 1]) box(parts, cx + px * sg * (W / 2 + RW.CHEEK / 2), (low + T + 0.03) / 2, cz + pz * sg * (W / 2 + RW.CHEEK / 2), ld + 0.004, T + 0.03 - low, RW.CHEEK, yaw, stone(r, 0.3));
  }
}

/** One stretch of wall, near: courses of stones filling each gap between stairs. */
function stretchNear(parts: THREE.BufferGeometry[], plan: PadPlan, run: WallRun, i0: number, i1: number, k: number, r: () => number): void {
  const [tx, tz] = TAN[run.side], [nx, nz] = NOR[run.side], [ox, oz] = run.pts[0], yaw0 = Math.atan2(-tz, tx);
  const seg = Math.hypot(run.pts[1][0] - run.pts[0][0], run.pts[1][1] - run.pts[0][1]);
  const sA = i0 * seg, sB = i1 * seg;
  const cut = run.h[Math.round((i0 + i1) / 2)] > 0;
  /** Wall height (full, u) at s along the side. */
  const Hat = (s: number): number => {
    const f = Math.max(i0, Math.min(i1, s / seg)), i = Math.min(i1 - 1, Math.floor(f)), u = f - i;
    return Math.abs(run.h[i]) * (1 - u) + Math.abs(run.h[i + 1]) * u;
  };
  const bottomAt = (_s: number, H: number): number => (cut ? plan.y : plan.y - H) - EMBED;
  // segments between the stairs
  const gaps = stairGaps(run, plan.stairs).filter(g => g[1] > sA && g[0] < sB);
  const spans: Array<[number, number]> = [];
  let cur = sA;
  for (const [g0, g1] of gaps) { if (g0 - cur > 0.03) spans.push([cur, g0]); cur = Math.max(cur, g1); }
  if (sB - cur > 0.03) spans.push([cur, sB]);
  for (const [a, b] of spans) {
    for (let j = 0, base = 0; j < 40; j++) {
      const ch = COURSE * (0.85 + 0.3 * r());
      // every stone of the course across the span, in a running bond (alternate courses start half a stone in)
      const n0 = Math.max(1, Math.round((b - a) / 0.15));
      const lens: number[] = [];
      let tot = 0;
      for (let q = 0; q < n0; q++) { const l = 0.6 + 0.8 * r(); lens.push(l); tot += l; }
      let s = a, any = false;
      for (let q = 0; q < n0; q++) {
        const L = (b - a) * lens[q] / tot, sc = s + L / 2;
        s += L;
        const H = Hat(sc), bot = bottomAt(sc, H), top = bot + (H + EMBED) * k;
        const y0 = bot + base;
        if (y0 > top - ch * 0.55) continue;
        any = true;
        const hh = Math.min(ch * (0.9 + 0.2 * r()), top - y0);
        const setback = base * BATTER, face = cut ? setback : RW.SKIRT - setback;
        const jit = r() * 0.02, dep = DEPTH * (0.9 + 0.2 * r()), dc = cut ? face + dep / 2 - jit : face - dep / 2 + jit;
        const wx = ox + tx * sc + nx * dc, wz = oz + tz * sc + nz * dc;
        const low = Math.max(0, 1 - base / 0.12);
        box(parts, wx, y0 + hh / 2, wz, L * 0.985, hh * 0.97, dep, yaw0 + (r() - 0.5) * 0.05, stone(r, low), (r() - 0.5) * 0.04);
        // a through-stone now and then, standing a hand proud of the face
        if (r() < 0.04 && base > 0.03) {
          const pd = 0.018, pc = cut ? face - pd / 2 - jit : face + pd / 2 + jit;
          box(parts, ox + tx * sc + nx * pc, y0 + hh / 2, oz + tz * sc + nz * pc, 0.05 + 0.03 * r(), hh * 0.8, pd * 2, yaw0, stone(r, low));
        }
      }
      base += ch;
      if (!any) break;
    }
    if (k < 0.999) continue;
    // the coping: flat slabs along the top, a little proud of the face and the back
    const n1 = Math.max(1, Math.round((b - a) / 0.13));
    for (let q = 0; q < n1; q++) {
      const s0 = a + (b - a) * q / n1, s1 = a + (b - a) * (q + 1) / n1, sc = (s0 + s1) / 2, H = Hat(sc), bot = bottomAt(sc, H), top = bot + H + EMBED;
      const setback = (top - bot) * BATTER, face = cut ? setback : RW.SKIRT - setback, dd = DEPTH + 0.03;
      const dc = cut ? face + DEPTH / 2 : face - DEPTH / 2;
      box(parts, ox + tx * sc + nx * dc, top + COPING_T / 2 - 0.002, oz + tz * sc + nz * dc, (s1 - s0) * 0.97, COPING_T, dd, yaw0 + (r() - 0.5) * 0.02, new THREE.Color().setHSL(0.1, 0.03, 0.17 + 0.06 * r()));
    }
    // weep holes: a dark square low in the face every couple of metres, with a lip of drain pipe
    const nh = Math.floor((b - a) / 0.4);
    for (let q = 0; q < nh && Hat((a + b) / 2) > 0.09; q++) {
      const sc = a + (b - a) * (q + 0.5) / nh, H = Hat(sc), bot = bottomAt(sc, H), setback = 0.05 * BATTER, face = cut ? setback : RW.SKIRT - setback;
      const dc = cut ? face - 0.004 : face + 0.004;
      box(parts, ox + tx * sc + nx * dc, bot + EMBED + 0.07, oz + tz * sc + nz * dc, 0.034, 0.022, 0.012, yaw0, new THREE.Color(0.04, 0.04, 0.045));
    }
  }
}

/** The far version of one stretch: a battered slab per sample pair and a coping line. */
function stretchFar(parts: THREE.BufferGeometry[], plan: PadPlan, run: WallRun, i0: number, i1: number, k: number): void {
  const [tx, tz] = TAN[run.side], [nx, nz] = NOR[run.side], yaw0 = Math.atan2(-tz, tx);
  const cut = run.h[Math.round((i0 + i1) / 2)] > 0, c = new THREE.Color().setHSL(0.08, 0.08, 0.12), cc = new THREE.Color().setHSL(0.09, 0.05, 0.19);
  const gaps = stairGaps(run, plan.stairs), [ox, oz] = run.pts[0];
  const seg = Math.hypot(run.pts[1][0] - run.pts[0][0], run.pts[1][1] - run.pts[0][1]);
  for (let i = i0; i < i1; i++) {
    const s0 = i * seg, s1 = (i + 1) * seg, sc = (s0 + s1) / 2;
    if (gaps.some(g => sc > g[0] - seg / 2 && sc < g[1] + seg / 2)) continue;
    const H = (Math.abs(run.h[i]) + Math.abs(run.h[i + 1])) / 2, bot = (cut ? plan.y : plan.y - H) - EMBED, hh = (H + EMBED) * k;
    const dc = cut ? 0.06 : RW.SKIRT - 0.06;
    box(parts, ox + tx * sc + nx * dc, bot + hh / 2, oz + tz * sc + nz * dc, seg * 1.01, hh, 0.12, yaw0, c);
    if (k > 0.999) box(parts, ox + tx * sc + nx * (cut ? 0.07 : RW.SKIRT - 0.07), bot + hh + COPING_T / 2, oz + tz * sc + nz * (cut ? 0.07 : RW.SKIRT - 0.07), seg * 1.01, COPING_T, 0.14, yaw0, cc);
  }
}

/** The merged mesh geometry of one wall (null when there is nothing to draw). k is how far up it has been built (0..1). */
export function wallGeometry(plan: PadPlan, k: number, ground: Ground, seed: number, detail: 'near' | 'far'): THREE.BufferGeometry | null {
  if (k <= 0.02 || !plan.runs.length) return null;
  const parts: THREE.BufferGeometry[] = [], r = mulberry32(seed);
  for (const run of plan.runs) for (const [i0, i1] of wallStretches(run)) {
    if (detail === 'near') stretchNear(parts, plan, run, i0, i1, k, r);
    else stretchFar(parts, plan, run, i0, i1, k);
  }
  if (k > 0.999) for (const s of plan.stairs) stairParts(parts, s, ground, r);
  if (!parts.length) return null;
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

const DIST: Record<Quality, number> = { high: 24, medium: 17, low: 10 };

interface WallEntry { plan: PadPlan; k: number; seed: number; built: string; near: THREE.Mesh | null; far: THREE.Mesh | null; isFar: boolean }

/** All the walls on the place: builds and swaps their meshes, answers what a walker may cross. */
export class RetainWallLayer {
  readonly group = new THREE.Group();
  private readonly _walls = new Map<string, WallEntry>();
  private readonly _mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  /** Counts up when a wall is added, removed or finishes (the people's routes and the trails plan again). */
  version = 0;
  private _clock = 0;

  constructor() { this.group.name = 'retaining_walls'; }

  /** The pad plan for a building and how far up its wall stands (0 = not started, 1 = done). Null removes it. */
  set(id: string, plan: PadPlan | null, k: number, seed = 1): void {
    const have = this._walls.get(id);
    if (!plan || !plan.runs.length) { if (have) this.remove(id); return; }
    const kq = Math.round(Math.max(0, Math.min(1, k)) * 8) / 8;
    if (have) {
      if (have.plan === plan && have.k === kq) return;
      const changed = have.plan !== plan || (have.k >= 0.5) !== (kq >= 0.5);
      have.plan = plan; have.k = kq;
      if (changed) this.version++;
    } else {
      this._walls.set(id, { plan, k: kq, seed, built: '', near: null, far: null, isFar: false });
      this.version++;
    }
  }

  remove(id: string): void {
    const w = this._walls.get(id);
    if (!w) return;
    this._dispose(w);
    this._walls.delete(id);
    this.version++;
  }

  private _dispose(w: WallEntry): void {
    for (const m of [w.near, w.far]) if (m) { this.group.remove(m); m.geometry.dispose(); }
    w.near = w.far = null;
    w.built = '';
  }

  /** Walls this far along (> 0.5): the ones that stop a walk. */
  private _standing(w: WallEntry): boolean { return w.k >= 0.5; }

  /** Does a built wall stop a walker at (x, z)? */
  blocks(x: number, z: number): boolean {
    for (const w of this._walls.values()) if (this._standing(w) && blocksWalk(w.plan, x, z)) return true;
    return false;
  }

  /** Is (x, z) at a stair set in a wall (the corridor a walker may pass, on ground a cliff test would refuse)? */
  atStair(x: number, z: number): boolean {
    for (const w of this._walls.values()) if (this._standing(w) && w.plan.stairs.length && x >= w.plan.bbox.x0 && x <= w.plan.bbox.x1 && z >= w.plan.bbox.z0 && z <= w.plan.bbox.z1 && inStair(w.plan.stairs, x, z)) return true;
    return false;
  }

  /** Every stair of every wall (for the trail drawing to leave alone, and QA). */
  stairs(): WallStair[] { return [...this._walls.values()].flatMap(w => (w.k >= 0.999 ? w.plan.stairs : [])); }

  get count(): number { return this._walls.size; }

  /** Rebuild what changed (a couple of walls a frame) and swap near / far by the camera's distance. */
  update(cam: THREE.Vector3, tier: Quality, ground: Ground, dt: number, budget = 2): void {
    this._clock -= dt;
    let built = 0;
    for (const [id, w] of this._walls) {
      const key = `${w.k}|${w.plan.y.toFixed(3)}|${w.plan.rect.x0.toFixed(2)},${w.plan.rect.z0.toFixed(2)}`;
      if (key !== w.built && built < budget) {
        this._dispose(w);
        w.built = key;
        built++;
        const mk = (detail: 'near' | 'far'): THREE.Mesh | null => {
          const g = wallGeometry(w.plan, w.k, ground, w.seed, detail);
          if (!g) return null;
          const m = new THREE.Mesh(g, this._mat);
          m.name = `retaining_${id}_${detail}`;
          m.castShadow = false; m.receiveShadow = true;   // (a wall hugs the ground: no shadow pass cost)
          m.visible = false;
          this.group.add(m);
          return m;
        };
        w.near = mk('near'); w.far = mk('far');
      }
    }
    if (this._clock > 0 && built === 0) return;
    this._clock = 0.2;
    const lim = DIST[tier];
    for (const w of this._walls.values()) {
      const cx = (w.plan.rect.x0 + w.plan.rect.x1) / 2, cz = (w.plan.rect.z0 + w.plan.rect.z1) / 2;
      const d = Math.hypot(cam.x - cx, cam.z - cz), far = w.isFar ? d > lim - 3 : d > lim + 3;
      if (w.near) w.near.visible = !far;
      if (w.far) w.far.visible = far;
      w.isFar = far;
    }
  }

  dispose(): void {
    for (const w of this._walls.values()) this._dispose(w);
    this._walls.clear();
    this._mat.dispose();
  }
}
