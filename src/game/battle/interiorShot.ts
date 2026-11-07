/**
 * The camera for the fight inside the house (sim/houseAssault.ts): the roofs are off (the cutaway view), and the camera looks down into the
 * rooms from above and outside the walls, a "doll house" shot that changes angle every few seconds and never sits inside anything: the eye is
 * always above the wall tops and clear of every obstacle box. Pure.
 */
import type { InvasionMeta } from '../../sim/battleTypes';
import { nearBox, type Box, type Shot, type V3 } from './director';

const HOLD = 4.6;
type House = NonNullable<InvasionMeta['house']>;

/** The shot for battle time `t` inside the interior window, or null outside it. `ground` is the terrain height; `boxes` the solids the camera must keep out of. */
export function interiorShot(meta: InvasionMeta | undefined, t: number, ground: (x: number, z: number) => number, boxes: readonly Box[], focus?: V3): Shot | null {
  const win = meta?.interior, h = meta?.house;
  if (!win || !h || t < win.from || t > win.to) return null;
  const k = Math.floor((t - win.from) / HOLD);
  const since = win.from + k * HOLD;
  const cx = (h.x0 + h.x1) / 2, cz = (h.z0 + h.z1) / 2, hw = (h.x1 - h.x0) / 2, hd = (h.z1 - h.z0) / 2;
  let nx = h.door.x - cx, nz = h.door.z - cz;
  const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
  const reach = Math.max(hw, hd);
  const look: V3 = { x: focus ? (cx + focus.x) / 2 : cx, y: ground(cx, cz) + 0.1, z: focus ? (cz + focus.z) / 2 : cz };
  // front (from the door side), a side, the back, a side: the door first, so the crew's entry is seen from outside
  const angles = [0, 0.9, Math.PI * 0.85, -0.9];
  const base = Math.atan2(nx, nz);
  const tries: V3[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const a = base + angles[(k + attempt) % angles.length];
    const dist = reach + 0.95 + attempt * 0.35, up = 1.25 + attempt * 0.35;
    const x = cx + Math.sin(a) * dist, z = cz + Math.cos(a) * dist;
    tries.push({ x, y: ground(x, z) + up, z });
  }
  const eye = tries.find(p => !boxes.some(b => nearBox(p, b, ground, 0.3))) ?? tries[tries.length - 1];
  return { kind: 'house', eye, look, fov: 40, since, hold: HOLD, drift: { x: 0.02 * Math.cos(base), y: 0, z: -0.02 * Math.sin(base) } };
}

export type { House };
