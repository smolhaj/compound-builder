/**
 * The rooms of a house, read off the walk-mode colliders it is really built with (no plan data needed): a grid over the footprint, the doorways
 * found as short narrow gaps in a wall, the rooms as the open floor between them, and from those the places a fight needs: where to stack at a
 * door, where to pie the corners inside it, where a defender holds from behind furniture, and where someone hides. Pure.
 */
import { CELL, type Grid } from './houseAssault';

export interface Pt { x: number; z: number }
export interface Room { id: number; cells: number[]; c: Pt; area: number }
/** A doorway: where it is, the rooms either side (-1 = outside), and its axis (`pass` is the unit vector people walk through it along). */
export interface Doorway { id: number; at: Pt; a: number; b: number; pass: Pt; width: number }
export interface HouseRooms { grid: Grid; rooms: Room[]; doors: Doorway[]; roomAt: (x: number, z: number) => number; at: (idx: number) => Pt; free: (x: number, z: number) => boolean }

const N4: ReadonlyArray<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const cx = (g: Grid, i: number) => g.x0 + (i + 0.5) * CELL, cz = (g: Grid, j: number) => g.z0 + (j + 0.5) * CELL;
const WIDE = 5, DOOR_MAX = 5;   // a doorway is at most 5 cells (30 cm... of wall, with 4 cells = 24 units) long and the opening at most 0.3 wide

/** Free-run width along an axis through a cell (cells), capped. */
function runWidth(g: Grid, i: number, j: number, dx: number, dz: number, cap = 8): { w: number; lo: number; hi: number } {
  let lo = 0, hi = 0;
  const ok = (k: number) => { const ni = i + dx * k, nj = j + dz * k; return ni >= 0 && nj >= 0 && ni < g.nx && nj < g.nz && g.free[nj * g.nx + ni] === 1; };
  while (lo < cap && ok(-(lo + 1))) lo++;
  while (hi < cap && ok(hi + 1)) hi++;
  return { w: lo + hi + 1, lo, hi };
}

export function analyzeHouse(g: Grid): HouseRooms | null {
  const { nx, nz } = g;
  const idx = (i: number, j: number) => j * nx + i;
  const interior = (k: number) => g.inside[k] === 1 && g.reach[k] === 1;
  // 1. doorway cells: inside free cells in a short narrow gap (width <= DOOR_MAX cells on one axis, for at most DOOR_MAX cells along the other)
  const door = new Uint8Array(nx * nz), axisOf = new Uint8Array(nx * nz);   // axis 1: narrow in x (passage along z); 2: narrow in z (passage along x)
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = idx(i, j);
    if (!interior(k)) continue;
    const wx = runWidth(g, i, j, 1, 0), wz = runWidth(g, i, j, 0, 1);
    for (const [ax, w, ddx, ddz] of [[1, wx, 0, 1], [2, wz, 1, 0]] as const) {
      if (w.w > DOOR_MAX || w.lo >= WIDE || w.hi >= WIDE) continue;
      // along the passage direction the narrowness must stop within DOOR_MAX cells both ways (else it is a corridor, not a door)
      let len = 1;
      for (const s of [1, -1]) for (let m = 1; m <= DOOR_MAX + 1; m++) {
        const ni = i + ddx * s * m, nj = j + ddz * s * m;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz || !g.free[idx(ni, nj)]) break;
        const w2 = ax === 1 ? runWidth(g, ni, nj, 1, 0) : runWidth(g, ni, nj, 0, 1);
        if (w2.w > DOOR_MAX) break;
        len++;
      }
      if (len <= DOOR_MAX) { door[k] = 1; axisOf[k] = ax; }
    }
  }
  // 2. rooms: components of interior floor that is not a doorway
  const room = new Int32Array(nx * nz).fill(-1);
  const rooms: Room[] = [];
  for (let k0 = 0; k0 < nx * nz; k0++) {
    if (!interior(k0) || door[k0] || room[k0] >= 0) continue;
    const id = rooms.length, q = [k0]; room[k0] = id;
    for (let h = 0; h < q.length; h++) {
      const c = q[h], ci = c % nx, cj = (c - ci) / nx;
      for (const [dx, dz] of N4) {
        const ni = ci + dx, nj = cj + dz;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
        const n = idx(ni, nj);
        if (interior(n) && !door[n] && room[n] < 0) { room[n] = id; q.push(n); }
      }
    }
    rooms.push({ id, cells: q, c: { x: 0, z: 0 }, area: q.length });
  }
  // (specks: furniture shadows and closets too small to be a room are folded away)
  const keep = rooms.filter(r => r.cells.length >= 14);
  if (keep.length < 1) return null;
  const remap = new Map<number, number>();
  keep.forEach((r, i) => remap.set(r.id, i));
  const rm = new Int32Array(nx * nz).fill(-1);
  keep.forEach((r, i) => { r.id = i; for (const c of r.cells) rm[c] = i; r.c = { x: r.cells.reduce((s, c) => s + cx(g, c % nx), 0) / r.cells.length, z: r.cells.reduce((s, c) => s + cz(g, Math.floor(c / nx)), 0) / r.cells.length }; });
  // 3. doorways: groups of door cells, with the rooms they join (outside = -1)
  const seen = new Uint8Array(nx * nz), doors: Doorway[] = [];
  for (let k0 = 0; k0 < nx * nz; k0++) {
    if (!door[k0] || seen[k0]) continue;
    const q = [k0]; seen[k0] = 1;
    for (let h = 0; h < q.length; h++) {
      const c = q[h], ci = c % nx, cj = (c - ci) / nx;
      for (const [dx, dz] of N4) { const ni = ci + dx, nj = cj + dz; if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue; const n = idx(ni, nj); if (door[n] && !seen[n]) { seen[n] = 1; q.push(n); } }
    }
    const touching = new Set<number>();
    for (const c of q) {
      const ci = c % nx, cj = (c - ci) / nx;
      for (const [dx, dz] of N4) for (let m = 1; m <= 2; m++) { const ni = ci + dx * m, nj = cj + dz * m; if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue; const r = rm[idx(ni, nj)]; if (r >= 0) touching.add(r); }
    }
    const ax = axisOf[k0], pass = ax === 1 ? { x: 0, z: 1 } : { x: 1, z: 0 };
    const at = { x: q.reduce((s, c) => s + cx(g, c % nx), 0) / q.length, z: q.reduce((s, c) => s + cz(g, Math.floor(c / nx)), 0) / q.length };
    const rs = [...touching];
    if (rs.length >= 2) doors.push({ id: doors.length, at, a: rs[0], b: rs[1], pass, width: Math.sqrt(q.length) * CELL });
  }
  const roomAt = (x: number, z: number) => { const i = Math.floor((x - g.x0) / CELL), j = Math.floor((z - g.z0) / CELL); return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : rm[idx(i, j)]; };
  const free = (x: number, z: number) => { const i = Math.floor((x - g.x0) / CELL), j = Math.floor((z - g.z0) / CELL); return i >= 0 && j >= 0 && i < nx && j < nz && g.free[idx(i, j)] === 1; };
  return { grid: g, rooms: keep, doors, roomAt, at: c => ({ x: cx(g, c % nx), z: cz(g, Math.floor(c / nx)) }), free };
}

/** The door of a room toward `toward` (a room id, or -1 for outside), or null. */
export const doorBetween = (h: HouseRooms, a: number, b: number): Doorway | null => h.doors.find(d => (d.a === a && d.b === b) || (d.a === b && d.b === a)) ?? null;

/** Rooms in the order a crew clears them from `entry`: nearest by doorways first, then by floor area (the bigger room first). */
export function clearOrder(h: HouseRooms, entry: number): number[] {
  const dist = new Map<number, number>([[entry, 0]]), q = [entry];
  for (let i = 0; i < q.length; i++) for (const d of h.doors) {
    const other = d.a === q[i] ? d.b : d.b === q[i] ? d.a : -1;
    if (other >= 0 && !dist.has(other)) { dist.set(other, dist.get(q[i])! + 1); q.push(other); }
  }
  return [...dist.keys()].sort((a, b) => dist.get(a)! - dist.get(b)! || h.rooms[b].area - h.rooms[a].area);
}

/** A spot to stand beside a doorway on the side of `room`, pressed to the wall off the line of the door. `side` -1 / +1. */
export function stackSpot(h: HouseRooms, d: Doorway, room: number, side: -1 | 1): Pt {
  const perp = { x: -d.pass.z, z: d.pass.x };
  const rc = h.rooms[room].c;
  const back = Math.sign((rc.x - d.at.x) * d.pass.x + (rc.z - d.at.z) * d.pass.z) || 1;   // which way along `pass` the room lies
  for (const reach of [0.2, 0.16, 0.12, 0.3]) for (const depth of [0.14, 0.2, 0.1, 0.26]) {
    const p = { x: d.at.x + back * d.pass.x * depth + perp.x * side * reach, z: d.at.z + back * d.pass.z * depth + perp.z * side * reach };
    if (h.free(p.x, p.z) && h.roomAt(p.x, p.z) === room) return p;
  }
  return nearestInRoom(h, room, d.at);
}

/** The free spot in a room nearest to a point. */
export function nearestInRoom(h: HouseRooms, room: number, p: Pt): Pt {
  let best = h.rooms[room].c, bd = Infinity;
  for (const c of h.rooms[room].cells) { const q = h.at(c), d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = q; } }
  return best;
}

/** The two corners just inside a doorway that a crew "pies" (sights across) before it commits: one each side of the line of the door. */
export function pieSpots(h: HouseRooms, d: Doorway, into: number): [Pt, Pt] {
  const perp = { x: -d.pass.z, z: d.pass.x }, rc = h.rooms[into].c;
  const fwd = Math.sign((rc.x - d.at.x) * d.pass.x + (rc.z - d.at.z) * d.pass.z) || 1;
  const pick = (side: number): Pt => {
    for (const reach of [0.3, 0.22, 0.16]) for (const depth of [0.2, 0.28, 0.14]) {
      const p = { x: d.at.x + fwd * d.pass.x * depth + perp.x * side * reach, z: d.at.z + fwd * d.pass.z * depth + perp.z * side * reach };
      if (h.free(p.x, p.z) && h.roomAt(p.x, p.z) === into) return p;
    }
    return nearestInRoom(h, into, d.at);
  };
  return [pick(-1), pick(1)];
}

/** Is the straight line between two points free of anything solid? */
export function sees(h: HouseRooms, a: Pt, b: Pt): boolean {
  const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.03));
  for (let i = 1; i < n; i++) if (!h.free(a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n)) return false;
  return true;
}

/**
 * Where defenders hold a room whose door the crew will come through: behind furniture or in a corner, with the doorway's kill zone in sight but
 * not standing in the line of the door. Best first, spread apart.
 */
export function holdSpots(h: HouseRooms, room: number, d: Doorway, n: number): Pt[] {
  const kill = { x: d.at.x + d.pass.x * (Math.sign((h.rooms[room].c.x - d.at.x) * d.pass.x + (h.rooms[room].c.z - d.at.z) * d.pass.z) || 1) * 0.12, z: d.at.z + d.pass.z * (Math.sign((h.rooms[room].c.x - d.at.x) * d.pass.x + (h.rooms[room].c.z - d.at.z) * d.pass.z) || 1) * 0.12 };
  const scored: Array<{ p: Pt; s: number }> = [];
  for (const c of h.rooms[room].cells) {
    const p = h.at(c), dd = Math.hypot(p.x - d.at.x, p.z - d.at.z);
    if (dd < 0.35 || dd > 1.4 || !sees(h, p, kill)) continue;
    // in the doorway's line: no
    const perp = { x: -d.pass.z, z: d.pass.x }, off = Math.abs((p.x - d.at.x) * perp.x + (p.z - d.at.z) * perp.z);
    if (off < 0.1) continue;
    // cover: something solid within a hand of the cell on the door side (a table, a couch back, a wall corner)
    const toD = { x: (d.at.x - p.x) / dd, z: (d.at.z - p.z) / dd };
    let cover = 0;
    for (const r of [0.06, 0.1, 0.14]) if (!h.free(p.x + toD.x * r, p.z + toD.z * r)) { cover = 1.5 - r * 4; break; }
    let walls = 0; for (const [dx, dz] of N4) if (!h.free(p.x + dx * 0.09, p.z + dz * 0.09)) walls++;
    scored.push({ p, s: cover * 2 + Math.min(walls, 2) * 0.5 - Math.abs(dd - 0.8) * 0.6 });
  }
  scored.sort((a, b) => b.s - a.s);
  const out: Pt[] = [];
  for (const { p } of scored) { if (out.every(q => Math.hypot(q.x - p.x, q.z - p.z) >= 0.22)) out.push(p); if (out.length >= n) break; }
  // not enough cover spots: any free spread cell
  for (const c of h.rooms[room].cells) { if (out.length >= n) break; const p = h.at(c); if (out.every(q => Math.hypot(q.x - p.x, q.z - p.z) >= 0.25)) out.push(p); }
  return out;
}

/** Places to hide in a room: corners and wall-hugging cells away from the doorways (a closet, a corner, behind a bed), best first. */
export function hideSpots(h: HouseRooms, room: number, n: number): Pt[] {
  const scored: Array<{ p: Pt; s: number }> = [];
  for (const c of h.rooms[room].cells) {
    const p = h.at(c);
    let walls = 0; for (const [dx, dz] of N4) if (!h.free(p.x + dx * 0.08, p.z + dz * 0.08)) walls++;
    if (walls < 2) continue;
    const dDoor = Math.min(...h.doors.map(d => Math.hypot(p.x - d.at.x, p.z - d.at.z)), 9);
    scored.push({ p, s: walls + dDoor * 0.8 });
  }
  scored.sort((a, b) => b.s - a.s);
  const out: Pt[] = [];
  for (const { p } of scored) { if (out.every(q => Math.hypot(q.x - p.x, q.z - p.z) >= 0.2)) out.push(p); if (out.length >= n) break; }
  return out;
}
