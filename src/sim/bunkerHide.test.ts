import { describe, expect, it } from 'vitest';
import { place } from './raidTestKit';
import { bunkerFindChance, dayFindChance, drainStores, entranceOf, fightBunker, hidePreview, hideSupplies, stayDays } from './bunkerHide';
import { resolve, type Encounter } from './encounters';
import { stageRaid } from './raidCutscene';
import type { GameState } from './state';
import { mulberry32 } from './rng';

const bunker = (g: GameState, kind = 'bunker_hatch', hardening?: { fallout?: 0 | 1 | 2 | 3; blast?: 0 | 1 | 2 | 3 }): void => {
  g.structures.push({ id: 'bk', kind, x: 3, z: 3, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0, ...(hardening ? { hardening } : {}) } as never);
  g.structures.push({ id: 'bkc', kind: 'bunker_comms', x: 5, z: 3, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 } as never);
};
const crew = (o: Partial<Encounter> = {}): Encounter => ({ id: 'e1', kind: 'gang', day: 9, title: 'A crew', dossier: [], size: 6, armed: true, strength: 90, wants: { canned: 5 }, stances: ['hide', 'defend'], temper: 'hard', ...o } as Encounter);
const disarm = (g: GameState): void => { g.armory.guns = []; g.armory.ammo = {}; if (g.tools) g.tools.items = []; };
const arm = (g: GameState): void => {
  g.armory.guns = []; g.armory.ammo = { '556': 400 };
  for (const [i, p] of g.people.entries()) if (!p.kid) g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id });
};

describe('the cost of hiding', () => {
  it('drains stored food and water at a real rate per person per day', () => {
    const g = place(3, 'standard', 'bare'); bunker(g);
    g.stock.canned = 40; g.stock.staples = 0; g.stock.frozen = 0; g.stock.fresh = 0; g.utilities.storedL = 1000; g.stock.water_jugs = 0;
    const sup = hideSupplies(g);
    expect(sup.litersPerDay).toBe(sup.people * 10);
    const before = { c: g.stock.canned, w: g.utilities.storedL };
    const used = drainStores(g, 2);
    expect(used.liters).toBeCloseTo(sup.litersPerDay * 2, 3);
    expect(g.utilities.storedL).toBeCloseTo(before.w - used.liters, 3);
    expect(before.c - g.stock.canned).toBeGreaterThan(0);
    expect(used.kcal).toBeGreaterThan(sup.kcalPerDay * 1.9);
  });
  it('is not viable with nothing stored, and the card says so', () => {
    const g = place(3, 'standard', 'bare'); bunker(g);
    Object.assign(g.stock, { canned: 0, staples: 0, frozen: 0, fresh: 0, water_jugs: 0 }); g.utilities.storedL = 0;
    expect(hideSupplies(g).viable).toBe(false);
    expect(hidePreview(g, crew(), 0.5).viable).toBe(false);
    g.gate.pending = crew();
    const o = resolve(g, 'hide');
    expect(o.lines.join(' ')).toMatch(/nothing stored/);
  });
  it('never takes more than is there', () => {
    const g = place(3, 'standard', 'bare'); bunker(g);
    g.stock.canned = 1; g.utilities.storedL = 5;
    const u = drainStores(g, 3);
    expect(g.stock.canned).toBeGreaterThanOrEqual(0); expect(g.utilities.storedL).toBeGreaterThanOrEqual(0);
    expect(u.shortWater).toBe(true);
  });
});

describe('the find chance', () => {
  const e = crew();
  it('falls as the entrance is better hidden: stairs > hatch > floor hatch', () => {
    const p = (k: string) => { const g = place(3, 'standard', 'bare'); bunker(g, k); return dayFindChance(g, e, 1); };
    expect(p('bunker_stairs')).toBeGreaterThan(p('bunker_hatch'));
    expect(p('bunker_hatch')).toBeGreaterThan(p('bunker_floorhatch'));
  });
  it('falls with every hardening tier', () => {
    let last = Infinity;
    for (const t of [0, 1, 2, 3] as const) { const g = place(3, 'standard', 'bare'); bunker(g, 'bunker_hatch', { fallout: t, blast: t }); const p = dayFindChance(g, e, 1); expect(p).toBeLessThan(last); last = p; }
  });
  it('rises with noise, dogs, a crew with dogs, crew size and each day of searching', () => {
    const base = place(3, 'standard', 'bare'); bunker(base);
    const p0 = dayFindChance(base, e, 1);
    const gen = place(3, 'standard', 'bare'); bunker(gen); gen.utilities.report.genKwh = 3;
    expect(dayFindChance(gen, e, 1)).toBeGreaterThan(p0);
    expect(dayFindChance(base, crew({ scouted: 'a scout' } as never), 1)).toBeGreaterThan(p0);
    expect(dayFindChance(base, crew({ size: 12 }), 1)).toBeGreaterThan(p0);
    expect(dayFindChance(base, e, 3)).toBeGreaterThan(p0);
    expect(dayFindChance(base, crew({ temper: 'savage' }), 1)).toBeGreaterThan(p0);
    const ent = entranceOf(base)!;
    const t1 = bunkerFindChance(base, e, 1, ent).total, t3 = bunkerFindChance(base, e, 3, ent).total;
    expect(t3).toBeGreaterThan(t1); expect(t3).toBeLessThan(1);
  });
  it('longer crews stay longer', () => {
    expect(stayDays({ kind: 'looters' })).toBe(1);
    expect(stayDays({ kind: 'gang', temper: 'savage' })).toBe(3);
    expect(stayDays({ kind: 'horde' })).toBe(3);
  });
});

describe('the fight at the choke point', () => {
  const fighters = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `f${i}`, gun: { cal: '556' as const, w: 1, auto: false, gunId: `g${i}` }, melee: 0 }));
  const win = (hardness: number, width: number, men: number, runs = 300) => {
    let w = 0;
    for (let k = 0; k < runs; k++) if (fightBunker({ men, gunned: true, temper: 'hard', width, hardness, fighters: fighters(2), ammo: { '556': 300 } }, mulberry32(k + 1)).result !== 'overrun') w++;
    return w / runs;
  };
  it('a harder door and a narrower stairwell favor the family', () => {
    expect(win(90, 1, 8)).toBeGreaterThanOrEqual(win(0, 1, 8));
    expect(win(50, 1, 8)).toBeGreaterThanOrEqual(win(50, 2, 8));
  });
  it('armed defenders at a hardened choke point beat a small crew most of the time', () => { expect(win(70, 1, 5)).toBeGreaterThan(0.8); });
  it('defenders with no guns and no tools lose', () => {
    let lost = 0;
    for (let k = 0; k < 100; k++) if (fightBunker({ men: 6, gunned: true, temper: 'hard', width: 2, hardness: 30, fighters: [{ id: 'a', gun: null, melee: 0 }], ammo: {} }, mulberry32(k + 1)).result === 'overrun') lost++;
    expect(lost).toBeGreaterThan(60);
  });
});

describe('end to end: a family hides, the crew finds the bunker', () => {
  const setup = (armed: boolean, seed: number, temper: 'hard' | 'desperate' = 'hard') => {
    const g = place(seed, 'standard', 'bare'); bunker(g, 'bunker_stairs');
    Object.assign(g.stock, { canned: 60, staples: 20, frozen: 0, fresh: 0, water_jugs: 40 }); g.utilities.storedL = 800;
    if (armed) arm(g); else disarm(g);
    g.gate.pending = crew({ temper, size: 6, kind: temper === 'desperate' ? 'looters' : 'gang' });
    return g;
  };
  /** Force the house and the bunker to be found by making the crew huge and savage-hunted (scouted) and every roll low: run many seeds and pick found ones. */
  const runs = (armed: boolean, temper: 'hard' | 'desperate' = 'hard') => {
    const found: Array<{ g: GameState; o: ReturnType<typeof resolve> }> = [];
    for (let s = 1; s <= 120; s++) {
      const g = setup(armed, s, temper); g.gate.pending!.scouted = 'a scout' as never; g.gate.pending!.back = true;
      const o = resolve(g, 'hide');
      if (o.bunker && o.bunker.fight !== 'hidden') found.push({ g, o });
    }
    return found;
  };
  it('unarmed: the crew loots the bunker and hostile crews kill or take people', () => {
    const f = runs(false);
    expect(f.length).toBeGreaterThan(5);
    const loot = f.filter(x => x.o.bunker!.fight === 'loot');
    expect(loot.length).toBeGreaterThan(0);
    for (const x of loot) expect(x.o.tone).toBe('bad');
    const harmed = loot.filter(x => x.g.personState.some(p => p.needs.died != null));
    expect(harmed.length).toBeGreaterThan(0);
  });
  it('armed: a shootout happens at the stairs, and the family does better than unarmed', () => {
    const a = runs(true), u = runs(false);
    const shoot = a.filter(x => x.o.bunker!.fight === 'shootout');
    expect(shoot.length).toBeGreaterThan(3);
    const dead = (xs: typeof a) => xs.reduce((n, x) => n + x.g.personState.filter(p => p.needs.died != null).length, 0) / Math.max(1, xs.length);
    expect(dead(a)).toBeLessThan(dead(u));
    expect(shoot.some(x => x.o.lines.some(l => /fired first/.test(l)))).toBe(true);
  });
  it('merciful crews never harm a child below', () => {
    const f = runs(false, 'desperate');
    for (const x of f) x.g.people.forEach((p, i) => { if (p.kid) expect(x.g.personState[i].needs.died).toBeNull(); });
  });
  it('flows into the cutscene report: the staged raid names the find and what was lost', () => {
    for (let s = 1; s <= 120; s++) {
      const g = setup(false, s); g.gate.pending!.scouted = 'a scout' as never; g.gate.pending!.back = true;
      const st = stageRaid(g, 'hide');
      if (st.outcome.bunker?.fight === 'loot') {
        expect(st.report.title).toBe('They found the bunker');
        expect(st.report.killed.length + st.report.taken.length + st.report.wounded.length + st.report.lost.length).toBeGreaterThan(0);
        expect(st.battles.length).toBeGreaterThan(0);
        return;
      }
    }
    throw new Error('no found-bunker raid in 120 seeds');
  });
  it('hiding drains the stores even when they never find the place', () => {
    const g = setup(true, 4); const c0 = g.stock.canned, w0 = g.utilities.storedL + g.stock.water_jugs * 19;
    g.gate.pending!.kind = 'looters';
    resolve(g, 'hide');
    expect(g.stock.canned).toBeLessThan(c0);
    expect(g.utilities.storedL + g.stock.water_jugs * 19).toBeLessThan(w0);
  });
});
