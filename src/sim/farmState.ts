/**
 * The farm's saved state in one place (save v44): the kitchen's
 * preserving, the seed store's settings, the pond, maple sugaring and the
 * day's farm labor. The barnyard itself is `s.livestock` (livestock.ts).
 * No logic here, so state.ts can make one without an import cycle.
 */
import type { Preserve } from './preserving';
import type { Seeds } from './seeds';
import type { Pond } from './pond';
import type { Maple } from './maple';
import type { WorkDay } from './farmWork';

export interface Farm {
  preserve: Preserve;
  seeds: Seeds;
  /** Made when the pond is first stocked. */
  pond: Pond | null;
  maple: Maple;
  work: WorkDay;
}

export const newFarm = (): Farm => ({
  preserve: { full: 0, tattlerFull: 0, off: [], day: -1, today: {}, year: 0, yearKcal: {}, kwh: 0 },
  seeds: { keep: 0.1, first: 'saved', savedVigor: 1, year: 0, sown: 0, fallow: 0, kept: 0 },
  pond: null,
  maple: { taps: 0, sap: 0, sapAge: 0, year: 0, gathered: 0, syrup: 0 },
  work: { day: -1, budget: 0, used: {} },
});
