/**
 * regionalFarmsteads — the farms beyond the town, built the way each region
 * really builds them (RegionalProps instances; the yard / lane / annex layout
 * comes from regionalRoads.planRegionalRoads).
 *
 * Local frame: +z away from the road, the lane arrives at (0, −5), the yard
 * is the ±7.5 square; the annex block (when planned) lies behind it at
 * z 11 … 11 + len. 1 unit ≈ 6 m (SCALE v2).
 *
 * Real references:
 *   plains   Story County IA / Champaign County IL farmstead: white foursquare
 *            house, red gambrel-roof barn, concrete stave silo or a blue
 *            glass-lined Harvestore silo, corrugated grain bins round a
 *            leg, steel machine shed, spruce / red-cedar windbreak on the
 *            north and west; a quarter of farms with two long hog
 *            confinement barns (Iowa leads the US in hogs).
 *   mountain Cache Valley UT / Gallatin Valley MT: pioneer-brick or frame
 *            house, open pole hay barn stacked with big square bales, a
 *            stackyard, pole corrals, Lombardy poplar windbreak rows.
 *   drumlin  Vermont / New Hampshire connected farm ("big house, little
 *            house, back house, barn" in a line), red or weathered bank barn,
 *            dairy stave silo, sugar house; sugar maples along the road.
 *   bayou    Mississippi / Georgia: one-storey farmhouse with porch and a tin
 *            roof, rusty-roofed pole barn, round bales at the field edge, and
 *            either a row of long broiler houses with feed bins (the poultry
 *            belt) or a pecan grove behind the yard; live oak by the house.
 *   sound    Willamette / Skagit valley: tall steep-roofed barn (gray cedar
 *            or red) with lean-to, farmhouse, grass-seed straw stacks under
 *            tarps, Douglas fir windbreak.
 *   coast    Irvine Ranch / Oxnard: low stucco ranch house under red tile,
 *            packing shed, water tank, eucalyptus windrow.
 *   appalachia  a Kentucky / east Tennessee hollow farm: one-and-a-half
 *            storey frame farmhouse under a standing-seam tin roof with a
 *            full porch, a tall black-stained tobacco barn (or a weathered
 *            gray hay barn), round bales in the bottom, sometimes a
 *            single-wide on the same place.
 *   desert   a high-desert ranchette (Concho AZ / Deming NM): stucco
 *            flat-roof house or a manufactured home, an Aermotor windmill
 *            over a galvanized stock tank, a poly / steel water tank, a
 *            ramada, a pipe corral, one cottonwood or Siberian elm.
 *   north_woods  northern Minnesota / Maine: a steep-roofed log or
 *            clapboard house, a woodshed stacked full, a small gray barn,
 *            a sauna (the Finnish settlements of the Iron Range), spruce
 *            close round the clearing.
 *   upper_midwest  a Wisconsin dairy farm: white gabled-ell farmhouse, a
 *            big red gambrel dairy barn with a milk house, two concrete
 *            stave silos (and often a blue Harvestore), a steel machine
 *            shed, sugar maples by the house.
 *   ozarks   a Missouri / Arkansas hill farm: a small frame house under a
 *            metal roof with a porch, a single-wide beside it, a pole barn
 *            and hay shed, round bales, and on a third of farms two long
 *            broiler houses (the Arkansas poultry belt).
 *   hill_country  a Llano / Gillespie County ranch: a limestone ranch house
 *            under a standing-seam roof (the German stone houses round
 *            Fredericksburg), a windmill and stock tank, a galvanized pole
 *            barn, pipe pens, live oak shade.
 *   rust_belt  an eastern-Ohio / western-PA farm on a town's edge: a
 *            two-storey vinyl-sided farmhouse, a faded red bank barn, a
 *            metal pole building, a detached garage, an old car or two.
 */
import type { Farmstead } from './farmstead';
import type { RegionKind } from '../terrain/regionalLandscape';
import { FARM_PALETTE, type RegionalProps } from './regionalProps';

/** A burned-out farm's walls: char and soot. */
const CHARRED = { house: [0x2b2622, 0x342c26], barn: [0x241f1b, 0x2e2722] };

export type FarmTreeSpecies = 'fir' | 'broad' | 'liveoak' | 'poplar' | 'eucalyptus' | 'spruce' | 'juniper';

export interface FarmTree { x: number; z: number; h: number; sp: FarmTreeSpecies }

function hash(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const STRAW = 0xc4ad6a;
const CONCRETE = 0xc9c4b8;
const STEEL = 0xa9adb0;

/**
 * Build one farmstead. `ground(x, z)` is the surface height, `slope(x, z)`
 * the local slope (trees skip steep ground); trees are returned through
 * `tree` (the regional tree sets draw them).
 */
export function buildFarmstead(
  f: Farmstead, kind: RegionKind, props: RegionalProps,
  ground: (x: number, z: number) => number, slope: (x: number, z: number) => number,
  tree: (t: FarmTree) => void,
): void {
  const pal = f.burned ? CHARRED : FARM_PALETTE[kind];
  const c = Math.cos(f.rot), sn = Math.sin(f.rot);
  const W = (lx: number, lz: number): [number, number] => [f.x + lx * c + lz * sn, f.z - lx * sn + lz * c];
  const g = (lx: number, lz: number): number => { const [x, z] = W(lx, lz); return ground(x, z); };
  const h = hash(f.x, f.z), h2 = hash(f.z, f.x), h3 = hash(f.x * 2, f.z);
  const pick = (arr: number[], k: number): number => arr[Math.floor(k * arr.length) % arr.length];
  /** gable building */
  const B = (lx: number, lz: number, rot: number, w: number, ht: number, d: number, wall: number, roof: number, roofH: number): void =>
    props.building(W(lx, lz), g(lx, lz), f.rot + rot, w, ht, d, wall, roof, roofH);
  /** gambrel barn */
  const G = (lx: number, lz: number, rot: number, w: number, ht: number, d: number, wall: number, roof: number, roofH: number): void =>
    props.barn(W(lx, lz), g(lx, lz), f.rot + rot, w, ht, d, wall, roof, roofH);
  const S = (lx: number, lz: number, r: number, ht: number, col: number, cap: number | null): void => {
    const [x, z] = W(lx, lz); props.silo(x, ground(x, z), z, r, ht, col, cap);
  };
  const BX = (lx: number, lz: number, rot: number, w: number, ht: number, d: number, col: number, dy = 0): void => {
    const [x, z] = W(lx, lz); props.box(x, ground(x, z) + dy, z, f.rot + rot, w, ht, d, col);
  };
  const T = (lx: number, lz: number, ht: number, sp: FarmTreeSpecies): void => {
    const [x, z] = W(lx + (hash(lx, lz + f.x) - 0.5) * 0.5, lz + (hash(lz, lx + f.z) - 0.5) * 0.5);
    if (slope(x, z) > 0.3) return;
    tree({ x, z, h: ht * (0.85 + 0.3 * hash(x, z)), sp });
  };
  /** windbreak rows: back (z = 9.5) and the west / left flank (x = −9.5) */
  const windbreak = (sp: FarmTreeSpecies, ht: number, gap = 2.2, sides: 'back' | 'both' = 'both'): void => {
    for (let t = -8; t <= 8; t += gap) {
      if (!(f.annex && Math.abs(t) < 1.6)) T(t, 9.5, ht, sp);   // leave the drive to the annex open
      if (sides === 'both') T(-9.5, t, ht, sp);
    }
  };
  /**
   * A long barn along local z on a graded gravel pad: level at the higher
   * end's grade, a concrete foundation down to the lower end (no sunk or
   * floating ends), roof ridge along its length.
   */
  const longBarn = (lx: number, z0: number, z1: number, w: number, ht: number, wall: number, roof: number, roofH: number): void => {
    let lo = Infinity, hi = -Infinity;
    for (let t = 0; t <= 4; t++) { const y = g(lx, z0 + (z1 - z0) * t / 4); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    const lzm = (z0 + z1) / 2, len = z1 - z0;
    const [x, z] = W(lx, lzm);
    props.box(x, lo - 0.12, z, f.rot, w + 0.9, hi - lo + 0.15, len + 0.9, 0x8e8068);          // graded gravel pad
    props.box(x, lo - 0.1, z, f.rot, w + 0.04, hi - lo + 0.12, len + 0.04, 0xa8a49a);         // foundation
    props.building([x, z], hi + 0.02, f.rot + Math.PI / 2, len, ht, w, wall, roof, roofH);
  };
  /** Aermotor windmill: a slender lattice tower, the wheel and vane on top, a stock tank at its foot. */
  const windmill = (lx: number, lz: number): void => {
    BX(lx, lz, 0.4, 0.14, 1.9, 0.14, 0x8e9296);
    BX(lx, lz, 0.4, 0.62, 0.62, 0.04, 0x9aa0a4, 1.75);
    BX(lx + 0.25, lz, 0.4 + Math.PI / 2, 0.5, 0.18, 0.03, 0x9aa0a4, 1.95);
    const [x, z] = W(lx + 0.9, lz + 0.3); props.silo(x, ground(x, z), z, 0.5, 0.14, 0x8a9094, null);
  };
  const bins = (lx: number, lz0: number, n: number, r: number, ht: number): void => {
    for (let k = 0; k < n; k++) { const [x, z] = W(lx, lz0 + k * (r * 2 + 0.25)); props.bin(x, ground(x, z), z, r, ht); }
  };

  if (f.uni) {
    // Land-grant research farm (Illinois South Farms, Iowa State dairy farm,
    // Utah State's Caine dairy): white institutional barns, a red round barn
    // (the Illinois / Indiana experiment-station type), greenhouse range
    B(-3.4, -4.0, 0, 2.2, 0.75, 1.2, 0xe8e2d4, 0x55585c, 0.35);                 // farm office
    G(2.4, 0.6, 0, 1.8, 0.95, 5.0, 0xf0eee6, 0x5a5e62, 1.15);                   // long dairy barn
    G(-0.6, 0.6, 0, 1.6, 0.85, 4.2, 0xf0eee6, 0x5a5e62, 1.0);
    S(-4.6, 2.8, 1.35, 1.1, 0x8a2c22, 0x55585c);                                 // round barn
    BX(-4.6, 2.8, 0, 0.4, 0.35, 0.4, 0xe8e4da, 2.0);                             //   cupola
    S(4.4, 4.4, 0.42, 3.4, CONCRETE, 0x8a8e92);
    S(5.4, 4.4, 0.42, 3.0, CONCRETE, 0x8a8e92);
    for (let k = 0; k < 4; k++) B(-6.6 + k * 1.25, -6.2 + 12.2, Math.PI / 2, 2.6, 0.38, 1.0, 0xdfe8ea, 0xcfdcdf, 0.3);
    windbreak('fir', 2.3, 2.6, 'back');
    const a = f.annex;
    if (a?.kind === 'plots') {
      // experiment-plot block: mown grass alleys between small plots, a plot shed
      for (let lx = a.x0; lx <= a.x1 + 0.01; lx += (a.x1 - a.x0) / 4) BX(lx, (a.z0 + a.z1) / 2, Math.PI / 2, a.z1 - a.z0, 0.025, 0.35, 0x7a8456);
      for (let lz = a.z0; lz <= a.z1 + 0.01; lz += 2.6) BX(0, lz, 0, a.x1 - a.x0, 0.025, 0.3, 0x7a8456);
      B(a.x1 - 1.2, a.z0 - 0.9, 0, 1.6, 0.5, 1.0, STEEL, 0x8c9094, 0.2);
    }
    return;
  }
  switch (kind) {
    case 'plains':
    case 'city': {
      // white foursquare house, red gambrel barn, silo, bins, machine shed, spruce windbreak
      B(-3.2, -3.4, 0, 1.45, 1.35, 1.45, pick(pal.house, h), 0x4a4a4e, 0.5);
      B(-3.2, -2.4, 0, 1.2, 0.45, 0.5, 0xe8e4da, 0x55585c, 0.12);   // front porch
      G(2.6, 1.6, 0, 2.3, 1.05, 3.6, pick([0x8a2c22, 0x9a3a2a, 0x8a2c22, 0xa8a49a], h2), 0x3e3f42, 1.35);
      if (h3 < 0.65) S(4.6, 4.1, 0.46, 3.7, CONCRETE, 0x8a8e92);                         // concrete stave silo
      else S(4.6, 4.1, 0.55, 4.4, 0x2b3f5e, 0x3c4e66);                                      // Harvestore (blue glass-lined)
      if (f.big || h3 < 0.5) B(-3.8, 3.8, Math.PI / 2, 3.9, 1.05, 2.4, STEEL, 0x8c9094, 0.32);
      bins(6.2, -5.4, f.big ? 3 + Math.floor(h * 2) : 1 + Math.floor(h * 2), f.big ? 0.75 : 0.6, f.big ? 1.7 : 1.4);
      if (f.big) {
        // grain leg: a tall steel tower over the bins with a spout
        BX(7.4, -5.4, 0, 0.32, 3.4, 0.32, 0x8e9296);
        BX(6.9, -4.4, 0.6, 0.08, 0.08, 2.0, 0x8e9296, 3.1);
      }
      // the Great Plains windmill (most farmsteads still have one standing)
      if (h2 < 0.55) windmill(-6.4, -1.4);
      windbreak('fir', 2.3);
      break;
    }
    case 'appalachia': {
      // 1½-storey frame farmhouse, tin roof, full porch; tobacco or hay barn; round bales
      const tin = pick([0x9aa0a2, 0x8a3a2a, 0x9aa0a2, 0x5a6a5e], h3);
      B(-3.2, -3.4, 0, 1.6, 0.85, 1.2, pick(pal.house, h), tin, 0.6);
      B(-3.2, -4.25, 0, 1.6, 0.42, 0.42, 0xe8e4da, tin, 0.1);                        // porch
      BX(-2.6, -3.4, 0, 0.16, 1.55, 0.16, 0x8a6a58);                                  // brick chimney
      if (h2 < 0.6) {
        // tobacco barn: tall and narrow, black-stained board walls, tin roof
        B(2.8, 1.8, 0, 2.0, 1.55, 3.6, 0x2e2a28, 0x7a7e80, 0.55);
      } else {
        B(2.8, 1.8, 0, 2.4, 1.0, 2.8, pick([0x6e655a, 0x7a7064], h3), 0x8a5a3c, 0.6);   // weathered hay barn
        B(4.4, 1.8, 0, 0.9, 0.7, 2.8, 0x6e655a, 0x8a5a3c, 0.15);
      }
      // a single-wide on the same place (the next generation)
      if (h3 < 0.4) BX(-5.8, 2.6, Math.PI / 2, 2.4, 0.45, 0.6, pick([0xe8e4da, 0xc8c0aa], h2), 0.08);
      for (let k = 0; k < 5; k++) { const [x, z] = W(-1 + k * 0.5, 6.6 + (hash(k, f.z) - 0.5) * 0.2); props.bale(x, ground(x, z), z, f.rot + Math.PI / 2, 0.27, 0.25); }
      T(-5.6, -5.4, 2.2, 'broad'); T(-0.8, -6.0, 2.0, 'broad');
      break;
    }
    case 'desert': {
      // stucco flat roof or a manufactured home; windmill + stock tank; water tank; ramada; pipe corral
      if (h < 0.5) {
        B(-3.2, -3.4, 0, 2.2, 0.55, 1.4, pick(pal.house, h2), pick(pal.house, h2), 0.05);   // flat roof with a parapet
        BX(-3.2, -3.4, 0, 2.3, 0.08, 1.5, pick([0xc8b090, 0xb89a78], h3), 0.55);
      } else {
        BX(-3.2, -3.4, 0, 2.6, 0.48, 0.65, pick([0xe0d6c0, 0xc8bca4, 0xd8ccb0], h2), 0.06);  // double-wide
        BX(-3.2, -3.4, 0, 2.62, 0.04, 0.68, 0xa8a49a, 0.54);
      }
      windmill(4.2, -3.6);
      S(-6.2, 1.2, 0.42, 0.75, pick([0x2e3a2e, 0xa9adb0, 0xd8d0b8], h3), 0x9aa0a2);       // water tank
      { const [x, z] = W(0.4, -1.6); props.roof([x, z], ground(x, z) + 0.45, f.rot, 1.6, 1.2, 0x9a7a52, 0.04); }   // ramada
      for (const [px, pz] of [[-0.35, -2.1], [1.15, -2.1], [-0.35, -1.1], [1.15, -1.1]]) BX(px, pz, 0, 0.06, 0.45, 0.06, 0x6a5440);
      const [cx, cz, r] = [3.6, 2.4, 2.2];
      for (const [ax, az, bx2, bz2] of [[-r, -r, r, -r], [r, -r, r, r], [r, r, -r, r], [-r, r, -r, -r]]) {
        const mx = cx + (ax + bx2) / 2, mz = cz + (az + bz2) / 2;
        const along = Math.abs(bz2 - az) > 0.1 ? Math.PI / 2 : 0;
        for (const y of [0.1, 0.2]) BX(mx, mz, along, Math.hypot(bx2 - ax, bz2 - az), 0.025, 0.025, 0x8a8e90, y);
        BX(cx + ax, cz + az, 0, 0.05, 0.26, 0.05, 0x6e7274);
      }
      B(3.6, 5.6, 0, 1.4, 0.5, 1.0, 0xa9adb0, 0x9aa0a2, 0.12);                          // steel shed
      T(-5.8, -5.6, 2.0, 'broad');
      break;
    }
    case 'north_woods': {
      // steep-roofed log / clapboard house, woodshed, small gray barn, sauna; spruce round the clearing
      B(-3.2, -3.4, 0, 1.3, 0.75, 1.1, pick(pal.house, h), pick([0x3e3f42, 0x6a3a2c, 0x3a4a3e], h2), 0.75);
      BX(-2.7, -3.4, 0, 0.14, 1.45, 0.14, 0x7a7068);                                  // chimney
      { const [x, z] = W(-0.4, -4.2); props.roof([x, z], ground(x, z) + 0.45, f.rot, 1.4, 0.7, 0x5a5048, 0.12); }
      BX(-0.4, -4.2, 0, 1.3, 0.42, 0.55, 0x8a6a44);                                  // woodshed, stacked full
      B(2.6, 1.6, 0, 1.9, 0.9, 2.4, pick(pal.barn, h2), 0x4a4a4e, 0.8);
      B(-4.6, 2.4, 0, 0.6, 0.38, 0.6, 0x6e5440, 0x3e3f42, 0.25);                      // sauna
      BX(-4.4, 2.4, 0, 0.06, 0.75, 0.06, 0x3a3a3c);
      for (let t = -9; t <= 9; t += 1.4) { T(t, 9.4, 3.0, 'spruce'); T(-9.4, t, 3.0, 'spruce'); if (t > -6) T(9.4, t, 2.8, 'spruce'); }
      break;
    }
    case 'upper_midwest': {
      // white gabled-ell farmhouse, red gambrel dairy barn + milk house, stave silos, Harvestore, machine shed, maples
      const white = pick(pal.house, h);
      B(-3.6, -3.6, 0, 1.3, 1.25, 1.4, white, 0x3e3f42, 0.6);
      B(-2.4, -3.4, Math.PI / 2, 1.0, 0.8, 1.2, white, 0x3e3f42, 0.45);              // the ell
      G(2.2, 1.4, 0, 2.4, 1.0, 4.4, pick(pal.barn, h2), 0x3e3f42, 1.4);
      B(2.2, -1.5, 0, 0.9, 0.5, 0.8, 0xf0ece2, 0x3e3f42, 0.25);                      // milk house
      S(4.2, 0.6, 0.42, 3.6, CONCRETE, 0x8a5a3c);
      S(4.2, 1.6, 0.42, 3.3, CONCRETE, 0x8a5a3c);
      if (h3 < 0.5) S(4.4, 3.4, 0.5, 4.2, 0x2b3f5e, 0x3c4e66);
      if (f.big || h3 < 0.6) B(-3.8, 3.6, Math.PI / 2, 3.4, 0.95, 2.0, STEEL, 0x8c9094, 0.32);
      for (let t = -8; t <= 8; t += 2.8) if (Math.abs(t) > 1.6) T(t, -7.6, 2.5, 'broad');
      T(-5.8, -1.8, 2.6, 'broad');
      windbreak('fir', 2.4, 2.6, 'back');
      break;
    }
    case 'ozarks': {
      // small frame house, metal roof, porch; a single-wide; pole barn and hay shed; round bales; maybe broiler houses
      const tin = pick([0x9aa0a2, 0x8a3a2a, 0x3e5a4a, 0x9aa0a2], h3);
      B(-3.4, -3.4, 0, 1.5, 0.6, 1.2, pick(pal.house, h), tin, 0.45);
      B(-3.4, -4.2, 0, 1.5, 0.36, 0.4, 0xe8e4da, tin, 0.08);
      if (h2 < 0.6) BX(-5.8, 1.6, Math.PI / 2, 2.4, 0.45, 0.6, pick([0xe8e4da, 0xc8c0aa, 0xb8c0b8], h3), 0.08);
      B(2.6, 1.6, 0, 2.6, 0.9, 2.2, pick(pal.barn, h2), 0x9aa0a2, 0.3);                 // metal pole barn
      { const [x, z] = W(2.6, -2.2); props.roof([x, z], ground(x, z) + 0.6, f.rot, 2.2, 1.4, 0x8a8e92, 0.2); }
      for (let k = 0; k < 6; k++) { const [x, z] = W(-1.4 + k * 0.45, 6.4 + (hash(k, f.x) - 0.5) * 0.2); props.bale(x, ground(x, z), z, f.rot + Math.PI / 2, 0.27, 0.25); }
      if (h3 < 0.35) {
        for (const lx of [-2.2, 2.2]) longBarn(lx, 9, 22, 2.0, 0.38, 0xe8e6e0, 0xb8bcbe, 0.22);
      }
      T(-5.8, -5.6, 2.3, 'broad'); T(0.2, -6.2, 2.0, 'broad');
      break;
    }
    case 'hill_country': {
      // limestone ranch house, standing-seam roof, porch; windmill + stock tank; pole barn; pipe pens; live oaks
      B(-3.2, -3.4, 0, 2.2, 0.6, 1.3, pick(pal.house, h), pick([0x9aa0a2, 0x5a6a5e, 0x8a3a2a], h2), 0.4);
      B(-3.2, -4.3, 0, 2.2, 0.38, 0.45, 0xd8ccb0, 0x9aa0a2, 0.08);
      BX(-2.3, -3.4, 0, 0.16, 1.1, 0.16, 0xcfc2a2);                                 // stone chimney
      windmill(4.6, -3.8);
      B(2.6, 2.0, 0, 2.6, 0.85, 2.0, pick(pal.barn, h2), 0x9aa0a2, 0.28);
      const [cx, cz, r] = [-3.6, 3.8, 1.8];
      for (const [ax, az, bx2, bz2] of [[-r, -r, r, -r], [r, -r, r, r], [r, r, -r, r], [-r, r, -r, -r]]) {
        const mx = cx + (ax + bx2) / 2, mz = cz + (az + bz2) / 2;
        const along = Math.abs(bz2 - az) > 0.1 ? Math.PI / 2 : 0;
        for (const y of [0.1, 0.2]) BX(mx, mz, along, Math.hypot(bx2 - ax, bz2 - az), 0.025, 0.025, 0x8a8e90, y);
        BX(cx + ax, cz + az, 0, 0.05, 0.26, 0.05, 0x6e7274);
      }
      T(-5.8, -5.8, 2.0, 'liveoak'); T(-0.6, -6.4, 1.8, 'liveoak'); T(6.4, 4.6, 1.9, 'liveoak');
      break;
    }
    case 'rust_belt': {
      // two-storey vinyl farmhouse, faded red bank barn, pole building, garage, an old car or two
      B(-3.4, -3.4, 0, 1.3, 1.2, 1.3, pick(pal.house, h), 0x3e3f42, 0.55);
      B(-3.4, -4.25, 0, 1.3, 0.4, 0.4, 0xe8e4da, 0x3e3f42, 0.08);
      B(-1.3, -3.6, 0, 0.9, 0.5, 0.9, pick(pal.house, h2), 0x3e3f42, 0.3);           // garage
      G(2.6, 1.8, 0, 2.3, 1.0, 3.6, pick(pal.barn, h2), 0x55585c, 1.2);                // bank barn
      if (h3 < 0.55) S(4.5, 0.4, 0.38, 2.6, CONCRETE, null);                            // old silo, its roof gone
      B(-3.6, 3.6, Math.PI / 2, 2.8, 0.85, 1.8, STEEL, 0x8c9094, 0.28);
      for (let k = 0; k < 1 + Math.floor(h * 2); k++) BX(-6.4 + k * 0.9, 0.6, 0.3 * k, 0.75, 0.22, 0.32, pick([0x7a2a22, 0x2e3a4a, 0x8a8478, 0x5a4a3a], hash(k, f.x)));
      for (let t = -8; t <= 8; t += 3) if (Math.abs(t) > 2) T(t, -7.6, 2.4, 'broad');
      break;
    }
    case 'mountain': {
      // pioneer brick or frame house, open hay barn full of bales, stackyard, corrals, poplars
      const brick = h < 0.45;
      B(-3.4, -3.6, 0, 1.6, 1.0, 1.25, brick ? 0x9a5a42 : pick(pal.house, h2), 0x3e3f42, 0.55);
      // pole hay barn: a roof on posts, stacked big bales under it
      const [hx, hz] = [2.6, 1.8];
      for (const [px, pz] of [[-1.6, -1.1], [1.6, -1.1], [-1.6, 1.1], [1.6, 1.1], [0, -1.1], [0, 1.1]]) BX(hx + px, hz + pz, 0, 0.12, 1.35, 0.12, 0x6a5440);
      { const [x, z] = W(hx, hz); props.roof([x, z], ground(x, z) + 1.35, f.rot, 3.6, 2.6, pick([0x8a8e92, 0x7a4a30, 0x9aa0a2], h2), 0.45); }
      BX(hx, hz, 0, 3.0, 0.95, 2.0, STRAW);
      // stackyard and a second stack in the open
      BX(-3.4, 4.2, Math.PI / 2, 3.2, 0.7, 1.3, 0xb8a060);
      BX(-0.6, 5.8, 0, 2.2, 0.55, 1.1, 0xbaa666);
      // pole corral: two rails round a square pen
      const [cx, cz, r] = [4.6, -4.6, 1.8];
      for (const [ax, az, bx2, bz2] of [[-r, -r, r, -r], [r, -r, r, r], [r, r, -r, r], [-r, r, -r, -r]]) {
        const mx = cx + (ax + bx2) / 2, mz = cz + (az + bz2) / 2;
        const len = Math.hypot(bx2 - ax, bz2 - az);
        const along = Math.abs(bz2 - az) > 0.1 ? Math.PI / 2 : 0;
        for (const y of [0.12, 0.24]) BX(mx, mz, along, len, 0.035, 0.035, 0x7a6448, y);
        BX(cx + ax, cz + az, 0, 0.07, 0.3, 0.07, 0x5a4634);
      }
      if (f.big || h3 < 0.5) B(-4.0, 1.0, Math.PI / 2, 2.8, 0.9, 1.8, STEEL, 0x8c9094, 0.3);
      bins(6.4, 1.6, 1 + Math.floor(h * 2), 0.6, 1.3);
      // Lombardy poplar rows (Utah / Idaho farm windbreaks)
      windbreak('poplar', 3.0, 1.5);
      break;
    }
    case 'drumlin': {
      // connected farm: big house → little house → back house → barn, in a line
      const white = pick([0xf4f2ea, 0xf0ece0, 0xe8e2d0], h);
      B(-5.2, -2.6, 0, 1.25, 1.15, 1.6, white, 0x3a3c40, 0.75);                    // big house (gable to the road)
      B(-3.5, -2.3, Math.PI / 2, 1.0, 0.75, 2.0, white, 0x3a3c40, 0.45);           // little house (kitchen ell)
      B(-1.6, -2.1, Math.PI / 2, 1.05, 0.85, 1.9, pick([0xe8e2d0, 0x9a948a], h2), 0x4a4a4e, 0.5); // back house / woodshed
      B(1.4, -1.6, Math.PI / 2, 2.4, 1.35, 3.6, pick([0x8a2c22, 0x7a2620, 0x6e5a44, 0x8a2c22], h2), 0x3e3f42, 1.0); // barn
      if (h3 < 0.55) S(3.7, -0.2, 0.4, 2.9, CONCRETE, 0x8a5a3c);                     // dairy stave silo
      B(4.4, 5.0, 0, 1.1, 0.55, 0.8, 0x7a6450, 0x4a4a4e, 0.45);                      // sugar house
      BX(4.4, 5.0, 0, 0.35, 0.22, 0.25, 0x5a4e44, 1.0);                               //   steam cupola
      // sugar maples along the road, broadleaf woods behind
      for (let t = -8.5; t <= 8.5; t += 2.6) if (Math.abs(t) > 1.6) T(t, -7.8, 2.4, 'broad');
      for (let t = -8; t <= 8; t += 2.4) T(t, 9.5, 2.3, 'broad');
      break;
    }
    case 'bayou': {
      // one-storey farmhouse with porch under a tin roof, pole barn, round bales
      B(-3.4, -3.4, 0, 2.0, 0.65, 1.35, pick(pal.house, h), 0x9aa0a2, 0.55);
      B(-3.4, -4.4, 0, 2.0, 0.42, 0.45, 0xe8e4da, 0x9aa0a2, 0.1);                    // full-width porch
      B(2.8, 1.6, 0, 2.4, 0.95, 2.8, pick([0x8a7a66, 0x6e5e4c, 0x8a8478], h2), pick([0x8a5a3c, 0x9aa0a2, 0x7a4a34], h3), 0.55);
      B(-3.6, 3.6, Math.PI / 2, 2.6, 0.8, 1.6, 0x8a8478, 0x9aa0a2, 0.25);
      // round bales in a row at the field edge
      for (let k = 0; k < 7; k++) { const [x, z] = W(-6 + k * 0.42, 7.2 + (hash(k, f.x) - 0.5) * 0.2); props.bale(x, ground(x, z), z, f.rot + Math.PI / 2, 0.27, 0.25); }
      T(-5.8, -5.6, 2.0, 'liveoak');   // shade oak by the house
      T(0.4, -6.4, 1.8, 'liveoak');
      const a = f.annex;
      if (a?.kind === 'poultry') {
        // broiler houses: ~12 m × 150 m, low white walls, silver roofs, feed bins at the road end
        const n = 4, gap = (a.x1 - a.x0) / n;
        for (let k = 0; k < n; k++) {
          const lx = a.x0 + gap * (k + 0.5);
          longBarn(lx, a.z0 + 1.0, a.z1, 2.0, 0.38, 0xe8e6e0, 0xb8bcbe, 0.22);
          const [bx, bz] = W(lx + 1.25, a.z0 + 0.6);
          props.bin(bx, ground(bx, bz) + 0.3, bz, 0.24, 0.75);
          BX(lx + 1.25, a.z0 + 0.6, 0, 0.06, 0.32, 0.06, 0x8e9296);
        }
        // service drive from the farmyard between the houses, and along their feed ends
        BX(0, (7.5 + a.z1) / 2, 0, 0.9, 0.04, a.z1 - 7.5, 0x8e8068, -0.02);
        BX(0, a.z0 + 0.2, 0, a.x1 - a.x0, 0.04, 0.8, 0x8e8068, -0.02);
      } else if (a?.kind === 'pecan') {
        for (let lz = a.z0 + 1; lz < a.z1; lz += 2.6) for (let lx = a.x0 + 1; lx < a.x1; lx += 2.6) T(lx, lz, 2.2, 'broad');
      } else {
        windbreak('broad', 2.4, 2.6, 'back');
      }
      break;
    }
    case 'sound': {
      // tall steep barn with lean-to, farmhouse, straw stacks, Douglas fir windbreak
      B(-3.4, -3.5, 0, 1.5, 1.15, 1.25, pick(pal.house, h), 0x2e3236, 0.7);
      const barnC = pick([0x7c756c, 0x6e665c, 0x7a2f26, 0x8a8478], h2);
      if (h3 < 0.5) G(2.4, 1.4, 0, 2.3, 1.15, 3.4, barnC, 0x3e4044, 1.5);
      else B(2.4, 1.4, 0, 2.3, 1.35, 3.4, barnC, 0x3e4044, 1.35);
      B(4.1, 1.4, 0, 1.1, 0.75, 3.4, barnC, 0x4a4e52, 0.18);                           // lean-to
      // grass-seed straw stacks, some under white / blue tarps
      for (let k = 0; k < 2 + Math.floor(h * 2); k++) {
        const lz = -5.5 + k * 1.6;
        BX(-6.6, lz + 6, 0, 2.6, 0.75, 1.2, STRAW);
        if (hash(k, f.z) < 0.6) BX(-6.6, lz + 6, 0, 2.66, 0.04, 1.26, hash(f.x, k) < 0.5 ? 0xd8dcde : 0x3c5a8a, 0.75);
      }
      if (f.big || h3 < 0.5) B(3.0, -4.6, Math.PI / 2, 2.6, 0.8, 1.6, STEEL, 0x55585c, 0.3);
      windbreak('fir', 3.2, 2.4);
      break;
    }
    case 'coast': {
      // low stucco ranch house under red tile, packing shed, water tank, eucalyptus windrow
      B(-3.2, -3.6, 0, 2.6, 0.55, 1.3, pick([0xf2eee4, 0xeae2cf, 0xe8d8bc], h), 0xa4553a, 0.3);
      B(-4.2, -2.6, Math.PI / 2, 1.2, 0.55, 1.0, pick([0xf2eee4, 0xeae2cf], h), 0xa4553a, 0.3);
      B(2.6, 1.6, 0, 3.2, 0.9, 2.2, pick([0xd8d4cc, 0xb8a888], h2), 0x9aa0a2, 0.3);   // packing shed
      S(5.6, -3.6, 0.42, 0.75, pick([0x5e6a52, 0x8a6a4a], h3), 0x5a5e58);              // water tank
      for (let t = -9.5; t <= 9.5; t += 1.6) T(t, 9.5, 3.4, 'eucalyptus');             // windrow
      T(-1.4, -6.8, 2.0, 'liveoak');
      break;
    }
  }

  // Hog confinement barns (Corn Belt annex): two long low barns, curtain sides, feed bins
  if (f.annex?.kind === 'hog') {
    const a = f.annex;
    BX(0, (7.5 + a.z1) / 2, 0, 0.9, 0.04, a.z1 - 7.5, 0x8e8068, -0.02);   // drive from the yard
    for (const lx of [-3.5, 3.5]) {
      longBarn(lx, a.z0 + 1.0, a.z1, 2.4, 0.42, 0xe4e2dc, 0x9aa0a2, 0.26);
      const [bx, bz] = W(lx + 1.5, a.z0 + 0.7);
      props.bin(bx, ground(bx, bz) + 0.3, bz, 0.26, 0.85);
      BX(lx + 1.5, a.z0 + 0.7, 0, 0.06, 0.32, 0.06, 0x8e9296);
    }
  }
}
