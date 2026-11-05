/**
 * Where a guard's car stands along the drive (docs/DECISIONS.md, "Guard cars follow the drive"). Pure geometry (tested).
 *
 * The slots used to lie on a straight line from the gate (the guard frame's -x axis). A drive bends, and a hillside drive bends within a few units of the
 * gate, so past that point the line left the lane and the cars stood in open meadow ten units from any road. A slot is now taken on the drive's own offset
 * line: `d` units inside the entry along the drive, `side` (+1 left of the heading toward the camp) and `off` clear of the lane's edge, the nose toward the road
 * (against the drive's heading there), so a car beside a bend stands along it.
 */
import { headingAt, offsetAt, pointAtArc } from './gateKitLayout';
import type { Pt } from '../../sim/perimeter';

export interface CarSlot {
  /** Center of the car. */
  c: Pt;
  /** Unit vector of the car's nose (toward the road). */
  nose: Pt;
  /** Unit vector to the car's left of the drive's heading (the side `side` > 0 is on). */
  left: Pt;
  /** Arc along the drive of the slot. */
  arc: number;
}

/** The slot `d` inside the entry crossing at `arc0`, on `side`, `off` clear of a lane `halfLane` either side of the center line. */
export function carSlot(drive: readonly Pt[], arc0: number, d: number, side: 1 | -1, off: number, halfLane: number): CarSlot {
  const arc = arc0 + d, t = headingAt(drive, arc);
  return { c: offsetAt(drive, arc, side * (halfLane + off)), nose: [-t[0], -t[1]], left: [t[1], -t[0]], arc };
}

/** The drive's own point at a slot's arc (for the distance from the lane). */
export const slotRoadPoint = (drive: readonly Pt[], s: CarSlot): Pt => pointAtArc(drive, s.arc);
