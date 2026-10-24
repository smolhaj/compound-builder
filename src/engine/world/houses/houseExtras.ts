/**
 * houseExtras.ts — r17 regional house extras (pure, tested in houseExtras.test.ts).
 *
 * Small iron / timber pieces EnvironmentRenderer._houseOnLot adds to the r16
 * regional houses, as axis-aligned boxes in the house frame (+x along the
 * street, +z away from it; y = box center above the lot ground). Every piece
 * is an instance in the town's shared pad set — no per-house draw calls.
 *
 *   entryCourt     — the Spanish entry court's low stucco walls, gate piers,
 *                    tile coping and paving (one height, clean corners, a
 *                    footing below grade).
 *   courtGate      — a pair of wrought-iron gate leaves in a Spanish entry-court
 *                    opening: pickets under an arched top, hinged at the piers,
 *                    closed in the opening or turned 110° on the hinge into the
 *                    court (angled back toward the pier). Open leaves never
 *                    cross the walk or pass through a pier.
 */

/** [x, yCenter, z, w, h, d] in the house frame. */
export type LBox = [number, number, number, number, number, number];

export interface CourtGate {
  open: boolean;
  /** The leaves' footprints [x, z, w, d] (open: clear of the walk). */
  leaves: Array<[number, number, number, number]>;
  /** Every iron bar / rail, in its leaf frame (w along the leaf, d its thickness). */
  parts: LBox[];
  /** Each part's turn about y in the house frame (parallel to parts). */
  rotY: number[];
}

/**
 * The window bays the facade shader draws across a house face of width `w`
 * (≈ 2.5 m bays, at least one): their centers from the face's middle.
 */
export function houseBays(w: number): number[] {
  const nb = Math.max(1, Math.floor(w / 0.42 + 0.5 + 1e-3)), bw = w / nb;
  return Array.from({ length: nb }, (_, i) => -w / 2 + (i + 0.5) * bw);
}

export interface Balcony { slab: LBox[]; iron: LBox[]; corbels: LBox[] }

/**
 * A small wrought-iron balcony under an upper window (Spanish revival): a
 * stucco / tile slab ≈ 1.6 × 0.8 m at floor height `yFloor`, an iron rail
 * (≈ 0.9 m) with slim balusters on the front and both ends, two stepped
 * timber corbels under it. The house face is the plane z = faceZ; the
 * balcony projects toward −z (the street) for `depth`.
 */
export function spanishBalcony(cx: number, yFloor: number, faceZ: number, width = 0.27, depth = 0.13): Balcony {
  const slabT = 0.025, railH = 0.15, bar = 0.0045;
  const z0 = faceZ - depth, zc = faceZ - depth / 2;
  const slab: LBox[] = [[cx, yFloor - slabT / 2, zc, width, slabT, depth]];
  const iron: LBox[] = [];
  const yTop = yFloor + railH, yb = yFloor + 0.004;
  const zr = z0 + 0.012;                                   // the rail stands just inside the slab edge
  const x0 = cx - width / 2 + 0.012, x1 = cx + width / 2 - 0.012;
  // top + bottom rails: the front, and the two ends back to the wall
  for (const [y, h] of [[yTop - 0.005, 0.01], [yb + 0.02, 0.006]] as const) {
    iron.push([cx, y, zr, x1 - x0, h, 0.008]);
    for (const x of [x0, x1]) iron.push([x, y, (zr + faceZ) / 2, 0.008, h, faceZ - zr]);
  }
  // corner posts + balusters
  const nf = Math.max(3, Math.round((x1 - x0) / 0.045));
  for (let k = 0; k <= nf; k++) {
    const x = x0 + (x1 - x0) * k / nf, th = k === 0 || k === nf ? 0.01 : bar;
    iron.push([x, (yb + yTop) / 2, zr, th, yTop - yb, th]);
  }
  const ns = Math.max(2, Math.round((faceZ - zr) / 0.045));
  for (const x of [x0, x1]) for (let k = 1; k < ns; k++) {
    const z = zr + (faceZ - zr) * k / ns;
    iron.push([x, (yb + yTop) / 2, z, bar, yTop - yb, bar]);
  }
  // small stepped timber corbels under the slab, near its ends (≈ 12 cm wide)
  const corbels: LBox[] = [];
  for (const x of [cx - width / 2 + 0.035, cx + width / 2 - 0.035]) {
    let y = yFloor - slabT;
    for (const [d, h] of [[depth * 0.78, 0.012], [depth * 0.55, 0.012], [depth * 0.32, 0.011]] as const) {
      corbels.push([x, y - h / 2, faceZ - d / 2, 0.02, h, d]);
      y -= h;
    }
  }
  return { slab, iron, corbels };
}

export interface Deck { boards: LBox[]; framing: LBox[]; rail: LBox[]; glass: LBox[]; cable: LBox[] }

/**
 * A cantilevered timber deck (NW contemporary), in a face frame: the wall is
 * the plane z = 0, the deck runs along x (centered) and projects toward +z for
 * `depth`, its walking surface at `yFloor`. No posts to the ground: deep
 * joists bear back into the house, a fascia board hides their ends. The
 * guard (≈ 1 m) runs round the three open sides — frameless glass panels
 * under a timber cap, or steel posts strung with horizontal cables.
 */
export function timberDeck(width: number, depth: number, yFloor: number, rail: 'glass' | 'cable'): Deck {
  const t = 0.022, guard = 0.17;
  const boards: LBox[] = [[0, yFloor - t / 2, depth / 2, width, t, depth]];
  const framing: LBox[] = [];
  // joists (≈ 30 cm deep at the wall, cantilevered out) and the fascia across their ends
  const nj = Math.max(3, Math.round(width / 0.2) + 1);
  for (let k = 0; k < nj; k++) {
    const x = -width / 2 + 0.02 + (width - 0.04) * k / (nj - 1);
    framing.push([x, yFloor - t - 0.025, depth / 2 - 0.01, 0.018, 0.05, depth - 0.02]);
  }
  framing.push([0, yFloor - t - 0.02, depth - 0.006, width, 0.04, 0.012]);
  for (const x of [-width / 2 + 0.006, width / 2 - 0.006]) framing.push([x, yFloor - t - 0.02, depth / 2, 0.012, 0.04, depth]);
  const railBox: LBox[] = [], glass: LBox[] = [], cable: LBox[] = [];
  const yTop = yFloor + guard, ze = depth - 0.01, xe = width / 2 - 0.01;
  // the three open runs: the outer edge, and both ends back to the wall
  const runs: Array<[number, number, number, number]> = [[-xe, ze, xe, ze], [-xe, 0, -xe, ze], [xe, 0, xe, ze]];
  for (const [x0, z0, x1, z1] of runs) {
    const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const len = along ? x1 - x0 : z1 - z0;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const sz = (w: number, d: number): [number, number] => (along ? [w, d] : [d, w]);
    // timber cap rail
    { const [w, d] = sz(along ? len + 0.02 : len, 0.022); railBox.push([cx, yTop - 0.006, cz, w, 0.012, d]); }
    const np = Math.max(1, Math.round(len / (rail === 'glass' ? 0.2 : 0.16)));
    if (rail === 'glass') {
      // frameless panels (a slim gap between them) held in a shoe at the deck edge
      for (let k = 0; k < np; k++) {
        const a = -len / 2 + (k + 0.5) * len / np;
        const [w, d] = sz(len / np - 0.008, 0.005);
        glass.push([along ? cx + a : cx, yFloor + (guard - 0.012) / 2, along ? cz : cz + a, w, guard - 0.014, d]);
      }
      const [w, d] = sz(len, 0.014); railBox.push([cx, yFloor + 0.01, cz, w, 0.02, d]);
    } else {
      // steel posts and ≈ 8 cm-spaced horizontal cables (shown as four strands)
      for (let k = 0; k <= np; k++) {
        const a = -len / 2 + 0.006 + k * (len - 0.012) / np;
        railBox.push([along ? cx + a : cx, yFloor + guard / 2, along ? cz : cz + a, 0.012, guard - 0.012, 0.012]);
      }
      for (let s = 1; s <= 4; s++) {
        const [w, d] = sz(len, 0.003);
        cable.push([cx, yFloor + guard * s / 5, cz, w, 0.003, d]);
      }
    }
  }
  return { boards, framing, rail: railBox, glass, cable };
}

/**
 * A rocking chair on a porch at (cx, cz), floor at yDeck, facing the street
 * (−z): seat ≈ 45 cm up, a slatted back, arms, two rockers along z.
 */
export function rockingChair(cx: number, cz: number, yDeck: number): LBox[] {
  const w = 0.09, d = 0.09, ys = yDeck + 0.075;
  const out: LBox[] = [
    [cx, ys, cz, w, 0.012, d],                                   // seat
    [cx, ys + 0.075, cz + d / 2 - 0.006, w, 0.15, 0.01],         // back
    [cx, ys + 0.155, cz + d / 2 - 0.006, w + 0.014, 0.012, 0.016], // crest rail
  ];
  for (const s of [-1, 1]) {
    const x = cx + s * (w / 2 - 0.006);
    out.push([x, (yDeck + 0.012 + ys) / 2, cz - d / 2 + 0.01, 0.01, ys - yDeck - 0.012, 0.01]);   // front leg
    out.push([x, (yDeck + 0.012 + ys) / 2, cz + d / 2 - 0.01, 0.01, ys - yDeck - 0.012, 0.01]);   // back leg
    out.push([x, ys + 0.045, cz - 0.005, 0.012, 0.01, d - 0.01]);                                // arm
    out.push([x, ys + 0.022, cz - d / 2 + 0.012, 0.008, 0.045, 0.008]);                         // arm post
    // rocker: a long runner, its ends stepped up (a curve at this scale)
    out.push([x, yDeck + 0.005, cz, 0.01, 0.01, d * 0.9]);
    out.push([x, yDeck + 0.012, cz - d * 0.55, 0.01, 0.008, d * 0.22]);
    out.push([x, yDeck + 0.012, cz + d * 0.55, 0.01, 0.008, d * 0.22]);
  }
  return out;
}

/**
 * A stacked cord of firewood against a wall (face frame: wall at z = 0, the
 * pile toward +z), `len` along x: the stack, a few lighter split ends on its
 * face, a strip of metal roofing over it.
 */
export function woodPile(len: number, h = 0.16, depth = 0.08): { logs: LBox[]; ends: LBox[]; cap: LBox[] } {
  const logs: LBox[] = [[0, h / 2, depth / 2 + 0.005, len, h, depth]];
  const ends: LBox[] = [];
  const nr = Math.max(2, Math.round(h / 0.035)), nc = Math.max(3, Math.round(len / 0.035));
  for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
    if ((r * 7 + c * 3) % 5 === 0) continue;                      // some ends darker (gaps)
    const x = -len / 2 + (c + 0.5 + (r % 2) * 0.3) * len / (nc + 0.3), y = (r + 0.5) * h / nr;
    ends.push([x, y, depth + 0.006, len / nc * 0.8, h / nr * 0.8, 0.004]);
  }
  const cap: LBox[] = [[0, h + 0.012, depth / 2 + 0.01, len + 0.04, 0.01, depth + 0.05]];
  return { logs, ends, cap };
}

/** An elk-antler mount on a wall at (cx, y), its face at z (the wall at z, the rack toward −z). */
export function antlerMount(cx: number, y: number, z: number): LBox[] {
  const out: LBox[] = [[cx, y, z - 0.006, 0.05, 0.035, 0.012]];        // plaque
  for (const s of [-1, 1]) {
    // main beam sweeping out and up in four short steps, tines rising from it
    let x = cx + s * 0.012, yy = y + 0.01;
    for (let k = 0; k < 4; k++) {
      const nx = x + s * 0.022, ny = yy + 0.016;
      out.push([(x + nx) / 2, (yy + ny) / 2, z - 0.012, 0.024, 0.008, 0.008]);
      if (k > 0) out.push([nx, ny + 0.02, z - 0.012, 0.006, 0.04 - k * 0.005, 0.006]);
      x = nx; yy = ny;
    }
  }
  return out;
}

/** Gate leaf top: 0.165 at the hinge rising to 0.205 where the leaves meet (an arch over the pair). */
export function gateTop(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return 0.165 + 0.04 * Math.sqrt(Math.max(0, 1 - (1 - u) * (1 - u)));
}

/** Court wall dimensions (u): thickness, height above the lot ground, gate pier size / height, coping. */
export const COURT = { t: 0.045, h: 0.19, pier: 0.06, pierH: 0.212, cap: 0.014, over: 0.006 } as const;

export interface EntryCourt {
  /** Stucco wall runs and the two gate piers (y center above the lot ground; footing below it). */
  walls: LBox[];
  /** Terracotta tile coping on the walls, and the pier caps. */
  caps: LBox[];
  /** The court paving inside the walls: [x, z, w, d]. */
  paving: [number, number, number, number];
  /** Footprints [x, z, w, d] of the side walls and the two front runs (piers included). */
  footprints: Array<[number, number, number, number]>;
}

/**
 * A Spanish-revival entry court in front of the house face z = faceZ: side
 * walls at x = xe and x = xr running back into the face, a front wall at z = zf
 * open at a gate centered on the walk (x = px, half-width `gap`) between two
 * piers. One height everywhere; the runs overlap at the corners (same top, so
 * they read as one mass); each carries a tile coping cap that never doubles
 * up at a corner; every piece runs `footing` below the lot ground so the wall
 * never hovers over the lawn. The piers stand a little taller with their own
 * caps, and the front runs end inside them.
 */
export function entryCourt(px: number, gap: number, xe: number, xr: number, zf: number, faceZ: number, footing = 0.06): EntryCourt {
  const { t, h, pier, pierH, cap, over } = COURT;
  const lo = Math.min(xe, xr), hi = Math.max(xe, xr);
  const walls: LBox[] = [], caps: LBox[] = [], footprints: EntryCourt['footprints'] = [];
  const run = (x0: number, x1: number, z0: number, z1: number): void => {
    walls.push([(x0 + x1) / 2, (h - footing) / 2, (z0 + z1) / 2, x1 - x0, h + footing, z1 - z0]);
  };
  // side walls from the front wall's outer face back into the house face
  for (const x of [lo, hi]) {
    run(x - t / 2, x + t / 2, zf - t / 2, faceZ + 0.01);
    const c0 = zf + t / 2 + over;
    caps.push([x, h + cap / 2, (c0 + faceZ) / 2, t + 2 * over, cap, faceZ - c0]);
    footprints.push([x, (zf - t / 2 + faceZ) / 2, t, faceZ - zf + t / 2]);
  }
  // front runs from the corners to the pier centers
  const pc = [px - gap - pier / 2, px + gap + pier / 2];
  const runs: Array<[number, number, number, number]> = [[lo - t / 2, pc[0], lo - t / 2 - over, pc[0]], [pc[1], hi + t / 2, pc[1], hi + t / 2 + over]];
  for (const [a, b, ca, cb] of runs) {
    if (b - a <= 0.005) continue;
    run(a, b, zf - t / 2, zf + t / 2);
    caps.push([(ca + cb) / 2, h + cap / 2, zf, cb - ca, cap, t + 2 * over]);
  }
  footprints.push([(lo - t / 2 + px - gap) / 2, zf, px - gap - (lo - t / 2), t]);
  footprints.push([(px + gap + hi + t / 2) / 2, zf, hi + t / 2 - (px + gap), t]);
  // gate piers, a touch taller than the wall, each with a cap
  for (const x of pc) {
    walls.push([x, (pierH - footing) / 2, zf, pier, pierH + footing, pier]);
    caps.push([x, pierH + cap / 2, zf, pier + 2 * over, cap, pier + 2 * over]);
  }
  const paving: EntryCourt['paving'] = [(lo + hi) / 2, (zf + t / 2 + faceZ) / 2, hi - lo - t, faceZ - zf - t / 2];
  return { walls, caps, paving, footprints };
}

/** How far an open leaf turns into the court from closed (rad): past square, so its bars face the street at an angle. */
export const GATE_OPEN_ANGLE = 110 * Math.PI / 180;

/**
 * The gate in an opening centered on the walk at x = px, half-width `gap`, in
 * the court's front wall at z = zf (the court lies at z > zf), between piers of
 * COURT.pier whose inner faces are the hinge lines. Each leaf hangs on its
 * pier just inside the wall's center line; open, it turns on that hinge into
 * the court by GATE_OPEN_ANGLE, so it stands angled back toward the pier and
 * its pickets still read from the street. Never across the walk (`walkHalf`
 * its half width), never through the pier or the wall. Each part is a box in
 * its leaf's frame (w along the leaf, d its thickness) turned by `rotY[i]`
 * about y (three.js sense: local +x → (cos, −sin) in the house x / z).
 * `room` (wall length beside the opening) is kept for callers; the angled
 * leaf needs none.
 */
export function courtGate(px: number, gap: number, zf: number, open: boolean, _room: [number, number], walkHalf = 0.07): CourtGate {
  const leaves: CourtGate['leaves'] = [];
  const parts: LBox[] = [], rotY: number[] = [];
  const lf = gap - 0.004 - 0.012;         // leaf length (the two meet with a hair's gap, clear of the hinge pins)
  const bar = 0.01, stile = 0.012;
  const y0 = 0.012;                       // just above the walk's paving
  const zh = zf + 0.016;                  // the hinge line, inside the pier's depth
  for (const s of [-1, 1] as const) {
    const hinge = px + s * gap;
    const a = open ? GATE_OPEN_ANGLE : 0;
    // the leaf runs from (ax, az) in direction (dx, dz) for lf; closed it points across the opening
    const dx = -s * Math.cos(a), dz = Math.sin(a);
    let ax = hinge - s * stile;
    const az = zh;
    if (open && Math.abs(ax - px) < walkHalf + stile) ax = px + s * (walkHalf + stile);
    const ry = Math.atan2(-dz, dx);
    const at = (t: number): [number, number] => [ax + dx * lf * t, az + dz * lf * t];
    const seg = (t0: number, t1: number, yc: number, h: number, th = bar): void => {
      const [x0, z0] = at(t0), [x1, z1] = at(t1);
      parts.push([(x0 + x1) / 2, yc, (z0 + z1) / 2, Math.max(th, Math.abs(t1 - t0) * lf), h, th]);
      rotY.push(ry);
    };
    // stiles at the hinge and the meeting edge, three pickets between (≈ 14 cm apart, daylight between)
    const nb = 4;
    for (let k = 0; k <= nb; k++) {
      const t = k / nb, top = gateTop(t), th = k === 0 || k === nb ? stile : bar;
      seg(t, t, (y0 + top) / 2, top - y0, th);
    }
    // bottom rail, a lock rail, and the arched top rail in short steps
    seg(0, 1, y0 + 0.006, 0.012);
    seg(0, 1, 0.125, 0.01);
    const ns = 12;
    for (let k = 0; k < ns; k++) {
      const ta = k / ns, tb = (k + 1) / ns;
      seg(ta, tb, gateTop((ta + tb) / 2) - 0.005, 0.01);
    }
    // hinge pins on the pier face (top and bottom)
    for (const y of [0.04, 0.15]) { parts.push([hinge - s * 0.004, y, zh, 0.008, 0.016, 0.01]); rotY.push(0); }
    const [fx0, fz0] = at(0), [fx1, fz1] = at(1);
    leaves.push([(fx0 + fx1) / 2, (fz0 + fz1) / 2, Math.abs(fx1 - fx0) + stile, Math.abs(fz1 - fz0) + stile]);
  }
  return { open, leaves, parts, rotY };
}

/**
 * r19 Spanish revival two-storey massing, hashed per lot:
 *   'tower' — a square entry / stair tower one storey taller than the house,
 *             proud of the face, with its own hipped tile roof and the front door;
 *   'wing'  — a narrower two-storey block (walk side) and a one-storey wing
 *             (garage side) set back from its face, under its own tile roof;
 *   'block' — the plain two-storey block.
 */
export type SpanishMassing = 'tower' | 'wing' | 'block';
/** Share of the wide two-storey Spanish houses that get an entry tower. */
export const SPANISH_TOWER_SHARE = 0.23;
export function spanishMassing(hw: number, roll: number): SpanishMassing {
  // r20: towers on ≈ 23 % of the wide houses (r19's 30 % read as every other house)
  if (roll < SPANISH_TOWER_SHARE && hw >= 1.45) return 'tower';
  if (roll < 0.62 && hw >= 1.3) return 'wing';
  return 'block';
}
/** Entry tower: width (square), how far it stands proud of the house face, its rise over the house walls. */
export const TOWER = { w: 0.46, proud: 0.1, rise: 0.5 } as const;
/** The two-storey block of a 'wing' house (the rest of the width is the wing). */
export function spanishBlockWidth(hw: number): number { return Math.max(0.8, Math.min(hw - 0.5, hw * 0.62)); }
/**
 * Where the facade shader draws the front door on a house box of width `w`
 * whose walk-side edge is at x = edge (`s`: the sign of the walk side).
 */
export function doorX(edge: number, w: number, s: number): number {
  return edge - s * (Math.min(w * 0.38, 0.5) / 2 + 0.04);
}

/**
 * The upper-floor bays (centers, x) of a block of width `w` centered at x0 where a
 * balcony (≤ 0.3 u wide) clears every excluded x span (an entry tower, a loggia's roof).
 */
export function spanishFreeBays(w: number, x0: number, ...excl: Array<[number, number] | null>): number[] {
  const b = houseBays(w), half = Math.min(0.3, (w / b.length) * 0.68) / 2 + 0.03;
  return b.map(c => c + x0).filter(c => excl.every(e => !e || c + half < e[0] || c - half > e[1]));
}

/** Arch head proportions in units of the bay pitch: opening radius, head height (crown + a sliver), pier width. */
export const ARCH = { r: 0.3, head: 0.33, pier: 0.2 } as const;

export interface Arcade {
  /** Arch heads (the instanced arch-head mesh: a unit bay scaled uniformly by the pitch): [x, yBase (the springing), z, pitch, pitch, thickness]. */
  heads: LBox[];
  /** Piers, the band over the arches, the closed end walls, the floor plinth (house color). */
  stucco: LBox[];
  /** Impost blocks at the springing and pier bases. */
  trim: LBox[];
  /** Saltillo floor tiles. */
  tile: LBox[];
  /** Timber ceiling and its beams (vigas). */
  timber: LBox[];
  /** The loggia's footprint [x, z, w, d]. */
  footprint: [number, number, number, number];
  n: number; pitch: number;
  /** The arch centers (x). */
  centers: number[];
}

/**
 * A loggia across part of a house face (Spanish revival): an arcade of 3–4
 * round arches on short piers standing `depth` in front of the face z = faceZ
 * between x = lo and x = hi (closed stucco end walls at both ends), a band
 * over the arches up to `top`, a timber ceiling with beams, a tiled floor at
 * `floorY` on a stucco plinth down to `groundY` (y = box centers in the house
 * frame). `align`: an arch is centered on it (the front door behind it).
 * Null when 3 arches (pitch ≥ 0.24 u ≈ 1.45 m) do not fit.
 */
export function loggiaArcade(o: { lo: number; hi: number; faceZ: number; depth: number; floorY: number; top: number; groundY: number; align?: number; nMax?: number }): Arcade | null {
  const t = 0.05, endMin = 0.06, pMin = 0.24, pMax = 0.31, band = 0.04;
  const span = o.hi - o.lo - 2 * endMin;
  let n = Math.min(o.nMax ?? 4, Math.floor(span / pMin + 1e-9));
  if (n < 3) return null;
  let p = Math.min(pMax, span / n);
  let a0 = o.lo + endMin + (span - n * p) / 2;
  if (o.align !== undefined) {
    // the most (then the widest) arches with one centered on `align`, inside the end walls
    let found = false;
    for (let nn = n; nn >= 3 && !found; nn--) {
      for (let pp = pMax; pp >= pMin - 1e-9 && !found; pp -= 0.005) {
        for (let k = 0; k < nn && !found; k++) {
          const s = o.align - (k + 0.5) * pp;
          if (s >= o.lo + endMin - 1e-9 && s + nn * pp <= o.hi - endMin + 1e-9) { n = nn; p = pp; a0 = s; found = true; }
        }
      }
    }
    if (!found) return null;
  }
  const run = n * p;
  const zf = o.faceZ - o.depth, zc = zf + t / 2, zm = o.faceZ - o.depth / 2;
  const spring = o.top - band - ARCH.head * p;
  const pw = ARCH.pier * p;
  const heads: LBox[] = [], stucco: LBox[] = [], trim: LBox[] = [], tile: LBox[] = [], timber: LBox[] = [];
  const centers: number[] = [];
  for (let k = 0; k < n; k++) {
    const x = a0 + (k + 0.5) * p;
    centers.push(x);
    heads.push([x, spring, zc, p, p, t]);
  }
  const h = spring - o.floorY;
  for (let k = 1; k < n; k++) {
    const x = a0 + k * p;
    stucco.push([x, o.floorY + h / 2, zc, pw, h, t]);
    trim.push([x, spring - 0.006, zc, pw + 0.014, 0.012, t + 0.014]);
    trim.push([x, o.floorY + 0.014, zc, pw + 0.01, 0.028, t + 0.01]);
  }
  // closed end walls (full depth), meeting the outer arch heads' half piers
  const eA = a0 + pw / 2, eB = a0 + run - pw / 2;
  stucco.push([(o.lo + eA) / 2, (o.floorY + o.top) / 2, zm, eA - o.lo, o.top - o.floorY, o.depth]);
  stucco.push([(eB + o.hi) / 2, (o.floorY + o.top) / 2, zm, o.hi - eB, o.top - o.floorY, o.depth]);
  for (const x of [eA, eB]) trim.push([x, spring - 0.006, zc, 0.014, 0.012, t + 0.014]);
  // the band over the arches, the floor plinth + tiles, the ceiling + beams
  stucco.push([(o.lo + o.hi) / 2, o.top - band / 2, zc, o.hi - o.lo, band, t]);
  stucco.push([(o.lo + o.hi) / 2, (o.groundY + o.floorY) / 2, zm, o.hi - o.lo, o.floorY - o.groundY, o.depth]);
  tile.push([(eA + eB) / 2, o.floorY + 0.002, zm + t / 2, eB - eA, 0.004, o.depth - t]);
  timber.push([(eA + eB) / 2, o.top - band - 0.004, zm + t / 2, eB - eA, 0.008, o.depth - t]);
  for (let k = 0; k <= n; k++) {
    const x = Math.min(eB - 0.012, Math.max(eA + 0.012, a0 + k * p));
    timber.push([x, o.top - band - 0.019, zm + t / 2, 0.022, 0.022, o.depth - t]);
  }
  return { heads, stucco, trim, tile, timber, footprint: [(o.lo + o.hi) / 2, zm, o.hi - o.lo, o.depth], n, pitch: p, centers };
}
