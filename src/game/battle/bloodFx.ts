/**
 * Blood in the cutscene's fights (pure helpers; the renderer draws them as flat decals in ONE instanced mesh, so the draw-call budget does not
 * grow). The game is for one player, so graphic is the default; Restrained (a View menu choice, remembered) takes it all out and keeps the
 * fall, the grief and the camera exactly as they are. No dismemberment, nothing lingers: the pool stops spreading in seconds.
 * World units: 1 = 6 m, a person is 0.28 tall.
 */
import { mulberry32 } from '../../sim/rng';

export type Violence = 'graphic' | 'restrained';
const KEY = 'cb.violence';
export function getViolence(): Violence { try { return localStorage.getItem(KEY) === 'restrained' ? 'restrained' : 'graphic'; } catch { return 'graphic'; } }
export function setViolence(v: Violence): void { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } }

export interface Blob { x: number; z: number; r: number; /** Stretch along the heading (an elliptical smear). */ stretch: number; rot: number }

/** The pool under a body at `age` seconds after it fell: spreads fast, then slows and stops (never past `max`). */
export const poolRadius = (age: number, max: number): number => max * (1 - Math.exp(-Math.max(0, age) / 2.4));

/** Droplets thrown behind a hit (`dir` the way the round was going), on the ground: 3 to 5, near and small. */
export function spatter(seed: number, x: number, z: number, dir: { x: number; z: number }, big = false): Blob[] {
  const r = mulberry32(seed * 977 + 13), n = (big ? 4 : 2) + Math.floor(r() * 2), l = Math.hypot(dir.x, dir.z) || 1;
  const out: Blob[] = [];
  for (let i = 0; i < n; i++) {
    const d = 0.05 + r() * (big ? 0.26 : 0.16), side = (r() - 0.5) * 0.14;
    out.push({ x: x + dir.x / l * d - dir.z / l * side, z: z + dir.z / l * d + dir.x / l * side, r: (big ? 0.012 : 0.008) + r() * (big ? 0.022 : 0.012), stretch: 1 + r() * 1.4, rot: Math.atan2(dir.x, dir.z) });
  }
  return out;
}

/** A shirt stained by a wound: how far toward blood red (0-1), by how bad the wound is; graphic only. */
export const stain = (wound: number, graphic: boolean): number => (graphic ? Math.min(0.85, 0.35 + 0.55 * wound) : Math.min(0.75, 0.25 + 0.5 * wound));

/** Where on a standing figure a wound patch sits, as a fraction of the figure's height above the feet, and which side it is on (-1, 0, 1). */
export function woundSpot(part: 'head' | 'torso' | 'arm' | 'leg' | undefined, kneeling: boolean): { h: number; side: number } {
  const k = kneeling ? 0.62 : 1;
  switch (part) {
    case 'head': return { h: 0.9 * k, side: 0 };
    case 'arm': return { h: 0.58 * k, side: 1 };
    case 'leg': return { h: 0.25 * k, side: -1 };
    default: return { h: 0.58 * k, side: 0 };
  }
}
