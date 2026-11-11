/**
 * The camera for the break itself (sim/breach.ts): from the run-in (or the planted charge) to the crew pouring through. First from inside the
 * yard, low, looking out at the wall as the truck comes at it (or from the side at the charge), then, at the break, from outside looking in
 * through the new gap. The eye is nudged to the first of a few places clear of every obstacle. Pure.
 */
import type { InvasionMeta } from '../../sim/battleTypes';
import { bestEye, type Box, type Shot, type V3 } from './director';

export function breachShot(meta: InvasionMeta | undefined, t: number, ground: (x: number, z: number) => number, boxes: readonly Box[]): Shot | null {
  const b = meta?.breach;
  if (!b || t < b.from || t > b.to) return null;
  const sx = -b.oz, sz = b.ox;   // along the wall
  const at = (a: number, o: number, up: number): V3 => { const x = b.x + b.ox * o + sx * a, z = b.z + b.oz * o + sz * a; return { x, y: ground(x, z) + up, z }; };
  const after = t >= b.at + 0.9;
  const FOV = 42;
  const clear = (list: V3[], lookAt: V3) => bestEye(list, lookAt, FOV, boxes, ground, 0.25);
  let eye: V3, look: V3, since: number, hold: number;
  if (!after) {
    since = b.from; hold = b.at + 0.9 - b.from;
    if (meta!.method === 'ram') {
      look = at(0, 1.6, 0.17);
      eye = clear([at(0.7, -1.7, 0.3), at(-0.9, -1.4, 0.3), at(1.1, -2.4, 0.4), at(0, -3, 0.9), at(0, -4.2, 1.3)], look);
    } else {
      look = at(0, 0, 0.14);
      eye = clear([at(1.1, 1.0, 0.26), at(-1.1, 1.1, 0.26), at(1.4, 1.8, 0.4), at(0, 3, 0.8), at(0, 4.2, 1.3)], look);
    }
  } else {
    since = b.at + 0.9; hold = b.to - since;
    look = at(0, -1.2, 0.2);
    eye = clear([at(1.2, 2.8, 0.5), at(-1.2, 2.8, 0.5), at(0, 3.6, 0.7), at(0, 4.6, 1.1), at(0, 5.6, 1.6)], look);
  }
  return { kind: 'wide', eye, look, fov: FOV, since, hold, drift: { x: sx * 0.012, y: 0, z: sz * 0.012 } };
}
