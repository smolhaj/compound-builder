/**
 * Test fixtures for the cutscene movement rule (never imported by game code): a hollow house with a front door, a partition with a doorway and a
 * back partition with another, a table; the yard wall of a game with its gates cut out; the whole as one solid test.
 */
import { boxWorld, type Rect } from './cutNav';
import { fireBoxesOf } from './lineOfFire';
import { newGame, type GameState } from './state';
import { planRun } from './perimeter';
import { stageRaid } from './raidCutscene';
import type { Encounter } from './encounters';
import type { Battle } from './battleTypes';
import { decorateBreach } from './breach';
import { planHouseAssault } from './houseAssault';
import { LineDirector } from './raidDialogue';
import { routeScene } from './cutLive';
import { stepSegments } from './standingSurfaces';
import { KIT, footprint } from '../game/buildkit/kit';

const T = 0.1;
export interface HouseBox { x0: number; z0: number; x1: number; z1: number }

/** Walls of a hollow house in `b` (door on the +x side at the middle). */
export function hollowHouse(b: HouseBox): Rect[] {
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, w = b.x1 - b.x0, d = b.z1 - b.z0;
  return [
    { x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z0 + T }, { x0: b.x0, z0: b.z1 - T, x1: b.x1, z1: b.z1 }, { x0: b.x0, z0: b.z0, x1: b.x0 + T, z1: b.z1 },
    { x0: b.x1 - T, z0: b.z0, x1: b.x1, z1: cz - 0.1 }, { x0: b.x1 - T, z0: cz + 0.1, x1: b.x1, z1: b.z1 },
    { x0: cx - T / 2, z0: b.z0, x1: cx + T / 2, z1: cz + 0.3 }, { x0: cx - T / 2, z0: cz + 0.5, x1: cx + T / 2, z1: b.z1 },
    { x0: b.x0, z0: cz - T / 2, x1: b.x0 + w * 0.17, z1: cz + T / 2 }, { x0: b.x0 + w * 0.27, z0: cz - T / 2, x1: cx, z1: cz + T / 2 },
    { x0: cx + w * 0.1, z0: cz - d * 0.35, x1: cx + w * 0.1 + 0.4, z1: cz - d * 0.35 + 0.3 },
  ];
}

/** The solid test of a game's yard: the wall runs with their gates cut out, plus a hollow house on every box given. `body` is the body radius (0.04 for routing, less for checking). */
export function yardSolid(g: Pick<GameState, 'structures' | 'perimeter'>, houses: readonly HouseBox[], body = 0.04): (x: number, z: number) => boolean {
  const gates: Array<{ x: number; z: number; r: number }> = [];
  for (const run of g.perimeter) for (const gt of run.gates) {
    let acc = 0;
    for (let i = 1; i < run.pts.length; i++) {
      const [ax, az] = run.pts[i - 1], [bx, bz] = run.pts[i], len = Math.hypot(bx - ax, bz - az);
      if (gt.at >= acc && gt.at <= acc + len) { const f = (gt.at - acc) / (len || 1); gates.push({ x: ax + (bx - ax) * f, z: az + (bz - az) * f, r: gt.w / 2 + 0.5 }); break; }
      acc += len;
    }
  }
  const infl = (r: Rect): Rect => ({ x0: r.x0 - body, z0: r.z0 - body, x1: r.x1 + body, z1: r.z1 + body });
  const wallBoxes = fireBoxesOf(g).filter(b => b.kind === 'wall' && !gates.some(gt => Math.hypot((b.x0 + b.x1) / 2 - gt.x, (b.z0 + b.z1) / 2 - gt.z) < gt.r)).map(infl);
  return boxWorld([...wallBoxes, ...houses.flatMap(h => hollowHouse(h).map(infl))]).solid;
}

export type FixtureCase = [string, number, Encounter['kind'], number, Encounter['temper']];
export const HOUSE: HouseBox = (() => { const f = footprint(KIT.farmhouse, 0, 0, 0, false); return { x0: f.x0, z0: f.z0, x1: f.x1, z1: f.z1 }; })();

export function game(seed: number, hour: number, wall: string = 'container_wall'): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  const day = Math.floor(g.disaster.hitAt + 20), SUB = 0.25 / 24;
  g.clock.t = Math.round((day + hour / 24) / SUB) * SUB; g.clock.ticks = Math.round(g.clock.t / SUB);
  g.stock.canned = 40; g.stock.fuel = 20; g.stock.meds = 3; g.stock.lumber = 20; g.stock.hardware = 20;
  g.structures.push({ id: 'house', kind: 'farmhouse', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
  const r = planRun(g, wall as never, [[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]], [{ at: 15, w: 2 }]);
  r.done = r.hours; r.supplied = true; r.finishedAt = 0;
  for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) {
    g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id });
    g.armory.skill[p.id] = 6;
  }
  g.armory.ammo['556'] = 2000;
  return g;
}
export const enc = (kind: Encounter['kind'], size: number, temper: Encounter['temper'], day: number): Encounter => ({ id: 'e1', kind, day, title: 'A crew', dossier: [], size, armed: true, strength: 120, wants: { canned: 8, fuel: 4 }, stances: ['hide', 'parley', 'defend'], temper });

/** What the cutscene does with a staged battle (GameCanvas `prepare`), on the fixture yard. */
export function prepared(b: Battle, g: GameState, seed: number): Battle {
  const solid = yardSolid(g, [HOUSE]);
  let out = b;
  if (b.events.some(e => e.kind === 'breach')) {
    const dir = new LineDirector(seed);
    out = decorateBreach(b, g.perimeter, { x: 0, z: 0 }, seed, b.events.some(e => e.kind === 'rocket' || e.kind === 'throw'), dir);
    out = planHouseAssault(out, { box: HOUSE, blocked: solid, seed, dir, nameOf: id => id });
  }
  const r = routeScene(out, solid, undefined, stepSegments(g.perimeter));
  if (!r.ok || r.unrouted) throw new Error(`routing failed: ok ${r.ok}, unrouted ${r.unrouted} ${JSON.stringify(r.lost.slice(0, 3))}`);
  return r.battle;
}

export function scenes(seed: number, hour: number, kind: Encounter['kind'], size: number, temper: Encounter['temper'], wall = 'container_wall'): { g: GameState; battles: Battle[] } {
  const g = game(seed, hour, wall);
  g.gate.pending = enc(kind, size, temper, Math.floor(g.clock.t));
  const st = stageRaid(g, 'defend');
  return { g, battles: st.battles };
}


// ── the small invasion used by the interior-fight tests: a 3 x 2 house, three adults, three kids, five raiders, a breach and a wounded man each side ──
import type { BattleEvent, BattleUnit } from './battleTypes';
export const SMALL_HOUSE: HouseBox = { x0: -1.5, z0: -1, x1: 1.5, z1: 1 };
export const unit = (id: string, side: 'home' | 'raider', x: number, z: number, extra: Partial<BattleUnit> = {}): BattleUnit => ({ id, side, x, z, post: 'open', ...extra });
export function invasionBattle(style: 'crew' | 'crowd' | 'families' = 'crowd', night = true): Battle {
  const look = (i: number) => ({ style, role: 'soldier' as const, torch: false, tone: i });
  return {
    night, duration: 74,
    units: [unit('h_a', 'home', 0.7, 0.2), unit('h_b', 'home', 0.9, -0.3), unit('h_c', 'home', 3, 1), unit('h_k', 'home', 1.2, 0.4, { civilian: true }), unit('h_k2', 'home', 1.1, 0.5, { civilian: true }), unit('h_k3', 'home', 1.2, 0.6, { civilian: true }), ...[0, 1, 2, 3, 4].map(i => unit(`r${i}`, 'raider', 12 + i * 0.5, i * 0.7 - 1, { look: look(i) }))],
    events: [
      { t: 1, kind: 'alarm', what: 'dog' },
      { t: 30, kind: 'move', unit: 'r0', x: 10.5, z: 0.4 },
      { t: 50, kind: 'breach', x: 10.1, z: 0.3 },
      { t: 58, kind: 'wound', unit: 'r2', sev: 0.5, part: 'arm' },
      { t: 60, kind: 'wound', unit: 'h_b', sev: 0.5, part: 'arm' },
      { t: 72, kind: 'end', result: 'breached' },
    ] as BattleEvent[],
  };
}
export function gameWithWall() {
  const g = newGame(3, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  const r = planRun(g, 'container_wall', [[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]]);
  r.done = r.hours; r.supplied = true; r.finishedAt = 0;
  return g;
}

