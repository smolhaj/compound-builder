/**
 * The road bed: the bench a road is cut into the ground, shared by the sim
 * (earthwork volume, retaining walls, guardrail where the fill drops away)
 * and the world (ParcelTerrain carves the very same bench, so what is priced
 * is what is drawn). A flat bench `halfW` either side of the centre line at
 * the road's height; beyond it a cut bank (uphill side) battered back at
 * `cutRatio` horizontal to 1 vertical, or a fill slope (downhill side) at
 * `fillRatio`, until it meets the natural ground. Pure.
 */
import type { Pt } from './perimeter';

export const BED = {
  /** Half the flat bench: the 0.55 drive (0.275) plus a shoulder (world units, 1 = 6 m). */
  halfW: 0.45,
  /** Cut bank batter (horizontal per vertical) and fill slope (rock cuts stand steeper; gravel fills lie flatter). */
  cutRatio: 1.2, fillRatio: 1.8,
  /** The furthest the bed reaches from the centre line. */
  reach: 3.2,
  /** A cut or fill taller than this at the bench edge wants a retaining wall (world units, 2.3 m), and a drop beyond this wants a guardrail (2.4 m). */
  wallAt: 0.38, railAt: 0.4,
} as const;

/**
 * Ground height after the bed: the road's `y` on the bench (tilted by `bank`, rise per unit across to the left of the
 * heading: the outside of a curve stands higher), banks beyond, the natural ground where they meet it. `o` is the signed
 * offset from the centre line (left positive).
 */
export function bedHeight(natural: number, y: number, o: number, bank = 0): number {
  const d = Math.abs(o);
  if (d <= BED.halfW) return y + bank * o;
  const edge = y + bank * Math.sign(o) * BED.halfW, e = d - BED.halfW;
  if (natural > edge) return Math.min(natural, edge + e / BED.cutRatio);
  if (natural < edge) return Math.max(natural, edge - e / BED.fillRatio);
  return natural;
}

export interface BedStation { x: number; z: number; y: number; bank?: number }

/**
 * A spatial index of the bed segments (cells of 2 units), so the terrain can
 * ask "how does the road change the ground here?" for every vertex cheaply.
 * Segments flagged `skip` (bridge decks, bores, fords) carry no bed.
 */
export class RoadBed {
  private readonly _seg: Array<{ ax: number; az: number; bx: number; bz: number; ay: number; by: number; ka: number; kb: number }> = [];
  private readonly _cells = new Map<number, number[]>();
  /** The stretches with no bed (a deck, a bore, a slab): the ground there is left as it is, and the banks of the approaches do not spread under them. */
  private readonly _void: Array<{ ax: number; az: number; bx: number; bz: number }> = [];
  private readonly _voidCells = new Map<number, number[]>();
  readonly bbox: [number, number, number, number];
  private static readonly CELL = 2;

  constructor(pts: readonly BedStation[], skip: ReadonlyArray<boolean> = []) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    const index = (cells: Map<number, number[]>, id: number, a: BedStation, b: BedStation) => {
      const c = RoadBed.CELL, lo = BED.reach;
      const ix0 = Math.floor((Math.min(a.x, b.x) - lo) / c), ix1 = Math.floor((Math.max(a.x, b.x) + lo) / c);
      const iz0 = Math.floor((Math.min(a.z, b.z) - lo) / c), iz1 = Math.floor((Math.max(a.z, b.z) + lo) / c);
      for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
        const k = ix * 8191 + iz, l = cells.get(k);
        if (l) l.push(id); else cells.set(k, [id]);
      }
    };
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (skip[i - 1] || skip[i]) { this._void.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z }); index(this._voidCells, this._void.length - 1, a, b); continue; }
      this._seg.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, ay: a.y, by: b.y, ka: a.bank ?? 0, kb: b.bank ?? 0 });
      index(this._cells, this._seg.length - 1, a, b);
      x0 = Math.min(x0, a.x, b.x); z0 = Math.min(z0, a.z, b.z); x1 = Math.max(x1, a.x, b.x); z1 = Math.max(z1, a.z, b.z);
    }
    this.bbox = [x0 - BED.reach, z0 - BED.reach, x1 + BED.reach, z1 + BED.reach];
  }

  get empty(): boolean { return this._seg.length === 0; }

  /** Nearest bed segment to (x, z): its signed offset (left of the heading positive), the road's height and bank there; null beyond the reach. */
  nearest(x: number, z: number): { o: number; y: number; bank: number } | null {
    const c = RoadBed.CELL, l = this._cells.get(Math.floor(x / c) * 8191 + Math.floor(z / c));
    if (!l) return null;
    let best: number = BED.reach, y = 0, bank = 0, o = 0, found = false;
    for (const id of l) {
      const s = this._seg[id], dx = s.bx - s.ax, dz = s.bz - s.az, l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / l2)) : 0;
      const px = s.ax + dx * t, pz = s.az + dz * t, d = Math.hypot(x - px, z - pz);
      if (d < best) {
        best = d; y = s.ay + (s.by - s.ay) * t; bank = s.ka + (s.kb - s.ka) * t; found = true;
        // (the sign from the cross product; the size is the true distance, which beyond a segment's end is not the perpendicular one)
        o = (((x - px) * dz - (z - pz) * dx) >= 0 ? 1 : -1) * d;
      }
    }
    return found ? { o, y, bank } : null;
  }

  /** Distance to the nearest stretch with no bed (Infinity beyond the reach). */
  private _voidDist(x: number, z: number): number {
    const c = RoadBed.CELL, l = this._voidCells.get(Math.floor(x / c) * 8191 + Math.floor(z / c));
    let best = Infinity;
    if (!l) return best;
    for (const id of l) {
      const s = this._void[id], dx = s.bx - s.ax, dz = s.bz - s.az, l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / l2)) : 0;
      best = Math.min(best, Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t)));
    }
    return best;
  }

  /** The ground after the bed. `cleared` is true inside the bench and its banks (no trees). */
  apply(x: number, z: number, natural: number): { h: number; cleared: boolean } {
    const n = this.nearest(x, z), v = this._void.length ? this._voidDist(x, z) : Infinity;
    // nearer a deck or a bore than a bench: the ground is left as it is
    if (v < Infinity && (!n || v < Math.abs(n.o))) return { h: natural, cleared: v <= BED.halfW + 0.35 };
    if (!n) return { h: natural, cleared: false };
    return { h: bedHeight(natural, n.y, n.o, n.bank), cleared: Math.abs(n.o) <= BED.halfW + 0.35 };
  }
}

/** Distance from a point to a polyline of [x, z] points. */
export function distToPolyline(pts: readonly Pt[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}
