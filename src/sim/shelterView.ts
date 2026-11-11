/**
 * Radiation view (GDS §6 "radiation overlay"; docs/GDS_AUDIT.md Q6): the protection factor of each room and building and what a family
 * sheltering in it would take in the first two weeks, from the same `shelterOf` / `doseBetween` the fallout uses. Shown in the Blueprint
 * view in a nuclear run once the warning is out (so it never gives the disaster away). Pure (tested).
 */
import { isFinished } from './construction';
import { SHELTER_DAYS, doseBetween, shelterOf } from './nuclear';
import type { GameState } from './state';

/** Sickness starts near 1 Sv (sim/needs.ts); under a quarter of that is a clinical non-event. */
export const DOSE_WARN = 0.25, DOSE_SICK = 1;

export type RadTone = 'good' | 'warn' | 'bad';

export interface ShelterRow { id: string; kind: string; pf: number; what: string; doseSv: number; tone: RadTone }

/** The map is shown for a nuclear run once the warning is out (the same moment the Outside tab names the fallout). */
export function radiationKnown(s: GameState): boolean {
  return s.disaster.kind === 'nuclear' && (s.disaster.phase === 'warning' || s.clock.t >= s.disaster.warnAt);
}

export const doseTone = (sv: number): RadTone => (sv >= DOSE_SICK ? 'bad' : sv >= DOSE_WARN ? 'warn' : 'good');

/** Dose (Sv) for the shelter window in a place with this protection factor, standing in it the whole time. */
export function shelterDose(variant: string, pf: number): number { return doseBetween(variant, 0, SHELTER_DAYS * 24) / Math.max(1, pf); }

/** Every finished building and bunker room that is any shelter at all, best first. */
export function shelterRows(s: GameState): ShelterRow[] {
  const v = s.disaster.variant, rows: ShelterRow[] = [];
  for (const st of s.structures) {
    if (st.unplaced || !isFinished(st)) continue;
    const r = shelterOf(st);
    if (!r) continue;
    const doseSv = shelterDose(v, r[0]);
    rows.push({ id: st.id, kind: st.kind, pf: r[0], what: r[1], doseSv, tone: doseTone(doseSv) });
  }
  return rows.sort((a, b) => b.pf - a.pf);
}

export const doseText = (sv: number): string => (sv < 0.01 ? 'under 0.01 Sv' : `${sv < 1 ? sv.toFixed(2) : sv.toFixed(1)} Sv`);

/** The label under a building: "PF 40 · 0.10 Sv in 14 days". */
export function radiationSub(r: Pick<ShelterRow, 'pf' | 'doseSv'>): string { return `PF ${Math.round(r.pf).toLocaleString('en-US')} · ${doseText(r.doseSv)} in ${SHELTER_DAYS} days`; }

/** The one-line summary for the readout: the best shelter and the open camp for comparison. */
export function radiationSummary(s: GameState): string {
  const rows = shelterRows(s), open = shelterDose(s.disaster.variant, 1.5);
  if (!rows.length) return `No shelter yet: ${doseText(open)} in ${SHELTER_DAYS} days in the open camp (sick from 1 Sv).`;
  const b = rows[0];
  return `Best shelter ${b.what} (PF ${Math.round(b.pf)}): ${doseText(b.doseSv)} in ${SHELTER_DAYS} days; the open camp ${doseText(open)}. Sick from 1 Sv.`;
}
