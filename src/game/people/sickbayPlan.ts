/**
 * The sickbay (people depth, part 3b): where the sick lie and where the medic stands, from the sim and the beds the
 * buildings offer. Pure (tested).
 *
 *  Patients  people who are badly hurt or ill (a wound, fever or break at severity 30 or more, or health under 45) and
 *            whose roster has them resting (asleep, in free time, idle): they are put to bed, lying on their back on the
 *            mattress of a bed the buildings mark (shell.ts `SickSlot`): the home's sickbay cot, the bedroom's bed, the
 *            medical corner of the bunker. Worst first. A patient at severity 50 or more goes to the bunker's medical
 *            corner when there is one; the rest to the beds of the home, then the bay when the home has no bed free.
 *  Medic     whoever is on the Medic duty (sim/daily.ts: the roster's afternoon hour, the night's emergency) stands at
 *            the bedside on whichever side is clear, facing the patient, one arm out, for the patient who is worst off.
 *  Drawing   FamilyRenderer draws them in its own figure layer (no extra draw call) at these poses; everyone else
 *            keeps walking and sitting where they would.
 */
import { FIG_POSE } from '../../engine/world/people/figureKit';
import type { Person } from '../../sim/family';
import type { GameState } from '../../sim/state';

/** A bed the sick can lie in, in world units. */
export interface BedSlot {
  key: string;
  /** The bunker's medical corner (heals faster, cuts infection: sim/medical.ts). */
  bay: boolean;
  /** The middle of the mattress top. */
  x: number; y: number; z: number;
  /** Unit vectors in the ground plane: head toward foot, and across the bed (to side A). */
  fx: number; fz: number; sx: number; sz: number;
  /** The floor beside the bed. */
  floorY: number;
  /** Which sides of the bed have room to stand (A is +side, B is -side). */
  openA: boolean; openB: boolean;
}

/** How a person is drawn on or beside a bed. */
export interface SickPose { x: number; y: number; z: number; rot: number; pose: number; pitch?: number; scale: number; role: 'patient' | 'medic'; bed: string }

/** Figure scale by age (the figure is 0.28 tall at 1: a person about 1.7 m). */
export const figureScale = (p: Person): number => (p.kid ? (p.age < 3 ? 0.42 : p.age < 8 ? 0.62 : p.age < 13 ? 0.78 : 0.92) : 1);

/** Tasks of someone at rest (a patient lies down only when the roster has them resting). */
const RESTING = new Set(['sleep', 'leisure', 'idle']);
/** Half the width of a bed, and how far past its edge the medic stands (world units). */
const HALF_BED = 0.1, BESIDE = 0.075;
/** How much of the figure's back thickness to lift it by when it lies down (it is authored upright; its back sits a hand below its origin). */
const LIE_LIFT = 0.026;

export interface Patient { id: string; sev: number; i: number }

/** Who is put to bed, worst first. */
export function bedPatients(game: GameState): Patient[] {
  const out: Patient[] = [];
  game.people.forEach((p, i) => {
    const ps = game.personState[i];
    const n = ps?.needs;
    if (!n || n.died != null || n.taken || n.left || !RESTING.has(ps.task)) return;
    const sev = n.hurt.reduce((a, h) => Math.max(a, h.sev), 0);
    if (sev >= 30 || n.health < 45) out.push({ id: p.id, sev: Math.max(sev, 45 - n.health), i });
  });
  return out.sort((a, b) => b.sev - a.sev);
}

/** The sickbay poses for this moment (empty when nobody is in bed). `slots` are the finished buildings' beds. */
export function sickbayPlan(game: GameState, slots: readonly BedSlot[]): Map<string, SickPose> {
  const out = new Map<string, SickPose>();
  if (!slots.length) return out;
  const patients = bedPatients(game);
  if (!patients.length) return out;
  const taken = new Set<string>();
  const home = slots.filter(s => !s.bay), bay = slots.filter(s => s.bay);
  const pick = (list: readonly BedSlot[]) => list.find(s => !taken.has(s.key));
  const chosen: Array<{ pt: Patient; slot: BedSlot }> = [];
  for (const pt of patients) {
    // the serious ones to the medical corner when the bunker has one; the rest to the home, the corner when the home is full
    const slot = (pt.sev >= 50 ? pick(bay) ?? pick(home) : pick(home) ?? pick(bay));
    if (!slot) continue;
    taken.add(slot.key);
    chosen.push({ pt, slot });
  }
  const ids = new Set(chosen.map(c => c.pt.id));
  const medics = game.people.filter((p, i) => game.personState[i]?.task === 'medic' && !ids.has(p.id) && game.personState[i]?.needs.died == null);
  chosen.forEach(({ pt, slot }, k) => {
    const p = game.people[pt.i], scale = figureScale(p), len = 0.28 * scale;
    // lying on the back, head at the head of the bed: the figure's head goes toward -z after the pitch, so the turn is the foot direction
    const rot = Math.atan2(slot.fx, slot.fz);
    const along = 0.015 - len / 2;           // feet this far from the middle, toward the foot: the body is centered, a touch toward the pillow
    out.set(p.id, { x: slot.x - slot.fx * along, y: slot.y + LIE_LIFT * scale, z: slot.z - slot.fz * along, rot, pose: FIG_POSE.STAND, pitch: -Math.PI / 2, scale, role: 'patient', bed: slot.key });
    const m = medics[k];
    if (!m) return;
    const side = slot.openA ? 1 : slot.openB ? -1 : 0;
    if (!side) return;
    const d = HALF_BED + BESIDE, sx = slot.sx * side, sz = slot.sz * side;
    const x = slot.x + sx * d - slot.fx * 0.03, z = slot.z + sz * d - slot.fz * 0.03;
    out.set(m.id, { x, y: slot.floorY, z, rot: Math.atan2(-sx, -sz), pose: FIG_POSE.REACH, scale: figureScale(m), role: 'medic', bed: slot.key });
  });
  return out;
}
