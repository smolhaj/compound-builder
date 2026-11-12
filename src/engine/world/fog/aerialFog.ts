/**
 * How much of the weather's fog (fog / rain / snow terms of the exp² density) an eye `h` world units above the datum sees: all of it at
 * eye level (below 4 units), fading smoothly to 18% past about 26 units, so a rain or storm aerial still shows the compound.
 */
export function weatherFogAerialScale(h: number): number {
  const t = Math.max(0, Math.min(1, (h - 4) / 22));
  return 1 - 0.82 * t * t * (3 - 2 * t);
}
