/**
 * Who sleeps in which real bed (the night side of the family rituals). Pure; the same bed slots the sickbay uses (the mattress
 * tops the buildings mark), so a sleeper lies on a mattress, head on the pillow, under the roof the cutaway removes. A person
 * whose sleeping place (sim/housing.ts) is a bed in a home takes one of that home's bed slots, the first free; anyone left
 * without a slot stays out of sight indoors as before. The sick (sickbayPlan) are placed first and keep their bed.
 */
import { FIG_POSE } from '../../engine/world/people/figureKit';
import type { GameState } from '../../sim/state';
import { figureScale, type BedSlot, type SickPose } from './sickbayPlan';

const LIE_LIFT = 0.026;

export function sleepPlan(game: GameState, slots: readonly BedSlot[], spotOf: (i: number) => { kind: string; where: string | null } | null, taken: ReadonlySet<string> = new Set()): Map<string, SickPose> {
  const out = new Map<string, SickPose>();
  if (!slots.length) return out;
  const used = new Set(taken);
  game.people.forEach((p, i) => {
    const ps = game.personState[i];
    if (!ps || ps.task !== 'sleep' || ps.needs.died != null || ps.needs.taken || ps.needs.left) return;
    const sp = spotOf(i);
    if (!sp || sp.kind !== 'bed' || !sp.where) return;
    const slot = slots.find(s => !s.bay && !used.has(s.key) && s.key.startsWith(`${sp.where}:`));
    if (!slot) return;
    used.add(slot.key);
    const scale = figureScale(p), len = 0.28 * scale;
    const along = 0.015 - len / 2;
    out.set(p.id, { x: slot.x - slot.fx * along, y: slot.y + LIE_LIFT * scale, z: slot.z - slot.fz * along, rot: Math.atan2(slot.fx, slot.fz), pose: FIG_POSE.SLEEP, pitch: -Math.PI / 2, scale, role: 'patient', bed: slot.key });
  });
  return out;
}
