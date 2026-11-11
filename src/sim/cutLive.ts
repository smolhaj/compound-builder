/**
 * The live path of the movement rule: a staged battle -> the nav world the cutscene really has -> a battle whose every leg goes through openings.
 * `solid` is the game world's own walk-mode test (`HomesteadWorld.walkBlocked`); the timed layers come from the battle's own events: a
 * `house_door` shut after `close` until the next `open` / successful `kick`, `shoot` or `charge`, and a `gap` carving the wall from its moment.
 */
import type { Battle, BattleEvent } from './battleTypes';
import { stepHeightAt, type StepSeg } from './standingSurfaces';
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
export function routeScene(b: Battle, solid: (x: number, z: number) => boolean, center?: Pt, steps: readonly StepSeg[] = []): { battle: Battle; unrouted: number; lost: Array<{ unit: string; t: number; from: Pt; to: Pt }>; nudged: string[]; ok: boolean } {
  try {
    const lifted = elevateOnProps(b, steps, solid);
    const iw = lifted.invasion?.interior;
    const settle = iw ? { ids: new Set(lifted.units.filter(u => u.side === 'home' && !u.civilian && !u.machine && !u.bystander).map(u => u.id)), from: iw.from - 8, to: iw.to } : undefined;
    const r = routeBattle(lifted, navFor(lifted, solid, 0.06), center, settle);
    return { ...r, ok: true };
  } catch {
    return { battle: b, unrouted: 0, lost: [], nudged: [], ok: false };
  }
}

/**
 * Nobody is above the ground unless something real is under them. The battle sim lifts a defender to a post on a fighting step (a platform that is
 * drawn, sim/standingSurfaces.ts) and a raider at the wall to the wall's height ("up a ladder"); neither has anything to climb. Here each such climb
 * gets a ladder prop (a `ladder` event, drawn as one instanced mesh) and the unit walks to its foot first (`via`); the router (sim/cutNav.ts) remembers the foot and
 * sends a unit that is up there back down it before anything else it is told to do, so nobody ever rises or drops through the air. Raiders' ladders lean on
 * the outside of the wall, defenders' on the inside of the step. Surfaces that are real buildings (a tower's cab, a wall-top deck, an upper floor)
 * are left as they are. Pure.
 */
/** How long (battle seconds) a raider is on the ladder before he is back at its foot: the climb, a look over the top, the way down. */
export const CLIMB_HOLD = 0.5;

export function elevateOnProps(b: Battle, steps: readonly StepSeg[], solid: (x: number, z: number) => boolean = () => false): Battle {
  const homes = b.units.filter(u => u.side === 'home' && !u.bystander && !u.machine);
  if (!homes.length) return b;
  const C = { x: homes.reduce((s, u) => s + u.x, 0) / homes.length, z: homes.reduce((s, u) => s + u.z, 0) / homes.length };
  const side = new Map(b.units.map(u => [u.id, u.side]));
  const out: BattleEvent[] = [];
  const unit = (n: number, v: { x: number; z: number }) => { const l = Math.hypot(v.x, v.z) || 1; return { x: v.x / l * n, z: v.z / l * n }; };
  let changed = false;
  const made: Array<{ x: number; z: number; t: number }> = [];
  for (const e of [...b.events].sort((a, c) => a.t - c.t)) {
    if (e.kind === 'move' && (e.y ?? 0) > 0.05 && !e.via && !e.near) {
      const raider = side.get(e.unit) === 'raider';
      const stepY = raider ? null : stepHeightAt(steps, e.x, e.z);
      if (raider || (stepY !== null && Math.abs(stepY - (e.y ?? 0)) < 0.06)) {
        // a raider's ladder leans on the OUTSIDE of the wall; a defender's on the inside of the step
        const dir = raider ? unit(1, { x: e.x - C.x, z: e.z - C.z }) : unit(1, { x: C.x - e.x, z: C.z - e.z });
        // (several climbers at one place get a ladder each, side by side)
        const used = made.filter(m => Math.hypot(m.x - e.x, m.z - e.z) < 0.35 && Math.abs(m.t - e.t) < 8).length;
        const lat = used === 0 ? 0 : 0.14 * Math.ceil(used / 2) * (used % 2 ? 1 : -1);
        const tan = { x: -dir.z, z: dir.x };
        const base = { x: e.x + tan.x * lat, z: e.z + tan.z * lat };
        made.push({ x: e.x, z: e.z, t: e.t });
        // (the ladder leans on the wall's face: from the sim's point, out until the ground is open with a hand to spare, and its foot another 30 cm on)
        const free = (d: number) => !solid(base.x + dir.x * d, base.z + dir.z * d) && !solid(base.x + dir.x * (d + 0.06), base.z + dir.z * (d + 0.06));
        let d0 = raider ? 0.12 : 0.04;
        while (d0 < 1 && !free(d0)) d0 += 0.03;
        let d1 = d0 + 0.3;
        while (d1 < d0 + 0.9 && !free(d1)) d1 += 0.03;
        const topAt = { x: base.x + dir.x * d0, z: base.z + dir.z * d0 };
        const foot = { x: base.x + dir.x * d1, z: base.z + dir.z * d1 };
        const r2 = (n: number) => Math.round(n * 100) / 100;
        out.push({ t: Math.max(0, r2(e.t - 1.5)), kind: 'ladder', x: r2(topAt.x), z: r2(topAt.z), h: r2(e.y!), fx: r2(foot.x), fz: r2(foot.z) });
        out.push({ ...e, x: r2(raider || lat ? topAt.x : e.x), z: r2(raider || lat ? topAt.z : e.z), via: { x: r2(foot.x), z: r2(foot.z) } });
        // a raider is on the rungs only while he climbs: there is no drawn wall-walk on the crown, so he never stands or fights up there, he comes
        // straight back down (unless he is told to do something sooner, which the router also sends down the ladder first)
        if (raider) {
          const nextOwn = b.events.filter(x => x.t > e.t && 'unit' in x && x.unit === e.unit && (x.kind === 'move' || x.kind === 'cover' || x.kind === 'death' || x.kind === 'lay' || x.kind === 'taken')).sort((a, c) => a.t - c.t)[0];
          let from = b.units.find(x => x.id === e.unit) ?? { x: e.x, z: e.z };
          for (const x of b.events) if (x.t < e.t && (x.kind === 'move' || x.kind === 'cover') && x.unit === e.unit) from = x;
          const arrive = e.t + (Math.hypot(from.x - foot.x, from.z - foot.z) * 1.3) / 1.1 + 0.5;   // (he walks to the foot, then climbs)
          const back = arrive + CLIMB_HOLD;
          if (!nextOwn || nextOwn.t > back + 0.4) out.push({ t: r2(back), kind: 'move', unit: e.unit, x: r2(foot.x), z: r2(foot.z) });
        }
        changed = true;
        continue;
      }
    }
    out.push(e);
  }
  return changed ? { ...b, events: out.sort((a, c) => a.t - c.t) } : b;
}
