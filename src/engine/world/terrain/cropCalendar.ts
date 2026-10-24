/**
 * cropCalendar — what the farmland beyond the town is growing, per region
 * and day of the year (pure, no Three.js; regional terrain shader input).
 *
 * Each region gets its real crop mix (share of the fields) and every crop a
 * color calendar keyed on the day of the year: bare tilled soil at
 * planting, green-up, full canopy, ripening, harvest stubble, winter
 * residue. The terrain shader picks a crop slot per field from the field's
 * hash, so a region's fields change together through the year the way
 * real ones do (lying snow is applied on top by the shader).
 *
 * Real-world references (crop shares are rounded; phenology from USDA NASS
 * Crop Progress "usual planting and harvesting dates" and state extension
 * calendars):
 *   plains   Story County IA / Champaign County IL — corn ~50 %, soybeans
 *            ~40 % in a two-year rotation, a little hay / oats. Black
 *            Mollisol soil at planting (late Apr–May), corn canopy dark
 *            green July–Aug, soybeans yellow mid-Sept, harvest Oct.
 *   mountain Cache Valley UT / Gallatin Valley MT / Boulder County — irrigated
 *            alfalfa cut three times a summer (brief tan swaths), winter
 *            wheat / malting barley golden in July, dry range pasture,
 *            summer fallow strips, some silage corn.
 *   drumlin  Upper Connecticut River valley (Hanover NH, Amherst / Hadley MA)
 *            — hay and pasture dominate, dairy silage corn on the bottomland,
 *            vegetable plots.
 *   bayou    Lafayette County MS / Oconee County GA — bermuda-grass pasture
 *            and hay (dormant tan in winter), cotton (white open bolls
 *            Sept–Oct, brown stalks after the picker), soybeans, corn on red
 *            or brown loess soils.
 *   sound    Willamette Valley OR (Corvallis, Eugene) — the "grass seed
 *            capital of the world": fall-sown perennial ryegrass / fescue
 *            green all winter, gold in late June, swathed and baled in July,
 *            straw stubble till the fall rains; winter wheat, hay, berry
 *            rows.
 *   coast    Oxnard plain / Irvine Ranch / Santa Maria valley — year-round
 *            row crops (strawberries, lettuce, celery), golden dry pasture
 *            from May, fallow beds (orchards are drawn by the shader itself).
 */
import type { RegionKind } from './regionalLandscape';

/** Linear-ish diffuse color as used by the terrain shader (0–1 per channel). */
export type Rgb = [number, number, number];
/** [day of year, color] key; the calendar wraps round the new year. */
export type CropKey = [number, Rgb];

export type CropId =
  | 'corn' | 'soy' | 'hay' | 'pasture' | 'wheat' | 'cotton' | 'grassSeed'
  | 'alfalfa' | 'rangePasture' | 'fallow' | 'rowVeg' | 'warmPasture' | 'silage';

// shared colors
const STUBBLE: Rgb = [0.44, 0.37, 0.25];
const BLACK_SOIL: Rgb = [0.21, 0.17, 0.12];
const RED_CLAY: Rgb = [0.47, 0.27, 0.17];

export const CROPS: Record<CropId, CropKey[]> = {
  // Corn belt: stalk residue → tilled black soil → rows → full canopy → dent / dry → harvest
  corn: [
    [1, STUBBLE], [105, [0.40, 0.33, 0.22]], [122, BLACK_SOIL], [150, [0.23, 0.22, 0.13]],
    [172, [0.17, 0.30, 0.09]], [200, [0.11, 0.24, 0.06]], [238, [0.14, 0.26, 0.07]],
    [258, [0.40, 0.39, 0.18]], [276, [0.56, 0.47, 0.26]], [300, [0.50, 0.42, 0.27]], [340, STUBBLE],
  ],
  // Silage corn (dairy country): chopped green in early September
  silage: [
    [1, [0.40, 0.34, 0.24]], [118, [0.30, 0.24, 0.16]], [150, [0.27, 0.25, 0.15]],
    [178, [0.20, 0.33, 0.11]], [205, [0.15, 0.29, 0.08]], [245, [0.20, 0.31, 0.10]],
    [256, [0.42, 0.36, 0.23]], [300, [0.36, 0.34, 0.21]], [340, [0.40, 0.34, 0.24]],
  ],
  // Soybeans: pale residue → soil → bright green rows → yellow → brown → harvested
  soy: [
    [1, [0.47, 0.41, 0.29]], [128, [0.45, 0.39, 0.28]], [142, [0.25, 0.20, 0.14]],
    [168, [0.27, 0.31, 0.14]], [192, [0.30, 0.46, 0.14]], [236, [0.31, 0.46, 0.14]],
    [256, [0.53, 0.50, 0.18]], [270, [0.46, 0.36, 0.20]], [286, [0.49, 0.42, 0.29]], [365, [0.47, 0.41, 0.29]],
  ],
  // Cool-season hay: dormant → green → first cut (tan swaths) → regrowth → second cut
  hay: [
    [1, [0.40, 0.38, 0.25]], [95, [0.35, 0.38, 0.20]], [125, [0.28, 0.42, 0.15]],
    [158, [0.31, 0.44, 0.16]], [163, [0.46, 0.45, 0.23]], [180, [0.29, 0.42, 0.15]],
    [222, [0.31, 0.41, 0.16]], [227, [0.44, 0.43, 0.23]], [245, [0.30, 0.40, 0.16]],
    [300, [0.34, 0.38, 0.20]], [335, [0.40, 0.38, 0.25]],
  ],
  // Grazed pasture: never cut, a touch darker and patchier
  pasture: [
    [1, [0.38, 0.37, 0.24]], [100, [0.32, 0.37, 0.19]], [130, [0.25, 0.38, 0.14]],
    [215, [0.29, 0.37, 0.16]], [300, [0.32, 0.35, 0.19]], [335, [0.38, 0.37, 0.24]],
  ],
  // Southern bermuda pasture / hay: green Apr–Oct, tan dormant Dec–Mar
  warmPasture: [
    [1, [0.50, 0.43, 0.29]], [75, [0.46, 0.41, 0.26]], [105, [0.30, 0.39, 0.16]],
    [150, [0.26, 0.40, 0.14]], [250, [0.29, 0.39, 0.16]], [310, [0.40, 0.40, 0.22]],
    [335, [0.50, 0.43, 0.29]],
  ],
  // Winter wheat / barley: green over winter → heading → golden → straw stubble → drilled again
  wheat: [
    [1, [0.33, 0.35, 0.19]], [80, [0.27, 0.38, 0.15]], [130, [0.23, 0.42, 0.13]],
    [160, [0.45, 0.47, 0.20]], [182, [0.64, 0.53, 0.25]], [198, [0.66, 0.58, 0.36]],
    [262, [0.55, 0.48, 0.31]], [280, [0.31, 0.26, 0.18]], [305, [0.28, 0.32, 0.16]], [365, [0.33, 0.35, 0.19]],
  ],
  // Cotton on red / brown southern soils: open white bolls Sept–Oct
  cotton: [
    [1, [0.43, 0.31, 0.21]], [112, RED_CLAY], [150, [0.42, 0.30, 0.18]],
    [178, [0.25, 0.36, 0.12]], [228, [0.21, 0.34, 0.11]], [250, [0.40, 0.37, 0.23]],
    [266, [0.70, 0.68, 0.62]], [298, [0.72, 0.70, 0.64]], [316, [0.44, 0.32, 0.22]], [365, [0.43, 0.31, 0.21]],
  ],
  // Willamette grass seed: green winter → gold late June → swathed / baled July → stubble → green again
  grassSeed: [
    [1, [0.24, 0.40, 0.15]], [120, [0.28, 0.44, 0.15]], [160, [0.46, 0.46, 0.20]],
    [180, [0.65, 0.56, 0.30]], [198, [0.62, 0.54, 0.33]], [225, [0.57, 0.51, 0.34]],
    [285, [0.50, 0.46, 0.30]], [305, [0.33, 0.38, 0.18]], [330, [0.24, 0.39, 0.15]], [365, [0.24, 0.40, 0.15]],
  ],
  // Irrigated alfalfa: vivid green, three cuttings (tan windrows for a week or so)
  alfalfa: [
    [1, [0.40, 0.36, 0.24]], [95, [0.30, 0.36, 0.17]], [122, [0.20, 0.40, 0.12]],
    [156, [0.21, 0.42, 0.12]], [161, [0.47, 0.46, 0.24]], [176, [0.23, 0.42, 0.13]],
    [200, [0.21, 0.42, 0.12]], [205, [0.47, 0.46, 0.24]], [220, [0.23, 0.42, 0.13]],
    [246, [0.22, 0.41, 0.12]], [251, [0.45, 0.44, 0.24]], [266, [0.25, 0.40, 0.13]],
    [300, [0.34, 0.36, 0.20]], [335, [0.40, 0.36, 0.24]],
  ],
  // Unirrigated range / foothill pasture: brief spring green, tan from June
  rangePasture: [
    [1, [0.45, 0.40, 0.27]], [85, [0.36, 0.40, 0.20]], [130, [0.34, 0.42, 0.18]],
    [172, [0.54, 0.48, 0.28]], [300, [0.56, 0.48, 0.31]], [335, [0.47, 0.41, 0.27]], [365, [0.45, 0.40, 0.27]],
  ],
  // Summer fallow / disced ground
  fallow: [[1, [0.45, 0.38, 0.27]], [180, [0.47, 0.39, 0.27]], [365, [0.45, 0.38, 0.27]]],
  // Coastal row crops (strawberries, lettuce, celery): green most of the year, beds re-made in the fall
  rowVeg: [
    [1, [0.27, 0.36, 0.15]], [90, [0.24, 0.40, 0.14]], [200, [0.29, 0.39, 0.15]],
    [262, [0.30, 0.37, 0.16]], [290, [0.42, 0.34, 0.24]], [318, [0.40, 0.33, 0.23]], [345, [0.29, 0.35, 0.16]],
  ],
};

/** Crop mix per region: [crop, share]. Shares need not sum to 1 (normalised). */
export const REGION_CROPS: Record<RegionKind, Array<[CropId, number]>> = {
  plains: [['corn', 0.5], ['soy', 0.38], ['hay', 0.07], ['wheat', 0.05]],
  city: [['corn', 0.48], ['soy', 0.36], ['hay', 0.1], ['wheat', 0.06]],
  mountain: [['alfalfa', 0.38], ['wheat', 0.27], ['rangePasture', 0.2], ['fallow', 0.08], ['silage', 0.07]],
  drumlin: [['hay', 0.48], ['pasture', 0.22], ['silage', 0.22], ['rowVeg', 0.08]],
  bayou: [['warmPasture', 0.36], ['cotton', 0.24], ['soy', 0.24], ['corn', 0.1], ['fallow', 0.06]],
  sound: [['grassSeed', 0.46], ['hay', 0.22], ['wheat', 0.16], ['pasture', 0.1], ['rowVeg', 0.06]],
  coast: [['rowVeg', 0.55], ['rangePasture', 0.28], ['fallow', 0.17]],
};

/** Number of crop slots the shader takes. */
export const CROP_SLOTS = 6;

/** Color of one crop on a day of the year (linear interpolation, wrapping round the new year). */
export function cropColor(keys: ReadonlyArray<CropKey>, doy: number): Rgb {
  const d = ((doy - 1) % 365 + 365) % 365 + 1;
  const n = keys.length;
  for (let i = 0; i < n; i++) {
    const [d1, c1] = keys[i];
    if (d < d1) {
      const [d0, c0] = i === 0 ? [keys[n - 1][0] - 365, keys[n - 1][1]] : keys[i - 1];
      const t = (d - d0) / Math.max(1e-6, d1 - d0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  // past the last key: blend toward the first key of next year
  const [d0, c0] = keys[n - 1];
  const [d1r, c1] = keys[0];
  const d1 = d1r + 365;
  const t = (d - d0) / Math.max(1e-6, d1 - d0);
  return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
}

export interface CropSlots {
  /** Colors of the CROP_SLOTS slots (unused slots repeat the last). */
  colors: Rgb[];
  /** Cumulative upper share of each slot (field hash < cum[i] → slot i); last is 1. */
  cum: number[];
  /** Which crop each slot is (QA / tests). */
  crops: CropId[];
}

/** The region's crop slots on a day of the year (terrain shader uniforms). */
export function cropSlotsFor(kind: RegionKind, doy: number): CropSlots {
  const mix = REGION_CROPS[kind] ?? REGION_CROPS.plains;
  const total = mix.reduce((s, [, w]) => s + w, 0) || 1;
  const colors: Rgb[] = [], cum: number[] = [], crops: CropId[] = [];
  let acc = 0;
  for (const [id, w] of mix.slice(0, CROP_SLOTS)) {
    acc += w / total;
    colors.push(cropColor(CROPS[id], doy));
    cum.push(acc);
    crops.push(id);
  }
  cum[cum.length - 1] = 1;
  while (colors.length < CROP_SLOTS) { colors.push(colors[colors.length - 1]); cum.push(1); crops.push(crops[crops.length - 1]); }
  return { colors, cum, crops };
}
