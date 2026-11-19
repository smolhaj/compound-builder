/**
 * How well a dome keeps the outside weather off its own ground (render only; nothing here is saved or changes a game value).
 *
 * A sealed, climate-held dome shows its ground, trees, roofs, paths and water in the normal season look: no ice-age snow pack, frost, frozen
 * pond, heat scorch or ash. That is `interiorTarget`, 1 = fully protected, 0 = the inside looks like the outside. It is read from the dome's live
 * state (indoor air against outside air, whether the plant has power, how many shell panels are down), so a dome whose plant has been dark for days or
 * whose shell is breached slowly takes the outside conditions on again, and recovers when it is repaired (`easeInterior`, a slow eased value, written
 * a few times a second by the game canvas, never every frame).
 *
 * Every function is monotone where it should be (more panels down or a darker plant never makes the inside MORE protected), clamped to 0..1 and
 * finite for any input (NaN and Infinity read as the neutral value). Pure; tested in interiorClimate.test.ts.
 */
const fin = (x: number, d = 0): number => (Number.isFinite(x) ? x : d);
const clamp01 = (x: number): number => Math.max(0, Math.min(1, fin(x)));
const smooth = (x: number): number => { const t = clamp01(x); return t * t * (3 - 2 * t); };

export interface InteriorInput {
  /** Air inside and outside (F). */
  indoorF: number; outF: number;
  /** Is the climate plant running (power on)? */
  powered: boolean;
  /** Share of the shell's panels still whole, 0.2 to 1 (sim/dome/standing.shellHealth). */
  health: number;
}

/** Outside air this far under freezing (or over the heat line) is "harsh": a breach or a dark plant matters only then. 0 = mild, 1 = harsh. */
export const harshOutside = (outF: number): number => {
  const f = fin(outF, 60);
  return Math.max(1 - smooth((f - 26) / 14), smooth((f - 92) / 16));
};

/** Panels down (0 = whole shell, 0.8 = the floor of `health`) as a 0..1 breach: a few panels down are patched by the plant, a quarter is wide open. */
export const breachOf = (health: number): number => smooth((1 - clamp01(fin(health, 1))) / 0.25);

/**
 * The protection the dome gives its ground right now (0-1). Indoor air under about 34 F (snow would lie) or over about 100 F (scorch) loses it, a breach
 * and a dark plant lose it in proportion to how harsh the outside is.
 */
export function interiorTarget(i: InteriorInput): number {
  const inn = fin(i.indoorF, 60);
  const cold = smooth((inn - 26) / 8), hot = 1 - smooth((inn - 96) / 8);
  const harsh = harshOutside(i.outF);
  const shell = 1 - breachOf(i.health) * harsh;
  const plant = i.powered ? 1 : 1 - 0.5 * harsh;
  return clamp01(cold * hot * shell * plant);
}

/** Days for the inside to lose its protection after the plant or shell fails, and to get it back after a repair. */
export const LOSE_TAU_DAYS = 3, GAIN_TAU_DAYS = 1.5;

/** Ease the drawn protection toward its target over `dtDays` game days (slower to lose than to recover). Snaps when `prev` is not a number. */
export function easeInterior(prev: number, target: number, dtDays: number): number {
  const t = clamp01(target);
  if (!Number.isFinite(prev)) return t;
  const tau = t < prev ? LOSE_TAU_DAYS : GAIN_TAU_DAYS, k = 1 - Math.exp(-Math.max(0, fin(dtDays)) / tau);
  return clamp01(prev + (t - prev) * k);
}

/**
 * The dome's own dormant-grass look (0-1) from the indoor air: a warm band is a green maintained lawn; a dome set to the frost band (34 F and up)
 * reads as a lightly dormant, straw-tinted lawn. Zero from 54 F up.
 */
export const interiorDormant = (indoorF: number): number => 0.5 * (1 - smooth((fin(indoorF, 60) - 36) / 18));
