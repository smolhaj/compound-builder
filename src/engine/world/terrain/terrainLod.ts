/**
 * terrainLod — the terrain mesh as an adaptive tiling of its tensor grid.
 *
 * The terrain samples a tensor grid (`terrainAxis`: a fine uniform core, cells growing outward). Drawn cell by cell, the
 * outer bands are mostly slivers: a column that is 0.5 u wide in the core stays 0.5 u wide out to 2 km, where the rows
 * are 70 u tall. Here the same nodes are tiled with a kd-tree instead: a block of grid cells is split (along its longer
 * side) until it is no bigger than `tau` × its distance from the fine focus rectangle, or one cell. The focus (the core)
 * stays one triangle pair per cell, exactly as before; away from it every leaf is roughly as wide as it is tall and its
 * size is a constant fraction of the distance, so the number of triangles falls from O(cells) to O(core + log R).
 *
 * Leaves of different size meet in T-junctions. Every node that lies inside another leaf's edge is snapped onto that
 * edge's line (coarsest edge first), so the mesh stays watertight without skirts or fans: two triangles per leaf.
 * Pure data in, typed arrays out; `terrainLod.test.ts` checks the tiling, the snapping and `leafSurface`.
 */

/** A block of grid cells: node index ranges (i0..i1, j0..j1), i along x, j along z. */
export interface Leaf { i0: number; i1: number; j0: number; j1: number }

/** The rectangle kept at full grid resolution (world units). */
export interface Focus { x0: number; x1: number; z0: number; z1: number }

/** Tile the grid: split a block until its size <= max(`minSize`, tau × its distance to the focus) or it is one cell. */
export function planLeaves(xs: ArrayLike<number>, zs: ArrayLike<number>, focus: Focus, tau: number, minSize: number): Leaf[] {
  const out: Leaf[] = [];
  const NX = xs.length, NZ = zs.length;
  const stack: Leaf[] = [{ i0: 0, i1: NX - 1, j0: 0, j1: NZ - 1 }];
  while (stack.length) {
    const b = stack.pop()!;
    const bx0 = xs[b.i0], bx1 = xs[b.i1], bz0 = zs[b.j0], bz1 = zs[b.j1];
    const sx = bx1 - bx0, sz = bz1 - bz0;
    const dx = Math.max(focus.x0 - bx1, bx0 - focus.x1, 0), dz = Math.max(focus.z0 - bz1, bz0 - focus.z1, 0);
    const lim = Math.max(minSize, tau * Math.hypot(dx, dz));
    const canX = b.i1 - b.i0 > 1, canZ = b.j1 - b.j0 > 1;
    if ((sx <= lim || !canX) && (sz <= lim || !canZ)) { out.push(b); continue; }
    // split the longer side (in world units) that can still be split, at the middle node
    const splitX = canX && sx > lim && (!canZ || sz <= lim || sx >= sz);
    if (splitX) {
      const m = (b.i0 + b.i1) >> 1;
      stack.push({ i0: b.i0, i1: m, j0: b.j0, j1: b.j1 }, { i0: m, i1: b.i1, j0: b.j0, j1: b.j1 });
    } else {
      const m = (b.j0 + b.j1) >> 1;
      stack.push({ i0: b.i0, i1: b.i1, j0: b.j0, j1: m }, { i0: b.i0, i1: b.i1, j0: m, j1: b.j1 });
    }
  }
  return out;
}

/** One snapped node: its vertex takes the height on the line between two vertices (t of the way from a to b). */
export interface Snap { v: number; a: number; b: number; t: number }

export interface AdaptiveMesh {
  /** Vertex -> grid node (i, j packed as j * NX + i). */
  nodeOf: Int32Array;
  /** Grid node -> vertex, -1 when no leaf uses the node. */
  vertexOf: Int32Array;
  leaves: Leaf[];
  /** Grid cell (j * (NX - 1) + i) -> leaf index. */
  cellLeaf: Int32Array;
  snaps: Snap[];
  /** Triangle indices (two per leaf). */
  index: Uint32Array;
}

/** Heights of the vertices after snapping. */
export function applySnaps(h: Float32Array, snaps: readonly Snap[]): void {
  for (const s of snaps) h[s.v] = h[s.a] * (1 - s.t) + h[s.b] * s.t;
}

/** Build the vertex set, the snaps and the triangles for `leaves`; `h` receives the (snapped) vertex heights from `nodeH` (grid heights). */
export function buildAdaptiveMesh(xs: ArrayLike<number>, zs: ArrayLike<number>, leaves: Leaf[], nodeH: ArrayLike<number>, h: { out: Float32Array | null }): AdaptiveMesh {
  const NX = xs.length, NZ = zs.length;
  const vertexOf = new Int32Array(NX * NZ).fill(-1);
  const nodes: number[] = [];
  const claim = (i: number, j: number): number => {
    const k = j * NX + i;
    if (vertexOf[k] < 0) { vertexOf[k] = nodes.length; nodes.push(k); }
    return vertexOf[k];
  };
  for (const l of leaves) { claim(l.i0, l.j0); claim(l.i1, l.j0); claim(l.i0, l.j1); claim(l.i1, l.j1); }
  const nodeOf = Int32Array.from(nodes);
  const hv = new Float32Array(nodeOf.length);
  for (let v = 0; v < nodeOf.length; v++) hv[v] = nodeH[nodeOf[v]];

  // T-junctions: nodes strictly inside a leaf's edge that another leaf uses; coarsest leaves first so a snapped node can anchor a finer edge
  const order = leaves.map((_, k) => k);
  const size = (l: Leaf): number => Math.max(xs[l.i1] - xs[l.i0], zs[l.j1] - zs[l.j0]);
  order.sort((a, b) => size(leaves[b]) - size(leaves[a]));
  const snaps: Snap[] = [];
  for (const k of order) {
    const l = leaves[k];
    const edge = (iA: number, jA: number, iB: number, jB: number, along: 'x' | 'z'): void => {
      const va = vertexOf[jA * NX + iA], vb = vertexOf[jB * NX + iB];
      const n0 = along === 'x' ? iA : jA, n1 = along === 'x' ? iB : jB;
      const c0 = along === 'x' ? xs[iA] : zs[jA], c1 = along === 'x' ? xs[iB] : zs[jB];
      for (let n = n0 + 1; n < n1; n++) {
        const node = along === 'x' ? jA * NX + n : n * NX + iA;
        const v = vertexOf[node];
        if (v < 0) continue;
        const c = along === 'x' ? xs[n] : zs[n];
        snaps.push({ v, a: va, b: vb, t: (c - c0) / (c1 - c0) });
      }
    };
    edge(l.i0, l.j0, l.i1, l.j0, 'x'); edge(l.i0, l.j1, l.i1, l.j1, 'x');
    edge(l.i0, l.j0, l.i0, l.j1, 'z'); edge(l.i1, l.j0, l.i1, l.j1, 'z');
  }
  applySnaps(hv, snaps);
  h.out = hv;

  const index = new Uint32Array(leaves.length * 6);
  const cellLeaf = new Int32Array(Math.max(0, (NX - 1) * (NZ - 1)));
  let q = 0;
  leaves.forEach((l, k) => {
    const a = vertexOf[l.j0 * NX + l.i0], b = vertexOf[l.j0 * NX + l.i1], c = vertexOf[l.j1 * NX + l.i0], d = vertexOf[l.j1 * NX + l.i1];
    if (Math.abs(hv[a] - hv[d]) <= Math.abs(hv[b] - hv[c])) { index[q++] = a; index[q++] = c; index[q++] = d; index[q++] = a; index[q++] = d; index[q++] = b; }
    else { index[q++] = a; index[q++] = c; index[q++] = b; index[q++] = b; index[q++] = c; index[q++] = d; }
    for (let j = l.j0; j < l.j1; j++) for (let i = l.i0; i < l.i1; i++) cellLeaf[j * (NX - 1) + i] = k;
  });
  return { nodeOf, vertexOf, leaves, cellLeaf, snaps, index };
}

/** Height of the drawn surface at (x, z): the leaf's two triangles, with the same diagonal rule the index buffer uses. */
export function leafSurface(xs: ArrayLike<number>, zs: ArrayLike<number>, m: AdaptiveMesh, x: number, z: number, vh: (v: number) => number): number {
  const NX = xs.length;
  const find = (a: ArrayLike<number>, v: number): number => {
    let lo = 0, hi = a.length - 2;
    if (v <= a[0]) return 0;
    if (v >= a[a.length - 1]) return a.length - 2;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (a[mid] <= v) lo = mid; else hi = mid - 1; }
    return lo;
  };
  const ci = find(xs, x), cj = find(zs, z);
  const l = m.leaves[m.cellLeaf[cj * (NX - 1) + ci]];
  const u = Math.max(0, Math.min(1, (x - xs[l.i0]) / (xs[l.i1] - xs[l.i0])));
  const v = Math.max(0, Math.min(1, (z - zs[l.j0]) / (zs[l.j1] - zs[l.j0])));
  const ya = vh(m.vertexOf[l.j0 * NX + l.i0]), yb = vh(m.vertexOf[l.j0 * NX + l.i1]), yc = vh(m.vertexOf[l.j1 * NX + l.i0]), yd = vh(m.vertexOf[l.j1 * NX + l.i1]);
  if (Math.abs(ya - yd) <= Math.abs(yb - yc)) {
    return v >= u ? ya + v * (yc - ya) + u * (yd - yc) : ya + u * (yb - ya) + v * (yd - yb);
  }
  return u + v <= 1 ? ya + u * (yb - ya) + v * (yc - ya) : yd + (1 - u) * (yc - yd) + (1 - v) * (yb - yd);
}
