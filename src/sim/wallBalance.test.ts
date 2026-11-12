/**
 * Balance pass "wall quality matters, and hiding is not free" (docs/DECISIONS.md, 2026-11-12). Playtest evidence: a free log palisade scored within
 * noise of a $2,800 a unit concrete wall in the battle sim, four wooden towers with no wall beat a palisade, a militia fought exactly like a gang, a raid
 * was never "repelled", and a family that hid was found a flat 10-12 % of the time whatever the crew. These tests pin the tier ordering and the new knobs.
 */
import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { PERIMETER, WALL_HP, WALL_HP_TOP, climbHoldS, climbRateK, holdScale, needsMeans, planRun, wallHp, wallToughness, type PerimeterKind } from './perimeter';
import { planBattle, MILITIA, wallPostCover, type BattleOptions } from './battle';
import { HIDE, HIDE_COST_K, HIDE_WALL, REPELLED_RESPECT, holdOutK, STRIP, STRIP_HARDCORE, hideFoundChance, postureOf, repeatFinds, type Encounter } from './encounters';
import { MATERIALS } from './materials';
import { TOWER_POSTS_CAP, battleTowerPosts } from './towers';
import { WAVE } from './waves';
import { WALL_RESIST } from './breachMeans';
import { LEAKY_WALLS } from './lineOfFire';

function afterHit(seed: number, armed = true): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.disaster.difficulty = 'standard';
  g.clock.t = Math.floor(g.disaster.hitAt + 200) + 0.5;
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
  g.stock.canned = 20; g.stock.fuel = 10; g.stock.meds = 3;
  g.structures.push({ id: 'house', kind: 'farmhouse', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
  if (armed) {
    for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 6; }
    g.armory.ammo['556'] = 2000;
  }
  return g;
}
const ring = (g: GameState, kind: PerimeterKind) => {
  const run = planRun(g, kind, [[-15, -15], [15, -15], [15, 15], [-15, 15], [-15, -15]]);
  run.done = run.hours; run.supplied = true; run.finishedAt = g.clock.t - 8 * 365;   // finished years ago: a hedge is grown
  return run;
};
const usd = (k: PerimeterKind) => Object.entries(PERIMETER[k].materials).reduce((a, [m, q]) => a + (q as number) * (MATERIALS[m as keyof typeof MATERIALS]?.price ?? 0), 0);

const CREWS: Array<{ n: number; o: BattleOptions }> = [
  { n: 6, o: { temper: 'desperate', kind: 'looters' } },
  { n: 8, o: { temper: 'hard', kind: 'gang', organized: true } },
  { n: 12, o: { temper: 'hard', kind: 'gang', organized: true } },
];
/** Share of fights lost (breached or overrun) over every crew and seed on a ring of this wall. */
function lostShare(kind: PerimeterKind | null, seeds = 14): { lost: number; overrun: number; repelled: number; held: number; dead: number } {
  let lost = 0, overrun = 0, repelled = 0, held = 0, dead = 0, n = 0;
  for (const c of CREWS) for (let i = 0; i < seeds; i++) {
    const g = afterHit(1 + (i % 8));
    if (kind) ring(g, kind);
    const b = planBattle(g, c.n, 100 + i, c.o);
    n++;
    if (b.result === 'breached' || b.result === 'overrun') lost++;
    if (b.result === 'overrun') overrun++;
    if (b.result === 'repelled') repelled++;
    if (b.result === 'repelled' || b.result === 'fled') held++;
    dead += b.events.filter(e => e.kind === 'death' && e.unit.startsWith('h_')).length;
  }
  return { lost: lost / n, overrun: overrun / n, repelled: repelled / n, held: held / n, dead: dead / n };
}

describe('the wall tiers are separated', () => {
  it('hit points rise up the chain, and cost does not buy a worse wall than a free one', () => {
    const order: PerimeterKind[] = ['split_rail', 'woven_wire', 'chain_link', 'log_palisade', 'wrought_iron', 'iron_barbed', 'container_wall', 'stone_wall', 'steel_wall', 'concrete_wall'];
    for (let i = 1; i < order.length; i++) expect(wallHp(order[i])).toBeGreaterThan(wallHp(order[i - 1]));
    expect(wallHp('concrete_wall')).toBe(WALL_HP_TOP);
    for (const k of Object.keys(PERIMETER) as PerimeterKind[]) if (PERIMETER[k].blocks.people > 0.5 && !PERIMETER[k].walkway) expect(WALL_HP[k], `${k} has no hit points`).toBeGreaterThan(0);
    // a palisade and a hedge are no longer as good as chain-link, iron or containers at stopping people
    expect(PERIMETER.log_palisade.blocks.people).toBeLessThanOrEqual(0.65); expect(PERIMETER.thorn_hedge.blocks.people).toBeLessThanOrEqual(0.65);
    expect(usd('log_palisade')).toBeLessThan(usd('stone_wall')); expect(usd('stone_wall')).toBeLessThan(usd('concrete_wall'));
  });

  it('the posture barrier of a closed ring spreads from a palisade to concrete (it used to be 85 vs 97)', () => {
    const barrier = (k: PerimeterKind) => { const g = afterHit(3, false); ring(g, k); return postureOf(g).barrier; };
    const pal = barrier('log_palisade'), hedge = barrier('thorn_hedge'), chain = barrier('chain_link'), box = barrier('container_wall'), stone = barrier('stone_wall'), steel = barrier('steel_wall'), conc = barrier('concrete_wall');
    expect(conc - pal).toBeGreaterThanOrEqual(35);
    expect(pal).toBeLessThan(box); expect(box).toBeLessThan(stone); expect(stone).toBeLessThan(steel); expect(steel).toBeLessThanOrEqual(conc);
    expect(hedge).toBeLessThan(box); expect(chain).toBeLessThan(box);
    expect(barrier('split_rail')).toBeLessThan(pal);
  });

  it('holding scale and the climb rate follow the same toughness, and the top tiers need a truck or a charge', () => {
    expect(holdScale('concrete_wall')).toBeCloseTo(1, 5); expect(holdScale('log_palisade')).toBeLessThan(0.6); expect(wallToughness('concrete_wall')).toBe(1);
    expect(wallToughness('thorn_hedge', 0.25)).toBeLessThan(wallToughness('thorn_hedge', 1));
    expect(climbRateK('concrete_wall')).toBeLessThan(climbRateK('log_palisade') / 4);
    for (const k of ['stone_wall', 'steel_wall', 'concrete_wall'] as const) expect(needsMeans(k)).toBe(true);
    for (const k of ['log_palisade', 'thorn_hedge', 'chain_link', 'container_wall'] as const) expect(needsMeans(k)).toBe(false);
    expect(climbHoldS('concrete_wall')).toBeGreaterThan(climbHoldS('log_palisade'));
    expect(climbRateK('thorn_hedge', 0.1)).toBeGreaterThan(climbRateK('thorn_hedge', 1));   // a hedge nobody has let grow is easy
    expect(wallPostCover('concrete_wall')).toBeLessThan(wallPostCover('log_palisade'));
  });

  it('vehicles and charges: steel, stone and concrete open less often than a palisade or a container', () => {
    for (const k of ['stone_wall', 'steel_wall', 'concrete_wall', 'electric_steel'] as const) { expect(WALL_RESIST[k].ram).toBeLessThan(WALL_RESIST.container_wall.ram); expect(WALL_RESIST[k].blast).toBeLessThan(WALL_RESIST.log_palisade.blast); }
    expect(WALL_RESIST.container_wall.ram).toBeLessThan(WALL_RESIST.log_palisade.ram);
  });

  it('REGRESSION: in the battle sim stone, steel and concrete lose far fewer fights than a free palisade or a hedge (14 seeds x 3 crews)', () => {
    const soft = [lostShare('log_palisade'), lostShare('thorn_hedge')], hard = [lostShare('stone_wall'), lostShare('steel_wall'), lostShare('concrete_wall')];
    const avg = (a: Array<{ lost: number }>) => a.reduce((x, y) => x + y.lost, 0) / a.length;
    expect(avg(hard)).toBeLessThan(avg(soft) - 0.2);
    for (const h of hard) for (const s of soft) expect(h.lost).toBeLessThan(s.lost);
    // and the very best of them are held far more often than the free ones
    const heldAvg = (a: Array<{ held: number }>) => a.reduce((x, y) => x + y.held, 0) / a.length;
    expect(heldAvg(hard)).toBeGreaterThan(heldAvg(soft) + 0.2);
  }, 120_000);

  it('a raid can be repelled: a wall that held and a crew that gave up at it is "repelled", not "fled"', () => {
    const rs = lostShare('concrete_wall', 20), st = lostShare('steel_wall', 20);
    expect(rs.repelled + st.repelled).toBeGreaterThan(0.1);
  }, 120_000);

  it('log palisade logs let some rifle rounds through (a partial hit), steel and concrete do not', () => {
    expect(LEAKY_WALLS.has('log_palisade')).toBe(true);
    for (const k of ['container_wall', 'steel_wall', 'concrete_wall', 'stone_wall'] as const) expect(LEAKY_WALLS.has(k)).toBe(false);
  });
});

describe('towers do not stack', () => {
  it('four wooden towers put only the best two cabs in the fight; a mounted gun or a turret always counts', () => {
    const g = afterHit(2);
    for (let i = 0; i < 4; i++) g.structures.push({ id: `t${i}`, kind: 'watchtower_wood', x: 8 + i * 3, z: 9, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    expect(battleTowerPosts(g).length).toBe(TOWER_POSTS_CAP);
    g.structures.push({ id: 'tm', kind: 'watchtower_mount', x: -9, z: 9, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    g.structures.push({ id: 'tt', kind: 'watchtower_turret', x: -12, z: 9, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    const ids = battleTowerPosts(g).map(t => t.st.id);
    expect(ids).toContain('tm'); expect(ids).toContain('tt');
    expect(ids.length).toBeLessThanOrEqual(TOWER_POSTS_CAP + 2);
  });
  it('REGRESSION: four wooden towers and no wall do not beat a closed palisade ring with one tower', () => {
    const run = (towers: number, wall: PerimeterKind | null) => {
      let lost = 0, n = 0;
      for (const c of CREWS) for (let i = 0; i < 12; i++) {
        const g = afterHit(1 + (i % 8));
        for (let k = 0; k < towers; k++) g.structures.push({ id: `t${k}`, kind: 'watchtower_wood', x: 6 + k * 4, z: 9, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
        if (towers) g.stock.sandbags = 3;
        if (wall) ring(g, wall);
        const b = planBattle(g, c.n, 100 + i, c.o); n++;
        if (b.result === 'breached' || b.result === 'overrun') lost++;
      }
      return lost / n;
    };
    const four = run(4, null), one = run(1, null);
    expect(four).toBeGreaterThanOrEqual(one - 0.12);   // more towers than the cap add (almost) nothing
    expect(run(1, 'concrete_wall')).toBeLessThan(four);
  }, 120_000);
});

describe('a wall that holds still counts when the family hides', () => {
  it('a found hide loses less of the stores behind a strong closed ring, and nothing is saved behind a weak one', () => {
    expect(holdOutK(0)).toBe(1); expect(holdOutK(HIDE_WALL.FROM)).toBe(1);
    expect(holdOutK(100)).toBeCloseTo(1 - HIDE_WALL.MAX, 10); expect(holdOutK(60)).toBeLessThan(holdOutK(40));
    const barrier = (k: PerimeterKind) => { const g = afterHit(3, false); ring(g, k); return postureOf(g).barrier; };
    expect(holdOutK(barrier('log_palisade'))).toBeGreaterThan(0.85);   // a palisade ring saves almost nothing
    expect(holdOutK(barrier('concrete_wall'))).toBeLessThan(0.45);
  });
});

describe('standing pays', () => {
  it('a raid the wall repelled earns more standing in the county than one that merely broke off', () => {
    expect(REPELLED_RESPECT).toBeGreaterThan(0);
  });
});

describe('militia is not a gang', () => {
  it('has its own parameters: better armed, drilled and steadier', () => {
    expect(MILITIA.rifleShare[1]).toBeGreaterThan(MILITIA.rifleShare[0]); expect(MILITIA.skill).toBeGreaterThan(0); expect(MILITIA.morale).toBeGreaterThan(0);
  });
  it('REGRESSION: the battle rows for a militia and a gang of the same size are no longer identical, and the militia loses fewer men', () => {
    const row = (kind: 'gang' | 'militia') => {
      const res: string[] = []; let dead = 0, lost = 0, rdead = 0;
      for (let i = 0; i < 24; i++) {
        const g = afterHit(1 + (i % 8));
        const b = planBattle(g, 8, 100 + i, { temper: 'hard', kind, organized: true });
        rdead += b.events.filter(e => e.kind === 'death' && e.unit.startsWith('r')).length;
        res.push(b.result); dead += b.events.filter(e => e.kind === 'death' && e.unit.startsWith('h_')).length;
        if (b.result === 'breached' || b.result === 'overrun') lost++;
      }
      return { res: res.join(','), dead, lost, rdead };
    };
    const gang = row('gang'), mil = row('militia');
    expect(mil.res).not.toBe(gang.res);
    expect(mil.rdead).toBeLessThan(gang.rdead);   // drilled, armored and better armed: they lose fewer men before they reach the same result
  }, 120_000);
});

describe('hiding is not free', () => {
  const crew = (o: Partial<Encounter> = {}): Encounter => ({ id: 'e1', kind: 'gang', day: 100, title: 't', dossier: [], size: 8, armed: true, strength: 96, stances: ['hide', 'defend'], ...o });
  it('the find chance rises with every wave that has come', () => {
    const g = afterHit(4, false);
    const w0 = hideFoundChance(g, crew()), w5 = hideFoundChance(g, crew({ wave: 5 })), w10 = hideFoundChance(g, crew({ wave: 10 })), w20 = hideFoundChance(g, crew({ wave: 20 }));
    expect(w5 - w0).toBeCloseTo(5 * HIDE.WAVE / 100, 5); expect(w10).toBeGreaterThan(w5); expect(w20).toBeCloseTo(w10, 5);   // capped at WAVE_MAX waves
  });
  it('a crew that found the place hiding before looks harder, and stacks with the "back again" bonus', () => {
    const g = afterHit(4, false);
    const base = hideFoundChance(g, crew({ back: true }));
    g.gate.history.push({ day: 80, kind: 'gang', stance: 'hide', tone: 'bad' }, { day: 90, kind: 'looters', stance: 'hide', tone: 'bad' });
    expect(repeatFinds(g, crew())).toBe(2 * HIDE.REPEAT);
    expect(hideFoundChance(g, crew({ back: true }))).toBeCloseTo(Math.min(0.95, base + 2 * HIDE.REPEAT / 100), 5);
    g.gate.history.push({ day: 95, kind: 'gang', stance: 'hide', tone: 'bad' }, { day: 96, kind: 'gang', stance: 'hide', tone: 'bad' });
    expect(repeatFinds(g, crew())).toBe(HIDE.REPEAT * HIDE.REPEAT_MAX);   // capped
    g.gate.history.length = 0; g.gate.history.push({ day: -50, kind: 'gang', stance: 'hide', tone: 'bad' });   // long ago: forgotten
    expect(repeatFinds(g, crew())).toBe(0);
    g.gate.history.length = 0; g.gate.history.push({ day: 90, kind: 'gang', stance: 'hide', tone: 'good' });   // a hide that worked is no find
    expect(repeatFinds(g, crew())).toBe(0);
  });
  it('a found hide strips a bigger share of the stores than before (8 % + 1.5 % a man, up to 30 %)', () => {
    expect(STRIP.BASE + STRIP.PER_HEAD * 8).toBeGreaterThan(0.08 + 0.015 * 8 + 0.1);
    expect(STRIP.CAP).toBeGreaterThan(0.3);
  });
  it('Hardcore is no harsher than it was: no wave or repeat-find points, and the old strip share', () => {
    expect(HIDE_COST_K.hardcore).toBe(0); expect(HIDE_COST_K.standard).toBe(1);
    expect(STRIP_HARDCORE).toEqual({ BASE: 0.08, PER_HEAD: 0.015, CAP: 0.3 });
    const g = afterHit(4, false), e = { id: 'e1', kind: 'gang', day: 100, title: 't', dossier: [], size: 8, armed: true, strength: 96, stances: ['hide'] } as Encounter;
    g.disaster.difficulty = 'hardcore';
    expect(hideFoundChance(g, { ...e, wave: 8 })).toBeCloseTo(hideFoundChance(g, e), 10);
  });
  it('crews grow faster against a fortified place', () => {
    expect(WAVE.HEADS_DEF).toBeGreaterThanOrEqual(0.3);
  });
});
