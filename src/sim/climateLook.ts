/**
 * What the two slow climate disasters look like (docs/design/climate_disasters.md section 6): pure curves from the anomaly (year 0 to 4 for heat,
 * 0 to 3 for the ice age) to the numbers the renderer reads. Nothing here is saved and nothing adds a draw call; each value is one write into a
 * uniform that already exists (the sky, the season ground, the shared dome-glass materials).
 *
 * Every function is monotone in its anomaly input, clamped to its range and finite for any input (NaN and Infinity read as zero), so a bad save
 * or a paused clock can never pop the sky.
 */
const fin = (x: number, d = 0): number => (Number.isFinite(x) ? x : d);
const clamp01 = (x: number): number => Math.max(0, Math.min(1, fin(x)));
const smooth = (x: number): number => { const t = clamp01(x); return t * t * (3 - 2 * t); };

/** How big the sun looks at full heat (a pale, swollen disc), and how small and low it is at full cold. */
export const HEAT_SUN_SCALE = 2.1;
export const COLD_SUN_SCALE = 0.8;
/** How far the cold pulls the sun down from its normal arc at full strength (0 = normal, 0.4 = 40 percent lower). */
export const COLD_SUN_LOWER = 0.4;

/** The sun's apparent size as a multiplier: 1 in peace, up to 2.1 in the heat, down to 0.8 in the cold. */
export function sunScaleOf(scorch: number, freeze: number): number {
  return 1 + (HEAT_SUN_SCALE - 1) * clamp01(scorch) - (1 - COLD_SUN_SCALE) * clamp01(freeze);
}

/** How far the sun's arc is pulled down in the cold (0-1 of COLD_SUN_LOWER). */
export const sunLowerOf = (freeze: number): number => COLD_SUN_LOWER * smooth(freeze);

/**
 * How much of the lawn and the crowns the heat has scorched (0-1): the season ground reads this as dry and dormant grass and the trees as a
 * thinner, browner canopy. Slightly eased so the first year is a hint and the third is plain.
 */
export const scorchOf = (heatK: number): number => smooth(heatK);

/**
 * Shell frost (0-1) from the outside air, the inside air and whether the plant is running. The inner skin of the glass sits between the two
 * temperatures (it is the weak link in the wall: about 55 percent of the way to the inside); it frosts below freezing and is fully milky about
 * 30 F under it. A heated dome (inside 60 F or more) keeps its skin above freezing until it is far below zero outside, so it stays clear.
 */
export function shellFrostOf(outF: number, indoorF: number): number {
  const out = fin(outF, 55), inn = fin(indoorF, out);
  const skin = out + 0.55 * (inn - out);
  return smooth((34 - skin) / 30);
}

/** Heat bleaching of the shell glass (0-1): the glass goes pale and a little milky in a scorching sun. Rides the heat anomaly and the day's heat. */
export function shellBleachOf(scorch: number, outF: number): number {
  const day = smooth((fin(outF, 70) - 85) / 35);
  return clamp01(0.8 * clamp01(scorch) * (0.35 + 0.65 * day));
}

/** Midday heat shimmer strength (0-1): zero before noon-ish and after dusk, peaking mid-afternoon, scaled by the scorch. */
export function shimmerOf(scorch: number, hour: number): number {
  const h = fin(hour, 0);
  const sun = Math.max(0, Math.sin(Math.PI * (h - 9) / 10));   // 9 am to 7 pm, the peak at 2 pm
  return clamp01(scorch) * sun * sun;
}

/** Deep snow's darkening of lit windows is a fraction of its whitening of roofs: the share of the snow cover that dims a window (0-0.2). */
export const windowSnowDim = (snowCover: number): number => 0.2 * clamp01(snowCover);

/** The roof and ground snow cover (0-1) for a ground load in pounds per square foot (a pack of 60 psf covers everything). */
export const snowCoverOf = (psf: number): number => clamp01(fin(psf) / 60);

/** The ice's hold on water (0-1): creeks and ponds freeze solid and go still only once the cold is well along (year 1 to 2 of 3). */
export const waterLockOf = (freeze: number): number => smooth((clamp01(freeze) - 0.25) / 0.5);
