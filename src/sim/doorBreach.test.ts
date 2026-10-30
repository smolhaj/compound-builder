import { afterEach, describe, expect, it } from 'vitest';
import { DOOR, doorTierOf, holdLine, planBreach, type DoorCrew, type DoorDefense } from './doorBreach';
import { mulberry32 } from './rng';
import { newGame, type GameState, type Structure } from './state';
import { setGroundOverride } from './terrainState';
import type { GroundSource } from './terrain';
import { planRun } from './perimeter';
import { planBattle } from './battle';

afterEach(() => setGroundOverride(null));

const plain: DoorCrew = { men: 4, grenades: 0, rockets: 0, organized: false, late: 0, adapt: 0 };
const armed: DoorCrew = { men: 8, grenades: 3, rockets: 1, organized: true, late: 0.9, adapt: 0.8 };
const steel: DoorDefense = { tier: 'steel', locked: true, overwatch: 0, sallyPorts: 0 };
const mean = (crew: DoorCrew, def: DoorDefense, n = 200) => { let a = 0; for (let i = 0; i < n; i++) a += planBreach(crew, def, mulberry32(i + 1)).secs; return a / n; };

describe('the door breach roll', () => {
  it('an open door holds a crew only a moment; a locked one is a job', () => {
    expect(planBreach(plain, { ...steel, locked: false }, mulberry32(1)).secs).toBeLessThan(5);
    expect(planBreach(plain, steel, mulberry32(1)).secs).toBeGreaterThan(8);
  });

  it('a blast door holds longer than a steel one, whatever the crew brings', () => {
    for (const crew of [plain, armed]) expect(mean(crew, { ...steel, tier: 'blast' })).toBeGreaterThan(mean(crew, steel));
    expect(doorTierOf('rock_tunnel', true)).toBe('blast');
    expect(doorTierOf('tunnel_bridge', false)).toBe('steel');
  });

  it('explosives and a torch cut the time, and they are spent on the door', () => {
    expect(mean(armed, steel)).toBeLessThan(mean(plain, steel));
    const used = Array.from({ length: 60 }, (_, i) => planBreach(armed, steel, mulberry32(i + 5))).filter(p => p.spent.grenades + p.spent.rockets > 0);
    expect(used.length).toBeGreaterThan(10);
    for (const p of used) { expect(p.spent.grenades).toBeLessThanOrEqual(armed.grenades); expect(p.spent.rockets).toBeLessThanOrEqual(armed.rockets); }
  });

  it('every tower that sees the door and every sally port make the hold longer (strong defenses never make it easier)', () => {
    const base = mean(plain, steel);
    expect(mean(plain, { ...steel, overwatch: 2 })).toBeGreaterThan(base);
    expect(mean(plain, { ...steel, overwatch: 4 })).toBeGreaterThan(mean(plain, { ...steel, overwatch: 2 }));
    expect(mean(plain, { ...steel, sallyPorts: 1 })).toBeGreaterThan(base);
    // capped
    expect(mean(plain, { ...steel, overwatch: 9, sallyPorts: 9 })).toBeCloseTo(mean(plain, { ...steel, overwatch: 4, sallyPorts: 2 }), 5);
  });

  it('a few men with bolt cutters give up on a blast door instead of getting through', () => {
    const p = planBreach({ ...plain, men: 3 }, { ...steel, tier: 'blast' }, mulberry32(3));
    expect(p.gaveUp).toBe(true);
    expect(p.secs).toBe(DOOR.GIVE_UP);
  });

  it('the noise reaches the camp: a ram early, a torch late, a charge when it goes', () => {
    const ram = Array.from({ length: 80 }, (_, i) => planBreach({ ...plain, men: 8, late: 1, adapt: 1 }, steel, mulberry32(i))).find(p => p.method === 'a ram');
    expect(ram?.noiseAt).toBeLessThan(5);
    const torch = Array.from({ length: 120 }, (_, i) => planBreach({ ...armed, grenades: 0, rockets: 0 }, steel, mulberry32(i))).find(p => p.method === 'a cutting torch');
    if (torch) expect(torch.noiseAt).toBeGreaterThan(ram?.noiseAt ?? 0);
    const charge = Array.from({ length: 80 }, (_, i) => planBreach({ ...armed, grenades: 6 }, steel, mulberry32(i))).find(p => p.method === 'a charge');
    expect(charge).toBeTruthy();
    expect(charge!.noiseAt).toBe(charge!.secs);
    expect(planBreach(plain, { ...steel, locked: false }, mulberry32(1)).noiseAt).toBe(Infinity);
  });

  it('the Defense tab says how long a door holds', () => {
    expect(holdLine('steel')).toMatch(/steel door holds four men.*s/);
    expect(holdLine('blast')).toMatch(/blast door/);
    expect(holdLine('steel', 3, 1)).not.toBe(holdLine('steel'));
  });
});

// a battle at a tunnel-bridge
const GORGE: GroundSource = { h: (_x, z) => 4 - 4 * Math.exp(-((z - 40) ** 2) / 8), creek: { zAt: () => 40, waterY: () => 0.1, halfWidth: 0.8 } };
const built = (g: GameState, id: string, kind: string, x: number, z: number): Structure => { const st: Structure = { id, kind, x, z, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 }; g.structures.push(st); return st; };
function bridged(): GameState {
  setGroundOverride(GORGE);
  const g = newGame(3); g.site = { ...g.site, creek: true, home: { x0: 0, z0: 0, x1: 67, z1: 67 } };
  built(g, 'h', 'timber_cabin', 33, 18);
  const b = planRun(g, 'tunnel_bridge', [[33, 28], [33, 52]]); b.finishedAt = 0; b.done = b.hours; b.supplied = true;
  g.clock.t = 0.8;   // night
  return g;
}

describe('the door in a battle', () => {
  it('a crew held at the door works it, and the work is on the timeline', () => {
    const g = bridged();
    let withDoor = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const b = planBattle(g, 6, seed);
      const d = b.events.filter(e => e.kind === 'door');
      if (!d.length) continue;
      withDoor++;
      expect(d[0].t).toBe(0);
      const firstShot = b.events.find(e => e.kind === 'shot' && e.from.startsWith('r'));
      const open = d.find(e => e.kind === 'door' && e.open);
      if (open && firstShot) expect(firstShot.t).toBeGreaterThanOrEqual(open.t - 1);
    }
    expect(withDoor).toBeGreaterThan(0);
  });

  it('the work on the door raises the alarm when nothing else has', () => {
    const g = bridged();
    for (let seed = 1; seed <= 12; seed++) {
      const b = planBattle(g, 6, seed);
      const alarm = b.events.find(e => e.kind === 'alarm');
      expect(alarm).toBeTruthy();
    }
  });
});
