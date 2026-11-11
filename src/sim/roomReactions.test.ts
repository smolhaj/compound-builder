/**
 * The two sides in one room react to each other in real time (user: raiders in a room with a living defender must not call it clear; armed defenders in
 * the room when raiders come in shoot or take cover within a couple of seconds; "covering fire" is said only by someone who is firing).
 * Run on the live planner (planHouseAssault -> routeScene), sampled along the replayed movement.
 */
import { describe, expect, it } from 'vitest';
import type { Battle } from './battleTypes';
import { decorateBreach } from './breach';
import { buildGrid, planHouseAssault } from './houseAssault';
import { analyzeHouse, type HouseRooms } from './houseRooms';
import { LineDirector, resetRaidMemory } from './raidDialogue';
import { walkBattle } from './cutNav';
import { navFor, routeScene } from './cutLive';
import { yardSolid, SMALL_HOUSE, HOUSE, invasionBattle, gameWithWall } from './cutFixtures';

type Run = { out: Battle; H: HouseRooms; at: (id: string, t: number) => { x: number; z: number } | null };

function run(style: 'crew' | 'crowd' | 'families', seed: number, box = SMALL_HOUSE): Run | null {
  resetRaidMemory();
  const g = gameWithWall(), solid = yardSolid(g, [box]);
  const dir = new LineDirector(seed);
  const d = decorateBreach(invasionBattle(style), g.perimeter, { x: 0, z: 0 }, seed, false, dir);
  const ctx = { box, blocked: solid, seed, dir, nameOf: (id: string) => id };
  const p = planHouseAssault(d, ctx);
  const r = routeScene(p, solid);
  const grid = buildGrid(ctx as never), H = grid ? analyzeHouse(grid) : null;
  if (!H) return null;
  const samples = new Map<string, Array<{ t: number; x: number; z: number }>>();
  walkBattle(r.battle, navFor(r.battle, yardSolid(g, [box], 0.012)), { route: false, onStep: (id, t, _a, c) => { (samples.get(id) ?? samples.set(id, []).get(id)!).push({ t, x: c.x, z: c.z }); } });
  const at = (id: string, t: number) => {
    const s = samples.get(id); const u = r.battle.units.find(x => x.id === id);
    let best = u ? { x: u.x, z: u.z } : null;
    if (s) for (const q of s) { if (q.t > t) break; best = { x: q.x, z: q.z }; }
    return best;
  };
  return { out: r.battle, H, at };
}

const STYLES: Array<['crew' | 'crowd' | 'families', number]> = [['crew', 3], ['crew', 5], ['crowd', 3], ['crowd', 7], ['families', 3], ['families', 5]];
const alive = (b: Battle, id: string, t: number) => !b.events.some(e => (e.kind === 'death' || e.kind === 'taken') && e.unit === id && e.t <= t);

describe('a room is called clear only when it is', () => {
  for (const [style, seed] of STYLES) for (const [label, box] of [['small', SMALL_HOUSE], ['farmhouse', HOUSE]] as const) {
    it(`${style} s${seed} ${label}: no "clear" while a living person of the family is inside that room`, () => {
      const r = run(style, seed, box); if (!r) return;
      const { out, H, at } = r;
      const home = out.units.filter(u => u.side === 'home' && !u.machine);
      for (const e of out.events) {
        if (e.kind !== 'say' || e.ctx !== 'room_clear' || !e.who) continue;
        const sp = at(e.who, e.t); if (!sp) continue;
        const room = H.roomAt(sp.x, sp.z); if (room < 0) continue;
        const inside = home.filter(u => alive(out, u.id, e.t) && !out.events.some(x => x.t <= e.t && x.kind === 'lift' && x.unit === u.id) && (() => { const p = at(u.id, e.t); return !!p && H.roomAt(p.x, p.z) === room; })());
        expect(inside.map(u => u.id), `${style} s${seed} ${label}: room ${room} called clear at t=${e.t} with the family in it`).toEqual([]);
      }
    }, 60000);
  }
});

describe('"covering fire" is said by someone who is firing', () => {
  for (const [style, seed] of STYLES) it(`${style} s${seed}`, () => {
    const r = run(style, seed); if (!r) return;
    for (const e of r.out.events) {
      if (e.kind !== 'say' || e.ctx !== 'cover_fire' || !e.who || !e.who.startsWith('h_')) continue;
      const w = e.who;
      expect(r.out.events.some(x => x.kind === 'shot' && x.from === w && Math.abs(x.t - e.t) <= 1.6), `${w} calls covering fire at t=${e.t} and fires no shot within 1.6 s`).toBe(true);
    }
  }, 60000);
});

describe('defenders in a room when the crew comes in react within two seconds', () => {
  for (const [style, seed] of STYLES) it(`${style} s${seed}`, () => {
    const r = run(style, seed); if (!r) return;
    const { out, H, at } = r;
    const adults = out.units.filter(u => u.side === 'home' && !u.machine && !u.civilian && !u.bystander && u.id.startsWith('h_'));
    const crew = out.units.filter(u => u.side === 'raider');
    const t0 = out.events.find(e => e.kind === 'house_door' && e.action === 'kick' && e.ok)?.t ?? 0;
    const firstTogether = new Map<string, number>();
    for (let t = t0; t < t0 + 40; t += 0.25) {
      for (const d of adults) {
        if (firstTogether.has(d.id) || !alive(out, d.id, t)) continue;
        const dp = at(d.id, t), room = dp ? H.roomAt(dp.x, dp.z) : -1; if (room < 0) continue;
        if (crew.some(c => alive(out, c.id, t) && (() => { const p = at(c.id, t); return !!p && H.roomAt(p.x, p.z) === room; })())) firstTogether.set(d.id, t);
      }
    }
    for (const [id, t] of firstTogether) {
      const reacts = out.events.some(x => x.t >= t - 0.6 && x.t <= t + 2 && ((x.kind === 'shot' && x.from === id) || ((x.kind === 'cover' || x.kind === 'move' || x.kind === 'lay' || x.kind === 'death' || x.kind === 'wound' || x.kind === 'taken' || x.kind === 'surrender' || x.kind === 'freeze' || x.kind === 'hide') && x.unit === id) || (x.kind === 'shot' && x.to === id)));
      expect(reacts, `${id} shares a room with the crew from t=${t} and does nothing for 2 s`).toBe(true);
    }
  }, 60000);
});

describe('the checks are not vacuous', () => {
  it('the live planner makes clear calls, cover-fire calls and shared rooms to check', () => {
    let clears = 0, covers = 0, together = 0, runs = 0;
    for (const [style, seed] of STYLES) for (const box of [SMALL_HOUSE, HOUSE]) {
      const r = run(style, seed, box); if (!r) continue;
      runs++;
      for (const e of r.out.events) if (e.kind === 'say') { if (e.ctx === 'room_clear') clears++; if (e.ctx === 'cover_fire') covers++; }
      const kick = r.out.events.find(e => e.kind === 'house_door' && e.action === 'kick' && e.ok)?.t ?? 0;
      for (const d of r.out.units.filter(u => u.side === 'home' && u.id.startsWith('h_'))) for (let t = kick; t < kick + 40; t += 0.5) { const p = r.at(d.id, t); if (p && r.H.roomAt(p.x, p.z) >= 0) { together++; break; } }
    }
    expect({ runs, clears, covers, together }).toEqual({ runs: expect.any(Number), clears: expect.any(Number), covers: expect.any(Number), together: expect.any(Number) });
    expect(runs).toBeGreaterThan(6);
    expect(clears).toBeGreaterThan(0);
    expect(covers).toBeGreaterThan(0);
    expect(together).toBeGreaterThan(5);
  }, 120000);
});
