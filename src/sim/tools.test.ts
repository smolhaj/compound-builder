import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { addWork, holdReason } from './construction';
import { planStructure } from './construction';
import { generateFamily, type Person } from './family';
import { migrate } from './save/migrations';
import { step } from './engine';
import { dayIndex } from './state';
import { mulberry32 } from './rng';
import { ensurePlaces, resolveRun, scavengeOf } from './scavenge';
import { barterPrices, have, trade } from './barter';
import { burgle } from './breakins';
import { bagOf } from './tradeGoods';
import { swapQty, tradeForTool } from './toolTrade';
import {
  bestTool, buyTool, condWord, coverage, efficiency, findTool, improvise, kitOf, MAKE_DO_DAYS, projectNeeds, readKit, repair, repairPlan, sharpen, sharpenAll,
  starterKit, taskSpeed, crowdRate, CROWD_FLOOR, GRADES, gradeOf, payUpkeep, stealTools, toolSecurity, workersOn, toolPrice, toolFor, toolHold, toolNote, toolsDay, toolShopOpen, TOOLS, wearTools, workSpeed, BARE_HANDS, newKit, type ToolKind, type ToolKit,
} from './tools';

const ctx = { power: true, fuel: 5 };
const dark = { power: false, fuel: 0 };
const mk = (kinds: Array<ToolKind | [ToolKind, number, number]>): ToolKit => {
  const kit = newKit();
  for (const k of kinds) { const [kind, cond, sharp] = Array.isArray(k) ? k : [k, 1, 1]; kit.items.push({ id: `t${kit.next++}`, kind, cond, sharp, max: 1, repairs: 0 }); }
  return kit;
};
const person = (id: string, skills: Partial<Person['skills']>, extra: Partial<Person> = {}): Person => ({
  id, first: id, last: 'X', age: 40, kid: false, body: 'm', shirt: 0, skills: { builder: 2, gardener: 2, medic: 2, mechanic: 2, hunter: 2, negotiator: 2, teacher: 2, radio: 2, ...skills }, ...extra,
});
const after = (days: number): GameState => {
  const g = newGame(3, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.clock.t = g.disaster.hitAt + days;
  g.disaster.tracks = { ...g.disaster.tracks, law: 0.4, stores: 0, deliveries: 0, banks: 0, fuel: 0, grid: 0 };
  g.utilities.lit = [];
  return g;
};

describe('requirements and speeds', () => {
  it('sawing a frame is required work: no saw, no framing', () => {
    const kit = mk(['hammer', 'shovel']);
    const sp = taskSpeed(kit, toolFor({ kind: 'build', stage: 'frame' }), ctx);
    expect(sp.blocked).toBe('cut');
    expect(sp.mult).toBe(0);
  });
  it('a soft role goes at half pace by hand and faster with the tool', () => {
    const none = taskSpeed(mk(['hand_saw', 'hammer']), toolFor({ kind: 'build', stage: 'roof' }), ctx);   // no screwdriver: fastening is soft
    const some = taskSpeed(mk(['hand_saw', 'hammer', 'screwdriver_set']), toolFor({ kind: 'build', stage: 'roof' }), ctx);
    expect(none.blocked).toBeNull();
    expect(none.mult).toBeLessThan(some.mult);
    expect(some.mult).toBeCloseTo(1, 5);
    expect(BARE_HANDS).toBe(0.5);
  });
  it('a power tool is faster than a hand tool, and only while there is power', () => {
    const hand = mk(['hand_saw', 'hammer', 'screwdriver_set']);
    const power = mk(['circular_saw', 'nail_gun', 'cordless_drill']);
    const task = toolFor({ kind: 'build', stage: 'frame' });
    expect(taskSpeed(power, task, ctx).mult).toBeGreaterThan(2 * taskSpeed(hand, task, ctx).mult);
    // the lights are out: a kit of only plug-in tools can't saw at all
    expect(taskSpeed(power, task, dark).blocked).toBe('cut');
    // …but with a hand saw and hammer beside them, the family falls back
    const both = mk(['circular_saw', 'hand_saw', 'hammer']);
    expect(taskSpeed(both, task, dark).mult).toBeGreaterThan(0.5);
    expect(taskSpeed(both, task, ctx).mult).toBeGreaterThan(taskSpeed(both, task, dark).mult);
  });
  it('a chainsaw needs gas', () => {
    const t = mk(['chainsaw', 'axe']).items[0];
    expect(efficiency(t, 'fell', { power: false, fuel: 1 })).toBeGreaterThan(3);
    expect(efficiency(t, 'fell', { power: false, fuel: 0 })).toBe(0);
    expect(bestTool(mk(['chainsaw', 'axe']), 'fell', { power: false, fuel: 0 })!.tool.kind).toBe('axe');
  });
  it('a dull, worn tool is slower than a keen one; a broken one does nothing', () => {
    const keen = mk([['hand_saw', 1, 1]]).items[0], dull = mk([['hand_saw', 0.4, 0.1]]).items[0], gone = mk([['hand_saw', 0, 1]]).items[0];
    expect(efficiency(keen, 'cut', ctx)).toBeCloseTo(1, 5);
    expect(efficiency(dull, 'cut', ctx)).toBeLessThan(0.7 * efficiency(keen, 'cut', ctx));
    expect(efficiency(gone, 'cut', ctx)).toBe(0);
  });
  it('the best tool for a role is the fastest usable one', () => {
    expect(bestTool(mk(['hand_saw', 'circular_saw']), 'cut', ctx)!.tool.kind).toBe('circular_saw');
    expect(bestTool(mk(['hand_saw', ['circular_saw', 0, 1]]), 'cut', ctx)!.tool.kind).toBe('hand_saw');
  });
  it('every task table sums to one and lists real roles', () => {
    for (const stage of ['site', 'foundation', 'frame', 'roof', 'finish'] as const) {
      expect(toolFor({ kind: 'build', stage }).reduce((a, n) => a + n.share, 0)).toBeCloseTo(1, 5);
    }
    for (const run of ['ditch', 'barbed_wire', 'water_pipe', 'thorn_hedge', 'log_palisade', 'split_rail', 'steel_wall']) {
      expect(toolFor({ kind: 'fence', run }).reduce((a, n) => a + n.share, 0)).toBeCloseTo(1, 5);
    }
    expect(toolFor({ kind: 'fell', stage: 'bucked' })).toEqual([]);
    expect(toolFor({ kind: 'garden' }).every(n => !n.req)).toBe(true);
  });
  it('a project lists the tools it will want, required first', () => {
    const needs = projectNeeds(['frame', 'roof']);
    expect(needs[0].req).toBe(true);
    expect(needs.map(n => n.role)).toContain('cut');
  });
});

describe('wear and breakage', () => {
  it('hours of use wear the tool and dull its edge, a dull tool wears faster', () => {
    const g = newGame(2);
    g.tools = mk(['hand_saw', 'hammer', 'screwdriver_set']);
    const saw = g.tools.items[0];
    wearTools(g, { kind: 'build', stage: 'frame' }, 100);
    expect(saw.cond).toBeLessThan(1);
    expect(saw.sharp).toBeLessThan(0.9);
    const keen = mk([['hand_saw', 1, 1]]), dullKit = mk([['hand_saw', 1, 0]]);
    const a = newGame(2), b = newGame(2);
    a.tools = keen; b.tools = dullKit;
    wearTools(a, { kind: 'fell', stage: 'felled' }, 50); wearTools(b, { kind: 'fell', stage: 'felled' }, 50);
    expect(b.tools.items[0].cond).toBeLessThan(a.tools.items[0].cond);
  });
  it('a tool breaks when its condition is gone, with a log line, and stays in the kit as parts', () => {
    const g = newGame(2);
    g.tools = mk([['hammer', 0.01, 1], 'hand_saw']);
    const broke = wearTools(g, { kind: 'build', stage: 'frame' }, 40);
    expect(broke).toContain('Claw hammer');
    expect(g.tools.items[0].cond).toBe(0);
    expect(g.tools.broke).toBe(1);
    expect(g.log.some(l => /gives out/.test(l.text))).toBe(true);
    expect(condWord(g.tools.items[0])).toBe('broken');
    expect(g.tools.items).toHaveLength(2);
  });
  it('a gas chainsaw burns fuel', () => {
    const g = newGame(2);
    g.tools = mk(['chainsaw']);
    g.stock.fuel = 3;
    wearTools(g, { kind: 'fell', stage: 'marked' }, 10);
    expect(g.stock.fuel).toBeCloseTo(3 - 0.4, 5);
  });
  it('a hand tool lasts for well over a thousand hours of steady use; a crude one about a hundred', () => {
    const hand = TOOLS.hammer.wear, crude = TOOLS.rock_hammer.wear;
    expect(1 / hand).toBeGreaterThan(1000);
    expect(1 / crude).toBeLessThan(200);
    expect(1 / crude).toBeGreaterThan(80);
  });
});

describe('sharpen, repair, improvise', () => {
  it('a whetstone puts back a razor edge, a river rock gets 80 %', () => {
    const g = newGame(2);
    g.tools = mk([['hand_saw', 1, 0.1], ['axe', 1, 0.2], 'whetstone']);
    expect(sharpen(g, 't1')).toBeNull();
    expect(g.tools.items[0].sharp).toBe(1);
    g.tools.items.pop();   // lose the stone
    expect(sharpen(g, 't2')).toBeNull();
    expect(g.tools.items[1].sharp).toBe(0.8);
  });
  it('honing grinds the metal away a little; some tools have no edge', () => {
    const g = newGame(2);
    g.tools = mk([['hand_saw', 1, 0.1], 'hammer', 'file']);
    sharpen(g, 't1');
    expect(g.tools.items[0].max).toBeLessThan(1);
    expect(sharpen(g, 't2')).toMatch(/no edge/);
  });
  it('sharpenAll only touches the dull ones', () => {
    const g = newGame(2);
    g.tools = mk([['hand_saw', 1, 0.1], ['axe', 1, 0.95], ['shovel', 1, 0.3], 'whetstone']);
    expect(sharpenAll(g)).toBe(2);
  });
  it('a repair takes hardware or parts from a broken tool, and leaves the tool weaker each time', () => {
    const g = newGame(2);
    g.tools = mk([['hammer', 0.1, 1]]);
    g.stock.hardware = 0;
    expect(repair(g, 't1')).toMatch(/hardware/);
    g.stock.hardware = 1;
    expect(repair(g, 't1')).toBeNull();
    expect(g.stock.hardware).toBeCloseTo(0.85, 5);
    const t = g.tools.items[0];
    expect(t.cond).toBeGreaterThan(0.4);
    expect(t.max).toBeCloseTo(0.88, 5);
    expect(t.repairs).toBe(1);
    // mend it five times and it tops out low
    for (let i = 0; i < 6; i++) { t.cond = 0.05; g.stock.hardware = 1; repair(g, 't1'); }
    expect(t.max).toBeGreaterThanOrEqual(0.35);
    expect(t.max).toBeLessThanOrEqual(0.4);
  });
  it('with no hardware at all, a broken tool is a donor of parts (and is used up)', () => {
    const g = newGame(2);
    g.tools = mk([['hammer', 0.2, 1], ['pliers', 0, 1]]);
    g.stock.hardware = 0;
    const plan = repairPlan(g, 't1');
    expect(plan.ok).toBe(true);
    expect(plan.uses).toMatch(/broken tool/);
    expect(repair(g, 't1')).toBeNull();
    expect(g.tools.items.map(t => t.kind)).toEqual(['hammer']);
  });
  it('a broken tool can be mended back to life', () => {
    const g = newGame(2);
    g.tools = mk([['hand_saw', 0, 0.3]]);
    g.stock.hardware = 1;
    expect(repair(g, 't1')).toBeNull();
    expect(g.tools.items[0].cond).toBeGreaterThan(0);
  });
  it('improvising always works: a stone axe fells a tree, slowly', () => {
    const g = newGame(2);
    g.tools = mk([]);
    expect(workSpeed(g, { kind: 'fell', stage: 'marked' })).toBe(0);
    const t = improvise(g, 'fell');
    expect(t.kind).toBe('stone_axe');
    const v = workSpeed(g, { kind: 'fell', stage: 'marked' });
    expect(v).toBeGreaterThan(0.2);
    expect(v).toBeLessThan(0.5);
  });
  it('every role has a crude tool that does it, so nothing is a dead end', () => {
    for (const role of ['cut', 'nail', 'fasten', 'dig', 'fell', 'till', 'wrench', 'wire'] as const) {
      const g = newGame(2);
      g.tools = mk([]);
      const t = improvise(g, role);
      expect(efficiency(t, role, dark)).toBeGreaterThan(0);
    }
  });
  it('scrap hardware makes a crude steel tool better', () => {
    const a = newGame(2), b = newGame(2);
    a.tools = mk([]); b.tools = mk([]);
    a.stock.hardware = 0; b.stock.hardware = 1;
    improvise(a, 'cut'); improvise(b, 'cut');
    expect(b.tools.items[0].cond).toBeGreaterThan(a.tools.items[0].cond);
    expect(b.stock.hardware).toBeCloseTo(0.95, 5);
  });
});

describe('making do', () => {
  it('after two days with no required tool the family makes one itself', () => {
    const g = newGame(2);
    g.tools = mk(['hammer', 'shovel', 'axe', 'wrench_set', 'pliers']);   // no saw
    g.clock.t = 10;
    expect(toolsDay(g)).toEqual([]);
    expect(g.tools.missing.cut).toBe(10);
    expect(toolHold(g, { kind: 'build', stage: 'frame' })).toMatch(/Needs a saw/);
    g.clock.t = 10 + MAKE_DO_DAYS;
    const lines = toolsDay(g);
    expect(lines.join(' ')).toMatch(/made do/);
    expect(g.tools.items.some(t => t.kind === 'scrap_saw')).toBe(true);
    expect(g.tools.missing.cut).toBeUndefined();
    expect(toolHold(g, { kind: 'build', stage: 'frame' })).toBeNull();
  });
  it('a chore of sharpening runs by itself (and can be turned off)', () => {
    const g = newGame(2);
    g.tools = mk([['hand_saw', 1, 0.2], 'hammer', 'shovel', 'axe', 'wrench_set', 'pliers', 'whetstone']);
    toolsDay(g);
    expect(g.tools.items[0].sharp).toBe(1);
    g.tools.items[0].sharp = 0.2; g.tools.care = false;
    toolsDay(g);
    expect(g.tools.items[0].sharp).toBe(0.2);
  });
  it('a plug-in saw with no power counts as no saw: the family makes a scrap one', () => {
    const g = after(5);
    g.tools = mk(['circular_saw', 'hammer', 'shovel', 'axe', 'wrench_set', 'pliers']);
    g.clock.t = 5;
    toolsDay(g); g.clock.t = 8;
    toolsDay(g);
    expect(g.tools.items.some(t => t.kind === 'scrap_saw')).toBe(true);
  });
  it('the hint and the project hold say what is needed', () => {
    const g = newGame(2);
    g.tools = mk(['hammer']);
    expect(toolNote(g, { kind: 'build', stage: 'frame' })).toMatch(/Needs a saw/);
    g.tools = mk(['hammer', 'hand_saw']);
    expect(toolNote(g, { kind: 'build', stage: 'frame' })).toMatch(/No screwdriver/);
    g.tools = mk(['hammer', 'hand_saw', 'screwdriver_set']);
    expect(toolNote(g, { kind: 'build', stage: 'frame' })).toBeNull();
  });
});

describe('the starter kit', () => {
  const roles = (k: ToolKit) => new Set(k.items.map(t => t.kind));
  it('everyone has the basics, and every required role is covered', () => {
    const k = starterKit([person('a', {}), person('b', {})], 1);
    for (const x of ['hammer', 'hand_saw', 'shovel', 'axe', 'wrench_set', 'pliers', 'screwdriver_set', 'whetstone'] as ToolKind[]) expect(roles(k).has(x)).toBe(true);
    expect(k.items.every(t => t.cond > 0.7 && t.cond <= 1)).toBe(true);
  });
  it('a carpenter\'s family has power tools; a family of office workers does not', () => {
    const carp = starterKit([person('a', { builder: 7 }, { job: { title: 'Carpenter', wage: 200 } }), person('b', {})], 1);
    const desk = starterKit([person('a', {}, { job: { title: 'Dispatcher', wage: 170 } }), person('b', {})], 1);
    expect(roles(carp).has('circular_saw')).toBe(true);
    expect(roles(carp).has('cordless_drill')).toBe(true);
    expect(roles(carp).has('nail_gun')).toBe(true);
    expect(roles(desk).has('circular_saw')).toBe(false);
    expect(carp.items.length).toBeGreaterThan(desk.items.length + 3);
  });
  it('a mechanic brings wrenches and a file, a gardener a fork, a hunter a chainsaw, a grandparent old tools', () => {
    expect(roles(starterKit([person('a', { mechanic: 6 })], 1)).has('bolt_cutters')).toBe(true);
    expect(roles(starterKit([person('a', { gardener: 6 })], 1)).has('garden_fork')).toBe(true);
    expect(roles(starterKit([person('a', { hunter: 7 })], 1)).has('chainsaw')).toBe(true);
    const gran = starterKit([person('a', {}), person('g', {}, { elder: true })], 1);
    expect(roles(gran).has('pick_mattock')).toBe(true);
    expect(gran.items.find(t => t.kind === 'pick_mattock')!.cond).toBeLessThan(0.82);
  });
  it('is seeded: the same family and seed give the same kit', () => {
    const f = generateFamily(9);
    expect(starterKit(f, 9)).toEqual(starterKit(f, 9));
    expect(starterKit(f, 9)).not.toEqual(starterKit(f, 10));
  });
  it('a new game carries one, and an old state reads one without storing it', () => {
    const g = newGame(5);
    expect(g.tools!.items.length).toBeGreaterThanOrEqual(9);
    delete g.tools;
    expect(readKit(g).items.length).toBeGreaterThanOrEqual(9);
    expect(g.tools).toBeUndefined();
    expect(kitOf(g)).toBe(g.tools);
  });
  it('a well-kept starter kit works at the blueprint pace (so existing build times hold)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = newGame(seed);
      for (const stage of ['site', 'foundation', 'frame', 'roof', 'finish'] as const) {
        const sp = workSpeed(g, { kind: 'build', stage });
        expect(sp).toBeGreaterThanOrEqual(0.99);
      }
      expect(workSpeed(g, { kind: 'fell', stage: 'marked' })).toBeGreaterThanOrEqual(0.99);
      expect(workSpeed(g, { kind: 'fence', run: 'barbed_wire' })).toBeGreaterThanOrEqual(0.99);
    }
  });
  it('a worn, dull kit slows the work', () => {
    const g = newGame(3);
    for (const t of g.tools!.items) { t.cond = 0.2; t.sharp = 0.1; }
    expect(workSpeed(g, { kind: 'build', stage: 'frame' })).toBeLessThan(0.75);
    expect(workSpeed(g, { kind: 'build', stage: 'frame' })).toBeGreaterThan(0.3);
  });
  it('covers every role with a usable tool', () => {
    const g = newGame(5);
    const cov = coverage(g);
    for (const r of ['cut', 'nail', 'fasten', 'dig', 'fell', 'till', 'wrench', 'wire']) expect(cov.find(c => c.role === r)!.tool).not.toBeNull();
  });
});

describe('work in the sim', () => {
  const frameJob = () => {
    const g = newGame(4);
    g.stock.lumber = 50; g.stock.hardware = 5; g.stock.concrete = 50; g.stock.roofing = 50; g.stock.fieldstone = 50; g.stock.rebar = 50; g.stock.logs = 50;
    const st = planStructure(g, 'timber_cabin', 0, 0, 0);
    return { g, st };
  };
  it('the family\'s tools speed up its own work and wear; a crew\'s work is unchanged', () => {
    const { g, st } = frameJob();
    st.stage = 2;   // frame
    g.tools = mk(['circular_saw', 'nail_gun', 'cordless_drill']);
    g.utilities.lit = ['x'];
    const fast = addWork(g, st, 1, true);
    expect(fast).toBe(1);
    const doneFast = st.done;
    const { g: h, st: s2 } = frameJob();
    s2.stage = 2; h.tools = mk(['circular_saw', 'nail_gun', 'cordless_drill']); h.utilities.lit = ['x'];
    addWork(h, s2, 1);   // not own
    expect(doneFast).toBeGreaterThan(2 * s2.done);
    expect(g.tools.hours).toBeGreaterThan(0);
    expect(h.tools.hours).toBe(0);
  });
  it('without a saw the frame does not go up, and the project says why', () => {
    const { g, st } = frameJob();
    st.stage = 2;
    g.tools = mk(['hammer']);
    expect(holdReason(g, st)).toMatch(/Needs a saw/);
    expect(addWork(g, st, 5, true)).toBe(0);
    expect(st.done).toBe(0);
  });
  it('the engine builds with the kit and the family cobbles a saw if there is none', () => {
    const { g, st } = frameJob();
    st.stage = 2;
    g.tools = mk(['hammer', 'shovel', 'axe', 'wrench_set', 'pliers']);
    g.clock.t = 0.25;
    const out = step(g, 6);
    expect(out.tools!.items.some(t => t.kind === 'scrap_saw')).toBe(true);
    expect(out.structures[0].stage * 1000 + out.structures[0].done).toBeGreaterThan(2000);
  });
  it('felling needs an axe or a saw; it goes faster with a chainsaw', () => {
    const none = newGame(1); none.tools = mk([]);
    const axe = newGame(1); axe.tools = mk(['axe']);
    const saw = newGame(1); saw.tools = mk(['chainsaw']); saw.stock.fuel = 2;
    expect(workSpeed(none, { kind: 'fell', stage: 'marked' })).toBe(0);
    expect(workSpeed(axe, { kind: 'fell', stage: 'marked' })).toBeCloseTo(1, 5);
    expect(workSpeed(saw, { kind: 'fell', stage: 'marked' })).toBeGreaterThan(3);
  });
  it('deterministic: stepping the same game twice gives the same kit', () => {
    const { g } = frameJob();
    const a = step(g, 5), b = step(g, 5);
    expect(a.tools).toEqual(b.tools);
    const c = step(step(g, 2), 3);
    expect(c.tools).toEqual(a.tools);
  });
});

describe('after the collapse', () => {
  it('the shop sells while the stores are open and not after', () => {
    const g = newGame(2);
    expect(toolShopOpen(g)).toBe(true);
    const n = g.tools!.items.length, m = g.money;
    expect(buyTool(g, 'chainsaw')).toBeNull();
    expect(g.tools!.items.length).toBe(n + 1);
    expect(g.money).toBeLessThan(m);
    expect(g.tools!.items[n].cond).toBe(1);
    const h = after(10);
    expect(toolShopOpen(h)).toBe(false);
    expect(buyTool(h, 'hammer')).toMatch(/closed/);
    expect(buyTool(g, 'stone_axe')).toMatch(/not sold/);
  });
  it('cash from the safe pays when the banks are shut but the stores are open', () => {
    const g = newGame(2);
    g.disaster.tracks = { ...g.disaster.tracks, banks: 0, stores: 1 };
    g.fin.cash = 100; const m = g.money;
    expect(buyTool(g, 'hand_saw')).toBeNull();
    expect(g.money).toBe(m);
    expect(g.fin.cash).toBeLessThan(100);
    g.fin.cash = 1;
    expect(buyTool(g, 'chainsaw')).toMatch(/enough/);
  });
  it('a scavenging run to the hardware store turns up used tools', () => {
    let got = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const g = after(20);
      g.people = generateFamily(seed); 
      ensurePlaces(g);
      const team = g.people.filter(p => !p.kid).map(p => p.id);
      const before = g.tools!.items.length;
      resolveRun(g, { place: 'pl_hardware', team, mode: 'truck', roe: 'talk', left: dayIndex(g.clock.t), back: dayIndex(g.clock.t) + 1 });
      got += g.tools!.items.length - before;
    }
    expect(got).toBeGreaterThan(0);
    expect(scavengeOf(after(1)).places).toEqual([]);
  });
  it('found tools are used and mixed in quality, and seeded', () => {
    const g = newGame(1);
    const a = findTool(g, mulberry32(3)), b = findTool(newGame(1), mulberry32(3));
    expect(a.kind).toBe(b.kind);
    expect(a.cond).toBeLessThan(0.95);
    expect(TOOLS[a.kind].price).not.toBeNull();
  });
  it('the crossroads market trades trade goods for a used tool', () => {
    const g = after(120);
    const bag = bagOf(g); bag.salt = 40; bag.coffee = 5;
    const need = swapQty(g, 'hand_saw', 'salt');
    expect(need).toBeGreaterThan(1);
    expect(swapQty(g, 'hand_saw', 'coffee')).toBeLessThan(need);
    const n = g.tools!.items.length;
    expect(tradeForTool(g, 'hand_saw', 'salt')).toBeNull();
    expect(g.tools!.items.length).toBe(n + 1);
    expect(bagOf(g).salt).toBe(40 - need);
    bagOf(g).salt = 0;
    expect(tradeForTool(g, 'hand_saw', 'salt')).toMatch(/Needs/);
    expect(tradeForTool(g, 'stone_axe', 'salt')).toMatch(/Nobody/);
    const early = after(5);
    bagOf(early).salt = 99;
    expect(tradeForTool(early, 'hand_saw', 'salt')).toMatch(/not open/);
  });
  it('whole kit gone, no stores: the family still builds, with crude tools', () => {
    const g = after(30);
    g.tools = mk([]);
    g.stock.lumber = 50; g.stock.hardware = 3;
    const st = planStructure(g, 'timber_cabin', 0, 0, 0);
    st.stage = 2;
    g.clock.t = Math.ceil(g.clock.t) + 0.25;
    const out = step(g, 8);
    expect(out.tools!.made).toBeGreaterThanOrEqual(2);
    const s2 = out.structures.find(x => x.id === st.id)!;
    expect(s2.stage + s2.done / 1000).toBeGreaterThan(2);
  });
});

describe('save', () => {
  it('a v44 save gets a starter kit from its family and trades', () => {
    const g = newGame(7) as unknown as Record<string, unknown>;
    const old: Record<string, unknown> = { ...g, version: 44 }; delete old.tools;
    const up = migrate(old);
    expect(up.version).toBe(45);
    expect(up.tools!.items.length).toBeGreaterThanOrEqual(9);
    expect(up.tools).toEqual(starterKit(up.people, up.seed));
  });
  it('a save that already has a kit keeps it', () => {
    const g = newGame(7);
    g.tools!.items[0].cond = 0.123;
    const up = migrate({ ...(structuredClone(g) as unknown as Record<string, unknown>), version: 44 });
    expect(up.tools!.items[0].cond).toBe(0.123);
  });
});



describe('a shared toolbox', () => {
  const frame = toolFor({ kind: 'build', stage: 'frame' });
  it('three people framing with one saw each run at about a third', () => {
    const kit = mk(['hand_saw', 'hammer', 'hammer', 'hammer', 'screwdriver_set']);
    const one = taskSpeed(kit, frame, ctx, 1).mult, three = taskSpeed(kit, frame, ctx, 3);
    expect(three.mult).toBeLessThan(0.6 * one);
    expect(three.mult).toBeGreaterThan(0.3 * 0.9 * one * 0.5);
    expect(crowdRate(kit, 'cut', ctx, 3, 1)).toBeCloseTo(Math.max(CROWD_FLOOR, 1 / 3), 5);
  });
  it('extra tools of the role lift it back up', () => {
    const few = mk(['hand_saw', 'hammer', 'screwdriver_set']), more = mk(['hand_saw', 'hand_saw', 'hand_saw', 'hammer', 'hammer', 'hammer', 'screwdriver_set', 'screwdriver_set', 'screwdriver_set']);
    expect(taskSpeed(more, frame, ctx, 3).mult).toBeCloseTo(taskSpeed(few, frame, ctx, 1).mult, 5);
    expect(taskSpeed(more, frame, ctx, 3).mult).toBeGreaterThan(2 * taskSpeed(few, frame, ctx, 3).mult);
  });
  it('a power saw and a hand saw serve two framers at the average', () => {
    expect(crowdRate(mk(['circular_saw', 'hand_saw']), 'cut', ctx, 2, 2.5)).toBeCloseTo((2.5 + 1) / 2, 5);
  });
  it('never below the floor, and one worker is unchanged', () => {
    const kit = mk(['hand_saw']);
    expect(crowdRate(kit, 'cut', ctx, 20, 1)).toBe(CROWD_FLOOR);
    expect(crowdRate(kit, 'cut', ctx, 1, 1)).toBe(1);
  });
  it('counts the people at work from the state', () => {
    const g = newGame(2);
    for (const ps of g.personState) ps.task = 'build';
    expect(workersOn(g, { kind: 'build', stage: 'frame' })).toBe(g.people.length);
    expect(workersOn(g, { kind: 'fell', stage: 'marked' })).toBe(1);
    g.personState[0].task = 'idle';
    expect(workersOn(g, { kind: 'fence', run: 'ditch' })).toBe(g.people.length - 1);
  });
  it('a starter kit has enough plain tools for the working hands, so the family builds at pace', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const g = newGame(seed);
      for (const ps of g.personState) ps.task = 'build';
      const w = workersOn(g, { kind: 'build', stage: 'frame' });
      if (w > 4) continue;
      expect(workSpeed(g, { kind: 'build', stage: 'frame' })).toBeGreaterThan(0.6);
    }
  });
});

describe('upkeep takes work time', () => {
  it('sharpening costs some of the next hours of work, and can be turned off', () => {
    const g = newGame(2);
    g.tools = mk([['hand_saw', 1, 0.1], ['axe', 1, 0.1], 'hammer', 'shovel', 'wrench_set', 'pliers', 'whetstone']);
    toolsDay(g);
    expect(g.tools.owed).toBeCloseTo(0.4, 5);
    expect(payUpkeep(g, 0.1)).toBe(0);
    expect(payUpkeep(g, 1)).toBeCloseTo(0.7, 5);
    expect(g.tools.owed).toBeCloseTo(0, 5);
    const h = newGame(2);
    h.tools = mk([['hand_saw', 1, 0.1], 'hammer', 'shovel', 'axe', 'wrench_set', 'pliers']);
    h.tools.care = false;
    toolsDay(h);
    expect(h.tools.owed ?? 0).toBe(0);
  });
  it('the owed hours come out of the family\'s own work', () => {
    const g = newGame(4);
    g.stock.lumber = 50; g.stock.hardware = 5; g.stock.concrete = 50;
    const st = planStructure(g, 'timber_cabin', 0, 0, 0);
    st.stage = 2;
    g.tools!.owed = 0.5;
    addWork(g, st, 1, true);
    const a = st.done;
    const h = newGame(4); h.stock.lumber = 50; h.stock.hardware = 5; h.stock.concrete = 50;
    const s2 = planStructure(h, 'timber_cabin', 0, 0, 0); s2.stage = 2;
    addWork(h, s2, 1, true);
    expect(a).toBeCloseTo(s2.done * 0.5, 4);
  });
});

describe('grades', () => {
  it('pro costs 2.5x and lasts twice as long', () => {
    const g = newGame(2);
    expect(toolPrice(g, 'hand_saw', 'pro')).toBe(Math.round(25 * 2.5));
    const a = newGame(2), b = newGame(2);
    a.tools = mk(['hand_saw', 'hammer', 'screwdriver_set']); b.tools = mk(['hand_saw', 'hammer', 'screwdriver_set']);
    b.tools.items[0].grade = 'pro';
    wearTools(a, { kind: 'build', stage: 'frame' }, 100); wearTools(b, { kind: 'build', stage: 'frame' }, 100);
    expect(1 - b.tools.items[0].cond).toBeCloseTo((1 - a.tools.items[0].cond) * GRADES.pro.wear, 3);
  });
  it('the shop sells both grades', () => {
    const g = newGame(2);
    const n = g.tools!.items.length, m = g.money;
    expect(buyTool(g, 'chainsaw', 'pro')).toBeNull();
    expect(gradeOf(g.tools!.items[n])).toBe('pro');
    expect(m - g.money).toBe(toolPrice(g, 'chainsaw', 'pro'));
    expect(buyTool(g, 'hammer')).toBeNull();
    expect(gradeOf(g.tools!.items[n + 1])).toBe('cheap');
  });
  it('starter and found kits are a mix', () => {
    let pro = 0, cheap = 0;
    for (let seed = 1; seed <= 20; seed++) for (const t of newGame(seed).tools!.items) { if (gradeOf(t) === 'pro') pro++; else cheap++; }
    expect(pro).toBeGreaterThan(20);
    expect(cheap).toBeGreaterThan(pro);
    const g = newGame(1), r = mulberry32(5);
    const found = Array.from({ length: 60 }, () => gradeOf(findTool(g, r)));
    expect(found).toContain('pro'); expect(found).toContain('cheap');
  });
});

describe('barter and theft', () => {
  it('a used tool is a good in a neighbor trade, both ways', () => {
    const g = after(60);
    g.neighbors[0].status = 'home'; g.neighbors[0].disposition = 80; g.neighbors[0].members = 4;
    const price = barterPrices(g)['tool:hand_saw'];
    expect(price).toBeGreaterThan(20);
    g.stock.canned = 50;
    const before = have(g, 'tool:hand_saw');
    const r1 = trade(g, [{ good: 'canned', qty: Math.ceil(price / barterPrices(g).canned) + 1 }], [{ good: 'tool:hand_saw', qty: 1 }], g.neighbors[0].id);
    expect(r1.problem).toBeUndefined();
    expect(r1.ok).toBe(true);
    expect(have(g, 'tool:hand_saw')).toBe(before + 1);
    const r2 = trade(g, [{ good: 'tool:hand_saw', qty: 2 }], [{ good: 'fresh', qty: 1 }], g.neighbors[0].id);
    expect(r2.problem).toBeUndefined();
    expect(r2.ok).toBe(true);
    expect(have(g, 'tool:hand_saw')).toBe(before - 1);
    expect(trade(g, [{ good: 'tool:chainsaw', qty: 99 }], [{ good: 'canned', qty: 1 }], g.neighbors[0].id).problem).toBe('short');
  });
  it('security: a workshop, a garage and a safe each keep thieves from the tools', () => {
    const g = newGame(2);
    expect(toolSecurity(g)).toBe(1);
    g.structures.push({ id: 'w', kind: 'workshop', x: 0, z: 0, rot: 0, stage: 9, done: 0, supplied: false, finishedAt: 5 });
    expect(toolSecurity(g)).toBe(0.5);
    g.stock.gun_safe = 1;
    expect(toolSecurity(g)).toBeCloseTo(0.375, 5);
  });
  it('thieves take tools, fewer from a locked workshop, and never crude ones or broken ones', () => {
    const run = (secure: boolean) => {
      let total = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const g = newGame(seed);
        if (secure) { g.structures.push({ id: 'w', kind: 'workshop', x: 0, z: 0, rot: 0, stage: 9, done: 0, supplied: false, finishedAt: 5 }); g.stock.gun_safe = 1; }
        const n = g.tools!.items.length;
        stealTools(g, 0.3, seed);
        total += n - g.tools!.items.length;
      }
      return total;
    };
    expect(run(false)).toBeGreaterThan(20);
    expect(run(true)).toBeLessThan(run(false) * 0.75);
    const g = newGame(1);
    g.tools = mk([['hammer', 0, 1], 'stone_axe']);
    expect(stealTools(g, 1, 0).lines).toEqual([]);
    expect(g.tools.items).toHaveLength(2);
  });
  it('a burglary can take tools from the shed (the claim covers them)', () => {
    let got = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const g = newGame(seed);
      const n = g.tools!.items.length;
      const lines = burgle(g, mulberry32(seed), 1);
      if (g.tools!.items.length < n) { got++; expect(lines.join(' ')).toMatch(/tools from the shed/); }
    }
    expect(got).toBeGreaterThan(5);
  });
});
