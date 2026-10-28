/**
 * Weathering and aging (decided with the user: "all of these"). Pure: how a
 * structure's materials look after `age` years, what a repair resets, how
 * far fields and gardens go back to weeds, how old fence posts lean.
 *
 * The renderer turns these into one vec4 per mesh (`aWear`, see
 * weathering.ts) read by shared kit materials, so aging never clones a
 * material:
 *
 *   rust   galvanized roofing holds ~8 years before the zinc goes and red
 *          rust streaks run down from the laps; painted container steel
 *          streaks from ~2 years at the corners and door gear.
 *   gray   unpainted wood (lap siding, board-and-batten, logs, decks,
 *          posts) goes silver-gray in 1–3 sunny years.
 *   peel   house paint chalks and fades after ~5 years and peels by ~15.
 *   moss   north-facing roofs and stone in wet country (PNW ≫ Appalachia ≫
 *          the dry Mountain West), slowly, from ~4 years.
 *   patch  share of fresh boards / paint after a repair (fades as they gray).
 */

/** Rendering classes of exterior materials (which aging channels they show). */
export type WearClass = 'metal' | 'container' | 'wood' | 'paint' | 'roof' | 'stone';

export interface Wear {
  /** 0–1 each. */
  rust: number;
  gray: number;
  peel: number;
  moss: number;
  /** Share of fresh boards / patches (0 none … ≈ 0.4 just repaired). */
  patch: number;
  /** Ground-splash grime at the foot of the walls. */
  grime: number;
}

export const NO_WEAR: Readonly<Wear> = { rust: 0, gray: 0, peel: 0, moss: 0, patch: 0, grime: 0 };

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** Hermite smoothstep from e0 to e1. */
export function sstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Region wetness 0–1 from rain + snowmelt (mm a year): 400 (Mountain West) ≈ 0.1, 1200+ ≈ 1. */
export function wetnessOf(rainMm: number): number {
  return clamp01((rainMm - 300) / 900);
}

/** Condition of an old system → extra effective years of weather on it. */
export const CONDITION_YEARS: Record<'good' | 'fair' | 'poor', number> = { good: 0, fair: 6, poor: 16 };

/**
 * How a material looks after `years` in the weather. `wet` 0–1 (region).
 * `sinceRepair` years since a repair (patch boards / new paint), or null.
 */
export function wearFor(years: number, wet: number, sinceRepair: number | null = null): Wear {
  const y = Math.max(0, years);
  // sun-bleached gray: fast in dry, sunny country, slower under cloud
  const gray = 1 - Math.exp(-Math.max(0, y - 0.3) / (1.2 + wet * 1.5));
  const rust = sstep(7, 28, y) * (0.75 + 0.25 * wet);
  const peel = sstep(4, 16, y);
  const moss = sstep(4, 22, y) * wet;
  const grime = sstep(0.5, 12, y) * 0.8;
  const patch = sinceRepair === null ? 0 : 0.4 * Math.exp(-Math.max(0, sinceRepair) / 1.5);
  return { rust, gray, peel, moss, patch, grime };
}

/** Container steel (painted, rusts sooner at every dent and seam). */
export function containerWear(years: number, wet: number): Wear {
  const w = wearFor(years, wet);
  return { ...w, rust: sstep(1, 14, years) * (0.8 + 0.2 * wet), peel: sstep(3, 14, years) };
}

/**
 * Years of weather on a structure: since it was finished, plus (for what
 * came with the land) the years before the family bought it and what a worn
 * system adds. `nowYear` is the calendar year now.
 */
export function structureAge(o: { finishedAt: number | null; t: number; pre?: boolean; builtYear?: number | null; nowYear: number; startYear: number; condition?: 'good' | 'fair' | 'poor' }): number {
  if (o.finishedAt === null) return 0;
  const own = Math.max(0, o.t - o.finishedAt) / 365;
  const before = o.pre && o.builtYear ? Math.max(0, Math.min(80, o.startYear - o.builtYear)) : 0;
  return own + before + (o.condition ? CONDITION_YEARS[o.condition] : 0);
}

/**
 * Overgrowth of untended ground (fields, gardens, the yard of an empty
 * place): weeds come in a summer (≈ 3 weeks to show, full by 3 months);
 * saplings — aspen suckers, pine, chokecherry — after a couple of years.
 */
export function overgrowth(daysUntended: number): { weeds: number; saplings: number } {
  const d = Math.max(0, daysUntended);
  return { weeds: sstep(20, 100, d), saplings: sstep(500, 6 * 365, d) };
}

/** Fence posts lean and rails sag with years (frost heave, rot at the ground line). 0–1. */
export function fenceLean(years: number): number {
  return sstep(6, 30, years);
}

function hash2(x: number, z: number, seed: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Lean of an old fence at (x, z): a horizontal offset per unit of height
 * (a few degrees at most), varying post to post (wavelength ≈ two posts),
 * and the sag of a rail (drop per unit of height). `k` = fenceLean().
 */
export function leanAt(x: number, z: number, seed: number, k: number): { dx: number; dz: number; sag: number } {
  if (k <= 0) return { dx: 0, dz: 0, sag: 0 };
  const f = 1.6;           // ≈ one wave per 4 m (posts are ≈ 2.4–3 m apart)
  const nx = vnoise(x * f, z * f, seed) - 0.5, nz = vnoise(x * f + 17.3, z * f - 9.1, seed + 3) - 0.5;
  // most posts stand; some lean hard (the ones the frost got at)
  const hard = Math.pow(vnoise(x * f * 0.7 + 4.2, z * f * 0.7, seed + 7), 2.2);
  const m = k * (0.05 + 0.18 * hard);   // ≤ ~0.23 units per unit height (≈ 13°)
  return { dx: nx * 2 * m, dz: nz * 2 * m, sag: k * 0.04 * (0.3 + vnoise(x * 3.1, z * 3.1, seed + 11)) };
}

/** Pack a wear into the four floats of `aWear` (rust, gray, moss + patch, 1 − peel): an un-aged mesh is (0, 0, 0, 1). */
export function packWear(w: Wear, cls: WearClass | null): [number, number, number, number] {
  if (!cls) return [0, 0, 0, 1];
  const rust = cls === 'metal' || cls === 'container' ? w.rust : 0;
  const gray = cls === 'wood' ? w.gray : cls === 'roof' ? w.gray * 0.5 : 0;
  const peel = cls === 'paint' || cls === 'container' ? w.peel : 0;
  const moss = cls === 'roof' || cls === 'stone' || cls === 'metal' || cls === 'wood' ? w.moss * (cls === 'metal' ? 0.4 : 1) : 0;
  // moss in the fraction, patch share in tenths in the integer part; grime rides on rust's sign-free headroom (x ≥ 2 never happens)
  const z = Math.min(0.999, moss) + Math.round(Math.min(0.9, w.patch) * 10);
  return [Math.min(1, rust) + Math.round(Math.min(1, w.grime) * 10) * 2, gray, z, 1 - Math.min(1, peel)];
}

/** Unpack (tests / the shader's reading of it). */
export function unpackWear(v: readonly [number, number, number, number]): { rust: number; grime: number; gray: number; moss: number; patch: number; peel: number } {
  const gi = Math.floor(v[0] / 2 + 1e-6);
  const rust = v[0] - gi * 2;
  return { rust, grime: gi / 10, gray: v[1], moss: v[2] - Math.floor(v[2]), patch: Math.floor(v[2]) / 10, peel: 1 - v[3] };
}
