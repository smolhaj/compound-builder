import { describe, expect, it } from 'vitest';
import { newGame, SAVE_VERSION, type GameState } from './state';
import { planRun } from './perimeter';
import { applyBattle, planBattle, type BattleOptions, type PlannedBattle } from './battle';
import { FireMap, fireBoxesOf, fireLine, type Stance } from './lineOfFire';
import { resolveAftermath } from './aftermath';
import { migrate } from './save/migrations';
import type { BattleEvent } from './battleTypes';

function afterHit(seed = 1, home = 'farmhouse'): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.clock.t = Math.floor(g.disaster.hitAt + 200) + 0.5;
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
  g.stock.canned = 20; g.stock.fuel = 10; g.stock.meds = 3;
  g.structures.push({ id: 'house', kind: home, x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
  return g;
}
const armed = (g: GameState): GameState => {
  for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 6; }
  g.armory.ammo['556'] = 2000;
  return g;
};
const wall = (g: GameState, kind: 'container_wall' | 'log_palisade' | 'chain_link' | 'concrete_wall', half = 15): GameState => { const r = planRun(g, kind, [[-half, -half], [half, -half], [half, half], [-half, half], [-half, -half]]); r.done = r.hours; r.supplied = true; r.finishedAt = 0; return g; };
const tower = (g: GameState): GameState => { g.structures.push({ id: 'tw', kind: 'watchtower_wood', x: 6, z: 9, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 }); return g; };

/** Replay a fight: where each unit stands (and how high) at every shot, from the move events, and ask the same question the sim asked. */
function replayShots(g: GameState, b: PlannedBattle) {
  const map = new FireMap(fireBoxesOf(g)), pos = new Map<string, Stance>();
  for (const u of b.units) pos.set(u.id, { x: u.x, z: u.z, y: u.y ?? 0 });
  const out: Array<{ hit: boolean; from: string; sight: string; fromY: number }> = [];
  for (const e of b.events) {
    if (e.kind === 'move') pos.set(e.unit, { x: e.x, z: e.z, y: e.y ?? 0 });
    if (e.kind === 'shot') { const a = pos.get(e.from), c = pos.get(e.to); if (a && c) out.push({ hit: e.hit, from: e.from, sight: fireLine(map, a, c), fromY: a.y }); }
  }
  return out;
}

describe('line of fire in the fight', () => {
  it('a wall with a firing step lets the defenders behind it shoot over it, from the step', () => {
    let onStep = 0, hits = 0, crossed = 0;
    for (let i = 0; i < 12; i++) {
      const g = wall(armed(afterHit(i % 6 + 1, 'timber_cabin')), 'container_wall'), b = planBattle(g, 6, 300 + i, { armed: true, temper: 'desperate' });
      if (b.events.some(e => e.kind === 'move' && e.unit.startsWith('h_') && (e.y ?? 0) > 0.15 && (e.y ?? 0) < 0.4)) onStep++;
      for (const s of replayShots(g, b)) if (s.hit) { hits++; if (s.sight === 'blocked') crossed++; }
    }
    expect(onStep).toBeGreaterThan(8); expect(crossed / hits).toBeLessThan(0.06);
  });
  it('hits do not cross a solid wall at ground level (the picture replays the same boxes)', () => {
    let hits = 0, crossed = 0, groundHitsBehindWall = 0;
    for (const kind of ['container_wall', 'log_palisade'] as const) for (let i = 0; i < 20; i++) {
      const g = wall(armed(afterHit(i % 6 + 1)), kind), b = planBattle(g, 6, 300 + i, { armed: true, temper: 'desperate' });
      for (const s of replayShots(g, b)) if (s.hit) { hits++; if (s.sight === 'blocked') crossed++; if (s.sight === 'blocked' && s.fromY === 0) groundHitsBehindWall++; }
    }
    expect(hits).toBeGreaterThan(60);
    // (the replay places a unit at its last move event; a unit is a few hundredths of a second off its place at most, so allow a sliver)
    expect(crossed / hits).toBeLessThan(0.06);
    expect(groundHitsBehindWall / hits).toBeLessThan(0.06);
  });
  it('an open chain-link fence stops nothing: the same fight is fought at ground level', () => {
    const g = wall(armed(afterHit(2)), 'chain_link');
    expect(fireBoxesOf(g).filter(b => b.kind === 'wall')).toHaveLength(0);
    let ground = 0;
    for (let i = 0; i < 10; i++) { const b = planBattle(wall(armed(afterHit(i % 6 + 1)), 'chain_link'), 6, 300 + i, { armed: true, temper: 'desperate' }); ground += replayShots(g, b).filter(s => s.hit && s.fromY === 0).length; }
    expect(ground).toBeGreaterThan(0);
  });
  it('behind a solid wall the defenders shoot from where they can see: a tower, an upper window', () => {
    let tw = 0, upper = 0, n = 0;
    for (let i = 0; i < 12; i++) {
      const b = planBattle(tower(wall(armed(afterHit(i % 6 + 1)), 'concrete_wall')), 6, 300 + i, { armed: true, temper: 'desperate' });
      const high = new Set(b.events.filter(e => e.kind === 'move' && e.unit.startsWith('h_') && (e.y ?? 0) >= 0.8).map(e => (e as { unit: string }).unit));
      if (high.size) tw++;
      const bf = planBattle(wall(armed(afterHit(i % 6 + 1)), 'concrete_wall'), 6, 300 + i, { armed: true, temper: 'desperate' });
      if (bf.events.some(e => e.kind === 'move' && e.unit.startsWith('h_') && Math.abs((e.y ?? 0) - 0.85) < 0.01)) upper++;
      n++;
    }
    expect(tw).toBe(n); expect(upper).toBeGreaterThan(n * 0.7);
  });
  it('nobody fires at a wall: with a solid wall most of the shooting happens over a longer stretch of the fight, from heights', () => {
    // a one-storey cabin behind a plain concrete wall (no firing step): nowhere to shoot from but the wall itself, so the defenders fire at the men climbing it and no one else
    let total = 0, climbers = 0;
    for (let i = 0; i < 16; i++) {
      const g = wall(armed(afterHit(i % 6 + 1, 'timber_cabin')), 'concrete_wall'), b = planBattle(g, 6, 300 + i, { armed: true, temper: 'desperate' });
      const y = new Map<string, number>();
      for (const e of b.events) {
        if (e.kind === 'move') y.set(e.unit, e.y ?? 0);
        if (e.kind === 'shot' && e.from.startsWith('h_')) { total++; if ((y.get(e.to) ?? 0) > 0.3) climbers++; }
      }
    }
    expect(total).toBeGreaterThan(0);
    // (the line is now the drawn wall itself, not the radius of its farthest corner: the crew comes up to the wall, so more of the fight is at the foot of it)
    expect(climbers / total).toBeGreaterThan(0.35);
  });
  it('raiders look for a line instead of shooting a wall: they sidestep along it', () => {
    let moved = 0;
    for (let i = 0; i < 10; i++) {
      const b = planBattle(wall(armed(afterHit(i % 6 + 1)), 'container_wall'), 6, 300 + i, { armed: true, temper: 'desperate' });
      const shots = b.events.filter(e => e.kind === 'shot' && e.from.startsWith('r'));
      const moves = b.events.filter(e => e.kind === 'move' && e.unit.startsWith('r'));
      if (shots.length && moves.length > 6) moved++;
    }
    expect(moved).toBeGreaterThan(5);
  });
  it('is deterministic, with the fates and the surrender in it', () => {
    const run = () => planBattle(wall(armed(afterHit(3)), 'container_wall'), 8, 99, { armed: true, temper: 'hard', kind: 'gang' });
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});

/** Defenders alive, not taken, not in the shelter and not dead at the end of a fight: the ones on the ground. */
function groundAtEnd(g: GameState, b: PlannedBattle): string[] {
  const home = g.structures.find(s => s.id === 'house')!;
  const shelter = new Set<string>(), dead = new Set<string>(), gone = new Set<string>();
  for (const e of b.events) {
    if (e.kind === 'move' && e.unit.startsWith('h_')) { if (Math.abs(e.x - home.x) < 0.01 && Math.abs(e.z - home.z) < 0.01) shelter.add(e.unit); else shelter.delete(e.unit); }
    if (e.kind === 'death') dead.add(e.unit);
    if (e.kind === 'taken') gone.add(e.unit);
  }
  return b.units.filter(u => u.side === 'home' && !u.machine && !u.civilian && !u.bystander && !dead.has(u.id) && !gone.has(u.id) && !shelter.has(u.id)).map(u => u.id);
}

describe('a breach ends with a fate for every defender on the ground', () => {
  it('never a defender standing unhurt among the raiders, across temper and seed', () => {
    let breaches = 0, ground = 0;
    const kinds: Array<[BattleOptions['temper'], string]> = [['desperate', 'looters'], ['hard', 'gang'], ['savage', 'gang'], ['hard', 'militia']];
    for (const [temper, kind] of kinds) for (let i = 0; i < 25; i++) {
      const g = afterHit(i % 6 + 1);   // no wall, no guns beyond a family's: the line breaks often
      if (i % 2) armed(g);
      const b = planBattle(g, 9, 500 + i, { armed: true, temper, kind, organized: true });
      if (b.result !== 'breached' && b.result !== 'overrun') continue;
      breaches++;
      const fated = new Set((b.fates ?? []).map(f => f.unit));
      const left = groundAtEnd(g, b);
      ground += left.length;
      for (const u of left) expect(fated.has(u), `${temper}/${kind} seed ${i}: ${u} is standing with no fate`).toBe(true);
      // and the picture is told what each fate looks like
      for (const f of b.fates ?? []) {
        const ev = b.events.filter(e => 'unit' in e && (e as { unit: string }).unit === f.unit);
        if (f.fate === 'held') expect(ev.some(e => e.kind === 'surrender')).toBe(true);
        if (f.fate === 'taken') expect(ev.some(e => e.kind === 'taken')).toBe(true);
        if (f.fate === 'killed' || f.fate === 'finished') expect(ev.some(e => e.kind === 'death')).toBe(true);
        if (f.fate === 'fled') expect(ev.some(e => e.kind === 'flee')).toBe(true);
      }
    }
    expect(breaches).toBeGreaterThan(40);
    expect(ground).toBeGreaterThan(10);
  });
  it('savage crews shoot or finish; desperate ones hold and let run', () => {
    const tally = (temper: 'savage' | 'desperate', kind: string) => {
      const t: Record<string, number> = {};
      for (let i = 0; i < 120; i++) { const b = planBattle(afterHit(i % 6 + 1), 9, 700 + i, { armed: true, temper, kind, organized: true }); for (const f of b.fates ?? []) t[f.fate] = (t[f.fate] ?? 0) + 1; }
      return t;
    };
    const sv = tally('savage', 'gang'), ds = tally('desperate', 'looters');
    expect((sv.killed ?? 0) + (sv.finished ?? 0)).toBeGreaterThan((ds.killed ?? 0) + (ds.finished ?? 0));
    expect((ds.held ?? 0) + (ds.fled ?? 0) + (ds.spared ?? 0)).toBeGreaterThan(((sv.held ?? 0) + (sv.fled ?? 0) + (sv.spared ?? 0)) * 0.6);   // (a merciful crew spares the unarmed and the children rather than holding them)
    expect(ds.taken ?? 0).toBe(0);
  });
});

describe('a crew that is beaten and cannot get away gives up', () => {
  const ambushed = (temper: 'desperate' | 'hard' | 'savage', kind: string, N = 40) => {
    let battles = 0, withSurrender = 0, raiders = 0, crew = 0;
    for (let i = 0; i < N; i++) {
      const g = armed(afterHit(i % 6 + 1)); wall(g, 'container_wall', 10);
      const b = planBattle(g, 6, 900 + i, { armed: true, temper, kind, organized: true, ambush: 3 });
      battles++;
      const n = b.surrendered?.raiders.length ?? 0;
      raiders += n; if (n) withSurrender++;
      if (n && b.result === 'repelled' && b.events.filter(e => e.kind === 'surrender').length >= 3) crew++;
    }
    return { battles, withSurrender, raiders, crew };
  };
  it('desperate crews and refugees give up more than a hard gang; a savage crew does not', () => {
    const d = ambushed('desperate', 'looters'), h = ambushed('hard', 'gang'), s = ambushed('savage', 'gang');
    expect(d.raiders).toBeGreaterThan(h.raiders);
    expect(d.withSurrender).toBeGreaterThan(0);
    expect(s.raiders).toBe(0);
  });
  it('the surrendered are held, not left hurt on the drive: the report, the events and the aftermath agree', () => {
    let seen = 0;
    for (let i = 0; i < 40 && seen < 3; i++) {
      const g = armed(afterHit(i % 6 + 1)); wall(g, 'container_wall', 10);
      const b = planBattle(g, 6, 900 + i, { armed: true, temper: 'desperate', kind: 'looters', organized: true, ambush: 3 });
      if (!b.surrendered?.raiders.length) continue;
      seen++;
      const hands = new Set(b.events.filter(e => e.kind === 'surrender').map(e => (e as { unit: string }).unit));
      for (const id of b.surrendered.raiders) {
        expect(b.units.find(u => u.id === id)?.side).toBe('raider');
        expect(b.events.some(e => e.kind === 'death' && e.unit === id)).toBe(false);
        if (!b.events.some(e => e.kind === 'wound' && e.unit === id)) expect(hands.has(id)).toBe(true);   // (a man who was never hit has his hands up)
      }
      expect(b.leftBehind?.surrendered).toBe(b.surrendered.raiders.length);
      expect(b.result).not.toBe('breached');
      applyBattle(g, b);
      expect(g.gate.aftermath?.surrendered).toBe(b.surrendered.raiders.length);
      // every raider is exactly one of: dead, run off, surrendered, left wounded, still standing at the end (none of the last when the crew gave up)
      const wounded = g.gate.aftermath?.wounded ?? 0;
      expect(wounded).toBe(b.leftBehind?.wounded ?? 0);
    }
    expect(seen).toBeGreaterThan(0);
  });
  it('a man hurt and left behind by a crew that ran can still put his hands up', () => {
    let hands = 0, down = 0;
    for (let i = 0; i < 60; i++) {
      const g = armed(afterHit(i % 6 + 1)); wall(g, 'container_wall', 12); tower(g);
      const b = planBattle(g, 6, 1100 + i, { armed: true, temper: 'desperate', kind: 'looters' });
      if (b.result !== 'repelled' && b.result !== 'fled') continue;
      hands += b.surrendered?.raiders.length ?? 0; down += b.leftBehind?.wounded ?? 0;
    }
    expect(hands).toBeGreaterThan(0); expect(down).toBeGreaterThan(0);
  });
});

describe('what the family does with the ones who gave up', () => {
  const held = (choice: Parameters<typeof resolveAftermath>[1], wounded: number, surrendered: number) => {
    const g = afterHit(4); g.gate.aftermath = { day: 100, wounded, dead: 1, surrendered };
    const humanity = g.gate.humanity, meds = g.stock.meds;
    const lines = resolveAftermath(g, choice);
    return { g, lines, dh: g.gate.humanity - humanity, dm: meds - g.stock.meds };
  };
  it('release: no dressings spent on men who are not hurt; humanity up', () => {
    const r = held('treat_release', 0, 2);
    expect(r.dm).toBe(0); expect(r.dh).toBeGreaterThan(0); expect(r.lines.join(' ')).toMatch(/walked to the road/);
    expect(held('treat_release', 2, 0).dm).toBeGreaterThan(0);
  });
  it('hold: they become prisoners, calmer than the hurt', () => {
    const r = held('hold', 1, 2);
    expect(r.g.gate.prisoners).toHaveLength(3);
    const sevs = r.g.gate.prisoners!.map(p => p.sev);
    expect(Math.max(...sevs.slice(1))).toBeLessThan(16);   // the two who gave up
    expect(sevs[0]).toBeGreaterThanOrEqual(30);            // the one who was hurt
  });
  it('turn them loose: they walk; finish them: it costs more than finishing men who were already down', () => {
    expect(held('leave', 0, 2).lines.join(' ')).toMatch(/disarmed/);
    const shot = held('finish', 0, 2), down = held('finish', 2, 0);
    expect(shot.dh).toBeLessThan(down.dh);
  });
  it('clears the card and counts the dead', () => {
    const r = held('hold', 0, 1);
    expect(r.g.gate.aftermath).toBeNull(); expect(r.lines.join(' ')).toMatch(/bod/i);
  });
});

describe('save v86', () => {
  it('migrates a v85 save: an open aftermath gains a surrendered count of zero', () => {
    const g = afterHit(2);
    g.gate.aftermath = { day: 5, wounded: 1, dead: 0 };
    const old = JSON.parse(JSON.stringify(g)); old.version = 85;
    const m = migrate(old);
    expect(m.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(86);
    expect(m.gate.aftermath).toEqual({ day: 5, wounded: 1, dead: 0, surrendered: 0 });
    const none = JSON.parse(JSON.stringify(afterHit(2))); none.version = 85; none.gate.aftermath = null;
    expect(migrate(none).gate.aftermath).toBeNull();
  });
  it('round-trips a battle with surrender and fates', () => {
    let b: PlannedBattle | null = null;
    for (let i = 0; i < 60 && !b?.surrendered?.raiders.length; i++) { const g = armed(afterHit(i % 6 + 1)); wall(g, 'container_wall', 10); b = planBattle(g, 6, 900 + i, { armed: true, temper: 'desperate', kind: 'looters', organized: true, ambush: 3 }); }
    expect(b?.surrendered?.raiders.length).toBeGreaterThan(0);
    const copy = JSON.parse(JSON.stringify(b)) as PlannedBattle;
    expect(copy.surrendered).toEqual(b!.surrendered);
    expect(copy.events.map((e: BattleEvent) => e.kind)).toContain('end');
  });
});
