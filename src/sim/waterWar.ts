/**
 * Water war math (docs/scenarios/water_war.md). Pure. How much of a well's yield is left d days after the hit (effects.wellYield reads
 * it), and how deep the municipal and ditch cut is (0 to 1). The dead-pool compact breaks the river and the town; the aquifer collapse
 * draws every well down; a poisoned supply leaves the quantity and takes the safety.
 */
export function waterWarYield(variant: string, kind: string, d: number): number {
  if (d < 0 || variant === 'contamination') return 1;
  if (variant === 'aquifer_collapse') return kind === 'well_hand' ? Math.max(0, 1 - d / 60) : Math.max(0.25, 1 - d / 120);
  return kind === 'well_hand' ? Math.max(0.2, 1 - d / 150) : Math.max(0.5, 1 - d / 240);
}
/** The cut (0 to 1) of the municipal supply and the creek diversion: ramps over 30 days to its top, which eases only if the fate is a full recovery. */
export function waterCut(variant: string, d: number): number {
  if (d < 0) return 0;
  const top = variant === 'aquifer_collapse' ? 0.5 : variant === 'contamination' ? 0.3 : 0.6;
  return top * Math.min(1, d / 30);
}
