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
/** A door being worked (the crew's stack, the kick): the door's place, its normal and the time it goes. */
export type DoorBeat = { t: number; x: number; z: number; nx: number; nz: number };

export function interiorShot(meta: InvasionMeta | undefined, t: number, ground: (x: number, z: number) => number, boxes: readonly Box[], focus?: V3, doors: readonly DoorBeat[] = []): Shot | null {
  const win = meta?.interior, h = meta?.house;
  if (!win || !h || t < win.from || t > win.to) return null;
  // the stack, the kick and the first step in: a close shot of the door from above the wall on the crew's side
  const beat = doors.find(d => t >= d.t - 3.4 && t <= d.t + 2.2);
  if (beat) {
    const cx0 = (h.x0 + h.x1) / 2, cz0 = (h.z0 + h.z1) / 2;
    let ox = beat.x - cx0, oz = beat.z - cz0; const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;   // outward, from the house middle to the door
    const px = -oz, pz = ox, since = beat.t - 3.4;
    const tries0: V3[] = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      const out = 0.95 + attempt * 0.35, side = (attempt % 2 ? -1 : 1) * 0.55;
      const x = beat.x + ox * out + px * side, z = beat.z + oz * out + pz * side;
      tries0.push({ x, y: ground(x, z) + 0.85 + attempt * 0.2, z });
    }
    const eye0 = tries0.find(p => !boxes.some(b => nearBox(p, b, ground, 0.3))) ?? tries0[tries0.length - 1];
    return { kind: 'house', eye: eye0, look: { x: beat.x - ox * 0.25, y: ground(beat.x, beat.z) + 0.16, z: beat.z - oz * 0.25 }, fov: 32, since, hold: 5.6, drift: { x: 0.01 * px, y: 0, z: 0.01 * pz } };
  }
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
    const dist = reach + 0.55 + attempt * 0.35, up = 1.0 + attempt * 0.3;
    const x = cx + Math.sin(a) * dist, z = cz + Math.cos(a) * dist;
    tries.push({ x, y: ground(x, z) + up, z });
  }
  const eye = tries.find(p => !boxes.some(b => nearBox(p, b, ground, 0.3))) ?? tries[tries.length - 1];
  return { kind: 'house', eye, look, fov: 36, since, hold: HOLD, drift: { x: 0.02 * Math.cos(base), y: 0, z: -0.02 * Math.sin(base) } };
}

export type { House };
