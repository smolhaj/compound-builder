/**
 * The live path of the movement rule: a staged battle -> the nav world the cutscene really has -> a battle whose every leg goes through openings.
 * `solid` is the game world's own walk-mode test (`HomesteadWorld.walkBlocked`); the timed layers come from the battle's own events: a
 * `house_door` shut after `close` until the next `open` / successful `kick`, `shoot` or `charge`, and a `gap` carving the wall from its moment.
 */
import type { Battle, BattleEvent } from './battleTypes';
import { routeBattle, type Barrier, type Carve, type NavWorld, type Pt } from './cutNav';

const DOOR_HALF = 0.12, DOOR_DEPTH = 0.08;

/** `pad`: shrink every opening by this much (the router keeps a hand's width from the edges of a breach; the checker tests the true size). */
export function navFor(b: Battle, solid: (x: number, z: number) => boolean, pad = 0): NavWorld {
  const barriers: Barrier[] = [], carves: Carve[] = [];
  const doors = b.events.filter((e): e is Extract<BattleEvent, { kind: 'house_door' }> => e.kind === 'house_door').sort((p, q) => p.t - q.t);
  let closedFrom: number | null = null;
  const rect = (d: Extract<BattleEvent, { kind: 'house_door' }>) => Math.abs(d.nx) > Math.abs(d.nz)
    ? { x0: d.x - DOOR_DEPTH, x1: d.x + DOOR_DEPTH, z0: d.z - DOOR_HALF, z1: d.z + DOOR_HALF }
    : { x0: d.x - DOOR_HALF, x1: d.x + DOOR_HALF, z0: d.z - DOOR_DEPTH, z1: d.z + DOOR_DEPTH };
  let last: Extract<BattleEvent, { kind: 'house_door' }> | null = null;
  for (const d of doors) {
    last = d;
    if (d.action === 'close') closedFrom = d.t;
    else if ((d.action === 'open' || d.ok) && closedFrom !== null) { barriers.push({ id: `door${barriers.length}`, ...rect(d), from: closedFrom, openAt: d.t + 0.35 }); closedFrom = null; }
  }
  if (closedFrom !== null && last) barriers.push({ id: `door${barriers.length}`, ...rect(last), from: closedFrom, openAt: Infinity });
  // the opening is only as wide as the gap the picture draws (w along the wall), and a little deeper than the wall is thick; the wall's direction is across the breach's "out" vector
  const out = b.invasion?.breach;
  // a wall the crew climbed (no truck, no blast, no drawn gap): the spot they go over is an opening from the moment the sim's breach lands
  const climb = b.raid?.breach;
  if (climb && climb.method === 'climb' && !b.events.some(e => e.kind === 'gap')) {
    const spot = climb.where as ({ x?: number; z?: number; w: number } | null), br = b.events.find(e => e.kind === 'breach') as { t: number; x: number; z: number } | undefined;
    const cx = spot?.x ?? br?.x, cz = spot?.z ?? br?.z;
    if (cx !== undefined && cz !== undefined) { const h = 0.6 - pad; carves.push({ x0: cx - h - 0.3, x1: cx + h + 0.3, z0: cz - h - 0.3, z1: cz + h + 0.3, from: (br?.t ?? climb.t) - 1.5 }); }
  }
  for (const e of b.events) if (e.kind === 'gap') {
    const along = Math.max(0.06, e.w / 2 - 0.04 - pad), across = 0.32, acrossX = out ? Math.abs(out.ox) > Math.abs(out.oz) : null;
    if (acrossX === null) carves.push({ x0: e.x - along, x1: e.x + along, z0: e.z - along, z1: e.z + along, from: e.t });
    else if (acrossX) carves.push({ x0: e.x - across, x1: e.x + across, z0: e.z - along, z1: e.z + along, from: e.t });
    else carves.push({ x0: e.x - along, x1: e.x + along, z0: e.z - across, z1: e.z + across, from: e.t });
  }
  return { solid, barriers, carves };
}

/** Route a whole staged scene. Anything that goes wrong leaves the scene as it was (a cutscene must never take the game down). */
export function routeScene(b: Battle, solid: (x: number, z: number) => boolean, center?: Pt): { battle: Battle; unrouted: number; lost: Array<{ unit: string; t: number; from: Pt; to: Pt }>; nudged: string[]; ok: boolean } {
  try {
    const r = routeBattle(b, navFor(b, solid, 0.06), center);
    return { ...r, ok: true };
  } catch {
    return { battle: b, unrouted: 0, lost: [], nudged: [], ok: false };
  }
}
