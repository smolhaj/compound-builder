/**
 * r14: exact (oriented-rectangle) footprints of town houses, garages, porches and
 * front walks. The occupancy mask is 0.5 u a cell and ignores its edge cells, so
 * a 0.3-deep garage front or porch never saw a neighbor on a fanned cul-de-sac;
 * a garage stood in front of the next house's porch. These rectangles are
 * tested with the separating-axis theorem instead.
 */

/** Four world-space corners (x, z). */
export type Quad = Array<[number, number]>;
export type LotPart = 'body' | 'garage' | 'front';

/** The rectangle (lx, lz, w × d) of a lot frame at (x, z) turned by rot, shrunk by `shrink` on every side. */
export function lotQuad(x: number, z: number, rot: number, lx: number, lz: number, w: number, d: number, shrink = 0.01): Quad {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const hx = Math.max(0, w / 2 - shrink), hz = Math.max(0, d / 2 - shrink);
  const out: Quad = [];
  for (const [u, v] of [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]]) {
    const px = lx + u, pz = lz + v;
    out.push([x + px * cs + pz * sn, z - px * sn + pz * cs]);
  }
  return out;
}

/** True when two convex quads overlap with positive area (touching edges do not count). */
export function quadsOverlap(a: Quad, b: Quad): boolean {
  for (const P of [a, b]) for (let i = 0; i < 4; i++) {
    const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % 4];
    const nx = z0 - z1, nz = x1 - x0;
    let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
    for (const [x, z] of a) { const p = x * nx + z * nz; if (p < aMin) aMin = p; if (p > aMax) aMax = p; }
    for (const [x, z] of b) { const p = x * nx + z * nz; if (p < bMin) bMin = p; if (p > bMax) bMax = p; }
    if (aMax <= bMin || bMax <= aMin) return false;
  }
  return true;
}

const BUCKET = 6;

/** A spatial hash of lot parts, each tagged with the house that owns it. */
export class LotFootprints {
  private _b = new Map<number, Array<{ q: Quad; owner: number; part: LotPart }>>();
  private _next = 0;

  /** A new owner id (one per house). */
  newOwner(): number { return this._next++; }

  private _keys(q: Quad): number[] {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of q) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const out: number[] = [];
    for (let j = Math.floor(z0 / BUCKET); j <= Math.floor(z1 / BUCKET); j++) {
      for (let i = Math.floor(x0 / BUCKET); i <= Math.floor(x1 / BUCKET); i++) out.push((j + 4096) * 8192 + (i + 4096));
    }
    return out;
  }

  /** Does q overlap any part of another owner (of the listed kinds)? */
  hits(q: Quad, owner: number, parts: readonly LotPart[] = ['body', 'garage', 'front']): boolean {
    for (const k of this._keys(q)) {
      for (const e of this._b.get(k) ?? []) {
        if (e.owner !== owner && parts.includes(e.part) && quadsOverlap(q, e.q)) return true;
      }
    }
    return false;
  }

  add(q: Quad, owner: number, part: LotPart): void {
    for (const k of this._keys(q)) {
      let a = this._b.get(k);
      if (!a) { a = []; this._b.set(k, a); }
      a.push({ q, owner, part });
    }
  }
}
