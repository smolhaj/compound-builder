/**
 * coastline — pure geometry of the Southern California beachside coast.
 *
 * Shared by the coast mesh builder (coastMesh.ts), the ocean shader (which
 * samples the waterline as a 1-D texture) and the boulder seating, so the
 * rendered sand, the waterline foam and every rock agree to the vertex.
 *
 * Cross-section at a given z, west → east:
 *
 *   seabed … waterline xs ─ wet sand ─ dry beach ─ toe xf ─ bluff face ─ crest xt ─ top … coastW
 *     (SEA_Y)                              (BEACH_Y)                    (topY: 0 on the lot)
 *
 * Inside the lot band (z ∈ [0, cH]) the bluff crest stays within a tile of
 * the parcel edge (coastW) and the beach keeps to the gameplay beach /
 * ocean columns. Beyond the lot ends the coast is free: headland points push
 * the bluff seaward by up to ~35 units with narrow rocky beaches, coves fall
 * back to wide sand. The bluff crest never runs east of coastW, so the
 * town ground (which starts at coastW) never covers the beach.
 *
 * All "noise" is sums of incommensurate sines: smooth, deterministic,
 * aperiodic over any visible stretch, and cheap. No Three.js imports.
 */

export const SEA_Y = -4.25;
export const BEACH_Y = -3.8;
/** Width of bluff-top ground the coast strip carries beyond the lot ends (and z where that starts). */
export const COAST_TOP_EXT = 12;
/** Beyond the lot: how far the coast strip's bluff top laps inland of the crest over the landscape. */
export const TOP_LAP = 10;

/**
 * SoCal arroyos: z offsets beyond the lot ends (negative = north of z = 0,
 * positive = south of cH). Shared with the regional landscape, which carves
 * the canyons inland; here they notch the bluff and fan out over the beach.
 */
export const ARROYO_OFFSETS = [-150, -430, -760, 150, 420, 720];
/** Canyon floor where an arroyo leaves the bluff (just above the dry sand). */
export const ARROYO_MOUTH_Y = BEACH_Y + 0.3;
/** Canyon floor half-width and wall slope at the mouth. */
export const ARROYO_W0 = 4;
export const ARROYO_WALL = 0.85;

/** Ragged canyon walls: a smooth per-z wobble (shared so the strip and the landscape agree). */
export function arroyoJitter(z: number): number {
  return 1.3 * sineNoise(z * 0.31, 9) + 0.5 * sineNoise(z * 1.1, 4);
}

export function arroyoZ(i: number, cH: number): number {
  const o = ARROYO_OFFSETS[i];
  return o < 0 ? o : cH + o;
}

/** Arroyo notch at z: `k` 0..1 (1 on a canyon axis) and the notched bluff-top height. */
export function arroyoNotch(z: number, cH: number): { k: number; top: number } {
  let top = Infinity, k = 0;
  for (let i = 0; i < ARROYO_OFFSETS.length; i++) {
    const d = Math.abs(z - arroyoZ(i, cH));
    top = Math.min(top, ARROYO_MOUTH_Y + Math.max(0, d - ARROYO_W0 + arroyoJitter(z)) * ARROYO_WALL);
    k = Math.max(k, 1 - smooth01(ARROYO_W0, ARROYO_W0 + 10, d));
  }
  return { k, top };
}

export interface CoastSpec {
  /** x of the parcel's west edge (ocean + beach tiles) = the bluff line. */
  coastW: number;
  /** Nominal waterline x (ocean tiles' east edge). */
  oceanX: number;
  /** Lot length along z (world units). */
  cH: number;
}

export function coastSpec(oceanWidth: number, beachWidth: number, gridH: number, tileSize = 2): CoastSpec {
  return { coastW: (oceanWidth + beachWidth) * tileSize, oceanX: oceanWidth * tileSize, cH: gridH * tileSize };
}

/** Smooth pseudo-noise in [-1, 1] along one axis (three incommensurate sines). */
export function sineNoise(t: number, seed = 0): number {
  return Math.sin(t * 1.0 + seed * 1.7 + 0.3) * 0.5
    + Math.sin(t * 2.31 + seed * 2.9 + 1.9) * 0.3
    + Math.sin(t * 5.17 + seed * 0.7 + 4.1) * 0.2;
}

function smooth01(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** 1 inside the lot band, easing to 0 within 12 units beyond either lot end. */
export function lotBandWeight(z: number, c: CoastSpec): number {
  const out = Math.max(-z, z - c.cH, 0);
  return 1 - smooth01(0, 12, out);
}

/** Bluff-top height: parcel grade on the lot, halo / town ground beyond. */
export function coastTopY(z: number, c: CoastSpec): number {
  const out = Math.max(-z, z - c.cH, 0);
  if (out <= 0) return 0;
  return -0.05 - 0.05 * smooth01(4, 8, out);
}

export interface CoastSection {
  /** Waterline. */
  xs: number;
  /** Bluff toe (top of the beach). */
  xf: number;
  /** Bluff crest. */
  xt: number;
  /** Bluff-top height. */
  topY: number;
  /** 0..1 how much of a rocky headland point this stretch is. */
  point: number;
  /** 0..1 how much of an arroyo mouth this is (canyon notch + sand / cobble fan). */
  mouth: number;
}

/**
 * Coastline section at z. Lot band: the crest wanders 0–30% of the
 * beach strip inland of coastW, the face takes 30–55% and the beach the
 * rest (at least ~0.6 units of sand). Beyond the lot: headlands and coves.
 */
export function coastSection(z: number, c: CoastSpec): CoastSection {
  const A = Math.max(1, c.coastW - c.oceanX);           // beach strip width (4 on a full lot)
  const band = lotBandWeight(z, c);
  // Eroded crest: small bites out of the bluff edge
  // Beyond the lot the crest wanders far more: bites behind gullies, slumps,
  // buttresses standing proud (Torrey Pines / Isla Vista bluffs)
  const erode = A * (0.16 + 0.12 * sineNoise(z * 0.21, 1) + 0.04 * sineNoise(z * 0.9, 5))
    + (1 - band) * (1.6 + 1.4 * sineNoise(z * 0.083, 12) + 0.8 * sineNoise(z * 0.29, 13) + 1.6 * gullyAt(z) + crestBites(z));
  // Headland points beyond the lot (seaward bulge of the whole bluff)
  const slow = sineNoise(z * 0.0105, 3);                  // ~600-unit wavelength
  // Far down the coast: big points and the bights between them (Coal Oil /
  // Goleta Point, Point Dume, Torrey Pines — ~0.3–0.8 km seaward over 2–4 km)
  const outZ = Math.max(-z, z - c.cH, 0);
  const bigK = smooth01(50, 260, outZ);
  const big = bigK * 120 * Math.pow(Math.max(0, sineNoise(z * 0.0042 + 0.7, 11) + 0.15) / 1.15, 1.6);
  const head = 34 * Math.pow(Math.max(0, slow + 0.25) / 1.25, 1.4) + 3 * Math.max(0, sineNoise(z * 0.06, 7)) + big;
  const point = (1 - band) * Math.min(1, head / 26);
  const xt = c.coastW - Math.max(0, erode) - (1 - band) * head;
  // Face run (steep sandstone: ~3.8-unit drop over ~1.2–2.2 units)
  const run = A * (0.38 + 0.1 * sineNoise(z * 0.37, 2));
  const xf = xt - run;
  // Beach width: lot band = whatever the strip leaves (wanders), coves wide, points narrow
  const bandBeach = A * (0.5 + 0.22 * sineNoise(z * 0.13, 4));
  const farBeach = 0.9 + 4.5 * Math.pow(1 - Math.min(1, head / 30), 2) * (0.75 + 0.25 * sineNoise(z * 0.045, 6));
  // talus / sand fans spill onto the strand below each gully
  // (a bite's slump / sand fan keeps the waterline from retreating the whole way; points stand in the surf)
  let beach = band * bandBeach + (1 - band) * (farBeach + 1.6 * gullyAt(z) + 0.45 * Math.max(0, crestBites(z)) - 0.5 * Math.max(0, -crestBites(z)));
  beach = Math.max(A * 0.18, beach);
  // Arroyo mouths: the bluff top drops to the canyon floor and the outwash
  // fan pushes the beach a little further out
  const notch = arroyoNotch(z, c.cH);
  const xs = xf - beach - 3.5 * notch.k;
  return { xs, xf, xt, topY: Math.min(coastTopY(z, c), notch.top), point, mouth: notch.k };
}

/**
 * Plan-view raggedness of the bluff beyond the lot (units inland; negative =
 * a small promontory standing seaward). Torrey Pines / Isla Vista cliffs bite
 * back in slump scars and gully heads every ~20–60 m (3–10 units) and leave
 * buttresses and small points between them, 5–20 m in and out.
 */
export function crestBites(z: number): number {
  const scar = 2.4 * Math.pow(Math.max(0, Math.sin(z * 0.19 + 1.7 * Math.sin(z * 0.047 + 0.6))), 3);
  const head = 1.5 * Math.pow(Math.max(0, Math.sin(z * 0.43 + 1.2 * Math.sin(z * 0.11 + 2.2))), 4);
  const point = 1.8 * Math.pow(Math.max(0, Math.sin(z * 0.123 + 2.4 + 1.4 * Math.sin(z * 0.031))), 8);
  return scar + head - point;
}

/** Rain-gully strength at z (0 … ~1.6): sharp, irregularly spaced notches in the bluff. */
export function gullyAt(z: number): number {
  return Math.pow(Math.max(0, Math.sin(z * 0.9 + 1.3 * Math.sin(z * 0.23))), 6)
    + 0.6 * Math.pow(Math.max(0, Math.sin(z * 0.53 + 2.1)), 10);
}

/** Columns of the cross-section (x, y) at z, west → east (shared by mesh + height queries). */
export interface CoastColumn { x: number; y: number; kind: 'sea' | 'wet' | 'sand' | 'toe' | 'face' | 'crest' | 'top' }

export function coastColumns(z: number, c: CoastSpec, s: CoastSection = coastSection(z, c)): CoastColumn[] {
  const { xs, xf, xt, topY } = s;
  const bluffH = topY - BEACH_Y;
  const run = xt - xf;
  const wet = Math.min(0.35, (xf - xs) * 0.25);
  const cols: CoastColumn[] = [
    { x: xs - 40, y: SEA_Y - 4.5, kind: 'sea' },
    { x: xs - 8, y: SEA_Y - 1.1, kind: 'sea' },
    { x: xs - 1.6, y: SEA_Y - 0.18, kind: 'sea' },
    { x: xs, y: SEA_Y, kind: 'wet' },
    { x: xs + wet, y: SEA_Y + 0.05, kind: 'wet' },
    { x: xs + wet + (xf - xs - wet) * 0.55, y: SEA_Y + 0.05 + (BEACH_Y - SEA_Y - 0.05) * 0.45 + 0.18 * s.mouth, kind: 'sand' },
    { x: xf, y: BEACH_Y, kind: 'toe' },
    // Talus apron, then a ledged face (harder caprock bands stand proud,
    // softer beds recess) cut by rain gullies every few meters.
    { x: xt, y: topY, kind: 'crest' },
  ];
  const gully = gullyAt(z) * (1 + 1.5 * (1 - lotBandWeight(z, c)));
  const FACE: Array<[number, number]> = [[0.14, 0.1], [0.3, 0.3], [0.4, 0.48], [0.6, 0.6], [0.7, 0.8], [0.88, 0.93]];
  // The ledges are harder beds standing proud: they follow the beds' dip and
  // folds (faceLedgeShift), so they climb and fall along the coast and
  // pinch out instead of running as level stripes at fixed heights
  // (Isla Vista: Monterey / Sisquoc beds tilted 10–30°; Torrey Pines:
  // cross-bedded Torrey Sandstone under the flat terrace cap).
  const sh = faceLedgeShift(z);
  const face: CoastColumn[] = FACE.map(([fx, fy], k) => {
    const fyk = Math.min(0.97, Math.max(0.04, fy + (k === FACE.length - 1 ? 0.25 : 1) * sh + 0.035 * sineNoise(z * 0.11 + k * 2.3, 20 + k)));
    const pinch = 0.5 + 0.5 * sineNoise(z * 0.07 + k * 1.9, 30 + k);   // ledge stands proud / weathers back
    return {
      x: Math.min(xt - 0.02, xf + run * (fx + 0.09 * sineNoise(z * 1.3 + k * 1.7, 8 + k) + 0.07 * (pinch - 0.5) + gully * 0.3 * Math.sin(fyk * Math.PI))),
      y: BEACH_Y + bluffH * fyk,
      kind: 'face',
    };
  });
  for (let k = 1; k < face.length; k++) face[k].y = Math.max(face[k].y, face[k - 1].y + bluffH * 0.06);
  for (let k = face.length - 1; k >= 0; k--) face[k].y = Math.min(face[k].y, (k === face.length - 1 ? topY : face[k + 1].y) - bluffH * 0.04);
  for (let k = 0; k < face.length; k++) face[k].x = Math.max(face[k].x, (k ? face[k - 1].x : xf) + 0.01);
  // ...and never past the crest (deep gullies push the face back toward it)
  for (let k = face.length - 1; k >= 0; k--) face[k].x = Math.min(face[k].x, k === face.length - 1 ? xt - 0.02 : face[k + 1].x - 0.01);
  cols.splice(cols.length - 1, 0, ...face);
  // Fixed column count (the mesh is a regular strip): the top column meets the
  // parcel edge / the regional landscape at coastW.
  // Along the lot it meets the parcel edge; beyond the lot the regional
  // landscape itself forms the bluff top (headland tops are mesa, not a
  // separate terrace), so the strip only laps a little way over it behind
  // the crest and the seam follows the eroded bluff line, never a ruled line.
  const band = lotBandWeight(z, c);
  // Beyond the lot the lap reaches past the landscape's own crest (the most
  // inland crest within a landscape row, landscapeCrestX) so the strip can
  // fade out over the landscape there with no seam (coastMesh dithers it out).
  const lap = Math.max(TOP_LAP, landscapeCrestX(z, c) + LAP_FADE_FROM + LAP_FADE + 0.5 - xt);
  cols.push({ x: band * Math.max(c.coastW, xt + 0.02) + (1 - band) * (xt + lap), y: topY, kind: 'top' });
  return cols;
}

/** Vertical shift (fraction of the bluff height) of the face ledges at z: folded, dipping beds. */
export function faceLedgeShift(z: number): number {
  return 0.11 * Math.sin(z * 0.017 + 0.4) + 0.07 * Math.sin(z * 0.043 + 2.1) + 0.04 * Math.sin(z * 0.11 + 1.0);
}

/** Beyond the lot: where the strip's bluff top starts / takes to dither out over the landscape (from landscapeCrestX). */
export const LAP_FADE_FROM = 2;
export const LAP_FADE = 4;

/**
 * The most inland crest within a landscape mesh row either way of z (the
 * regional landscape stays down below the bluff top seaward of it, and is at
 * bluff-top height from here inland).
 */
export function landscapeCrestX(z: number, c: CoastSpec): number {
  let x = coastSection(z, c).xt;
  // (the landscape's rows open up to ~10 units apart a few hundred units out)
  for (const dz of [-12, -8, -4, 4, 8, 12]) x = Math.max(x, coastSection(z + dz, c).xt);
  return x;
}

/** Height of the rendered coast surface at (x, z) (piecewise linear across the section). */
export function coastSurfaceY(x: number, z: number, c: CoastSpec): number {
  const cols = coastColumns(z, c);
  if (x <= cols[0].x) return cols[0].y;
  for (let i = 1; i < cols.length; i++) {
    if (x <= cols[i].x) {
      const a = cols[i - 1], b = cols[i];
      const t = (x - a.x) / Math.max(1e-6, b.x - a.x);
      return a.y + (b.y - a.y) * t;
    }
  }
  return cols[cols.length - 1].y;
}

/** Waterline x at z (what the ocean shader samples). */
export function waterlineX(z: number, c: CoastSpec): number {
  return coastSection(z, c).xs;
}
