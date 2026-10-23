/**
 * Sightlines (docs/DECISIONS.md): who can see what. Lines of sight are
 * marched over the terrain; each step can be cut by the ground, by tree
 * crowns (the parcel's own trees, or the regional forest density beyond
 * the parcel), by perimeter runs that block sight (grown hedges, walls,
 * palisades, berms) and by buildings. A sight line returns 0–1 (how clear
 * it is). Pure (no three.js); tested.
 *
 * Uses: the exposure heatmap (seen from the county road, from the ridge,
 * at night through your lit windows), each building's "seen from road %",
 * and click-a-point viewsheds from towers and gates.
 */
export type XZ = [number, number];

export interface SightTree { x: number; z: number; y: number; scale: number; sy: number; kind: string }
/** A wall-like blocker: polyline, top height above the ground (≤ 0 = none), how much it cuts (0–1). */
export interface SightWall { pts: XZ[]; top: number; cut: number; gates: Array<{ at: number; w: number }> }
/** A building box (world AABB) and roof height (world y). */
export interface SightBox { x0: number; z0: number; x1: number; z1: number; top: number }

export interface SightWorld {
  ground(x: number, z: number): number;
  /** Trees inside the parcel (exact crowns). */
  trees: readonly SightTree[];
  /** Regional forest density (0–1) for points outside `inside` (no exact trees there). */
  forestAt(x: number, z: number): number;
  inside(x: number, z: number): boolean;
  walls: readonly SightWall[];
  boxes: readonly SightBox[];
}

/** Grid hash of trees for fast lookups. */
class TreeHash {
  private readonly m = new Map<number, SightTree[]>();
  private readonly cell: number;
  constructor(trees: readonly SightTree[], cell = 2) {
    this.cell = cell;
    for (const t of trees) {
      const k = this.key(Math.floor(t.x / cell), Math.floor(t.z / cell));
      let l = this.m.get(k); if (!l) this.m.set(k, l = []); l.push(t);
    }
  }
  key(i: number, j: number): number { return (i + 512) * 4096 + (j + 512); }
  /** Visit the trees in the 3 × 3 cells round (x, z) (no allocation). */
  each(x: number, z: number, f: (t: SightTree) => void): void {
    const i = Math.floor(x / this.cell), j = Math.floor(z / this.cell);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = this.m.get(this.key(i + a, j + b)); if (l) for (const t of l) f(t); }
  }
}

export class Sight {
  private readonly hash: TreeHash;
  private readonly w: SightWorld;
  constructor(w: SightWorld) { this.w = w; this.hash = new TreeHash(w.trees); }

  /**
   * How clear the line from eye (x, y, z) to target (x, y, z) is, 0–1.
   * Steps of `step` units; the ends are skipped (you can see out of your own
   * window, and the target's own crown doesn't hide it).
   */
  clear(a: [number, number, number], b: [number, number, number], step = 0.4): number {
    const [ax, ay, az] = a, [bx, by, bz] = b;
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-3) return 1;
    const n = Math.max(2, Math.ceil(L / step));
    let vis = 1;
    const seenTrees = new Set<SightTree>();
    for (let i = 1; i < n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ay + (by - ay) * t;
      const g = this.w.ground(x, z);
      if (y < g + 0.01) return 0;                                   // into the ground
      if (L * t < 0.25 || L * (1 - t) < 0.25) continue;
      if (this.w.inside(x, z)) {
        this.hash.each(x, z, tr => {
          if (seenTrees.has(tr)) return;
          const r = (tr.kind === 'conifer' ? 0.75 : 0.85) * tr.scale, d = Math.hypot(tr.x - x, tr.z - z);
          if (d > r) return;
          const lo = tr.y + (tr.kind === 'conifer' ? 0.15 : 0.9) * tr.scale, hi = tr.y + 3 * tr.scale * tr.sy;
          if (y < lo || y > hi) return;
          seenTrees.add(tr);
          vis *= tr.kind === 'conifer' ? 0.45 : 0.6;                // a crown cuts about half the view
        });
      } else {
        const f = this.w.forestAt(x, z);
        if (f > 0.15 && y < g + 2.6) vis *= 1 - Math.min(0.5, f * 0.32 * step);
      }
      for (const bx0 of this.w.boxes) if (x > bx0.x0 && x < bx0.x1 && z > bx0.z0 && z < bx0.z1 && y < bx0.top) return 0;
      if (vis < 0.02) return 0;
    }
    for (const wall of this.w.walls) vis *= 1 - wallCut(wall, ax, ay, az, bx, by, bz, this.w.ground);
    return vis;
  }
}

/** How much a wall cuts the line a→b (0 if the line clears it or crosses at a gate). */
export function wallCut(wall: SightWall, ax: number, ay: number, az: number, bx: number, by: number, bz: number, ground: (x: number, z: number) => number): number {
  if (wall.top <= 0 || wall.cut <= 0) return 0;
  let acc = 0;
  for (let i = 1; i < wall.pts.length; i++) {
    const [cx, cz] = wall.pts[i - 1], [dx, dz] = wall.pts[i];
    const hit = segX(ax, az, bx, bz, cx, cz, dx, dz);
    if (hit) {
      const [t, u] = hit;
      const along = acc + u * Math.hypot(dx - cx, dz - cz);
      if (!wall.gates.some(g => Math.abs(along - g.at) < g.w / 2)) {
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ay + (by - ay) * t;
        if (y < ground(x, z) + wall.top) return wall.cut;
      }
    }
    acc += Math.hypot(dx - cx, dz - cz);
  }
  return 0;
}

/** Segment intersection: params (t on a→b, u on c→d) or null. */
function segX(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): [number, number] | null {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, u] : null;
}

/** An observer: where they stand (eye height above the ground). */
export interface Observer { x: number; z: number; eye: number }

/**
 * Exposure of a point (target height `h` above the ground) to a set of
 * observers: the share of them that can see it, weighted by clarity and a
 * little by distance (far detail is harder to pick out).
 */
export function exposure(s: Sight, w: Pick<SightWorld, 'ground'>, x: number, z: number, h: number, obs: readonly Observer[]): number {
  if (!obs.length) return 0;
  let sum = 0;
  const ty = w.ground(x, z) + h;
  for (const o of obs) {
    const d = Math.hypot(o.x - x, o.z - z);
    const c = s.clear([o.x, w.ground(o.x, o.z) + o.eye, o.z], [x, ty, z]);
    sum += c * Math.max(0.25, 1 - d / 120);
  }
  return sum / obs.length;
}

/** Exposure grid over [x0, x1] × [z0, z1] at `cell` spacing (row-major, z rows). */
export function exposureGrid(s: Sight, w: Pick<SightWorld, 'ground'>, obs: readonly Observer[], x0: number, z0: number, x1: number, z1: number, cell: number, h = 0.25): { nx: number; nz: number; v: Float32Array } {
  const nx = Math.round((x1 - x0) / cell) + 1, nz = Math.round((z1 - z0) / cell) + 1;
  const v = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = exposure(s, w, x0 + i * cell, z0 + j * cell, h, obs);
  return { nx, nz, v };
}

/** Viewshed from one eye: clarity to every grid point (a person's height above the ground there). */
export function viewshedGrid(s: Sight, w: Pick<SightWorld, 'ground'>, eye: Observer, x0: number, z0: number, x1: number, z1: number, cell: number, h = 0.25): { nx: number; nz: number; v: Float32Array } {
  return exposureGrid(s, w, [eye], x0, z0, x1, z1, cell, h);
}
