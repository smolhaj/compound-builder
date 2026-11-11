import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { planRun } from './perimeter';
import type { Battle, BattleUnit } from './battleTypes';
import { breachMethod, breachOptions, breachSpot, decorateBreach } from './breach';
import { ASSAULT_EXTRA, planHouseAssault } from './houseAssault';
import { LineDirector } from './raidDialogue';

function world() {
  const g = newGame(3, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  const r = planRun(g, 'container_wall', [[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]]);
  r.done = r.hours; r.supplied = true; r.finishedAt = 0;
  return g;
}
const unit = (id: string, side: 'home' | 'raider', x: number, z: number, extra: Partial<BattleUnit> = {}): BattleUnit => ({ id, side, x, z, post: 'open', ...extra });
function battle(style: 'crew' | 'crowd' = 'crowd'): Battle {
  const look = (i: number) => ({ style, role: 'soldier' as const, torch: false, tone: i });
  return {
    night: true, duration: 74,
    units: [unit('h_a', 'home', 0, 0), unit('h_b', 'home', 1, 0), unit('h_k', 'home', 0, 1, { civilian: true }), ...[0, 1, 2, 3, 4].map(i => unit(`r${i}`, 'raider', 12 + i * 0.5, i * 0.7, { look: look(i) }))],
    events: [
      { t: 1, kind: 'alarm', what: 'dog' },
      { t: 30, kind: 'move', unit: 'r0', x: 10.5, z: 0.4 },
      { t: 50, kind: 'breach', x: 10.1, z: 0.3 },
      { t: 60, kind: 'wound', unit: 'h_b', sev: 0.5, part: 'arm' },
      { t: 72, kind: 'end', result: 'breached' },
    ],
  };
}

describe('breach: how the wall comes down', () => {
  it('finds the wall run nearest the sim breach, on the side away from the house', () => {
    const g = world();
    const s = breachSpot(g.perimeter, 10.1, 0.3, { x: 0, z: 0 }, 'ram');
    expect(s).not.toBeNull();
    expect(s!.x).toBeCloseTo(10, 1);
    expect(s!.out.x).toBeGreaterThan(0.9);
    expect(s!.w).toBeGreaterThan(0.5);
    expect(breachSpot(g.perimeter, 40, 40, { x: 0, z: 0 }, 'ram')).toBeNull();
  });

  it('a crowd rams, a disciplined crew plants a charge, a rocket crew always charges', () => {
    expect(breachMethod(battle('crowd').units, 1)).toBe('ram');
    expect(breachMethod(battle('crew').units, 1)).toBe('charge');
    expect(breachMethod(battle('crowd').units, 1, true)).toBe('charge');
    breachOptions.force = 'ram';
    expect(breachMethod(battle('crew').units, 1)).toBe('ram');
    breachOptions.force = null;
  });

  it('a sim that let the crew climb is left alone, unless a method is forced (the movie recipe really rams)', () => {
    const g = world(), b = battle('crowd');
    const climbed: Battle = { ...b, events: b.events.map(e => (e.kind === 'breach' ? { ...e, method: 'climb' as const } : e)) };
    expect(decorateBreach(climbed, g.perimeter, { x: 0, z: 0 }, 5).events.some(e => e.kind === 'ram')).toBe(false);
    breachOptions.force = 'ram';
    try {
      const d = decorateBreach(climbed, g.perimeter, { x: 0, z: 0 }, 5);
      expect(d.invasion?.method).toBe('ram');
      expect(d.events.some(e => e.kind === 'ram')).toBe(true);
    } finally { breachOptions.force = null; }
  });

  it('a ram run ends on the sim breach, with a gap at the same moment, and adds no shots, wounds or deaths', () => {
    const g = world(), b = battle('crowd');
    const d = decorateBreach(b, g.perimeter, { x: 0, z: 0 }, 5);
    expect(d.invasion?.method).toBe('ram');
    const ram = d.events.find(e => e.kind === 'ram')!, gap = d.events.find(e => e.kind === 'gap')!;
    expect(ram.kind === 'ram' && ram.t + ram.secs).toBeCloseTo(50, 1);
    expect(gap.t).toBe(50);
    for (const k of ['shot', 'wound', 'death'] as const) expect(d.events.filter(e => e.kind === k).length).toBe(b.events.filter(e => e.kind === k).length);
    expect(d.events.find(e => e.kind === 'breach')).toBeTruthy();
    // sorted, and a second pass changes nothing
    expect(d.events.every((e, i) => i === 0 || d.events[i - 1].t <= e.t)).toBe(true);
    expect(decorateBreach(d, g.perimeter, { x: 0, z: 0 }, 5)).toBe(d);
  });

  it('a charge is planted, fused, then goes off at the breach as a wall wreck', () => {
    const g = world(), d = decorateBreach(battle('crew'), g.perimeter, { x: 0, z: 0 }, 5);
    expect(d.invasion?.method).toBe('charge');
    const ch = d.events.find(e => e.kind === 'charge')!, ex = d.events.find(e => e.kind === 'explosion')!;
    expect(ch.kind === 'charge' && ch.t + ch.fuse).toBeCloseTo(50, 1);
    expect(ex.kind === 'explosion' && ex.wrecks).toBe('wall');
  });

  it('leaves a battle with no breach, or none near a wall, alone', () => {
    const g = world(), b = battle();
    const noBreach = { ...b, events: b.events.filter(e => e.kind !== 'breach') };
    expect(decorateBreach(noBreach, g.perimeter, { x: 0, z: 0 }, 1)).toBe(noBreach);
    expect(decorateBreach(b, [], { x: 0, z: 0 }, 1)).toBe(b);
  });

  it('is deterministic in the seed and never repeats a line in one scene', () => {
    const g = world();
    const a = decorateBreach(battle(), g.perimeter, { x: 0, z: 0 }, 9), c = decorateBreach(battle(), g.perimeter, { x: 0, z: 0 }, 9);
    expect(a).toEqual(c);
    const says = a.events.filter(e => e.kind === 'say').map(e => (e.kind === 'say' ? e.text : ''));
    expect(new Set(says).size).toBe(says.length);
  });
});

describe('house assault: the last act', () => {
  // a 1.6 x 1.2 house with one door in its south wall and a partition across the middle with a gap
  const box = { x0: -0.8, z0: -0.6, x1: 0.8, z1: 0.6 };
  const wall = (x: number, z: number) => {
    const inside = x > box.x0 - 0.03 && x < box.x1 + 0.03 && z > box.z0 - 0.03 && z < box.z1 + 0.03;
    if (!inside) return false;
    const onEdge = x < box.x0 + 0.04 || x > box.x1 - 0.04 || z < box.z0 + 0.04 || z > box.z1 - 0.04;
    if (onEdge) return !(z > box.z1 - 0.06 && Math.abs(x) < 0.12);   // the door
    if (Math.abs(x) < 0.03) return Math.abs(z) > 0.12;               // a partition with a doorway
    return false;
  };
  const setup = () => {
    const g = world();
    const b = decorateBreach(battle(), g.perimeter, { x: 0, z: 0 }, 5);
    return { b, a: planHouseAssault(b, { box, blocked: wall, seed: 4 }) };
  };

  it('stretches the scene, moves the end, and keeps the sim result and the sim wound', () => {
    const { b, a } = setup();
    const end = a.events.find(e => e.kind === 'end')!;
    expect(end.kind === 'end' && end.result).toBe('breached');
    expect(end.t).toBeGreaterThan(72 + 20);
    expect(a.duration).toBeGreaterThan(b.duration + 20);
    expect(a.events.filter(e => e.kind === 'wound').length).toBe(1);
    expect(a.events.filter(e => e.kind === 'death').length).toBe(0);
    expect(a.invasion?.interior).toBeTruthy();
    expect(a.invasion?.house?.door).toBeTruthy();
    expect(ASSAULT_EXTRA).toBeGreaterThan(20);
  });

  it('no unit steps through a wall, and the wounded defender is dragged to the back room', () => {
    const { a } = setup();
    const moves = a.events.filter(e => e.kind === 'move' && e.t > 55 && e.t < 90 && (e.unit === 'h_a' || e.unit === 'h_b' || e.unit === 'h_k' || e.unit.startsWith('r')));
    const inHouse = moves.filter(e => e.kind === 'move' && e.x > box.x0 && e.x < box.x1 && e.z > box.z0 && e.z < box.z1);
    expect(inHouse.length).toBeGreaterThan(4);
    for (const e of inHouse) if (e.kind === 'move') expect(wall(e.x, e.z)).toBe(false);
    expect(a.events.some(e => e.kind === 'aid')).toBe(true);
    expect(a.events.some(e => e.kind === 'move' && e.unit === 'h_b' && e.t > 66)).toBe(true);
  });

  it('adds no shot the sim did not fire as a hit, and no extra death', () => {
    const { b, a } = setup();
    const hits = (x: Battle) => x.events.filter(e => e.kind === 'shot' && e.hit).length;
    expect(hits(a)).toBe(hits(b));
  });

  it('with no door found it still fills the extra seconds at the windows', () => {
    const g = world();
    const b = decorateBreach(battle(), g.perimeter, { x: 0, z: 0 }, 5);
    const a = planHouseAssault(b, { box, blocked: () => true, seed: 4 });
    expect(a.invasion?.interior).toBeUndefined();
    expect(a.duration).toBeGreaterThan(b.duration + 20);
    expect(a.events.filter(e => e.kind === 'shot').length).toBeGreaterThan(10);
  });

  it('the crew that won the line is not left standing in a group: the hurt lie down, the family is held hands up, the crew goes out through the gap', () => {
    const { a } = setup();
    const end = a.events.find(e => e.kind === 'end')!.t;
    for (const id of ['r0', 'r1', 'r2', 'r3', 'r4']) {
      const f = [...a.events].reverse().find(e => e.t <= end && ((e.kind === 'move' || e.kind === 'cover') && e.unit === id || (e.kind === 'lay' || e.kind === 'flee') && e.unit === id));
      expect(f, id).toBeTruthy();
      if (f!.kind === 'move') expect(Math.abs(f!.x) > 10 || Math.abs(f!.z) > 10, `${id} ends outside the wall`).toBe(true);
    }
    expect(a.events.some(e => e.kind === 'surrender' && e.unit.startsWith('h_'))).toBe(true);
  });

  it('an overrun scene keeps its result and the crew stays in the house', () => {
    const g = world();
    const b0 = decorateBreach(battle(), g.perimeter, { x: 0, z: 0 }, 5);
    const b = { ...b0, events: b0.events.map(e => (e.kind === 'end' ? { ...e, result: 'overrun' as const } : e)) };
    const a = planHouseAssault(b, { box, blocked: wall, seed: 4 });
    const end = a.events.find(e => e.kind === 'end')!;
    expect(end.kind === 'end' && end.result).toBe('overrun');
    expect(a.events.some(e => e.kind === 'surrender')).toBe(true);
  });
});

describe('breach camera data', () => {
  it('the scene says where the wall falls and when it is shown', () => {
    const g = world();
    const ram = decorateBreach(battle('crowd'), g.perimeter, { x: 0, z: 0 }, 5), ch = decorateBreach(battle('crew'), g.perimeter, { x: 0, z: 0 }, 5);
    expect(ram.invasion?.breach?.at).toBe(50);
    expect(ram.invasion!.breach!.from).toBeLessThan(46.6);
    expect(ch.invasion!.breach!.from).toBeLessThan(45.8);
    expect(ram.invasion!.breach!.ox).toBeGreaterThan(0.9);
  });
});

describe('invasion dialogue', () => {
  const box = { x0: -0.8, z0: -0.6, x1: 0.8, z1: 0.6 };
  const wall = (x: number, z: number) => {
    if (!(x > box.x0 - 0.03 && x < box.x1 + 0.03 && z > box.z0 - 0.03 && z < box.z1 + 0.03)) return false;
    if (x < box.x0 + 0.04 || x > box.x1 - 0.04 || z < box.z0 + 0.04 || z > box.z1 - 0.04) return !(z > box.z1 - 0.06 && Math.abs(x) < 0.12);
    return Math.abs(x) < 0.03 && Math.abs(z) > 0.12;
  };
  for (const style of ['crowd', 'crew'] as const) for (const result of ['breached', 'overrun'] as const) {
    it(`a whole ${style} invasion ending ${result}: no line twice, no caption stuck for long, new moments each time`, () => {
      const g = world();
      const dir = new LineDirector(11);
      const b0 = battle(style);
      const b = { ...b0, events: b0.events.map(e => (e.kind === 'end' ? { ...e, result } : e)) };
      const d = decorateBreach(b, g.perimeter, { x: 0, z: 0 }, 5, false, dir);
      const a = planHouseAssault(d, { box, blocked: wall, seed: 4, dir });
      const says = a.events.filter(e => e.kind === 'say');
      const texts = says.map(e => (e.kind === 'say' ? e.text : ''));
      expect(new Set(texts).size, 'a line was said twice').toBe(texts.length);
      for (let i = 1; i < says.length; i++) expect(says[i].t - says[i - 1].t, `quiet stretch before ${texts[i]}`).toBeLessThan(5);
      const ctxs = new Set(says.map(e => (e.kind === 'say' ? e.ctx : '')));
      for (const c of ['stack_door', 'clear_room', 'hold_room', 'search', 'leaving']) expect(ctxs.has(c), c).toBe(true);
      expect(ctxs.has(d.invasion?.method === 'ram' ? 'ram_run' : 'charge_set')).toBe(true);
    });
  }
});
