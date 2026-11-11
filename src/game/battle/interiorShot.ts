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
/** A raider's place: inside the house or not. */
export type CrewPos = { x: number; z: number; inside: boolean };
export type DoorBeat = { t: number; x: number; z: number; nx: number; nz: number };

export function interiorShot(meta: InvasionMeta | undefined, t: number, ground: (x: number, z: number) => number, boxes: readonly Box[], focus?: V3, doors: readonly DoorBeat[] = [], crew: readonly CrewPos[] = []): Shot | null {
  const win = meta?.interior, h = meta?.house;
  if (!win || !h || t < win.from || t > win.to) return null;
  // the stack, the kick and the sweep: a door-level shot that follows the crew (the raiders beside the door, then the one who is inside)
  const cx0 = (h.x0 + h.x1) / 2, cz0 = (h.z0 + h.z1) / 2;
  const lastKick = doors.length ? Math.max(...doors.map(d => d.t)) : -1;
  const beat = doors.find(d => t >= d.t - 9 && t <= d.t + 2.4 && (t >= d.t - 1.5 || crew.some(c => !c.inside && Math.hypot(c.x - d.x, c.z - d.z) < 3.2)));
  const sweeping = !beat && lastKick >= 0 && t > lastKick + 2.4 && t < lastKick + 16 && crew.some(c => c.inside);
  if (beat || sweeping) {
    const d = beat ?? doors.find(x => x.t === lastKick)!;
    let ox = d.x - cx0, oz = d.z - cz0; const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;   // outward, from the house middle to the door
    const px = -oz, pz = ox;
    const pick = beat ? crew.filter(c => !c.inside && Math.hypot(c.x - d.x, c.z - d.z) < 3.2) : crew.filter(c => c.inside);
    const mid = pick.length ? { x: pick.reduce((a, c) => a + c.x, 0) / pick.length, z: pick.reduce((a, c) => a + c.z, 0) / pick.length } : { x: d.x, z: d.z };
    const aim = beat ? { x: (d.x + mid.x) / 2, z: (d.z + mid.z) / 2 } : mid;
    const since = beat ? d.t - 9 : lastKick + 2.4;
    const tries0: V3[] = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      // the stack and the kick are seen from the porch side at a man's height; the sweep from above the wall by the door, looking in
      const out = (beat ? 1.25 : 1.7) + attempt * 0.35, side = (attempt % 2 ? -1 : 1) * (0.8 + attempt * 0.1);
      const x = aim.x + ox * out + px * side, z = aim.z + oz * out + pz * side;
      tries0.push({ x, y: ground(x, z) + (beat ? 0.5 : 1.15) + attempt * 0.25, z });
    }
    const eye0 = tries0.find(p => !boxes.some(b => nearBox(p, b, ground, 0.3))) ?? tries0[tries0.length - 1];
    return { kind: 'house', eye: eye0, look: { x: aim.x, y: ground(aim.x, aim.z) + 0.14, z: aim.z }, fov: beat ? 44 : 40, since, hold: 1.2, drift: { x: 0, y: 0, z: 0 } };
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
