/**
 * Where a shooter takes cover (pure, tested; presentation only). Real gunfights are not fought standing in the open: people get behind the nearest
 * thing that stops a round from where the threat is, drop to a knee behind something low, lean out round the corner of something tall, and go prone
 * in the open when rounds crack past. The battle sim decides who hits whom; this decides how the figure carries itself while it does.
 *
 *   candidates   the solid boxes (walls, buildings, crates: `Box`) and round clumps (a bush, a rock, a tree trunk, the well: `Round`)
 *   choice       the nearest one within reach whose body lies between the shooter and the threat (it blocks the line to the threat)
 *   stance       behind something low (under a kneeling man's chest) he kneels and rises to fire over it; behind something tall he stands
 *                back and leans out round the end of it; with nothing in reach he stays in the open and goes prone under fire
 * World units: 1 = 6 m, a person is 0.28 tall (a kneeling chest is about 0.1).
 */
import type { Box } from './cameraObstacles';

export interface Round { x: number; z: number; r: number; h: number }
export type Stance = 'stand' | 'kneel' | 'lean' | 'prone';
export interface CoverPick {
  /** Where to stand: behind the cover, on the far side from the threat. */
  x: number; z: number;
  stance: Stance;
  /** Which way to lean out (-1 left, +1 right as seen from the shooter facing the threat), for `lean`. */
  side: -1 | 0 | 1;
  /** Distance walked to get there. */
  walk: number;
}

/** Low cover: a kneeling man's head is behind it. Anything taller is cover to stand behind and lean out of. */
export const LOW = 0.2;
/** How far a shooter will go for cover. */
export const REACH = 1.6;
/** How far behind the cover's face he stands. */
export const BEHIND = 0.16;

const hypot = Math.hypot;

/** Is the body of the cover between the shooter and the threat (the line from one to the other crosses it)? */
function blocksLine(c: { x0: number; x1: number; z0: number; z1: number }, a: { x: number; z: number }, t: { x: number; z: number }): boolean {
  let t0 = 0, t1 = 1;
  for (const [p, d, lo, hi] of [[a.x, t.x - a.x, c.x0, c.x1], [a.z, t.z - a.z, c.z0, c.z1]] as const) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; continue; }
    let u0 = (lo - p) / d, u1 = (hi - p) / d;
    if (u0 > u1) [u0, u1] = [u1, u0];
    t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * The nearest cover that blocks the threat direction, or the open (`prone` if `underFire`, else standing). `boxes` and `rounds` are the
 * candidates; the shooter is at `at`, the threat at `threat`.
 */
export function chooseCover(at: { x: number; z: number }, threat: { x: number; z: number }, boxes: readonly Box[], rounds: readonly Round[], underFire = false): CoverPick {
  const dx = threat.x - at.x, dz = threat.z - at.z, dl = hypot(dx, dz) || 1, ux = dx / dl, uz = dz / dl;
  type Cand = { cx: number; cz: number; h: number; d: number; box?: Box; round?: Round };
  const cands: Cand[] = [];
  for (const b of boxes) {
    if (b.kind !== 'wall' && b.kind !== 'building' && b.kind !== 'tree') continue;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, d = hypot(Math.max(b.x0 - at.x, 0, at.x - b.x1), Math.max(b.z0 - at.z, 0, at.z - b.z1));
    if (d > REACH || !blocksLine(b, at, threat)) continue;
    cands.push({ cx, cz, h: b.h, d, box: b });
  }
  for (const c of rounds) {
    const d = Math.max(0, hypot(c.x - at.x, c.z - at.z) - c.r);
    if (d > REACH) continue;
    if (!blocksLine({ x0: c.x - c.r, x1: c.x + c.r, z0: c.z - c.r, z1: c.z + c.r }, at, threat)) continue;
    cands.push({ cx: c.x, cz: c.z, h: c.h, d, round: c });
  }
  if (!cands.length) return { x: at.x, z: at.z, stance: underFire ? 'prone' : 'stand', side: 0, walk: 0 };
  const best = cands.sort((a, b) => a.d - b.d)[0];
  // stand on the far side of it from the threat, on the line through its middle
  const half = best.box ? Math.min((best.box.x1 - best.box.x0), (best.box.z1 - best.box.z0)) / 2 : best.round!.r;
  const px = best.cx - ux * (half + BEHIND), pz = best.cz - uz * (half + BEHIND);
  // lean out round the nearer end of a tall cover (the side the shooter is already on)
  const cross = (best.cx - at.x) * uz - (best.cz - at.z) * ux;
  const side: -1 | 0 | 1 = best.h <= LOW + 0.1 ? 0 : cross >= 0 ? -1 : 1;
  return { x: px, z: pz, stance: best.h <= 0.34 ? 'kneel' : 'lean', side, walk: hypot(px - at.x, pz - at.z) };
}

/** A squad moves in bounds: while one runs the others are down and firing. Of `n` shooters, the ones that move this bound (alternating halves by bound). */
export function bounders(n: number, bound: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) if ((i + bound) % 2 === 0) out.push(i);
  return out;
}

/** Does the round that just cracked past (or hit) make this shooter go to ground? In the open, always; behind cover, only a hit. */
export const dropsProne = (inCover: boolean, hit: boolean, closeMiss: boolean): boolean => (inCover ? hit : hit || closeMiss);
