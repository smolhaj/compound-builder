/**
 * Door-to-door routing for the paths (sim/paths.ts): a grid search round
 * whatever the world says is in the way (buildings, water, trees, walls),
 * straightened where the ground is open, rounded at the bends and given a
 * gentle meander so a track looks walked, not ruled. Pure; the world gives
 * it a `blocked` test (tested here with plain functions).
 */
export type Pt = [number, number];

export interface RouteOpts {
  /** Is this spot in the way (pad the buildings in the test: the path keeps its distance)? */
  blocked: (x: number, z: number) => boolean;
  /** Cost of walking over this spot (1 = open grass; < 1 follows an existing track, > 1 avoids slopes and rough ground). */
  cost?: (x: number, z: number) => number;
  /** Grid cell (world units, default 0.25 ≈ 1.5 m). */
  cell?: number;
  /** How far past the two ends the search may wander (default 6). */
  margin?: number;
  /** Spacing of the points returned (default 0.2). */
  step?: number;
  /** Meander amplitude (0: none; default 0.035 ≈ 20 cm) and a seed for its phase. */
  meander?: number;
  seed?: number;
}

class Heap {
  private readonly _f: number[] = [];
  private readonly _i: number[] = [];
  get size(): number { return this._i.length; }
  push(i: number, f: number): void {
    const F = this._f, I = this._i;
    let k = I.length;
    F.push(f); I.push(i);
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (F[p] <= F[k]) break;
      [F[p], F[k]] = [F[k], F[p]]; [I[p], I[k]] = [I[k], I[p]];
      k = p;
    }
  }
  pop(): number {
    const F = this._f, I = this._i, top = I[0], lf = F.pop()!, li = I.pop()!;
    if (I.length) {
      F[0] = lf; I[0] = li;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < I.length && F[l] < F[m]) m = l;
        if (r < I.length && F[r] < F[m]) m = r;
        if (m === k) break;
        [F[m], F[k]] = [F[k], F[m]]; [I[m], I[k]] = [I[k], I[m]];
        k = m;
      }
    }
    return top;
  }
}

/** Length of a polyline. */
export function routeLength(p: readonly Pt[]): number {
  let l = 0;
  for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return l;
}

/** A point `d` along a polyline. */
export function routePoint(p: readonly Pt[], d: number): Pt {
  let left = Math.max(0, d);
  for (let i = 1; i < p.length; i++) {
    const l = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    if (left <= l || i === p.length - 1) { const t = l > 0 ? Math.min(1, left / l) : 0; return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t]; }
    left -= l;
  }
  return [p[0][0], p[0][1]];
}

/** Resample a polyline at an even spacing (ends kept). */
export function resample(p: readonly Pt[], step: number): Pt[] {
  const L = routeLength(p);
  if (L < 1e-6) return [[p[0][0], p[0][1]]];
  const n = Math.max(1, Math.round(L / step)), out: Pt[] = [];
  for (let k = 0; k <= n; k++) out.push(routePoint(p, L * k / n));
  return out;
}

function lineClear(a: Pt, b: Pt, blocked: (x: number, z: number) => boolean, every: number): boolean {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(l / every));
  for (let k = 1; k < n; k++) if (blocked(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n)) return false;
  return true;
}

/** Chaikin corner cutting (keeps the ends). */
function chaikin(p: readonly Pt[], rounds: number): Pt[] {
  let q: Pt[] = p.map(x => [x[0], x[1]]);
  for (let r = 0; r < rounds; r++) {
    if (q.length < 3) break;
    const o: Pt[] = [q[0]];
    for (let i = 0; i < q.length - 1; i++) {
      const a = q[i], b = q[i + 1];
      o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    o.push(q[q.length - 1]);
    q = o;
  }
  return q;
}

/** The grid every route is searched on (aligned to the world, so two routes through the same ground share cells). */
export const ROUTE_CELL = 0.25;

/**
 * The cells from a to b round whatever is blocked (centers, on the world-aligned grid), or null when there is no way (walled in,
 * across the creek with no bridge). The cells next to the ends themselves are always allowed (a door sits in its own clearance).
 */
export function findCells(a: Pt, b: Pt, o: Pick<RouteOpts, 'blocked' | 'cost' | 'margin'>): Pt[] | null {
  const cell = ROUTE_CELL, margin = o.margin ?? 6;
  const gi0 = Math.floor((Math.min(a[0], b[0]) - margin) / cell), gj0 = Math.floor((Math.min(a[1], b[1]) - margin) / cell);
  const x0 = gi0 * cell, z0 = gj0 * cell;
  const W = Math.ceil((Math.max(a[0], b[0]) + margin) / cell) - gi0 + 1, H = Math.ceil((Math.max(a[1], b[1]) + margin) / cell) - gj0 + 1;
  const wx = (i: number) => x0 + i * cell, wz = (j: number) => z0 + j * cell;
  const ci = (x: number) => Math.max(0, Math.min(W - 1, Math.round((x - x0) / cell))), cj = (z: number) => Math.max(0, Math.min(H - 1, Math.round((z - z0) / cell)));
  const si = ci(a[0]), sj = cj(a[1]), gi = ci(b[0]), gj = cj(b[1]);
  const free = new Uint8Array(W * H);          // 0 unknown, 1 free, 2 blocked
  const near = (i: number, j: number) => Math.max(Math.abs(i - si), Math.abs(j - sj)) <= 1 || Math.max(Math.abs(i - gi), Math.abs(j - gj)) <= 1;
  const isFree = (i: number, j: number): boolean => {
    const k = j * W + i;
    if (free[k] === 0) free[k] = near(i, j) || !o.blocked(wx(i), wz(j)) ? 1 : 2;
    return free[k] === 1;
  };
  const g = new Float32Array(W * H).fill(Infinity), from = new Int32Array(W * H).fill(-1), done = new Uint8Array(W * H);
  const heap = new Heap();
  const sk = sj * W + si, gk = gj * W + gi;
  g[sk] = 0;
  const hfn = (i: number, j: number) => { const dx = Math.abs(i - gi), dz = Math.abs(j - gj); return (Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)) * cell * 0.3; };
  heap.push(sk, hfn(si, sj));
  const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1];
  let found = false, guard = 0;
  while (heap.size && guard++ < 400000) {
    const k = heap.pop();
    if (done[k]) continue;
    done[k] = 1;
    if (k === gk) { found = true; break; }
    const i = k % W, j = (k / W) | 0;
    for (let d = 0; d < 8; d++) {
      const ni = i + DI[d], nj = j + DJ[d];
      if (ni < 0 || nj < 0 || ni >= W || nj >= H || !isFree(ni, nj)) continue;
      if (d >= 4 && (!isFree(i + DI[d], j) || !isFree(i, j + DJ[d]))) continue;     // no cutting a corner
      const nk = nj * W + ni;
      if (done[nk]) continue;
      const c = (d >= 4 ? Math.SQRT2 : 1) * cell * (o.cost ? Math.max(0.2, o.cost(wx(ni), wz(nj))) : 1);
      const ng = g[k] + c;
      if (ng < g[nk]) { g[nk] = ng; from[nk] = k; heap.push(nk, ng + hfn(ni, nj)); }
    }
  }
  if (!found) return null;
  const cells: Pt[] = [];
  for (let k = gk; k !== -1; k = from[k]) cells.push([wx(k % W), wz((k / W) | 0)]);
  return cells.reverse();
}

/**
 * A walked-looking line through a chain of cells: straightened where the ground is open, rounded at the bends, a gentle meander,
 * the two ends exactly where they are told to be (`ends`, else the first and last cell).
 */
export function smoothTrail(cells: readonly Pt[], o: Pick<RouteOpts, 'blocked' | 'step' | 'meander' | 'seed'> & { ends?: [Pt | null, Pt | null]; cell?: number }): Pt[] {
  const step = o.step ?? 0.2, every = (o.cell ?? ROUTE_CELL) * 0.5;
  const pts: Pt[] = cells.map(p => [p[0], p[1]]);
  if (o.ends?.[0]) pts[0] = [o.ends[0][0], o.ends[0][1]];
  if (o.ends?.[1]) pts[pts.length - 1] = [o.ends[1][0], o.ends[1][1]];
  if (pts.length < 2) return pts;
  const keep: Pt[] = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !lineClear(pts[i], pts[j], o.blocked, every)) j--;
    keep.push(pts[j]);
    i = j;
  }
  let line: Pt[] = resample(keep, step);
  const soft = resample(chaikin(keep, 2), step);
  if (soft.every((p, k) => k === 0 || k === soft.length - 1 || !o.blocked(p[0], p[1]))) line = soft;
  const amp = o.meander ?? 0.035;
  if (amp > 0 && line.length > 6) {
    const L = routeLength(line), lam = 2.4 + ((o.seed ?? 0) % 7) * 0.2, ph = ((o.seed ?? 0) % 13) * 0.5;
    line = line.map((p, k) => {
      const q = line[Math.min(line.length - 1, k + 1)], r = line[Math.max(0, k - 1)];
      let tx = q[0] - r[0], tz = q[1] - r[1];
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      const s = L * k / (line.length - 1), taper = Math.min(1, s / 0.8, (L - s) / 0.8);
      const off = amp * taper * (Math.sin(s / lam * Math.PI * 2 + ph) + 0.5 * Math.sin(s / (lam * 0.43) * Math.PI * 2 + ph * 2.1));
      const nx = p[0] + tz * off, nz = p[1] - tx * off;
      return o.blocked(nx, nz) && !(k === 0 || k === line.length - 1) ? p : [nx, nz];
    });
  }
  return line;
}

/** The route from a to b round whatever is blocked, smoothed; null when there is no way. */
export function findRoute(a: Pt, b: Pt, o: RouteOpts): Pt[] | null {
  const cells = findCells(a, b, o);
  if (!cells || cells.length < 2) return cells ? [a, b] : null;
  return smoothTrail(cells, { ...o, ends: [a, b] });
}
